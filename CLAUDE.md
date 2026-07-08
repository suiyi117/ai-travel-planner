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
  │  ┌─ Highmaps JS API v2.0 (POI search, geocoding) — primary channel
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

### Key files

| File | Purpose |
|---|---|
| `server.py` | All FastAPI routes + AI itinerary generation + transport enrichment + price estimation helpers |
| `services/train_service.py` | 12306 query (station list download, ticket search), built-in station map for 47+ cities |
| `services/flight_service.py` | 聚合数据 flight API + 18 built-in popular routes + 55-city airport IATA map |
| `static/app.js` | All frontend state + city management + map rendering + itinerary timeline + transport selection |
| `static/styles.css` | Claude Design System warm terracotta theme, responsive 3-column layout |
| `static/index.html` | Single-page app shell |

### API design notes

- The `/api/plan` Pydantic model (`PlanRequest`) expects `city_data` as a pre-fetched list of `{city, pois[], center{lat,lng}, days}` — the frontend must fetch POIs via 高德 JS API first, then send everything to the backend.
- `CityInfo.transport` is the per-segment transport constraint (only meaningful for index ≥ 1; index 0's transport is ignored).
- `PlanRequest.global_transport` sets the default for all segments; per-segment overrides take precedence.
- All transport endpoints return `{status, source}` so the frontend can show data provenance (12306 vs AI fallback).

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
