# Backend Setup

## Quick Start

From the repo root:

```bash
./install-node.sh
cp backend/.env.example backend/.env
npm run db:start
cd backend
npm start
```

If you also want AI bots backed by Ollama:

```bash
curl -fsSL https://ollama.com/install.sh | sh
ollama serve
ollama pull llama3.1:8b
```

Then start the backend in another terminal:

```bash
cd backend
npm start
```

## Dependency Install

The project expects Node 20+.

Install all repo dependencies from the root:

```bash
npm run install:all
```

If you only want backend dependencies:

```bash
cd backend
npm install
```

## Environment File

Create the backend env file:

```bash
cp backend/.env.example backend/.env
```

Default local MongoDB URI:

```text
mongodb://127.0.0.1:27017/rentz-arena
```

That URI is correct when you run the backend directly on your machine and MongoDB is exposed on localhost.

## MongoDB Commands

### Option A: Recommended Docker MongoDB

From the repo root:

```bash
npm run db:start
npm run db:logs
npm run db:stop
```

Direct Docker Compose equivalents:

```bash
docker compose up -d mongo
docker compose logs -f mongo
docker compose stop mongo
```

### Option B: Local MongoDB Server

If you already have MongoDB installed locally, start it with something like:

```bash
mongod --dbpath ~/mongodb-data --bind_ip 127.0.0.1 --port 27017
```

If the data directory does not exist yet:

```bash
mkdir -p ~/mongodb-data
mongod --dbpath ~/mongodb-data --bind_ip 127.0.0.1 --port 27017
```

## AI Bot / Ollama Commands

Computer players use LangChain with Ollama.

Install Ollama:

```bash
curl -fsSL https://ollama.com/install.sh | sh
```

Start the Ollama server:

```bash
ollama serve
```

If you change `RENTZ_BOT_OLLAMA_MODEL` in `backend/.env`, pull that exact model instead:

```bash
ollama pull qwen2.5:7b
```

Useful Ollama checks:

```bash
ollama list
curl http://127.0.0.1:11434/api/tags
```

Promptfoo-based bot eval docs live at [evals/promptfoo/README.md](/home/alexn/FMI/MDS/RentzArena/evals/promptfoo/README.md).

## Bot and Abandonment Settings

These backend env values control AI seats and abandonment replacement:

```text
RENTZ_ABANDONMENT_TIMEOUT_MS=120000
RENTZ_AUTO_BOT_REPLACEMENT=true
RENTZ_BOT_ACTION_DELAY_MS=900
RENTZ_BOT_DECISION_TIMEOUT_MS=6000
RENTZ_BOT_OLLAMA_BASE_URL=http://127.0.0.1:11434
RENTZ_BOT_OLLAMA_MODEL=qwen2.5:7b
RENTZ_EDITOR_BOT_TIMEOUT_MS=60000
RENTZ_EDITOR_BOT_NUM_PREDICT=900
RENTZ_EDITOR_BOT_OLLAMA_BASE_URL=https://ollama.com/api
RENTZ_EDITOR_BOT_OLLAMA_MODEL=gpt-oss:120b-cloud
RENTZ_EDITOR_BOT_FULL_OLLAMA_MODEL=gpt-oss:120b-cloud
RENTZ_EDITOR_BOT_LEAN_OLLAMA_MODEL=gpt-oss:120b-cloud
# Optional when your Ollama-compatible endpoint requires auth:
# RENTZ_EDITOR_BOT_OLLAMA_AUTH_TOKEN=...
EDITOR_AI_LOG_ENABLED=true
EDITOR_AI_LOG_PATH=logs/editor-ai.log.txt
EDITOR_AI_LOG_VERBOSE=false
```

Notes:
- If Ollama is unavailable, bot turns fall back to deterministic legal moves instead of freezing the game.
- Bot difficulty is derived from the average ELO of non-bot active players, defaulting to `500` when no human ELO is present.
- Mixed human/bot games only update human ELO, and abandoned players that get replaced by bots are excluded from ELO updates.
- Gameplay bots keep using `RENTZ_BOT_OLLAMA_MODEL`; the Editor Bot cloud model is configured separately and does not change in-game bot behavior.
- If you prefer a local Editor Bot, point `RENTZ_EDITOR_BOT_OLLAMA_BASE_URL` back to `http://127.0.0.1:11434` and choose a local model such as `llama3.2:3b`.
- The backend also accepts `OLLAMA_EDITOR_BOT_MODEL`, `OLLAMA_EDITOR_BOT_FULL_MODEL`, `OLLAMA_EDITOR_BOT_LEAN_MODEL`, `OLLAMA_EDITOR_BOT_BASE_URL`, `OLLAMA_EDITOR_BOT_TIMEOUT_MS`, `OLLAMA_EDITOR_BOT_NUM_PREDICT`, and `OLLAMA_EDITOR_BOT_AUTH_TOKEN` as aliases for the Editor Bot-specific Ollama settings.
- Editor AI logs are written to `backend/logs/editor-ai.log.txt` by default when the backend runs from the `backend` directory.
- Warmup failures are logged, non-fatal, and do not disable later Ruleset Judgment requests.
- `EDITOR_AI_LOG_VERBOSE=true` adds a short safe ruleset preview to the log, but never writes auth tokens or full session data.

## Start Commands

Start just the backend:

```bash
cd backend
npm start
```

Start MongoDB and the backend together with Docker:

```bash
npm run stack:start
npm run stack:logs
npm run stack:stop
```

Notes:
- The Docker backend service automatically uses `mongodb://mongo:27017/rentz-arena`.
- You do not need to change your local `backend/.env` to make Docker work.
- Keep `backend/.env` using `127.0.0.1` for non-Docker local runs.

## Health Check

After the backend is running, verify the database connection:

```bash
curl http://localhost:4000/api/health
```

The response includes database connection state, host, and database name.
