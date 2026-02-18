# Issue: migrate toolchain to npm (labels: designer, developer)

Context
- Simplify tooling by standardizing on npm; Yarn is removed from scripts/docs.
- npm lockfile (`package-lock.json`) now generated; `yarn.lock` deleted.

Decisions needed (Designer)
- Confirm CLI invocation strings for docs/examples (`npm run zax -- …`) are acceptable.
- Approve dropping Yarn instructions from spec and guides.

Tasks (Developer)
1) Ensure CI uses npm install/test paths; update any workflows if present.
2) Verify `npm run zax` remains canonical for docs/spec/codegen-corpus regeneration.
3) Audit vulnerabilities reported by `npm install` (currently 6 moderate).

Notes
- Labels requested: designer, developer, reviewer workflow. Add these in GitHub when creating the issue.
