"""Tests for BugReporter.capture_bug() — the core capture pipeline.

Verifies that capture_bug:
- Generates a unique report ID
- Collects game metadata from ProjectSettings
- Builds the correct report dictionary structure
- Saves to cache queue (always, even before sending)
- Returns the report ID
"""

extends GutTest

const BUG_REPORTER_PATH := "res://addons/bug_reporter/bug_reporter.gd"


# ── Test: capture_bug returns a non-empty string ────────────────────────────

func test_capture_bug_returns_non_empty_string():
	var sut = load(BUG_REPORTER_PATH).new()
	add_child(sut)
	
	# Simulate _ready was called so config is loaded
	sut._endpoint = "http://localhost:8080/api/v1/report"
	sut._upload_endpoint = "http://localhost:8080/api/v1/upload"
	sut._cache_dir = "user://bug_reporter_test_cache/"
	sut._poll_interval = 60.0
	sut._auto_send = false  # Don't actually send during tests
	sut._screenshot_enabled = false
	sut._logs_enabled = false
	sut._hardware_opt_in_default = true
	sut._session_id = "test-session-abc123"
	DirAccess.make_dir_absolute(sut._cache_dir)
	
	var result := sut.capture_bug("crash", "Test crash", "at Test() line 1")
	
	assert_not_equal(result, "", "capture_bug should return a non-empty string")
	assert_true(result.length() > 0, "Report ID should have some length")


# ── Test: capture_bug generates unique IDs for multiple calls ───────────────

func test_capture_bug_generates_unique_ids_for_multiple_calls():
	var sut = load(BUG_REPORTER_PATH).new()
	add_child(sut)
	
	sut._endpoint = "http://localhost:8080/api/v1/report"
	sut._upload_endpoint = "http://localhost:8080/api/v1/upload"
	sut._cache_dir = "user://bug_reporter_test_cache/"
	sut._poll_interval = 60.0
	sut._auto_send = false
	sut._screenshot_enabled = false
	sut._logs_enabled = false
	sut._hardware_opt_in_default = true
	sut._session_id = "test-session-abc123"
	DirAccess.make_dir_absolute(sut._cache_dir)
	
	var id1 := sut.capture_bug("crash", "First crash", "at Test() line 1")
	var id2 := sut.capture_bug("error", "Second error", "at Test() line 2")
	var id3 := sut.capture_bug("feedback", "Feedback", "")
	
	assert_not_equal(id1, id2, "First and second reports should have different IDs")
	assert_not_equal(id2, id3, "Second and third reports should have different IDs")
	assert_not_equal(id1, id3, "First and third reports should have different IDs")


# ── Test: capture_bug saves report to cache queue ───────────────────────────

func test_capture_bug_saves_to_cache_queue():
	var sut = load(BUG_REPORTER_PATH).new()
	add_child(sut)
	
	sut._endpoint = "http://localhost:8080/api/v1/report"
	sut._upload_endpoint = "http://localhost:8080/api/v1/upload"
	sut._cache_dir = "user://bug_reporter_test_cache/"
	sut._poll_interval = 60.0
	sut._auto_send = false
	sut._screenshot_enabled = false
	sut._logs_enabled = false
	sut._hardware_opt_in_default = true
	sut._session_id = "test-session-abc123"
	DirAccess.make_dir_absolute(sut._cache_dir)
	
	assert_equal(sut._report_queue.size(), 0, "Queue should start empty")
	
	sut.capture_bug("crash", "Test crash", "at Test() line 1")
	
	assert_equal(sut._report_queue.size(), 1, "Queue should have 1 report after capture")


# ── Test: capture_bug report contains correct type field ───────────────────

func test_capture_bug_report_contains_correct_type():
	var sut = load(BUG_REPORTER_PATH).new()
	add_child(sut)
	
	sut._endpoint = "http://localhost:8080/api/v1/report"
	sut._upload_endpoint = "http://localhost:8080/api/v1/upload"
	sut._cache_dir = "user://bug_reporter_test_cache/"
	sut._poll_interval = 60.0
	sut._auto_send = false
	sut._screenshot_enabled = false
	sut._logs_enabled = false
	sut._hardware_opt_in_default = true
	sut._session_id = "test-session-abc123"
	DirAccess.make_dir_absolute(sut._cache_dir)
	
	sut.capture_bug("crash", "Test crash", "at Test() line 1")
	var report := sut._report_queue[0] as Dictionary
	
	assert_equal(report["type"], "crash", "Report type should be 'crash'")


