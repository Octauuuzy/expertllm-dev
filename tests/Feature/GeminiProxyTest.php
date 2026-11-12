<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\TokenService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

class GeminiProxyTest extends TestCase
{
    use RefreshDatabase;

    public function test_requires_a_bearer_token(): void
    {
        $this->postJson('/gemini-proxy', ['model' => 'gemini-4-argon', 'payload' => ['contents' => []]])
            ->assertStatus(401);
    }

    public function test_reports_missing_key(): void
    {
        config(['services.gemini.api_key' => null]);

        $this->postJson('/gemini-proxy', ['model' => 'gemini-4-argon', 'payload' => ['contents' => []]], $this->auth())
            ->assertStatus(500)
            ->assertJsonPath('error', 'GEMINI_API_KEY is not configured');
    }

    public function test_rejects_models_that_are_not_gemini_names(): void
    {
        config(['services.gemini.api_key' => 'key']);

        foreach (['../../evil', 'gemini-4-argon:evil', 'https://evil.test/x', 'gpt-5', ''] as $model) {
            $this->postJson('/gemini-proxy', ['model' => $model, 'payload' => ['contents' => []]], $this->auth())
                ->assertStatus(400);
        }

        Http::assertNothingSent();
    }

    public function test_forwards_thinking_level_and_max_tokens_with_the_server_key(): void
    {
        config(['services.gemini.api_key' => 'server-side-key']);

        Http::fake(['generativelanguage.googleapis.com/*' => Http::response('[{"candidates":[]}]', 200, ['Content-Type' => 'application/json'])]);

        $payload = [
            'contents' => [['role' => 'user', 'parts' => [['text' => 'hi']]]],
            'generationConfig' => [
                'maxOutputTokens' => 65536,
                'thinkingConfig' => ['thinkingLevel' => 'medium', 'includeThoughts' => true],
            ],
        ];

        $this->postJson('/gemini-proxy', ['model' => 'gemini-4-argon', 'stream' => true, 'payload' => $payload], $this->auth())
            ->assertOk();

        Http::assertSent(fn ($request) => $request->url() === 'https://generativelanguage.googleapis.com/v1beta/models/gemini-4-argon:streamGenerateContent?alt=sse'
            && $request->hasHeader('x-goog-api-key', 'server-side-key')
            && $request['generationConfig']['maxOutputTokens'] === 65536
            && $request['generationConfig']['thinkingConfig']['thinkingLevel'] === 'medium');
    }

    public function test_non_streaming_uses_generate_content(): void
    {
        config(['services.gemini.api_key' => 'k']);

        Http::fake(['generativelanguage.googleapis.com/*' => Http::response('{"candidates":[]}')]);

        $this->postJson('/gemini-proxy', ['model' => 'gemini-3-flash-preview', 'payload' => ['contents' => []]], $this->auth())
            ->assertOk();

        Http::assertSent(fn ($request) => str_ends_with($request->url(), 'gemini-3-flash-preview:generateContent'));
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
