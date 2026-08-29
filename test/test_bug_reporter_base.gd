"""Base test class for BugReporter tests.

Provides common setup: a fresh BugReporter instance with mocked HTTP,
clean cache directory, and helper methods for creating report payloads.
"""

extends GutTest

const BUG_REPORTER_PATH := "res://addons/bug_reporter/bug_reporter.gd"

var sut: Node  # System under test (BugReporter instance)
var mock_http: Node
var captured_request: Dictionary = {}
var http_response_code: int = 201
var http_result: int = HTTPRequest.RESULT_SUCCESS

# ── Fixtures ────────────────────────────────────────────────────────────────

func before_each() -> void:
	# Create a fresh BugReporter instance
	sut = load(BUG_REPORTER_PATH).new()
	add_child(sut)
	
	# Replace the HTTPRequest with a mock
	mock_http = _create_mock_http()
	sut._http = mock_http
	
	# Reset state
	captured_request = {}
	http_response_code = 201
	http_result = HTTPRequest.RESULT_SUCCESS
	
	# Ensure cache dir is clean
	var cache_dir := "user://bug_reporter_test_cache/"
	if DirAccess.dir_exists_absolute(cache_dir):
		var da := DirAccess.open(cache_dir)
		if da:
		(da as DirAccess).list_dir_begin()
			var file_name := da.get_next()
			while file_name != "":
				if da.current_is_dir():
					pass
				else:
				(da as DirAccess).remove(file_name)
				file_name = da.get_next()
			(da as DirAccess).list_dir_end()
	sut._cache_dir = cache_dir
	DirAccess.make_dir_absolute(cache_dir)


func after_each() -> void:
	if is_instance_valid(sut):
		sut.queue_free()
	
	# Clean up test cache
	var cache_dir := "user://bug_reporter_test_cache/"
	if DirAccess.dir_exists_absolute(cache_dir):
		var da := DirAccess.open(cache_dir)
		if da:
		(da as DirAccess).list_dir_begin()
			var file_name := da.get_next()
			while file_name != "":
				if da.current_is_dir():
					pass
				else:
				(da as DirAccess).remove(file_name)
				file_name = da.get_next()
			(da as DirAccess).list_dir_end()


# ── Helpers ─────────────────────────────────────────────────────────────────

func _create_mock_http() -> Node:
	var mock := Node.new()
	mock.name = "MockHTTP"
	
	# We'll intercept the request_completed signal manually
	return mock


func _simulate_http_success(response_code: int = 201) -> void:
	http_response_code = response_code
	http_result = HTTPRequest.RESULT_SUCCESS
	
	# Emit the signal that BugReporter listens on
	sut._http.emit_signal("request_completed", http_result, http_response_code, PackedStringArray(), PackedByteArray())


func _simulate_http_failure() -> void:
	http_result = HTTPRequest.RESULT_CONNECTION_ERROR
	http_response_code = 0
	
	sut._http.emit_signal("request_completed", http_result, http_response_code, PackedStringArray(), PackedByteArray())


func _create_test_report(overrides: Dictionary = {}) -> Dictionary:
	var base := {
		"id": "test-report-001",
		"session_id": "test-session-abc123",
		"game_name": "TestGame",
		"game_version": "0.1.0",
		"build_hash": "abc123def",
		"timestamp": "2026-01-15T10:30:00",
		"type": "crash",
		"title": "Test crash report",
		"description": "A test description",
		"stack_trace": "at TestClass.test_method() line 42\nat Main._ready() line 10",
		"scene": "test_scene",
		"player_position": {"x": 10.0, "y": 20.0},
		"hardware": {"os": "Windows 10", "gpu": "NVIDIA GTX 1060", "cpu": "Intel i7", "ram_gb": 16, "resolution": "1920x1080"},
		"performance": {"fps": 60.0, "frame_time_ms": 16.67, "memory_mb": 512, "orphan_nodes": 0},
		"screenshot_path": "",
		"logs_attached": false,
		"hardware_opt_in": true,
		"processed": false,
		"group_id": null,
		"autoproducer_task_id": null,
		"created_at": "2026-01-15T10:30:00"
	}
	
	for key in overrides:
		base[key] = overrides[key]
	
	return base


func _get_cached_queue() -> Array:
	var path := sut._cache_dir + "queue.json"
	if not FileAccess.file_exists(path):
		return []
	var file := FileAccess.open(path, FileAccess.READ)
	if not file:
		return []
	var content := file.get_as_text()
	file.close()
	if content.strip_edges() == "":
		return []
	var json := JSON.new()
	json.parse(content)
	return json.data if typeof(json.data) == TYPE_ARRAY else []


func _clear_cache_file() -> void:
	var path := sut._cache_dir + "queue.json"
	if FileAccess.file_exists(path):
		FileAccess.remove(path)