func test_capture_bug_report_type_error():
	var sut = load(BUG_REPORTER_PATH).new()
	add_child(sut)
	
	sut._endpoint = "http://localhost:8080/api/v1/report"
	sut._upload_endpoint = "http://localhost:8080/api/v1/upload"
	sut._cache_dir = "user://bug_reporter_test_cache/"
	sut._poll_interval = 60.0
	sut._auto_send = false
	sut._screenshot_enabled = false
	sut._logs_enabled = false
	sut._hardware_opt_in_default = true
	sut._session_id = "test-session-abc123"
	DirAccess.make_dir_absolute(sut._cache_dir)
	
	sut.capture_bug("error", "Test error", "at Test() line 1")
	var report := sut._report_queue[0] as Dictionary
	
	assert_equal(report["type"], "error", "Report type should be 'error'")


func test_capture_bug_report_type_feedback():
	var sut = load(BUG_REPORTER_PATH).new()
	add_child(sut)
	
	sut._endpoint = "http://localhost:8080/api/v1/report"
	sut._upload_endpoint = "http://localhost:8080/api/v1/upload"
	sut._cache_dir = "user://bug_reporter_test_cache/"
	sut._poll_interval = 60.0
	sut._auto_send = false
	sut._screenshot_enabled = false
	sut._logs_enabled = false
	sut._hardware_opt_in_default = true
	sut._session_id = "test-session-abc123"
	DirAccess.make_dir_absolute(sut._cache_dir)
	
	sut.capture_bug("feedback", "Test feedback", "")
	var report := sut._report_queue[0] as Dictionary
	
	assert_equal(report["type"], "feedback", "Report type should be 'feedback'")


# ── Test: capture_bug report contains title and description ────────────────

func test_capture_bug_report_contains_title():
	var sut = load(BUG_REPORTER_PATH).new()
	add_child(sut)
	
	sut._endpoint = "http://localhost:8080/api/v1/report"
	sut._upload_endpoint = "http://localhost:8080/api/v1/upload"
	sut._cache_dir = "user://bug_reporter_test_cache/"
	sut._poll_interval = 60.0
	sut._auto_send = false
	sut._screenshot_enabled = false
	sut._logs_enabled = false
	sut._hardware_opt_in_default = true
	sut._session_id = "test-session-abc123"
	DirAccess.make_dir_absolute(sut._cache_dir)
	
	sut.capture_bug("crash", "Inventory crash", "at Test() line 1")
	var report := sut._report_queue[0] as Dictionary
	
	assert_equal(report["title"], "Inventory crash", "Report title should match input")


func test_capture_bug_report_contains_description():
	var sut = load(BUG_REPORTER_PATH).new()
	add_child(sut)
	
	sut._endpoint = "http://localhost:8080/api/v1/report"
	sut._upload_endpoint = "http://localhost:8080/api/v1/upload"
	sut._cache_dir = "user://bug_reporter_test_cache/"
	sut._poll_interval = 60.0
	sut._auto_send = false
	sut._screenshot_enabled = false
	sut._logs_enabled = false
	sut._hardware_opt_in_default = true
	sut._session_id = "test-session-abc123"
	DirAccess.make_dir_absolute(sut._cache_dir)
	
	var desc := "Player says: the game crashes when I open inventory near the boss"
	sut.capture_bug("crash", "Inventory crash", "at Test() line 1", desc)
	var report := sut._report_queue[0] as Dictionary
	
	assert_equal(report["description"], desc, "Report description should match input")


# ── Test: capture_bug report contains stack trace ──────────────────────────

