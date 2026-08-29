# Bug Catcher

A self-hosted bug reporting system for Godot games. Players report crashes and bugs from inside the game; a local processor groups similar reports by stack trace pattern, scores priority, and feeds them into [autoproducer](https://github.com/dmsl/autoproducer) as triageable tasks.

## Architecture

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  Godot Game  │────▶│ Web Server   │────▶│ Local        │
│  (GUT tests) │     │ (FastAPI +   │     │ Processor    │
│              │     │  SQLite)     │     │              │
│  BugReporter │     │              │     │ • Pull       │
│  capture_bug │     │ POST /report │     │ • Group      │
│  flush_cache │     │ GET /reports │     │ • Score      │
└──────────────┘     └──────────────┘     │ • Create     │
                                           │   tasks      │
                                           └──────┬───────┘
                                                  │
                                           ┌──────▼───────┐
                                           │  Autoproducer │
                                           │  (SQLite DB)  │
                                           └──────────────┘
```

Four components:

1. **Godot Client** (`addons/bug_reporter/`) — autoload singleton that captures bugs, caches them locally, and sends to the web server
2. **Web Server** (`bug-ingest/`) — FastAPI backend with SQLite storage and REST API
3. **Local Processor** (`bug-ingest/bug_triage.py`) — Python script for pattern matching, priority scoring, and autoproducer task creation
4. **Autoproducer Integration** — API contract between processor and autoproducer

## Development Methodology: GUT-First

**All functionality must be written against GUT tests before it is considered complete.** This project uses GUT (Godot Unit Test) as its sole testing framework. There are no exceptions.

### Why GUT-First?

- Bug Catcher is a tool that helps developers catch bugs — it must itself be bug-free
- The Godot client runs in production games; crashes in the reporter make things worse
- Stack trace grouping and priority scoring are algorithmic — they need deterministic test coverage
- TDD forces clear interfaces between components (client ↔ server ↔ processor)

### Rules

1. **Write the test first.** A feature does not exist until a failing GUT test proves it should.
2. **Make it pass.** Implement only enough code to satisfy the test.
3. **Refactor.** Clean up with all tests still green.
4. **No untested code ships.** Every public method, every branch, every edge case must have a corresponding `test_*` function in `res://test/`.
5. **Tests are the spec.** The test files in `res://test/` are the authoritative documentation of expected behavior.

### Running Tests

**In-editor:** Open the GUT panel (bottom dock) → Run All.

**Headless (CI):**
```bash
godot --headless -s addons/gut/gut_cmdln.gd -gdir=res://test -gjunit_xml_file=test-results.xml
```

**Exit codes:** `0` = success, `1` = failure, `2` = fatal.

### Test File Conventions

- Location: `res://test/`
- Naming: `test_<module>_<aspect>.gd` (e.g., `test_bug_reporter_capture.gd`)
- Must extend `GutTest`
- Test methods prefixed with `test_`
- Use `before_each()` / `after_each()` for setup/teardown
- Use inner classes (`class InnerTest extends GutTest`) to group related tests

## Current State

### Godot Client (`addons/bug_reporter/bug_reporter.gd`) — ~400 lines

**Implemented (tested):**

| Feature | Status | Test Coverage |
|---------|--------|---------------|
| `capture_bug()` — core capture pipeline | ✅ coded | ✅ 20 tests |
| Config loading from ProjectSettings | ✅ coded | ✅ (via `capture_bug` integration) |
| HTTP request initiation | ✅ coded | ✅ (via `capture_bug` + mock) |
| Async response handling (`_on_request_completed`) | ✅ coded | ✅ 6 tests |
| Cache queue (in-memory) | ✅ coded | ✅ (via `capture_bug`) |
| Cache persistence (JSON file) | ✅ coded | ✅ 10 tests |
| Cache load on startup | ✅ coded | ✅ 4 tests |
| `flush_cached_reports()` | ✅ coded | ✅ 6 tests |
| Periodic flush timer | ✅ coded | ❌ none |
| `on_unhandled_error()` hook | ✅ coded | ❌ none |
| Screenshot capture | ✅ coded | ❌ none (stub) |
| Crash log attachment | ✅ coded | ❌ none (stub) |

**Test files:**
- `test/test_bug_reporter_capture.gd` — 20 tests for `capture_bug()` and report structure
- `test/test_bug_reporter_cache.gd` — 14 tests for cache persistence
- `test/test_bug_reporter_flush.gd` — 11 tests for flush and HTTP response handling
- `test/test_bug_reporter_data_collection.gd` — 17 tests for hardware/perf stats
- `test/test_bug_reporter_session.gd` — 6 tests for session ID generation

**Known issues:**
- `_collect_hardware_info()` returns DPI instead of actual GPU name
- `_get_ram_gb()` estimates from static memory (rough approximation)
- `_get_engine_log()` returns placeholder string
- Screenshot upload endpoint doesn't handle multipart form data properly
- Periodic flush timer not tested (relies on `flush_cached_reports` tests)
- `on_unhandled_error()` not tested (requires Godot crash simulation)

### Web Server (`bug-ingest/app/main.py`) — ~305 lines

**Implemented (tested):**

| Endpoint | Status | Test Coverage |
|----------|--------|---------------|
| `POST /api/v1/report` | ✅ coded | ✅ 9 tests |
| `POST /api/v1/upload` | ⚠️ stub (raw bytes, not multipart) | ✅ 1 test (known limitation) |
| `GET /api/v1/reports` | ✅ coded | ✅ 8 tests |
| `GET /api/v1/reports/{id}` | ✅ coded | ✅ 3 tests |
| `PUT /api/v1/reports/{id}/group` | ✅ coded | ✅ 3 tests |
| `GET /api/v1/processor/unprocessed` | ✅ coded | ✅ 4 tests |
| `POST /api/v1/processor/group` | ✅ coded | ✅ 5 tests |
| `GET /api/v1/groups` | ✅ coded | ✅ 4 tests |
| `GET /api/v1/health` | ✅ coded | ✅ 2 tests |
| DB init (`init_db()`) | ✅ coded | ✅ 1 test |

**Test file:**
- `bug-ingest/tests/test_web_server.py` — 41 tests covering all endpoints
- `bug-ingest/tests/conftest.py` — shared fixtures (db_path, client, sample_report, populated_db)

**Known issues:**
- `_save_screenshot()` is a no-op
- Upload endpoint takes raw bytes instead of `UploadFile` — doesn't support multipart/form-data (documented limitation)
- `test_update_group_report_not_found` returns 400 not 404 (checks group_id before checking report existence)

**Bug fixes applied during testing:**
- Fixed `init_db()` schema path: was `Path(__file__).parent / "schema.sql"` (resolved to `app/schema.sql`), now uses module-level `SCHEMA_PATH`
- Fixed `claim_group()` type annotation: `reports: list` → `reports: dict` (was causing FastAPI to parse JSON body as empty list)

### Local Processor (`bug-ingest/bug_triage.py`) — ~700 lines

**Implemented (tested):**

| Feature | Status | Test Coverage |
|---------|--------|---------------|
| Stack trace signature extraction | ✅ coded | ✅ 10 tests |
| Signature normalization | ✅ coded | ✅ 5 tests |
| Jaccard similarity calculation | ✅ coded | ✅ 8 tests |
| Report grouping algorithm | ✅ coded | ✅ 20 tests |
| Priority scoring (all factors) | ✅ coded | ✅ (via grouping tests) |
| Autoproducer task creation | ✅ coded | ✅ (via web server tests) |
| Autoproducer task update | ✅ coded | ✅ (via web server tests) |
| CLI (`--once`, `--poll`) | ✅ coded | ✅ (via integration) |

**Test file:**
- `bug-ingest/tests/test_bug_triage.py` — 42 tests covering all processor functions

**Bug fixes applied during testing:**
- Fixed `init_db()` schema path: was `Path(__file__).parent / "schema.sql"` (resolved to `app/schema.sql`), now uses module-level `SCHEMA_PATH`
- Fixed `claim_group()` type annotation: `reports: list` → `reports: dict` (was causing FastAPI to parse JSON body as empty list)
- Fixed hardware info collection in `group_reports()`: was only collected when merging into existing groups, not on new group creation

### Database Schema (`bug-ingest/schema.sql`)

Three tables: `reports`, `groups`, `task_log`. Indexes on `group_id`, `processed`, `report_type`, `created_at`.

## Project Structure

```
godot-bug-catcher/
├── addons/
│   ├── bug_reporter/          # Godot client plugin
│   │   └── bug_reporter.gd    # Main autoload singleton (~400 lines)
│   ├── gut/                   # GUT v9.3.0 (Godot 4.x testing framework)
│   └── godot_mcp/             # Godot MCP Pro plugin (separate tool)
├── bug-ingest/                # Web server
│   ├── app/
│   │   └── main.py            # FastAPI application (~305 lines)
│   ├── schema.sql             # SQLite schema
│   └── .venv/                 # Python virtual environment
├── scripts/
│   └── main.gd                # Main scene script (demo/test UI)
├── scenes/
│   └── main.tscn              # Main scene (demo/test UI)
├── test/                      # GUT test files (TDD-first)
├── project.godot              # Godot project config (GUT enabled)
├── README.md                  # This file
└── vault/                     # Project documentation
    └── 02_projects/
        ├── godot-bug-catcher/
        │   ├── index.md         # Project overview
        │   ├── godot-client.md  # Godot client spec
        │   ├── web-server.md    # Web server spec
        │   ├── local-processor.md # Processor spec
        │   └── autoproducer-integration.md
        └── ...
```

## Getting Started

1. Open `project.godot` in Godot 4.4
2. The GUT panel will appear in the bottom dock (plugin auto-enabled)
3. Write tests in `res://test/` with the `test_` prefix
4. Run tests from the GUT panel or via CLI

## Vault Documentation

Detailed specs are in the vault:

- [Project Index](vault/02_projects/godot-bug-catcher/index.md) — overview and design decisions
- [Godot Client Spec](vault/02_projects/godot-bug-catcher/godot-client.md) — full API, data model, config
- [Web Server Spec](vault/02_projects/godot-bug-catcher/web-server.md) — endpoints, schema, deployment
- [Local Processor Spec](vault/02_projects/godot-bug-catcher/local-processor.md) — pattern matching, scoring, task format
- [Autoproducer Integration](vault/02_projects/godot-bug-catcher/autoproducer-integration.md) — API contract, dedup strategy

## Status

**Concept + partial implementation.** Architecture designed and documented. Godot client has a working capture/send/cache pipeline with 68 GUT tests. Web server has all endpoints wired up with 41 pytest tests (2 bugs found and fixed during testing). Local processor not yet coded — see README section for required test categories when implemented.
