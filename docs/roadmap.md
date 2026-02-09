# ZAX Roadmap (Reality Check, Assembler-First)

This roadmap replaces optimistic status tracking with a risk-first plan.

Core policy:

- Build a fully working assembler first.
- Defer Debug80 integration until assembler completion gates are met.

**Last updated:** 2026-02-09

Progress snapshot (rough, assembler-first):

- Completed PR anchors listed below: 57
- Assembler completion gates fully green: 0/6
- Integration readiness with Debug80: not yet (gates not satisfied)

---

## 1) Reality Check (Current State)

The codebase has meaningful progress, but it is **not near complete** for a production-grade v0.1 assembler.

### What exists

- End-to-end pipeline with parser, lowering, encoder, and emit path.
- Many language features merged (`import`, `op`, structured control flow, `bin`, Intel HEX ingestion).
- Baseline diagnostics and tests with good PR-by-PR fixture history.

### What is still materially incomplete

1. Instruction encoding coverage is narrow.

- `src/z80/encode.ts` is ~796 lines and now covers a meaningful chunk of the ISA.
- Large portions of Z80 ISA still need explicit coverage and negative tests (especially less-common ED/CB/DD/FD forms and invalid operand shapes).

2. Parser/AST behavior is not fully settled.

- `src/frontend/parser.ts` is large (~1,968 lines); behavior is still subset-constrained and needs broader negative coverage.
- Several grammar/behavior areas are subset-constrained or intentionally unsupported today.
- Parser robustness/error recovery strategy is still shallow.

3. Lowering/codegen complexity remains high-risk.

- `src/lowering/emit.ts` is ~2,808 lines and centralizes many responsibilities.
- Complex concerns (SP tracking, frame cleanup rewriting, op expansion, section/address map coordination) are tightly coupled.
- Some semantics are intentionally subset-limited in lowering today.

4. Output/tooling completeness is partial.

- `.bin`, `.hex`, D8M, and a minimal `.lst` exist, but `.lst` is not yet a full source listing (currently a byte dump + symbols).
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

Open / in review (anchored):

- None.

Completed (anchored, most recent first):

