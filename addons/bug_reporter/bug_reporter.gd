"""Bug Catcher — Godot 4.x plugin for in-game bug reporting."""

extends Node

## BugReporter — autoload singleton for capturing and sending bug reports.
##
## Usage:
##   # On crash or error:
##   BugReporter.capture_bug("crash", "Game crashed", stack_trace)
##
##   # Player-triggered report:
##   BugReporter.show_report_popup()
##
##   # Flush cached reports (call on game launch):
##   BugReporter.flush_cached_reports()

# ── Configuration (set in Project Settings) ────────────────────────────────
const DEFAULT_ENDPOINT = "https://yourdomain.com/api/v1/report"
const DEFAULT_UPLOAD_ENDPOINT = "https://yourdomain.com/api/v1/upload"
const DEFAULT_CACHE_DIR = "user://bug_reports/"
const DEFAULT_POLL_INTERVAL = 60.0

# ── State ──────────────────────────────────────────────────────────────────
var _endpoint: String = DEFAULT_ENDPOINT
var _upload_endpoint: String = DEFAULT_UPLOAD_ENDPOINT
var _cache_dir: String = DEFAULT_CACHE_DIR
var _poll_interval: float = DEFAULT_POLL_INTERVAL
var _auto_send: bool = true
var _screenshot_enabled: bool = false
var _logs_enabled: bool = true
var _hardware_opt_in_default: bool = true

var _session_id: String = ""
var _report_queue: Array[Dictionary] = []  # cached reports waiting to send
var _http: HTTPRequest = HTTPRequest.new()
var _flush_timer: Timer = Timer.new()
var _is_ready: bool = false

# ── Lifecycle ──────────────────────────────────────────────────────────────

func _ready() -> void:
	_load_config()
	_setup_http()
	_setup_timer()
	_generate_session_id()
	_load_cache_queue()
	_is_ready = true
	
	# Flush cached reports on startup (before main menu loads)
	if _report_queue.size() > 0:
		print("[BugReporter] Flushing %d cached reports on startup..." % _report_queue.size())
		flush_cached_reports()

func _exit_tree() -> void:
	# Final flush before exit
	if _report_queue.size() > 0:
		print("[BugReporter] Flushing %d cached reports on exit..." % _report_queue.size())
		flush_cached_reports()


# ── Configuration ──────────────────────────────────────────────────────────

func _load_config() -> void:
	_endpoint = ProjectSettings.get_setting("bug_reporter/endpoint", DEFAULT_ENDPOINT)
	_upload_endpoint = ProjectSettings.get_setting("bug_reporter/upload_endpoint", DEFAULT_UPLOAD_ENDPOINT)
	_cache_dir = ProjectSettings.get_setting("bug_reporter/cache_dir", DEFAULT_CACHE_DIR)
	_poll_interval = ProjectSettings.get_setting("bug_reporter/poll_interval", DEFAULT_POLL_INTERVAL)
	_auto_send = ProjectSettings.get_setting("bug_reporter/auto_send", true)
	_screenshot_enabled = ProjectSettings.get_setting("bug_reporter/screenshot_enabled", false)
	_logs_enabled = ProjectSettings.get_setting("bug_reporter/logs_enabled", true)
	_hardware_opt_in_default = ProjectSettings.get_setting("bug_reporter/hardware_opt_in_default", true)

	# Ensure cache directory exists
	DirAccess.make_dir_absolute(_cache_dir)


# ── HTTP Setup ─────────────────────────────────────────────────────────────

func _setup_http() -> void:
	add_child(_http)
	_http.request_completed.connect(_on_request_completed)


# ── Timer Setup ────────────────────────────────────────────────────────────

func _setup_timer() -> void:
	_flush_timer.wait_time = _poll_interval
	_flush_timer.autostart = true
	_flush_timer.one_shot = false
	add_child(_flush_timer)
	_flush_timer.timeout.connect(_on_flush_timer_timeout)


# ── Session ID ─────────────────────────────────────────────────────────────

func _generate_session_id() -> void:
	var seed := str(Time.get_unix_time_from_system(), Time.get_ticks_msec(), OS.get_unique_id())
	_session_id = seed.md5_text().substr(0, 16)


# ── Cache Queue ────────────────────────────────────────────────────────────

func _save_to_cache(report: Dictionary) -> void:
	_report_queue.append(report)
	_save_queue_to_disk()

func _remove_from_cache(report_id: String) -> void:
	for i in range(_report_queue.size()):
		if _report_queue[i].get("id") == report_id:
			_report_queue.remove_at(i)
			break
	_save_queue_to_disk()

