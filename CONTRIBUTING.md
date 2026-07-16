# Contributing

AeroTravel is intentionally small: FastAPI backend, static vanilla frontend, no database, no auth, and no frontend build step. Keep changes incremental and reviewable.

## Branches and Commits

- Branch from `master` using `codex/<short-name>`, `feature/<short-name>`, `fix/<short-name>`, or `chore/<short-name>`.
- Keep branches short-lived and focused on one outcome.
- Use conventional commit prefixes: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`.
- Do not mix behavior changes with broad formatting or unrelated cleanup.

## Local Setup

```powershell
pip install -r requirements.txt
pip install -r requirements-dev.txt
Copy-Item .env.example .env
pre-commit install
```

## Required Checks

Run these before requesting review:

```powershell
.\scripts\check.ps1
.\scripts\security.ps1
```

Browser-facing changes also need a smoke check: page loads, console is clean, map renders, and the initial itinerary appears.

## Code Style

- Use UTF-8. Repository text files use LF line endings; Windows batch files use CRLF.
- Let `.editorconfig` control indentation, final newlines, and trailing whitespace.
- Run `pre-commit run --all-files` before the first commit and after changing tooling configuration.
- Keep Python lines within 120 characters where practical. Use four spaces for Python and two spaces for JavaScript, JSON, and YAML.
- Keep frontend modules dependency-free and expose focused browser APIs through the existing `window.AeroTravel*` namespaces.
- Add or update offline tests with behavior changes. Do not make the default test suite depend on live third-party services.

## Review Rules

- Public API response changes require explicit review notes and updated tests.
- Architecture, persistence/auth, launch, or dependency policy changes require documentation updates and often an ADR.
- Do not add a database, login system, frontend framework, build step, or required paid API without explicit approval and an ADR.
- External API responses and LLM output are untrusted. Validate and escape before rendering.

## Directory Boundaries

- `server.py`: application composition only.
- `routers/`: FastAPI routes and HTTP error mapping.
- `schemas/`: request/response models.
- `clients/`: external HTTP clients.
- `services/`: transport/data service integrations and cache helpers.
- `planner/`: itinerary generation, prompt, hydration, and transport business rules.
- `static/`: no-build browser modules loaded from `index.html`.
- `docs/engineering/`: team process, release, and change-management rules.
