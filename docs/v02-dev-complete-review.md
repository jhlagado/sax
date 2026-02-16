# v0.2 Codegen Verification Planning Gate

This document replaces checkpoint-only signoff with an execution plan for code-generation confidence.

v0.3 implementation work is blocked until the required verification workstreams below are complete.

## Objective

Establish credible proof that ZAX lowering generates valid, reviewable Z80 output across simple-to-complex source cases, with explicit focus on hidden lowering paths.

## Workstreams (Issue-Tracked)

### WS1: Inspectable source output (`NORMATIVE-MUST`)

Issue: [#261](https://github.com/jhlagado/ZAX/issues/261)  
Title: `[v0.2] Deterministic .asm emission for lowering inspection`

Expected outcome:

- deterministic `.asm` emission is available for representative programs
- emitted source is sufficient to inspect hidden lowering decisions

### WS2: Complexity-tiered golden corpus (`NORMATIVE-MUST`)

Issue: [#262](https://github.com/jhlagado/ZAX/issues/262)  
Title: `[v0.2] Tiered golden corpus for lowering verification`

Expected outcome:

- basic/intermediate/advanced fixture tiers
- golden lowering artifacts checked in and asserted by tests

### WS3: Hidden-lowering risk matrix (`NORMATIVE-MUST`)

Issue: [#263](https://github.com/jhlagado/ZAX/issues/263)  
Title: `[v0.2] Hidden-lowering risk matrix and focused coverage`

Expected outcome:

- explicit matrix for op expansion, prologue/epilogue, var/arg/global access
- focused tests per risk row with stable diagnostics expectations
- matrix reference: `docs/v02-hidden-lowering-risk-matrix.md`

### WS4: Opcode verification workflow (`NORMATIVE-SHOULD`)

Issue: [#264](https://github.com/jhlagado/ZAX/issues/264)  
Title: `[v0.2] Opcode verification workflow for generated output`

Expected outcome:

- byte-level verification for canonical fixtures
- optional external assembler cross-check documented as non-blocking

## Execution Order

1. Complete WS1 to make generated assembly inspectable.
2. Complete WS2 and WS3 in parallel where practical.
3. Complete WS4 and decide final required-vs-optional CI gating.

## Completion Gate Before v0.3

Required to proceed:

- WS1 complete
- WS2 complete
- WS3 complete
- documented pass/fail policy for WS4 checks

Not sufficient on its own:

- status assertions without linked acceptance evidence
- completion notes without active issue closure evidence

## Planning Hygiene Rules

- All work items must use the `v0.2 change task` structure from `.github/ISSUE_TEMPLATE/v02-change-task.yml`.
- Each PR must reference one primary workstream issue and its acceptance criteria.
- Closeout docs should link to issue evidence rather than duplicate independent checklists.
