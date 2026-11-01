<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\WebFetcher;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class FetchController extends Controller
{
    public function __construct(private readonly WebFetcher $fetcher) {}

    /**
     * Fetch and text-extract a single page.
     */
    public function single(Request $request): JsonResponse
    {
        $url = (string) $request->input('url', '');

        if ($url === '') {
            return response()->json(['error' => 'URL required'], 400);
        }

        $result = $this->fetcher->fetch($url);

        if (isset($result['error'])) {
            return response()->json(['error' => $result['error']], 500);
        }

        return response()->json([
            'url' => $result['url'],
            'content' => $result['content'],
            'method' => $result['method'] ?? 'fast',
        ]);
    }

    /**
     * Fetch many pages concurrently. Errors are per-result, not fatal.
     */
    public function batch(Request $request): JsonResponse
    {
        $urls = $request->input('urls');

        if (! is_array($urls) || $urls === []) {
            return response()->json(['error' => 'urls array required'], 400);
        }

        // Cap the fan-out so one request cannot exhaust the worker pool.
        $urls = array_slice(array_values(array_map('strval', $urls)), 0, 25);

        return response()->json(['results' => $this->fetcher->fetchBatch($urls)]);
    }
}
