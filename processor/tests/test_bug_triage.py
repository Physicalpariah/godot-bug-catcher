import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import bug_triage as bt


def make_report(**overrides) -> bt.Report:
    defaults = dict(
        id="report-1",
        created_at="2026-09-17 10:00:00",
        category="_crash",
        description="Truck exploded on load",
        repro_steps=None,
        contact=None,
        device_info={"model": "iPhone14,2", "os": "iOS", "os_version": "17.0"},
        app_version="0.1.0",
        scene_context="res://scenes/game.tscn",
        log_tail="error: something broke",
        stack_trace="stack:open in Inventory.gd@ line:89\nstack:interact in PlayerController.gd@ line:142",
        screenshot_base64=None,
    )
    defaults.update(overrides)
    return bt.Report(**defaults)


# ── normalize_stack_trace / signature ───────────────────────────────────────

def test_normalize_strips_line_numbers_keeps_call_sequence():
    trace = "stack:open in Inventory.gd@ line:89\nstack:interact in PlayerController.gd@ line:142"
    normalized = bt.normalize_stack_trace(trace)
    assert "line:" not in normalized
    assert "open in Inventory.gd" in normalized
    assert "interact in PlayerController.gd" in normalized


def test_same_call_sequence_different_line_numbers_same_signature():
    trace_a = "stack:open in Inventory.gd@ line:89\nstack:interact in PlayerController.gd@ line:142"
    trace_b = "stack:open in Inventory.gd@ line:91\nstack:interact in PlayerController.gd@ line:150"
    assert bt.stack_trace_signature(trace_a) == bt.stack_trace_signature(trace_b)


def test_different_call_sequence_different_signature():
    trace_a = "stack:open in Inventory.gd@ line:89"
    trace_b = "stack:close in Inventory.gd@ line:89"
    assert bt.stack_trace_signature(trace_a) != bt.stack_trace_signature(trace_b)


# ── report_signature ─────────────────────────────────────────────────────────

def test_crash_with_stack_trace_groups_by_stack_signature():
    r1 = make_report(id="a", stack_trace="stack:open in Inventory.gd@ line:89")
    r2 = make_report(id="b", stack_trace="stack:open in Inventory.gd@ line:99")  # different line, same call
    assert bt.report_signature(r1) == bt.report_signature(r2)


def test_crash_without_stack_trace_gets_its_own_signature():
    r1 = make_report(id="a", stack_trace=None)
    r2 = make_report(id="b", stack_trace=None)
    assert bt.report_signature(r1) != bt.report_signature(r2)


def test_non_crash_category_always_gets_its_own_signature_even_with_identical_content():
    r1 = make_report(id="a", category="_gameplay", stack_trace=None)
    r2 = make_report(id="b", category="_gameplay", stack_trace=None)
    assert bt.report_signature(r1) != bt.report_signature(r2)


# ── calculate_priority — monotonicity, not exact values (weights are tunable) ─

def test_priority_increases_with_report_count():
    now = datetime(2026, 9, 17, tzinfo=timezone.utc)
    low = bt.calculate_priority(1, now, 1, now=now)
    high = bt.calculate_priority(10, now, 1, now=now)
    assert high > low


def test_priority_decreases_with_age():
    now = datetime(2026, 9, 17, tzinfo=timezone.utc)
    recent = bt.calculate_priority(5, now, 1, now=now)
    stale = bt.calculate_priority(5, now - timedelta(days=60), 1, now=now)
    assert recent > stale


def test_priority_increases_with_device_diversity():
    now = datetime(2026, 9, 17, tzinfo=timezone.utc)
    narrow = bt.calculate_priority(5, now, 1, now=now)
    wide = bt.calculate_priority(5, now, 8, now=now)
    assert wide > narrow


# ── SQLite state + upsert_group ────────────────────────────────────────────

@pytest.fixture
def conn():
    connection = bt.open_db(":memory:")
    yield connection
    connection.close()


def test_upsert_group_creates_new_group(conn):
    report = make_report()
    sig = bt.report_signature(report)
    bt.upsert_group(conn, report, sig)

    row = conn.execute("SELECT * FROM groups WHERE signature = ?", (sig,)).fetchone()
    assert row is not None
    assert row["report_count"] == 1
    assert row["category"] == "_crash"


def test_upsert_group_increments_existing_group(conn):
    r1 = make_report(id="a")
    r2 = make_report(id="b", created_at="2026-09-17 11:00:00")
    sig = bt.report_signature(r1)
    assert sig == bt.report_signature(r2)

    bt.upsert_group(conn, r1, sig)
    bt.upsert_group(conn, r2, sig)

    row = conn.execute("SELECT * FROM groups WHERE signature = ?", (sig,)).fetchone()
    assert row["report_count"] == 2
    assert row["last_seen"] == "2026-09-17 11:00:00"


def test_upsert_group_tracks_distinct_device_versions(conn):
    r1 = make_report(id="a", device_info={"model": "iPhone14,2"}, app_version="0.1.0")
    r2 = make_report(id="b", device_info={"model": "iPhone15,3"}, app_version="0.1.0")
    r3 = make_report(id="c", device_info={"model": "iPhone14,2"}, app_version="0.1.0")  # duplicate device
    sig = bt.report_signature(r1)

    bt.upsert_group(conn, r1, sig)
    bt.upsert_group(conn, r2, sig)
    bt.upsert_group(conn, r3, sig)

    row = conn.execute("SELECT * FROM groups WHERE signature = ?", (sig,)).fetchone()
    import json
    assert len(json.loads(row["device_versions"])) == 2  # not 3 — the duplicate shouldn't double-count


# ── run_once — pull cursor + idempotency ────────────────────────────────────

def test_run_once_advances_cursor_and_skips_already_processed(conn):
    reports_batch_1 = [make_report(id="a", created_at="2026-09-17 10:00:00")]
    reports_batch_2 = [
        make_report(id="a", created_at="2026-09-17 10:00:00"),  # same report re-sent by the API
        make_report(id="b", created_at="2026-09-17 10:05:00"),
    ]

    with patch.object(bt, "fetch_new_reports", return_value=reports_batch_1) as mock_fetch:
        new_count = bt.run_once(conn, "http://fake", "token")
        assert new_count == 1
        mock_fetch.assert_called_once_with("http://fake", "token", None)

    assert bt.get_state(conn, "last_pull_at") == "2026-09-17 10:00:00"

    with patch.object(bt, "fetch_new_reports", return_value=reports_batch_2) as mock_fetch:
        new_count = bt.run_once(conn, "http://fake", "token")
        # "a" already processed — only "b" should count as new
        assert new_count == 1
        mock_fetch.assert_called_once_with("http://fake", "token", "2026-09-17 10:00:00")

    assert bt.get_state(conn, "last_pull_at") == "2026-09-17 10:05:00"
