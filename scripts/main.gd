"""Main scene script for Bug Catcher test project."""

extends Control

@onready var status_label: Label = $VBoxContainer/StatusLabel

func _ready() -> void:
	status_label.text = "Status: Ready (session: %s)" % BugReporter.get_session_id()


func _on_capture_button_pressed() -> void:
	# Simulate a crash report
	var stack_trace := """
at InventorySystem.open() line 89
at PlayerController.interact() line 142
at CollisionSystem.check_overlap() line 234
at MainLoop._process() line 567
""".strip_edges()
	
	var report_id := BugReporter.capture_bug(
		"crash",
		"Simulated crash: Inventory open failure",
		stack_trace,
		"This is a simulated crash report for testing."
	)
	
	status_label.text = "Status: Report captured (%s)" % report_id
	print("[Bug Catcher] Simulated crash report: %s" % report_id)


func _on_report_button_pressed() -> void:
	BugReporter.show_report_popup()
	status_label.text = "Status: Report UI opened"


func _on_flush_button_pressed() -> void:
	var count := BugReporter.flush_cached_reports()
	status_label.text = "Status: Flushed %d reports" % count
	print("[Bug Catcher] Flushed %d cached reports" % count)
