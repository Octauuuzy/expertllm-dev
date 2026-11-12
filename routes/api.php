<?php

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\ChatController;
use App\Http\Controllers\Api\FetchController;
use App\Http\Controllers\Api\ImageController;
use App\Http\Controllers\Api\ProxyController;
use App\Http\Controllers\Api\SearchController;
use App\Http\Controllers\Api\UserController;
use App\Http\Controllers\HealthController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| API Routes
|--------------------------------------------------------------------------
|
| Mounted at the site root (empty apiPrefix) because the ported frontend
| calls `/auth/login`, `/chat/message`, … directly. Every route is stateless
| and authenticated with a bearer token via the `auth.token` middleware.
|
| Note: `GET /` is owned by the web SPA route, not by this file.
|
*/

Route::get('/scraper-status', [HealthController::class, 'scraperStatus']);

Route::middleware('throttle:20,1')->group(function (): void {
    Route::post('/auth/register', [AuthController::class, 'register']);
    Route::post('/auth/login', [AuthController::class, 'login']);
});

Route::middleware('auth.token')->group(function (): void {
    Route::get('/user/me', [UserController::class, 'me']);
    Route::post('/user/preferences', [UserController::class, 'updatePreferences']);

    Route::get('/chat/sessions', [ChatController::class, 'sessions']);
    Route::delete('/chat/sessions/{id}', [ChatController::class, 'destroySession']);
    Route::post('/chat/message', [ChatController::class, 'storeMessage']);
    Route::get('/chat/history', [ChatController::class, 'history']);
    Route::delete('/chat/history', [ChatController::class, 'clearHistory']);

    Route::post('/images/save', [ImageController::class, 'saveGenerated']);
    Route::get('/images/last', [ImageController::class, 'last']);
    Route::get('/images/session', [ImageController::class, 'sessionImages']);
    Route::get('/images/uploaded', [ImageController::class, 'uploaded']);
    Route::post('/images/upload', [ImageController::class, 'saveUploaded']);
    Route::get('/images/uploaded/{id}', [ImageController::class, 'showUploaded']);
    Route::delete('/images/uploaded/{id}', [ImageController::class, 'destroyUploaded']);
    Route::get('/images/{id}', [ImageController::class, 'showGenerated']);
    Route::delete('/images/{id}', [ImageController::class, 'destroyGenerated']);

    Route::middleware('throttle:120,1')->group(function (): void {
        Route::post('/vertex-proxy', [ProxyController::class, 'vertex']);
        Route::post('/gemini-proxy', [ProxyController::class, 'gemini']);
        Route::post('/chat/completions', [ProxyController::class, 'completions']);
        Route::post('/search', [SearchController::class, 'search']);
        Route::post('/fetch-content', [FetchController::class, 'single']);
        Route::post('/fetch-content-batch', [FetchController::class, 'batch']);
    });
});
