"""Bug report popup — player-triggered bug reporting UI.

Shows a dialog where players can:
- Edit title/description
- Toggle hardware info opt-in
- Attach screenshot
- Send or cancel

Usage:
    BugReporter.show_report_popup()  # from autoload
    # or
    var popup = preload("res://scenes/bug_report_popup.tscn").instantiate()
    add_child(popup)
"""

extends Control


# ── Signals ──────────────────────────────────────────────────────────────────

signal report_sent(report_data: Dictionary)
signal report_cancelled


# ── UI References ────────────────────────────────────────────────────────────

@onready var title_edit: LineEdit = $VBoxContainer/TitleEdit
@onready var description_edit: TextEdit = $VBoxContainer/DescriptionEdit
@onready var hardware_check: CheckBox = $VBoxContainer/HardwareCheck
@onready var screenshot_check: CheckBox = $VBoxContainer/ScreenshotCheck
@onready var session_label: Label = $VBoxContainer/SessionInfo/SessionLabel
@onready var send_button: Button = $VBoxContainer/Buttons/SendButton
@onready var cancel_button: Button = $VBoxContainer/Buttons/CancelButton
@onready var status_label: Label = $VBoxContainer/StatusLabel


# ── State ────────────────────────────────────────────────────────────────────

var _pending_bug_data: Dictionary = {}  # data from crash that triggered this popup
var _is_sending: bool = false


# ── Lifecycle ────────────────────────────────────────────────────────────────

func _ready() -> void:
	_setup_ui()
	_load_session_info()


func _setup_ui() -> void:
	# Set default values
	title_edit.placeholder_text = "What happened?"
	description_edit.placeholder_text = "Describe what you were doing when this occurred..."
	hardware_check.button_pressed = true
	screenshot_check.button_pressed = false
	
	# Connect buttons
	send_button.pressed.connect(_on_send_pressed)
	cancel_button.pressed.connect(_on_cancel_pressed)
	
	# Make window close on cancel
	about_to_popup.connect(_on_about_to_popup)


func _load_session_info() -> void:
	var session_id := ""
	if Engine.has_singleton("BugReporter"):
		session_id = Engine.get_singleton("BugReporter").get_session_id()
	elif get_node_or_null("/root/BugReporter"):
		session_id = get_node("/root/BugReporter").get_session_id()
	
	session_label.text = "Session: %s" % session_id


func _on_about_to_popup() -> void:
	# Pre-fill from pending crash data if available
	if _pending_bug_data:
		title_edit.text = _pending_bug_data.get("title", "")
		description_edit.text = _pending_bug_data.get("description", "")
		hardware_check.button_pressed = _pending_bug_data.get("hardware_opt_in", true)


# ── Actions ──────────────────────────────────────────────────────────────────

func _on_send_pressed() -> void:
	if _is_sending:
		return
	
	_is_sending = true
	send_button.disabled = true
	cancel_button.disabled = true
	status_label.text = "Sending..."
	
	# Gather data
	var bug_reporter := _get_bug_reporter()
	if not bug_reporter:
		status_label.text = "Error: BugReporter not found"
		_is_sending = false
		return
	
	var title := title_edit.text.strip_edges()
	var description := description_edit.text.strip_edges()
	
	if title == "":
		title = _pending_bug_data.get("title", "Bug Report")
	
	# Capture screenshot if requested
	var screenshot_path := ""
	if screenshot_check.button_pressed:
		screenshot_path = _take_screenshot()
	
	# Build report data
	var report_data := {
		"type": "feedback",
		"title": title,
		"description": description,
		"stack_trace": _pending_bug_data.get("stack_trace", ""),
		"scene": _pending_bug_data.get("scene", ""),
		"player_position": _get_player_position(),
		"hardware_opt_in": hardware_check.button_pressed,
		"screenshot_path": screenshot_path,
	}
	
	# Send via BugReporter
	var report_id := bug_reporter.capture_bug(
		report_data.type,
		report_data.title,
		report_data.stack_trace,
		report_data.description,
		report_data.scene
	)
	
	if report_id != "":
		status_label.text = "Report sent! ID: %s" % report_id
		report_sent.emit(report_data)
		
		# Close after a brief delay
		get_tree().create_timer(2.0).timeout.connect(queue_free)
	else:
		status_label.text = "Failed to send report"
		_is_sending = false
		send_button.disabled = false
		cancel_button.disabled = false


func _on_cancel_pressed() -> void:
	report_cancelled.emit()
	queue_free()


# ── Helpers ──────────────────────────────────────────────────────────────────

func _get_bug_reporter() -> Node:
	# Try singleton first, then node path
	if Engine.has_singleton("BugReporter"):
		return Engine.get_singleton("BugReporter")
	return get_node_or_null("/root/BugReporter")


func _take_screenshot() -> String:
	var path := "user://bug_reports/screenshot_%d.png" % Time.get_unix_time_from_system()
	
	var main_loop := Engine.get_main_loop()
	if main_loop and main_loop.current_scene:
		var viewport := main_loop.current_scene.get_viewport()
		if viewport:
			var texture := viewport.get_texture()
			if texture:
				var img := texture.get_image()
				if img:
					img.save_png(path)
					return path
	
	return ""


func _get_player_position() -> Dictionary:
	var result := {"x": 0.0, "y": 0.0}
	
	var main_loop := Engine.get_main_loop()
	if main_loop and main_loop.current_scene:
		var player_path := main_loop.current_scene.get_node_or_null("Player")
		if not player_path:
			player_path = main_loop.current_scene.get_node_or_null("CharacterBody2D")
		if not player_path:
			for child in main_loop.current_scene.get_children():
				if child.has_method("get_position"):
					player_path = child
					break
		if player_path:
			var pos := player_path.get_position()
			result["x"] = pos.x
			result["y"] = pos.y
	
	return result


# ── Public API ───────────────────────────────────────────────────────────────

## Set pending crash data to pre-fill the popup.
func set_pending_data(data: Dictionary) -> void:
	_pending_bug_data = data


## Show the popup and optionally pre-fill from a crash.
static func show_with_crash_data(crash_data: Dictionary) -> "BugReportPopup":
	var popup := preload("res://scenes/bug_report_popup.tscn").instantiate() as Control
	popup.set_pending_data(crash_data)
	# Add to root so it's visible even if scene tree is unstable
	get_tree().root.add_child(popup)
	return popup as "BugReportPopup"


## Show a clean popup (no pre-filled data).
static func show_clean() -> "BugReportPopup":
	var popup := preload("res://bug_report_popup.tscn").instantiate() as Control
	get_tree().root.add_child(popup)
	return popup as "BugReportPopup"
