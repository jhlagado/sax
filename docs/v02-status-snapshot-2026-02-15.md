# ZAX v0.2 Status Snapshot (February 15, 2026)

This document is the working status source for final v0.2 closeout.

Normative language behavior is defined by `docs/zax-spec.md`.
Transition rationale/history is in `docs/v02-transition-decisions.md`.

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

Canonical checklist artifact: `docs/v02-done-checklist.md`
Checklist state is authoritative in `docs/v02-done-checklist.md`; snapshot checkboxes are contextual only.

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
- `[x]` Add a dedicated done-checklist file (`docs/v02-done-checklist.md`) and link it from status docs.
- `[ ]` Ensure quick guide/playbook wording is consistent for latest CLI warning flags.

## 6. Remaining Work to Finish v0.2

Status: **No blocking v0.2 closeout tasks remain.**

### 6.1 Completed closeout tasks

1. **Status/doc reconciliation**

- Refreshed `docs/zax-dev-playbook.md` status narrative and queue rows.
- Kept this snapshot aligned with playbook/checklist ownership.

2. **Completion evidence publication**

- Published `docs/v02-done-checklist.md` with evidence links for conformance, CI, diagnostics, and docs.

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

## 7. Proposed Timeline

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

## 8. Next Stage

v0.2 is closed.

- Completion declaration: `docs/v02-completion-note-2026-02-15.md`
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

- `[ ]` Lock alias grammar and semantics in `docs/zax-spec.md`:
  - alias form is `name = rhs` (inferred type)
  - explicit typed alias form `name: Type = rhs` is invalid
  - keep typed value-init as `name: Type = valueExpr`
- `[ ]` Define scalar vs non-scalar local initializer policy with unambiguous diagnostics.
- `[ ]` Align inferred-array policy with alias semantics where applicable.

2. Frontend and semantics closure

- `[ ]` AST update plan documented and implemented for var/global initializer split (value-init vs alias-init).
- `[ ]` Parser grammar matrices updated for `globals` and function-local `var`.
- `[ ]` Semantics/type-compatibility rules documented for alias binding compatibility and inference.

3. Codegen and lowering closure

- `[ ]` Finalize frame policy docs for IX-anchored model and return-rewrite behavior.
- `[ ]` Define and test hidden lowering preservation contract against worked examples.
- `[ ]` Validate runtime-atom bounded lowering behavior on nested-expression examples.

4. Evidence closure and readiness signoff

- `[ ]` Publish one readiness report linking: spec deltas, key PRs, and acceptance tests.
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
