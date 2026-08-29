"""Bug Catcher — Local Processor (bug_triage.py)

Pulls unprocessed reports from the web server, groups similar ones by stack
trace pattern matching, calculates priority scores, and creates/updates tasks
in the autoproducer system.

Usage:
    python3 bug_triage.py --once      # Run one cycle, then exit
    python3 bug_triage.py --poll       # Continuously poll every 5 minutes
    python3 bug_triage.py --poll --interval 120  # Custom interval (seconds)
"""

import argparse
import hashlib
import json
import logging
import sys
import time
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

# ── Configuration ────────────────────────────────────────────────────────────

INGEST_API = "http://localhost:8000/api/v1"
AUTO_PRODUCER_API = "http://localhost:8000/api"
POLL_INTERVAL = 300  # 5 minutes
SIMILARITY_THRESHOLD = 0.75
DEFAULT_PROJECT_ID = 1

# ── Logging ──────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("bug_triage")


# ── Data Models ──────────────────────────────────────────────────────────────

@dataclass
class BugReport:
    """A single bug report from the web server."""
    id: str
    session_id: str
    game_name: str
    game_version: str
    build_hash: Optional[str]
    timestamp: str
    report_type: str  # crash | error | feedback
    title: str
    description: str
    stack_trace: str
    scene: Optional[str]
    player_position_x: Optional[float]
    player_position_y: Optional[float]
    hardware_json: Optional[str]
    performance_json: Optional[str]
    screenshot_path: Optional[str]
    logs_attached: bool
    log_path: Optional[str]
    hardware_opt_in: bool
    created_at: str
    processed: int
    group_id: Optional[str]
    autoproducer_task_id: Optional[int]

    @classmethod
    def from_dict(cls, data: dict) -> "BugReport":
        return cls(
            id=data["id"],
            session_id=data["session_id"],
            game_name=data["game_name"],
            game_version=data["game_version"],
            build_hash=data.get("build_hash"),
            timestamp=data["timestamp"],
            report_type=data["report_type"],
            title=data["title"],
            description=data.get("description", ""),
            stack_trace=data.get("stack_trace", ""),
            scene=data.get("scene"),
            player_position_x=data.get("player_position_x"),
            player_position_y=data.get("player_position_y"),
            hardware_json=data.get("hardware_json"),
            performance_json=data.get("performance_json"),
            screenshot_path=data.get("screenshot_path"),
            logs_attached=bool(data.get("logs_attached", False)),
            log_path=data.get("log_path"),
            hardware_opt_in=bool(data.get("hardware_opt_in", False)),
            created_at=data["created_at"],
            processed=bool(data.get("processed", False)),
            group_id=data.get("group_id"),
            autoproducer_task_id=data.get("autoproducer_task_id"),
        )

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class BugGroup:
    """A group of similar bug reports."""
    group_id: str
    signature: str
    reports: list = field(default_factory=list)
    count: int = 0
    first_seen: Optional[datetime] = None
    last_seen: Optional[datetime] = None
    hardware_info: list = field(default_factory=list)
    sample_report: Optional[BugReport] = None
    priority_score: float = 0.0

    @property
    def affected_players(self) -> int:
        return len(set(r.session_id for r in self.reports))

    @property
    def unique_hardware_configs(self) -> set:
        configs = set()
        for h in self.hardware_info:
            if isinstance(h, dict):
                gpu = h.get("gpu", "unknown")
                os_name = h.get("os", "unknown")
                ram = h.get("ram_gb", "?")
                configs.add(f"{os_name} | {gpu} | {ram}GB RAM")
            elif isinstance(h, str):
                configs.add(h)
        return configs

    @property
    def scenes_affected(self) -> dict:
        counts = {}
        for r in self.reports:
            if r.scene:
                counts[r.scene] = counts.get(r.scene, 0) + 1
        return counts

    def to_dict(self) -> dict:
        """Serialize for JSON/API transport."""
        return {
            "group_id": self.group_id,
            "signature": self.signature,
            "count": self.count,
            "first_seen": self.first_seen.isoformat() if self.first_seen else None,
            "last_seen": self.last_seen.isoformat() if self.last_seen else None,
            "sample_report_id": self.sample_report.id if self.sample_report else None,
            "priority_score": self.priority_score,
        }