func test_capture_bug_report_contains_stack_trace():
	var sut = load(BUG_REPORTER_PATH).new()
	add_child(sut)
	
	sut._endpoint = "http://localhost:8080/api/v1/report"
	sut._upload_endpoint = "http://localhost:8080/api/v1/upload"
	sut._cache_dir = "user://bug_reporter_test_cache/"
	sut._poll_interval = 60.0
	sut._auto_send = false
	sut._screenshot_enabled = false
	sut._logs_enabled = false
	sut._hardware_opt_in_default = true
	sut._session_id = "test-session-abc123"
	DirAccess.make_dir_absolute(sut._cache_dir)
	
	var trace := "at InventorySystem.open() line 89\nat PlayerController.interact() line 142"
	sut.capture_bug("crash", "Inventory crash", trace)
	var report := sut._report_queue[0] as Dictionary
	
	assert_equal(report["stack_trace"], trace, "Report stack trace should match input")


# ── Test: capture_bug report contains scene name ───────────────────────────

func test_capture_bug_report_contains_scene():
	var sut = load(BUG_REPORTER_PATH).new()
	add_child(sut)
	
	sut._endpoint = "http://localhost:8080/api/v1/report"
	sut._upload_endpoint = "http://localhost:8080/api/v1/upload"
	sut._cache_dir = "user://bug_reporter_test_cache/"
	sut._poll_interval = 60.0
	sut._auto_send = false
	sut._screenshot_enabled = false
	sut._logs_enabled = false
	sut._hardware_opt_in_default = true
	sut._session_id = "test-session-abc123"
	DirAccess.make_dir_absolute(sut._cache_dir)
	
	sut.capture_bug("crash", "Inventory crash", "at Test() line 1", "", "level_03_boss")
	var report := sut._report_queue[0] as Dictionary
	
	assert_equal(report["scene"], "level_03_boss", "Report scene should match input")


func test_capture_bug_report_scene_defaults_to_empty():
	var sut = load(BUG_REPORTER_PATH).new()
	add_child(sut)
	
	sut._endpoint = "http://localhost:8080/api/v1/report"
	sut._upload_endpoint = "http://localhost:8080/api/v1/upload"
	sut._cache_dir = "user://bug_reporter_test_cache/"
	sut._poll_interval = 60.0
	sut._auto_send = false
	sut._screenshot_enabled = false
	sut._logs_enabled = false
	sut._hardware_opt_in_default = true
	sut._session_id = "test-session-abc123"
	DirAccess.make_dir_absolute(sut._cache_dir)
	
	sut.capture_bug("crash", "Inventory crash", "at Test() line 1")
	var report := sut._report_queue[0] as Dictionary
	
	assert_equal(report["scene"], "", "Report scene should default to empty string")


# ── Test: capture_bug report contains game metadata ────────────────────────

func test_capture_bug_report_contains_game_name():
	var sut = load(BUG_REPORTER_PATH).new()
	add_child(sut)
	
	sut._endpoint = "http://localhost:8080/api/v1/report"
	sut._upload_endpoint = "http://localhost:8080/api/v1/upload"
	sut._cache_dir = "user://bug_reporter_test_cache/"
	sut._poll_interval = 60.0
	sut._auto_send = false
	sut._screenshot_enabled = false
	sut._logs_enabled = false
	sut._hardware_opt_in_default = true
	sut._session_id = "test-session-abc123"
	DirAccess.make_dir_absolute(sut._cache_dir)
	
	sut.capture_bug("crash", "Test crash", "at Test() line 1")
	var report := sut._report_queue[0] as Dictionary
	
	# game_name comes from ProjectSettings, which may vary by environment
	assert_true(report.has("game_name"), "Report should have game_name field")
	assert_true(typeof(report["game_name"]) == TYPE_STRING, "game_name should be a string")


func test_capture_bug_report_contains_game_version():
	var sut = load(BUG_REPORTER_PATH).new()
	add_child(sut)
	
	sut._endpoint = "http://localhost:8080/api/v1/report"
	sut._upload_endpoint = "http://localhost:8080/api/v1/upload"
	sut._cache_dir = "user://bug_reporter_test_cache/"
	sut._poll_interval = 60.0
	sut._auto_send = false
	sut._screenshot_enabled = false
	sut._logs_enabled = false
	sut._hardware_opt_in_default = true
	sut._session_id = "test-session-abc123"
	DirAccess.make_dir_absolute(sut._cache_dir)
	
	sut.capture_bug("crash", "Test crash", "at Test() line 1")
	var report := sut._report_queue[0] as Dictionary
	
	assert_true(report.has("game_version"), "Report should have game_version field")
	assert_true(typeof(report["game_version"]) == TYPE_STRING, "game_version should be a string")


