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
     * Pipe an upstream body to the client without buffering it.
     */
    private function streamThrough(int $status, ?string $contentType, $body): StreamedResponse
    {
        return response()->stream(function () use ($body): void {
            while (! $body->eof()) {
                echo $body->read(8192);
                flush();
            }
        }, $status, array_filter([
            'Content-Type' => $contentType ?: 'application/json',
            'X-Accel-Buffering' => 'no',
        ]));
    }
}
