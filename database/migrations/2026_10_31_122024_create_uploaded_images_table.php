<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * User-uploaded images (pasted/attached pictures sent alongside a message).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('uploaded_images', function (Blueprint $table) {
            $table->id();
            $table->string('session_id', 191);
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('message_id')->nullable();
            $table->longText('image_data');
            $table->string('mime_type')->default('image/png');
            $table->string('original_filename')->nullable();
            $table->unsignedBigInteger('file_size')->nullable();
            $table->timestamps();

            $table->foreign('session_id')
                ->references('session_id')
                ->on('chat_sessions')
                ->cascadeOnDelete();

            $table->index(['session_id', 'created_at']);
            $table->index('message_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('uploaded_images');
    }
};
