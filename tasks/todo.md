# Productization Backlog

## Phase 1: Foundation

- [x] Add local quality gate script.
  - Acceptance: `.\scripts\check.ps1` runs syntax checks and tests.
  - Verify: `.\scripts\check.ps1`

- [x] Harden runtime defaults.
  - Acceptance: CORS uses `ALLOWED_ORIGINS`, security headers are present, `/api/config` hides Amap keys by default, request IDs are returned.
  - Verify: unit/integration tests plus `.\scripts\check.ps1`

- [x] Add CI quality gate.
  - Acceptance: GitHub Actions runs Python compile, unit tests, and JS syntax check on push/PR.
  - Verify: workflow file exists and local equivalent passes.

## Phase 2: Maintainability

- [x] Extract backend configuration and telemetry helpers.
  - Acceptance: app bootstrap reads settings from one place; tests cover env parsing.
  - Verify: `.\scripts\check.ps1`

- [x] Extract backend transport planning helpers.
  - Acceptance: transport segment building, enrichment, direction checks, price estimation, and POI ordering live outside `server.py`.
  - Verify: `.\scripts\check.ps1`

- [x] Extract AI response parsing and itinerary hydration helpers.
  - Acceptance: AI JSON cleanup/repair, POI metadata merge, center/weather attachment, and deterministic itinerary post-processing live outside `server.py`.
  - Verify: `.\scripts\check.ps1`

- [x] Externalize itinerary prompt template and prompt composition.
  - Acceptance: itinerary prompt text lives outside `server.py`; placeholder rendering is covered by tests and does not recursively replace placeholders inside inserted external/user text.
  - Verify: `.\scripts\check.ps1`

- [x] Extract Amap client logic.
  - Acceptance: Amap POI search, city center lookup, district disambiguation, and weather lookup live outside `server.py`.
  - Verify: `.\scripts\check.ps1`

- [x] Extract AI client logic.
  - Acceptance: OpenAI-compatible chat payload construction, token budgeting, response extraction, and non-200 error mapping live outside `server.py`.
  - Verify: `.\scripts\check.ps1`

- [x] Extract transport API routes.
  - Acceptance: `/api/transport/trains`, `/api/transport/flights`, `/api/transport/search`, and `/api/transport/stations` live in a router module with unchanged URL and response contracts.
  - Verify: `.\scripts\check.ps1`

- [x] Extract backend planning/transport logic from `server.py`.
  - Acceptance: remaining planning orchestration and non-transport API route grouping live outside `server.py`; route behavior is unchanged.
  - Verify: `.\scripts\check.ps1` and manual `/api/health` smoke check.

- [x] Split `static/app.js` into focused modules or establish a no-build modular pattern.
  - Acceptance: current UI behavior is preserved and JS syntax check passes.
  - Verify: browser smoke test and `node --check`.

## Phase 3: Launch Readiness

- [x] Document production environment variables and deployment checklist.
  - Acceptance: README explains required/optional env vars, CORS, key exposure policy, and rollback basics.
  - Verify: documentation review.

- [x] Add manual live smoke checklist.
  - Acceptance: checklist covers health, city center, POI lookup, plan generation, transport refresh, map render, saved trips, and ICS export.
  - Verify: checklist can be executed against a running server.

- [x] Decide persistence/auth scope.
  - Acceptance: explicit decision recorded: stay local-only, add shareable snapshots, or add authenticated cloud persistence.
  - Verify: ADR or task update.

## Phase 4: Team Engineering Governance

- [x] Add strict local and CI quality gates.
  - Acceptance: local and CI share `scripts/check.ps1`; checks include Ruff, Mypy, coverage, unit tests, and all static JS files.
  - Verify: `.\scripts\check.ps1`

- [x] Add security and dependency governance.
  - Acceptance: tracked-file secret scanning, dependency audit, Dependabot, and security workflow exist.
  - Verify: `.\scripts\security.ps1`

- [x] Document small-team collaboration workflow.
  - Acceptance: PR/Issue templates, contributing guide, change management, and release process are present.
  - Verify: documentation review.

- [x] Improve directory boundaries.
  - Acceptance: 12306 parsing/cache helpers and no-build frontend modules are split without API/runtime contract changes.
  - Verify: `.\scripts\check.ps1` and browser smoke check.

- [x] Mirror tests by source area.
  - Acceptance: tests are grouped under `tests/clients`, `tests/core`, `tests/planner`, `tests/routers`, and `tests/services`.
  - Verify: `python -m unittest discover -s tests -v`