# ── Pattern Matching ─────────────────────────────────────────────────────────

def extract_trace_signature(stack_trace: str) -> str:
    """Extract function call chain from stack trace, ignoring line numbers.

    Parses lines like:
        at PlayerController.update() line 142
        at EnemyAI.pathfind() line 89
        FunctionName at file.py:123

    Returns a pipe-separated signature of function names.
    """
    if not stack_trace or not stack_trace.strip():
        return ""

    lines = stack_trace.split("\n")
    functions = []

    for line in lines:
        line = line.strip()
        if not line:
            continue

        # Pattern: "at FunctionName() line 123" or "at FunctionName at file.py:123"
        if "at " in line:
            parts = line.split("at ", 1)
            if len(parts) == 2:
                before_at = parts[0].strip()
                func_part = parts[1].strip()

                # Remove "line NNN" suffix from the part after "at"
                func_part = func_part.split(" line")[0].strip()

                # Remove parentheses and arguments
                func_name = func_part.split("(")[0].strip()

                # Check if the part BEFORE "at" looks like a function name
                # (has a dot, no angle brackets) — this handles "FuncName at file:line" format
                if before_at and "." in before_at and not before_at.startswith("<"):
                    functions.append(before_at)
                # Otherwise parse the part AFTER "at" — standard "at Func() line N" format
                elif (func_name and
                      func_name != "<module>" and
                      not func_name.startswith("<") and
                      "." in func_part):  # Ensure it has a class prefix
                    functions.append(func_name)

    return "|".join(functions)


def normalize_signature(signature: str) -> str:
    """Normalize a trace signature for grouping.

    Strips whitespace, removes empty entries, preserves order.
    """
    if not signature:
        return ""

    funcs = signature.split("|")
    normalized = [f.strip() for f in funcs if f.strip()]
    return "|".join(normalized)


def calculate_similarity(sig1: str, sig2: str) -> float:
    """Calculate similarity between two trace signatures using Jaccard index.

    Returns 0.0 to 1.0 where 1.0 means identical function sets.

    Example:
        sig1: "PlayerController.update|EnemyAI.pathfind|CollisionSystem.check_overlap"
        sig2: "PlayerController.update|EnemyAI.pathfind|InventorySystem.open"
        -> 0.67 (2/3 functions match)
    """
    if not sig1 or not sig2:
        # Both empty/whitespace → identical (edge case)
        if sig1 is not None and sig2 is not None and not sig1.strip() and not sig2.strip():
            return 1.0
        return 0.0

    funcs1 = set(normalize_signature(sig1).split("|"))
    funcs2 = set(normalize_signature(sig2).split("|"))

    if not funcs1 and not funcs2:
        return 1.0

    intersection = len(funcs1 & funcs2)
    union = len(funcs1 | funcs2)

    return intersection / union if union > 0 else 0.0


def group_reports(reports: list, threshold: float = SIMILARITY_THRESHOLD) -> list:
    """Group similar bug reports by stack trace pattern.

    For each report, finds the best-matching existing group based on
    Jaccard similarity of function call chains. If no group meets the
    threshold, creates a new group.

    Args:
        reports: List of BugReport objects to group.
        threshold: Minimum similarity (0.0-1.0) to merge into existing group.

    Returns:
        List of BugGroup objects, sorted by first_seen descending.
    """
    groups: list[BugGroup] = []

    for report in reports:
        signature = extract_trace_signature(report.stack_trace)
        normalized = normalize_signature(signature)

        # Find best matching existing group
        best_match = None
        best_similarity = 0.0

        for group in groups:
            similarity = calculate_similarity(normalized, group.signature)
            if similarity >= threshold and similarity > best_similarity:
                best_match = group
                best_similarity = similarity

        # Parse timestamp for first/last seen tracking
        ts = report.timestamp
        if isinstance(ts, str):
            try:
                ts = datetime.fromisoformat(ts.replace("Z", "+00:00"))
            except (ValueError, AttributeError):
                ts = datetime.now(timezone.utc)

        if best_match:
            # Merge into existing group
            best_match.reports.append(report)
            best_match.count += 1
            if ts > best_match.last_seen if best_match.last_seen else True:
                best_match.last_seen = ts
            if best_match.first_seen is None or ts < best_match.first_seen:
                best_match.first_seen = ts
            # Collect hardware info from merged reports too
            if report.hardware_opt_in and report.hardware_json:
                try:
                    hw = json.loads(report.hardware_json)
                    best_match.hardware_info.append(hw)
                except (json.JSONDecodeError, TypeError):
                    pass
            if not best_match.sample_report:
                best_match.sample_report = report
        else:
            # Create new group
            group_id = hashlib.md5(normalized.encode()).hexdigest()[:12]
            hardware_info = []
            if report.hardware_opt_in and report.hardware_json:
                try:
                    hw = json.loads(report.hardware_json)
                    hardware_info.append(hw)
                except (json.JSONDecodeError, TypeError):
                    pass
            groups.append(BugGroup(
                group_id=group_id,
                signature=normalized,
                reports=[report],
                count=1,
                first_seen=ts if isinstance(ts, datetime) else ts,
                last_seen=ts if isinstance(ts, datetime) else ts,
                hardware_info=hardware_info,
                sample_report=report,
            ))

    return groups


