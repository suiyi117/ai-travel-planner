# AGENTS.md

This file gives Codex and other coding agents the repository-specific rules for AeroTravel.

## Project Overview

AeroTravel is a China-focused AI travel planner. It is a small full-stack web app:

- Backend: Python 3.10+, FastAPI, httpx, python-dotenv.
- Frontend: static HTML/CSS/vanilla JavaScript, Leaflet, Amap map tiles.
- External data: Amap Web Service API, OpenAI-compatible Chat Completions, 12306 public train API, optional Juhe flight API.
- Persistence: browser `localStorage` only for saved trip snapshots.

Current product scope is intentionally single-user: no database, no auth, no build step. Do not add a database, login system, frontend framework, or required paid API without an explicit user request and an ADR.

## Commands

Run commands from the repository root.

```powershell
# Install Python dependencies
pip install -r requirements.txt

# Create local env file
Copy-Item .env.example .env

# Start dev server
python server.py
# http://localhost:8000

# Optional reload server
python -m uvicorn server:app --reload --host 0.0.0.0 --port 8000

# Full local quality gate
.\scripts\check.ps1
```

`.\scripts\check.ps1` runs:

- `python -m compileall server.py services`
- `python -m unittest discover -s tests -v`
- `node --check` for every `static/*.js` file when Node.js is installed

Manual smoke checks after the server is running:

```powershell
curl http://localhost:8000/api/health
curl "http://localhost:8000/api/city_center?city=北京"
curl "http://localhost:8000/api/search_pois?city=北京&keywords=景点&count=5"
curl "http://localhost:8000/api/weather?city=北京"
```

The server mounts `static/` at `/static` and redirects `/` to `/static/index.html`.

## Current Architecture

### Data Flow

```text
Browser (static/index.html + static/app-utils.js + static/app.js)
  │
  ├─ GET /api/search_pois ──→ routers/location.py → clients/amap.py
  ├─ GET /api/city_center ──→ routers/location.py → clients/amap.py
  ├─ GET /api/weather ──────→ routers/location.py → clients/amap.py
  ├─ POST /api/plan ───────→ routers/planning.py → planner/generator.py
  │                              ├─ planner/prompting.py + prompts/itinerary.md
  │                              ├─ clients/ai.py
  │                              ├─ planner/itinerary.py
  │                              └─ planner/transport.py → services/train_service.py / flight_service.py
  │
  ├─ GET /api/transport/* ──→ routers/transport.py → services/train_service.py / flight_service.py
  ├─ GET /api/config ───────→ routers/system.py
  └─ GET /api/health ───────→ routers/system.py
```

`server.py` is now the application composition root: it loads settings, installs middleware, registers routers, serves static files, and initializes station data on startup. Do not move business logic back into `server.py`.

### Key Directories

| Path | Purpose |
|---|---|
| `server.py` | FastAPI app bootstrap, middleware, router registration, static serving |
| `core/settings.py` | Environment parsing and safe runtime defaults |
| `core/observability.py` | Structured logging, request IDs, security headers |
| `clients/amap.py` | Amap POI, district, city center, weather client |
| `clients/ai.py` | OpenAI-compatible Chat Completions client |
| `planner/generator.py` | AI itinerary orchestration |
| `planner/prompting.py` | Prompt construction and one-pass placeholder rendering |
| `planner/itinerary.py` | AI JSON parsing, repair, POI merge, itinerary hydration |
| `planner/transport.py` | Segment building, transport enrichment, direction checks, price estimates |
| `prompts/itinerary.md` | Reviewable itinerary prompt template |
| `routers/` | FastAPI route modules |
| `schemas/travel.py` | Pydantic request models |
| `services/train_service.py` | 12306 station cache and train lookup |
| `services/flight_service.py` | Juhe flight API plus built-in route fallback |
| `static/app-utils.js` | No-build frontend utility module exposed as `window.AeroTravelUtils` |
| `static/app.js` | Frontend state, rendering, map, API calls, storage, exports |
| `docs/` | Deployment, smoke checks, ADRs |
| `tasks/` | Productization spec and backlog |
| `tests/` | Offline regression tests |

## Important Product Decisions

1. Keep FastAPI + vanilla static frontend for now. No React/Vue/Next migration unless explicitly requested.
2. Keep local-only persistence. Saved trips live in browser `localStorage` under `aerotravel:trips`; see `docs/decisions/ADR-001-local-only-persistence.md`.
3. Keep `/api/config` for legacy compatibility, but do not expose Amap keys by default. `EXPOSE_CLIENT_CONFIG=false` is the safe default.
4. Keep Amap lookup backend-proxied in the active UI. The active frontend calls `/api/search_pois` and `/api/city_center`; it does not need the Amap browser key.
5. Keep prompt templates outside code. Update `prompts/itinerary.md` and tests when changing prompt behavior.
6. Treat external API responses and LLM output as untrusted data. Parse, validate, sanitize, and escape before rendering.

