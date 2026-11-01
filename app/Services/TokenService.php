<?php

namespace App\Services;

use Illuminate\Support\Facades\Config;

/**
 * Minimal HS256 JWT implementation matching the legacy Node server contract.
 *
 * Tokens carry { id, username, tier, iat, exp } and live for 48 hours. The API
 * issues a fresh token on every authenticated request via the X-Auth-Token
 * response header, which the frontend's fetch interceptor stores — that is the
 * "rolling session" behaviour of the original server.
 */
class TokenService
{
    private const TTL_SECONDS = 48 * 60 * 60;

    /**
     * Issue a token for the given user.
     *
     * @param  array{id: int, username: string, tier: string}  $user
     */
    public function issue(array $user): string
    {
        $now = time();

        return $this->encode([
            'id' => $user['id'],
            'username' => $user['username'],
            'tier' => $user['tier'],
            'iat' => $now,
            'exp' => $now + self::TTL_SECONDS,
        ]);
    }

    /**
     * Verify a token and return its claims, or null when invalid/expired.
     *
     * @return array{id: int, username: string, tier: string, iat: int, exp: int}|null
     */
    public function verify(string $token): ?array
    {
        $parts = explode('.', $token);
        if (count($parts) !== 3) {
            return null;
        }

        [$header, $payload, $signature] = $parts;

        $expected = $this->sign("{$header}.{$payload}");
        if (! hash_equals($expected, $signature)) {
            return null;
        }

        $claims = json_decode($this->base64UrlDecode($payload), true);
        if (! is_array($claims) || ! isset($claims['id'], $claims['exp'])) {
            return null;
        }

        if ((int) $claims['exp'] < time()) {
            return null;
        }

        return $claims;
    }

    /**
     * @param  array<string, mixed>  $claims
     */
    private function encode(array $claims): string
    {
        $header = $this->base64UrlEncode(json_encode(['alg' => 'HS256', 'typ' => 'JWT']));
        $payload = $this->base64UrlEncode(json_encode($claims));

        return "{$header}.{$payload}.{$this->sign("{$header}.{$payload}")}";
    }

    private function sign(string $data): string
    {
        $secret = (string) Config::get('app.jwt_secret');

        if ($secret === '') {
            throw new \RuntimeException('JWT_SECRET is not configured.');
        }

        return $this->base64UrlEncode(
            hash_hmac('sha256', $data, $secret, true)
        );
    }

    private function base64UrlEncode(string $value): string
    {
        return rtrim(strtr(base64_encode($value), '+/', '-_'), '=');
    }

    private function base64UrlDecode(string $value): string
    {
        return base64_decode(strtr($value, '-_', '+/')) ?: '';
    }
}