# ── Priority Scoring ─────────────────────────────────────────────────────────

def calculate_priority(group: BugGroup) -> float:
    """Calculate priority score for a bug group.

    Factors:
        - Frequency (10 per report, capped at 50)
        - Crash ratio (30 × crash_count / total)
        - Recentness (20 if <1 day, 14 if <7 days, 6 if <30 days)
        - Hardware diversity (5 per unique config, capped at 20)
        - Scene concentration (10 bonus if >3 reports in one scene)

    Returns:
        Priority score (higher = more urgent).
    """
    score = 0.0

    # Frequency (more reports = higher priority, capped)
    score += min(group.count * 10, 50)

    # Crash vs non-crash
    crash_count = sum(1 for r in group.reports if r.report_type == "crash")
    if crash_count > 0:
        score += 30 * (crash_count / group.count)

    # Recentness
    days_since_last = _days_since(group.last_seen)
    if days_since_last < 1:
        score += 20
    elif days_since_last < 7:
        score += 14
    elif days_since_last < 30:
        score += 6

    # Hardware diversity (affects more unique configs = higher priority)
    unique_hw = len(group.unique_hardware_configs)
    score += min(unique_hw * 5, 20)

    # Scene concentration (bugs in specific scenes are easier to fix)
    scene_counts = group.scenes_affected
    max_scene_count = max(scene_counts.values()) if scene_counts else 0
    if max_scene_count > 3:
        score += 10

    return score


def _days_since(timestamp) -> float:
    """Calculate days between now and a timestamp."""
    if isinstance(timestamp, str):
        try:
            ts = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
        except (ValueError, AttributeError):
            return 999  # Treat invalid dates as very old
    elif isinstance(timestamp, datetime):
        ts = timestamp
    else:
        return 999

    now = datetime.now(timezone.utc)
    delta = now - ts
    return delta.total_seconds() / 86400


# ── Autoproducer Integration ─────────────────────────────────────────────────

def _estimate_hours(group: BugGroup) -> float:
    """Estimate fix hours based on stack trace depth."""
    if not group.sample_report or not group.sample_report.stack_trace:
        return 0.5

    sig = extract_trace_signature(group.sample_report.stack_trace)
    depth = len(sig.split("|")) if sig else 0
    return max(0.5, min(depth * 0.5, 8.0))


def _build_notes(group: BugGroup) -> str:
    """Build detailed notes for an autoproducer task."""
    unique_hw = group.unique_hardware_configs
    scenes = group.scenes_affected

    lines = [
        f"Bug Group: {group.group_id}",
        f"First Seen: {group.first_seen}",
        f"Last Seen: {group.last_seen}",
        f"Affected Players: {group.affected_players}",
        f"Unique Hardware Configs: {len(unique_hw)}",
        "",
        "Hardware:",
    ]

    for hw in sorted(unique_hw):
        lines.append(f"  - {hw}")

    lines.append("")
    lines.append("Scenes Affected:")
    for scene, count in sorted(scenes.items(), key=lambda x: -x[1]):
        lines.append(f"  - {scene}: {count} reports")

    lines.append("")
    lines.append("Sample Stack Trace:")
    if group.sample_report and group.sample_report.stack_trace:
        lines.append(group.sample_report.stack_trace[:500])
    else:
        lines.append("(no stack trace)")

    lines.append("")
    lines.append("Sample Player Comment:")
    if group.sample_report and group.sample_report.description:
        lines.append(f'"{group.sample_report.description}"')
    else:
        lines.append("(none)")

    lines.append("")
    lines.append("All Reports:")
    for r in group.reports:
        lines.append(
            f"  [{r.timestamp}] {r.game_version} | {r.scene or 'N/A'} | {r.report_type}"
        )

    return "\n".join(lines)


