<?php

namespace App\Services;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;

/**
 * Mints and caches Google OAuth access tokens for Vertex AI.
 *
 * Two sources, in order: the GCE metadata server (when enabled) and a service
 * account JSON key (inline env var or a file path).
 */
class VertexTokenService
{
    private const SCOPE = 'https://www.googleapis.com/auth/cloud-platform';

    private const DEFAULT_TOKEN_URI = 'https://oauth2.googleapis.com/token';

    /**
     * Reject anything that is not an aiplatform endpoint for our own project.
     */
    public function isAllowedUrl(string $url): bool
    {
        $projectId = (string) config('services.vertex.project_id');

        if ($projectId === '') {
            return false;
        }

        $parts = parse_url($url);

        if ($parts === false || ($parts['scheme'] ?? '') !== 'https') {
            return false;
        }

        $host = $parts['host'] ?? '';

        if (! str_ends_with($host, 'aiplatform.googleapis.com')) {
            return false;
        }

        return str_contains($parts['path'] ?? '', '/v1/projects/'.$projectId.'/');
    }

    /**
     * Current access token, or null when Vertex is not configured.
     */
    public function accessToken(): ?string
    {
        $cached = Cache::get('vertex.access_token');

        if (is_string($cached) && $cached !== '') {
            return $cached;
        }

        $credentials = $this->serviceAccount();

        if ($credentials === null && ! config('services.vertex.use_metadata_server')) {
            return null;
        }

        $token = null;

        if (config('services.vertex.use_metadata_server')) {
            $token = $this->fromMetadataServer();
        }

        if ($token === null && $credentials !== null) {
            $token = $this->fromServiceAccount($credentials);
        }

        if ($token === null) {
            return null;
        }

        Cache::put('vertex.access_token', $token['access_token'], max(60, ($token['expires_in'] ?? 3600) - 300));

        return $token['access_token'];
    }

    /**
     * @return array{access_token: string, expires_in?: int}|null
     */
    private function fromMetadataServer(): ?array
    {
        try {
            $response = Http::withHeaders(['Metadata-Flavor' => 'Google'])
                ->timeout(3)
                ->get('http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token');

            return $response->successful() ? $response->json() : null;
        } catch (\Throwable) {
            return null;
        }
    }

    /**
     * @param  array<string, mixed>  $credentials
     * @return array{access_token: string, expires_in?: int}|null
     */
    private function fromServiceAccount(array $credentials): ?array
    {
        $clientEmail = $credentials['client_email'] ?? null;
        $privateKey = $credentials['private_key'] ?? null;

        if (! is_string($clientEmail) || ! is_string($privateKey)) {
            return null;
        }

        $tokenUri = $credentials['token_uri'] ?? self::DEFAULT_TOKEN_URI;
        $now = time();

        $assertion = $this->signAssertion([
            'iss' => $clientEmail,
            'sub' => $clientEmail,
            'aud' => $tokenUri,
            'iat' => $now,
            'exp' => $now + 3600,
            'scope' => self::SCOPE,
        ], $privateKey);

        if ($assertion === null) {
            return null;
        }

        try {
            $response = Http::asForm()->post($tokenUri, [
                'grant_type' => 'urn:ietf:params:oauth:grant-type:jwt-bearer',
                'assertion' => $assertion,
            ]);

            return $response->successful() ? $response->json() : null;
        } catch (\Throwable) {
            return null;
        }
    }

    /**
     * @param  array<string, mixed>  $claims
     */
    private function signAssertion(array $claims, string $privateKey): ?string
    {
        $header = $this->base64Url((string) json_encode(['alg' => 'RS256', 'typ' => 'JWT']));
        $payload = $this->base64Url((string) json_encode($claims));
        $signingInput = "{$header}.{$payload}";

        $signature = '';
        $key = openssl_pkey_get_private($privateKey);

        if ($key === false || ! openssl_sign($signingInput, $signature, $key, OPENSSL_ALGO_SHA256)) {
            return null;
        }

        return "{$signingInput}.".$this->base64Url($signature);
    }

    /**
     * @return array<string, mixed>|null
     */
    private function serviceAccount(): ?array
    {
        $inline = (string) config('services.vertex.service_account_json');

        if ($inline !== '') {
            $decoded = json_decode($inline, true);

            return is_array($decoded) ? $decoded : null;
        }

        $path = (string) config('services.vertex.credentials_path');

        if ($path !== '' && is_file($path)) {
            $decoded = json_decode((string) file_get_contents($path), true);

            return is_array($decoded) ? $decoded : null;
        }

        return null;
    }

    private function base64Url(string $value): string
    {
        return rtrim(strtr(base64_encode($value), '+/', '-_'), '=');
    }
}
