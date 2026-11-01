<?php

namespace App\Models;

use Database\Factories\ChatMessageFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable([
    'session_id',
    'user_id',
    'username',
    'message_id',
    'role',
    'content',
    'thinking',
    'thinking_meta',
    'sources',
])]
class ChatMessage extends Model
{
    /** @use HasFactory<ChatMessageFactory> */
    use HasFactory;

    /**
     * @return BelongsTo<ChatSession, $this>
     */
    public function session(): BelongsTo
    {
        return $this->belongsTo(ChatSession::class, 'session_id', 'session_id');
    }
}
