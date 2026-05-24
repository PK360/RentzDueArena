# Promptfoo Bot Evals

This folder adds one promptfoo-based eval harness for all three Rentz Arena bot surfaces:

- Gameplay Bot AI
- Trainer Bot AI
- Editor Bot / Ruleset Judge AI

The goal is to keep eval plumbing close to the real backend interfaces instead of inventing a parallel prompt stack.

## What Reuses Production Code

- Gameplay bot evals reuse `backend/src/lib/bots.js` prompt payload shaping via `buildBotPromptPayload`, plus the real ELO/rank helpers and legal-move contracts.
- Trainer bot evals call the real `generateTrainerPreMoveComment`, `evaluateTrainerPlayerMove`, and `generateTrainerFinalReview` interfaces.
- Editor bot evals call the real `reviewRulesetWithEditorBot` pipeline so prompt construction, warmup, repair, sanitization, and fallback stay aligned with production.

## Mock Mode vs Real Mode

Mock mode is the default.

```bash
npm run eval:bots:mock
```

Mock mode behavior:

- Gameplay bot provider uses the real gameplay prompt payload contract, then returns deterministic legal moves from fixture expectations.
- Trainer bot provider exercises the real Trainer interfaces in deterministic mock mode, while real-mode evals require an actual `llm` source.
- Editor bot provider calls the real judge pipeline with deterministic mocked fetch responses for sanitizer/parser cases, plus explicit fallback/compiler-error cases.

Real mode is opt-in:

```bash
npm run eval:gameplay-bot:fast
npm run eval:gameplay-bot:real
npm run eval:trainer-bot:fast
npm run eval:trainer-bot:real
npm run eval:editor-bot:fast
npm run eval:editor-bot:cloud
npm run eval:editor-bot:deep
```

## Commands

Run all suites:

```bash
npm run eval:bots
npm run eval:bots:real
```

Run one suite:

```bash
npm run eval:gameplay-bot:mock
npm run eval:gameplay-bot:fast
npm run eval:gameplay-bot:real
npm run eval:trainer-bot:mock
npm run eval:trainer-bot:fast
npm run eval:trainer-bot:real
npm run eval:editor-bot:mock
npm run eval:editor-bot:fast
npm run eval:editor-bot:cloud
npm run eval:editor-bot:deep
```

Connectivity checks:

```bash
npm run check:gameplay-ollama
npm run check:trainer-ollama
npm run check:editor-cloud
```

Open the promptfoo viewer:

```bash
npm run eval:bots:view
```

## Environment Variables

Promptfoo providers now load env files explicitly in this order without overriding inline shell vars:

1. repo root `.env`
2. repo root `.env.local`
3. `backend/.env`
4. `backend/.env.local`

Safe defaults:

```text
PROMPTFOO_USE_REAL_OLLAMA=false
PROMPTFOO_USE_REAL_CLOUD=false
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_GAMEPLAY_MODEL=llama3.2:3b
OLLAMA_TRAINER_MODEL=qwen2.5:7b
OLLAMA_TRAINER_FAST_MODEL=qwen2.5:7b
OLLAMA_TRAINER_EVAL_MODEL=qwen2.5:7b
RENTZ_GAMEPLAY_BOT_MODE=live
RENTZ_TRAINER_MODE=fast
RENTZ_EDITOR_BOT_MODE=fast
OLLAMA_EDITOR_BOT_MODEL=gpt-oss:120b-cloud
OLLAMA_EDITOR_BOT_BASE_URL=https://ollama.com/api
OLLAMA_EDITOR_BOT_NUM_PREDICT=1600
PROMPTFOO_BOT_DECISION_TIMEOUT_MS=120000
```

Notes:

