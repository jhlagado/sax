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
- `[ ]` Add a concise "v0.2 done criteria" section (or dedicated checklist file) and link it from playbook/spec-facing docs.
- `[ ]` Ensure quick guide/playbook wording is consistent for latest CLI warning flags.

## 6. Remaining Work to Finish v0.2

### 5.1 In-scope closeout tasks

1. **Status/doc reconciliation**

- Refresh `docs/zax-dev-playbook.md` status narrative and next-PR sections to reflect actual current state.
- Keep this snapshot in sync with that playbook update.

2. **Completion evidence publication**

- Create one closeout tracker artifact (issue or doc section) with:
  - final acceptance checklist
  - links to representative passing CI runs
  - links to key completion PRs (`#236`..`#255`)

3. **Final wording polish**

- Perform one pass for CLI/help/docs consistency around:
  - `--op-stack-policy`
  - `--type-padding-warn`
  - `--raw-typed-call-warn`

4. **Behavioral edge verification**

- Confirm negative immediate handling matches spec semantics (two’s-complement truncation in imm8/imm16 contexts).
- Re-verify that example snippets in guides align to accepted parser syntax (enum forms, `select/case` shape, zero-arg `op()`).

5. **Diagnostics stability pass**

- Ensure diagnostic IDs remain stable for common v0.2 migration errors (enum qualification, `arr[(HL)]` vs `arr[HL]`, runtime-atom budget, call-boundary warnings).
- Confirm no “subset/PR” wording remains in user-facing diagnostics.

6. **Acceptance and determinism evidence**

- Capture at least one multi-run determinism check (same inputs produce identical artifacts).
- Ensure `examples/*.zax` compile cleanly on macOS/Linux/Windows as part of evidence bundle.

7. **Issue-tracker hygiene**

- Convert any legacy catch‑all issues into v0.2 change‑task‑shaped items with acceptance criteria/tests, or close them as obsolete.

### 5.2 Explicitly out of scope for v0.2

Not required for declaring v0.2 complete:

- source-interleaved listing quality upgrade (beyond current deterministic listing)
- Debug80 integration
- explicit `^` dereference / `@` address-of operators
- typed-pointer and typed-register-field extensions

## 7. Proposed Timeline

### Phase A: closeout prep (0.5-1 day)

- update playbook/snapshot status sections
- define final checklist artifact shape

### Phase B: closeout execution (0.5-1.5 days)

- publish evidence bundle and links
- run targeted consistency/polish pass if needed

### Phase C: completion declaration (same day as Phase B end)

- publish v0.2 completion note
- freeze v0.2 scope and open v0.3 planning track

Estimated remaining effort to formally close v0.2: **1 to 2.5 days**.

## 8. Decisions Needed

1. Should we add a dedicated `docs/v02-done-checklist.md` file, or keep checklist state in this snapshot?
2. Should next PRs be restricted to closeout-only (no feature additions)?
3. Should v0.3 planning start immediately after closeout declaration, or after a short stabilization window?

## 9. Change Log

- February 15, 2026: initial snapshot created.
- February 15, 2026: revised with current zero-open PR/issue status, explicit closeout checklist, and updated timeline.
