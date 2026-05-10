#!/bin/bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_ENV_EXAMPLE="$REPO_ROOT/backend/.env.example"
BACKEND_ENV_FILE="$REPO_ROOT/backend/.env"
DEFAULT_OLLAMA_MODEL="llama3.1:8b"

echo "Installing Node.js 20 with nvm..."
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.5/install.sh | bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
nvm install 20
nvm alias default 20
nvm use 20

echo "Node version: $(node --version)"
echo "npm version: $(npm --version)"

echo "Installing project dependencies..."
cd "$REPO_ROOT"
npm install
(cd backend && npm install)
(cd frontend && npm install)

if [ ! -f "$BACKEND_ENV_FILE" ] && [ -f "$BACKEND_ENV_EXAMPLE" ]; then
  echo "Creating backend/.env from backend/.env.example..."
  cp "$BACKEND_ENV_EXAMPLE" "$BACKEND_ENV_FILE"
fi

echo
echo "MongoDB commands:"
echo "  Start with Docker:   npm run db:start"
echo "  View logs:           npm run db:logs"
echo "  Stop MongoDB:        npm run db:stop"
echo "  Docker direct:       docker compose up -d mongo"
echo "  Local mongod:        mkdir -p ~/mongodb-data && mongod --dbpath ~/mongodb-data --bind_ip 127.0.0.1 --port 27017"

if command -v docker >/dev/null 2>&1; then
  echo
  echo "Starting MongoDB container now..."
  npm run db:start
else
  echo
  echo "Docker is not installed or not on PATH. Start MongoDB manually with one of the commands above."
fi

echo
echo "Ollama / AI bot commands:"
echo "  Install Ollama:      curl -fsSL https://ollama.com/install.sh | sh"
echo "  Start Ollama:        ollama serve"
echo "  Pull default model:  ollama pull ${DEFAULT_OLLAMA_MODEL}"
echo "  Check models:        ollama list"

if command -v ollama >/dev/null 2>&1; then
  BOT_MODEL="$DEFAULT_OLLAMA_MODEL"
  if [ -f "$BACKEND_ENV_FILE" ]; then
    ENV_MODEL="$(grep -E '^RENTZ_BOT_OLLAMA_MODEL=' "$BACKEND_ENV_FILE" | tail -n 1 | cut -d'=' -f2- || true)"
    if [ -n "${ENV_MODEL:-}" ]; then
      BOT_MODEL="$ENV_MODEL"
    fi
  fi

  echo
  echo "Pulling configured Ollama model: $BOT_MODEL"
  ollama pull "$BOT_MODEL"
else
  echo
  echo "Ollama is not installed yet. Install it, run 'ollama serve', then pull the configured model."
fi

echo
echo "Backend start commands:"
echo "  Local backend:       cd backend && npm start"
echo "  Full Docker stack:   npm run stack:start"
echo "  Health check:        curl http://localhost:4000/api/health"
