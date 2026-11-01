<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Persisted chat messages. `message_id` is the client-side id used to correlate
 * streamed bubbles with their stored copies, so it is indexed per session.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('chat_messages', function (Blueprint $table) {
            $table->id();
            $table->string('session_id', 191);
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('username')->nullable();
            $table->string('message_id')->nullable();
            $table->string('role', 32);
            $table->longText('content');
            $table->longText('thinking')->nullable();
            $table->longText('thinking_meta')->nullable();
            $table->longText('sources')->nullable();
            $table->timestamps();

            $table->foreign('session_id')
                ->references('session_id')
                ->on('chat_sessions')
                ->cascadeOnDelete();

            $table->index(['session_id', 'id']);
            $table->index('message_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('chat_messages');
    }
};
