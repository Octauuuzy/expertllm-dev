# ExpertLLM

A multi-model AI chat workspace with **sourced web research**, **image
generation**, and **file/OCR** support — ported from a single 13,000-line
`index.html` into a Laravel application.

The frontend is a server-rendered Blade shell; the backend is a stateless JSON
API authenticated with bearer tokens.

![Chat interface](docs/screenshots/chat.png)

<details>
<summary>Landing page</summary>

![Landing page](docs/screenshots/landing.png)

</details>

## What it does

The original app was one HTML file containing the markup, ~3,800 lines of CSS
and ~8,000 lines of JavaScript, talking to a Node/Express server. This repo
keeps the interface and behaviour and rebuilds the backend in Laravel.

### Chat with multiple providers

Seven models across three providers, switchable per conversation from the
header dropdown:

| Name | Provider | Model |
| --- | --- | --- |
| Fast | Google Vertex | `gemini-3-flash-preview` |
| Thinking | Google Vertex | `gemini-2.5-pro` |
| Expert Thinking | Google Vertex | `gemini-3.1-pro-preview` |
| Deep Thinking | Chutes | `Qwen/Qwen3-235B-A22B-Thinking-2507` |
| DeepSeek V3.1 | OpenRouter | `deepseek/deepseek-chat-v3.1:free` |
| Kimi K2 | Vertex MaaS | `kimi-k2-32k-maas` |
| Kimi K2 Thinking | Vertex MaaS | `kimi-k2-thinking-maas` |

Responses stream token-by-token, with rendered Markdown, syntax-highlighted
code blocks, tables, and MathJax typesetting (`\[…\]` and `$$…$$`).

### Fact Checker mode

A two-mode composer (General / Fact Checker). Fact Checker runs a multi-step
research loop:

1. The model drafts several search queries for the question.
2. Queries go to Google Programmable Search (`/search`).
3. Result pages are fetched and text-extracted (`/fetch-content-batch`), with
   scripts, nav, and boilerplate stripped.
4. The model synthesises an answer citing the sources, which render as
   numbered citation chips with favicons.

### Image generation and editing

With **Create image** enabled, prompts route to `gemini-3-pro-image-preview`
through `/vertex-proxy` and stream back inline image data. Generated images are
persisted per message and can be reopened as the reference for an edit.

### Files and OCR

The composer accepts images, PDFs, Word documents, text, and audio:

- **PDF** — parsed in the browser with pdf.js
- **DOCX** — parsed with mammoth
- **Images** — OCR'd with Tesseract when the selected model has no vision
- **Audio** — sent inline for native transcription

### Everything else

- **Extended thinking** toggle with per-model reasoning budgets
- **Chat history** synced to the server; sessions restore their model and tools
- **Debug console** (`Ctrl+Shift+Q`) and an LLM payload viewer for inspecting
  requests
- **Storage guard** — 50 MB of message text per account, with a warning popup
- Responsive layout down to phone widths, dark mode, and a marketing landing page

## Architecture

```
routes/web.php ──► Blade shell (landing + chat + modals)
                   resources/views/layouts/app.blade.php
                   resources/views/partials/*.blade.php
                   public/css/*.css, public/js/*.js   (no build step)

routes/api.php ──► app/Http/Controllers/Api/*          (mounted at /)
                   ├── AuthController      register / login
                   ├── UserController      profile, preferences
                   ├── ChatController      sessions, messages, history
                   ├── ImageController     generated + uploaded images
                   ├── ProxyController     Vertex AI, OpenRouter, Chutes
                   ├── SearchController    Google Programmable Search
                   └── FetchController     page text extraction
                   app/Services/
                   ├── TokenService        HS256 bearer tokens, rolling refresh
                   ├── VertexTokenService  OAuth via metadata server or service account
                   └── WebFetcher          SSRF-guarded page fetching
```

Design notes:

