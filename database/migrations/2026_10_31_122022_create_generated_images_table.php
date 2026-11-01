<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * AI-generated images, stored inline as base64 exactly as the legacy API did
 * so the frontend's data-URI handling keeps working unchanged.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('generated_images', function (Blueprint $table) {
            $table->id();
            $table->string('session_id', 191);
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('message_id')->nullable();
            $table->longText('image_data');
            $table->string('mime_type')->default('image/png');
            $table->text('prompt')->nullable();
            $table->string('model')->default('gemini-3-pro-image-preview');
            $table->string('aspect_ratio', 16)->default('4:3');
            $table->string('image_size', 16)->default('4K');
            $table->boolean('is_edited')->default(false);
            $table->unsignedBigInteger('parent_image_id')->nullable();
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
        Schema::dropIfExists('generated_images');
    }
};