- În backend, timeout-ul pentru gameplay și trainer se rezolvă acum în ordinea:
  - gameplay live: `RENTZ_GAMEPLAY_BOT_LIVE_TIMEOUT_MS` -> `RENTZ_BOT_DECISION_TIMEOUT_MS`
  - gameplay eval: `RENTZ_GAMEPLAY_BOT_EVAL_TIMEOUT_MS` -> `RENTZ_BOT_DECISION_TIMEOUT_MS`
  - trainer fast: `RENTZ_TRAINER_FAST_TIMEOUT_MS` / `RENTZ_TRAINER_COMMENT_TIMEOUT_MS` / `RENTZ_TRAINER_FEEDBACK_TIMEOUT_MS` -> `RENTZ_BOT_DECISION_TIMEOUT_MS`
  - trainer deep: `RENTZ_TRAINER_EVAL_TIMEOUT_MS` -> `RENTZ_BOT_DECISION_TIMEOUT_MS`
- Pentru runtime-ul normal al aplicației, cel mai clar este să setezi explicit în `backend/.env`:
  - `RENTZ_GAMEPLAY_BOT_LIVE_TIMEOUT_MS=20000`
  - `RENTZ_TRAINER_FAST_TIMEOUT_MS=20000`
  - `RENTZ_BOT_DECISION_TIMEOUT_MS=20000` ca fallback comun
- Pentru promptfoo, valorile din `package.json` sunt trimise inline și au prioritate peste `.env`. Asta înseamnă că schimbarea din `backend/.env` nu modifică automat `npm run eval:gameplay-bot:fast`, `npm run eval:trainer-bot:fast` etc. Dacă vrei alt timeout pentru evaluri, modifici scriptul sau rulezi comanda cu variabila inline.
- `eval:bots:mock` and `eval:bots:real` run the three suite configs sequentially via `evals/promptfoo/run-all.js`.
- Fast suites use the compact live/interactive bot modes and add practical latency budgets.
- Real or deep suites keep long local/cloud timeouts and measure quality without accepting fallback for normal cases.
- `evals/promptfoo/bots.promptfooconfig.yaml` is included as a combined manifest reference, but the sequential runner is the primary entry point.
- The trainer and gameplay prompt text lives inside backend JS functions, so the prompt files in this folder are routing markers and documentation stubs, not the source of truth for production prompting.
- Editor eval debug entries are written to `.promptfoo/logs/editor-bot-eval-debug.ndjson` with case id, source hash, compiler status, provider mode, result source, and short previews.
- Real local Ollama evals use `--max-concurrency 1` and a long timeout because even tiny local prompts can take tens of seconds on slower models.
- Provider metadata includes safe config diagnostics such as env files found, resolved models/base URLs, timeout, and whether the editor API key is present, but never prints the secret itself.

## Folder Layout

- `providers/`: custom promptfoo providers for gameplay, trainer, and editor bot eval calls
- `shared/`: repo-aware helpers, JSON parsing, and Rentz fixtures
- `gameplay-bot/`: split mock vs real configs and cases for move-selection evals
- `trainer-bot/`: split mock vs real configs and cases for before/after/final trainer outputs
- `editor-bot/`: split mock/synthetic vs real-cloud configs and `.rentz` fixtures for ruleset judging

## Assertions

Shared themes across the suites:

- valid JSON output
- no chain-of-thought or hidden reasoning phrases
- latency/length sanity checks

Gameplay-specific checks:

- legal move only
- no invented cards
- confidence range
- ELO/rank mapping
- deterministic strategic expectation cases

Trainer-specific checks:

- rating ranges
- no hidden-card leakage
- constructive tone
- recommendation presence on bad moves
- final review avoids numeric score text

Editor-specific checks:

- exact four-category schema
- score ranges
- emoji validity
- explanation cleanliness
- warnings/recommendations arrays
- scenario-specific calibration expectations

## Adding New Cases

1. Add a new entry to the suite `cases.yaml`.
2. Reuse existing assertions by expressing the expectation through `vars` when possible.
3. If the case needs new structure or safety checks, extend that suite’s `assertions.js`.
4. If the provider needs a new deterministic mock path, add one in the relevant provider.

## Known Limitations

- Gameplay bot mock mode uses a thin adapter instead of injecting fake model outputs into `chooseBotMove`, because the gameplay parser path is not exported independently from the LangChain call site.
- Promptfoo was installed with `npm install --ignore-scripts` to avoid an unnecessary native optional dependency build during setup. The promptfoo CLI itself is available and the eval commands run locally from the checked-in dependency.
