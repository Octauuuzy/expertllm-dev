<?php

use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| Web Routes
|--------------------------------------------------------------------------
|
| The application is a single-page Blade shell. `/c/{id}` mirrors the legacy
| deep-link format the chat script parses out of window.location.pathname.
|
*/

Route::view('/', 'app')->name('app');
Route::view('/c/{id}', 'app')->name('chat.show');
