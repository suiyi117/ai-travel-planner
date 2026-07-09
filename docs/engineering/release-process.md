# Release Process

This project follows SemVer: `MAJOR.MINOR.PATCH`.

## Version Rules

- `PATCH`: backward-compatible bug fix.
- `MINOR`: backward-compatible feature or engineering capability.
- `MAJOR`: breaking public API or user workflow change.

## Release Checklist

1. Confirm `.\scripts\check.ps1` passes.
2. Confirm `.\scripts\security.ps1` passes or record approved exceptions.
3. Execute `docs/smoke-checklist.md` against the release candidate.
4. Update `CHANGELOG.md` with user-facing changes.
5. Confirm `docs/deployment-checklist.md` is still accurate.
6. Tag the release after merge:

```powershell
git tag -a vX.Y.Z -m "Release X.Y.Z"
git push origin vX.Y.Z
```

## Rollback

Rollback uses the previous known-good commit or tag. Follow `docs/deployment-checklist.md`, preserve request IDs and logs, and record the cause in `IMPLEMENTATION.md` or the release issue.

## Branch Protection Recommendation

Protect `master` or the repository default branch with:

- At least one approving review.
- Required `CI / quality` status check.
- Required `Security / security` status check for release branches.
- No force-pushes.
