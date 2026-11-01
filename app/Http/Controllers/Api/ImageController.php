<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ChatSession;
use App\Models\GeneratedImage;
use App\Models\UploadedImage;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

class ImageController extends Controller
{
    /**
     * Persist a generated image (base64 payload from the model response).
     */
    public function saveGenerated(Request $request): JsonResponse
    {
        $sessionId = (string) $request->input('session_id', '');
        $imageData = (string) $request->input('image_data', '');

        if ($sessionId === '' || $imageData === '') {
            return response()->json(['error' => 'session_id and image_data are required'], 400);
        }

        $this->ensureSession($request, $sessionId, 'Image Generation');

        $image = GeneratedImage::create([
            'session_id' => $sessionId,
            'user_id' => $request->user()->id,
            'message_id' => $request->input('message_id'),
            'image_data' => $imageData,
            'mime_type' => $request->input('mime_type', 'image/png'),
            'prompt' => $request->input('prompt'),
            'model' => $request->input('model', 'gemini-3-pro-image-preview'),
            'aspect_ratio' => $request->input('aspect_ratio', '4:3'),
            'image_size' => $request->input('image_size', '4K'),
            'is_edited' => (bool) $request->input('is_edited', false),
            'parent_image_id' => $request->input('parent_image_id'),
        ]);

        return response()->json([
            'status' => 'saved',
            'image_id' => $image->id,
            'created_at' => $image->created_at?->toJSON(),
        ]);
    }

    /**
     * Most recent generated image in a session (used as the edit reference).
     */
    public function last(Request $request): JsonResponse
    {
        $sessionId = (string) $request->query('session_id', '');

        if ($sessionId === '') {
            return response()->json(['error' => 'session_id is required'], 400);
        }

        $image = GeneratedImage::where('session_id', $sessionId)
            ->where('user_id', $request->user()->id)
            ->orderByDesc('created_at')
            ->first();

        return response()->json([
            'image' => $image === null ? null : $this->generatedMetadata($image, includeData: true),
        ]);
    }

    /**
     * Generated images for a session; data is included only when asked for,
     * and can be narrowed to specific client message ids.
     */
    public function sessionImages(Request $request): JsonResponse
    {
        $sessionId = (string) $request->query('session_id', '');

        if ($sessionId === '') {
            return response()->json(['error' => 'session_id is required'], 400);
        }

        $includeData = $request->query('include_data') === 'true';
        $messageIds = array_filter(explode(',', (string) $request->query('message_ids', '')));
        $messageId = (string) $request->query('message_id', '');

        if ($messageId !== '') {
            $messageIds = [$messageId];
        }

        $query = GeneratedImage::where('session_id', $sessionId)
            ->where('user_id', $request->user()->id)
            ->orderBy('created_at');

        if ($messageIds !== []) {
            $query->whereIn('message_id', $messageIds);
        }

        $images = $query->get()
            ->map(fn (GeneratedImage $image): array => $this->generatedMetadata($image, $includeData));

        return response()->json(['images' => $images, 'lazyLoad' => ! $includeData]);
    }

    /**
     * Uploaded-image metadata for a session (or of a single message).
     */
    public function uploaded(Request $request): JsonResponse
    {
        $sessionId = (string) $request->query('session_id', '');

        if ($sessionId === '') {
            return response()->json(['error' => 'session_id is required'], 400);
        }

        $includeData = $request->query('include_data') === 'true';
        $messageId = (string) $request->query('message_id', '');

        $query = UploadedImage::where('session_id', $sessionId)
            ->where('user_id', $request->user()->id)
            ->orderBy('created_at');

        if ($messageId !== '') {
            $query->where('message_id', $messageId);
        }

        $images = $query->get()
            ->map(fn (UploadedImage $image): array => $this->uploadedMetadata($image, $includeData));

        return response()->json(['images' => $images, 'lazyLoad' => ! $includeData]);
    }

    /**
     * Batch-save user-uploaded images for a message.
     */
    public function saveUploaded(Request $request): JsonResponse
    {
        $sessionId = (string) $request->input('session_id', '');
        $images = $request->input('images');

        if ($sessionId === '' || ! is_array($images) || $images === []) {
            return response()->json(['error' => 'session_id and images array are required'], 400);
        }

        $this->ensureSession($request, $sessionId, 'Image Upload');

        $saved = [];

        foreach ($images as $image) {
            if (! is_array($image) || empty($image['image_data'])) {
                continue;
            }

            $record = UploadedImage::create([
                'session_id' => $sessionId,
                'user_id' => $request->user()->id,
                'message_id' => $request->input('message_id'),
                'image_data' => (string) $image['image_data'],
                'mime_type' => $image['mime_type'] ?? 'image/png',
                'original_filename' => $image['original_filename'] ?? null,
                'file_size' => $image['file_size'] ?? null,
            ]);

            $saved[] = [
                'id' => $record->id,
                'created_at' => $record->created_at?->toJSON(),
                'original_filename' => $record->original_filename,
            ];
        }

        return response()->json(['status' => 'saved', 'images' => $saved]);
    }

