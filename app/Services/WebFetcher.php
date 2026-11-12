<?php

namespace App\Services;

use DOMDocument;
use DOMElement;
use DOMXPath;
use Illuminate\Http\Client\Response;
use Illuminate\Support\Facades\Http;

/**
 * Fetches and text-extracts web pages for the Fact Checker pipeline.
 *
 * The legacy server had a Puppeteer fallback for JS-heavy or blocked pages;
 * PHP has no browser tier, so blocked/empty pages are reported as errors and
 * the frontend skips them.
 */
class WebFetcher
{
    private const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36';

    private const TIMEOUT_SECONDS = 8;

    private const MIN_USEFUL_LENGTH = 200;

    private const MAX_REDIRECTS = 5;

    private const BLOCK_SIGNALS = [
        'captcha',
        'recaptcha',
        'verify you are human',
        'enable javascript',
        'access denied',
        'unusual traffic',
        'cloudflare',
        'challenge',
        'bot detection',
    ];

    /**
     * Fetch one URL.
     *
     * @return array{url: string, content: string, method?: string, error?: string}
     */
    public function fetch(string $url): array
    {
        $url = trim($url);

        if ($url === '' || filter_var($url, FILTER_VALIDATE_URL) === false) {
            return ['url' => $url, 'content' => '', 'error' => 'Invalid URL'];
        }

        if (! $this->pointsToPublicHost($url)) {
            return ['url' => $url, 'content' => '', 'error' => 'URL is not allowed'];
        }

        try {
            // Redirects are followed by hand so every hop passes the same
            // public-host check as the first URL. Letting the HTTP client follow
            // them would validate only the starting address, and a public page
            // could simply redirect to an internal one.
            $current = $url;
            $response = null;

            for ($hop = 0; $hop <= self::MAX_REDIRECTS; $hop++) {
                $response = Http::withHeaders([
                    'User-Agent' => self::USER_AGENT,
                    'Accept' => 'text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.7',
                    'Accept-Language' => 'en-US,en;q=0.9',
                ])
                    ->timeout(self::TIMEOUT_SECONDS)
                    ->withOptions(['allow_redirects' => false])
                    ->get($current);

                if (! $response->redirect()) {
                    break;
                }

                $next = $this->resolveRedirect($current, $response->header('Location'));

                if ($next === null || ! $this->pointsToPublicHost($next)) {
                    return ['url' => $url, 'content' => '', 'error' => 'URL is not allowed'];
                }

                $current = $next;
                $response = null;
            }

            if ($response === null) {
                return ['url' => $url, 'content' => '', 'error' => 'Too many redirects'];
            }

            if (! $response->successful()) {
                return ['url' => $url, 'content' => '', 'error' => 'HTTP '.$response->status()];
            }

            $contentType = strtolower($response->header('Content-Type'));

            if (! $this->isTextual($contentType)) {
                return ['url' => $url, 'content' => '', 'error' => 'Unsupported content-type: '.($contentType ?: 'unknown')];
            }

            $raw = $response->body();
            $text = str_contains($contentType, 'html')
                ? $this->extractText($raw)
                : $this->normalise($raw);

            if ($this->looksBlockedOrEmpty($text, $raw)) {
                return ['url' => $url, 'content' => '', 'error' => 'Page blocked or contained no readable text'];
            }

            return ['url' => $url, 'content' => $text, 'method' => 'fast'];
        } catch (\Throwable $e) {
            return ['url' => $url, 'content' => '', 'error' => $e->getMessage()];
        }
    }

    /**
     * Fetch several URLs concurrently, preserving input order.
     *
     * @param  list<string>  $urls
     * @return list<array{url: string, content: string, method?: string, error?: string}>
     */
    public function fetchBatch(array $urls): array
    {
        if ($urls === []) {
            return [];
        }

        $allowed = [];
        $results = [];

        foreach (array_values($urls) as $url) {
            if (! $this->pointsToPublicHost($url)) {
                $results[] = ['url' => $url, 'content' => '', 'error' => 'URL is not allowed'];

                continue;
            }

            $allowed[] = $url;
        }

        if ($allowed === []) {
            return $results;
        }

        $responses = Http::pool(fn ($pool) => array_map(
            fn (string $url) => $pool->withHeaders([
                'User-Agent' => self::USER_AGENT,
                'Accept' => 'text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.7',
                'Accept-Language' => 'en-US,en;q=0.9',
            ])->timeout(self::TIMEOUT_SECONDS)->withOptions(['allow_redirects' => false])->get($url),
            $allowed
        ));

        foreach ($allowed as $index => $url) {
            $response = $responses[$index];

            if ($response instanceof \Throwable) {
                $results[] = ['url' => $url, 'content' => '', 'error' => $response->getMessage()];
            } elseif ($response->redirect()) {
                // Rare path: hand off to fetch(), which validates every hop.
                $results[] = $this->fetch($url);
            } else {
                $results[] = $this->interpret($url, $response);
            }
        }

        return $results;
    }

