# ZAX Docs Index

This directory is intentionally small. Each document has a single purpose.

## Canonical

- `zax-spec.md`
  - Sole normative language specification for active development.
  - Includes CLI and op-system reference appendices.

## Guides (Non-normative)

- `ZAX-quick-guide.md`
  - Compact chaptered quick guide for day-to-day usage.

## Transition Records (Non-normative)

- `v02-transition-decisions.md`
  - v0.2 transition decision record retained for historical rationale while migration closes.
- `v01-scope-decisions.md`
  - Archived compatibility pointer retained only to forward old references.

## Engineering Playbook

- `zax-dev-playbook.md`
  - Consolidated implementation and process guide (roadmap, checklist, pipeline notes, contributor workflow, and normative-priority execution model).
- `v02-status-snapshot-2026-02-15.md`
  - v0.2 status snapshot and completion-state summary.
- `v02-done-checklist.md`
  - v0.2 release-closeout checklist with evidence links.
- `v02-completion-note-2026-02-15.md`
  - v0.2 completion declaration and closure summary.
- `v03-planning-track.md`
  - Post-v0.2 planning scaffold for v0.3 sequencing.
- `github-backlog-workflow.md`
  - GitHub-only backlog operating model (Jira-style issue workflow using milestones + labels + acceptance gates).
- `v02-codegen-golden-corpus.md`
  - Tiered `.asm` golden-corpus workflow for v0.2 codegen verification.
- `v02-hidden-lowering-risk-matrix.md`
  - Hidden-lowering risk matrix with focused test coverage mapping for v0.2 closeout.

## Consolidation Policy

- Remove stale status snapshots and one-off audit docs once their information is folded into canonical specs or tests.
- If a document cannot state a unique purpose in one sentence, consolidate it.
- Canonical language behavior MUST be defined in `zax-spec.md`; transition and playbook docs must not override it.

## Archive Plan

- `v02-transition-decisions.md` remains active only while migration material is being folded into `zax-spec.md` Appendix C and normative sections.
- After that fold-in is complete, archive `v02-transition-decisions.md`.
- Keep `v01-scope-decisions.md` as a minimal forwarding stub only (no duplicated transition body).
