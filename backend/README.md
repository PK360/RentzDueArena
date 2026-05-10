# Backend Setup

## MongoDB

1. Copy the example environment file:

```bash
cp backend/.env.example backend/.env
```

2. Start MongoDB with Docker:

```bash
npm run db:start
```

3. Start the backend:

```bash
cd backend
npm start
```

Default MongoDB URI:

```text
mongodb://127.0.0.1:27017/rentz-arena
```

That URI is for running the backend directly on your machine.

## Bot and Abandonment Settings

Computer players use LangChain with an Ollama backend. Add these optional values to `backend/.env` when you want AI seats or automatic abandonment replacement:

```text
RENTZ_ABANDONMENT_TIMEOUT_MS=120000
RENTZ_AUTO_BOT_REPLACEMENT=true
RENTZ_BOT_ACTION_DELAY_MS=900
RENTZ_BOT_DECISION_TIMEOUT_MS=6000
RENTZ_BOT_OLLAMA_BASE_URL=http://127.0.0.1:11434
RENTZ_BOT_OLLAMA_MODEL=llama3.1:8b
```

Notes:
- If Ollama is unavailable, bot turns fall back to deterministic legal moves instead of freezing the game.
- Bot difficulty is derived from the average ELO of non-bot active players, defaulting to `500` when no human ELO is present.
- Mixed human/bot games only update human ELO, and abandoned players that get replaced by bots are excluded from ELO updates.

## Full Local Stack with Docker

If you want one command to start both MongoDB and the backend:

```bash
npm run stack:start
```

Useful commands:

```bash
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

The response now includes database connection state, host, and database name.
