# ZAX v0.2 Status Snapshot (February 15, 2026)

This document is the working status source for final v0.2 closeout.

Normative language behavior is defined by `docs/zax-spec.md`.
Transition rationale/history is in `docs/v02-transition-decisions.md`.

Active state (as of February 17, 2026): **v0.2 reopened** pending the addendum gates in Section 10.
Current operational gate status is defined only by Section 10 in this file and `docs/v02-codegen-verification.md`.

## 1. Snapshot Scope

- Snapshot date: **February 15, 2026**
- Repository: `jhlagado/ZAX`
- Purpose: record current delivery state, remaining v0.2 work, and closeout timeline

## 2. Verified GitHub State (as of February 15, 2026)

- Open pull requests: **0**
- Open issues: **0**
- Most recent merged PR on `main`: [#255](https://github.com/jhlagado/ZAX/pull/255)
  - Title: `v0.2: optional warning for raw call to typed targets`
  - CI status at merge: green on ubuntu/macos/windows

## 3. Delivery Progress Summary

The core v0.2 catch-up tranche merged across PRs `#236` through `#255`, including:

- runtime-atom enforcement for source-level `ea` expressions
- runtime-atom-free direct `ea`/`(ea)` call-site enforcement
- op stack-policy alignment and CLI policy modes
- typed-call boundary and raw-call diagnostic clarity
- D8M/source mapping and op-expansion call-site attribution hardening
- runtime affine index/offset lowering for single-atom expressions
- optional warning modes surfaced in compile API and CLI

Assessment: v0.2 implementation appears functionally complete for current conformance scope, with closeout work now focused on release hygiene and explicit completion evidence.

## 4. Spec Alignment Evidence

- Normative source remains `docs/zax-spec.md`; `docs/v02-transition-decisions.md` remains non-normative transition history.
- `docs/zax-spec.md` Appendix C (v0.1 -> v0.2 migration coverage tracker) is fully checked in the current mainline snapshot.
- Recent merged PR sequence (`#236`..`#255`) aligns implementation/tests with that normative migration set.

## 5. v0.2 Completion Checklist (Closeout Gate)

Canonical checklist artifact: this snapshot document (Section 10).
This file is authoritative for reopened v0.2 gate state.

Status key:

- `[x]` complete
- `[ ]` pending

1. Conformance and behavior

- `[x]` Core v0.2 migration semantics represented in implementation/tests.
- `[x]` Runtime-atom and call-boundary rule set enforced with diagnostics.
- `[x]` Optional policy/warning modes integrated and contract-tested.

2. CI and quality

- `[x]` Current `main` is green on ubuntu/macos/windows.
- `[x]` Matrix-style regression tests exist for recent high-risk lowering/diagnostic areas.
- `[ ]` Final closeout evidence bundle (single place linking key CI runs/tests/PRs) published.

3. Docs and tracker hygiene

- `[ ]` Update stale "in progress"/historical sections in `docs/zax-dev-playbook.md` to match current zero-open PR/issue state.
- `[x]` Closeout checklist captured and linked in status documentation.
- `[ ]` Ensure quick guide/playbook wording is consistent for latest CLI warning flags.

## 6. Historical Remaining Work to Finish v0.2 (February 15 closeout snapshot)

Historical status at snapshot time: **No blocking v0.2 closeout tasks remained.**

### 6.1 Completed closeout tasks

1. **Status/doc reconciliation**

- Refreshed `docs/zax-dev-playbook.md` status narrative and queue rows.
- Kept this snapshot aligned with playbook/checklist ownership.

2. **Completion evidence publication**

- Published closeout evidence links for conformance, CI, diagnostics, and docs.

3. **Final wording polish**

- Completed wording consistency pass for:
  - `--op-stack-policy`
  - `--type-padding-warn`
  - `--raw-typed-call-warn`

4. **Behavioral edge verification**

- Verified negative immediate semantics via merged v0.2 test tranche.
- Verified guide syntax alignment via docs cleanup + examples acceptance suite.

5. **Diagnostics stability pass**

- Confirmed stable diagnostics coverage for migration-critical cases.
- Removed remaining legacy "current subset" user-facing wording in lowering.

6. **Acceptance and determinism evidence**

- Determinism evidence captured in dedicated test suites.
- `examples/*.zax` acceptance evidence captured in CI matrix.

7. **Issue-tracker hygiene**

- Legacy catch-all tracker items were closed or folded into explicit artifacts.

### 6.2 Explicitly out of scope for v0.2

Not required for declaring v0.2 complete:

- source-interleaved listing quality upgrade (beyond current deterministic listing)
- Debug80 integration
- explicit `^` dereference / `@` address-of operators
- typed-pointer and typed-register-field extensions

## 7. Historical Timeline (February 15 closeout snapshot)

### Phase A: closeout prep (complete)

- update playbook/snapshot status sections
- define final checklist artifact shape

### Phase B: closeout execution (complete)

- publish evidence bundle and links
- run targeted consistency/polish pass if needed

### Phase C: completion declaration (complete)

- publish v0.2 completion note
- freeze v0.2 scope and open v0.3 planning track

Estimated remaining effort to formally close v0.2: **0 days (closed)**.
Historical note: this estimate reflects the February 15 snapshot state only and is superseded by Section 10 reopened gates.

## 8. Historical Next Stage (February 15 closeout snapshot)

Historical closeout state at February 15 snapshot:

v0.2 is closed.

- Historical completion declaration was published on February 15, 2026.
- Next planning track: `docs/v03-planning-track.md`

## 9. Change Log

- February 15, 2026: initial snapshot created.
- February 15, 2026: revised with current zero-open PR/issue status, explicit closeout checklist, and updated timeline.
- February 15, 2026: linked dedicated closeout checklist file and corrected section numbering.
- February 15, 2026: closeout tasks marked complete and snapshot transitioned to post-closeout state.
- February 17, 2026: v0.2 scope reopened for grammar/AST/codegen clarification track (alias semantics, initializer model, frame-policy validation, and expanded worked-example coverage).

## 10. Reopened Scope Addendum (February 17, 2026)

This section supersedes the "v0.2 is closed" operational status above while preserving historical record.

### 10.1 Why v0.2 is reopened

- The language still has unresolved normative behavior for alias declarations and initializer semantics in `globals`/function `var` blocks.
- Current parser/AST/lowering constraints are narrower than current design intent for aliasing and composite-reference workflows.
- Codegen/lowering examples are not yet a full acceptance corpus for hidden lowering and runtime-atom bounded nested expression handling.

### 10.2 v0.2 must-complete items (new gate)

Status key:

- `[x]` complete
- `[ ]` pending

1. Normative language closure

- `[x]` Lock alias grammar and semantics in `docs/zax-spec.md`:
  - alias form is `name = rhs` (inferred type)
  - explicit typed alias form `name: Type = rhs` is invalid
  - keep typed value-init as `name: Type = valueExpr`
- `[x]` Define scalar vs non-scalar local initializer policy with unambiguous diagnostics.
- `[x]` Align inferred-array policy with alias semantics where applicable.

2. Frontend and semantics closure

- `[x]` AST update plan documented and implemented for var/global initializer split (value-init vs alias-init).
- `[x]` Parser grammar matrices updated for `globals` and function-local `var`.
- `[x]` Semantics/type-compatibility rules documented for alias binding compatibility and inference.

3. Codegen and lowering closure

- `[ ]` Finalize frame policy docs for IX-anchored model and return-rewrite behavior.
- `[ ]` Define and test hidden lowering preservation contract against worked examples.
- `[ ]` Validate runtime-atom bounded lowering behavior on nested-expression examples.

4. Evidence closure and readiness signoff

- `[ ]` Publish one readiness report linking: spec deltas, key PRs, and acceptance tests.
- `[ ]` Keep `docs/v02-codegen-verification.md` aligned with implemented tests/issues before final signoff.
- `[ ]` Run a pre-closeout doc audit and implementation-conformance audit.
- `[ ]` Reissue completion note only after all above gates are closed.

### 10.3 Audit and review gates required before declaring v0.2 complete

1. Spec audit (normative)

- `docs/zax-spec.md` has no conflicting behavior definitions against supporting docs.
- Alias/initializer rules are fully specified with valid/invalid examples.
- Function frame/call boundary policy is explicit and testable.

2. Implementation-conformance audit

- Parser and diagnostics match the spec grammar exactly.
- AST and lowering behavior match alias/value-init semantics exactly.
- Runtime-atom diagnostics and lowering outcomes match spec and worked examples.

3. Codegen acceptance audit

- Worked examples compile and match expected lowered `.asm` trace shape.
- Required coverage includes scalar, alias, composite-addressing, and nested index/address expressions within runtime-atom budget.
- Reject-path diagnostics are demonstrated for out-of-budget expressions.

### 10.5 Issue #274 Closure Evidence (Normative Text + Test Identification)

Primary issue: [#274](https://github.com/jhlagado/ZAX/issues/274)

Normative text anchors completed in this tranche:

- Alias/value-init grammar and classification:
  - `docs/zax-spec.md` Section 6.2 (`globals`)
  - `docs/zax-spec.md` Section 8.1 (function-local `var`)
- Invalid typed alias and local non-scalar policy:
  - `docs/zax-spec.md` Section 6.2 rules
  - `docs/zax-spec.md` Section 8.1 rules
  - `docs/zax-spec.md` Section 11.3 diagnostics guidance

Acceptance test identification (implemented in [#275](https://github.com/jhlagado/ZAX/issues/275)):

1. Rule: alias form `name = rhs` is valid (inferred type)

- Positive test target: `test/pr285_alias_init_parser_semantics_matrix.test.ts` (`accepts globals/local value-init and inferred alias-init forms`)
- Negative test target: `test/pr285_alias_init_parser_semantics_matrix.test.ts` (`rejects typed alias form in globals and function-local var blocks`)

2. Rule: typed value-init `name: Type = valueExpr` is valid

- Positive test target: `test/pr285_alias_init_parser_semantics_matrix.test.ts` (`accepts globals/local value-init and inferred alias-init forms`)
- Negative test target: `test/pr285_alias_init_parser_semantics_matrix.test.ts` (`rejects inferred alias declarations when rhs is not an address expression`)

3. Rule: explicit typed alias `name: Type = rhs` is invalid

- Positive test target: `test/pr285_alias_init_parser_semantics_matrix.test.ts` (`accepts globals/local value-init and inferred alias-init forms`)
- Negative test target: `test/pr285_alias_init_parser_semantics_matrix.test.ts` (`rejects typed alias form in globals and function-local var blocks`)

4. Rule: scalar vs non-scalar local initializer policy is explicit

- Positive test target: `test/pr285_alias_init_parser_semantics_matrix.test.ts` (`accepts globals/local value-init and inferred alias-init forms`)
- Negative test target: `test/pr285_alias_init_parser_semantics_matrix.test.ts` (`rejects non-scalar local storage declarations without alias form`)

### 10.6 Issue #276 Progress Evidence (Non-Scalar Call Compatibility)

Primary issue: [#276](https://github.com/jhlagado/ZAX/issues/276)

Spec/example anchors exercised by implementation/tests:

- `docs/zax-spec.md` Section 8.2 (non-scalar argument contract)
- `docs/v02-codegen-worked-examples.md` Section 11.3 (`[]` vs `[N]` compatibility)

Implemented compatibility checks:

- `T[N] -> T[]` accepted
- exact `T[N] -> T[N]` accepted
- `T[] -> T[N]` rejected without exact-length proof
- element-type mismatch rejected

Acceptance tests:

- `test/pr286_nonscalar_param_compat_matrix.test.ts`
  - positive fixture: `test/fixtures/pr286_nonscalar_param_compat_positive.zax`
  - negative fixture: `test/fixtures/pr286_nonscalar_param_compat_negative.zax`

### 10.7 Issue #263 Closure Evidence (Hidden-Lowering Risk Matrix)

Primary issue: [#263](https://github.com/jhlagado/ZAX/issues/263)

Normative anchor:

- `docs/zax-spec.md` (hidden lowering responsibilities, call-boundary contract, diagnostics stability expectations)

Verification/evidence anchors:

- `docs/v02-codegen-verification.md` Section 6 (risk matrix rows and focused row-to-test mappings)
- `docs/v02-codegen-verification.md` Section 6.1 (diagnostics-contract evidence for IDs/message families)

Focused acceptance tests:

- `test/pr283_hidden_lowering_risk_matrix.test.ts`
  - positive matrix coverage for op expansion attribution, typed-call preservation wrappers, and local/arg/global frame access
  - negative guardrails for op-stack-policy escalation and non-zero fallthrough stack delta
- `test/pr14_frame_epilogue.test.ts`
  - function prologue/epilogue rewrite behavior and untracked-SP slot-access guardrail
- `test/pr275_typed_vs_raw_call_boundary_diagnostics.test.ts`
  - typed-call vs raw-call diagnostic separation remains stable

Closeout result for #263:

- hidden-lowering matrix categories are explicitly documented
- each matrix row is linked to at least one focused positive and one guardrail/negative test
- matrix/evidence links are now present in active v0.2 closeout planning docs

### 10.8 Issue #264 Closure Evidence (Internal Opcode Verification Workflow)

Primary issue: [#264](https://github.com/jhlagado/ZAX/issues/264)

Normative anchor:

- `docs/zax-spec.md` (assembler-first semantics, predictable lowering)

Workflow/runbook anchor:

- `docs/v02-codegen-verification.md` Section 7 (WS4 runbook, command, expected output shape, CI policy)

Acceptance test coverage:

- `test/pr287_opcode_verification_workflow.test.ts`
  - positive per-tier opcode-byte verification using generated `.asm` trace as the primary artifact
  - tier baselines:
    - `test/fixtures/corpus/opcode_expected/basic_control_flow.hex`
    - `test/fixtures/corpus/opcode_expected/intermediate_indexing.hex`
    - `test/fixtures/corpus/opcode_expected/advanced_typed_calls.hex`
  - negative mismatch case with actionable failure output (`offset`, `expected`, `actual`, lengths)

Policy evidence:

- required CI path: default `test` matrix includes `test/pr287_opcode_verification_workflow.test.ts`
- optional/non-blocking external cross-check remains in `#266` only

### 10.4 Updated timeline (reopened v0.2)

Phase A: normative closure (doc-first)

- finalize grammar/AST/semantic spec deltas
- freeze "must-complete" issue set under v0.2 milestone

Phase B: implementation + acceptance evidence

- land parser/AST/lowering changes
- land worked-example corpus and compile assertions

Phase C: readiness and declaration

- complete spec + conformance audits
- publish final v0.2 readiness report
- publish updated completion note
