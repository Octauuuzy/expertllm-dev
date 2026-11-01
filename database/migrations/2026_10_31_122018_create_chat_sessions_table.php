<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Chat sessions. `session_id` is a client-generated UUID that doubles as the
 * primary key (the legacy schema used it directly), so it is stored as the PK.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('chat_sessions', function (Blueprint $table) {
            $table->string('session_id', 191)->primary();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('username')->nullable();
            $table->string('title')->nullable();
            $table->string('model')->nullable();
            $table->string('mode')->nullable();
            $table->json('enabled_tools')->nullable();
            $table->timestamps();

            $table->index(['user_id', 'updated_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('chat_sessions');
    }
};
