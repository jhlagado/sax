# ZAX Docs Index

This directory is intentionally constrained. Every file below has a unique purpose.

## 1. Canonical (Normative)

- `zax-spec.md`
  - Sole normative language specification.
  - If any other doc conflicts, this file wins.

## 2. Usage Guide (Non-normative)

- `ZAX-quick-guide.md`
  - Practical, chaptered user guide for day-to-day authoring.

## 3. Core Supporting References (Non-normative)

- `zax-dev-playbook.md`
  - Implementation and workflow guidance for contributors.
- `v02-transition-decisions.md`
  - Historical v0.2 transition rationale and decision log.
- `v02-status-snapshot-2026-02-15.md`
  - Consolidated v0.2 closeout/reopen status record and gate checklist.
- `v02-codegen-verification.md`
  - Single codegen verification gate (workstreams, lowering policy, corpus policy, risk matrix).
- `v02-codegen-worked-examples.md`
  - Worked `.zax` to lowered `.asm` examples for frame/call behavior.
- `v03-planning-track.md`
  - Post-v0.2 planning scaffold.
- `github-backlog-workflow.md`
  - GitHub issue/label/milestone workflow used as the project backlog system.

## Definitive v0.2 Baseline Set

For v0.2 planning, verification, and closeout work, the definitive v0.2 document set is:

1. `v02-transition-decisions.md`
2. `v02-status-snapshot-2026-02-15.md`
3. `v02-codegen-verification.md`
4. `v02-codegen-worked-examples.md`

Do not add additional v0.2 status/checklist/risk/gate docs unless one of the four files above cannot absorb the content.

## Content Ownership

- `zax-spec.md`: normative language rules only.
- `v02-status-snapshot-2026-02-15.md`: v0.2 release-state and reopened gate checklist state only.
- `v02-codegen-verification.md`: codegen verification workstreams, risk matrix, and evidence model only.
- `v02-codegen-worked-examples.md`: executable worked examples and expected lowering shapes only.
- `v02-transition-decisions.md`: historical transition rationale only.
- `zax-dev-playbook.md`: contributor process/workflow only; must not define v0.2 semantic policy or gate criteria.

## 4. Legacy Pointer (Archived)

- `v01-scope-decisions.md`
  - Forwarding stub retained only for compatibility links.

## Consolidation Rules

- Do not add one-off status/checklist docs when the information belongs in an existing reference.
- Before creating a new doc, justify why existing docs cannot absorb the content.
- v0.2 supporting docs must point back to `zax-spec.md` for language authority.
