"""Bug Catcher web server test configuration.

Fixtures and helpers shared across all web server tests.
"""

import json
import sys
import tempfile
import shutil
from pathlib import Path

import pytest

# Ensure the app module is importable from tests directory
sys.path.insert(0, str(Path(__file__).parent.parent / "app"))


@pytest.fixture(scope="function")
def db_path():
    """Create a temporary database path for testing."""
    test_dir = tempfile.mkdtemp()
    test_db_path = Path(test_dir) / "bug_catcher_test.db"
    test_upload_dir = Path(test_dir) / "uploads"
    
    yield test_db_path, test_upload_dir
    
    shutil.rmtree(test_dir, ignore_errors=True)


@pytest.fixture(scope="function")
def patched_paths(db_path):
    """Patch DB_PATH and UPLOAD_DIR to use temp directories."""
    import main as main_module
    original_db = main_module.DB_PATH
    original_upload = main_module.UPLOAD_DIR
    
    test_db_path, test_upload_dir = db_path
    main_module.DB_PATH = test_db_path
    main_module.UPLOAD_DIR = test_upload_dir
    
    yield main_module
    
    # Restore original paths
    main_module.DB_PATH = original_db
    main_module.UPLOAD_DIR = original_upload


@pytest.fixture(scope="function")
def client(patched_paths):
    """Create a test client with a fresh in-memory database."""
    from fastapi.testclient import TestClient
    from main import app, init_db
    
    # Initialize the database
    init_db()
    
    test_client = TestClient(app)
    yield test_client


@pytest.fixture(scope="function")
def sample_report():
    """Return a valid report payload."""
    return {
        "id": "test-report-001",
        "session_id": "test-session-abc123",
        "game_name": "TestGame",
        "game_version": "0.1.0",
        "build_hash": "abc123def",
        "timestamp": "2026-01-15T10:30:00",
        "report_type": "crash",
        "title": "Test crash report",
        "description": "A test description",
        "stack_trace": "at TestClass.test_method() line 42\nat Main._ready() line 10",
        "scene": "test_scene",
        "player_position_x": 10.0,
        "player_position_y": 20.0,
        "hardware_json": json.dumps({"os": "Windows 10", "gpu": "NVIDIA GTX 1060"}),
        "performance_json": json.dumps({"fps": 60.0, "frame_time_ms": 16.67}),
        "screenshot_path": "",
        "logs_attached": False,
        "log_path": None,
        "hardware_opt_in": True,
        "created_at": "2026-01-15T10:30:00"
    }


@pytest.fixture(scope="function")
def populated_db(client):
    """Create a client with some pre-populated reports."""
    report1 = {
        "id": "report-crash-001",
        "session_id": "sess-001",
        "game_name": "TestGame",
        "game_version": "0.1.0",
        "build_hash": "abc",
        "timestamp": "2026-01-15T10:00:00",
        "report_type": "crash",
        "title": "Crash in inventory",
        "description": "Game crashes when opening inventory",
        "stack_trace": "at Inventory.open() line 89\nat Player.interact() line 42",
        "scene": "level_01",
        "player_position_x": 100.0,
        "player_position_y": 50.0,
        "hardware_json": json.dumps({"os": "Linux"}),
        "performance_json": json.dumps({"fps": 30.0}),
        "screenshot_path": "",
        "logs_attached": False,
        "log_path": None,
        "hardware_opt_in": True,
        "created_at": "2026-01-15T10:00:00"
    }
    report2 = {
        "id": "report-error-001",
        "session_id": "sess-002",
        "game_name": "TestGame",
        "game_version": "0.1.0",
        "build_hash": "abc",
        "timestamp": "2026-01-15T11:00:00",
        "report_type": "error",
        "title": "Null reference in collision",
        "description": "Collision detection fails on player object",
        "stack_trace": "at CollisionSystem.check() line 234\nat PhysicsStep.step() line 100",
        "scene": "level_03",
        "player_position_x": 200.0,
        "player_position_y": 100.0,
        "hardware_json": json.dumps({"os": "Windows 10"}),
        "performance_json": json.dumps({"fps": 55.0}),
        "screenshot_path": "",
        "logs_attached": False,
        "log_path": None,
        "hardware_opt_in": True,
        "created_at": "2026-01-15T11:00:00"
    }
    report3 = {
        "id": "report-feedback-001",
        "session_id": "sess-003",
        "game_name": "TestGame",
        "game_version": "0.1.0",
        "build_hash": "abc",
        "timestamp": "2026-01-15T12:00:00",
        "report_type": "feedback",
        "title": "UI suggestion",
        "description": "Inventory UI is hard to navigate",
        "stack_trace": "",
        "scene": "inventory_menu",
        "player_position_x": None,
        "player_position_y": None,
        "hardware_json": json.dumps({"os": "macOS"}),
        "performance_json": json.dumps({"fps": 60.0}),
        "screenshot_path": "",
        "logs_attached": False,
        "log_path": None,
        "hardware_opt_in": True,
        "created_at": "2026-01-15T12:00:00"
    }
    
    resp1 = client.post("/api/v1/report", json=report1)
    assert resp1.status_code == 200
    
    resp2 = client.post("/api/v1/report", json=report2)
    assert resp2.status_code == 200
    
    resp3 = client.post("/api/v1/report", json=report3)
    assert resp3.status_code == 200
    
    return [report1, report2, report3]