func _save_queue_to_disk() -> void:
	var path := _cache_dir + "queue.json"
	var file := FileAccess.open(path, FileAccess.WRITE)
	if file:
		file.store_string(JSON.stringify(_report_queue))
		file.close()

func _load_cache_queue() -> void:
	var path := _cache_dir + "queue.json"
	if not FileAccess.file_exists(path):
		return
	var file := FileAccess.open(path, FileAccess.READ)
	if file:
		var content := file.get_as_text()
		file.close()
		if content.strip_edges() != "":
			var json := JSON.new()
			var err := json.parse(content)
			if err == OK and typeof(json.data) == TYPE_ARRAY:
				_report_queue = json.data as Array[Dictionary]

func _clear_cache() -> void:
	_report_queue.clear()
	_save_queue_to_disk()


# ── Core API ───────────────────────────────────────────────────────────────

## Capture a bug report. Returns the report UUID.
## Call this on unhandled exceptions or from custom error handlers.
func capture_bug(p_type: String, p_title: String, p_stack_trace: String, 
                 p_description: String = "", p_scene: String = "") -> String:
	var report_id := _generate_report_id()
	
	var report := {
		"id": report_id,
		"session_id": _session_id,
		"game_name": ProjectSettings.get_setting("application/config/name", "Unknown"),
		"game_version": ProjectSettings.get_setting("application/config/version", "0.0.0"),
		"build_hash": _get_build_hash(),
		"timestamp": Time.get_datetime_string_from_system(),
		"type": p_type,  # "crash" | "error" | "feedback"
		"title": p_title,
		"description": p_description,
		"stack_trace": p_stack_trace,
		"scene": p_scene,
		"player_position": _get_player_position(),
		"hardware": _collect_hardware_info() if _should_include_hardware() else {},
		"performance": _collect_performance_stats(),
		"screenshot_path": "",
		"logs_attached": false,
		"hardware_opt_in": _should_include_hardware(),
		"processed": false,
		"group_id": null,
		"autoproducer_task_id": null,
		"created_at": Time.get_datetime_string_from_system()
	}
	
	# Take screenshot if enabled
	if _screenshot_enabled:
		var screenshot_path := _take_screenshot(report_id)
		if screenshot_path != "":
			report["screenshot_path"] = screenshot_path
	
	# Attach logs if crash type and enabled
	if p_type == "crash" and _logs_enabled:
		var log_path := _attach_crash_logs(report_id)
		if log_path != "":
			report["logs_attached"] = true
			report["log_path"] = log_path
	
	# Save to cache queue (always — even if sending immediately)
	_save_to_cache(report)
	
	# Try to send now; if it fails, it stays in cache
	if _auto_send:
		if _try_send_report(report):
			_remove_from_cache(report_id)
		else:
			print("[BugReporter] Report cached for later: " + report_id)
	
	return report_id


## Show a player-triggered bug report popup.
func show_report_popup() -> void:
	print("[BugReporter] show_report_popup() — create your custom UI panel here")
	# TODO: Open a custom UI panel with:
	# - Title field (pre-filled if from crash)
	# - Description field
	# - "Send report" button
	# - "Don't send" button
	# - Hardware info toggle (opt-in, defaults to on)
	# - Screenshot checkbox
	# - Session ID display (for follow-up reference)


## Flush all cached reports. Returns count of successfully sent reports.
func flush_cached_reports() -> int:
	var sent := 0
	var failed := 0
	
	for report in _report_queue:
		if _try_send_report(report):
			_remove_from_cache(report["id"])
			sent += 1
		else:
			failed += 1
	
	if sent > 0:
		print("[BugReporter] Flushed %d reports (%d failed)" % [sent, failed])
	
	return sent


## Get the current session ID.
func get_session_id() -> String:
	return _session_id


# ── Sending ────────────────────────────────────────────────────────────────

func _try_send_report(report: Dictionary) -> bool:
	var headers := [
		"Content-Type: application/json",
		"X-Game-Name: " + report["game_name"],
		"X-Game-Version: " + report["game_version"],
	]
	
	var body := JSON.stringify(report)
	var err := _http.request(_endpoint, headers, HTTPClient.METHOD_POST, body)
	
	if err != OK:
		print("[BugReporter] Failed to send report: error %d" % err)
		return false
	
	# request_completed is async — we'll check the result in _on_request_completed
	# For now, return true to indicate the request was initiated
	return true


