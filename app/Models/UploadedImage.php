<?php

namespace App\Models;

use Database\Factories\UploadedImageFactory;
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
    'original_filename',
    'file_size',
])]
class UploadedImage extends Model
{
    /** @use HasFactory<UploadedImageFactory> */
    use HasFactory;

    /**
     * @return BelongsTo<ChatSession, $this>
     */
    public function session(): BelongsTo
    {
        return $this->belongsTo(ChatSession::class, 'session_id', 'session_id');
    }
}
