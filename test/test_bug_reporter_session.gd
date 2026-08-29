"""Tests for BugReporter session ID generation.

Verifies that:
- get_session_id() returns a non-empty string
- Multiple calls return the same session ID (persistence)
- The session ID is a valid UUID format
"""

extends GutTest

const BUG_REPORTER_PATH := "res://addons/bug_reporter/bug_reporter.gd"


# ── Test: get_session_id returns non-empty string ──────────────────────────

func test_get_session_id_returns_non_empty_string():
	var sut = load(BUG_REPORTER_PATH).new()
	add_child(sut)
	
	sut._cache_dir = "user://bug_reporter_test_cache/"
	DirAccess.make_dir_absolute(sut._cache_dir)
	sut._session_id = ""  # Force regeneration
	
	var session_id := sut.get_session_id()
	
	assert_not_equal(session_id, "", "Session ID should not be empty")
	assert_true(typeof(session_id) == TYPE_STRING, "Session ID should be a string")


func test_get_session_id_returns_valid_uuid_format():
	var sut = load(BUG_REPORTER_PATH).new()
	add_child(sut)
	
	sut._cache_dir = "user://bug_reporter_test_cache/"
	DirAccess.make_dir_absolute(sut._cache_dir)
	sut._session_id = ""  # Force regeneration
	
	var session_id := sut.get_session_id()
	
	# UUID format: xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx (36 chars, 8-4-4-4-12)
	assert_equal(session_id.length(), 36, "Session ID should be 36 characters (UUID format)")
	assert_true("-" in session_id, "Session ID should contain hyphens")


func test_get_session_id_is_persistent():
	var sut = load(BUG_REPORTER_PATH).new()
	add_child(sut)
	
	sut._cache_dir = "user://bug_reporter_test_cache/"
	DirAccess.make_dir_absolute(sut._cache_dir)
	sut._session_id = ""  # Force regeneration
	
	var session_id_1 := sut.get_session_id()
	var session_id_2 := sut.get_session_id()
	
	assert_equal(session_id_1, session_id_2, "Multiple calls should return the same session ID")


func test_get_session_id_is_unique_per_instance():
	var sut1 = load(BUG_REPORTER_PATH).new()
	add_child(sut1)
	sut1._cache_dir = "user://bug_reporter_test_cache/"
	DirAccess.make_dir_absolute(sut1._cache_dir)
	sut1._session_id = ""
	
	var sut2 = load(BUG_REPORTER_PATH).new()
	add_child(sut2)
	sut2._cache_dir = "user://bug_reporter_test_cache/"
	DirAccess.make_dir_absolute(sut2._cache_dir)
	sut2._session_id = ""
	
	var session_id_1 := sut1.get_session_id()
	var session_id_2 := sut2.get_session_id()
	
	assert_not_equal(session_id_1, session_id_2, "Different instances should have different session IDs")


func test_get_session_id_returns_same_after_reload():
	var sut = load(BUG_REPORTER_PATH).new()
	add_child(sut)
	
	sut._cache_dir = "user://bug_reporter_test_cache/"
	DirAccess.make_dir_absolute(sut._cache_dir)
	sut._session_id = ""  # Force regeneration
	
	var session_id_1 := sut.get_session_id()
	
	# Simulate reload by clearing the in-memory value but keeping the file
	sut._session_id = ""
	
	var session_id_2 := sut.get_session_id()
	
	assert_equal(session_id_1, session_id_2, "Session ID should persist across 'reload'")
