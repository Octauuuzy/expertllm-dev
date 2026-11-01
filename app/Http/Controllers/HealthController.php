<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;

class HealthController extends Controller
{
    /**
     * Lightweight liveness payload for the frontend's status checks.
     */
    public function scraperStatus(): JsonResponse
    {
        return response()->json([
            'status' => 'ok',
            'scraper' => 'ready',
            'browser' => ['maxConcurrency' => 0],
            'uptime' => (int) round(microtime(true) - (float) $_SERVER['REQUEST_TIME_FLOAT']),
        ]);
    }
}
