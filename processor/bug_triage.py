"""Bug Catcher — Local Processor.

Pulls new reports from the Dreamhost intake service, groups similar ones
(crash reports by normalized stack-trace signature; everything else gets
its own group for now — see report_signature()), scores priority, persists
the result locally in SQLite, and pushes each touched group into
Auto-Producer as a task (creating it the first time, updating it on every
later occurrence). Auto-Producer is the only triage surface — there is no
separate bug-catcher admin UI, and no status ever flows back from there.

The push always wins: every cycle unconditionally overwrites a synced
task's title/notes/priority in Auto-Producer, including over a human's
manual drag-reorder there. Deliberate — the user's call, see vault:
godot-bug-catcher-autoproducer-integration.

Usage:
    python3 bug_triage.py --once
    python3 bug_triage.py --poll [--interval 300]

Config (environment variables):
    BUGCATCHER_API_URL       default: https://bugs.anchoritegames.com/api/reports.php
    BUGCATCHER_BEARER_TOKEN  required — the same token issued in config.php on Dreamhost
    BUGCATCHER_DB_PATH       default: data/bug_processor.db
    AUTOPRODUCER_URL         default: http://127.0.0.1:8420 (same host, no Tailscale hop needed)
    AUTOPRODUCER_PROJECT_ID  the Auto-Producer project bug-catcher tasks are created under —
                             must already exist (created once, by hand, in Auto-Producer).
                             Left unset: pull/group/score still runs, nothing gets pushed.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import logging
import os
import re
import sqlite3
import sys
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

import requests

DEFAULT_API_URL = "https://bugs.anchoritegames.com/api/reports.php"
DEFAULT_DB_PATH = "data/bug_processor.db"
DEFAULT_POLL_INTERVAL = 300  # 5 minutes
DEFAULT_AUTOPRODUCER_URL = "http://127.0.0.1:8420"

# tunable starting point, not a locked design — revisit once real report
# volume exists to tune against (see vault: godot-bug-catcher-local-processor)
RECENCY_HALF_LIFE_DAYS = 14.0
PRIORITY_WEIGHT_FREQUENCY = 1.0
PRIORITY_WEIGHT_RECENCY = 5.0
PRIORITY_WEIGHT_DIVERSITY = 2.0

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("bug_triage")


@dataclass
class Report:
    id: str
    created_at: str
    category: str
    description: str
    repro_steps: Optional[str]
    contact: Optional[str]
    device_info: Optional[dict]
    app_version: Optional[str]
    scene_context: Optional[str]
    log_tail: Optional[str]
    stack_trace: Optional[str]
    screenshot_base64: Optional[str]

    @classmethod
    def from_dict(cls, data: dict) -> "Report":
        return cls(
            id=data["id"],
            created_at=data["created_at"],
            category=data["category"],
            description=data["description"],
            repro_steps=data.get("repro_steps"),
            contact=data.get("contact"),
            device_info=data.get("device_info"),
            app_version=data.get("app_version"),
            scene_context=data.get("scene_context"),
            log_tail=data.get("log_tail"),
            stack_trace=data.get("stack_trace"),
            screenshot_base64=data.get("screenshot_base64"),
        )


# ── Stack trace normalization / signature ──────────────────────────────────

_LINE_NUMBER_RE = re.compile(r"@ line:\d+")


def normalize_stack_trace(stack_trace: str) -> str:
    """Strip line numbers (they shift between builds/refactors) but keep the
    function/file call sequence, which is what actually identifies "the same"
    crash across different players and slightly different code versions."""
    lines = [_LINE_NUMBER_RE.sub("", line).strip() for line in stack_trace.strip().splitlines()]
    return "\n".join(line for line in lines if line)


def stack_trace_signature(stack_trace: str) -> str:
    normalized = normalize_stack_trace(stack_trace)
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()[:16]


def report_signature(report: Report) -> str:
    """Crash reports with a stack trace group by that trace's signature —
    identical crashes across different players collapse into one group.
    Everything else (no stack trace, or a non-crash category) has nothing
    reliable to group on yet, so each gets its own signature and stays a
    group of one until fuzzy grouping is worth building."""
    if report.category == "_crash" and report.stack_trace:
        return "crash:" + stack_trace_signature(report.stack_trace)
    return "single:" + hashlib.sha256(report.id.encode("utf-8")).hexdigest()[:16]


# ── Priority scoring ─────────────────────────────────────────────────────────

def recency_factor(last_seen: datetime, now: datetime) -> float:
    """Exponential decay — a group not seen in a while contributes less to
    its own priority, without a hard cliff at any particular age."""
    age_days = max(0.0, (now - last_seen).total_seconds() / 86400.0)
    return 0.5 ** (age_days / RECENCY_HALF_LIFE_DAYS)


def calculate_priority(
    report_count: int,
    last_seen: datetime,
    distinct_device_versions: int,
    now: Optional[datetime] = None,
) -> float:
    now = now or datetime.now(timezone.utc)
    recency = recency_factor(last_seen, now)
    return (
        PRIORITY_WEIGHT_FREQUENCY * report_count
        + PRIORITY_WEIGHT_RECENCY * recency
        + PRIORITY_WEIGHT_DIVERSITY * distinct_device_versions
    )


# ── Local state (SQLite) ──────────────────────────────────────────────────────

SCHEMA = """
CREATE TABLE IF NOT EXISTS processor_state (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS groups (
    signature TEXT PRIMARY KEY,
    category TEXT NOT NULL,
    representative_title TEXT NOT NULL,
    representative_stack_trace TEXT,
    report_count INTEGER NOT NULL DEFAULT 0,
    first_seen TEXT NOT NULL,
    last_seen TEXT NOT NULL,
    priority_score REAL NOT NULL DEFAULT 0.0,
    device_versions TEXT NOT NULL DEFAULT '[]',
    autoproducer_task_id INTEGER
);

CREATE TABLE IF NOT EXISTS processed_reports (
    report_id TEXT PRIMARY KEY,
    signature TEXT NOT NULL,
    processed_at TEXT NOT NULL
);

-- Full report detail, kept locally rather than discarded after grouping —
-- viewer.py (a separate small FastAPI service, Tailscale-only, no auth of
-- its own) reads this to render a report's/group's full detail: repro
-- steps, contact, device info, the complete log tail, and the screenshot —
-- everything that's too much to cram into an Auto-Producer task's notes.
CREATE TABLE IF NOT EXISTS reports (
    id TEXT PRIMARY KEY,
    signature TEXT NOT NULL,
    created_at TEXT NOT NULL,
    category TEXT NOT NULL,
    description TEXT NOT NULL,
    repro_steps TEXT,
    contact TEXT,
    device_info TEXT,
    app_version TEXT,
    scene_context TEXT,
    log_tail TEXT,
    stack_trace TEXT,
    screenshot_base64 TEXT
);
CREATE INDEX IF NOT EXISTS idx_reports_signature ON reports(signature);
"""


def open_db(db_path: str) -> sqlite3.Connection:
    if db_path != ":memory:":
        Path(db_path).parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    # WAL mode: viewer.py reads this same file from a separate process while
    # the poller writes to it every cycle — WAL lets that happen without
    # "database is locked" errors from the default rollback-journal mode.
    conn.execute("PRAGMA journal_mode=WAL")
    conn.executescript(SCHEMA)
    _migrate_schema(conn)
    return conn


def _migrate_schema(conn: sqlite3.Connection) -> None:
    # CREATE TABLE IF NOT EXISTS above only helps a brand-new DB — an
    # already-running deployment's groups table predates autoproducer_task_id
    # and needs it added by hand, same idiom Auto-Producer's own migrations use.
    cols = {r["name"] for r in conn.execute("PRAGMA table_info(groups)")}
    if "autoproducer_task_id" not in cols:
        conn.execute("ALTER TABLE groups ADD COLUMN autoproducer_task_id INTEGER")
        conn.commit()


def get_state(conn: sqlite3.Connection, key: str, default: Optional[str] = None) -> Optional[str]:
    row = conn.execute("SELECT value FROM processor_state WHERE key = ?", (key,)).fetchone()
    return row["value"] if row else default


def set_state(conn: sqlite3.Connection, key: str, value: str) -> None:
    conn.execute(
        "INSERT INTO processor_state (key, value) VALUES (?, ?) "
        "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        (key, value),
    )
    conn.commit()


def store_report(conn: sqlite3.Connection, report: "Report", signature: str) -> None:
    conn.execute(
        """INSERT OR REPLACE INTO reports
            (id, signature, created_at, category, description, repro_steps, contact,
             device_info, app_version, scene_context, log_tail, stack_trace, screenshot_base64)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            report.id, signature, report.created_at, report.category, report.description,
            report.repro_steps, report.contact,
            json.dumps(report.device_info) if report.device_info is not None else None,
            report.app_version, report.scene_context, report.log_tail, report.stack_trace,
            report.screenshot_base64,
        ),
    )


