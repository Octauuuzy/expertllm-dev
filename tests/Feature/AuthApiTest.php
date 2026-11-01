<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\TokenService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AuthApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_register_returns_token_and_user(): void
    {
        $response = $this->postJson('/auth/register', [
            'username' => 'Alice',
            'email' => 'alice@example.com',
            'password' => 'secret123',
        ]);

        $response->assertOk()
            ->assertJsonPath('user.username', 'alice')
            ->assertJsonPath('user.tier', 'Free')
            ->assertJsonStructure(['token', 'user' => ['id', 'username', 'tier', 'preferences']]);

        $this->assertDatabaseHas('users', ['username' => 'alice']);
    }

    public function test_duplicate_username_is_rejected(): void
    {
        User::factory()->create(['username' => 'alice']);

        $this->postJson('/auth/register', [
            'username' => 'alice',
            'email' => 'other@example.com',
            'password' => 'secret123',
        ])->assertStatus(400)
            ->assertJson(['error' => 'Username already exists']);
    }

    public function test_login_normalises_username_and_rejects_bad_password(): void
    {
        User::factory()->create(['username' => 'alice']);

        $this->postJson('/auth/login', ['username' => 'ALICE', 'password' => 'wrong'])
            ->assertStatus(401)
            ->assertJson(['error' => 'Incorrect password']);

        $this->postJson('/auth/login', ['username' => 'ALICE', 'password' => 'password'])
            ->assertOk()
            ->assertJsonStructure(['token', 'user']);
    }

    public function test_me_requires_a_bearer_token(): void
    {
        $this->getJson('/user/me')->assertStatus(401);
        $this->getJson('/user/me', ['Authorization' => 'Bearer not.a.token'])->assertStatus(403);
    }

    public function test_me_returns_profile_and_refreshes_token_header(): void
    {
        $user = User::factory()->create();

        $response = $this->getJson('/user/me', [
            'Authorization' => 'Bearer '.$this->tokenFor($user),
        ]);

        $response->assertOk()
            ->assertJsonPath('username', $user->username)
            ->assertHeader('X-Auth-Token');
    }

    public function test_preferences_are_persisted(): void
    {
        $user = User::factory()->create();

        $this->postJson('/user/preferences', [
            'preferences' => ['theme' => 'dark', 'section' => 'fact-checker'],
        ], ['Authorization' => 'Bearer '.$this->tokenFor($user)])
            ->assertOk()
            ->assertJson(['status' => 'updated']);

        $this->assertSame('dark', $user->fresh()->preferences['theme']);
    }

    private function tokenFor(User $user): string
    {
        return app(TokenService::class)->issue([
            'id' => $user->id,
            'username' => $user->username,
            'tier' => $user->tier,
        ]);
    }
}
