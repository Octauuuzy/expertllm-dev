<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Services\TokenService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;

class AuthController extends Controller
{
    public function __construct(private readonly TokenService $tokens) {}

    /**
     * Register a new account and return a bearer token immediately.
     */
    public function register(Request $request): JsonResponse
    {
        $username = strtolower(trim((string) $request->input('username')));
        $email = trim((string) $request->input('email'));
        $password = (string) $request->input('password');

        if ($username === '' || $password === '' || $email === '') {
            return response()->json(['error' => 'Username, password, and email required'], 400);
        }

        if (User::where('username', $username)->exists()) {
            return response()->json(['error' => 'Username already exists'], 400);
        }

        $user = User::create([
            'username' => $username,
            'name' => $username,
            'email' => $email,
            'password' => Hash::make($password),
            'tier' => 'Free',
            'preferences' => [],
        ]);

        return response()->json([
            'token' => $this->tokens->issue([
                'id' => $user->id,
                'username' => $user->username,
                'tier' => $user->tier,
            ]),
            'user' => $this->publicUser($user),
        ]);
    }

    /**
     * Exchange username/password for a bearer token.
     */
    public function login(Request $request): JsonResponse
    {
        $username = strtolower(trim((string) $request->input('username')));
        $password = (string) $request->input('password');

        if ($username === '' || $password === '') {
            return response()->json(['error' => 'Username and password required'], 400);
        }

        $user = User::where('username', $username)->first();

        if ($user === null) {
            return response()->json(['error' => 'User not found. Please register.'], 401);
        }

        if (! Hash::check($password, $user->password)) {
            return response()->json(['error' => 'Incorrect password'], 401);
        }

        return response()->json([
            'token' => $this->tokens->issue([
                'id' => $user->id,
                'username' => $user->username,
                'tier' => $user->tier,
            ]),
            'user' => $this->publicUser($user),
        ]);
    }

    /**
     * @return array{id: int, username: string, tier: string, preferences: array<string, mixed>}
     */
    private function publicUser(User $user): array
    {
        return [
            'id' => $user->id,
            'username' => $user->username,
            'tier' => $user->tier,
            'preferences' => $user->preferences ?? [],
        ];
    }
}
