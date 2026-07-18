# Repository map

This guide answers “where should this change go?” without requiring a full architecture read.

## Top-level ownership

| Area | Put changes here |
|---|---|
| FastAPI composition, middleware and static mount | server.py |
| Environment parsing and logging/security defaults | core/ |
| Amap and model-provider HTTP calls | clients/ |
| Train, flight and driving integrations | services/ |
| Prompting, hydration, scheduling and optimization | planner/ |
| API route handlers | routers/ |
| Pydantic request/response contracts | schemas/ |
| Browser application and exports | [static/](../../static/README.md) |
| Offline regression tests | tests/ |
| Product intent and PRDs | docs/product/ |
| ADRs and engineering process | docs/decisions/, docs/engineering/ |
| Incoming QA/product findings | tasks/inbox/ |

## Frontend ownership

| Path | Responsibility |
|---|---|
| static/js/core/ | Pure helpers, mutable state creation, API and local storage boundaries |
| static/js/planning/ | Route wizard, maps, editable draft, constraints and self-drive UI |
| static/js/delivery/ | Customer-facing package, preview, publish, long image, PDF and calendar output |
| static/js/app.js | Composition only: startup, event binding, render coordination and applyPlan() |
| static/css/ | Tokens, shared components, workspace composition and delivery surfaces |

## Cleanup decisions (2026-07-18)

- Kept index.html and trip-share.html at static/ root so URLs stay stable.
- Split flat frontend files into responsibility folders; no bundler or framework was added.
- Consolidated itinerary time ordering in the shared utility boundary instead of keeping duplicate sort blocks.
- Replaced FastAPI’s deprecated startup event with a lifespan hook.
- Removed ignored artifact JSON and failed-test temporary directories; ignored artifacts remain non-source.
- Kept CLAUDE.md as a short pointer to AGENTS.md so agent guidance has one source of truth.

Before completing structural changes, run ./scripts/check.ps1 and both planner and dedicated-page browser smoke checks.
