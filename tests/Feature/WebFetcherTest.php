<?php

namespace Tests\Feature;

use App\Services\WebFetcher;
use Tests\TestCase;

class WebFetcherTest extends TestCase
{
    public function test_loopback_and_private_addresses_are_refused(): void
    {
        $fetcher = new WebFetcher;

        foreach ([
            'http://127.0.0.1/admin',
            'http://localhost:8080/',
            'http://169.254.169.254/latest/meta-data/',
            'http://10.0.0.1/',
            'http://192.168.1.1/',
            'http://[::1]/',
            'file:///etc/passwd',
            'gopher://example.com/',
        ] as $url) {
            $result = $fetcher->fetch($url);

            $this->assertSame('URL is not allowed', $result['error'] ?? null, "Expected {$url} to be refused");
            $this->assertSame('', $result['content']);
        }
    }

    public function test_batch_refuses_internal_urls_without_fetching(): void
    {
        $results = (new WebFetcher)->fetchBatch([
            'http://127.0.0.1/secret',
            'http://169.254.169.254/',
        ]);

        $this->assertCount(2, $results);

        foreach ($results as $result) {
            $this->assertSame('URL is not allowed', $result['error']);
        }
    }

    public function test_invalid_urls_are_rejected(): void
    {
        $this->assertSame('Invalid URL', (new WebFetcher)->fetch('not-a-url')['error']);
    }
}
