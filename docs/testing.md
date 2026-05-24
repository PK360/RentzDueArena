# Testing

Rentz Arena now uses `Vitest` as the primary test runner across the repo.

## Install

From the repo root:

```bash
npm install
npm --prefix backend install
npm --prefix frontend install
```

## Run Everything

From the repo root:

```bash
npm test
```

## Targeted Commands

Backend:

```bash
npm --prefix backend run test
npm --prefix backend run test:unit
npm --prefix backend run test:integration
npm --prefix backend run test:watch
npm --prefix backend run test:coverage
```

Frontend:

```bash
npm --prefix frontend run test
npm --prefix frontend run test:watch
npm --prefix frontend run test:coverage
```

Root helpers:

```bash
npm run test:backend
npm run test:frontend
npm run test:unit
npm run test:integration
npm run test:watch
npm run test:coverage
```

## Backend Safety

Backend integration tests use `mongodb-memory-server` through [backend/tests/helpers/testDb.js](/home/alexn/FMI/MDS/RentzArena/backend/tests/helpers/testDb.js).

The backend Vitest setup forces a safe test environment:

- `NODE_ENV=test`
- test JWT secret
- real editor AI logging disabled
- editor/bot Ollama URLs pointed at a dead localhost port
- no production MongoDB URI is used

Tests do not call real AI providers and do not require Ollama, OpenAI, or cloud keys.

## Coverage Areas

Current high-value coverage includes:

- ruleset compiler and evaluator
- game engine and 6-bot turn-order regressions
- ELO/rank logic
- editor AI sanitizer behavior
- auth/account API integration
- forum and notification integration
- socket.io room and play-card smoke flows
- frontend training entry flow and forum reply-preservation helpers

## Artifacts

Generated outputs are ignored by git:

- `coverage/`
- `.vitest/`
- `test-results/`
- backend editor AI log dumps

## Promptfoo Bot Evals

Promptfoo suites for the gameplay bot, trainer bot, and editor bot live under [evals/promptfoo/README.md](/home/alexn/FMI/MDS/RentzArena/evals/promptfoo/README.md).