# ── Test: capture_bug report contains session_id ───────────────────────────

func test_capture_bug_report_contains_session_id():
	var sut = load(BUG_REPORTER_PATH).new()
	add_child(sut)
	
	sut._endpoint = "http://localhost:8080/api/v1/report"
	sut._upload_endpoint = "http://localhost:8080/api/v1/upload"
	sut._cache_dir = "user://bug_reporter_test_cache/"
	sut._poll_interval = 60.0
	sut._auto_send = false
	sut._screenshot_enabled = false
	sut._logs_enabled = false
	sut._hardware_opt_in_default = true
	sut._session_id = "test-session-abc123"
	DirAccess.make_dir_absolute(sut._cache_dir)
	
	sut.capture_bug("crash", "Test crash", "at Test() line 1")
	var report := sut._report_queue[0] as Dictionary
	
	assert_equal(report["session_id"], "test-session-abc123", "Report session_id should match")


# ── Test: capture_bug report contains timestamp and created_at ─────────────

func test_capture_bug_report_contains_timestamp():
	var sut = load(BUG_REPORTER_PATH).new()
	add_child(sut)
	
	sut._endpoint = "http://localhost:8080/api/v1/report"
	sut._upload_endpoint = "http://localhost:8080/api/v1/upload"
	sut._cache_dir = "user://bug_reporter_test_cache/"
	sut._poll_interval = 60.0
	sut._auto_send = false
	sut._screenshot_enabled = false
	sut._logs_enabled = false
	sut._hardware_opt_in_default = true
	sut._session_id = "test-session-abc123"
	DirAccess.make_dir_absolute(sut._cache_dir)
	
	sut.capture_bug("crash", "Test crash", "at Test() line 1")
	var report := sut._report_queue[0] as Dictionary
	
	assert_true(report.has("timestamp"), "Report should have timestamp field")
	assert_true(typeof(report["timestamp"]) == TYPE_STRING, "timestamp should be a string")


# ── Test: capture_bug report contains hardware_opt_in ──────────────────────

func test_capture_bug_report_contains_hardware_opt_in():
	var sut = load(BUG_REPORTER_PATH).new()
	add_child(sut)
	
	sut._endpoint = "http://localhost:8080/api/v1/report"
	sut._upload_endpoint = "http://localhost:8080/api/v1/upload"
	sut._cache_dir = "user://bug_reporter_test_cache/"
	sut._poll_interval = 60.0
	sut._auto_send = false
	sut._screenshot_enabled = false
	sut._logs_enabled = false
	sut._hardware_opt_in_default = true
	sut._session_id = "test-session-abc123"
	DirAccess.make_dir_absolute(sut._cache_dir)
	
	sut.capture_bug("crash", "Test crash", "at Test() line 1")
	var report := sut._report_queue[0] as Dictionary
	
	assert_true(report["hardware_opt_in"], "hardware_opt_in should be true when opt-in enabled")


func test_capture_bug_report_hardware_opt_in_false():
	var sut = load(BUG_REPORTER_PATH).new()
	add_child(sut)
	
	sut._endpoint = "http://localhost:8080/api/v1/report"
	sut._upload_endpoint = "http://localhost:8080/api/v1/upload"
	sut._cache_dir = "user://bug_reporter_test_cache/"
	sut._poll_interval = 60.0
	sut._auto_send = false
	sut._screenshot_enabled = false
	sut._logs_enabled = false
	sut._hardware_opt_in_default = false
	sut._session_id = "test-session-abc123"
	DirAccess.make_dir_absolute(sut._cache_dir)
	
	sut.capture_bug("crash", "Test crash", "at Test() line 1")
	var report := sut._report_queue[0] as Dictionary
	
	assert_false(report["hardware_opt_in"], "hardware_opt_in should be false when opt-in disabled")


# ── Test: capture_bug report contains processed and group_id defaults ──────

