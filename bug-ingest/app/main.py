"""Bug Catcher — Bug ingest web service.

Lightweight FastAPI backend for receiving bug reports from Godot games.
Stores reports in SQLite, exposes API for the local processor to pull unprocessed reports.
"""

import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException, BackgroundTasks
from pydantic import BaseModel, Field

# ── App setup ────────────────────────────────────────────────────────────────

DB_PATH = Path(__file__).parent.parent / "data" / "bug_catcher.db"
UPLOAD_DIR = Path(__file__).parent.parent / "uploads"
SCHEMA_PATH = Path(__file__).parent.parent / "schema.sql"

app = FastAPI(title="Bug Catcher", version="0.1.0")


# ── Schemas ──────────────────────────────────────────────────────────────────

class ReportPayload(BaseModel):
    """Incoming bug report from Godot client."""
    id: str
    session_id: str
    game_name: str
    game_version: str
    build_hash: Optional[str] = None
    timestamp: str
    report_type: str  # 'crash' | 'error' | 'feedback'
    title: str
    description: Optional[str] = ""
    stack_trace: Optional[str] = ""
    scene: Optional[str] = None
    player_position_x: Optional[float] = None
    player_position_y: Optional[float] = None
    hardware_json: Optional[str] = None
    performance_json: Optional[str] = None
    screenshot_path: Optional[str] = None
    logs_attached: bool = False
    log_path: Optional[str] = None
    hardware_opt_in: bool = False
    created_at: str


class GroupUpdate(BaseModel):
    """Update group status."""
    status: str  # 'new' | 'reviewed' | 'resolved' | 'duplicate'


# ── Helpers ──────────────────────────────────────────────────────────────────

def get_db() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def init_db():
    """Initialize database schema."""
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    with open(SCHEMA_PATH) as f:
        schema = f.read()
    conn = sqlite3.connect(str(DB_PATH))
    conn.executescript(schema)
    conn.close()


# ── Endpoints ────────────────────────────────────────────────────────────────

@app.on_event("startup")
def startup():
    init_db()


