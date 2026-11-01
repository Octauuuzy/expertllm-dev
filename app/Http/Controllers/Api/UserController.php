<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class UserController extends Controller
{
    /**
     * Public profile of the authenticated user.
     */
    public function me(Request $request): JsonResponse
    {
        $user = $request->user();

        return response()->json([
            'id' => $user->id,
            'username' => $user->username,
            'email' => $user->email,
            'tier' => $user->tier,
            'preferences' => $user->preferences ?? [],
        ]);
    }

    /**
     * Replace the stored UI preferences blob.
     */
    public function updatePreferences(Request $request): JsonResponse
    {
        $preferences = $request->input('preferences');

        if ($preferences === null) {
            return response()->json(['error' => 'Preferences required'], 400);
        }

        $user = $request->user();
        $user->preferences = is_array($preferences) ? $preferences : [];
        $user->save();

        return response()->json(['status' => 'updated']);
    }
}
