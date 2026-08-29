"""Tests for BugReporter data collection helpers.

Verifies that:
- _generate_report_id produces non-empty unique strings
- _get_build_hash returns a string
- _collect_hardware_info returns a dictionary with expected keys
- _collect_performance_stats returns a dictionary with expected keys
- _should_include_h respects the opt-in setting
"""

extends GutTest

const BUG_REPORTER_PATH := "res://addons/bug_reporter/bug_reporter.gd"


# ── Test: _generate_report_id produces non-empty string ─────────────────────

func test_generate_report_id_returns_non_empty_string():
	var sut = load(BUG_REPORTER_PATH).new()
	add_child(sut)
	
	var id := sut._generate_report_id()
	
	assert_not_equal(id, "", "Report ID should not be empty")
	assert_true(typeof(id) == TYPE_STRING, "Report ID should be a string")


func test_generate_report_id_returns_different_values():
	var sut = load(BUG_REPORTER_PATH).new()
	add_child(sut)
	
	var id1 := sut._generate_report_id()
	var id2 := sut._generate_report_id()
	
	assert_not_equal(id1, id2, "Multiple calls should produce different IDs")


# ── Test: _get_build_hash returns string ───────────────────────────────────

func test_get_build_hash_returns_string():
	var sut = load(BUG_REPORTER_PATH).new()
	add_child(sut)
	
	sut._cache_dir = "user://bug_reporter_test_cache/"
	DirAccess.make_dir_absolute(sut._cache_dir)
	
	var build_hash := sut._get_build_hash()
	
	assert_true(typeof(build_hash) == TYPE_STRING, "Build hash should be a string")


func test_get_build_hash_uses_project_setting_when_set():
	var sut = load(BUG_REPORTER_PATH).new()
	add_child(sut)
	
	sut._cache_dir = "user://bug_reporter_test_cache/"
	DirAccess.make_dir_absolute(sut._cache_dir)
	
	# Set the project setting
	ProjectSettings.set_setting("bug_reporter/build_hash", "custom-build-123")
	ProjectSettings.save()
	
	var build_hash := sut._get_build_hash()
	
	assert_equal(build_hash, "custom-build-123", "Should use custom build hash from settings")
	
	# Clean up
	ProjectSettings.set_setting("bug_reporter/build_hash", "")
	ProjectSettings.save()


# ── Test: _collect_hardware_info returns expected structure ────────────────

func test_collect_hardware_info_returns_dictionary():
	var sut = load(BUG_REPORTER_PATH).new()
	add_child(sut)
	
	sut._cache_dir = "user://bug_reporter_test_cache/"
	DirAccess.make_dir_absolute(sut._cache_dir)
	
	var hw := sut._collect_hardware_info()
	
	assert_true(typeof(hw) == TYPE_DICTIONARY, "Hardware info should be a dictionary")


func test_collect_hardware_info_contains_os():
	var sut = load(BUG_REPORTER_PATH).new()
	add_child(sut)
	
	sut._cache_dir = "user://bug_reporter_test_cache/"
	DirAccess.make_dir_absolute(sut._cache_dir)
	
	var hw := sut._collect_hardware_info()
	
	assert_true(hw.has("os"), "Hardware info should contain 'os' key")
	assert_true(typeof(hw["os"]) == TYPE_STRING, "OS value should be a string")


func test_collect_hardware_info_contains_cpu():
	var sut = load(BUG_REPORTER_PATH).new()
	add_child(sut)
	
	sut._cache_dir = "user://bug_reporter_test_cache/"
	DirAccess.make_dir_absolute(sut._cache_dir)
	
	var hw := sut._collect_hardware_info()
	
	assert_true(hw.has("cpu"), "Hardware info should contain 'cpu' key")
	assert_true(typeof(hw["cpu"]) == TYPE_STRING, "CPU value should be a string")


func test_collect_hardware_info_contains_ram_gb():
	var sut = load(BUG_REPORTER_PATH).new()
	add_child(sut)
	
	sut._cache_dir = "user://bug_reporter_test_cache/"
	DirAccess.make_dir_absolute(sut._cache_dir)
	
	var hw := sut._collect_hardware_info()
	
	assert_true(hw.has("ram_gb"), "Hardware info should contain 'ram_gb' key")
	assert_true(typeof(hw["ram_gb"]) == TYPE_INT, "ram_gb value should be an integer")


func test_collect_hardware_info_contains_resolution():
	var sut = load(BUG_REPORTER_PATH).new()
	add_child(sut)
	
	sut._cache_dir = "user://bug_reporter_test_cache/"
	DirAccess.make_dir_absolute(sut._cache_dir)
	
	var hw := sut._collect_hardware_info()
	
	assert_true(hw.has("resolution"), "Hardware info should contain 'resolution' key")
	assert_true(typeof(hw["resolution"]) == TYPE_STRING, "Resolution value should be a string")


func test_collect_hardware_info_contains_gpu():
	var sut = load(BUG_REPORTER_PATH).new()
	add_child(sut)
	
	sut._cache_dir = "user://bug_reporter_test_cache/"
	DirAccess.make_dir_absolute(sut._cache_dir)
	
	var hw := sut._collect_hardware_info()
	
	assert_true(hw.has("gpu"), "Hardware info should contain 'gpu' key")


# ── Test: _collect_performance_stats returns expected structure ─────────────

func test_collect_performance_stats_returns_dictionary():
	var sut = load(BUG_REPORTER_PATH).new()
	add_child(sut)
	
	sut._cache_dir = "user://bug_reporter_test_cache/"
	DirAccess.make_dir_absolute(sut._cache_dir)
	
	var perf := sut._collect_performance_stats()
	
	assert_true(typeof(perf) == TYPE_DICTIONARY, "Performance stats should be a dictionary")


