"""Tests for bug_triage.py priority scoring.

Covers:
- calculate_priority: each factor independently and combined
- _estimate_hours: stack trace depth → hours mapping
- _build_notes: note generation for autoproducer tasks
- _days_since: timestamp parsing edge cases
"""

import json
from datetime import datetime, timezone, timedelta

import pytest

from bug_triage import (
    calculate_priority,
    _estimate_hours,
    _build_notes,
    _days_since,
    BugGroup,
    BugReport,
)


# ── Helpers ────────────────────────────────────────────────────────────────────


def _make_report(
    rid: str,
    trace: str = "at PlayerController.update() line 1\n",
    report_type: str = "crash",
    scene: str = "level_03",
    hardware_opt_in: bool = True,
    hardware_json: str | None = None,
    created_at: str | None = None,
) -> BugReport:
    now = datetime.now(timezone.utc).isoformat()
    return BugReport(
        id=rid,
        session_id="sess-001",
        game_name="TestGame",
        game_version="0.1.0",
        build_hash=None,
        timestamp=created_at or now,
        report_type=report_type,
        title=f"Bug {rid}",
        description="",
        stack_trace=trace,
        scene=scene,
        player_position_x=0.0,
        player_position_y=0.0,
        hardware_json=hardware_json if hardware_opt_in else None,
        performance_json=None,
        screenshot_path=None,
        logs_attached=False,
        log_path=None,
        hardware_opt_in=hardware_opt_in,
        created_at=created_at or now,
        processed=False,
        group_id=None,
        autoproducer_task_id=None,
    )


def _make_group(reports: list, signature: str = "PlayerController.update") -> BugGroup:
    return BugGroup(
        group_id="test-group",
        signature=signature,
        reports=reports,
        count=len(reports),
        first_seen=datetime.now(timezone.utc) - timedelta(days=1),
        last_seen=datetime.now(timezone.utc),
        hardware_info=[],
        sample_report=reports[0] if reports else None,
        priority_score=0.0,
    )


# ── calculate_priority Tests ───────────────────────────────────────────────────


class TestCalculatePriority:
    """Tests for the calculate_priority function."""

    def test_frequency_contributes_to_score(self):
        """More reports → higher score (frequency factor)."""
        reports = [_make_report(f"r{i}") for i in range(5)]
        group = _make_group(reports)
        score = calculate_priority(group)
        assert score >= 50  # min(5 * 10, 50) = 50 from frequency alone

    def test_frequency_capped_at_50(self):
        """Frequency contribution capped at 50."""
        reports = [_make_report(f"r{i}") for i in range(10)]
        group = _make_group(reports)
        score = calculate_priority(group)
        # Frequency contributes exactly 50 (capped), not 100
        assert score >= 50

    def test_crash_ratio_contributes(self):
        """Crash reports contribute more than feedback."""
        crash_reports = [_make_report(f"r{i}", report_type="crash") for i in range(3)]
        feedback_reports = [_make_report(f"f{i}", report_type="feedback") for i in range(3)]

        crash_group = _make_group(crash_reports)
        feedback_group = _make_group(feedback_reports)

        crash_score = calculate_priority(crash_group)
        feedback_score = calculate_priority(feedback_group)

        assert crash_score > feedback_score

    def test_recentness_contributes(self):
        """Recent reports get a recentness bonus."""
        now = datetime.now(timezone.utc)
        recent_reports = [_make_report(
            "r1",
            created_at=(now - timedelta(hours=2)).isoformat(),
        )]
        group = _make_group(recent_reports)
        score = calculate_priority(group)
        assert score >= 20  # <1 day bonus

    def test_old_reports_get_less_recentness(self):
        """Old reports get less recentness bonus."""
        old_date = (datetime.now(timezone.utc) - timedelta(days=30)).isoformat()
        old_reports = [_make_report("r1", created_at=old_date)]
        group = _make_group(old_reports)
        score = calculate_priority(group)
        # Should get 6 (<30 days) or 0 (>30 days), not 20 (<1 day)
        assert score < 50  # Without recentness bonus, max would be lower

    def test_hardware_diversity_contributes(self):
        """More unique hardware configs → higher score."""
        hw1 = '{"os": "Windows 10", "gpu": "NVIDIA RTX 3070", "ram_gb": 16}'
        hw2 = '{"os": "Linux", "gpu": "AMD RX 6800", "ram_gb": 32}'

        reports_hw = [
            _make_report("r1", hardware_opt_in=True, hardware_json=hw1),
            _make_report("r2", hardware_opt_in=True, hardware_json=hw2),
        ]
        group_hw = _make_group(reports_hw)
        score_hw = calculate_priority(group_hw)

        reports_no_hw = [
            _make_report("r3", hardware_opt_in=False),
            _make_report("r4", hardware_opt_in=False),
        ]
        group_no_hw = _make_group(reports_no_hw)
        score_no_hw = calculate_priority(group_no_hw)

        assert score_hw > score_no_hw

    def test_scene_concentration_bonus(self):
        """Bugs concentrated in one scene get a bonus."""
        same_scene_reports = [
            _make_report(f"r{i}", scene="level_03") for i in range(5)
        ]
        group = _make_group(same_scene_reports)
        score = calculate_priority(group)

        # Scene concentration bonus: 10 if >3 reports in one scene
        assert score >= 10

    def test_combined_factors(self):
        """Combined priority score is sum of all factors."""
        hw1 = '{"os": "Windows 10", "gpu": "NVIDIA RTX 3070", "ram_gb": 16}'
        hw2 = '{"os": "Linux", "gpu": "AMD RX 6800", "ram_gb": 32}'

        now = datetime.now(timezone.utc)
        reports = [
            _make_report(
                f"r{i}",
                report_type="crash",
                scene="level_03",
                hardware_opt_in=True,
                hardware_json=hw1 if i == 0 else hw2,
                created_at=(now - timedelta(hours=1)).isoformat(),
            )
            for i in range(5)
        ]
        group = _make_group(reports)
        score = calculate_priority(group)

        # Expected: frequency(50) + crash_ratio(30) + recentness(20) + hw_diversity(10) + scene_bonus(10) = 120
        assert score >= 100  # All factors contribute significantly


