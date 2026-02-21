# ZAX Docs Index

This directory is intentionally constrained. Every file below has a unique purpose.

## 1. Canonical (Normative)

- `zax-spec.md`
  - Sole normative language specification.
  - If any other doc conflicts, this file wins.
- `zax-grammar.ebnf.md`
  - Single-file EBNF grammar companion for syntax reference.
  - If grammar and spec diverge, `zax-spec.md` wins.

## 2. Usage Guide (Non-normative)

- `ZAX-quick-guide.md`
  - Practical, chaptered user guide for day-to-day authoring.

## 3. Core Supporting References (Non-normative)

- `zax-dev-playbook.md` — implementation/workflow guidance for contributors.
- `v02-codegen-reference.md` — single-stop v0.2 codegen reference (what to read, invariants).
- `v02-codegen-worked-examples.md` — worked `.zax` → `.asm` examples for frame/call behavior.
- `return-register-policy.md` — preservation/return matrix detail.
- `arrays.md` — IX + DE/HL lowering guidance and runtime-atom cues.
- `v03-planning-track.md` — post-v0.2 planning scaffold.
- `github-backlog-workflow.md` — GitHub issue/label/milestone workflow used as the project backlog system.

## Definitive v0.2 Baseline Set

1. `zax-spec.md` (normative)
2. `v02-codegen-reference.md` (consolidated v0.2 codegen entry point)
3. `v02-codegen-worked-examples.md` (worked shapes)
4. `examples/language-tour/00_call_with_arg_and_local_baseline.codegen-notes.md` + `.expected-v02.asm` (hand-crafted lowering reference)

## Content Ownership

- `zax-spec.md`: normative language rules only.
- `v02-codegen-reference.md`: consolidated codegen pointers and invariants.
- `v02-codegen-worked-examples.md`: executable worked examples and expected lowering shapes only.
- `return-register-policy.md`: preservation matrix and HL-preserve swap guidance.
- `zax-dev-playbook.md`: contributor process/workflow only; must not define v0.2 semantic policy or gate criteria.

## 4. Legacy Pointer (Archived)

- `v01-scope-decisions.md` — forwarding stub retained only for compatibility links.

## Consolidation Rules

- Do not add one-off status/checklist docs when the information belongs in an existing reference.
- Before creating a new doc, justify why existing docs cannot absorb the content; prefer updating `v02-codegen-reference.md`.
- v0.2 supporting docs must point back to `zax-spec.md` for language authority.