func test_collect_performance_stats_contains_fps():
	var sut = load(BUG_REPORTER_PATH).new()
	add_child(sut)
	
	sut._cache_dir = "user://bug_reporter_test_cache/"
	DirAccess.make_dir_absolute(sut._cache_dir)
	
	var perf := sut._collect_performance_stats()
	
	assert_true(perf.has("fps"), "Performance stats should contain 'fps' key")
	assert_true(typeof(perf["fps"]) == TYPE_FLOAT, "FPS value should be a float")


func test_collect_performance_stats_contains_frame_time_ms():
	var sut = load(BUG_REPORTER_PATH).new()
	add_child(sut)
	
	sut._cache_dir = "user://bug_reporter_test_cache/"
	DirAccess.make_dir_absolute(sut._cache_dir)
	
	var perf := sut._collect_performance_stats()
	
	assert_true(perf.has("frame_time_ms"), "Performance stats should contain 'frame_time_ms' key")
	assert_true(typeof(perf["frame_time_ms"]) == TYPE_FLOAT, "Frame time value should be a float")


func test_collect_performance_stats_contains_memory_mb():
	var sut = load(BUG_REPORTER_PATH).new()
	add_child(sut)
	
	sut._cache_dir = "user://bug_reporter_test_cache/"
	DirAccess.make_dir_absolute(sut._cache_dir)
	
	var perf := sut._collect_performance_stats()
	
	assert_true(perf.has("memory_mb"), "Performance stats should contain 'memory_mb' key")
	assert_true(typeof(perf["memory_mb"]) == TYPE_INT, "Memory value should be an integer")


func test_collect_performance_stats_contains_orphan_nodes():
	var sut = load(BUG_REPORTER_PATH).new()
	add_child(sut)
	
	sut._cache_dir = "user://bug_reporter_test_cache/"
	DirAccess.make_dir_absolute(sut._cache_dir)
	
	var perf := sut._collect_performance_stats()
	
	assert_true(perf.has("orphan_nodes"), "Performance stats should contain 'orphan_nodes' key")
	assert_true(typeof(perf["orphan_nodes"]) == TYPE_INT, "Orphan nodes value should be an integer")


# ── Test: _should_include_hardware respects opt-in setting ─────────────────

func test_should_include_hardware_returns_true_when_opt_in():
	var sut = load(BUG_REPORTER_PATH).new()
	add_child(sut)
	
	sut._hardware_opt_in_default = true
	
	assert_true(sut._should_include_hardware(), "Should include hardware when opt-in is true")


func test_should_include_hardware_returns_false_when_not_opted():
	var sut = load(BUG_REPORTER_PATH).new()
	add_child(sut)
	
	sut._hardware_opt_in_default = false
	
	assert_false(sut._should_include_hardware(), "Should not include hardware when opt-in is false")


# ── Test: _collect_hardware_info returns empty dict when not opted in ─────

func test_collect_hardware_info_empty_when_not_opted():
	var sut = load(BUG_REPORTER_PATH).new()
	add_child(sut)
	
	sut._cache_dir = "user://bug_reporter_test_cache/"
	DirAccess.make_dir_absolute(sut._cache_dir)
	sut._hardware_opt_in_default = false
	
	# When not opted in, capture_bug passes {} for hardware
	# We test this by checking the report structure directly
	sut._endpoint = "http://localhost:8080/api/v1/report"
	sut._upload_endpoint = "http://localhost:8080/api/v1/upload"
	sut._poll_interval = 60.0
	sut._auto_send = false
	sut._screenshot_enabled = false
	sut._logs_enabled = false
	sut._session_id = "test-session-abc123"
	
	sut.capture_bug("crash", "Test crash", "at Test() line 1")
	var report := sut._report_queue[0] as Dictionary
	
	assert_equal(report["hardware"], {}, "Hardware should be empty dict when not opted in")


# ── Test: _get_ram_gb returns positive integer ─────────────────────────────

func test_get_ram_gb_returns_positive_integer():
	var sut = load(BUG_REPORTER_PATH).new()
	add_child(sut)
	
	sut._cache_dir = "user://bug_reporter_test_cache/"
	DirAccess.make_dir_absolute(sut._cache_dir)
	
	var ram := sut._get_ram_gb()
	
	assert_true(ram > 0, "RAM should be a positive integer")
	assert_true(typeof(ram) == TYPE_INT, "RAM should be an integer")


# ── Test: _collect_hardware_info returns hardware even when not opted in ──

func test_collect_hardware_info_still_works_when_not_opted():
	var sut = load(BUG_REPORTER_PATH).new()
	add_child(sut)
	
	sut._cache_dir = "user://bug_reporter_test_cache/"
	DirAccess.make_dir_absolute(sut._cache_dir)
	
	# _collect_hardware_info always collects; it's capture_bug that decides
	# whether to include it based on opt-in. This test verifies the collection
	# itself works regardless of opt-in status.
	var hw := sut._collect_hardware_info()
	
	assert_true(hw.has("os"), "Hardware collection should return OS even when not opted in")


# ── Test: _get_player_position returns dictionary ──────────────────────────

func test_get_player_position_returns_dictionary():
	var sut = load(BUG_REPORTER_PATH).new()
	add_child(sut)
	
	sut._cache_dir = "user://bug_reporter_test_cache/"
	DirAccess.make_dir_absolute(sut._cache_dir)
	
	var pos := sut._get_player_position()
	
	assert_true(typeof(pos) == TYPE_DICTIONARY, "Player position should be a dictionary")
	assert_true(pos.has("x"), "Position should have 'x' key")
	assert_true(pos.has("y"), "Position should have 'y' key")