def is_processed(conn: sqlite3.Connection, report_id: str) -> bool:
    return conn.execute(
        "SELECT 1 FROM processed_reports WHERE report_id = ?", (report_id,)
    ).fetchone() is not None


def mark_processed(conn: sqlite3.Connection, report_id: str, signature: str) -> None:
    conn.execute(
        "INSERT OR IGNORE INTO processed_reports (report_id, signature, processed_at) VALUES (?, ?, ?)",
        (report_id, signature, datetime.now(timezone.utc).isoformat()),
    )


def _device_version_key(report: Report) -> Optional[str]:
    model = (report.device_info or {}).get("model") if report.device_info else None
    if not model and not report.app_version:
        return None
    return f"{model or 'unknown'}|{report.app_version or 'unknown'}"


def _parse_report_timestamp(value: str) -> datetime:
    # the API sends MySQL's "YYYY-MM-DD HH:MM:SS"; local state round-trips
    # through isoformat() — accept both so re-reading either is safe
    try:
        return datetime.strptime(value, "%Y-%m-%d %H:%M:%S").replace(tzinfo=timezone.utc)
    except ValueError:
        return datetime.fromisoformat(value)


def upsert_group(conn: sqlite3.Connection, report: Report, signature: str, now: Optional[datetime] = None) -> None:
    now = now or datetime.now(timezone.utc)
    existing = conn.execute("SELECT * FROM groups WHERE signature = ?", (signature,)).fetchone()
    device_version = _device_version_key(report)
    report_seen_at = _parse_report_timestamp(report.created_at)

    if existing is None:
        device_versions = [device_version] if device_version else []
        conn.execute(
            """INSERT INTO groups
                (signature, category, representative_title, representative_stack_trace,
                 report_count, first_seen, last_seen, priority_score, device_versions)
               VALUES (?, ?, ?, ?, 1, ?, ?, 0.0, ?)""",
            (
                signature, report.category, report.description, report.stack_trace,
                report.created_at, report.created_at, json.dumps(device_versions),
            ),
        )
        report_count = 1
        last_seen = report_seen_at
        device_versions_list = device_versions
    else:
        device_versions_list = json.loads(existing["device_versions"])
        if device_version and device_version not in device_versions_list:
            device_versions_list.append(device_version)

        report_count = existing["report_count"] + 1
        last_seen = max(_parse_report_timestamp(existing["last_seen"]), report_seen_at)

        conn.execute(
            "UPDATE groups SET report_count = ?, last_seen = ?, device_versions = ? WHERE signature = ?",
            (report_count, report.created_at if report_seen_at == last_seen else existing["last_seen"],
             json.dumps(device_versions_list), signature),
        )

    priority = calculate_priority(report_count, last_seen, len(device_versions_list), now=now)
    conn.execute("UPDATE groups SET priority_score = ? WHERE signature = ?", (priority, signature))
    # no commit here — the caller commits once both this and mark_processed()
    # have run, so a kill between the two (e.g. systemd stop mid-cycle) can't
    # leave a report counted in a group but not recorded as processed, which
    # would double-count it on the next run