@app.post("/api/v1/report")
async def receive_report(report: ReportPayload, background_tasks: BackgroundTasks):
    """Receive a bug report from a Godot game.
    
    The client sends the report as JSON. This endpoint stores it in SQLite
    and returns 201 if accepted.
    """
    conn = get_db()
    try:
        # Check for duplicate (same id)
        existing = conn.execute(
            "SELECT id FROM reports WHERE id = ?", (report.id,)
        ).fetchone()
        if existing:
            return {"status": "duplicate", "id": report.id}

        now = datetime.now(timezone.utc).isoformat()
        
        conn.execute(
            """INSERT INTO reports 
               (id, session_id, game_name, game_version, build_hash, timestamp,
                report_type, title, description, stack_trace, scene,
                player_position_x, player_position_y, hardware_json, performance_json,
                screenshot_path, logs_attached, log_path, hardware_opt_in,
                processed, group_id, autoproducer_task_id, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, NULL, ?, ?)""",
            (
                report.id, report.session_id, report.game_name, report.game_version,
                report.build_hash, report.timestamp, report.report_type, report.title,
                report.description, report.stack_trace, report.scene,
                report.player_position_x, report.player_position_y,
                report.hardware_json, report.performance_json,
                report.screenshot_path, int(report.logs_attached), report.log_path,
                int(report.hardware_opt_in), now, now
            )
        )
        conn.commit()
        
        # Save screenshot if provided (client uploads separately via multipart)
        if report.screenshot_path:
            background_tasks.add_task(_save_screenshot, report.id, report.screenshot_path)
        
        return {"status": "accepted", "id": report.id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        conn.close()


@app.post("/api/v1/upload")
async def upload_file(file: bytes = b"", filename: str = "", report_id: str = ""):
    """Upload an attachment (screenshot, log file) for a report."""
    if not file or not filename:
        raise HTTPException(status_code=400, detail="file and filename required")
    
    upload_path = UPLOAD_DIR / f"{report_id}_{filename}"
    upload_path.write_bytes(file)
    return {"status": "uploaded", "path": str(upload_path)}


@app.get("/api/v1/reports")
def list_reports(
    processed: Optional[int] = None,
    report_type: Optional[str] = None,
    limit: int = 50,
    offset: int = 0
):
    """List bug reports. Supports filtering by processed status and type."""
    conn = get_db()
    try:
        query = "SELECT * FROM reports"
        params = []
        
        if processed is not None:
            query += " WHERE processed = ?"
            params.append(processed)
        if report_type:
            query += f"{' WHERE' if not params else ' AND'} report_type = ?"
            params.append(report_type)
        
        query += " ORDER BY created_at DESC LIMIT ? OFFSET ?"
        params.extend([limit, offset])
        
        rows = conn.execute(query, params).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


@app.get("/api/v1/reports/{report_id}")
def get_report(report_id: str):
    """Get a single report by ID."""
    conn = get_db()
    try:
        row = conn.execute("SELECT * FROM reports WHERE id = ?", (report_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="Report not found")
        return dict(row)
    finally:
        conn.close()


@app.put("/api/v1/reports/{report_id}/group")
def update_group(report_id: str, group: GroupUpdate):
    """Update the group status for a report."""
    conn = get_db()
    try:
        # First find which group this report belongs to
        row = conn.execute("SELECT group_id FROM reports WHERE id = ?", (report_id,)).fetchone()
        if not row or not row["group_id"]:
            raise HTTPException(status_code=400, detail="Report has no group assigned")
        
        conn.execute(
            "UPDATE groups SET status = ?, last_seen = ? WHERE group_id = ?",
            (group.status, datetime.now(timezone.utc).isoformat(), row["group_id"])
        )
        conn.commit()
        return {"status": "updated"}
    finally:
        conn.close()


@app.get("/api/v1/processor/unprocessed")
def get_unprocessed():
    """Endpoint for the local processor to pull unprocessed reports.
    
    Returns reports that haven't been grouped yet, ordered by priority (crash > error > feedback).
    The processor should claim these by updating their group_id.
    """
    conn = get_db()
    try:
        rows = conn.execute(
            """SELECT * FROM reports 
               WHERE group_id IS NULL 
               ORDER BY 
                 CASE report_type 
                   WHEN 'crash' THEN 0 
                   WHEN 'error' THEN 1 
                   WHEN 'feedback' THEN 2 
                 END,
                 created_at DESC
               LIMIT 100"""
        ).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


@app.post("/api/v1/processor/group")
def claim_group(reports: dict):
    """Processor claims a set of reports and assigns them to a group.
    
    Expects: {"report_ids": ["id1", "id2", ...], "group_id": "abc123"}
    """
    if not reports or "report_ids" not in reports:
        raise HTTPException(status_code=400, detail="report_ids required")
    
    report_ids = reports["report_ids"]
    group_id = reports.get("group_id")
    
    if not group_id:
        # Auto-generate group ID
        import hashlib
        sample_id = report_ids[0] if report_ids else "unknown"
        group_id = hashlib.md5(sample_id.encode()).hexdigest()[:12]
    
    conn = get_db()
    try:
        placeholders = ",".join(["?"] * len(report_ids))
        now = datetime.now(timezone.utc).isoformat()
        
        # Update reports
        conn.execute(
            f"UPDATE reports SET group_id = ?, updated_at = ? WHERE id IN ({placeholders})",
            [group_id, now] + report_ids
        )
        
        # Create or update group record
        conn.execute(
            """INSERT INTO groups (group_id, representative_stack_trace, representative_title,
               report_count, first_seen, last_seen, status)
               VALUES (?, '', '', ?, ?, ?, 'new')
               ON CONFLICT(group_id) DO UPDATE SET
                 report_count = report_count + 1,
                 last_seen = ?""",
            (group_id, len(report_ids), now, now, now)
        )
        
        conn.commit()
        return {"status": "grouped", "group_id": group_id}
    finally:
        conn.close()


@app.get("/api/v1/groups")
def list_groups(status: Optional[str] = None):
    """List bug groups for triage."""
    conn = get_db()
    try:
        query = "SELECT * FROM groups"
        params = []
        if status:
            query += " WHERE status = ?"
            params.append(status)
        query += " ORDER BY last_seen DESC"
        
        rows = conn.execute(query, params).fetchall()
        return [dict(r) for r in rows]
    finally:
        conn.close()


@app.get("/api/v1/health")
def health():
    return {"status": "ok", "db": str(DB_PATH)}


# ── Helpers ──────────────────────────────────────────────────────────────────

def _save_screenshot(report_id: str, screenshot_path: str):
    """Save uploaded screenshot to server."""
    # This would be implemented with actual file upload handling
    pass
