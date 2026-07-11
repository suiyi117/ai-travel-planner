# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

AI 旅行规划师 (AeroTravel) — a full-stack multi-city travel planner for China. Python FastAPI backend + vanilla HTML/CSS/JS frontend. No database, no build step, no auth. Single-user, session-based, with browser-local saved trip snapshots.

## Commands

```bash
# Install Python dependencies
pip install -r requirements.txt

# Create local env file from the template
# PowerShell: Copy-Item .env.example .env
cp .env.example .env

# Start dev server from the repo root (server.py uses relative static/ paths)
python server.py
# → http://localhost:8000

# Optional auto-reload dev server
python -m uvicorn server:app --reload --host 0.0.0.0 --port 8000

# Optional syntax check when changing backend code
python -m compileall server.py services

# Manual smoke checks after the server is running
curl http://localhost:8000/api/health
curl "http://localhost:8000/api/city_center?city=北京"
```

No build command, linter, type checker, test runner, or single-test command is configured. There is no single-test command. The server mounts `static/` at `/static` and redirects `/` to `/static/index.html`.

## Architecture

### Data flow

```
Browser (static/index.html + static/app.js)
  │
  ├─ GET /api/search_pois ──→ server.py backend proxy to 高德 REST place/text API
  ├─ GET /api/city_center ──→ server.py backend proxy to 高德 district API
  ├─ GET /api/weather ──────→ server.py backend proxy to 高德 weather API
  ├─ POST /api/plan ───────→ server.py: generate_itinerary()
  │    sends destinations[] + pre-fetched city_data[] │
  │                                                    ├─ OpenAI-compatible LLM call
  │                                                    ├─ POI 坐标合并 (name → lat/lng)
  │                                                    └─ enrich_transport_guide() → 12306/航班
  │
  ├─ GET /api/transport/* ──→ services/train_service.py / services/flight_service.py
  └─ GET /api/health
```

The active UI uses Leaflet.js + 高德 map tiles for rendering. In the active `static/index.html` / `static/app.js` path, POI and city-center lookup happen through backend proxy routes, not through 高德 JS API in the browser. `/api/config` still exists for compatibility/legacy UI code, but the active UI does not call it.

### Key design decisions

1. **Backend-proxied 高德 lookup in the active UI**: `static/app.js` calls `/api/search_pois` and `/api/city_center`; the backend uses `AMAP_KEY` with 高德 REST APIs. This keeps the active frontend from needing the 高德 key directly, though the legacy `/api/config` endpoint still returns it.

2. **Frontend pre-fetches city data before AI planning**: `generatePlan()` calls `fetchCityData()` for each city, then sends `destinations[]`, `city_data[]`, preferences, transport choices, and `start_date` to `/api/plan`. Backend planning expects `city_data[]` to contain `{city, pois[], center{lat,lng}, days}`. Weather is fetched on the backend during planning and returned as `city_weather` for day-tab badges and rain/snow tips.

3. **Transport enrichment runs after AI generation**: The AI generates a `transport_guide` with train/flight options → `enrich_transport_guide()` replaces them with real 12306/flight data when possible. The AI's options become fallback only when real APIs return nothing or enrichment fails.

4. **Built-in data fallbacks everywhere**: Station-code mappings, airport IATA mappings, and hardcoded popular flight routes help transport queries work without optional third-party flight API keys. The frontend also has fallback city centers and deterministic fallback POIs/plans.

5. **Frontend dual-path generation with offline resilience**: `generatePlan()` fetches city data, calls POST `/api/plan`, then falls back to `buildFallbackItinerary()` if the backend or AI fails. `fetchJson()` auto-routes `/api` requests to `http://localhost:8000` when the page is opened via `file://` or from a non-8000 port.

6. **Interactive initial state**: On load, `boot()` builds and applies a deterministic fallback itinerary immediately so the UI is usable before any backend generation.

7. **Single mutable frontend state object**: All frontend state lives in the `state` object at the top of `static/app.js`. `applyPlan()` is the single hydration point — it transforms the raw API response via `mapPlanToItems()` (which injects transport/food/hotel pseudo-items into each day) and stores it as `state.itinerary`. Render functions read from `state`. Saved trip snapshots live in browser `localStorage` under `aerotravel:trips`; there is no backend persistence.

8. **POI metadata must stay escaped in rendered HTML**: 高德 POI fields (`rating`, `address`, `tel`, `opentime`) are copied through `copyPoiMeta()` / `mergePoiMeta()` and rendered in badges, timeline cards, popups, and detail panes. These values come from external APIs or fallback data, so keep using `escapeHtml()`/`cleanMetaValue()` before adding new HTML output.

9. **Per-city days control (not global slider)**: Each city in `state.cities` carries its own `days` field (1–7). `cityDayMap()` expands the itinerary day-by-day per city's count; `computeTotalDays()` sums them. The global days display is derived, not the source of truth. When calling `/api/plan`, both `destinations[].days` and `city_data[].days` carry each city's actual day count.

10. **Scrollable three-step wizard shell (not a locked 100vh workbench)**: The active UI is route → preferences → itinerary with a sticky summary rail, page-level main scrolling, and an on-demand map drawer. Do not reintroduce the old planner/results/map three-pane lock or pane brief-collapse as the primary layout. Wizard pure helpers live in `static/wizard.js` (`window.AeroTravelWizard`).

