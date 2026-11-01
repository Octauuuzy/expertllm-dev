<?php

namespace App\Http\Middleware;

use App\Models\User;
use App\Services\TokenService;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * Bearer-token auth for the JSON API.
 *
 * Mirrors the legacy Express middleware: 401 when the header is missing, 403
 * when the token is invalid/expired or its user is gone, and a freshly minted
 * token returned in X-Auth-Token on every successful request (rolling session).
 */
class AuthenticateToken
{
    public function __construct(private readonly TokenService $tokens) {}

    public function handle(Request $request, Closure $next): Response
    {
        $header = $request->header('Authorization', '');
        $token = str_starts_with($header, 'Bearer ') ? substr($header, 7) : null;

        if (! $token) {
            return response()->json(['error' => 'Access token required'], 401);
        }

        $claims = $this->tokens->verify($token);

        if ($claims === null) {
            return response()->json(['error' => 'Invalid or expired token'], 403);
        }

        $user = User::find($claims['id']);

        if ($user === null) {
            return response()->json(['error' => 'User not found'], 403);
        }

        $request->setUserResolver(fn () => $user);

        $response = $next($request);

        $response->headers->set('X-Auth-Token', $this->tokens->issue([
            'id' => $user->id,
            'username' => $user->username,
            'tier' => $user->tier,
        ]));

        return $response;
    }
}
