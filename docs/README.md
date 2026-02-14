# ZAX Docs Index

This directory is intentionally small. Each document has a single purpose.

## Canonical

- `zax-spec.md`
  - Sole normative language specification for active development.
  - Includes CLI and op-system reference appendices.

## Guides (Non-normative)

- `ZAX-quick-guide.md`
  - Compact chaptered quick guide for day-to-day usage.
- `tutorial.md`
  - Hands-on walkthrough for building ZAX programs with v0.2 semantics.

## Transition Records (Non-normative)

- `v02-transition-decisions.md`
  - v0.2 transition decision record retained for historical rationale while migration closes.
- `v01-scope-decisions.md`
  - Compatibility pointer to `v02-transition-decisions.md` during migration.

## Engineering Playbook

- `zax-dev-playbook.md`
  - Consolidated implementation and process guide (roadmap, checklist, pipeline notes, contributor workflow, and normative-priority execution model).

## Agent Orientation (Non-normative)

- `agent-brief.md`
  - Fast onboarding summary for agents; mirrors current v0.2 direction without adding normative rules.

## Consolidation Policy

- Remove stale status snapshots and one-off audit docs once their information is folded into canonical specs or tests.
- If a document cannot state a unique purpose in one sentence, consolidate it.
- Canonical language behavior MUST be defined in `zax-spec.md`; transition and playbook docs must not override it.

## Archive Plan

- `v02-transition-decisions.md` remains active only while migration material is being folded into `zax-spec.md` Appendix C and normative sections.
- After that fold-in is complete, archive `v02-transition-decisions.md` and keep `v01-scope-decisions.md` only as a temporary forwarding pointer.