func _on_request_completed(result: int, response_code: int, headers: PackedStringArray, body: PackedByteArray) -> void:
	if result != HTTPRequest.RESULT_SUCCESS:
		print("[BugReporter] Request failed (result=%d)" % result)
		return
	
	var status := response_code
	if status == 200 or status == 201:
		print("[BugReporter] Report accepted")
	else:
		print("[BugReporter] Server returned status %d" % status)


# ── Data Collection ────────────────────────────────────────────────────────

func _generate_report_id() -> String:
	var seed := str(Time.get_unix_time_from_system(), Time.get_ticks_msec(), randi())
	return seed.md5_text().substr(0, 16)


func _get_build_hash() -> String:
	# Try to get git commit hash from project settings or environment
	var build_hash := ProjectSettings.get_setting("bug_reporter/build_hash", "")
	if build_hash != "":
		return build_hash
	
	# Fallback: use timestamp as build hash
	return Time.get_datetime_string_from_system().replace(":", "").replace("-", "").replace(" ", "T")


func _get_player_position() -> Dictionary:
	var result := {"x": 0.0, "y": 0.0}
	
	var main_loop := Engine.get_main_loop()
	if main_loop and main_loop.current_scene:
		var node := main_loop.current_scene.get_node_or_null("Player")
		if node:
			result["x"] = node.position.x if node.has_method("get_position") else 0.0
			result["y"] = node.position.y if node.has_method("get_position") else 0.0
	
	return result


func _collect_hardware_info() -> Dictionary:
	return {
		"os": OS.get_name(),
		"gpu": DisplayServer.screen_get_dpi() if DisplayServer.is_feature_available(DisplayServer.FEATURE_GPU_INFO) else "unknown",
		"cpu": OS.get_processor_name(),
		"ram_gb": _get_ram_gb(),
		"resolution": "%dx%d" % [DisplayServer.window_get_size().x, DisplayServer.window_get_size().y],
	}


func _get_ram_gb() -> int:
	var mem_info := OS.get_memory_status()
	return max(1, mem_info.total / (1024 * 1024 * 1024))


func _collect_performance_stats() -> Dictionary:
	return {
		"fps": Engine.get_frames_per_second(),
		"frame_time_ms": 1000.0 / max(1, Engine.get_frames_per_second()),
		"memory_mb": _get_memory_usage_mb(),
		"orphan_nodes": _count_orphan_nodes(),
	}


func _get_memory_usage_mb() -> int:
	var mem_info := OS.get_memory_status()
	return max(1, mem_info.used / (1024 * 1024))


func _count_orphan_nodes() -> int:
	var count := 0
	var main_loop := Engine.get_main_loop()
	if main_loop and main_loop.current_scene:
		count = main_loop.current_scene.get_child_count()
	return count


func _should_include_hardware() -> bool:
	# In a real implementation, this would check player consent from settings
	# For now, use the default opt-in setting
	return _hardware_opt_in_default


# ── Screenshot ─────────────────────────────────────────────────────────────

func _take_screenshot(report_id: String) -> String:
	var path := _cache_dir + report_id + ".png"
	
	# Capture screen
	var img := DisplayServer.window_get_image()
	if img:
		img.save_png(path)
		return path
	
	return ""


# ── Logs ───────────────────────────────────────────────────────────────────

func _attach_crash_logs(report_id: String) -> String:
	var path := _cache_dir + report_id + ".log"
	var file := FileAccess.open(path, FileAccess.WRITE)
	if file:
		file.store_string(_get_engine_log())
		file.close()
		return path
	return ""


func _get_engine_log() -> String:
	# In a real implementation, this would capture the engine log buffer
	# For now, return a placeholder
	return "Engine log not available in this build.\n"


# ── Timer Callback ─────────────────────────────────────────────────────────

func _on_flush_timer_timeout() -> void:
	if _report_queue.size() > 0:
		print("[BugReporter] Periodic flush: %d cached reports" % _report_queue.size())
		flush_cached_reports()


# ── Crash Handler Hook ─────────────────────────────────────────────────────

## Override this in your main scene to hook into unhandled errors.
## Call this from _unhandled_error() or similar.
func on_unhandled_error(p_error: String, p_code: int, p_function: String, 
                        p_line: int, p_native_stack: String = "") -> void:
	var trace := "Error: %s\nCode: %d\nFunction: %s\nLine: %d\nStack:\n%s" % [
		p_error, p_code, p_function, p_line, p_native_stack
	]
	
	capture_bug("crash", p_error, trace, p_error, 
	            Engine.get_main_loop().current_scene.name if Engine.get_main_loop() and Engine.get_main_loop().current_scene else "")
