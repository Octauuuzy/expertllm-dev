<?php

namespace Tests\Feature;

use App\Models\ChatMessage;
use App\Models\ChatSession;
use App\Models\User;
use App\Services\TokenService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ChatApiTest extends TestCase
{
    use RefreshDatabase;

    public function test_first_message_creates_session_with_derived_title(): void
    {
        $user = User::factory()->create();

        $this->postJson('/chat/message', [
            'role' => 'user',
            'content' => 'Explain quantum tunnelling briefly',
            'session_id' => 'session-a',
            'model' => 'flash',
            'section' => 'general',
            'enabled_tools' => ['webSearch' => true],
        ], $this->auth($user))
            ->assertOk()
            ->assertJsonPath('status', 'saved')
            ->assertJsonPath('session_id', 'session-a');

        $session = ChatSession::find('session-a');

        $this->assertSame(mb_substr('Explain quantum tunnelling briefly', 0, 30).'...', $session->title);
        $this->assertSame('flash', $session->model);
        $this->assertSame('general', $session->mode);
        $this->assertTrue($session->enabled_tools['webSearch']);
    }

    public function test_content_is_required(): void
    {
        $user = User::factory()->create();

        $this->postJson('/chat/message', ['role' => 'user', 'session_id' => 's'], $this->auth($user))
            ->assertStatus(400);
    }

    public function test_session_list_is_scoped_to_the_authenticated_user(): void
    {
        $owner = User::factory()->create();
        $stranger = User::factory()->create();

        ChatSession::create([
            'session_id' => 'mine',
            'user_id' => $owner->id,
            'title' => 'Mine',
            'mode' => 'fact-checker',
        ]);

        ChatSession::create([
            'session_id' => 'theirs',
            'user_id' => $stranger->id,
            'title' => 'Theirs',
        ]);

        $response = $this->getJson('/chat/sessions', $this->auth($owner));

        $response->assertOk()->assertJsonCount(1)
            ->assertJsonPath('0.id', 'mine')
            ->assertJsonPath('0.section', 'fact-checker');
    }

    public function test_history_rejects_sessions_owned_by_someone_else(): void
    {
        $owner = User::factory()->create();
        $stranger = User::factory()->create();

        ChatSession::create(['session_id' => 'secret', 'user_id' => $owner->id, 'title' => 'Private']);

        $this->getJson('/chat/history?session_id=secret', $this->auth($stranger))
            ->assertStatus(404);
    }

    public function test_history_returns_messages_in_order(): void
    {
        $user = User::factory()->create();

        $this->postJson('/chat/message', [
            'role' => 'user',
            'content' => 'first',
            'session_id' => 'ordered',
        ], $this->auth($user))->assertOk();

        $this->postJson('/chat/message', [
            'role' => 'assistant',
            'content' => 'second',
            'session_id' => 'ordered',
            'thinking' => ['steps' => 3],
            'sources' => [['url' => 'https://example.com']],
        ], $this->auth($user))->assertOk();

        $this->getJson('/chat/history?session_id=ordered', $this->auth($user))
            ->assertOk()
            ->assertJsonCount(2)
            ->assertJsonPath('0.content', 'first')
            ->assertJsonPath('1.content', 'second');
    }

    public function test_clear_history_removes_sessions_and_messages(): void
    {
        $user = User::factory()->create();

        $this->postJson('/chat/message', [
            'role' => 'user',
            'content' => 'hello',
            'session_id' => 'to-clear',
        ], $this->auth($user));

        $this->deleteJson('/chat/history', [], $this->auth($user))
            ->assertOk()
            ->assertJson(['status' => 'cleared']);

        $this->assertSame(0, ChatSession::count());
        $this->assertSame(0, ChatMessage::count());
    }

    public function test_deleting_a_session_removes_its_messages(): void
    {
        $user = User::factory()->create();

        $this->postJson('/chat/message', [
            'role' => 'user',
            'content' => 'hello',
            'session_id' => 'gone',
        ], $this->auth($user));

        $this->deleteJson('/chat/sessions/gone', [], $this->auth($user))->assertOk();

        $this->assertSame(0, ChatMessage::count());
    }

    public function test_cannot_append_to_another_users_session(): void
    {
        $owner = User::factory()->create();
        $stranger = User::factory()->create();

        ChatSession::create(['session_id' => 'private', 'user_id' => $owner->id, 'title' => 'Private']);

        $this->postJson('/chat/message', [
            'role' => 'user',
            'content' => 'injected',
            'session_id' => 'private',
        ], $this->auth($stranger))->assertStatus(404);

        $this->assertSame(0, ChatMessage::count());
    }

    /**
     * @return array<string, string>
     */
    private function auth(User $user): array
    {
        return ['Authorization' => 'Bearer '.app(TokenService::class)->issue([
            'id' => $user->id,
            'username' => $user->username,
            'tier' => $user->tier,
        ])];
    }
}