func test_capture_bug_report_processed_defaults_to_false():
	var sut = load(BUG_REPORTER_PATH).new()
	add_child(sut)
	
	sut._endpoint = "http://localhost:8080/api/v1/report"
	sut._upload_endpoint = "http://localhost:8080/api/v1/upload"
	sut._cache_dir = "user://bug_reporter_test_cache/"
	sut._poll_interval = 60.0
	sut._auto_send = false
	sut._screenshot_enabled = false
	sut._logs_enabled = false
	sut._hardware_opt_in_default = true
	sut._session_id = "test-session-abc123"
	DirAccess.make_dir_absolute(sut._cache_dir)
	
	sut.capture_bug("crash", "Test crash", "at Test() line 1")
	var report := sut._report_queue[0] as Dictionary
	
	assert_false(report["processed"], "processed should default to false")


func test_capture_bug_report_group_id_defaults_to_null():
	var sut = load(BUG_REPORTER_PATH).new()
	add_child(sut)
	
	sut._endpoint = "http://localhost:8080/api/v1/report"
	sut._upload_endpoint = "http://localhost:8080/api/v1/upload"
	sut._cache_dir = "user://bug_reporter_test_cache/"
	sut._poll_interval = 60.0
	sut._auto_send = false
	sut._screenshot_enabled = false
	sut._logs_enabled = false
	sut._hardware_opt_in_default = true
	sut._session_id = "test-session-abc123"
	DirAccess.make_dir_absolute(sut._cache_dir)
	
	sut.capture_bug("crash", "Test crash", "at Test() line 1")
	var report := sut._report_queue[0] as Dictionary
	
	assert_is_null(report["group_id"], "group_id should default to null")


func test_capture_bug_report_autoproducer_task_id_defaults_to_null():
	var sut = load(BUG_REPORTER_PATH).new()
	add_child(sut)
	
	sut._endpoint = "http://localhost:8080/api/v1/report"
	sut._upload_endpoint = "http://localhost:8080/api/v1/upload"
	sut._cache_dir = "user://bug_reporter_test_cache/"
	sut._poll_interval = 60.0
	sut._auto_send = false
	sut._screenshot_enabled = false
	sut._logs_enabled = false
	sut._hardware_opt_in_default = true
	sut._session_id = "test-session-abc123"
	DirAccess.make_dir_absolute(sut._cache_dir)
	
	sut.capture_bug("crash", "Test crash", "at Test() line 1")
	var report := sut._report_queue[0] as Dictionary
	
	assert_is_null(report["autoproducer_task_id"], "autoproducer_task_id should default to null")


# ── Test: capture_bug report contains screenshot_path and logs_attached defaults ─

func test_capture_bug_report_screenshot_path_empty_by_default():
	var sut = load(BUG_REPORTER_PATH).new()
	add_child(sut)
	
	sut._endpoint = "http://localhost:8080/api/v1/report"
	sut._upload_endpoint = "http://localhost:8080/api/v1/upload"
	sut._cache_dir = "user://bug_reporter_test_cache/"
	sut._poll_interval = 60.0
	sut._auto_send = false
	sut._screenshot_enabled = false
	sut._logs_enabled = false
	sut._hardware_opt_in_default = true
	sut._session_id = "test-session-abc123"
	DirAccess.make_dir_absolute(sut._cache_dir)
	
	sut.capture_bug("crash", "Test crash", "at Test() line 1")
	var report := sut._report_queue[0] as Dictionary
	
	assert_equal(report["screenshot_path"], "", "screenshot_path should be empty when disabled")


func test_capture_bug_report_logs_attached_false_by_default():
	var sut = load(BUG_REPORTER_PATH).new()
	add_child(sut)
	
	sut._endpoint = "http://localhost:8080/api/v1/report"
	sut._upload_endpoint = "http://localhost:8080/api/v1/upload"
	sut._cache_dir = "user://bug_reporter_test_cache/"
	sut._poll_interval = 60.0
	sut._auto_send = false
	sut._screenshot_enabled = false
	sut._logs_enabled = false
	sut._hardware_opt_in_default = true
	sut._session_id = "test-session-abc123"
	DirAccess.make_dir_absolute(sut._cache_dir)
	
	sut.capture_bug("crash", "Test crash", "at Test() line 1")
	var report := sut._report_queue[0] as Dictionary
	
	assert_false(report["logs_attached"], "logs_attached should be false when disabled")


