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