11. **Station data caching**: On startup, `services/train_service.py` downloads the 12306 station list and caches it to `services/.cache/station_map.json` (7-day TTL). If the download fails, it falls back to `BUILTIN_STATION_MAP`. `services/.cache/` is ignored by git.

12. **Ignored design/legacy artifacts may exist locally**: `static/index-before-ui-rebuild.html`, `*.artifact.json`, `.od-skills/`, and `critique.json` may be present as local ignored artifacts. Do not rely on them as tracked source files, and do not hand-edit artifact JSON.

### Key files

| File | Purpose |
|---|---|
| `server.py` | FastAPI app, API routes, AI itinerary generation, transport enrichment, price estimation helpers |
| `services/__init__.py` | Empty init — makes `services/` a Python package |
| `services/train_service.py` | 12306 query, station list download/cache, built-in station map |
| `services/flight_service.py` | 聚合数据 flight API integration, built-in popular routes, airport IATA map |
| `static/app.js` | Frontend state, wizard steps, city/day controls, backend POI fetching, map drawer, itinerary timeline, transport refresh, AI→fallback generation |
| `static/wizard.js` | Pure wizard unlock/validation/summary helpers (`window.AeroTravelWizard`) |
| `static/styles.css` | Warm terracotta theme, scrollable wizard shell, summary rail, map drawer, narrow-screen steps |
| `static/index.html` | Single-page app shell served by the backend |
| `README.md` | User-facing quick start and feature summary |
| `CHANGELOG.md` | Release notes; currently documents the 1.1.0 productization release and prior 1.0.0 feature set |

### API design notes

- `PlanRequest` expects `destinations[]`, `city_data[]`, preferences, and transport settings. `PlanRequest.days` is the auto-summed total used in the prompt template.
- `CityInfo.days` is the per-city stay duration (1–7).
- `CityInfo.transport` is the per-segment transport constraint (only meaningful for index ≥ 1; index 0's transport is ignored).
- `PlanRequest.global_transport` sets the default for all segments; per-segment overrides take precedence.
- All transport endpoints return `{status, source}` so the frontend can show data provenance (12306 vs fallback/builtin/error).
- `enrich_transport_guide()` adds `data_source` (`"real"` | `"ai_fallback"`) and `source_label` to each segment after querying real APIs. The AI's fictional options are preserved only when real queries return nothing.
- `/api/transport/search` auto-detects query type by first character: `G/D/K/T/Z/C/S/Y/L` → train lookup via 12306; anything else currently tries train and reports no match if none is found.
- `/api/transport/stations` returns train station suggestions and airport info for a city.
- **12306 field index trap**: In `_parse_train_result()`, 12306 returns fields split by `|`, and the layout varies between interface versions — in the standard layout `fields[2]` is the internal `train_no` (e.g. `240000G6510Y`), `fields[3]` is the display `station_train_code` (e.g. `G651`), and `fields[4]` is the origin-station telecode (e.g. `TJP`); older responses shift these by one. The parser therefore pattern-matches `fields[3]`/`fields[4]` against `^[GDCKTZSLY]?\d{1,4}$` to pick the human-readable train ID — keep that pattern-based selection instead of hardcoding an index.
- **12306 station selection**: `_select_best_station()` prefers the main station (name == city name, e.g. 北京→BJP) because 12306 treats the main-station telecode as a city-level query and returns trains from all stations in the city; picking a directional station (北京东) can shrink results to a handful. Directional stations are detected by last character only (站名末字为方位词且长度≥3), since city names like 北京/西安 themselves contain direction characters.
- **Amap district keyword ambiguity**: `/api/city_center` and weather lookups resolve city names via the Amap district API, which can match same-named districts in other provinces (西安 also matches 辽源市西安区). `_pick_primary_district()` picks by administrative level (city > province > district) — route any new district-keyword lookups through it.

## Environment variables

All in `.env` (copy from `.env.example`):

| Variable | Required | Purpose |
|---|---|---|
| `AMAP_KEY` | Yes (for real POI/city lookup) | 高德 Web服务 API Key used by backend proxy routes |
| `AI_API_KEY` | Yes (for AI itinerary generation) | LLM API key for an OpenAI-compatible Chat Completions endpoint |
| `AI_BASE_URL` | No (default: OpenAI) | LLM base URL |
| `AI_MODEL` | No (default: `gpt-5.5`) | Model name |
| `JUHE_FLIGHT_API_KEY` | No | 聚合数据 flight API; falls back to built-in route data |
| `AMAP_SECURITY_KEY` | No | Supported by `server.py`/`/api/config` for legacy 高德 JS API usage, but not present in `.env.example` and not used by the active UI |

## Repository notes

- `.conda/`, `.env`, `services/.cache/`, `*.artifact.json`, `.od-skills/`, `critique.json`, `mrbw*-image.png`, `mrbw*-drawing-*.png`, and `static/index-before-ui-rebuild.html` are ignored. Avoid treating ignored local artifacts as source of truth.
- No Cursor or Copilot rule files are currently present (`.cursor/`, `.cursorrules`, `.github/copilot-instructions.md`).
- The tracked app source is intentionally small: backend code in `server.py` + `services/`, frontend code in `static/`, and runtime configuration in `.env`.
