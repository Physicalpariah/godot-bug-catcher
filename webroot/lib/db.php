<?php
declare(strict_types=1);

function bugcatcher_config(): array {
    static $config = null;
    if ($config === null) {
        // one level above webroot/ — see config.example.php for why
        $config = require __DIR__ . '/../../config.php';
    }
    return $config;
}

function bugcatcher_db(): PDO {
    static $pdo = null;
    if ($pdo === null) {
        $cfg = bugcatcher_config();
        $dsn = sprintf('mysql:host=%s;dbname=%s;charset=utf8mb4', $cfg['db_host'], $cfg['db_name']);
        $pdo = new PDO($dsn, $cfg['db_user'], $cfg['db_pass'], [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]);
    }
    return $pdo;
}
