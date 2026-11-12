<!DOCTYPE html>
<html lang="en">

<head>
    @include('partials.head-scripts')
    <link rel="stylesheet" href="{{ asset('css/app.css') }}">
    <link rel="stylesheet" href="{{ asset('css/auth.css') }}">
    <link rel="stylesheet" href="{{ asset('css/devtools.css') }}">
</head>

<body>
    @include('partials.landing')
    @include('partials.chat')
    @include('partials.auth')
    @include('partials.devtools')

    {{-- Values the frontend needs that must match server config, injected
         before any app script runs. --}}
    <script>
        window.__APP_CONFIG__ = {!! json_encode([
            'vertexProjectId' => config('services.vertex.project_id'),
            'geminiApiEnabled' => (string) config('services.gemini.api_key') !== '',
            'directBackendUrl' => '',
        ], JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT) !!};
    </script>

    {{-- Loaded as classic scripts (not modules): the ported app is built around
         global functions referenced from inline onclick handlers. --}}
    <script src="{{ asset('js/app.js') }}"></script>
    <script src="{{ asset('js/auth-sync.js') }}"></script>
    <script src="{{ asset('js/devtools.js') }}"></script>
    <script src="{{ asset('js/landing-init.js') }}"></script>
</body>

</html>
