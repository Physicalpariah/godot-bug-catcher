<?php
declare(strict_types=1);

// Single endpoint, split by method:
//   POST /api/reports.php  — public intake, from the Godot client
//   GET  /api/reports.php  — bearer-token-only read, for the local processor
// There is no PATCH/status write here by design — Auto-Producer is the only
// place triage status lives, so nothing needs to be written back to this service.

require __DIR__ . '/../lib/db.php';
require __DIR__ . '/../lib/http.php';
require __DIR__ . '/../lib/ratelimit.php';
require __DIR__ . '/../lib/validate.php';
require __DIR__ . '/../lib/screenshots.php';

// strict per user's choice — generous enough for a real player filing a
// couple of reports in one session, tight enough to bound worst-case abuse
const MAX_REPORTS_PER_HOUR_PER_IP = 5;
const MAX_REQUEST_BYTES = 3 * 1024 * 1024; // JSON body, screenshot base64 included

bugcatcher_require_https();

$method = $_SERVER['REQUEST_METHOD'] ?? '';
if ($method === 'POST') {
    bugcatcher_handle_intake();
} elseif ($method === 'GET') {
    bugcatcher_handle_read();
} else {
    bugcatcher_json_response(405, ['error' => 'method not allowed']);
}

function bugcatcher_handle_intake(): void {
    bugcatcher_require_client_token();

    $db = bugcatcher_db();
    $ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
    bugcatcher_check_rate_limit($db, $ip, MAX_REPORTS_PER_HOUR_PER_IP);

    $data = bugcatcher_read_json_body(MAX_REQUEST_BYTES);

    $reportId = $data['id'] ?? null;
    if (!is_string($reportId) || $reportId === '' || strlen($reportId) > 64) {
        bugcatcher_json_response(400, ['error' => 'id is required and must be at most 64 characters']);
    }

    $category = bugcatcher_validate_category(bugcatcher_require_string($data, 'category', 32));
    $description = bugcatcher_require_string($data, 'description', BUGCATCHER_MAX_TEXT_LENGTH);
    $reproSteps = bugcatcher_require_string($data, 'repro_steps', BUGCATCHER_MAX_TEXT_LENGTH, false);
    $contact = bugcatcher_require_string($data, 'contact', 200, false);
    $appVersion = bugcatcher_require_string($data, 'app_version', 100, false);
    $sceneContext = bugcatcher_require_string($data, 'scene_context', 200, false);

    $deviceInfo = isset($data['device_info']) && is_array($data['device_info'])
        ? json_encode($data['device_info'])
        : null;
    $logTail = bugcatcher_validate_log_tail($data['log_tail'] ?? null);
    $stackTrace = bugcatcher_require_string($data, 'stack_trace', BUGCATCHER_MAX_STACK_TRACE_LENGTH, false);
    $screenshotBytes = bugcatcher_validate_screenshot($data['screenshot_base64'] ?? null);

    $screenshotPath = $screenshotBytes !== null
        ? bugcatcher_store_screenshot($reportId, $screenshotBytes)
        : null;

    // ON DUPLICATE KEY UPDATE id = id: a no-op update, not a real change —
    // makes retries of an already-cached report idempotent instead of erroring
    $stmt = $db->prepare(
        'INSERT INTO reports
            (id, created_at, category, description, repro_steps, contact,
             device_info, app_version, scene_context, log_tail, stack_trace, screenshot_path)
         VALUES
            (:id, NOW(), :category, :description, :repro_steps, :contact,
             :device_info, :app_version, :scene_context, :log_tail, :stack_trace, :screenshot_path)
         ON DUPLICATE KEY UPDATE id = id'
    );
    $stmt->execute([
        'id' => $reportId,
        'category' => $category,
        'description' => $description,
        'repro_steps' => $reproSteps !== '' ? $reproSteps : null,
        'contact' => $contact !== '' ? $contact : null,
        'device_info' => $deviceInfo,
        'app_version' => $appVersion !== '' ? $appVersion : null,
        'scene_context' => $sceneContext !== '' ? $sceneContext : null,
        'log_tail' => $logTail,
        'stack_trace' => $stackTrace !== '' ? $stackTrace : null,
        'screenshot_path' => $screenshotPath,
    ]);

    bugcatcher_json_response(201, ['id' => $reportId, 'status' => 'received']);
}

function bugcatcher_handle_read(): void {
    bugcatcher_require_bearer_token();

    $db = bugcatcher_db();
    $since = $_GET['since'] ?? null;

    if ($since !== null && !preg_match('/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/', $since)) {
        bugcatcher_json_response(400, ['error' => 'since must be formatted as YYYY-MM-DD HH:MM:SS']);
    }

    $sql = 'SELECT id, created_at, category, description, repro_steps, contact,
                   device_info, app_version, scene_context, log_tail, stack_trace, screenshot_path
            FROM reports';
    $params = [];
    if ($since !== null) {
        $sql .= ' WHERE created_at > :since';
        $params['since'] = $since;
    }
    $sql .= ' ORDER BY created_at ASC LIMIT 500';

    $stmt = $db->prepare($sql);
    $stmt->execute($params);
    $reports = $stmt->fetchAll();

    foreach ($reports as &$report) {
        $report['screenshot_base64'] = $report['screenshot_path'] !== null
            ? bugcatcher_load_screenshot($report['screenshot_path'])
            : null;
        unset($report['screenshot_path']);

        $report['device_info'] = $report['device_info'] !== null
            ? json_decode($report['device_info'], true)
            : null;
    }
    unset($report);

    bugcatcher_json_response(200, ['reports' => $reports]);
}