    /**
     * Reject anything that could reach loopback, private networks, link-local
     * addresses or cloud metadata endpoints (e.g. 169.254.169.254).
     *
     * Note: this resolves before the request is made, so a DNS-rebinding
     * attacker could still swap the record in between. Closing that fully
     * needs a pinned-IP HTTP client; this blocks the ordinary cases.
     */
    private function pointsToPublicHost(string $url): bool
    {
        $parts = parse_url($url);

        if ($parts === false) {
            return false;
        }

        $scheme = strtolower($parts['scheme'] ?? '');
        $host = strtolower($parts['host'] ?? '');

        if (! in_array($scheme, ['http', 'https'], true) || $host === '') {
            return false;
        }

        if ($host === 'localhost' || str_ends_with($host, '.local') || str_ends_with($host, '.internal')) {
            return false;
        }

        $ips = filter_var($host, FILTER_VALIDATE_IP) !== false
            ? [$host]
            : (gethostbynamel($host) ?: []);

        if ($ips === []) {
            return false;
        }

        foreach ($ips as $ip) {
            if (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE) === false) {
                return false;
            }
        }

        return true;
    }

    /**
     * Resolve a Location header against the URL that produced it.
     */
    private function resolveRedirect(string $base, string $location): ?string
    {
        $location = trim($location);

        if ($location === '') {
            return null;
        }

        if (preg_match('#^https?://#i', $location) === 1) {
            return $location;
        }

        $parts = parse_url($base);

        if ($parts === false || empty($parts['scheme']) || empty($parts['host'])) {
            return null;
        }

        $origin = $parts['scheme'].'://'.$parts['host'].(isset($parts['port']) ? ':'.$parts['port'] : '');

        if (str_starts_with($location, '//')) {
            return $parts['scheme'].':'.$location;
        }

        if (str_starts_with($location, '/')) {
            return $origin.$location;
        }

        $dir = rtrim(substr($parts['path'] ?? '/', 0, (int) strrpos($parts['path'] ?? '/', '/') + 1), '/');

        return $origin.$dir.'/'.$location;
    }

    /**
     * @return array{url: string, content: string, method?: string, error?: string}
     */
    private function interpret(string $url, Response $response): array
    {
        if (! $response->successful()) {
            return ['url' => $url, 'content' => '', 'error' => 'HTTP '.$response->status()];
        }

        $contentType = strtolower($response->header('Content-Type'));

        if (! $this->isTextual($contentType)) {
            return ['url' => $url, 'content' => '', 'error' => 'Unsupported content-type: '.($contentType ?: 'unknown')];
        }

        $raw = $response->body();
        $text = str_contains($contentType, 'html')
            ? $this->extractText($raw)
            : $this->normalise($raw);

        if ($this->looksBlockedOrEmpty($text, $raw)) {
            return ['url' => $url, 'content' => '', 'error' => 'Page blocked or contained no readable text'];
        }

        return ['url' => $url, 'content' => $text, 'method' => 'fast'];
    }

    private function isTextual(string $contentType): bool
    {
        return str_contains($contentType, 'text/')
            || str_contains($contentType, 'json')
            || str_contains($contentType, 'xml')
            || str_contains($contentType, 'html');
    }

    /**
     * Strip chrome from HTML and return collapsed body text.
     */
    private function extractText(string $html): string
    {
        if (trim($html) === '') {
            return '';
        }

        $document = new DOMDocument;

        // Suppress libxml warnings for malformed real-world markup.
        $previous = libxml_use_internal_errors(true);
        $document->loadHTML('<?xml encoding="UTF-8">'.$html, LIBXML_NOERROR | LIBXML_NOWARNING);
        libxml_clear_errors();
        libxml_use_internal_errors($previous);

        $xpath = new DOMXPath($document);

        $removable = $xpath->query(
            '//script | //style | //noscript | //svg | //canvas | //img | //video | //audio'
            .' | //header | //footer | //nav | //aside'
            .' | //*[@role="navigation"] | //*[@role="banner"] | //*[@role="contentinfo"]'
        );

        if ($removable !== false) {
            $nodes = iterator_to_array($removable);
            foreach ($nodes as $node) {
                $node->parentNode?->removeChild($node);
            }
        }

        $body = $document->getElementsByTagName('body')->item(0);

        return $this->normalise($body instanceof DOMElement ? $body->textContent : '');
    }

    private function normalise(string $text): string
    {
        return trim((string) preg_replace('/\s+/u', ' ', $text));
    }

    private function looksBlockedOrEmpty(string $text, string $html): bool
    {
        if (mb_strlen($text) < self::MIN_USEFUL_LENGTH) {
            return true;
        }

        $haystack = mb_strtolower($html.' '.$text);

        foreach (self::BLOCK_SIGNALS as $signal) {
            if (str_contains($haystack, $signal)) {
                return true;
            }
        }

        return false;
    }
}