# ── Pulling from the Dreamhost API ───────────────────────────────────────────

def fetch_new_reports(api_url: str, bearer_token: str, since: Optional[str]) -> list[Report]:
    params = {"since": since} if since else {}
    response = requests.get(
        api_url,
        headers={"Authorization": f"Bearer {bearer_token}"},
        params=params,
        timeout=30,
    )
    response.raise_for_status()
    data = response.json()
    return [Report.from_dict(r) for r in data.get("reports", [])]


# ── Pushing to Auto-Producer ─────────────────────────────────────────────────

def _autoproducer_task_title(group: sqlite3.Row) -> str:
    if group["report_count"] <= 1:
        return group["representative_title"]
    return f"{group['representative_title']} (×{group['report_count']} reports)"


def _autoproducer_task_notes(group: sqlite3.Row, viewer_url: Optional[str]) -> str:
    device_versions = json.loads(group["device_versions"])
    lines = [
        f"bug-catcher group: {group['signature']}",
        f"reports: {group['report_count']}",
        f"devices/versions: {', '.join(device_versions) if device_versions else 'unknown'}",
    ]
    if group["representative_stack_trace"]:
        lines += ["", "stack trace:", group["representative_stack_trace"]]
    if viewer_url:
        lines += ["", f"full details (repro steps, contact, log, screenshot): {viewer_url}/groups/{group['signature']}"]
    return "\n".join(lines)


def sync_group_to_autoproducer(
    conn: sqlite3.Connection, autoproducer_url: str, project_id: int, signature: str, viewer_url: Optional[str] = None
) -> None:
    """Always overwrites — see the module docstring for why the push wins
    unconditionally over anything currently in Auto-Producer, drag included.
    """
    group = conn.execute("SELECT * FROM groups WHERE signature = ?", (signature,)).fetchone()
    if group is None:
        return

    payload = {
        "title": _autoproducer_task_title(group),
        "notes": _autoproducer_task_notes(group, viewer_url),
        "priority": group["priority_score"],
    }

    if group["autoproducer_task_id"] is None:
        response = requests.post(
            f"{autoproducer_url}/api/tasks", json={**payload, "project_id": project_id}, timeout=15
        )
        response.raise_for_status()
        task_id = response.json()["id"]
        conn.execute("UPDATE groups SET autoproducer_task_id = ? WHERE signature = ?", (task_id, signature))
        conn.commit()
        logger.info("created Auto-Producer task %d for group %s", task_id, signature)
    else:
        task_id = group["autoproducer_task_id"]
        response = requests.patch(f"{autoproducer_url}/api/tasks/{task_id}", json=payload, timeout=15)
        response.raise_for_status()
        logger.info("updated Auto-Producer task %d for group %s", task_id, signature)