    /**
     * One uploaded image. `?raw=true` streams the decoded bytes.
     */
    public function showUploaded(Request $request, string $id): JsonResponse|Response
    {
        $image = UploadedImage::where('id', $id)
            ->where('user_id', $request->user()->id)
            ->first();

        if ($image === null) {
            return response()->json(['error' => 'Image not found'], 404);
        }

        if ($request->query('raw') === 'true') {
            return $this->rawResponse($image->image_data, $image->mime_type);
        }

        return response()->json(['image' => [
            'id' => $image->id,
            'image_data' => $image->image_data,
            'mime_type' => $image->mime_type,
            'original_filename' => $image->original_filename,
            'file_size' => $image->file_size,
            'created_at' => $image->created_at?->toJSON(),
        ]]);
    }

    public function destroyUploaded(Request $request, string $id): JsonResponse
    {
        UploadedImage::where('id', $id)
            ->where('user_id', $request->user()->id)
            ->delete();

        return response()->json(['status' => 'deleted']);
    }

    /**
     * One generated image. `?raw=true` streams the decoded bytes.
     */
    public function showGenerated(Request $request, string $id): JsonResponse|Response
    {
        $image = GeneratedImage::where('id', $id)
            ->where('user_id', $request->user()->id)
            ->first();

        if ($image === null) {
            return response()->json(['error' => 'Image not found'], 404);
        }

        if ($request->query('raw') === 'true') {
            return $this->rawResponse($image->image_data, $image->mime_type);
        }

        return response()->json(['image' => $this->generatedMetadata($image, includeData: true)]);
    }

    public function destroyGenerated(Request $request, string $id): JsonResponse
    {
        GeneratedImage::where('id', $id)
            ->where('user_id', $request->user()->id)
            ->delete();

        return response()->json(['status' => 'deleted']);
    }

    /**
     * Sessions are client-created; image writes may arrive first, so create a
     * placeholder session to satisfy the foreign key.
     */
    private function ensureSession(Request $request, string $sessionId, string $title): void
    {
        $existing = ChatSession::find($sessionId);

        if ($existing !== null) {
            abort_if($existing->user_id !== $request->user()->id, 404, 'Session not found');

            return;
        }

        ChatSession::create([
            'session_id' => $sessionId,
            'user_id' => $request->user()->id,
            'username' => $request->user()->username,
            'title' => $title,
        ]);
    }

    /**
     * @return array<string, mixed>
     */
    private function generatedMetadata(GeneratedImage $image, bool $includeData): array
    {
        $payload = [
            'id' => $image->id,
            'message_id' => $image->message_id,
            'mime_type' => $image->mime_type,
            'prompt' => $image->prompt,
            'model' => $image->model,
            'aspect_ratio' => $image->aspect_ratio,
            'image_size' => $image->image_size,
            'is_edited' => $image->is_edited,
            'parent_image_id' => $image->parent_image_id,
            'created_at' => $image->created_at?->toJSON(),
        ];

        if ($includeData) {
            $payload['image_data'] = $image->image_data;
        }

        return $payload;
    }

    /**
     * @return array<string, mixed>
     */
    private function uploadedMetadata(UploadedImage $image, bool $includeData): array
    {
        $payload = [
            'id' => $image->id,
            'message_id' => $image->message_id,
            'mime_type' => $image->mime_type,
            'original_filename' => $image->original_filename,
            'file_size' => $image->file_size,
            'created_at' => $image->created_at?->toJSON(),
        ];

        if ($includeData) {
            $payload['image_data'] = $image->image_data;
        }

        return $payload;
    }

    private function rawResponse(string $base64, string $mimeType): Response
    {
        $bytes = base64_decode($base64, true);

        return response($bytes === false ? '' : $bytes, 200, [
            'Content-Type' => $mimeType ?: 'image/png',
            'Cache-Control' => 'public, max-age=31536000',
        ]);
    }
}
