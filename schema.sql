CREATE TABLE IF NOT EXISTS reports (
    id VARCHAR(64) PRIMARY KEY,
    created_at DATETIME NOT NULL,
    category VARCHAR(32) NOT NULL,
    description TEXT NOT NULL,
    repro_steps TEXT NULL,
    contact VARCHAR(200) NULL,
    device_info TEXT NULL,
    app_version VARCHAR(100) NULL,
    scene_context VARCHAR(200) NULL,
    log_tail MEDIUMTEXT NULL,
    screenshot_path VARCHAR(255) NULL,
    INDEX idx_reports_created_at (created_at),
    INDEX idx_reports_category (category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- per-IP request counts, keyed to the top of the hour — the strict rate
-- limit (see lib/ratelimit.php) reads/writes this on every intake request
CREATE TABLE IF NOT EXISTS intake_rate_limit (
    ip_hash CHAR(64) NOT NULL,
    window_start DATETIME NOT NULL,
    request_count INT NOT NULL DEFAULT 0,
    PRIMARY KEY (ip_hash, window_start)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