1. #85: Test: extend rel8 range checks (`jr cc`, `djnz`) + roadmap sync.
2. #84: Test: expand fixup coverage for `call`/`jr`/`djnz` (fixtures + tests).
3. #83: Docs: assembler pipeline mapping + roadmap anchor sync.
4. #82: Lowering: avoid dead epilogue jump; docs: terminal `ret` optional (tests).
5. #81: Parser: avoid cascades for invalid `case` values (fixtures + tests).
6. #80: Parser: avoid cascades for invalid `select` selector (fixtures + tests).
7. #79: Parser: avoid cascades for invalid control syntax (fixtures + tests).
8. #78: Parser: report unclosed asm control at EOF (fixtures + tests).
9. #77: Parser: diagnose `case` without a value (fixtures + tests).
10. #76: Parser: diagnose missing control operands (fixtures + tests).
11. #75: Docs: clarify shared-case `select` syntax.
12. #74: Parser: diagnose duplicate `else` in `if` (fixtures + tests).
13. #73: Parser: diagnose `select` with no arms (fixtures + tests).
14. #72: Docs: sync roadmap through PR #71.
15. #71: ISA: ED block I/O instructions (INI/INIR/IND/INDR/OUTI/OTIR/OUTD/OTDR) (fixture + test).
16. #70: ISA: indexed rotates/shifts (IX/IY + disp8) (fixture + test).
17. #68: ISA: indexed bit ops (IX/IY + disp8) (fixture + test).
18. #67: ISA: indexed inc/dec (IX/IY + disp8) (fixture + test).
19. #66: ISA: indexed IX/IY disp8 addressing for `ld` (fixture + test).
20. #65: ISA: ED block instructions (LDI/LDIR/LDD/LDDR/CPI/CPIR/CPD/CPDR) (fixture + test).
21. #64: ISA: ED misc ops (`neg/rrd/rld`, `ld i,a / ld a,i / ld r,a / ld a,r`) (fixture + test).
22. #63: ISA: `in/out` port operands end-to-end (parser + encoder + fixture + test).
23. #62: Test: use implicit return in PR14 no-locals fixture.
24. #61: Docs: sync roadmap completed PR anchors.
25. #60: Revert: undo PR #59 merge (self-approval policy).
26. #59: Docs: sync roadmap completed PR anchors (reverted by #60).
27. #58: ISA: encode `jp (hl)`, `jp (ix)`, `jp (iy)` (fixture + test).
28. #57: ISA: encode `im 0|1|2`, `rst <imm8>`, `reti`, `retn` (fixture + test).
29. #56: ISA: encode misc system ops (`halt/di/ei/scf/ccf/cpl/ex*/exx`) (fixture + test).
30. #55: Parser UX: avoid duplicate diagnostics for illegal `T[]` usage (tests).
31. #54: Parser: restrict inferred arrays `T[]` to `data` declarations only (tests).
32. #53: Diagnostics: remove "PR subset" wording from user-facing errors (small cleanup).
33. #52: Treat `ptr` as a 16-bit scalar in codegen (tests).
34. #51: Inferred-length arrays in `data` declarations (`T[]`) (parser + tests).
35. #50: Union declarations + layout + field access (parser/semantics/lowering + tests).
36. #49: Fast-path abs `ld (ea), imm16` for `word`/`addr` destinations using `ld (nn),hl` (tests).
37. #48: Lower `ld (ea), imm16` for `word`/`addr` destinations (tests).
38. #47: ISA: encode `ld a,(bc|de)` and `ld (bc|de),a` (fixture + test).
39. #46: Roadmap update for #44/#45 (reality check + gates).
40. #45: ld abs16 ED forms for BC/DE/SP (fixture + test).
41. #44: ld abs16 special-cases for A/HL (fixture + test).
42. #43: Lower `ld (ea), imm8` for byte destinations (tests).
43. #42: Roadmap anchor update for #40/#41.
44. #41: ISA: `inc`/`dec` reg8 + `(hl)`, and `ld (hl), imm8` (fixture + test).
45. #40: Implicit return after label (treat labels as re-entry points).
46. #39: Listing output (`.lst`) artifact + contract test + CLI note.
47. #38: Document examples as compiled contract (`examples/README.md`).
48. #37: Fixups and forward references (spec + tests).
49. #36: Expand char literal escape coverage (tests).
50. #35: Char literals in `imm` expressions (parser + tests).
51. #34: Examples compile gate (CI contract test + example updates).
52. #33: Parser `select` arm ordering hardening.
53. #32: Harden asm control keyword parsing (prevent cascaded diagnostics).
54. #31: Roadmap anchors updated to real PR numbers (remove placeholders).
55. #30: Diagnose `case` outside `select` during parsing (negative fixtures).
56. #29: Deduplicate `select` join mismatch diagnostics (regression test).
57. #28: Stacked `select case` labels share one body (spec + tests).

Next (assembler-first):

1. Next PR: Parser/AST closure pass (tighten edge cases, eliminate core TODOs, expand negative fixtures).
2. Following PR: Lowering/frame/op safety pass (SP/control/cleanup invariants + tests).
3. Following PR: ISA coverage tranche (prioritize v0.1 workflows + fixtures).
4. Following PR: CLI parity + `.lst` completion (CLI wiring + contract tests).
5. Following PR: Hardening sweep (determinism + negative coverage + cross-platform gates).
6. Following PR: Debug80 integration (only after all gates pass).

---

## 6) Tracking Discipline

- Every roadmap item must map to: code change + tests + spec/CLI reference.
- Do not mark phases complete based on merged PR count alone.
- If a phase fails exit criteria, roadmap status stays red regardless of partial progress.
