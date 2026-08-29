"""Tests for BugReporter cache queue persistence.

Verifies that the cache queue:
- Is saved to disk as JSON
- Is loaded from disk on startup
- Survives removal of in-memory state
- Handles empty/missing cache files gracefully
"""

extends GutTest

const BUG_REPORTER_PATH := "res://addons/bug_reporter/bug_reporter.gd"


# ── Test: _save_to_cache writes JSON to disk ───────────────────────────────

func test_save_to_cache_writes_json_file():
	var sut = load(BUG_REPORTER_PATH).new()
	add_child(sut)
	
	sut._cache_dir = "user://bug_reporter_test_cache/"
	DirAccess.make_dir_absolute(sut._cache_dir)
	
	var report := {
		"id": "test-001",
		"type": "crash",
		"title": "Test"
	}
	sut._save_to_cache(report)
	
	assert_true(FileAccess.file_exists(sut._cache_dir + "queue.json"), "Cache file should exist")


func test_save_to_cache_writes_valid_json():
	var sut = load(BUG_REPORTER_PATH).new()
	add_child(sut)
	
	sut._cache_dir = "user://bug_reporter_test_cache/"
	DirAccess.make_dir_absolute(sut._cache_dir)
	
	var report := {
		"id": "test-001",
		"type": "crash",
		"title": "Test"
	}
	sut._save_to_cache(report)
	
	var file := FileAccess.open(sut._cache_dir + "queue.json", FileAccess.READ)
	var content := file.get_as_text()
	file.close()
	
	var json := JSON.new()
	var err := json.parse(content)
	assert_equal(err, OK, "Cache content should be valid JSON")


func test_save_to_cache_writes_report_data():
	var sut = load(BUG_REPORTER_PATH).new()
	add_child(sut)
	
	sut._cache_dir = "user://bug_reporter_test_cache/"
	DirAccess.make_dir_absolute(sut._cache_dir)
	
	var report := {
		"id": "test-001",
		"type": "crash",
		"title": "Inventory crash"
	}
	sut._save_to_cache(report)
	
	var file := FileAccess.open(sut._cache_dir + "queue.json", FileAccess.READ)
	var content := file.get_as_text()
	file.close()
	
	assert_true("test-001" in content, "Cache should contain report ID")
	assert_true("Inventory crash" in content, "Cache should contain report title")


# ── Test: _load_cache_queue loads from disk ────────────────────────────────

func test_load_cache_queue_loads_from_disk():
	var sut = load(BUG_REPORTER_PATH).new()
	add_child(sut)
	
	sut._cache_dir = "user://bug_reporter_test_cache/"
	DirAccess.make_dir_absolute(sut._cache_dir)
	
	# Write a cache file manually
	var queue_data := [
		{"id": "test-001", "type": "crash", "title": "Test crash 1"},
		{"id": "test-002", "type": "error", "title": "Test error 2"}
	]
	var file := FileAccess.open(sut._cache_dir + "queue.json", FileAccess.WRITE)
	file.store_string(JSON.stringify(queue_data))
	file.close()
	
	# Load it
	sut._load_cache_queue()
	
	assert_equal(sut._report_queue.size(), 2, "Queue should have 2 reports loaded from disk")


func test_load_cache_queue_preserves_report_data():
	var sut = load(BUG_REPORTER_PATH).new()
	add_child(sut)
	
	sut._cache_dir = "user://bug_reporter_test_cache/"
	DirAccess.make_dir_absolute(sut._cache_dir)
	
	var queue_data := [
		{"id": "test-001", "type": "crash", "title": "Inventory crash"}
	]
	var file := FileAccess.open(sut._cache_dir + "queue.json", FileAccess.WRITE)
	file.store_string(JSON.stringify(queue_data))
	file.close()
	
	sut._load_cache_queue()
	
	var report := sut._report_queue[0] as Dictionary
	assert_equal(report["id"], "test-001", "Loaded report ID should match")
	assert_equal(report["type"], "crash", "Loaded report type should match")
	assert_equal(report["title"], "Inventory crash", "Loaded report title should match")


# ── Test: _load_cache_queue handles missing file ───────────────────────────

func test_load_cache_queue_handles_missing_file():
	var sut = load(BUG_REPORTER_PATH).new()
	add_child(sut)
	
	sut._cache_dir = "user://bug_reporter_test_cache/"
	DirAccess.make_dir_absolute(sut._cache_dir)
	
	# Don't create a cache file — just load
	sut._load_cache_queue()
	
	assert_equal(sut._report_queue.size(), 0, "Queue should be empty when no cache file exists")


func test_load_cache_queue_handles_empty_file():
	var sut = load(BUG_REPORTER_PATH).new()
	add_child(sut)
	
	sut._cache_dir = "user://bug_reporter_test_cache/"
	DirAccess.make_dir_absolute(sut._cache_dir)
	
	# Create an empty cache file
	var file := FileAccess.open(sut._cache_dir + "queue.json", FileAccess.WRITE)
	file.store_string("")
	file.close()
	
	sut._load_cache_queue()
	
	assert_equal(sut._report_queue.size(), 0, "Queue should be empty when cache file is empty")


