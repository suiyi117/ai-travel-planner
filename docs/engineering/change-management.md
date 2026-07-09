# Change Management

Use this guide when deciding how much process a change needs.

## Always Required

- Keep runtime scope unchanged unless explicitly approved: no database, auth, frontend framework, build step, or required paid API.
- Run `.\scripts\check.ps1` before calling work complete.
- Run `.\scripts\security.ps1` when touching dependencies, CI, secrets, external integrations, or release configuration.
- Update tests for backend behavior and public contract changes.

## Browser-Facing Changes

Perform a smoke check when feasible:

- Page loads at `/static/index.html`.
- Console has no new errors or warnings.
- Leaflet map renders.
- Initial fallback itinerary appears.
- Main changed workflow still works.

Document any skipped browser smoke check in the PR.

## Documentation Triggers

Update documentation in the same change when:

- A command, environment variable, or setup step changes.
- A public API contract changes.
- A release, deployment, rollback, or smoke step changes.
- A directory boundary or ownership rule changes.

## ADR Triggers

Write a new ADR under `docs/decisions/` before making expensive-to-reverse decisions:

- Persistence or authentication changes.
- New required external service or paid API.
- Frontend framework or build-tool migration.
- New production hosting or deployment architecture.
- Any public data retention, sharing, privacy, or deletion policy.

Do not delete old ADRs; supersede them with a new record.
