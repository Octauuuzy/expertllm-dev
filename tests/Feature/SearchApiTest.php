<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\TokenService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class SearchApiTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();

        config([
            'services.search.provider' => null,
            'services.search.serper_key' => null,
            'services.search.tavily_key' => null,
            'services.search.brave_key' => null,
            'services.google_search.api_key' => null,
            'services.google_search.keys_json' => null,
        ]);
    }

    public function test_search_requires_a_query(): void
    {
        $this->postJson('/search', [], $this->auth())->assertStatus(400);
    }

    public function test_search_without_any_provider_key_reports_not_configured(): void
    {
        $this->postJson('/search', ['query' => 'laravel'], $this->auth())
            ->assertStatus(500)
            ->assertJsonPath('error', 'Search keys not configured');
    }

    public function test_serper_results_are_returned_in_googles_item_shape(): void
    {
        config(['services.search.serper_key' => 'serper-test']);

        Http::fake([
            'google.serper.dev/*' => Http::response(['organic' => [
                ['title' => 'Laravel', 'link' => 'https://laravel.com', 'snippet' => 'The PHP framework'],
                ['title' => 'No link, dropped'],
            ]]),
        ]);

        $this->postJson('/search', ['query' => 'laravel', 'num' => 10, 'start' => 1], $this->auth())
            ->assertOk()
            ->assertExactJson(['items' => [
                ['title' => 'Laravel', 'link' => 'https://laravel.com', 'snippet' => 'The PHP framework'],
            ]]);

        Http::assertSent(fn ($request) => $request->hasHeader('X-API-KEY', 'serper-test')
            && $request['q'] === 'laravel'
            && $request['page'] === 1);
    }

    public function test_tavily_results_are_normalised_and_site_filter_applied(): void
    {
        config(['services.search.tavily_key' => 'tvly-test']);

        Http::fake([
            'api.tavily.com/*' => Http::response(['results' => [
                ['title' => 'Post', 'url' => 'https://x.com/a/status/1', 'content' => 'text'],
            ]]),
        ]);

        $this->postJson('/search', ['query' => 'news', 'siteSearch' => 'x.com'], $this->auth())
            ->assertOk()
            ->assertJsonPath('items.0.link', 'https://x.com/a/status/1')
            ->assertJsonPath('items.0.snippet', 'text');

        Http::assertSent(fn ($request) => $request->hasHeader('Authorization', 'Bearer tvly-test')
            && $request['include_domains'] === ['x.com']);
    }

    public function test_brave_results_are_normalised(): void
    {
        config(['services.search.brave_key' => 'brave-test']);

        Http::fake([
            'api.search.brave.com/*' => Http::response(['web' => ['results' => [
                ['title' => 'Brave', 'url' => 'https://brave.com', 'description' => 'Private search'],
            ]]]),
        ]);

        $this->postJson('/search', ['query' => 'brave'], $this->auth())
            ->assertOk()
            ->assertJsonPath('items.0.snippet', 'Private search');
    }

    public function test_provider_failure_returns_502_without_leaking_the_key(): void
    {
        config(['services.search.serper_key' => 'serper-secret-key']);

        Http::fake(['google.serper.dev/*' => Http::response('bad key serper-secret-key', 403)]);

        $response = $this->postJson('/search', ['query' => 'laravel'], $this->auth())
            ->assertStatus(502)
            ->assertJsonPath('error', 'Search failed');

        $this->assertStringNotContainsString('serper-secret-key', $response->getContent());
    }

    public function test_explicit_provider_choice_wins_over_other_keys(): void
    {
        config([
            'services.search.provider' => 'tavily',
            'services.search.serper_key' => 'serper-test',
            'services.search.tavily_key' => 'tvly-test',
        ]);

        Http::fake(['api.tavily.com/*' => Http::response(['results' => []])]);

        $this->postJson('/search', ['query' => 'x'], $this->auth())->assertOk();

        Http::assertSent(fn ($request) => str_contains($request->url(), 'api.tavily.com'));
        Http::assertNotSent(fn ($request) => str_contains($request->url(), 'serper.dev'));
    }

    private function auth(): array
    {
        $user = User::factory()->create();

        return ['Authorization' => 'Bearer '.app(TokenService::class)->issue([
            'id' => $user->id,
            'username' => $user->username,
            'tier' => $user->tier,
        ])];
    }
}