## Backend Rules

- Route handlers belong in `routers/`.
- External service calls belong in `clients/` or `services/`.
- Planning, prompt, hydration, and transport business logic belongs in `planner/`.
- Request/response models belong in `schemas/`.
- Keep route contracts stable unless the user explicitly asks for an API change.
- New backend behavior should have tests under `tests/` and should not require live third-party services.
- Use structured logging via `core.observability.log_event()` for notable runtime warnings. Avoid adding new `print()` calls in production paths.
- Do not leak secrets in logs, responses, prompts, or test fixtures.

## Frontend Rules

- There is no bundler. Use plain browser scripts loaded from `static/index.html`.
- Shared pure frontend utilities should go in `static/app-utils.js` and be exposed through `window.AeroTravelUtils`.
- Keep `static/app.js` as the main UI/state file unless doing a deliberate incremental split.
- Preserve the single mutable `state` object and `applyPlan()` as the main hydration path.
- Preserve boot-time fallback itinerary behavior: the app should be useful before backend generation succeeds.
- Preserve `fetchJson()` behavior that routes `/api` calls to `http://localhost:8000` when opened via `file://` or a non-8000 port.
- Preserve per-city days: `state.cities[].days` is source of truth; global total days is derived.
- Preserve planner/results pane brief-collapse behavior: `.pane-body` is the scroll container.
- Keep all POI metadata escaped. Amap fields such as `rating`, `address`, `tel`, and `opentime` must pass through `escapeHtml()` / `cleanMetaValue()` before HTML insertion.
- Browser-facing changes require a runtime smoke check when feasible: page loads, console has no errors/warnings, map renders, and the initial itinerary appears.

## Transport and Data Gotchas

- 12306 station data is cached at `services/.cache/station_map.json` with a 7-day TTL. If download fails, `BUILTIN_STATION_MAP` is used. `services/.cache/` is ignored by git.
- 12306 result field indexes vary. In `_parse_train_result()`, keep pattern-based train ID selection from `fields[3]` / `fields[4]` using `^[GDCKTZSLY]?\d{1,4}$`; do not hardcode a single field index.
- `_select_best_station()` should prefer the main station where station name equals city name, because 12306 often treats it as a city-level query.
- Directional stations should be detected by the last station-name character only, because city names such as 北京 and 西安 contain direction characters.
- Amap district lookup can return same-named districts in other provinces. New district keyword lookups should use `clients.amap.pick_primary_district()` or the existing client helpers.
- Transport segment strings should remain stable as `"A → B"`; frontend selection and refresh logic depends on normalized segment keys.
- `enrich_transport_guide()` should preserve AI fallback options only when real/reference transport data is unavailable.

## Environment Variables

All variables live in `.env`; copy from `.env.example`.

| Variable | Required | Purpose |
|---|---:|---|
| `AMAP_KEY` | Yes for real POI/city/weather | Amap Web Service API key used by backend proxy routes |
| `AI_API_KEY` | Yes for AI planning | LLM key for OpenAI-compatible Chat Completions |
| `AI_BASE_URL` | No | LLM base URL, defaults to OpenAI |
| `AI_MODEL` | No | Model name, defaults to `gpt-5.5` |
| `APP_ENV` | No | `development` or `production`; production enables stricter defaults |
| `ALLOWED_ORIGINS` | Production yes | Comma-separated CORS allowlist; never use `*` in production |
| `EXPOSE_CLIENT_CONFIG` | No | Defaults false; only true for legacy browser-key compatibility |
| `LOG_LEVEL` | No | Structured log level |
| `JUHE_FLIGHT_API_KEY` | No | Optional flight API; built-in fallback works without it |
| `AMAP_SECURITY_KEY` | No | Legacy compatibility only; active UI does not need it |

## Documentation and Launch Files

- Productization spec: `tasks/productization-spec.md`
- Backlog: `tasks/todo.md`
- Implementation log: `IMPLEMENTATION.md`
- Deployment and rollback: `docs/deployment-checklist.md`
- Manual smoke checklist: `docs/smoke-checklist.md`
- Persistence/auth ADR: `docs/decisions/ADR-001-local-only-persistence.md`

Keep these files current when changing architecture, public API behavior, launch requirements, or persistence/auth scope.

## Repository Hygiene

- `.env`, `services/.cache/`, `*.artifact.json`, `.od-skills/`, `critique.json`, Baidu sync temp files, and local visual artifacts are ignored. Do not treat ignored artifacts as source of truth.
- Do not hand-edit artifact JSON.
- Do not revert unrelated local changes. This repo may have a dirty worktree.
- Use `.\scripts\check.ps1` before calling work complete.
- If changing frontend runtime behavior, also perform or document a browser smoke check.
