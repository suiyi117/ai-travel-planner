# ADR-002: Constraint-Driven Editable Planning

Date: 2026-07-10

Status: Accepted

## Context

AeroTravel was a one-shot AI itinerary generator. Users could not:

- Add their own desired places after generation
- Make local adjustments without losing the rest of the plan
- Plan self-drive road trips with optimal route ordering
- Reorder driving route nodes manually

Any small edit required full regeneration, making the product unusable for real trip refinement.

## Decision

Adopt a three-stage state model:

1. **AppliedPlan** — the last AI-generated or saved itinerary displayed in read-only browse mode.
2. **WorkingDraft** — an immutable, versioned draft that the user edits freely. Every operation (add/move/remove/constraint) produces a new revision via `AeroTravelDraftOps`.
3. **CandidatePlan** — a server-side optimization result shown as a human-readable diff with apply/discard options.

Key design principles:

- AI generates the initial draft only; all subsequent edits go through deterministic, testable operations.
- Hard constraints (required, fixed_day, fixed_time, fixed_order) are enforced by the frontend draft ops and validated by the backend `/api/plan/optimize` endpoint.
- The optimizer uses nearest-neighbor + 2-opt for reordering unlocked nodes within a scope (day, city, or trip).
- Self-drive mode uses Amap driving API for real road distances and toll estimates, with haversine fallback.
- All state persists in browser `localStorage` with schema version 2 (backward-compatible read of version 1).

## Alternatives Considered

### Re-call AI after every edit
Rejected: Cannot guarantee stability of unedited portions, cannot reliably perform shortest-path routing, and incurs unnecessary cost/latency.

### Single mutable frontend object
Rejected: Cannot distinguish applied results, unsaved edits, and pending candidate diffs. Async server responses risk overwriting user modifications.

### Database + account sync
Rejected: Product remains single-user local tool. Adding server-side persistence exceeds current scope.

## Consequences

- Local edits and save-only operations do not depend on AI or road services.
- Road service failures degrade gracefully (haversine estimate) without breaking drafts or applied plans.
- Existing `/api/plan`, transport interfaces, snapshot limits, `state.cities[].days`, and `applyPlan()` hydration paths remain compatible.
- No database, accounts, frontend frameworks, build steps, or unapproved persistence changes.

## Verification

- 29 Python unit tests + 51 frontend unit tests pass
- `.\scripts\check.ps1` passes (compile, Ruff, Mypy, Python tests, JS syntax, frontend tests)
- `.\scripts\security.ps1` passes (secret scan, dependency audit)
- `git diff --check` passes
- Browser smoke test covers desktop and mobile viewports
