<?php
// Copy this file to config.php and upload it OUTSIDE the web-servable
// directory — one level above the folder Dreamhost serves for this domain
// (a sibling of webroot/, not inside it). That way it's simply unreachable
// over HTTP, not just hidden. Never commit the real config.php.
return [
    'db_host' => 'localhost',
    'db_name' => '',
    'db_user' => '',
    'db_pass' => '',

    // generate with: openssl rand -hex 32
    // protects the read-only GET /api/reports endpoint (the local processor)
    'bearer_token' => '',

    // matches Constants.BUGREPORT_CLIENT_SOFT_TOKEN in the Godot client.
    // deters casual/automated abuse only — it ships inside the game, so it
    // is not a real secret and must never guard anything sensitive on its own.
    'client_soft_token' => '',
];