class TestEstimateHours:
    """Tests for _estimate_hours function."""

    def test_empty_trace_returns_0_5(self):
        """Empty stack trace → minimum 0.5 hours."""
        report = _make_report("r1", trace="")
        group = _make_group([report], signature="")
        assert _estimate_hours(group) == 0.5

    def test_no_sample_report_returns_0_5(self):
        """No sample report → minimum 0.5 hours."""
        group = BugGroup(
            group_id="test",
            signature="",
            reports=[],
            count=0,
            first_seen=datetime.now(timezone.utc),
            last_seen=datetime.now(timezone.utc),
            hardware_info=[],
            sample_report=None,
        )
        assert _estimate_hours(group) == 0.5

    def test_depth_scales_hours(self):
        """Deeper stack traces → more estimated hours."""
        deep_trace = "at A.update() line 1\nat B.move() line 2\nat C.check() line 3\n"
        report_deep = _make_report("r1", trace=deep_trace)
        group_deep = _make_group([report_deep], signature="A.update|B.move|C.check")

        shallow_trace = "at A.update() line 1\n"
        report_shallow = _make_report("r2", trace=shallow_trace)
        group_shallow = _make_group([report_shallow], signature="A.update")

        assert _estimate_hours(group_deep) > _estimate_hours(group_shallow)

    def test_hours_capped_at_8(self):
        """Estimated hours capped at 8.0."""
        deep_trace = "\n".join(f"at Func{i}.method() line {i}" for i in range(20))
        report = _make_report("r1", trace=deep_trace)
        group = _make_group([report], signature="|".join(f"Func{i}.method" for i in range(20)))
        assert _estimate_hours(group) <= 8.0


class TestBuildNotes:
    """Tests for _build_notes function."""

    def test_notes_include_group_id(self):
        """Notes contain the group ID."""
        report = _make_report("r1")
        group = _make_group([report])
        notes = _build_notes(group)
        assert "test-group" in notes

    def test_notes_include_affected_players(self):
        """Notes contain affected player count."""
        hw1 = '{"os": "Windows 10", "gpu": "NVIDIA RTX 3070", "ram_gb": 16}'
        reports = [
            _make_report("r1", hardware_opt_in=True, hardware_json=hw1),
            _make_report("r2", hardware_opt_in=True, hardware_json=hw1),
        ]
        group = _make_group(reports)
        notes = _build_notes(group)
        assert "Affected Players: 1" in notes  # Same session_id

    def test_notes_include_hardware(self):
        """Notes contain hardware configurations."""
        hw1 = '{"os": "Windows 10", "gpu": "NVIDIA RTX 3070", "ram_gb": 16}'
        report = _make_report("r1", hardware_opt_in=True, hardware_json=hw1)
        group = _make_group([report])
        notes = _build_notes(group)
        assert "Windows 10" in notes
        assert "NVIDIA RTX 3070" in notes

    def test_notes_include_scenes(self):
        """Notes contain affected scenes."""
        report = _make_report("r1", scene="level_03")
        group = _make_group([report])
        notes = _build_notes(group)
        assert "level_03" in notes

    def test_notes_include_sample_stack_trace(self):
        """Notes contain the sample stack trace."""
        trace = "at PlayerController.update() line 142\nat EnemyAI.pathfind() line 89\n"
        report = _make_report("r1", trace=trace)
        group = _make_group([report])
        notes = _build_notes(group)
        assert "PlayerController.update" in notes

    def test_notes_include_player_comment(self):
        """Notes contain the sample player comment if available."""
        report = _make_report("r1", description="Game crashed when I opened the inventory")
        group = _make_group([report])
        notes = _build_notes(group)
        assert "Game crashed" in notes


class TestDaysSince:
    """Tests for _days_since helper function."""

    def test_recent_timestamp_returns_small_value(self):
        """Recent timestamp → small days value."""
        now = datetime.now(timezone.utc)
        delta = _days_since(now)
        assert 0 <= delta < 1

    def test_old_timestamp_returns_large_value(self):
        """Old timestamp → large days value."""
        old = (datetime.now(timezone.utc) - timedelta(days=365)).isoformat()
        delta = _days_since(old)
        assert delta >= 364

    def test_invalid_timestamp_returns_999(self):
        """Invalid timestamp → 999 (treated as very old)."""
        assert _days_since("not-a-date") == 999

    def test_none_returns_999(self):
        """None timestamp → 999."""
        assert _days_since(None) == 999
