<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\Http;

class SearchController extends Controller
{
    /**
     * Google Programmable Search with key rotation on quota errors.
     *
     * Keys come from GOOGLE_SEARCH_KEYS (JSON array of {apiKey, cx}) or the
     * single GOOGLE_SEARCH_API_KEY/GOOGLE_SEARCH_CX pair. The result payload is
     * passed through untouched — the frontend parses Google's schema.
     */
    public function search(Request $request): JsonResponse|Response
    {
        $query = (string) $request->input('query', '');

        if ($query === '') {
            return response()->json(['error' => 'Query required'], 400);
        }

        $keys = $this->searchKeys();

        if ($keys === []) {
            return response()->json(['error' => 'Search keys not configured'], 500);
        }

        $quotaUser = 'u_'.$request->user()->id;
        $lastError = null;

        foreach ($keys as $key) {
            $params = [
                'key' => $key['apiKey'],
                'cx' => $key['cx'],
                'q' => $query,
                'num' => (int) $request->input('num', 10),
                'start' => (int) $request->input('start', 1),
                'quotaUser' => $quotaUser,
            ];

            if ($request->filled('siteSearch')) {
                $params['siteSearch'] = (string) $request->input('siteSearch');
            }

            try {
                $response = Http::withHeaders(['X-Goog-Quota-User' => $quotaUser])
                    ->timeout(15)
                    ->get('https://www.googleapis.com/customsearch/v1', $params);

                if ($response->successful()) {
                    return response()->json($response->json(), $response->status());
                }

                $lastError = $response->status().': '.$response->body();

                if (! in_array($response->status(), [403, 429], true)) {
                    return response($response->body(), $response->status());
                }
            } catch (\Throwable $e) {
                $lastError = $e->getMessage();
            }
        }

        return response()->json(['error' => 'Search failed', 'details' => $lastError], 502);
    }

    /**
     * @return list<array{apiKey: string, cx: string}>
     */
    private function searchKeys(): array
    {
        $keysJson = (string) config('services.google_search.keys_json');

        if ($keysJson !== '') {
            $decoded = json_decode($keysJson, true);

            if (is_array($decoded)) {
                return array_values(array_filter($decoded, fn ($key): bool => is_array($key)
                    && ! empty($key['apiKey'])
                    && ! empty($key['cx'])));
            }
        }

        $apiKey = (string) config('services.google_search.api_key');
        $cx = (string) config('services.google_search.cx');

        if ($apiKey !== '' && $cx !== '') {
            return [['apiKey' => $apiKey, 'cx' => $cx]];
        }

        return [];
    }
}
