<?php

namespace App\Models;

use Database\Factories\GeneratedImageFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

#[Fillable([
    'session_id',
    'user_id',
    'message_id',
    'image_data',
    'mime_type',
    'prompt',
    'model',
    'aspect_ratio',
    'image_size',
    'is_edited',
    'parent_image_id',
])]
class GeneratedImage extends Model
{
    /** @use HasFactory<GeneratedImageFactory> */
    use HasFactory;

    /**
     * @return array<string, string>
     */
    protected function casts(): array
    {
        return [
            'is_edited' => 'boolean',
        ];
    }

    /**
     * @return BelongsTo<ChatSession, $this>
     */
    public function session(): BelongsTo
    {
        return $this->belongsTo(ChatSession::class, 'session_id', 'session_id');
    }
}
