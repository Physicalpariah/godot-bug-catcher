"""Bug Catcher — Detail Viewer.

Small read-only web app for the full report/group detail that doesn't fit
in an Auto-Producer task's notes: repro steps, contact, the complete log
tail, and the screenshot. Auto-Producer's own UI is still the only place
triage/status happens — this has zero write capability, it's purely "see
the raw data" for whatever a task's notes link points at.

Tailscale-only, no auth of its own — same trust model Auto-Producer and
landing-page already use on this same home server.

Usage:
    uvicorn viewer:app --host <tailscale-ip> --port 8422

Config (environment variables):
    BUGCATCHER_DB_PATH  default: data/bug_processor.db — same file bug_triage.py writes to
"""

from __future__ import annotations

import html
import json
import os

from fastapi import FastAPI, HTTPException
from fastapi.responses import HTMLResponse

from bug_triage import DEFAULT_DB_PATH, open_db

app = FastAPI()


def _db():
    db_path = os.environ.get("BUGCATCHER_DB_PATH", DEFAULT_DB_PATH)
    return open_db(db_path)


def _page(title: str, body: str) -> str:
    return f"""<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>{html.escape(title)}</title>
<style>
  body {{ font-family: -apple-system, sans-serif; max-width: 800px; margin: 2rem auto; padding: 0 1rem; line-height: 1.5; color: #222; }}
  dt {{ font-weight: 600; margin-top: 1rem; }}
  dd {{ margin: 0; white-space: pre-wrap; word-break: break-word; }}
  img {{ max-width: 100%; border: 1px solid #ccc; margin-top: 0.5rem; }}
  a {{ color: #2563eb; }}
  table {{ border-collapse: collapse; width: 100%; }}
  th, td {{ text-align: left; padding: 0.4rem 0.6rem; border-bottom: 1px solid #eee; }}
</style>
</head>
<body>
{body}
</body>
</html>"""


@app.get("/", response_class=HTMLResponse)
def index():
    conn = _db()
    rows = conn.execute("SELECT * FROM groups ORDER BY priority_score DESC").fetchall()
    conn.close()

    if not rows:
        return _page("Bug Catcher", "<h1>Bug Catcher</h1><p>No groups yet.</p>")

    body_rows = "".join(
        f'<tr><td>{r["priority_score"]:.2f}</td><td>{html.escape(r["category"])}</td>'
        f'<td>{r["report_count"]}</td>'
        f'<td><a href="/groups/{html.escape(r["signature"])}">{html.escape(r["representative_title"])}</a></td></tr>'
        for r in rows
    )
    body = f"""<h1>Bug Catcher</h1>
<table>
<tr><th>Priority</th><th>Category</th><th>Reports</th><th>Title</th></tr>
{body_rows}
</table>"""
    return _page("Bug Catcher", body)


@app.get("/groups/{signature}", response_class=HTMLResponse)
def group_detail(signature: str):
    conn = _db()
    group = conn.execute("SELECT * FROM groups WHERE signature = ?", (signature,)).fetchone()
    if group is None:
        conn.close()
        raise HTTPException(404, "group not found")
    reports = conn.execute(
        "SELECT * FROM reports WHERE signature = ? ORDER BY created_at ASC", (signature,)
    ).fetchall()
    conn.close()

    device_versions = json.loads(group["device_versions"])
    report_links = "".join(
        f'<li><a href="/reports/{html.escape(r["id"])}">{html.escape(r["created_at"])} — {html.escape(r["id"])}</a></li>'
        for r in reports
    )
    stack = (
        f"<dt>Stack trace</dt><dd>{html.escape(group['representative_stack_trace'])}</dd>"
        if group["representative_stack_trace"] else ""
    )

    body = f"""<p><a href="/">&larr; all groups</a></p>
<h1>{html.escape(group['representative_title'])}</h1>
<dl>
  <dt>Category</dt><dd>{html.escape(group['category'])}</dd>
  <dt>Priority</dt><dd>{group['priority_score']:.2f}</dd>
  <dt>Reports</dt><dd>{group['report_count']}</dd>
  <dt>First seen</dt><dd>{html.escape(group['first_seen'])}</dd>
  <dt>Last seen</dt><dd>{html.escape(group['last_seen'])}</dd>
  <dt>Devices/versions</dt><dd>{html.escape(', '.join(device_versions) if device_versions else 'unknown')}</dd>
  {stack}
</dl>
<h2>Individual reports</h2>
<ul>{report_links}</ul>"""
    return _page(group["representative_title"], body)


@app.get("/reports/{report_id}", response_class=HTMLResponse)
def report_detail(report_id: str):
    conn = _db()
    report = conn.execute("SELECT * FROM reports WHERE id = ?", (report_id,)).fetchone()
    conn.close()
    if report is None:
        raise HTTPException(404, "report not found")

    device_info = json.loads(report["device_info"]) if report["device_info"] else None

    def field(label: str, value) -> str:
        if not value:
            return ""
        return f"<dt>{html.escape(label)}</dt><dd>{html.escape(str(value))}</dd>"

    screenshot_html = (
        f'<h2>Screenshot</h2><img src="data:image/png;base64,{report["screenshot_base64"]}" alt="screenshot">'
        if report["screenshot_base64"] else ""
    )

    body = f"""<p><a href="/groups/{html.escape(report['signature'])}">&larr; group</a></p>
<h1>Report {html.escape(report['id'])}</h1>
<dl>
  {field("Created", report["created_at"])}
  {field("Category", report["category"])}
  {field("Description", report["description"])}
  {field("Repro steps", report["repro_steps"])}
  {field("Contact", report["contact"])}
  {field("Device", json.dumps(device_info) if device_info else None)}
  {field("App version", report["app_version"])}
  {field("Scene", report["scene_context"])}
  {field("Stack trace", report["stack_trace"])}
  {field("Log tail", report["log_tail"])}
</dl>
{screenshot_html}"""
    return _page(f"Report {report['id']}", body)
