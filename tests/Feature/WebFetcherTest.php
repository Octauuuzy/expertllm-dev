<?php

namespace Tests\Feature;

use App\Services\WebFetcher;
use Illuminate\Support\Facades\Http;
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

    public function test_redirect_to_an_internal_address_is_refused(): void
    {
        Http::fake([
            '93.184.216.34/*' => Http::response('', 302, ['Location' => 'http://169.254.169.254/latest/meta-data/']),
            '169.254.169.254/*' => Http::response(str_repeat('instance-identity-token ', 40)),
        ]);

        $result = (new WebFetcher)->fetch('http://93.184.216.34/start');

        $this->assertSame('URL is not allowed', $result['error'] ?? null);
        $this->assertSame('', $result['content']);
        Http::assertNotSent(fn ($request) => str_contains($request->url(), '169.254.169.254'));
    }

    public function test_batch_redirect_to_an_internal_address_is_refused(): void
    {
        Http::fake([
            '93.184.216.34/*' => Http::response('', 301, ['Location' => 'http://127.0.0.1/admin']),
            '127.0.0.1/*' => Http::response(str_repeat('admin panel ', 40)),
        ]);

        $results = (new WebFetcher)->fetchBatch(['http://93.184.216.34/start']);

        $this->assertSame('URL is not allowed', $results[0]['error'] ?? null);
        Http::assertNotSent(fn ($request) => str_contains($request->url(), '127.0.0.1'));
    }

    public function test_redirects_between_public_hosts_are_followed(): void
    {
        Http::fake([
            '93.184.216.34/*' => Http::response('', 302, ['Location' => 'http://93.184.216.35/final']),
            '93.184.216.35/*' => Http::response(
                '<html><body><p>'.str_repeat('readable article text ', 20).'</p></body></html>',
                200,
                ['Content-Type' => 'text/html']
            ),
        ]);

        $result = (new WebFetcher)->fetch('http://93.184.216.34/start');

        $this->assertArrayNotHasKey('error', $result);
        $this->assertStringContainsString('readable article text', $result['content']);
    }

    public function test_redirect_loops_are_cut_off(): void
    {
        Http::fake([
            '93.184.216.34/*' => Http::response('', 302, ['Location' => 'http://93.184.216.34/again']),
        ]);

        $this->assertSame('Too many redirects', (new WebFetcher)->fetch('http://93.184.216.34/start')['error'] ?? null);
    }
}
