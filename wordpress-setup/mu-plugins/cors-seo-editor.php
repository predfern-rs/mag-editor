<?php
/**
 * CORS headers for the MAG SEO Editor app.
 * Allows cross-origin requests from the editor to the WordPress REST API.
 *
 * Upload to: wp-content/mu-plugins/cors-seo-editor.php
 */

add_action('init', function () {
    $allowed_origins = [
        'https://mag-editor.pages.dev',
        'http://localhost:5173',
        'http://localhost:4173',
    ];

    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';

    if (in_array($origin, $allowed_origins, true)) {
        header("Access-Control-Allow-Origin: $origin");
        header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
        header('Access-Control-Allow-Headers: Authorization, Content-Type');
        header('Access-Control-Allow-Credentials: true');

        if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
            http_response_code(204);
            exit;
        }
    }
});
