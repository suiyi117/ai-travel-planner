# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

AI 旅行规划师 (AeroTravel) — a full-stack multi-city travel planner for China. Python FastAPI backend + vanilla HTML/CSS/JS frontend. No database, no build step, no auth. Single-user, session-based.

## Commands

```bash
# Install dependencies
pip install -r requirements.txt

# Start dev server (auto-reload on code change)
python server.py
# → http://localhost:8000

# The server mounts static/ at /static and redirects / → /static/index.html
```

No linter, no test runner, no type checker configured.

## Architecture

### Data flow

```
Browser (static/app.js)
  │  ┌─ 高德 JS API v2.0 (POI search, geocoding) — primary channel
  │  └─ Leaflet.js + 高德 tiles (map rendering)
  │
  ├─ POST /api/plan ───────→ server.py: generate_itinerary()
  │    sends city_data[] + user prefs       │
  │                                          ├─ OpenAI-compatible LLM call
  │                                          ├─ POI坐标合并 (name → lat/lng)
  │                                          └─ enrich_transport_guide() → 12306/航班
  │
  ├─ GET /api/search_pois ──→ Backend proxy to 高德 REST API (fallback when JS API unavailable)
  ├─ GET /api/city_center ──→ 高德 district API
  ├─ GET /api/config ───────→ Returns AMAP_KEY, AMAP_SECURITY_KEY, AI model info to frontend
  ├─ GET /api/transport/* ──→ train_service.py / flight_service.py
  └─ GET /api/health
```

### Key design decisions

1. **Dual-channel API key architecture**: The 高德 Key is served to the frontend via `/api/config` for JS API (POI search happens client-side). A separate `/api/search_pois` endpoint proxies 高德 REST API as fallback, which also works with Web Service keys. This means the Key unavoidably appears in the browser — the `.env.example` documents the tradeoff.

2. **Transport enrichment runs after AI generation**: The AI generates a `transport_guide` with fictional train/flight options → `enrich_transport_guide()` replaces them with real 12306/flight data. The AI's options become fallback only when the real API returns nothing.

3. **Built-in data fallbacks everywhere**: 47+ city station-code mappings, 55+ city airport IATA mappings, 18 hardcoded popular flight routes. These ensure transport queries work without any third-party API keys.

4. **Two UI versions coexist**: `static/index.html` is the active version (Claude Design System warm theme). `static/index-before-ui-rebuild.html` is the previous version (Linear-style, dark mode). Only `index.html` is served.

5. **Frontend dual-path generation with offline resilience**: `generatePlan()` in `app.js` calls POST `/api/plan` first. If the backend or AI fails, `buildFallbackItinerary()` constructs a deterministic plan from POI data alone — no AI needed. The fallback also handles `file://` protocol and non-:8000 ports via `fetchJson()`, which auto-routes `/api` requests to `http://localhost:8000`.

6. **Single mutable state object**: All frontend state lives in one `state` object at the top of `app.js`. `applyPlan()` is the single hydration point — it transforms the raw API response via `mapPlanToItems()` (which injects transport/food/hotel pseudo-items into each day) and stores it as `state.itinerary`. Every render function reads from `state`; nothing else mutates itinerary data.

7. **Per-city days control (not global slider)**: Each city in `state.cities` carries its own `days` field (1–7, default 1). `cityDayMap()` expands the itinerary day-by-day per city's count; `computeTotalDays()` sums them. The global days slider in the UI is now read-only — the total is derived, not driven. When calling `/api/plan`, `destinations[].days` passes each city's actual day count (not `null`).

8. **Station data caching**: On startup, `train_service.py` downloads the 12306 station list and caches it to `services/.cache/station_map.json` (7-day TTL). If the download fails, it falls back to the 47+ city `BUILTIN_STATION_MAP`. The `.cache/` directory should be in `.gitignore`.

9. **Design system artifact**: `static/index.html.artifact.json` is a Claude Design System export artifact (~72KB metadata for the UI design system sync). It's auto-generated alongside `index.html` — do not delete or hand-edit it.

### Key files

| File | Purpose |
|---|---|
| `server.py` | All FastAPI routes + AI itinerary generation + transport enrichment + price estimation helpers |
| `services/__init__.py` | Empty init — makes `services/` a Python package |
| `services/train_service.py` | 12306 query (station list download → cache to `.cache/station_map.json`, ticket search), 47+ city built-in station map |
| `services/flight_service.py` | 聚合数据 flight API + 18 built-in popular routes + 55-city airport IATA map |
| `static/app.js` | All frontend state + city management + map rendering + itinerary timeline + dual-path generation (AI→fallback) |
| `static/styles.css` | Claude Design System warm terracotta theme, responsive 3-column layout |
| `static/index.html` | Single-page app shell (active version) |
| `static/index-before-ui-rebuild.html` | Previous UI version (Linear-style, dark mode) — preserved for reference, not served |
| `static/index.html.artifact.json` | Claude Design System export artifact — auto-generated, do not edit |

### API design notes

- The `/api/plan` Pydantic model (`PlanRequest`) expects `city_data` as a pre-fetched list of `{city, pois[], center{lat,lng}, days}` — the frontend must fetch POIs via 高德 JS API first, then send everything to the backend. The `days` field on each city_data entry carries the per-city day count from the frontend (not the AI's planning output).
- `CityInfo.days` is the per-city stay duration (1-7). The frontend now passes the real value (not `null`); `PlanRequest.days` is the auto-summed total for the prompt template.
- `CityInfo.transport` is the per-segment transport constraint (only meaningful for index ≥ 1; index 0's transport is ignored).
- `PlanRequest.global_transport` sets the default for all segments; per-segment overrides take precedence.
- All transport endpoints return `{status, source}` so the frontend can show data provenance (12306 vs AI fallback).
- `enrich_transport_guide()` adds `data_source` (`"real"` | `"ai_fallback"`) and `source_label` to each segment after querying real APIs. The AI's fictional options are preserved only when real queries return nothing.
- `/api/transport/search` auto-detects query type by first character: `G/D/K/T/Z/C/S/Y/L` → train lookup via 12306; anything else tries train then falls through.
- `services/train_service.py` downloads the 12306 station list on startup and caches it to `services/.cache/station_map.json` (7-day TTL). If the download fails, it falls back to the 47+ city `BUILTIN_STATION_MAP` dict.
- **12306 field index trap**: In `_parse_train_result()`, 12306 returns fields split by `|`. `fields[3]` is the internal `train_no` (e.g. `2400000D6701`); `fields[4]` is the display `station_train_code` (e.g. `D6701`). Always use `fields[4]` for the human-readable train ID.

## Environment variables

All in `.env` (copy from `.env.example`):

| Variable | Required | Purpose |
|---|---|---|
| `AMAP_KEY` | Yes (for POI) | 高德 Web服务/JS API Key |
| `AMAP_SECURITY_KEY` | No | 高德 JS API v2.0 安全密钥 |
| `AI_API_KEY` | Yes | LLM API key (OpenAI-compatible) |
| `AI_BASE_URL` | No (default: OpenAI) | LLM base URL |
| `AI_MODEL` | No (default: gpt-4o-mini) | Model name |
| `JUHE_FLIGHT_API_KEY` | No | 聚合数据 flight API; falls back to built-in route data |
