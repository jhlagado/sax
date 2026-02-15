# ZAX v0.2 Done Checklist

This checklist is the release-closeout gate for v0.2.

Normative language behavior is defined by `docs/zax-spec.md`.
This file records completion evidence and signoff state.

Status key:
- `[x]` complete
- `[ ]` pending

## 1. Conformance

- `[x]` v0.2 migration semantics implemented and represented in tests.
- `[x]` Runtime-atom budget and direct call-site `ea`/`(ea)` constraints enforced.
- `[x]` Typed/raw call-boundary diagnostics and policy modes implemented.
- `[ ]` Appendix-C-to-implementation evidence links recorded in this file.

Evidence links:
- PR tranche: `#236`..`#255`
- Add links to specific verification comments/runs here.

## 2. CI and Test Evidence

- `[x]` `main` green on ubuntu/macos/windows.
- `[x]` High-risk matrix suites exist for lowering/diagnostics.
- `[ ]` Determinism evidence captured (repeat run equality for emitted artifacts).
- `[ ]` `examples/*.zax` acceptance evidence captured across CI matrix.

Evidence links:
- Add CI run links here.
- Add exact test command/result references here.

## 3. CLI and Docs Consistency

- `[x]` New warning/policy flags are implemented in CLI:
  - `--op-stack-policy`
  - `--type-padding-warn`
  - `--raw-typed-call-warn`
- `[ ]` Quick guide, playbook, and status snapshot wording are aligned.
- `[ ]` `docs/zax-dev-playbook.md` stale "in progress" sections reconciled.

Evidence links:
- Add docs PR/commit links here.

## 4. Diagnostics Stability

- `[ ]` Core v0.2 migration diagnostics confirmed stable:
  - enum qualification
  - `arr[HL]` vs `arr[(HL)]`
  - runtime-atom budget
  - call-boundary warnings
- `[ ]` No legacy "subset/PR" wording remains in user-facing diagnostics.

Evidence links:
- Add test files and grep/audit links here.

## 5. Scope Freeze and Declaration

- `[ ]` Closeout-only policy confirmed for final v0.2 PRs.
- `[ ]` Final v0.2 completion note published.
- `[ ]` v0.3 planning track opened after v0.2 declaration.

## 6. Out of Scope for v0.2

These are intentionally deferred and do not block v0.2 completion:

- source-interleaved listing quality upgrade
- Debug80 integration
- explicit `^` dereference / `@` address-of operators
- typed-pointer and typed-register-field extensions

