<?php

namespace Tests\Feature;

use App\Models\UploadedImage;
use App\Models\User;
use App\Services\TokenService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ImageApiTest extends TestCase
{
    use RefreshDatabase;

    private const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

    public function test_saving_a_generated_image_creates_a_placeholder_session(): void
    {
        $user = User::factory()->create();

        $this->postJson('/images/save', [
            'session_id' => 'img-session',
            'message_id' => 'm1',
            'image_data' => self::PNG,
            'prompt' => 'a red dot',
        ], $this->auth($user))
            ->assertOk()
            ->assertJsonPath('status', 'saved')
            ->assertJsonStructure(['image_id', 'created_at']);

        $this->assertDatabaseHas('chat_sessions', [
            'session_id' => 'img-session',
            'title' => 'Image Generation',
        ]);
    }

    public function test_raw_image_endpoint_returns_decoded_bytes(): void
    {
        $user = User::factory()->create();

        $imageId = $this->postJson('/images/save', [
            'session_id' => 'img-session',
            'image_data' => self::PNG,
        ], $this->auth($user))->json('image_id');

        $response = $this->get('/images/'.$imageId.'?raw=true', $this->auth($user));

        $response->assertOk();
        $response->assertHeader('Content-Type', 'image/png');
        $this->assertSame(base64_decode(self::PNG), $response->getContent());
    }

    public function test_images_are_not_visible_to_other_users(): void
    {
        $owner = User::factory()->create();
        $stranger = User::factory()->create();

        $imageId = $this->postJson('/images/save', [
            'session_id' => 'img-session',
            'image_data' => self::PNG,
        ], $this->auth($owner))->json('image_id');

        $this->getJson('/images/'.$imageId, $this->auth($stranger))->assertStatus(404);
        $this->getJson('/images/last?session_id=img-session', $this->auth($stranger))
            ->assertOk()
            ->assertJsonPath('image', null);
    }

    public function test_uploaded_images_are_listed_as_metadata_without_data(): void
    {
        $user = User::factory()->create();

        $this->postJson('/images/upload', [
            'session_id' => 'up-session',
            'message_id' => 'm1',
            'images' => [[
                'image_data' => self::PNG,
                'mime_type' => 'image/png',
                'original_filename' => 'dot.png',
                'file_size' => 95,
            ]],
        ], $this->auth($user))
            ->assertOk()
            ->assertJsonPath('images.0.original_filename', 'dot.png');

        $this->getJson('/images/uploaded?session_id=up-session', $this->auth($user))
            ->assertOk()
            ->assertJsonPath('lazyLoad', true)
            ->assertJsonMissingPath('images.0.image_data');

        $this->assertDatabaseCount('uploaded_images', 1);
        $this->assertSame(1, UploadedImage::count());
    }

    public function test_deleting_an_uploaded_image(): void
    {
        $user = User::factory()->create();

        $imageId = $this->postJson('/images/upload', [
            'session_id' => 'up-session',
            'images' => [['image_data' => self::PNG]],
        ], $this->auth($user))->json('images.0.id');

        $this->deleteJson('/images/uploaded/'.$imageId, [], $this->auth($user))
            ->assertOk()
            ->assertJson(['status' => 'deleted']);

        $this->assertSame(0, UploadedImage::count());
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
