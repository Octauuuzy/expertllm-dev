<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use RuntimeException;

/**
 * Web search behind one interface.
 *
 * Google's Custom Search JSON API is closed to new customers and being shut
 * down, so the research loop can no longer depend on it. Each provider here is
 * normalised to the shape the frontend already parses:
 *
 *     {"items": [{"title": "...", "link": "...", "snippet": "..."}]}
 *
 * Provider is chosen by SEARCH_PROVIDER, or else the first one with a key set.
 */
class WebSearch
{
    public const PROVIDERS = ['serper', 'tavily', 'brave', 'google'];

    private const TIMEOUT_SECONDS = 15;

    /**
     * The provider that will serve requests, or null if none is configured.
     */
    public function provider(): ?string
    {
        $chosen = strtolower((string) config('services.search.provider'));

        if (in_array($chosen, self::PROVIDERS, true)) {
            return $this->hasKey($chosen) ? $chosen : null;
        }

        foreach (self::PROVIDERS as $provider) {
            if ($this->hasKey($provider)) {
                return $provider;
            }
        }

        return null;
    }

    /**
     * @return array{items: list<array{title: string, link: string, snippet: string}>}
     *
     * @throws RuntimeException when the provider rejects or fails the request
     */
    public function search(string $provider, string $query, int $num = 10, int $start = 1, ?string $site = null): array
    {
        $num = max(1, min($num, 10));
        $start = max(1, $start);

        if ($site !== null && $site !== '') {
            $query .= ' site:'.$site;
        }

        return match ($provider) {
            'serper' => $this->serper($query, $num, $start),
            'tavily' => $this->tavily($query, $num, $start, $site),
            'brave' => $this->brave($query, $num, $start),
            default => throw new RuntimeException("Unsupported search provider: {$provider}"),
        };
    }

    private function hasKey(string $provider): bool
    {
        return match ($provider) {
            'serper' => (string) config('services.search.serper_key') !== '',
            'tavily' => (string) config('services.search.tavily_key') !== '',
            'brave' => (string) config('services.search.brave_key') !== '',
            'google' => (string) config('services.google_search.api_key') !== ''
                || (string) config('services.google_search.keys_json') !== '',
            default => false,
        };
    }

    /**
     * Serper returns Google results. Pages are 1-based.
     *
     * IPv4 + HTTP/1.1 are forced because NAT64/IPv6 routes and OpenSSL's ALPN
     * negotiation with google.serper.dev can reset the connection on Windows.
     */
    private function serper(string $query, int $num, int $start): array
    {
        $response = Http::withOptions([
            'force_ip_resolve' => 'v4',
            'version' => 1.1,
        ])
            ->withHeaders(['X-API-KEY' => (string) config('services.search.serper_key')])
            ->timeout(self::TIMEOUT_SECONDS)
            ->asJson()
            ->post('https://google.serper.dev/search', [
                'q' => $query,
                'num' => $num,
                'page' => intdiv($start - 1, $num) + 1,
            ]);

        $this->assertOk('Serper', $response);

        return $this->normalise($response->json('organic') ?? [], 'title', 'link', 'snippet');
    }

    /**
     * Tavily has no paging, so anything past the first page is empty.
     */
    private function tavily(string $query, int $num, int $start, ?string $site): array
    {
        if ($start > 1) {
            return ['items' => []];
        }

        $body = [
            'query' => $query,
            'max_results' => $num,
            'search_depth' => 'basic',
        ];

        if ($site !== null && $site !== '') {
            $body['include_domains'] = [$site];
        }

        $response = Http::withToken((string) config('services.search.tavily_key'))
            ->timeout(self::TIMEOUT_SECONDS)
            ->asJson()
            ->post('https://api.tavily.com/search', $body);

        $this->assertOk('Tavily', $response);

        return $this->normalise($response->json('results') ?? [], 'title', 'url', 'content');
    }

    /**
     * Brave's offset is a page index, starting at 0.
     */
    private function brave(string $query, int $num, int $start): array
    {
        $response = Http::withHeaders([
            'X-Subscription-Token' => (string) config('services.search.brave_key'),
            'Accept' => 'application/json',
        ])
            ->timeout(self::TIMEOUT_SECONDS)
            ->get('https://api.search.brave.com/res/v1/web/search', [
                'q' => $query,
                'count' => $num,
                'offset' => intdiv($start - 1, $num),
            ]);

        $this->assertOk('Brave', $response);

        return $this->normalise($response->json('web.results') ?? [], 'title', 'url', 'description');
    }

    /**
     * @param  \Illuminate\Http\Client\Response  $response
     */
    private function assertOk(string $name, $response): void
    {
        if ($response->successful()) {
            return;
        }

        // Status only: the body can echo request details, and the key must not leak.
        throw new RuntimeException("{$name} returned HTTP {$response->status()}", $response->status());
    }

    /**
     * @param  array<int, mixed>  $rows
     * @return array{items: list<array{title: string, link: string, snippet: string}>}
     */
    private function normalise(array $rows, string $titleKey, string $linkKey, string $snippetKey): array
    {
        $items = [];

        foreach ($rows as $row) {
            if (! is_array($row) || empty($row[$linkKey])) {
                continue;
            }

            $items[] = [
                'title' => (string) ($row[$titleKey] ?? $row[$linkKey]),
                'link' => (string) $row[$linkKey],
                'snippet' => (string) ($row[$snippetKey] ?? ''),
            ];
        }

        return ['items' => $items];
    }
}
