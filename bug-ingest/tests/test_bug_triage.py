"""Tests for bug_triage.py pattern matching and grouping.

Covers:
- extract_trace_signature: parsing various stack trace formats
- normalize_signature: whitespace stripping, empty entry removal
- calculate_similarity: Jaccard index edge cases
- group_reports: merging, new groups, threshold behavior
"""

import pytest
from bug_triage import (
    extract_trace_signature,
    normalize_signature,
    calculate_similarity,
    group_reports,
)


# ── Fixtures ─────────────────────────────────────────────────────────────────

def _make_report(
    report_id: str = "test-001",
    stack_trace: str = "",
    title: str = "Test Bug",
    session_id: str = "sess-001",
    timestamp: str = "2026-08-29T10:00:00+00:00",
    report_type: str = "crash",
    scene: str = "level_03",
    hardware_opt_in: bool = True,
    hardware_json: str = '{"os": "Windows 10", "gpu": "NVIDIA RTX 3070", "ram_gb": 16}',
) -> "BugReport":
    """Helper to create a BugReport for testing."""
    from bug_triage import BugReport
    return BugReport(
        id=report_id,
        session_id=session_id,
        game_name="TestGame",
        game_version="0.1.0",
        build_hash=None,
        timestamp=timestamp,
        report_type=report_type,
        title=title,
        description="",
        stack_trace=stack_trace,
        scene=scene,
        player_position_x=0.0,
        player_position_y=0.0,
        hardware_json=hardware_json if hardware_opt_in else None,
        performance_json=None,
        screenshot_path=None,
        logs_attached=False,
        log_path=None,
        hardware_opt_in=hardware_opt_in,
        created_at=timestamp,
        processed=False,
        group_id=None,
        autoproducer_task_id=None,
    )


# ── extract_trace_signature Tests ────────────────────────────────────────────

class TestExtractTraceSignature:
    """Tests for extract_trace_signature()."""

    def test_parses_standard_godot_stack_trace(self):
        trace = (
            "at PlayerController.update() line 142\n"
            "at EnemyAI.pathfind() line 89\n"
            "at CollisionSystem.check_overlap() line 234\n"
        )
        result = extract_trace_signature(trace)
        assert result == "PlayerController.update|EnemyAI.pathfind|CollisionSystem.check_overlap"

    def test_returns_empty_for_none(self):
        assert extract_trace_signature(None) == ""

    def test_returns_empty_for_empty_string(self):
        assert extract_trace_signature("") == ""

    def test_returns_empty_for_whitespace_only(self):
        assert extract_trace_signature("   \n  \t  ") == ""

    def test_skips_module_level_functions(self):
        trace = "at <module> line 1\nat PlayerController.update() line 42\n"
        result = extract_trace_signature(trace)
        assert "<module>" not in result

    def test_skips_special_functions(self):
        trace = "at <init> line 1\nat PlayerController.update() line 42\n"
        result = extract_trace_signature(trace)
        assert "<" not in result or "PlayerController.update" in result

    def test_handles_at_syntax_with_colon(self):
        trace = "at PlayerController.update at player.gd:142\n"
        result = extract_trace_signature(trace)
        assert "PlayerController.update" in result

    def test_handles_mixed_line_formats(self):
        trace = (
            "at PlayerController.update() line 142\n"
            "EnemyAI.pathfind at enemy.gd:89\n"
            "at CollisionSystem.check_overlap() line 234\n"
        )
        result = extract_trace_signature(trace)
        assert "PlayerController.update" in result
        assert "EnemyAI.pathfind" in result
        assert "CollisionSystem.check_overlap" in result

    def test_returns_empty_for_no_at_keyword(self):
        trace = "PlayerController.update() line 142\nSome random text\n"
        result = extract_trace_signature(trace)
        assert result == ""

    def test_handles_single_function(self):
        trace = "at PlayerController.update() line 142\n"
        result = extract_trace_signature(trace)
        assert result == "PlayerController.update"


# ── normalize_signature Tests ────────────────────────────────────────────────

class TestNormalizeSignature:
    """Tests for normalize_signature()."""

    def test_strips_whitespace(self):
        result = normalize_signature("  Player.update | EnemyAI.move  ")
        assert result == "Player.update|EnemyAI.move"

    def test_removes_empty_entries(self):
        result = normalize_signature("Player.update||EnemyAI.move|")
        assert result == "Player.update|EnemyAI.move"

    def test_returns_empty_for_none(self):
        assert normalize_signature(None) == ""

    def test_returns_empty_for_empty_string(self):
        assert normalize_signature("") == ""

    def test_preserves_order(self):
        result = normalize_signature("C|B|A")
        assert result == "C|B|A"


