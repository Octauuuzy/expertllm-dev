<?php

return [

    /*
    |--------------------------------------------------------------------------
    | Third Party Services
    |--------------------------------------------------------------------------
    |
    | This file is for storing the credentials for third party services such
    | as Resend, Postmark, AWS, and more. This file provides the de facto
    | location for this type of information, allowing packages to have
    | a conventional file to locate the various service credentials.
    |
    */

    'postmark' => [
        'key' => env('POSTMARK_API_KEY'),
    ],

    'resend' => [
        'key' => env('RESEND_API_KEY'),
    ],

    'ses' => [
        'key' => env('AWS_ACCESS_KEY_ID'),
        'secret' => env('AWS_SECRET_ACCESS_KEY'),
        'region' => env('AWS_DEFAULT_REGION', 'us-east-1'),
    ],

    'slack' => [
        'notifications' => [
            'bot_user_oauth_token' => env('SLACK_BOT_USER_OAUTH_TOKEN'),
            'channel' => env('SLACK_BOT_USER_DEFAULT_CHANNEL'),
        ],
    ],

    /*
    |--------------------------------------------------------------------------
    | AI providers proxied by the backend
    |--------------------------------------------------------------------------
    |
    | The frontend never sees these keys. `/vertex-proxy` mints its own OAuth
    | token (metadata server or service account); `/chat/completions` forwards
    | to OpenRouter/Chutes with the matching key attached server-side.
    |
    */

    'vertex' => [
        'project_id' => env('VERTEX_PROJECT_ID', env('GOOGLE_CLOUD_PROJECT')),
        'service_account_json' => env('VERTEX_SERVICE_ACCOUNT_JSON', env('GOOGLE_APPLICATION_CREDENTIALS_JSON')),
        'credentials_path' => env('GOOGLE_APPLICATION_CREDENTIALS'),
        'use_metadata_server' => (bool) env('USE_METADATA_SERVER', true),
    ],

    'openrouter' => [
        'api_key' => env('OPENROUTER_API_KEY'),
    ],

    'chutes' => [
        'api_key' => env('CHUTES_API_KEY'),
    ],

    /*
    |--------------------------------------------------------------------------
    | Google Programmable Search
    |--------------------------------------------------------------------------
    |
    | GOOGLE_SEARCH_KEYS is an optional JSON array of {apiKey, cx} pairs used
    | for key rotation; GOOGLE_SEARCH_API_KEY/GOOGLE_SEARCH_CX is a single key.
    |
    */

    'google_search' => [
        'keys_json' => env('GOOGLE_SEARCH_KEYS'),
        'api_key' => env('GOOGLE_SEARCH_API_KEY'),
        'cx' => env('GOOGLE_SEARCH_CX'),
    ],

];
