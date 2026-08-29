-- Bug Catcher database schema

CREATE TABLE IF NOT EXISTS reports (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    game_name TEXT NOT NULL,
    game_version TEXT NOT NULL,
    build_hash TEXT,
    timestamp TEXT NOT NULL,
    report_type TEXT NOT NULL,  -- 'crash' | 'error' | 'feedback'
    title TEXT NOT NULL,
    description TEXT,
    stack_trace TEXT,
    scene TEXT,
    player_position_x REAL,
    player_position_y REAL,
    hardware_json TEXT,          -- JSON blob of hardware info
    performance_json TEXT,       -- JSON blob of perf stats
    screenshot_path TEXT,        -- relative path on server
    logs_attached INTEGER DEFAULT 0,
    log_path TEXT,
    hardware_opt_in INTEGER DEFAULT 0,
    processed INTEGER DEFAULT 0,
    group_id TEXT,               -- assigned by processor for grouping
    autoproducer_task_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_reports_group ON reports(group_id) WHERE group_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_reports_processed ON reports(processed);
CREATE INDEX IF NOT EXISTS idx_reports_type ON reports(report_type);
CREATE INDEX IF NOT EXISTS idx_reports_created ON reports(created_at);

-- Processor state: tracks which reports have been processed and grouped
CREATE TABLE IF NOT EXISTS groups (
    group_id TEXT PRIMARY KEY,
    representative_stack_trace TEXT NOT NULL,
    representative_title TEXT NOT NULL,
    report_count INTEGER DEFAULT 1,
    max_priority REAL DEFAULT 0.0,
    first_seen TEXT NOT NULL,
    last_seen TEXT NOT NULL,
    status TEXT DEFAULT 'new',   -- 'new' | 'reviewed' | 'resolved' | 'duplicate'
    autoproducer_task_id TEXT
);

-- Processor state: tracks which reports have been sent to autoproducer
CREATE TABLE IF NOT EXISTS task_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id TEXT NOT NULL,
    report_ids TEXT NOT NULL,    -- JSON array of report IDs in this batch
    autoproducer_task_id TEXT,
    status TEXT DEFAULT 'pending',  -- 'pending' | 'sent' | 'failed'
    created_at TEXT NOT NULL,
    FOREIGN KEY (group_id) REFERENCES groups(group_id)
);