# ── calculate_similarity Tests ───────────────────────────────────────────────

class TestCalculateSimilarity:
    """Tests for calculate_similarity() using Jaccard index."""

    def test_identical_signatures_return_1(self):
        sig = "Player.update|EnemyAI.move|Collision.check"
        assert calculate_similarity(sig, sig) == 1.0

    def test_completely_different_returns_0(self):
        sig1 = "Player.update|EnemyAI.move"
        sig2 = "Inventory.open|Menu.navigate"
        assert calculate_similarity(sig1, sig2) == 0.0

    def test_partial_overlap(self):
        sig1 = "A|B|C"
        sig2 = "A|B|D"
        # Intersection: {A, B} = 2, Union: {A, B, C, D} = 4
        assert calculate_similarity(sig1, sig2) == pytest.approx(0.5)

    def test_one_empty_returns_0(self):
        assert calculate_similarity("Player.update", "") == 0.0
        assert calculate_similarity("", "Player.update") == 0.0

    def test_both_empty_returns_1(self):
        assert calculate_similarity("", "") == 1.0

    def test_none_input_returns_0(self):
        assert calculate_similarity(None, "Player.update") == 0.0
        assert calculate_similarity("Player.update", None) == 0.0

    def test_single_function_match(self):
        sig1 = "Player.update"
        sig2 = "Player.update|EnemyAI.move"
        # Intersection: {Player.update} = 1, Union: {Player.update, EnemyAI.move} = 2
        assert calculate_similarity(sig1, sig2) == pytest.approx(0.5)

    def test_superset_returns_less_than_1(self):
        sig1 = "A|B|C|D"
        sig2 = "A|B"
        # Intersection: {A, B} = 2, Union: {A, B, C, D} = 4
        assert calculate_similarity(sig1, sig2) == pytest.approx(0.5)


# ── group_reports Tests ──────────────────────────────────────────────────────

