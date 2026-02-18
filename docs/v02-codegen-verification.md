# v0.2 Codegen Verification Gate

This document is the single v0.2 codegen-verification reference.

Normative language behavior is defined by `docs/zax-spec.md`.
This file is non-normative and tracks verification scope, evidence model, and focused coverage.

## 1. Objective

Establish credible proof that ZAX lowering generates valid, reviewable Z80 output across simple-to-complex source cases, with explicit focus on hidden lowering paths.

v0.3 implementation work is blocked until these verification workstreams are complete.

## 2. Lowering Design Baseline

Verification is anchored to this lowering model:

- hidden lowering must be composable and preservation-safe
- register/stack contracts are explicit per lowering primitive
- deterministic emitted `.asm` is required for reviewability

### 2.1 Primitive Contract Requirements

Each hidden lowering primitive must define:

- `inputs`: required register/memory state
- `outputs`: destination/result register(s) or memory effects
- `clobbers`: exact register set that may be modified
- `sp_delta`: net stack change in bytes
- `flags_policy`: preserved or clobbered flag behavior

Composition rule:

- compose primitives only when contracts are compatible
- if live values overlap with `clobbers`, primitive must self-preserve or alternate sequence must be used
- net stack effect across composed lowering must be known and validated

### 2.2 Stack-Effect Model

Lowering is reasoned about as first-class stack effects:

- `sp_delta` is first-class, not incidental
- structured lowering blocks compose like stack words/macros
- `push`/`pop`, `ex de,hl`, and `ex (sp),hl` are valid composition tools when contract-defined

### 2.3 IX Frame Direction

Preferred framed-function direction is `IX`-anchored access:

- `IX+0..1`: saved old `IX`
- `IX+2..3`: return address
- `IX+4..`: arguments
- `IX-1..`: locals

Canonical frame pattern:

```asm
; prologue
push ix
ld ix, 0
add ix, sp
; allocate locals
push af
push bc
push de

; epilogue
pop de
pop bc
pop af
ld sp, ix
pop ix
ret
```

Notes for design review:

- Preservation (`AF/BC/DE`) is unconditional for all functions (including `main`) even when no locals/args are present; this keeps typed-call boundary guarantees consistent.
- A single synthetic epilogue is always emitted; all `ret`/`ret cc` in the body rewrite to it when cleanup is needed, and fallthrough reaches it directly (no dead JP).
- Minimal epilogue still contains the preservation pops plus the final `ret`; frame restore (`ld sp, ix` / `pop ix`) only appears when a frame exists.

`ld sp, ix` then `ret` without restoring saved `IX` is invalid for this model.

### 2.4 Call-Boundary Interaction

Typed boundary behavior remains:

- non-void typed call returns via `HL` (`L` for byte)
- `HL` is treated as volatile across typed call boundaries, including `void`

Additional lowering rule in framed mode:

- `IX` is preserved frame state and must survive nested calls
- hidden wrappers preserve required live state per primitive contracts

### 2.5 Performance Policy

Policy is predictability-first, not shortest-instruction-count-first:

- prioritize preservation and composability guarantees
- accept localized overhead in arg/local access where needed
- optimize only when contract safety is unchanged

## 3. Workstreams (Issue-Tracked)

### WS1: Inspectable source output (`NORMATIVE-MUST`)

