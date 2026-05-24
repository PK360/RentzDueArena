# Rentz Arena

Rentz Arena is a full-stack Rentz project with a React/Vite frontend, a Node/Express/Socket.IO backend, and Promptfoo-based bot evals.

## CI/CD

CI runs automatically on pushes and pull requests for `main` and `develop`. It installs dependencies, runs tests, builds the frontend, and runs stable mock bot evals without requiring real Ollama or cloud AI credentials.

CD is prepared as a manual GitHub Actions workflow that deploys to the team server over SSH. Server secrets must be configured before running deployment. See [docs/ci-cd.md](/home/alexn/FMI/MDS/RentzArena/docs/ci-cd.md) for the full setup and required GitHub secrets.
