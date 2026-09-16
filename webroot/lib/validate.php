<?php
declare(strict_types=1);

const BUGCATCHER_MAX_TEXT_LENGTH = 4000;
const BUGCATCHER_MAX_LOG_LINES = 300; // matches the Godot client's LogUtils ring buffer cap
const BUGCATCHER_MAX_LOG_LINE_LENGTH = 2000;
const BUGCATCHER_MAX_STACK_TRACE_LENGTH = 8000;
const BUGCATCHER_MAX_SCREENSHOT_BYTES = 2 * 1024 * 1024; // decoded PNG bytes
const BUGCATCHER_VALID_CATEGORIES = ['_crash', '_visual', '_gameplay', '_balance', '_performance', '_other'];

function bugcatcher_require_string(array $data, string $key, int $maxLength, bool $required = true): string {
    $value = $data[$key] ?? '';
    if (!is_string($value)) {
        bugcatcher_json_response(400, ['error' => "$key must be a string"]);
    }
    $value = trim($value);
    if ($required && $value === '') {
        bugcatcher_json_response(400, ['error' => "$key is required"]);
    }
    if (mb_strlen($value) > $maxLength) {
        bugcatcher_json_response(400, ['error' => "$key exceeds max length of $maxLength"]);
    }
    return $value;
}

function bugcatcher_validate_category(string $category): string {
    if (!in_array($category, BUGCATCHER_VALID_CATEGORIES, true)) {
        bugcatcher_json_response(400, ['error' => 'invalid category']);
    }
    return $category;
}

function bugcatcher_validate_log_tail(mixed $logTail): ?string {
    if ($logTail === null) return null;
    if (!is_array($logTail)) {
        bugcatcher_json_response(400, ['error' => 'log_tail must be an array of strings']);
    }
    if (count($logTail) > BUGCATCHER_MAX_LOG_LINES) {
        $logTail = array_slice($logTail, -BUGCATCHER_MAX_LOG_LINES);
    }
    $lines = [];
    foreach ($logTail as $line) {
        if (is_string($line)) {
            $lines[] = mb_substr($line, 0, BUGCATCHER_MAX_LOG_LINE_LENGTH);
        }
    }
    return implode("\n", $lines);
}

// checked as an actual image, not trusted off the base64/PNG-signature alone —
// a signature is trivial to fake, imagecreatefromstring() has to succeed on it
function bugcatcher_validate_screenshot(mixed $base64): ?string {
    if ($base64 === null) return null;
    if (!is_string($base64)) {
        bugcatcher_json_response(400, ['error' => 'screenshot_base64 must be a string']);
    }

    $decoded = base64_decode($base64, true);
    if ($decoded === false) {
        bugcatcher_json_response(400, ['error' => 'invalid base64 screenshot']);
    }
    if (strlen($decoded) > BUGCATCHER_MAX_SCREENSHOT_BYTES) {
        bugcatcher_json_response(413, ['error' => 'screenshot too large']);
    }

    $pngSignature = "\x89PNG\r\n\x1a\n";
    if (substr($decoded, 0, 8) !== $pngSignature) {
        bugcatcher_json_response(400, ['error' => 'screenshot is not a valid PNG']);
    }

    // imagedestroy() is a deliberate omission: it's a no-op since PHP 8.0
    // (GD images are refcounted/GC'd now) and calling it is deprecated as of
    // 8.5 — it would leak a deprecation notice into this JSON response
    if (@imagecreatefromstring($decoded) === false) {
        bugcatcher_json_response(400, ['error' => 'screenshot failed to decode as an image']);
    }

    return $decoded;
}
