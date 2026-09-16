<?php
declare(strict_types=1);

function bugcatcher_json_response(int $status, array $body): void {
    http_response_code($status);
    header('Content-Type: application/json');
    echo json_encode($body);
    exit;
}

function bugcatcher_require_https(): void {
    $isHttps = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
    if (!$isHttps) {
        bugcatcher_json_response(400, ['error' => 'https required']);
    }
}

function bugcatcher_require_method(string $method): void {
    if (($_SERVER['REQUEST_METHOD'] ?? '') !== $method) {
        bugcatcher_json_response(405, ['error' => 'method not allowed']);
    }
}

// caps the body BEFORE json_decode ever sees it — the size cap is the real
// defense, not something json_decode can be trusted to enforce on its own
function bugcatcher_read_json_body(int $maxBytes): array {
    $raw = file_get_contents('php://input', false, null, 0, $maxBytes + 1);
    if ($raw === false || strlen($raw) > $maxBytes) {
        bugcatcher_json_response(413, ['error' => 'payload too large']);
    }
    $data = json_decode($raw, true);
    if (!is_array($data)) {
        bugcatcher_json_response(400, ['error' => 'invalid json']);
    }
    return $data;
}

// real auth for the processor's read-only pull — distinct from the client's
// soft token, which only guards public intake and is not a secret
function bugcatcher_require_bearer_token(): void {
    $cfg = bugcatcher_config();
    $header = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
    if (!preg_match('/^Bearer\s+(.+)$/i', $header, $matches) || !hash_equals($cfg['bearer_token'], $matches[1])) {
        bugcatcher_json_response(401, ['error' => 'unauthorized']);
    }
}

function bugcatcher_require_client_token(): void {
    $cfg = bugcatcher_config();
    $token = $_SERVER['HTTP_X_CLIENT_TOKEN'] ?? '';
    if (!hash_equals($cfg['client_soft_token'], $token)) {
        bugcatcher_json_response(401, ['error' => 'missing or invalid client token']);
    }
}
