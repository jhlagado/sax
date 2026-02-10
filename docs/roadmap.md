# ZAX Roadmap (Reality Check, Assembler-First)

This roadmap replaces optimistic status tracking with a risk-first plan.

Core policy:

- Build a fully working assembler first.
- Defer Debug80 integration until assembler completion gates are met.

**Last updated:** 2026-02-09

Progress snapshot (rough, assembler-first):

- Completed PR anchors listed below: 59
- Assembler completion gates fully green: 0/6
- Integration readiness with Debug80: not yet (gates not satisfied)

Progress estimate (percentage):

- Strict (gate-based): 0% complete until all 6 completion gates are green (Section 3).
- Working estimate (risk-weighted): ~45% complete (range 40-50%).
- Why this is not higher: the remaining work is wide (ISA coverage, CLI contract, listing fidelity, hardening) and is not represented by a finite checklist of already-numbered items.

Working estimate scorecard (risk-weighted, subjective):

- Spec gate: ~60%
- Parser/AST gate: ~55%
- Codegen gate: ~50%
- ISA gate: ~35%
- CLI/output gate: ~55-60% (improving; see PR #88)
- Hardening gate: ~30%

What moves the needle fastest:

- Make the CLI/output gate real: implement `docs/zax-cli.md` options in code, and add contract tests that verify the artifact set and naming rules.
- Expand ISA coverage with fixtures + negative tests until every instruction needed by `examples/*.zax` and the v0.1 spec is supported (or explicitly rejected).
- Add hardening gates that are difficult to game: examples compile (already exists) plus determinism checks and broad negative fixture classes.

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

### Plan you can track (concrete milestones)

Milestone 1: CLI contract is real (Gate 5 trending green)

- Implement the `docs/zax-cli.md` baseline flags in the real CLI.
- Add tests that run the CLI end-to-end and assert:
- Primary output selection matches `--type`.
- Sibling artifacts exist/suppress correctly.
- Paths are deterministic and portable.
- Exit with non-zero on diagnostics errors.

Milestone 2: “Spec complete or explicitly rejected” (Gate 1 trending green)

- Audit `docs/zax-spec.md` v0.1 sections and map each rule to:
- A passing test/fixture (accepted behavior), or
- A stable diagnostic + fixture (intentional rejection).

Milestone 3: ISA and lowering hardening (Gates 3 and 4 trending green)

- ISA: drive encoding expansion by failure cases and v0.1 examples.
- Lowering: add deep interaction tests (calls + locals + ops + nested structured control + SP tracking).

Milestone 4: Acceptance and determinism (Gate 6 trending green)

- Make determinism checks part of the contract (not just “best effort”).
- Expand negative fixture classes until regressions are obvious and localized.

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

- #98: Parser/AST closure tranche 2 (select malformed-header recovery + negative fixture).

Next after #98 merges (anchored as soon as opened):

1. Next PR: Parser/AST closure tranche 3 (broader malformed-control negative fixtures and recovery consistency).

Completed (anchored, most recent first):

1. #97: Parser/AST closure tranche 1 (asm diagnostic span tightening + regression tests).
2. #96: Spec audit tranche 4 (appendix mapping + CI checklist draft).
3. #95: Spec audit tranche 3 (expanded mappings + parser span evidence).
4. #94: Spec audit tranche 2 (normative mapping + rejection catalog).
5. #93: Spec audit pass (v0.1 implementation matrix, tranche 1).
6. #92: Lowering interaction torture suite (nested control + locals + stack-flow checks).
7. #91: ISA tranche: encode `adc/sbc HL,rr` (ED forms) + tests.
8. #90: Listing tranche: ascii gutter and sparse-byte markers.
9. #89: CLI parity sweep (entry-last enforcement + contract tests).
10. #88: CLI: v0.1 artifact-writing command (bin/hex/d8m/lst).
11. #87: Test: determinism for emitted artifacts.
12. #86: Test: conditional abs16 fixups (`jp cc`, `call cc`) + roadmap sync.
13. #85: Test: extend rel8 range checks (`jr cc`, `djnz`) + roadmap sync.
14. #77: Parser: diagnose `case` without a value (fixtures + tests).
15. #76: Parser: diagnose missing control operands (fixtures + tests).
16. #75: Docs: clarify shared-case `select` syntax.
17. #74: Parser: diagnose duplicate `else` in `if` (fixtures + tests).
18. #73: Parser: diagnose `select` with no arms (fixtures + tests).
19. #72: Docs: sync roadmap through PR #71.
20. #71: ISA: ED block I/O instructions (INI/INIR/IND/INDR/OUTI/OTIR/OUTD/OTDR) (fixture + test).
21. #70: ISA: indexed rotates/shifts (IX/IY + disp8) (fixture + test).
22. #68: ISA: indexed bit ops (IX/IY + disp8) (fixture + test).
23. #67: ISA: indexed inc/dec (IX/IY + disp8) (fixture + test).
24. #66: ISA: indexed IX/IY disp8 addressing for `ld` (fixture + test).
25. #65: ISA: ED block instructions (LDI/LDIR/LDD/LDDR/CPI/CPIR/CPD/CPDR) (fixture + test).
26. #64: ISA: ED misc ops (`neg/rrd/rld`, `ld i,a / ld a,i / ld r,a / ld a,r`) (fixture + test).
27. #63: ISA: `in/out` port operands end-to-end (parser + encoder + fixture + test).
28. #62: Test: use implicit return in PR14 no-locals fixture.
29. #61: Docs: sync roadmap completed PR anchors.
30. #60: Revert: undo PR #59 merge (self-approval policy).
31. #59: Docs: sync roadmap completed PR anchors (reverted by #60).
32. #58: ISA: encode `jp (hl)`, `jp (ix)`, `jp (iy)` (fixture + test).
33. #57: ISA: encode `im 0|1|2`, `rst <imm8>`, `reti`, `retn` (fixture + test).
34. #56: ISA: encode misc system ops (`halt/di/ei/scf/ccf/cpl/ex*/exx`) (fixture + test).
35. #55: Parser UX: avoid duplicate diagnostics for illegal `T[]` usage (tests).
36. #54: Parser: restrict inferred arrays `T[]` to `data` declarations only (tests).
37. #53: Diagnostics: remove "PR subset" wording from user-facing errors (small cleanup).
38. #52: Treat `ptr` as a 16-bit scalar in codegen (tests).
39. #51: Inferred-length arrays in `data` declarations (`T[]`) (parser + tests).
40. #50: Union declarations + layout + field access (parser/semantics/lowering + tests).
41. #49: Fast-path abs `ld (ea), imm16` for `word`/`addr` destinations using `ld (nn),hl` (tests).
42. #48: Lower `ld (ea), imm16` for `word`/`addr` destinations (tests).
43. #47: ISA: encode `ld a,(bc|de)` and `ld (bc|de),a` (fixture + test).
44. #46: Roadmap update for #44/#45 (reality check + gates).
45. #45: ld abs16 ED forms for BC/DE/SP (fixture + test).
46. #44: ld abs16 special-cases for A/HL (fixture + test).
47. #43: Lower `ld (ea), imm8` for byte destinations (tests).
48. #42: Roadmap anchor update for #40/#41.
49. #41: ISA: `inc`/`dec` reg8 + `(hl)`, and `ld (hl), imm8` (fixture + test).
50. #40: Implicit return after label (treat labels as re-entry points).
51. #39: Listing output (`.lst`) artifact + contract test + CLI note.
52. #38: Document examples as compiled contract (`examples/README.md`).
53. #37: Fixups and forward references (spec + tests).
54. #36: Expand char literal escape coverage (tests).
55. #35: Char literals in `imm` expressions (parser + tests).
56. #34: Examples compile gate (CI contract test + example updates).
57. #33: Parser `select` arm ordering hardening.
58. #32: Harden asm control keyword parsing (prevent cascaded diagnostics).
59. #31: Roadmap anchors updated to real PR numbers (remove placeholders).
60. #30: Diagnose `case` outside `select` during parsing (negative fixtures).
61. #29: Deduplicate `select` join mismatch diagnostics (regression test).
62. #28: Stacked `select case` labels share one body (spec + tests).

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