Issue: [#261](https://github.com/jhlagado/ZAX/issues/261)

Expected outcome:

- deterministic `.asm` emission is available for representative programs
- emitted source is sufficient to inspect hidden lowering decisions

### WS2: Complexity-tiered golden corpus (`NORMATIVE-MUST`)

Issue: [#262](https://github.com/jhlagado/ZAX/issues/262)

Expected outcome:

- basic/intermediate/advanced fixture tiers
- golden lowering artifacts checked in and asserted by tests

### WS3: Hidden-lowering risk matrix (`NORMATIVE-MUST`)

Issue: [#263](https://github.com/jhlagado/ZAX/issues/263)

Expected outcome:

- explicit matrix for op expansion, prologue/epilogue, var/arg/global access
- direct mapping from each high-risk row to focused tests

### WS4: Opcode confidence validation workflow (`NORMATIVE-MUST`)

Issue: [#264](https://github.com/jhlagado/ZAX/issues/264)

Expected outcome:

- documented process for validating lowered output against opcode expectations
- workflow usable by reviewers before implementation-phase merges
- generated `.asm` trace is the primary review artifact for opcode verification

### WS5: Sample ladder acceptance (`NORMATIVE-MUST`)

Issue: [#265](https://github.com/jhlagado/ZAX/issues/265)

Expected outcome:

- increasingly complex source samples with expected lowered output
- acceptance checks tied to codegen invariants

### WS6: Optional external cross-check (`NORMATIVE-SHOULD`)

Issue: [#266](https://github.com/jhlagado/ZAX/issues/266)

Expected outcome:

- optional, documented external assembler cross-check path
- does not replace primary source-level lowering verification

## 4. Execution Order

1. WS1 `.asm` inspectability and deterministic output
2. WS2 tiered golden corpus
3. WS3 hidden-lowering risk matrix coverage
4. WS4 opcode confidence workflow
5. WS5 sample ladder acceptance
6. WS6 optional external cross-check

## 5. Tiered Corpus and Golden Workflow

Current tier cases:

- basic: `test/fixtures/corpus/basic_control_flow.zax`
- intermediate: `test/fixtures/corpus/intermediate_indexing.zax`
- advanced: `test/fixtures/corpus/advanced_typed_calls.zax`
- negative runtime-atom case: `test/fixtures/corpus/invalid_runtime_atom_budget.zax`

Golden snapshots:

- `test/fixtures/corpus/golden/basic_control_flow.asm`
- `test/fixtures/corpus/golden/intermediate_indexing.asm`
- `test/fixtures/corpus/golden/advanced_typed_calls.asm`

Test harness:

- `test/pr282_tiered_golden_corpus.test.ts`

Update workflow for intentional lowering changes:

1. Update/add corpus fixture(s).
2. Regenerate only affected `.asm` golden files.
3. Include one focused rationale per changed golden in the PR description.
4. Run relevant local validation for changed scope before push.

Anti-overfitting rules:

- Keep each tier representative; do not bake in incidental formatting-only expectations.
- Prefer invariant assertions in tests when full golden snapshots are brittle.
- Add a negative fixture whenever new lowering constraints are introduced.

## 6. Hidden-Lowering Risk Matrix

| Risk Category                                    | Invariant                                                                                   | Positive Coverage                                                                             | Negative/Guardrail Coverage                                               |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Op expansion call-site attribution               | Expanded op code remains attributable to call site as macro-originated output               | `test/pr269_d8m_op_macro_callsite_mapping.test.ts`                                            | `test/pr268_op_diagnostics_matrix.test.ts`                                |
| Op expansion stack discipline at call boundaries | Stack-neutral/non-neutral op effects are surfaced at boundaries, including policy mode      | `test/pr271_op_stack_policy_alignment.test.ts` (`warn`)                                       | `test/pr283_hidden_lowering_risk_matrix.test.ts` (`opStackPolicy: error`) |
| Typed call wrappers (`void` vs non-`void`)       | Preservation wrappers are emitted per v0.2 contract; return channel remains HL for non-void | `test/pr276_typed_call_preservation_matrix.test.ts`                                           | `test/pr224_lowering_call_boundary_stack_matrix.test.ts`                  |
| Raw call vs typed-call diagnostics               | Raw-call warnings are distinct and opt-in without changing typed-call rules                 | `test/pr278_raw_call_typed_target_warning.test.ts`                                            | `test/pr275_typed_vs_raw_call_boundary_diagnostics.test.ts`               |
| Function prologue/epilogue rewriting             | Locals trigger synthetic epilogue and conditional-return rewrites correctly                 | `test/pr14_frame_epilogue.test.ts`                                                            | `test/pr229_lowering_retn_reti_safety_matrix.test.ts`                     |
| Local/arg/global access in framed functions      | Lowering preserves stack/frame safety while materializing local/arg/global accesses         | `test/pr283_hidden_lowering_risk_matrix.test.ts` (`pr283_local_arg_global_access_matrix.zax`) | `test/pr14_frame_epilogue.test.ts` (untracked SP slot access error case)  |
| Structured-control + hidden lowering joins       | Unknown/untracked states propagate correctly to ret/fallthrough diagnostics                 | `test/pr221_lowering_op_expansion_retcc_interactions.test.ts`                                 | `test/pr198_lowering_unknown_stack_states.test.ts`                        |

### 6.1 Diagnostics Contract Evidence (Issue #263)

The diagnostics contract tied to hidden-lowering rows is anchored by focused tests that assert stable IDs and category-specific wording where required:

- `test/pr283_hidden_lowering_risk_matrix.test.ts`
  - `DiagnosticIds.OpStackPolicyRisk` for op-stack-policy escalation (`opStackPolicy: error`)
  - `DiagnosticIds.RawCallTypedTargetWarning` for raw-to-typed warning path
  - `DiagnosticIds.EmitError` for stack-delta-at-fallthrough and typed/raw boundary-contract guardrail paths
- `test/pr275_typed_vs_raw_call_boundary_diagnostics.test.ts`
  - distinct typed-call vs raw-call boundary diagnostics remain present as separate message forms
- `test/pr278_raw_call_typed_target_warning.test.ts`
  - warning-mode toggle behavior and stable warning diagnostic ID

If wording or ID changes are intentional, the owning PR must update this section and the corresponding focused tests in the same change.

## 7. WS4 Opcode Verification Runbook

Canonical verification test:

- `test/pr287_opcode_verification_workflow.test.ts`

Opcode expectation baselines (one per tier):

- `test/fixtures/corpus/opcode_expected/basic_control_flow.hex`
- `test/fixtures/corpus/opcode_expected/intermediate_indexing.hex`
- `test/fixtures/corpus/opcode_expected/advanced_typed_calls.hex`

Workflow command:

```bash
yarn -s vitest run test/pr287_opcode_verification_workflow.test.ts
```

Expected passing output shape:

- 3 positive tier verifications pass (`basic`, `intermediate`, `advanced`)
- 1 negative mismatch test passes by asserting actionable failure text (offset + expected/actual bytes)
- comparisons are against opcode bytes embedded in generated `.asm` trace lines (fixup placeholders remain `$00` where unresolved in trace form)

CI policy (required vs optional):

- required for v0.2 closeout PRs touching lowering/codegen verification scope:
  - default CI `test` jobs (`ubuntu/macos/windows`) which include `test/pr287_opcode_verification_workflow.test.ts`
- optional/non-blocking:
  - external assembler cross-check track in issue `#266` (`NORMATIVE-SHOULD`)

## 8. Completion Gate Before v0.3

All `NORMATIVE-MUST` workstreams (WS1 through WS5) must be complete and linked to passing evidence before declaring v0.2 codegen verification complete.

WS6 remains optional and may land after v0.3 starts.
