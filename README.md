# ExpertLLM

A Perplexity-style conversational AI answer engine. It takes a question, calls a Google Vertex AI model, and returns an answer that can be checked against its sources.

> **Status:** Prototype (Sep 2025 – Mar 2026). The live server is **offline** because I could not cover the hosting cost.

## What it does
- Chat interface: the user asks a question and gets an AI-generated answer.
- [FILL IN: does it show sources? does it keep conversation history?]
- Prompts are designed and iterated by me to shape response style and accuracy.

## Architecture
```
Browser (index.html)  ->  Node.js server (server.js)  ->  Google Vertex AI (LLM)
                              hosted on a GCP VM
```
- **Frontend:** a single `index.html` (HTML/JavaScript).
- **Backend:** `server.js` (Node.js) receives the request, builds the prompt, and calls the Vertex AI API.
- **Hosting:** Google Cloud Compute Engine VM.
- **Data format:** JSON between frontend and backend.

## How I evaluated answers
I reviewed outputs for accuracy by comparing answers against their sources, then adjusted the prompts. 

## Run it locally
```bash
git clone https://github.com/Octauuuzy/expertllm.git
cd expertllm
npm install            # if a package.json exists
cp .env.example .env   # add your own Google Cloud credentials
node server.js
```
Then open `index.html` (or the URL printed by the server).
You need your own Google Cloud project with Vertex AI enabled. **No keys or credentials are included in this repo.**

## Built with
AI-assisted development (I direct the AI, then read, test, and debug the output), Node.js, JavaScript, HTML, Google Vertex AI, Google Cloud (VM), Git/GitHub.

## What I learned
- Writing and iterating prompts, and checking LLM answers against sources.
- Connecting a frontend to an LLM API through a backend, using JSON.
- Deploying to a cloud VM, and the real cost of keeping an AI service online.

## Limitations
- Prototype only: no authentication, rate limiting, or automated tests.
