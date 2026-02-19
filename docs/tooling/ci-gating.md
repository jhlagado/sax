# CI gating rules

- **docs-only changes**: when `scripts/ci/change-classifier.js` reports `docs_only=true`, the `docs` job runs (prettier check only); test matrix is skipped.
- **code or mixed changes**: when `run_full=true`, the full matrix runs (`npm run format:check`, `npm run typecheck`, `npm run test:coverage`) on ubuntu/macos/windows.
- Coverage artifacts (`coverage/**`) are uploaded per OS job for inspection; no hard threshold enforced yet.