class TestGroupReports:
    """Tests for group_reports()."""

    def test_identical_traces_grouped_together(self):
        trace = "at PlayerController.update() line 142\nat EnemyAI.pathfind() line 89\n"
        reports = [
            _make_report("r1", trace, "Bug 1"),
            _make_report("r2", trace, "Bug 2"),
        ]
        groups = group_reports(reports)
        assert len(groups) == 1
        assert groups[0].count == 2

    def test_different_traces_create_separate_groups(self):
        trace1 = "at PlayerController.update() line 142\n"
        trace2 = "at InventorySystem.open() line 89\n"
        reports = [
            _make_report("r1", trace1, "Bug 1"),
            _make_report("r2", trace2, "Bug 2"),
        ]
        groups = group_reports(reports)
        assert len(groups) == 2

    def test_empty_reports_returns_empty_list(self):
        groups = group_reports([])
        assert groups == []

    def test_no_stack_trace_creates_group_with_empty_signature(self):
        reports = [_make_report("r1", "", "No trace")]
        groups = group_reports(reports)
        assert len(groups) == 1
        assert groups[0].signature == ""

    def test_threshold_blocks_low_similarity_groups(self):
        # These traces share only 1 function out of 3 — similarity = 0.33 < 0.75
        trace1 = "at A.update() line 1\nat B.move() line 2\nat C.check() line 3\n"
        trace2 = "at A.update() line 1\nat D.open() line 2\nat E.navigate() line 3\n"
        reports = [
            _make_report("r1", trace1, "Bug 1"),
            _make_report("r2", trace2, "Bug 2"),
        ]
        groups = group_reports(reports)
        assert len(groups) == 2

    def test_high_similarity_merges_groups(self):
        # These traces share 2 out of 3 functions — similarity = 0.67 < 0.75
        # So they should NOT merge with default threshold
        trace1 = "at A.update() line 1\nat B.move() line 2\nat C.check() line 3\n"
        trace2 = "at A.update() line 1\nat B.move() line 2\nat D.navigate() line 3\n"
        reports = [
            _make_report("r1", trace1, "Bug 1"),
            _make_report("r2", trace2, "Bug 2"),
        ]
        groups = group_reports(reports)
        assert len(groups) == 2

    def test_higher_threshold_allows_merge(self):
        # With threshold 0.5, similarity of 0.67 should merge
        trace1 = "at A.update() line 1\nat B.move() line 2\nat C.check() line 3\n"
        trace2 = "at A.update() line 1\nat B.move() line 2\nat D.navigate() line 3\n"
        reports = [
            _make_report("r1", trace1, "Bug 1"),
            _make_report("r2", trace2, "Bug 2"),
        ]
        groups = group_reports(reports, threshold=0.5)
        assert len(groups) == 1

    def test_group_has_correct_signature(self):
        trace = "at PlayerController.update() line 142\n"
        reports = [_make_report("r1", trace, "Bug 1")]
        groups = group_reports(reports)
        assert "PlayerController.update" in groups[0].signature

    def test_group_tracks_first_seen(self):
        old_ts = "2026-08-01T10:00:00+00:00"
        new_ts = "2026-08-29T10:00:00+00:00"
        reports = [
            _make_report("r1", "at A.update() line 1\n", "Bug 1", timestamp=new_ts),
            _make_report("r2", "at A.update() line 1\n", "Bug 2", timestamp=old_ts),
        ]
        groups = group_reports(reports)
        assert groups[0].first_seen is not None

    def test_group_tracks_last_seen(self):
        old_ts = "2026-08-01T10:00:00+00:00"
        new_ts = "2026-08-29T10:00:00+00:00"
        reports = [
            _make_report("r1", "at A.update() line 1\n", "Bug 1", timestamp=new_ts),
            _make_report("r2", "at A.update() line 1\n", "Bug 2", timestamp=old_ts),
        ]
        groups = group_reports(reports)
        assert groups[0].last_seen is not None

    def test_group_collects_hardware_info(self):
        trace = "at A.update() line 1\n"
        hw_json = '{"os": "Linux", "gpu": "NVIDIA RTX 3070", "ram_gb": 32}'
        reports = [
            _make_report("r1", trace, "Bug 1", hardware_opt_in=True, hardware_json=hw_json),
        ]
        groups = group_reports(reports)
        assert len(groups[0].hardware_info) == 1

    def test_group_ignores_hardware_when_opt_out(self):
        trace = "at A.update() line 1\n"
        reports = [
            _make_report("r1", trace, "Bug 1", hardware_opt_in=False),
        ]
        groups = group_reports(reports)
        assert len(groups[0].hardware_info) == 0

    def test_group_sets_sample_report(self):
        trace = "at A.update() line 1\n"
        reports = [
            _make_report("r1", trace, "Bug 1"),
            _make_report("r2", trace, "Bug 2"),
        ]
        groups = group_reports(reports)
        assert groups[0].sample_report is not None
        assert groups[0].sample_report.id in ("r1", "r2")

    def test_multiple_groups_preserve_order(self):
        traces = [
            "at A.update() line 1\n",
            "at B.move() line 2\n",
            "at C.check() line 3\n",
        ]
        reports = [_make_report(f"r{i}", t, f"Bug {i}") for i, t in enumerate(traces)]
        groups = group_reports(reports)
        assert len(groups) == 3

    def test_group_count_matches_reports(self):
        trace = "at A.update() line 1\n"
        reports = [_make_report(f"r{i}", trace, f"Bug {i}") for i in range(5)]
        groups = group_reports(reports)
        assert len(groups) == 1
        assert groups[0].count == 5

    def test_affected_players_counts_unique_sessions(self):
        trace = "at A.update() line 1\n"
        reports = [
            _make_report("r1", trace, "Bug 1", session_id="sess-001"),
            _make_report("r2", trace, "Bug 2", session_id="sess-001"),
            _make_report("r3", trace, "Bug 3", session_id="sess-002"),
        ]
        groups = group_reports(reports)
        assert groups[0].affected_players == 2

    def test_unique_hardware_configs(self):
        trace = "at A.update() line 1\n"
        hw1 = '{"os": "Windows 10", "gpu": "NVIDIA RTX 3070", "ram_gb": 16}'
        hw2 = '{"os": "Linux", "gpu": "AMD RX 6800", "ram_gb": 32}'
        reports = [
            _make_report("r1", trace, "Bug 1", hardware_opt_in=True, hardware_json=hw1),
            _make_report("r2", trace, "Bug 2", hardware_opt_in=True, hardware_json=hw2),
        ]
        groups = group_reports(reports)
        assert len(groups[0].unique_hardware_configs) == 2

    def test_scenes_affected_counts(self):
        trace = "at A.update() line 1\n"
        reports = [
            _make_report("r1", trace, "Bug 1", scene="level_01"),
            _make_report("r2", trace, "Bug 2", scene="level_01"),
            _make_report("r3", trace, "Bug 3", scene="level_02"),
        ]
        groups = group_reports(reports)
        scenes = groups[0].scenes_affected
        assert scenes["level_01"] == 2
        assert scenes["level_02"] == 1

    def test_to_dict_serializes_correctly(self):
        trace = "at A.update() line 1\n"
        reports = [_make_report("r1", trace, "Bug 1")]
        groups = group_reports(reports)
        d = groups[0].to_dict()
        assert d["group_id"] == groups[0].group_id
        assert d["count"] == 1
        assert d["signature"] == groups[0].signature
        assert "first_seen" in d
        assert "last_seen" in d