# ── Main cycle ────────────────────────────────────────────────────────────────

def run_once(
    conn: sqlite3.Connection,
    api_url: str,
    bearer_token: str,
    autoproducer_url: Optional[str] = None,
    autoproducer_project_id: Optional[int] = None,
    viewer_url: Optional[str] = None,
) -> int:
    since = get_state(conn, "last_pull_at")
    reports = fetch_new_reports(api_url, bearer_token, since)

    new_count = 0
    latest_created_at = since
    touched_signatures: set[str] = set()
    for report in reports:
        if is_processed(conn, report.id):
            continue
        signature = report_signature(report)
        upsert_group(conn, report, signature)
        store_report(conn, report, signature)
        mark_processed(conn, report.id, signature)
        conn.commit()
        touched_signatures.add(signature)
        new_count += 1
        if latest_created_at is None or report.created_at > latest_created_at:
            latest_created_at = report.created_at

    if latest_created_at:
        set_state(conn, "last_pull_at", latest_created_at)

    if autoproducer_project_id is not None:
        # touched_signatures alone would leave a group stuck forever if it
        # was first seen before AUTOPRODUCER_PROJECT_ID was configured, or a
        # prior sync attempt failed (Auto-Producer down, wrong URL, etc.) —
        # nothing else ever "touches" it again unless the same bug recurs.
        # Retrying every never-yet-created group every cycle makes that
        # self-healing instead of a permanent gap.
        never_synced = {
            r["signature"] for r in conn.execute("SELECT signature FROM groups WHERE autoproducer_task_id IS NULL")
        }
        for signature in touched_signatures | never_synced:
            try:
                sync_group_to_autoproducer(conn, autoproducer_url, autoproducer_project_id, signature, viewer_url)
            except requests.RequestException as exc:
                logger.error("Auto-Producer sync failed for group %s: %s", signature, exc)

    logger.info("pulled %d report(s), %d new", len(reports), new_count)
    print_summary(conn)
    return new_count


def print_summary(conn: sqlite3.Connection) -> None:
    rows = conn.execute("SELECT * FROM groups ORDER BY priority_score DESC LIMIT 20").fetchall()
    if not rows:
        logger.info("no groups yet")
        return
    logger.info("current groups, by priority:")
    for row in rows:
        logger.info(
            "  [%.2f] (%s x%d) %s",
            row["priority_score"], row["category"], row["report_count"], row["representative_title"][:80],
        )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--once", action="store_true", help="Run one cycle, then exit")
    parser.add_argument("--poll", action="store_true", help="Continuously poll")
    parser.add_argument("--interval", type=int, default=DEFAULT_POLL_INTERVAL, help="Poll interval in seconds")
    args = parser.parse_args()

    api_url = os.environ.get("BUGCATCHER_API_URL", DEFAULT_API_URL)
    bearer_token = os.environ.get("BUGCATCHER_BEARER_TOKEN")
    db_path = os.environ.get("BUGCATCHER_DB_PATH", DEFAULT_DB_PATH)
    autoproducer_url = os.environ.get("AUTOPRODUCER_URL", DEFAULT_AUTOPRODUCER_URL)
    autoproducer_project_id_raw = os.environ.get("AUTOPRODUCER_PROJECT_ID")
    autoproducer_project_id = int(autoproducer_project_id_raw) if autoproducer_project_id_raw else None
    viewer_url = os.environ.get("BUGCATCHER_VIEWER_URL")  # e.g. http://<tailscale-host>:8422 — see viewer.py

    if not bearer_token:
        logger.error("BUGCATCHER_BEARER_TOKEN is not set — refusing to start")
        sys.exit(1)
    if autoproducer_project_id is None:
        logger.info("AUTOPRODUCER_PROJECT_ID not set — grouping/scoring only, nothing will be pushed")
    if viewer_url is None:
        logger.info("BUGCATCHER_VIEWER_URL not set — Auto-Producer notes won't include a details link")

    conn = open_db(db_path)

    if args.poll:
        logger.info("polling every %ds", args.interval)
        while True:
            try:
                run_once(conn, api_url, bearer_token, autoproducer_url, autoproducer_project_id, viewer_url)
            except requests.RequestException as exc:
                logger.error("pull failed: %s", exc)
            time.sleep(args.interval)
    else:
        run_once(conn, api_url, bearer_token, autoproducer_url, autoproducer_project_id, viewer_url)


if __name__ == "__main__":
    main()
