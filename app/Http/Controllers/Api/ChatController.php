<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\ChatMessage;
use App\Models\ChatSession;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class ChatController extends Controller
{
    /**
     * Per-user cloud storage cap for message text, matching the legacy server.
     */
    private const STORAGE_LIMIT_BYTES = 50 * 1024 * 1024;

    /**
     * List the user's chat sessions, newest first.
     */
    public function sessions(Request $request): JsonResponse
    {
        $sessions = ChatSession::where('user_id', $request->user()->id)
            ->orderByDesc('updated_at')
            ->get()
            ->map(fn (ChatSession $session): array => [
                'id' => $session->session_id,
                'title' => $session->title,
                'model' => $session->model,
                'mode' => $session->mode,
                'enabled_tools' => $session->enabled_tools,
                'created_at' => $session->created_at?->toJSON(),
                'updated_at' => $session->updated_at?->toJSON(),
                'section' => $session->mode,
            ]);

        return response()->json($sessions);
    }

    /**
     * Delete one of the user's sessions (messages cascade).
     */
    public function destroySession(Request $request, string $id): JsonResponse
    {
        ChatSession::where('session_id', $id)
            ->where('user_id', $request->user()->id)
            ->delete();

        return response()->json(['status' => 'deleted']);
    }

    /**
     * Persist a single message, creating the session on first write.
     */
    public function storeMessage(Request $request): JsonResponse
    {
        $content = (string) $request->input('content', '');

        if ($content === '') {
            return response()->json(['error' => 'Content required'], 400);
        }

        $user = $request->user();
        $role = (string) $request->input('role', 'user');
        $incomingBytes = strlen($content);

        $usedBytes = (int) ChatMessage::whereIn(
            'session_id',
            ChatSession::where('user_id', $user->id)->select('session_id')
        )->sum(\DB::raw('LENGTH(content)'));

        if ($usedBytes + $incomingBytes > self::STORAGE_LIMIT_BYTES) {
            return response()->json(['error' => 'STORAGE_LIMIT_EXCEEDED'], 403);
        }

        $sessionId = (string) ($request->input('session_id') ?: 'default');

        $session = ChatSession::find($sessionId);

        if ($session !== null && $session->user_id !== $user->id) {
            // Never write into a session that belongs to somebody else, even
            // when the caller guessed its UUID.
            return response()->json(['error' => 'Session not found'], 404);
        }

        if ($session === null) {
            $title = $role === 'user'
                ? mb_substr($content, 0, 30).'...'
                : 'New Chat';

            $session = ChatSession::create([
                'session_id' => $sessionId,
                'user_id' => $user->id,
                'username' => $user->username,
                'title' => $title,
                'model' => $request->input('model'),
                'mode' => $request->input('section'),
                'enabled_tools' => $request->input('enabled_tools'),
            ]);
        } else {
            $session->touch();
        }

        $message = ChatMessage::create([
            'session_id' => $session->session_id,
            'user_id' => $user->id,
            'username' => $user->username,
            'message_id' => $request->input('message_id'),
            'role' => $role,
            'content' => $content,
            'thinking' => $this->jsonColumn($request->input('thinking')),
            'thinking_meta' => $this->jsonColumn($request->input('thinking_meta')),
            'sources' => $this->jsonColumn($request->input('sources')),
        ]);

        return response()->json([
            'status' => 'saved',
            'session_id' => $session->session_id,
            'id' => $message->id,
            'message_id' => $message->message_id,
            'created_at' => $message->created_at?->toJSON(),
        ]);
    }

    /**
     * Full message history for one session, oldest first.
     */
    public function history(Request $request): JsonResponse
    {
        $sessionId = (string) $request->query('session_id', '');

        $ownsSession = ChatSession::where('session_id', $sessionId)
            ->where('user_id', $request->user()->id)
            ->exists();

        if (! $ownsSession) {
            // A chat that was just opened has no row until its first message is
            // saved, so an unknown id means "empty history", not an error. An id
            // that exists but belongs to someone else is still refused.
            if (! ChatSession::where('session_id', $sessionId)->exists()) {
                return response()->json([]);
            }

            return response()->json(['error' => 'Session not found'], 404);
        }

        $messages = ChatMessage::where('session_id', $sessionId)
            ->orderBy('created_at')
            ->orderBy('id')
            ->get()
            ->map(fn (ChatMessage $message): array => [
                'id' => $message->id,
                'message_id' => $message->message_id,
                'role' => $message->role,
                'content' => $message->content,
                'created_at' => $message->created_at?->toJSON(),
                'thinking' => $message->thinking,
                'thinking_meta' => $message->thinking_meta,
                'sources' => $message->sources,
            ]);

        return response()->json($messages);
    }

    /**
     * Wipe every session (and message) belonging to the user.
     */
    public function clearHistory(Request $request): JsonResponse
    {
        ChatSession::where('user_id', $request->user()->id)->delete();

        return response()->json(['status' => 'cleared']);
    }

    /**
     * Serialise an optional structured field the way the legacy API did.
     */
    private function jsonColumn(mixed $value): ?string
    {
        if ($value === null) {
            return null;
        }

        return is_string($value) ? $value : json_encode($value);
    }
}
