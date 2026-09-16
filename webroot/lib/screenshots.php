<?php
declare(strict_types=1);

// stored outside webroot/ (sibling of config.php) so nothing here is ever
// reachable by guessing a URL — only the bearer-token-protected read endpoint
// can hand a screenshot back out, base64-encoded in its JSON response
function bugcatcher_screenshot_dir(): string {
    $dir = __DIR__ . '/../../screenshots';
    if (!is_dir($dir)) {
        mkdir($dir, 0750, true);
    }
    return $dir;
}

function bugcatcher_store_screenshot(string $reportId, string $pngBytes): string {
    $safeId = preg_replace('/[^a-zA-Z0-9_\-.]/', '_', $reportId);
    $relativePath = $safeId . '.png';
    file_put_contents(bugcatcher_screenshot_dir() . '/' . $relativePath, $pngBytes);
    return $relativePath;
}

function bugcatcher_load_screenshot(string $relativePath): ?string {
    $path = bugcatcher_screenshot_dir() . '/' . basename($relativePath);
    if (!is_file($path)) return null;
    return base64_encode(file_get_contents($path));
}