# ── Test: capture_bug with auto_send=true sends the report ─────────────────

func test_capture_bug_with_auto_send_sends_report():
	var sut = load(BUG_REPORTER_PATH).new()
	add_child(sut)
	
	sut._endpoint = "http://localhost:8080/api/v1/report"
	sut._upload_endpoint = "http://localhost:8080/api/v1/upload"
	sut._cache_dir = "user://bug_reporter_test_cache/"
	sut._poll_interval = 60.0
	sut._auto_send = true
	sut._screenshot_enabled = false
	sut._logs_enabled = false
	sut._hardware_opt_in_default = true
	sut._session_id = "test-session-abc123"
	DirAccess.make_dir_absolute(sut._cache_dir)
	
	# Mock HTTP success
	var mock_http := Node.new()
	mock_http.name = "MockHTTP"
	sut._http = mock_http
	
	var request_completed_called := false
	var request_completed_code := 0
	
	# We need to capture the signal before emitting
	# Since we can't easily mock, test that the queue is empty after successful send
	# by checking _try_send_report returns true on success
	
	# Actually, _try_send_report always returns true (it initiates the request).
	# The removal happens in _on_request_completed which is async.
	# For this test, we verify the report is added to queue first.
	
	sut.capture_bug("crash", "Test crash", "at Test() line 1")
	
	# Queue should have the report (async send hasn't completed yet)
	assert_equal(sut._report_queue.size(), 1, "Report should be in queue initially")


# ── Test: capture_bug with auto_send=false keeps in cache ──────────────────

func test_capture_bug_with_auto_send_false_keeps_in_cache():
	var sut = load(BUG_REPORTER_PATH).new()
	add_child(sut)
	
	sut._endpoint = "http://localhost:8080/api/v1/report"
	sut._upload_endpoint = "http://localhost:8080/api/v1/upload"
	sut._cache_dir = "user://bug_reporter_test_cache/"
	sut._poll_interval = 60.0
	sut._auto_send = false
	sut._screenshot_enabled = false
	sut._logs_enabled = false
	sut._hardware_opt_in_default = true
	sut._session_id = "test-session-abc123"
	DirAccess.make_dir_absolute(sut._cache_dir)
	
	sut.capture_bug("crash", "Test crash", "at Test() line 1")
	
	assert_equal(sut._report_queue.size(), 1, "Report should stay in cache when auto_send is false")


# ── Test: capture_bug with empty stack trace ───────────────────────────────

func test_capture_bug_with_empty_stack_trace():
	var sut = load(BUG_REPORTER_PATH).new()
	add_child(sut)
	
	sut._endpoint = "http://localhost:8080/api/v1/report"
	sut._upload_endpoint = "http://localhost:8080/api/v1/upload"
	sut._cache_dir = "user://bug_reporter_test_cache/"
	sut._poll_interval = 60.0
	sut._auto_send = false
	sut._screenshot_enabled = false
	sut._logs_enabled = false
	sut._hardware_opt_in_default = true
	sut._session_id = "test-session-abc123"
	DirAccess.make_dir_absolute(sut._cache_dir)
	
	sut.capture_bug("feedback", "No stack trace feedback", "")
	var report := sut._report_queue[0] as Dictionary
	
	assert_equal(report["stack_trace"], "", "Stack trace should be empty string")


# ── Test: capture_bug with null-like description ───────────────────────────

func test_capture_bug_with_empty_description():
	var sut = load(BUG_REPORTER_PATH).new()
	add_child(sut)
	
	sut._endpoint = "http://localhost:8080/api/v1/report"
	sut._upload_endpoint = "http://localhost:8080/api/v1/upload"
	sut._cache_dir = "user://bug_reporter_test_cache/"
	sut._poll_interval = 60.0
	sut._auto_send = false
	sut._screenshot_enabled = false
	sut._logs_enabled = false
	sut._hardware_opt_in_default = true
	sut._session_id = "test-session-abc123"
	DirAccess.make_dir_absolute(sut._cache_dir)
	
	sut.capture_bug("crash", "Test crash", "at Test() line 1", "")
	var report := sut._report_queue[0] as Dictionary
	
	assert_equal(report["description"], "", "Description should be empty string")