def create_task_in_autoproducer(group: BugGroup) -> Optional[int]:
    """Create a task in autoproducer for this bug group.

    Returns the task ID if successful, None on failure.
    """
    try:
        import requests  # type: ignore

        title = f"[bug] Fix {group.sample_report.title} ({group.count} reports)" \
            if group.sample_report else f"[bug] Bug Group {group.group_id} ({group.count} reports)"

        response = requests.post(
            f"{AUTO_PRODUCER_API}/tasks",
            json={
                "title": title,
                "project_id": DEFAULT_PROJECT_ID,
                "category_id": _get_or_create_category(DEFAULT_PROJECT_ID, "Bug Reports"),
                "hours_estimate": _estimate_hours(group),
                "notes": _build_notes(group),
            },
            timeout=30,
        )

        if response.status_code == 201:
            return response.json().get("id")
        else:
            logger.warning("Autoproducer task creation failed: %s", response.text)
            return None
    except ImportError:
        logger.error("requests library not installed. Install with: pip install requests")
        return None
    except Exception as e:
        logger.error("Failed to create autoproducer task: %s", e)
        return None


def update_task_in_autoproducer(task_id: int, group: BugGroup) -> bool:
    """Update an existing autoproducer task with new report data.

    Appends new reports to notes rather than replacing them.
    """
    try:
        import requests  # type: ignore

        response = requests.get(
            f"{AUTO_PRODUCER_API}/tasks/{task_id}",
            timeout=30,
        )
        if response.status_code != 200:
            logger.warning("Failed to fetch task #%d: %s", task_id, response.text)
            return False

        task = response.json()
        old_notes = task.get("notes", "")

        new_reports_text = "\n\n--- NEW REPORTS ---\n"
        for r in group.reports:
            new_reports_text += f"[{r.timestamp}] {r.game_version} | {r.scene or 'N/A'}\n"

        updated_notes = old_notes + new_reports_text

        requests.patch(
            f"{AUTO_PRODUCER_API}/tasks/{task_id}",
            json={"notes": updated_notes},
            timeout=30,
        )
        return True
    except ImportError:
        logger.error("requests library not installed. Install with: pip install requests")
        return False
    except Exception as e:
        logger.error("Failed to update autoproducer task #%d: %s", task_id, e)
        return False


def _get_or_create_category(project_id: int, name: str) -> int:
    """Get or create a category in autoproducer. Returns category ID."""
    try:
        import requests  # type: ignore

        response = requests.get(
            f"{AUTO_PRODUCER_API}/categories",
            params={"project_id": project_id},
            timeout=30,
        )
        if response.status_code == 200:
            for cat in response.json():
                if cat.get("name") == name:
                    return cat["id"]

        # Create new category
        response = requests.post(
            f"{AUTO_PRODUCER_API}/categories",
            json={"name": name, "project_id": project_id},
            timeout=30,
        )
        if response.status_code == 201:
            return response.json().get("id")
    except (ImportError, Exception) as e:
        logger.warning("Could not manage autoproducer categories: %s", e)

    # Fallback: use a default category ID
    return 5


# ── Web Server Client ────────────────────────────────────────────────────────

def pull_pending_reports() -> list:
    """Pull unprocessed reports from the web server.

    Returns:
        List of BugReport objects, or empty list on failure.
    """
    try:
        import requests  # type: ignore

        response = requests.get(
            f"{INGEST_API}/processor/unprocessed",
            timeout=30,
        )
        if response.status_code != 200:
            logger.error("Failed to pull reports: HTTP %d", response.status_code)
            return []

        data = response.json()
        if not isinstance(data, list):
            logger.error("Unexpected response format from unprocessed endpoint")
            return []

        return [BugReport.from_dict(r) for r in data]
    except ImportError:
        logger.error("requests library not installed. Install with: pip install requests")
        return []
    except Exception as e:
        logger.error("Error pulling reports: %s", e)
        return []


