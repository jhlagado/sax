# ZAX v0.2 Done Checklist

This checklist is the release-closeout gate for v0.2.

Normative language behavior is defined by `docs/zax-spec.md`.
This file records completion evidence and signoff state.

Active state (as of February 17, 2026): **reopened gate in Section 8 is authoritative**.

Status key:

- `[x]` complete
- `[ ]` pending

## 1. Conformance

- `[x]` v0.2 migration semantics implemented and represented in tests.
- `[x]` Runtime-atom budget and direct call-site `ea`/`(ea)` constraints enforced.
- `[x]` Typed/raw call-boundary diagnostics and policy modes implemented.
- `[x]` Appendix-C-to-implementation evidence links recorded in this file.

Evidence links:

- Migration conformance tranche: [#236](https://github.com/jhlagado/ZAX/pull/236) .. [#255](https://github.com/jhlagado/ZAX/pull/255)
- Spec migration tracker: `docs/zax-spec.md` Appendix C
- Runtime-atom enforcement: [#236](https://github.com/jhlagado/ZAX/pull/236), [#237](https://github.com/jhlagado/ZAX/pull/237), [#248](https://github.com/jhlagado/ZAX/pull/248)
- Typed/raw call policy and warning modes: [#251](https://github.com/jhlagado/ZAX/pull/251), [#252](https://github.com/jhlagado/ZAX/pull/252), [#255](https://github.com/jhlagado/ZAX/pull/255)

## 2. CI and Test Evidence

- `[x]` `main` green on ubuntu/macos/windows.
- `[x]` High-risk matrix suites exist for lowering/diagnostics.
- `[x]` Determinism evidence captured (repeat run equality for emitted artifacts).
- `[x]` `examples/*.zax` acceptance evidence captured across CI matrix.

Evidence links:

- Representative green CI runs on `main`:
  - [run 22027269309](https://github.com/jhlagado/ZAX/actions/runs/22027269309)
  - [run 22027452113](https://github.com/jhlagado/ZAX/actions/runs/22027452113)
- Determinism tests:
  - `test/determinism_artifacts.test.ts`
  - `test/cli_determinism_contract.test.ts`
- Examples acceptance test:
  - `test/examples_compile.test.ts`

## 3. CLI and Docs Consistency

- `[x]` New warning/policy flags are implemented in CLI:
  - `--op-stack-policy`
  - `--type-padding-warn`
  - `--raw-typed-call-warn`
- `[x]` Quick guide, playbook, and status snapshot wording are aligned.
- `[x]` `docs/zax-dev-playbook.md` stale "in progress" sections reconciled.

Evidence links:

- CLI flag implementations:
  - [#246](https://github.com/jhlagado/ZAX/pull/246)
  - [#247](https://github.com/jhlagado/ZAX/pull/247)
  - [#250](https://github.com/jhlagado/ZAX/pull/250)
  - [#255](https://github.com/jhlagado/ZAX/pull/255)
- Docs closeout/status files:
  - [#256](https://github.com/jhlagado/ZAX/pull/256)
  - [#257](https://github.com/jhlagado/ZAX/pull/257)
  - [#258](https://github.com/jhlagado/ZAX/pull/258)

## 4. Diagnostics Stability

- `[x]` Core v0.2 migration diagnostics confirmed stable:
  - enum qualification
  - `arr[HL]` vs `arr[(HL)]`
  - runtime-atom budget
  - call-boundary warnings
- `[x]` No legacy "subset/PR" wording remains in user-facing diagnostics.

Evidence links:

- Enum qualification diagnostics:
  - `test/pr4_enum.test.ts`
- `arr[HL]` vs `arr[(HL)]` parsing semantics:
  - `test/parser_nested_index.test.ts`
- Runtime-atom diagnostics:
  - `test/pr264_runtime_atom_budget_matrix.test.ts`
  - `test/pr262_ld_nested_runtime_index.test.ts`
- Call-boundary and raw-typed-call diagnostics:
  - `test/pr275_typed_vs_raw_call_boundary_diagnostics.test.ts`
  - `test/pr278_raw_call_typed_target_warning.test.ts`
- Legacy wording audit anchor:
  - `src/lowering/emit.ts` (`bin declarations cannot target section "var" in v0.2.`)

## 5. Scope Freeze and Declaration

- `[x]` Closeout-only policy confirmed for final v0.2 PRs.
- `[x]` Final v0.2 completion note published.
- `[x]` v0.3 planning track opened after v0.2 declaration.

Evidence links:

- v0.2 completion note: `docs/v02-completion-note-2026-02-15.md`
- v0.3 planning track: `docs/v03-planning-track.md`

## 6. Out of Scope for v0.2

These are intentionally deferred and do not block v0.2 completion:

- source-interleaved listing quality upgrade
- Debug80 integration
- explicit `^` dereference / `@` address-of operators
- typed-pointer and typed-register-field extensions

## 7. Signoff

- v0.2 closeout gate status: **COMPLETE**
- Declared on: **February 15, 2026**

## 8. Reopened v0.2 Gate (February 17, 2026 Addendum)

Historical closeout remains recorded above; this addendum defines the active gate.

Status key:

- `[x]` complete
- `[ ]` pending

### 8.1 Normative spec closure

- `[ ]` Alias declaration grammar is fixed in `docs/zax-spec.md`:
  - valid alias form: `name = rhs`
  - invalid typed alias form: `name: Type = rhs`
  - typed value-init remains `name: Type = valueExpr`
- `[ ]` `globals` and function-local `var` initializer policy is fully specified (scalar value-init vs alias-init).
- `[ ]` Inferred-length array policy is aligned with alias semantics and documented with examples.

### 8.2 Parser/AST/Semantics closure

- `[ ]` AST supports required initializer forms for `globals`/`var` declarations.
- `[ ]` Parser accepts valid forms and rejects invalid forms with stable diagnostics.
- `[ ]` Semantics enforce alias compatibility/inference and local non-scalar restrictions consistently.

### 8.3 Codegen/lowering closure

- `[ ]` Function frame policy (IX-anchor + epilogue rewriting) is locked and reflected in tests.
- `[ ]` Hidden lowering register-preservation contract is validated in fixture corpus.
- `[ ]` Nested expression lowering (runtime-atom bounded) has positive and negative acceptance coverage.

### 8.4 Readiness audits

- `[ ]` Spec audit complete: no conflicting rule definitions across docs.
- `[ ]` Conformance audit complete: implementation behavior matches normative spec.
- `[ ]` Codegen acceptance audit complete: worked examples and expected lowered traces verified.

### 8.5 Completion condition

v0.2 is complete only when all items in Sections 8.1-8.4 are checked.
