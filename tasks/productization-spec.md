# Spec: AeroTravel Productization

## Objective

Turn AeroTravel from a local single-user demo into a production-ready web application while preserving the current product value: China-focused AI travel planning backed by real POI, weather, train, and flight data.

Productization means the app can be deployed, operated, diagnosed, and changed safely. It does not require adding multi-user accounts or a database unless a later product requirement explicitly needs shared persistence.

## Tech Stack

- Backend: Python 3.10+, FastAPI, httpx, python-dotenv
- Frontend: Static HTML/CSS/vanilla JavaScript, Leaflet
- External services: Amap Web Service API, OpenAI-compatible chat completions, 12306 public train API, optional Juhe flight API
- Persistence: Browser localStorage only for saved trips

## Commands

- Install: `pip install -r requirements.txt`
- Run dev server: `python server.py`
- Optional reload server: `python -m uvicorn server:app --reload --host 0.0.0.0 --port 8000`
- Local checks: `.\scripts\check.ps1`
- Backend syntax: `python -m compileall server.py services`
- Backend tests: `python -m unittest discover -s tests -v`
- Frontend syntax: `node --check static/*.js` via `.\scripts\check.ps1`

## Project Structure

- `server.py`: FastAPI app bootstrap, middleware, router registration, static serving
- `clients/`: Amap and AI API clients
- `core/`: settings and observability helpers
- `planner/`: prompt composition, AI itinerary parsing/hydration, transport enrichment
- `routers/`: FastAPI route modules
- `schemas/`: Pydantic request models
- `services/`: train and flight service integrations
- `static/`: static frontend shell, behavior, and styles
- `docs/`: deployment, rollback, smoke checklist, and ADRs
- `tests/`: unit and regression tests that do not require live third-party services
- `scripts/`: local automation scripts
- `tasks/`: productization plan and implementation backlog
- `.github/workflows/`: CI quality gates

## Code Style

Prefer small pure helpers that can be tested without network access:

```python
def _parse_bool_env(value: str | None, default: bool = False) -> bool:
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}
```

Backend route handlers should validate input at the boundary, call focused helpers/services, and return predictable JSON responses. External API output and LLM output are untrusted until parsed and validated.

## Testing Strategy

- Unit tests cover pure logic: routing helpers, AI output repair, transport direction filtering, price estimation, config parsing.
- Integration-style tests cover FastAPI response headers and config/health routes without requiring external API keys.
- Browser runtime checks are required before shipping UI layout changes.
- Live third-party smoke tests are optional and manual because API keys and network availability vary.

## Boundaries

- Always:
  - Run `.\scripts\check.ps1` before considering a slice done.
  - Keep external API keys out of git, logs, responses, and prompts unless explicitly safe.
  - Escape external data before rendering HTML.
  - Keep productization work incremental and rollback-friendly.
- Ask first:
  - Adding a database or authentication.
  - Replacing vanilla JS with a frontend framework.
  - Adding paid third-party services or required API keys.
  - Changing the app's single-user local-storage model.
- Never:
  - Commit `.env`, real keys, generated caches, or screenshots.
  - Disable tests to make CI pass.
  - Reintroduce wildcard CORS as the production default.
  - Trust LLM output as executable code or raw HTML.

## Success Criteria

- Security:
  - CORS is restricted by default and configurable by environment.
  - Security headers are present on HTTP responses.
  - `/api/config` does not expose client keys by default.
  - User-facing errors do not leak stack traces or secrets.
- Operability:
  - Requests have correlation IDs.
  - Request logs are structured and include method, path, status, and duration.
  - Health checks expose dependency configuration status without secret values.
- Quality gates:
  - Local checks are one command.
  - CI runs equivalent checks on push and pull request.
  - Regression tests cover core planning/transport/config contracts.
- Maintainability:
  - Large files are decomposed behind tests without changing behavior.
  - Prompt templates and API contracts become reviewable artifacts.
- Launch readiness:
  - README documents dev, check, and production configuration.
  - There is a clear deployment/rollback checklist.

## Open Questions

- Preferred production hosting target is not yet specified.
- Public sharing, accounts, and cloud persistence are out of scope for the current version; see `docs/decisions/ADR-001-local-only-persistence.md`.
- `/api/config` remains as a legacy compatibility endpoint, with client key exposure disabled by default via `EXPOSE_CLIENT_CONFIG=false`.
