<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\VertexTokenService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Symfony\Component\HttpFoundation\StreamedResponse;

class ProxyController extends Controller
{
    /**
     * Forward an OpenAI-compatible payload to a server-held provider key.
     *
     * The browser only ever names the provider; keys stay on the server.
     * The upstream body is streamed straight through so SSE tokens arrive
     * in real time.
     */
    public function completions(Request $request): JsonResponse|StreamedResponse
    {
        $provider = (string) $request->input('provider');
        $payload = $request->input('payload');

        if ($provider === '' || ! is_array($payload)) {
            return response()->json(['error' => 'Provider and payload required'], 400);
        }

        $providers = [
            'openrouter' => [
                'url' => 'https://openrouter.ai/api/v1/chat/completions',
                'key' => config('services.openrouter.api_key'),
            ],
            'chutes' => [
                'url' => 'https://llm.chutes.ai/v1/chat/completions',
                'key' => config('services.chutes.api_key'),
            ],
        ];

        if (! isset($providers[$provider])) {
            return response()->json(['error' => 'Unknown provider'], 400);
        }

        $config = $providers[$provider];

        if (empty($config['key'])) {
            return response()->json(['error' => "{$provider} API key not configured"], 500);
        }

        $response = Http::withToken($config['key'])
            ->withHeaders(['Content-Type' => 'application/json'])
            ->withBody(json_encode($payload), 'application/json')
            ->withOptions(['stream' => true])
            ->post($config['url']);

        return $this->streamThrough($response->status(), $response->header('Content-Type'), $response->toPsrResponse()->getBody());
    }

    /**
     * Forward a request to Vertex AI using a server-minted OAuth token.
     *
     * The target URL is validated to be an aiplatform endpoint of *our*
     * project, so this cannot be used as an open proxy.
     */
    public function vertex(Request $request, VertexTokenService $vertex): JsonResponse|StreamedResponse
    {
        $url = (string) $request->input('url');
        $payload = $request->input('payload');

        if ($url === '' || ! is_array($payload)) {
            return response()->json(['error' => 'Missing url or payload'], 400);
        }

        if (! $vertex->isAllowedUrl($url)) {
            return response()->json(['error' => 'Invalid Vertex URL'], 400);
        }

        $token = $vertex->accessToken();

        if ($token === null) {
            return response()->json(['error' => 'Vertex project is not configured'], 500);
        }

        $response = Http::withToken($token)
            ->withHeaders(['Content-Type' => 'application/json'])
            ->withBody(json_encode($payload), 'application/json')
            ->withOptions(['stream' => true])
            ->post($url);

        return $this->streamThrough($response->status(), $response->header('Content-Type'), $response->toPsrResponse()->getBody());
    }

    /**
     * Forward a generateContent request to the Gemini API with the server-held key.
     *
     * The browser sends a model name and a payload, never a URL, so this cannot
     * be pointed at another host. The payload is the same generateContent body
     * Vertex takes (contents, generationConfig.maxOutputTokens,
     * generationConfig.thinkingConfig.thinkingLevel, ...).
     */
    public function gemini(Request $request): JsonResponse|StreamedResponse
    {
        $model = (string) $request->input('model');
        $payload = $request->input('payload');

        if (preg_match('/^gemini-[a-z0-9][a-z0-9.\-]*$/', $model) !== 1 || ! is_array($payload)) {
            return response()->json(['error' => 'Valid Gemini model and payload required'], 400);
        }

        $key = (string) config('services.gemini.api_key');

        if ($key === '') {
            return response()->json(['error' => 'GEMINI_API_KEY is not configured'], 500);
        }

        $endpoint = $request->boolean('stream')
            ? 'streamGenerateContent?alt=sse'
            : 'generateContent';

        // Hard prompts on Gemini 4 can run for minutes; Google advises long client timeouts.
        $response = Http::withHeaders([
            'x-goog-api-key' => $key,
            'Content-Type' => 'application/json',
        ])
            ->timeout(900)
            ->withBody(json_encode($payload), 'application/json')
            ->withOptions(['stream' => true])
            ->post("https://generativelanguage.googleapis.com/v1beta/models/{$model}:{$endpoint}");

        return $this->streamThrough($response->status(), $response->header('Content-Type'), $response->toPsrResponse()->getBody());
    }

    /**
     * Pipe an upstream body to the client without buffering it.
     */
    private function streamThrough(int $status, ?string $contentType, $body): StreamedResponse
    {
        return response()->stream(function () use ($body): void {
            // Close Laravel's 4 KB output buffer so thought summaries (~500 B)
            // flush to the browser as they arrive instead of waiting for the end.
            while (ob_get_level() > 0) {
                @ob_end_flush();
            }

            while (! $body->eof()) {
                $chunk = $body->read(256);
                if ($chunk !== '') {
                    echo $chunk;
                    flush();
                }
            }
        }, $status, array_filter([
            'Content-Type' => $contentType ?: 'application/json',
            'Cache-Control' => 'no-cache, no-transform',
            'X-Accel-Buffering' => 'no',
        ]));
    }
}
