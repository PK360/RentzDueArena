# CI/CD

Rentz Arena uses GitHub Actions for stable continuous integration and a manual deployment workflow prepared for the team server.

## CI Overview

CI is fully automated on push and pull requests targeting `main` and `develop`.

The workflow lives at [.github/workflows/ci.yml](/home/alexn/FMI/MDS/RentzArena/.github/workflows/ci.yml) and does the following:

- checks out the repository
- sets up Node.js 22
- installs dependencies at the repo root, `backend`, and `frontend`
- runs the existing root test helpers
- runs the mock Promptfoo bot eval suite
- builds the frontend
- attempts a backend build only if a backend build script exists

The CI environment is intentionally safe for pull requests:

- `NODE_ENV=test`
- `CI=true`
- `PROMPTFOO_USE_REAL_OLLAMA=false`
- `PROMPTFOO_USE_REAL_CLOUD=false`
- `AUTH_JWT_SECRET=test-jwt-secret`

Backend integration tests already use `mongodb-memory-server`, so CI does not need MongoDB Atlas or a real local Mongo deployment.

## Bot Eval Policy

Required CI only runs hosted-safe evals:

- `npm run eval:bots:mock`

Required CI does not run:

- `eval:gameplay-bot:real`
- `eval:trainer-bot:fast`
- `eval:trainer-bot:real`
- `eval:editor-bot:cloud`
- any local Ollama-dependent lane

This keeps pull request validation stable and avoids random failures caused by missing local models, cloud credentials, or slow hosted runners.

## Manual Bot Evals

The optional manual workflow lives at [.github/workflows/bot-evals.yml](/home/alexn/FMI/MDS/RentzArena/.github/workflows/bot-evals.yml).

Trigger it from the GitHub Actions tab with `workflow_dispatch` and choose one of these inputs:

- `mock`: runs the hosted-safe mock suite
- `stable`: currently runs the repo’s stable alias, which resolves to the hosted-safe bot eval suite in this project
- `editor-cloud`: runs the Editor Bot cloud eval only when the `OLLAMA_API_KEY` secret is configured

Real local Ollama evals are not part of GitHub-hosted CI. If the team wants those later, they should run on a self-hosted runner with the required models installed.

## Deployment Workflow

The deployment workflow lives at [.github/workflows/deploy.yml](/home/alexn/FMI/MDS/RentzArena/.github/workflows/deploy.yml).

CD is prepared as a manual GitHub Actions workflow that deploys to the team server via SSH by pulling the latest code, installing dependencies, building the frontend, and restarting the backend process. The workflow can be enabled once the server secrets are configured.

Why it is manual for now:

- production server access is currently managed externally by a teammate
- deployment secrets should be added only when the server setup is ready
- this avoids accidental pushes to a server that is not yet under the team’s control in GitHub

## Deployment Process

When manually triggered, the deploy workflow:

- connects to the server with SSH
- changes into the configured deployment directory
- fetches and pulls the selected branch
- installs root dependencies with `npm ci` or `npm install`
- installs backend dependencies with `npm ci` or `npm install`
- installs frontend dependencies with `npm ci` or `npm install`
- builds the frontend with `npm run build`
- restarts the backend with PM2 using the configured app name
- optionally calls a health endpoint after restart if `SERVER_HEALTH_URL` is configured

The workflow does not overwrite the server `.env`. Production environment files stay on the server and are not stored in the repository.

## Required GitHub Secrets

Configure these repository secrets before using deployment:

- `SERVER_HOST`
- `SERVER_USER`
- `SERVER_SSH_KEY`
- `SERVER_PORT`
- `DEPLOY_PATH`

Optional deployment configuration:

- repository variable `PM2_APP_NAME`
- repository variable `DEPLOY_BRANCH`
- secret `SERVER_HEALTH_URL`

Optional manual eval secret:

- `OLLAMA_API_KEY`

## Expected Server Layout

The current deploy workflow assumes:

- the repository is already cloned on the server
- the deployment path points at that working tree
- Node.js and npm are already installed on the server
- PM2 is installed if automatic restart is desired
- the backend entrypoint remains `backend/index.js`

If PM2 is not installed, the workflow still completes the pull and build steps, then prints a manual restart note.

## What Still Needs To Be Configured Later

Once teammate-managed server access is available, the team still needs to:

- add the GitHub deployment secrets
- confirm the server checkout path
- confirm the PM2 process name
- ensure the production `.env` already exists on the server
- optionally provide a public or internal health URL for post-deploy verification