func test_load_cache_queue_handles_whitespace_only_file():
	var sut = load(BUG_REPORTER_PATH).new()
	add_child(sut)
	
	sut._cache_dir = "user://bug_reporter_test_cache/"
	DirAccess.make_dir_absolute(sut._cache_dir)
	
	# Create a whitespace-only cache file
	var file := FileAccess.open(sut._cache_dir + "queue.json", FileAccess.WRITE)
	file.store_string("   \n  \t  \n")
	file.close()
	
	sut._load_cache_queue()
	
	assert_equal(sut._report_queue.size(), 0, "Queue should be empty when cache file is whitespace-only")


# ── Test: _clear_cache clears in-memory and disk ───────────────────────────

func test_clear_cache_clears_in_memory():
	var sut = load(BUG_REPORTER_PATH).new()
	add_child(sut)
	
	sut._cache_dir = "user://bug_reporter_test_cache/"
	DirAccess.make_dir_absolute(sut._cache_dir)
	
	var report := {"id": "test-001", "type": "crash"}
	sut._save_to_cache(report)
	assert_equal(sut._report_queue.size(), 1, "Queue should have 1 report")
	
	sut._clear_cache()
	
	assert_equal(sut._report_queue.size(), 0, "Queue should be empty after clear")


func test_clear_cache_clears_disk():
	var sut = load(BUG_REPORTER_PATH).new()
	add_child(sut)
	
	sut._cache_dir = "user://bug_reporter_test_cache/"
	DirAccess.make_dir_absolute(sut._cache_dir)
	
	var report := {"id": "test-001", "type": "crash"}
	sut._save_to_cache(report)
	assert_true(FileAccess.file_exists(sut._cache_dir + "queue.json"), "Cache file should exist")
	
	sut._clear_cache()
	
	assert_false(FileAccess.file_exists(sut._cache_dir + "queue.json"), "Cache file should be removed after clear")


# ── Test: _remove_from_cache removes specific report ───────────────────────

func test_remove_from_cache_removes_specific_report():
	var sut = load(BUG_REPORTER_PATH).new()
	add_child(sut)
	
	sut._cache_dir = "user://bug_reporter_test_cache/"
	DirAccess.make_dir_absolute(sut._cache_dir)
	
	var report1 := {"id": "test-001", "type": "crash"}
	var report2 := {"id": "test-002", "type": "error"}
	sut._save_to_cache(report1)
	sut._save_to_cache(report2)
	assert_equal(sut._report_queue.size(), 2, "Queue should have 2 reports")
	
	sut._remove_from_cache("test-001")
	
	assert_equal(sut._report_queue.size(), 1, "Queue should have 1 report after removal")
	assert_equal(sut._report_queue[0]["id"], "test-002", "Remaining report should be test-002")


func test_remove_from_cache_removes_last_report():
	var sut = load(BUG_REPORTER_PATH).new()
	add_child(sut)
	
	sut._cache_dir = "user://bug_reporter_test_cache/"
	DirAccess.make_dir_absolute(sut._cache_dir)
	
	var report := {"id": "test-001", "type": "crash"}
	sut._save_to_cache(report)
	assert_equal(sut._report_queue.size(), 1, "Queue should have 1 report")
	
	sut._remove_from_cache("test-001")
	
	assert_equal(sut._report_queue.size(), 0, "Queue should be empty after removing last report")


func test_remove_from_cache_nonexistent_id_does_nothing():
	var sut = load(BUG_REPORTER_PATH).new()
	add_child(sut)
	
	sut._cache_dir = "user://bug_reporter_test_cache/"
	DirAccess.make_dir_absolute(sut._cache_dir)
	
	var report := {"id": "test-001", "type": "crash"}
	sut._save_to_cache(report)
	assert_equal(sut._report_queue.size(), 1, "Queue should have 1 report")
	
	sut._remove_from_cache("nonexistent-id")
	
	assert_equal(sut._report_queue.size(), 1, "Queue should still have 1 report after removing nonexistent ID")


# ── Test: _save_to_cache appends to existing queue ─────────────────────────

func test_save_to_cache_appends_to_existing():
	var sut = load(BUG_REPORTER_PATH).new()
	add_child(sut)
	
	sut._cache_dir = "user://bug_reporter_test_cache/"
	DirAccess.make_dir_absolute(sut._cache_dir)
	
	var report1 := {"id": "test-001", "type": "crash"}
	var report2 := {"id": "test-002", "type": "error"}
	sut._save_to_cache(report1)
	sut._save_to_cache(report2)
	
	assert_equal(sut._report_queue.size(), 2, "Queue should have 2 reports after two saves")
	assert_equal(sut._report_queue[0]["id"], "test-001", "First report should be test-001")
	assert_equal(sut._report_queue[1]["id"], "test-002", "Second report should be test-002")


# ── Test: _save_to_cache overwrites disk file on each save ────────────────

func test_save_to_cache_overwrites_disk_on_each_save():
	var sut = load(BUG_REPORTER_PATH).new()
	add_child(sut)
	
	sut._cache_dir = "user://bug_reporter_test_cache/"
	DirAccess.make_dir_absolute(sut._cache_dir)
	
	# Save first report
	var report1 := {"id": "test-001", "type": "crash"}
	sut._save_to_cache(report1)
	
	# Replace the in-memory queue (simulating a fresh load)
	sut._report_queue = []
	
	# Load from disk — should get test-001 back
	sut._load_cache_queue()
	
	assert_equal(sut._report_queue.size(), 1, "Should have loaded test-001 from disk")
	assert_equal(sut._report_queue[0]["id"], "test-001", "Loaded report ID should be test-001")