- **Stateless auth.** Every API request carries `Authorization: Bearer <token>`
  and gets a refreshed token back in `X-Auth-Token`, so sessions never expire
  mid-conversation.
- **No keys in the browser.** Provider credentials live in `.env`; the frontend
  only ever names a *provider*, never a key.
- **The Vertex proxy is not an open proxy.** It only accepts
  `https://…aiplatform.googleapis.com/v1/projects/<VERTEX_PROJECT_ID>/…`, and
  mints its own OAuth token.
- **Primary keys stay server-side.** The ported frontend still contains the
  original in-browser request builders, but the code path that signed JWTs with
  a service-account private key was removed — credentials never leave the
  server.

## Setup

```bash
composer install
cp .env.example .env
php artisan key:generate
php artisan migrate
php artisan serve
```

Open http://localhost:8000. Create an account from the landing page — no
provider keys are needed to browse the UI, but chat and search require the
variables below.

### Configuration

| Variable | Purpose |
| --- | --- |
| `JWT_SECRET` | HMAC key for API tokens. Falls back to `APP_KEY`. |
| `VERTEX_PROJECT_ID` | Google Cloud project used by the Vertex proxy and sent to the frontend. |
| `VERTEX_SERVICE_ACCOUNT_JSON` | Service-account JSON, inline. |
| `GOOGLE_APPLICATION_CREDENTIALS` | Alternative: path to a service-account file. |
| `USE_METADATA_SERVER` | Use the GCE metadata server for Vertex tokens. |
| `OPENROUTER_API_KEY` | OpenRouter key for `/chat/completions`. |
| `CHUTES_API_KEY` | Chutes key for `/chat/completions`. |
| `GOOGLE_SEARCH_API_KEY` + `GOOGLE_SEARCH_CX` | Google Programmable Search. |
| `GOOGLE_SEARCH_KEYS` | Optional JSON array of `{apiKey, cx}` for key rotation. |

## API

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/auth/register`, `/auth/login` | Issue a token |
| GET | `/user/me` | Current profile |
| POST | `/user/preferences` | Save UI preferences |
| GET | `/chat/sessions` | List sessions |
| DELETE | `/chat/sessions/{id}` | Delete a session |
| POST | `/chat/message` | Persist a message |
| GET / DELETE | `/chat/history` | Read or clear history |
| POST | `/images/save` | Store a generated image |
| GET | `/images/last`, `/images/session` | Generated-image lookups |
| POST | `/images/upload` | Batch-store uploaded images |
| GET / DELETE | `/images/uploaded`, `/images/uploaded/{id}` | Uploaded images |
| GET / DELETE | `/images/{id}` | Generated image (`?raw=true` for bytes) |
| POST | `/vertex-proxy` | Vertex AI proxy (URL allow-listed) |
| POST | `/chat/completions` | OpenRouter / Chutes proxy |
| POST | `/search` | Google search |
| POST | `/fetch-content`, `/fetch-content-batch` | Page text extraction |

## Tests

```bash
php artisan test
```

24 feature tests cover:

- registration, duplicate usernames, login normalisation, and token refresh
- 401 vs 403 behaviour and profile/preference persistence
- session creation with derived titles, cross-user session isolation, history
  ordering, and cascade deletes
- image storage, raw byte streaming, and per-user visibility
- the SSRF guard refusing loopback, private, link-local, and metadata URLs

## Production notes

- Set `APP_ENV=production`, `APP_DEBUG=false`, and a strong `JWT_SECRET`.
- Use MySQL or PostgreSQL; SQLite is the development default.
- Serve through nginx/Apache + PHP-FPM, not `php artisan serve`.
- Images are stored as base64 in the database. Move to object storage if
  volume grows.
- The fetch endpoint blocks private/loopback/metadata addresses but not
  DNS rebinding between resolution and request.
- The scraper has no headless-browser tier, so JS-only pages return a per-URL
  error that the frontend skips.

## Licence

MIT
