# ZAX Docs Index

This directory is intentionally small. Each document has a single purpose.

## Canonical

- `zax-spec.md`
  - Sole normative language specification for active development.

## Transition Records (Non-normative)

- `v02-transition-decisions.md`
  - v0.2 transition decision record used to capture migration rationale and sequencing while language rules are folded into `zax-spec.md`.
- `v01-scope-decisions.md`
  - Compatibility pointer to `v02-transition-decisions.md` during migration.

## Supporting Specs

- `zax-op-system-spec.md`
  - Deep specification for `op` matcher, overload, and expansion behavior.
- `zax-cli.md`
  - CLI contract (flags, outputs, and argument handling).
- `assembler-pipeline.md`
  - Implementation architecture and phase breakdown.

## Planning / Process

- `roadmap.md`
  - Execution plan and milestone tracking.
- `v02-implementation-checklist.md`
  - Issue-linked v0.2 execution checklist for low-conflict parallel work.
- `zax-ai-team-prompt.md`
  - Internal contributor guidance for AI-assisted implementation workflow.

## Consolidation Policy

- Remove stale status snapshots and one-off audit docs once their information is folded into canonical specs or tests.
- If a document cannot state a unique purpose in one sentence, consolidate it.
- Canonical language behavior MUST be defined in `zax-spec.md`; supporting and transition docs must not override it.

## Archive Plan

- `v02-transition-decisions.md` remains active only while migration material is being folded into `zax-spec.md` Appendix C and normative sections.
- After that fold-in is complete, archive `v02-transition-decisions.md` and keep `v01-scope-decisions.md` only as a temporary forwarding pointer.