def mark_reports_processed(report_ids: list) -> bool:
    """Mark reports as processed on the web server."""
    try:
        import requests  # type: ignore

        for report_id in report_ids:
            response = requests.put(
                f"{INGEST_API}/reports/{report_id}/processed",
                json={"processed": True},
                timeout=30,
            )
            if response.status_code != 200:
                logger.warning("Failed to mark %s as processed: HTTP %d", report_id, response.status_code)
        return True
    except ImportError:
        logger.error("requests library not installed. Install with: pip install requests")
        return False
    except Exception as e:
        logger.error("Error marking reports as processed: %s", e)
        return False


# ── Main Loop ────────────────────────────────────────────────────────────────

def run_once() -> int:
    """Run one triage cycle. Returns number of reports processed."""
    logger.info("Pulling pending reports...")
    reports = pull_pending_reports()

    if not reports:
        logger.info("No pending reports.")
        return 0

    logger.info("Found %d pending reports.", len(reports))

    # Group similar reports
    groups = group_reports(reports)
    logger.info("Grouped into %d bug groups.", len(groups))

    # Calculate priority for each group
    for group in groups:
        group.priority_score = calculate_priority(group)

    # Sort by priority (highest first)
    groups.sort(key=lambda g: g.priority_score, reverse=True)

    # Process each group
    processed_ids = []
    for i, group in enumerate(groups):
        logger.info(
            "[%d/%d] Group %s: %d reports, priority=%.0f",
            i + 1, len(groups), group.group_id, group.count, group.priority_score,
        )

        # Check if we already have a task for this group
        existing_task = None
        for report in group.reports:
            if report.autoproducer_task_id:
                existing_task = report.autoproducer_task_id
                break

        if existing_task:
            logger.info("  Updating existing task #%d", existing_task)
            update_task_in_autoproducer(existing_task, group)
        else:
            logger.info("  Creating new task...")
            task_id = create_task_in_autoproducer(group)
            if task_id:
                logger.info("  Created task #%d", task_id)
                for report in group.reports:
                    report.autoproducer_task_id = task_id
            else:
                logger.warning("  Failed to create task — reports will be retried next cycle")

        processed_ids.extend(r.id for r in group.reports)

    # Mark as processed on server
    if processed_ids:
        mark_reports_processed(processed_ids)
        logger.info("Processed %d reports across %d groups.", len(processed_ids), len(groups))

    return len(processed_ids)


def run_poll(interval: int = POLL_INTERVAL):
    """Continuously poll for new reports."""
    logger.info("Starting poll loop (interval=%ds). Press Ctrl+C to stop.", interval)
    try:
        while True:
            run_once()
            logger.info("Sleeping %ds until next poll...", interval)
            time.sleep(interval)
    except KeyboardInterrupt:
        logger.info("Poll loop stopped by user.")


# ── CLI Entry Point ──────────────────────────────────────────────────────────

def main():
    global INGEST_API, POLL_INTERVAL, SIMILARITY_THRESHOLD

    parser = argparse.ArgumentParser(
        description="Bug Catcher — Local Processor for grouping and triaging bug reports."
    )
    parser.add_argument(
        "--once", action="store_true", default=True,
        help="Run one cycle and exit (default)",
    )
    parser.add_argument(
        "--poll", action="store_true",
        help="Continuously poll for new reports",
    )
    parser.add_argument(
        "--interval", type=int, default=POLL_INTERVAL,
        help=f"Poll interval in seconds (default: {POLL_INTERVAL})",
    )
    parser.add_argument(
        "--threshold", type=float, default=SIMILARITY_THRESHOLD,
        help=f"Stack trace similarity threshold (default: {SIMILARITY_THRESHOLD})",
    )
    parser.add_argument(
        "--api", type=str, default=INGEST_API,
        help=f"Web server API URL (default: {INGEST_API})",
    )

    args = parser.parse_args()

    INGEST_API = args.api
    POLL_INTERVAL = args.interval
    SIMILARITY_THRESHOLD = args.threshold

    if args.poll:
        run_poll(args.interval)
    else:
        count = run_once()
        sys.exit(0 if count > 0 else 1)


if __name__ == "__main__":
    main()
