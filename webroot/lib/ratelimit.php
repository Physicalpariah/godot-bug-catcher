<?php
declare(strict_types=1);

// per-IP, per-hour, enforced in the database rather than in-memory since
// PHP-per-request on shared hosting has no long-lived process to hold state in.
// IPs are hashed before storage — rate limiting only needs equality, not the
// raw address, and this keeps the same privacy-minded default as everything else.
function bugcatcher_check_rate_limit(PDO $db, string $ip, int $maxPerHour): void {
    $ipHash = hash('sha256', $ip);
    $windowStart = gmdate('Y-m-d H:00:00');

    $upsert = $db->prepare(
        'INSERT INTO intake_rate_limit (ip_hash, window_start, request_count)
         VALUES (:ip_hash, :window_start, 1)
         ON DUPLICATE KEY UPDATE request_count = request_count + 1'
    );
    $upsert->execute(['ip_hash' => $ipHash, 'window_start' => $windowStart]);

    $select = $db->prepare(
        'SELECT request_count FROM intake_rate_limit WHERE ip_hash = :ip_hash AND window_start = :window_start'
    );
    $select->execute(['ip_hash' => $ipHash, 'window_start' => $windowStart]);
    $count = (int) $select->fetchColumn();

    if ($count > $maxPerHour) {
        bugcatcher_json_response(429, ['error' => 'rate limit exceeded, try again later']);
    }
}
