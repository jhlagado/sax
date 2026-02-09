# ZAX Roadmap (Reality Check, Assembler-First)

This roadmap replaces optimistic status tracking with a risk-first plan.

Core policy:

- Build a fully working assembler first.
- Defer Debug80 integration until assembler completion gates are met.

**Last updated:** 2026-02-09

---

## 1) Reality Check (Current State)

The codebase has meaningful progress, but it is **not near complete** for a production-grade v0.1 assembler.

### What exists

- End-to-end pipeline with parser, lowering, encoder, and emit path.
- Many language features merged (`import`, `op`, structured control flow, `bin`, Intel HEX ingestion).
- Baseline diagnostics and tests with good PR-by-PR fixture history.

### What is still materially incomplete

1. Instruction encoding coverage is narrow.

- `src/z80/encode.ts` is ~274 lines and currently handles only a limited subset.
- Large portions of Z80 ISA (including common conditional/control and bit operations) are still missing.

2. Parser/AST behavior is not fully settled.

- `src/frontend/parser.ts` is large (~1,618 lines) with known edge-case TODOs.
- Several grammar/behavior areas are subset-constrained or intentionally unsupported today.
- Parser robustness/error recovery strategy is still shallow.

3. Lowering/codegen complexity remains high-risk.

- `src/lowering/emit.ts` is ~2,283 lines and centralizes many responsibilities.
- Complex concerns (SP tracking, frame cleanup rewriting, op expansion, section/address map coordination) are tightly coupled.
- Some semantics are intentionally subset-limited in lowering today.

4. Output/tooling completeness is partial.

- `.bin`, `.hex`, and D8M exist, but `.lst` is still not complete.
- CLI parity with `docs/zax-cli.md` is not fully proven as a stable contract.

5. Hardening and acceptance are incomplete.

- Not all spec-level negative classes are covered.
- Examples acceptance and deterministic cross-platform behavior need explicit gate enforcement.

---

## 2) Non-Negotiable Priority

Debug80 integration is **not** an active priority.

No Debug80 integration work begins until all assembler completion gates (Section 3) are satisfied.

---

## 3) Assembler Completion Gates (Must All Pass)

Treat ZAX as "integration-ready" only when every gate below is green:

1. Spec gate

- All `v0.1` features in `docs/zax-spec.md` are implemented, or intentionally rejected with stable diagnostics.

2. Parser/AST gate

- Grammar behavior is explicitly documented for all accepted/rejected forms.
- No known parser TODOs in core grammar paths remain unresolved.
- Error reporting spans are consistent for syntax/structure failures.

3. Codegen gate

- Frame/SP semantics validated across nested control flow and op expansion paths.
- Return rewriting/epilogue behavior is proven by focused tests (including corner cases).
- Address map/fixup behavior is deterministic and overlap-safe.

4. ISA gate

- Required Z80 instruction subset for v0.1 examples and intended workflows is implemented and tested.
- Relative branch range validation exists where applicable.

5. CLI/output gate

- `docs/zax-cli.md` baseline options are implemented and tested.
- `.bin`, `.hex`, `.d8dbg.json`, and `.lst` behavior is deterministic and contract-tested.

6. Hardening gate

- `examples/*.zax` compile in CI on macOS/Linux/Windows.
- Negative fixture coverage includes major parser/semantic/lowering/encoding failure classes.
- Determinism checks prove output stability independent of host/path ordering.

---

## 4) Execution Plan (Serious Ordering)

### Phase A - Parser/AST closure

Objective: finish language-front-end behavior before more backend complexity.

- Resolve remaining grammar edge cases (including nested index expressions).
- Tighten AST invariants and parser diagnostics consistency.
- Add parser-focused negative fixtures for malformed/ambiguous constructs.
- Document any intentional rejections in spec-facing notes.

Exit criteria:

- Parser TODO list for core language is empty.
- Parser negative coverage materially expanded and stable.

### Phase B - Lowering/codegen stabilization

Objective: reduce semantic risk in `emit.ts` before broad ISA expansion.

- Lock SP/frame accounting rules with explicit invariants and tests.
- Complete op expansion safety behavior (autosave/clobber/stack delta).
- Strengthen structured-control lowering correctness under deep nesting.
- Add targeted tests for difficult interactions (calls + locals + control + ops).

Exit criteria:

- No known correctness gaps in frame/stack/control interactions.
- Complex-path tests pass consistently.

### Phase C - ISA coverage expansion

Objective: close practical instruction gaps in `encode.ts`.

- Add missing arithmetic/logic, branch/control, bit/rotate/shift, and key system ops.
- Add range checks and clear diagnostics for unsupported/invalid forms.
- Keep each ISA increment in small PR slices with fixtures.

Exit criteria:

- Required instruction set for v0.1 workflows/examples is complete and tested.

### Phase D - CLI and artifact completion

Objective: finalize user-facing compiler contract.

- Complete CLI option behavior against `docs/zax-cli.md`.
- Implement and validate `.lst` output.
- Improve D8M fidelity where needed for stable debug mapping.

Exit criteria:

- CLI contract and artifact set are test-backed and stable.

### Phase E - Hardening and acceptance

Objective: prove reliability and reproducibility.

- Expand negative suites for diagnostics and edge behavior.
- Enforce examples compilation in CI.
- Run determinism and cross-platform path audits.

Exit criteria:

- All completion gates in Section 3 pass.

### Phase F - Debug80 integration (deferred)

Unlocked only after Phases A-E complete.

- Add `.zax` detection/invocation in Debug80.
- Validate artifact discovery and stepping workflow end-to-end.

---

## 5) Immediate Next PR Sequence

Use only real GitHub PR numbers:

- For work not opened yet, refer to it as "next PR".
- As soon as a PR is opened, update this section with its actual `#<number>`.

Completed (anchored):

1. #28: Shared-case `select` semantics (stacked `case` labels share one body) + tests + spec update.
2. #29: Deduplicate `select` join stack-mismatch diagnostics + regression test.
3. #30: Parser hardening: diagnose `case` (and `else`) outside valid control context + negative fixtures.

Next:

1. Next PR (#31): Parser/AST closure pass (edge cases + diagnostic consistency + negative fixtures).
2. Following PR: Lowering/frame/op safety pass (SP/control/cleanup invariants + tests).
3. Following PR: ISA expansion tranche 1 (high-frequency instructions + diagnostics + fixtures).
4. Following PR: ISA expansion tranche 2 (remaining control/bit/system instructions).
5. Following PR: CLI parity + `.lst` implementation.
6. Following PR: Hardening sweep (examples CI gate + negative coverage + determinism).
7. Following PR: Debug80 integration (only if all gates pass).

---

## 6) Tracking Discipline

- Every roadmap item must map to: code change + tests + spec/CLI reference.
- Do not mark phases complete based on merged PR count alone.
- If a phase fails exit criteria, roadmap status stays red regardless of partial progress.
