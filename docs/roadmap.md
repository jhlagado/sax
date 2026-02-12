# ZAX Roadmap (Reality Check, Assembler-First)

This roadmap replaces optimistic status tracking with a risk-first plan.

Core policy:

- Build a fully working assembler first.
- Defer Debug80 integration until assembler completion gates are met.

**Last updated:** 2026-02-12

Progress snapshot (rough, assembler-first):

- Completed PR anchors listed below: 101
- Assembler completion gates fully green: 0/6
- Integration readiness with Debug80: not yet (gates not satisfied)

Progress estimate (percentage):

- Strict (gate-based): 0% complete until all 6 completion gates are green (Section 3).
- Working estimate (risk-weighted): ~88% complete (range 83-91%).
- Why this is not higher: closure work remains substantial across parser/AST depth, deeper lowering invariants, ISA breadth, CLI contract hardening, and acceptance gates.

Working estimate scorecard (risk-weighted, subjective):

- Spec gate: ~74%
- Parser/AST gate: ~68%
- Codegen gate: ~66%
- ISA gate: ~53%
- CLI/output gate: ~74%
- Hardening gate: ~78%

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

- `src/z80/encode.ts` is ~1,469 lines and now covers a meaningful chunk of the ISA.
- Large portions of Z80 ISA still need explicit coverage and negative tests (especially less-common ED/CB/DD/FD forms and invalid operand shapes).

1. Parser/AST behavior is not fully settled.

- `src/frontend/parser.ts` is large (~3,326 lines); behavior is still subset-constrained and needs broader negative coverage.
- Several grammar/behavior areas are subset-constrained or intentionally unsupported today.
- Parser robustness/error recovery strategy is still shallow.

1. Lowering/codegen complexity remains high-risk.

- `src/lowering/emit.ts` is ~3,206 lines and centralizes many responsibilities.
- Complex concerns (SP tracking, frame cleanup rewriting, op expansion, section/address map coordination) are tightly coupled.
- Some semantics are intentionally subset-limited in lowering today.

1. Output/tooling completeness is partial.

- `.bin`, `.hex`, D8M, and a minimal `.lst` exist, but `.lst` is not yet a full source listing (currently a byte dump + symbols).
- CLI parity with `docs/zax-cli.md` is not fully proven as a stable contract.

1. Hardening and acceptance are incomplete.

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

1. Parser/AST gate

- Grammar behavior is explicitly documented for all accepted/rejected forms.
- No known parser TODOs in core grammar paths remain unresolved.
- Error reporting spans are consistent for syntax/structure failures.

1. Codegen gate

- Frame/SP semantics validated across nested control flow and op expansion paths.
- Return rewriting/epilogue behavior is proven by focused tests (including corner cases).
- Address map/fixup behavior is deterministic and overlap-safe.

1. ISA gate

- Required Z80 instruction subset for v0.1 examples and intended workflows is implemented and tested.
- Relative branch range validation exists where applicable.

1. CLI/output gate

- `docs/zax-cli.md` baseline options are implemented and tested.
- `.bin`, `.hex`, `.d8dbg.json`, and `.lst` behavior is deterministic and contract-tested.

1. Hardening gate

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

1. #196: hardening/acceptance pass (D8M contract hardening: deterministic symbol ordering + per-file segment ownership mapping and fallback behavior).

Next PR (anchored as soon as opened):

1. Next PR: hardening/acceptance pass (expand negative-contract classes and acceptance-matrix strictness beyond D8M ownership/order coverage).

Completed (anchored, most recent first):

1. #195: ISA coverage tranche (explicit register-target diagnostics parity for malformed `call`/`jp`/`jr`/`djnz` flows, plus matrix coverage).
1. #194: lowering/frame/op safety pass (call-like boundary diagnostics for positive tracked stack deltas with stack slots, plus regression matrix coverage).
1. #193: parser/AST closure pass (malformed declaration-header diagnostic ordering + line/column span matrix expansion, plus stale subset-note cleanup).
1. #192: hardening/acceptance pass (CLI failure-class contract matrix expansion + stable diagnostic IDs in CLI compile-error output).
1. #191: lowering/codegen stabilization pass (`rst` call-boundary stack-contract diagnostics for unknown/untracked stack states, with matrix coverage).
1. #190: lowering/codegen stabilization pass (`retn`/`reti` stack-contract hardening for local frames and unknown/untracked/non-zero stack states, with matrix coverage).
1. #189: lowering/codegen stabilization pass (call-boundary stack-contract diagnostics for unknown/untracked stack state with locals, plus matrix coverage).
1. #188: parser/AST closure pass (top-level malformed-header and export diagnostic ordering + line/column span matrix expansion).
1. #187: parser/AST closure pass (declaration/control diagnostic line+column matrix expansion for remaining malformed/recovery and EOF termination paths).
1. #186: hardening follow-up (force fresh CLI test builds under cross-process lock and add stale-lock recovery so CLI contract suites cannot run against stale `dist` artifacts).
1. #185: hardening/acceptance pass (strict CLI acceptance matrix expansion: artifact payload parity across primary-type/suppression combinations, include-path spelling parity, and negative argument-shape contracts, plus shared helper stabilization for CLI contract suites).
1. #184: hardening/acceptance pass (CLI path-parity artifact contract for relative/absolute entry/output invocation forms).
1. #183: hardening/acceptance pass (examples determinism acceptance gate tightening with repeated artifact snapshot equality checks).
1. #182: hardening/acceptance pass (CLI determinism artifact contract matrix across repeated runs and include-flag parity/order forms).
1. #181: CLI/output contract hardening pass (CLI argument/error/output contract matrix coverage and `--version` dist-path fix).
1. #180: ISA coverage/parity pass (indexed rotate/shift destination legality diagnostics matrix expansion across DD/FD/CB forms).
1. #179: lowering/frame/op safety pass (expand SP/control/cleanup invariant coverage across deeper caller/callee interaction paths).
1. #178: parser/AST closure pass (tighten function-local `var` interruption recovery diagnostics ordering and top-level resume matrix coverage).
1. #177: lowering/codegen stabilization continuation (positive epilogue-rewrite matrix for locals + `ret cc` across multi-path control and stack-neutral op expansions).
1. #176: lowering/codegen stabilization continuation (nested-control + op-expansion + multi-return SP/frame interaction matrix beyond prior `ret cc`-only slices).
1. #175: lowering/codegen stabilization continuation (`ret cc` stack-state invariants across `if/else` and `repeat/until`, with exact diagnostic matrix contracts).
1. #174: lowering/codegen stabilization continuation (`ret cc` stack-state invariants across structured-control joins/back-edges, with exact diagnostic matrix contracts).
1. #173: lowering/codegen stabilization continuation (`ret cc` diagnostics hardening under unknown/untracked stack states, with matrix coverage).
1. #172: parser/AST closure continuation (remaining malformed declaration/control recovery matrix expansion, declaration minimum-shape coverage, EOF recovery diagnostics, and deterministic diagnostic ordering hardening).
1. #171: Spec/data closure continuation (Issue #6 const/data follow-up matrix, D8M constant semantics clarification, and audit evidence expansion).
1. #170: Spec/parser closure continuation (Issue #144 implicit body policy closure for `func`/`op`, docs alignment, and end-to-end diagnostics coverage).
1. #169: ISA diagnostics parity continuation (condition-token symbolic-fixup collision hardening for one-operand `jp`/`call`/`jr` + matrix coverage).
1. #168: ISA diagnostics parity continuation (conditional control-flow arity diagnostics parity hardening for `jp`/`call`/`jr` + matrix coverage).
1. #167: ISA diagnostics parity continuation (conditional `jr`/`djnz` malformed-form diagnostics parity + matrix hardening).
1. #165: ISA diagnostics parity continuation (`jp cc, nn` indirect-target legality diagnostics parity + matrix hardening).
1. #164: ISA diagnostics parity continuation (`call` indirect-form legality diagnostics parity + matrix hardening + status-report gate plan update).
1. #163: ISA diagnostics parity continuation (`jp` indirect-form legality diagnostics parity + matrix hardening).
1. #162: ISA diagnostics parity continuation (ED `in/out` indexed-byte-register legality diagnostics parity + matrix hardening).
1. #161: ISA diagnostics parity continuation (indexed CB/DD/FD destination legality diagnostics parity + matrix hardening).
1. #160: ISA diagnostics parity continuation (`adc`/`sbc` malformed-form destination diagnostics parity + matrix hardening).
1. #159: ISA diagnostics parity continuation (`ld` malformed-form diagnostics parity + lowering/abs16-fixup collision guard for register-like EA bases).
1. #158: ISA diagnostics parity continuation (explicit malformed-form diagnostics for `add` to eliminate known-head generic fallback and pin matrix behavior).
1. #157: ISA coverage continuation (`(ix)/(iy)` zero-displacement shorthand parity across DD/FD families + lowering passthrough hardening + matrix coverage).
1. #156: D8M appendix closure (grouped `files` contract, low16 constant-address policy evidence, and Appendix B.5/B.6 contract coverage).
1. #155: Lowering invariants continuation (mismatch-propagation hardening so join/back-edge stack mismatches invalidate downstream tracking and are re-guarded at returns/op boundaries with regression matrix coverage).
1. #154: Lowering invariants continuation (unknown-stack-state diagnostics at joins/back-edges/returns/fallthrough and op-expansion boundary checks + deeper regression matrix coverage).
1. #153: Lowering invariants tranche 4 (explicit untracked-SP diagnostics at joins/back-edges, stack-slot-scoped return/fallthrough checks, and regression matrix coverage).
1. #152: Parser/AST closure tranche 33 (deterministic export-target gating diagnostics, control-stack interruption recovery ordering for function/op bodies, and expanded malformed/recovery matrix coverage).
1. #151: CLI/output hardening tranche (sparse D8M `segments` metadata + listing gap compression + sparse Intel HEX record emission + contract tests and docs sync).
1. #137: Parser/AST closure tranche 31 (malformed `func`/`op`/`extern` header diagnostics parity + explicit expected-shape errors + malformed header matrix hardening and legacy top-level malformed-keyword expectation updates).
1. #136: ISA+parser tranche 29/30 (known-head no-cascade safeguard + expanded ED/CB/zero-operand hardening + `(ix+disp)/(iy+disp)` parity + malformed control/top-level keyword recovery + whitespace/case-insensitive top-level and export parsing parity + extern block parsing for multi-func declarations + lowering support for `extern <binName> ... end` relative offsets against `bin` base symbols (including import-crossing fixup coverage) + type/union unterminated-block recovery at next top-level declaration + var/data keyword-collision diagnostics parity for declaration names + extern/data block-boundary recovery normalization for malformed top-level transitions + reserved top-level keyword collision diagnostics for declaration names (`type/union/enum/const/bin/hex/extern func`) + duplicate/keyword validation for func/op parameters and header-name consistency checks + duplicate-name diagnostics parity for `type`/`union` fields, enum members, and module/function `var` + `data` declarations + malformed declaration-header diagnostics normalization for `enum/const/bin/hex` + explicit interrupted-block diagnostics parity for `type`/`union`/`extern` when a new top-level declaration appears before `end` + interrupted `func` pre-asm recovery diagnostics parity so parser continues at next top-level declaration instead of aborting module parse + malformed block-body line diagnostics normalization across `type/union/var/data/extern` with expected-shape guidance and consolidated matrix coverage + interrupted `func` asm-body / `op` body recovery diagnostics parity so parser resumes top-level declarations when `end` is missing + mixed malformed + keyword-collision ordering stability pass).
1. #135: ISA coverage tranche 28 (ED/CB diagnostics parity hardening + ALU no-cascade parity matrix).
1. #134: ISA coverage tranche 27 (abs16 symbolic addend lowering + matrix hardening).
1. #133: CLI/output gate tranche 1 (`--nohex` support + contract tests).
1. #132: ISA coverage tranche 26 (rel8 branch matrix hardening for jr/jr cc/djnz).
1. #131: ISA coverage tranche 25 (bit/res/set diagnostics parity edge-case hardening).
1. #130: ISA coverage tranche 24 (ALU-family malformed-form diagnostics parity).
1. #129: ISA coverage tranche 23 (core zero-operand diagnostics parity + explicit malformed-form coverage).
1. #128: ISA coverage tranche 22 (in/out matrix expansion + ED zero-operand diagnostics + CLI bootstrap hardening).
1. #127: ISA coverage tranche 21 (indexed CB destination matrix + diagnostics parity).
1. #126: ISA coverage tranche 20 (CB bit/res/set reg matrix + diagnostics parity).
1. #125: ISA coverage tranche 19 (CB rotate/shift matrix + RST coverage).
1. #124: ISA coverage tranche 18 (control-flow cc matrix + diagnostics parity).
1. #123: ISA coverage tranche 17 (core ALU-A matrix + imm8 diagnostics).
1. #122: ISA coverage tranche 16 (CB bit/res/set core coverage + diagnostics parity).
1. #121: ISA coverage tranche 15 (16-bit core ALU + stack/exchange coverage).
1. #120: ISA coverage tranche 14 (core r8/abs16 load matrix + stack/misc op coverage).
1. #119: D8M path normalization + symbol file list (project-relative, forward-slash, stable ordering).
1. #118: ISA coverage tranche 13 (indexed byte-register memory forms for IX/IY families + diagnostics hardening).
1. #117: ISA coverage tranche 12 (explicit `A` forms for `and/or/xor/cp` + indexed-byte-register diagnostics hardening).
1. #116: ISA coverage tranche 11 (`IXH/IXL/IYH/IYL` parser+encoder support across ALU/LD/inc/dec paths).
1. #115: ISA coverage tranche 10 (`sll` CB-family coverage, including indexed destination forms).
1. #114: ISA coverage tranche 9 (direct-asm `ld` abs16 families for A/HL/BC/DE/SP/IX/IY).
1. #113: ISA coverage tranche 8 (indexed rotate/shift destination forms + indexed set/res destination forms + Windows CLI bootstrap parity).
1. #112: ISA coverage tranche 7 (indexed ALU-A family + diagnostics parity).
1. #111: ISA coverage tranche 6 (IX/IY abs16 transfers + diagnostics parity).
1. #110: ISA coverage tranche 5 (indexed imm8 store + IX/IY immediate load + diagnostics parity).
1. #108: ISA coverage tranche 4 (IX/IY 16-bit core family + diagnostics parity).
1. #107: ISA coverage tranche 3 (in (c) + out (c),0 + diagnostics parity).
1. #106: ISA coverage tranche 2 (daa + ex af,af' + diagnostics parity).
1. #105: ISA coverage tranche 1 (ex (sp), ix/iy encoding + diagnostics parity).
1. #104: Lowering/frame safety tranche 3 (op-expansion/clobber interactions under nested control flow).
1. #103: Lowering/frame safety tranche 2 (mixed return-path stack-delta diagnostics).
1. #102: Lowering/frame safety tranche 1 (locals + control-flow stack invariants).
1. #101: Parser/AST closure tranche 5 (parser edge-case rejection diagnostics and TODO sweep).
1. #100: Parser/AST closure tranche 4 (malformed-control recovery consistency in parser state machine).
1. #99: Parser/AST closure tranche 3 (structured-control span coverage expansion).
1. #98: Parser/AST closure tranche 2 (select malformed-header recovery + negative fixture).
1. #97: Parser/AST closure tranche 1 (asm diagnostic span tightening + regression tests).
1. #96: Spec audit tranche 4 (appendix mapping + CI checklist draft).
1. #95: Spec audit tranche 3 (expanded mappings + parser span evidence).
1. #94: Spec audit tranche 2 (normative mapping + rejection catalog).
1. #93: Spec audit pass (v0.1 implementation matrix, tranche 1).
1. #92: Lowering interaction torture suite (nested control + locals + stack-flow checks).
1. #91: ISA tranche: encode `adc/sbc HL,rr` (ED forms) + tests.
1. #90: Listing tranche: ascii gutter and sparse-byte markers.
1. #89: CLI parity sweep (entry-last enforcement + contract tests).
1. #88: CLI: v0.1 artifact-writing command (bin/hex/d8m/lst).
1. #87: Test: determinism for emitted artifacts.
1. #86: Test: conditional abs16 fixups (`jp cc`, `call cc`) + roadmap sync.
1. #85: Test: extend rel8 range checks (`jr cc`, `djnz`) + roadmap sync.
1. #77: Parser: diagnose `case` without a value (fixtures + tests).
1. #76: Parser: diagnose missing control operands (fixtures + tests).
1. #75: Docs: clarify shared-case `select` syntax.
1. #74: Parser: diagnose duplicate `else` in `if` (fixtures + tests).
1. #73: Parser: diagnose `select` with no arms (fixtures + tests).
1. #72: Docs: sync roadmap through PR #71.
1. #71: ISA: ED block I/O instructions (INI/INIR/IND/INDR/OUTI/OTIR/OUTD/OTDR) (fixture + test).
1. #70: ISA: indexed rotates/shifts (IX/IY + disp8) (fixture + test).
1. #68: ISA: indexed bit ops (IX/IY + disp8) (fixture + test).
1. #67: ISA: indexed inc/dec (IX/IY + disp8) (fixture + test).
1. #66: ISA: indexed IX/IY disp8 addressing for `ld` (fixture + test).
1. #65: ISA: ED block instructions (LDI/LDIR/LDD/LDDR/CPI/CPIR/CPD/CPDR) (fixture + test).
1. #64: ISA: ED misc ops (`neg/rrd/rld`, `ld i,a / ld a,i / ld r,a / ld a,r`) (fixture + test).
1. #63: ISA: `in/out` port operands end-to-end (parser + encoder + fixture + test).
1. #62: Test: use implicit return in PR14 no-locals fixture.
1. #61: Docs: sync roadmap completed PR anchors.
1. #60: Revert: undo PR #59 merge (self-approval policy).
1. #59: Docs: sync roadmap completed PR anchors (reverted by #60).
1. #58: ISA: encode `jp (hl)`, `jp (ix)`, `jp (iy)` (fixture + test).
1. #57: ISA: encode `im 0|1|2`, `rst <imm8>`, `reti`, `retn` (fixture + test).
1. #56: ISA: encode misc system ops (`halt/di/ei/scf/ccf/cpl/ex*/exx`) (fixture + test).
1. #55: Parser UX: avoid duplicate diagnostics for illegal `T[]` usage (tests).
1. #54: Parser: restrict inferred arrays `T[]` to `data` declarations only (tests).
1. #53: Diagnostics: remove "PR subset" wording from user-facing errors (small cleanup).
1. #52: Treat `ptr` as a 16-bit scalar in codegen (tests).
1. #51: Inferred-length arrays in `data` declarations (`T[]`) (parser + tests).
1. #50: Union declarations + layout + field access (parser/semantics/lowering + tests).
1. #49: Fast-path abs `ld (ea), imm16` for `word`/`addr` destinations using `ld (nn),hl` (tests).
1. #48: Lower `ld (ea), imm16` for `word`/`addr` destinations (tests).
1. #47: ISA: encode `ld a,(bc|de)` and `ld (bc|de),a` (fixture + test).
1. #46: Roadmap update for #44/#45 (reality check + gates).
1. #45: ld abs16 ED forms for BC/DE/SP (fixture + test).
1. #44: ld abs16 special-cases for A/HL (fixture + test).
1. #43: Lower `ld (ea), imm8` for byte destinations (tests).
1. #42: Roadmap anchor update for #40/#41.
1. #41: ISA: `inc`/`dec` reg8 + `(hl)`, and `ld (hl), imm8` (fixture + test).
1. #40: Implicit return after label (treat labels as re-entry points).
1. #39: Listing output (`.lst`) artifact + contract test + CLI note.
1. #38: Document examples as compiled contract (`examples/README.md`).
1. #37: Fixups and forward references (spec + tests).
1. #36: Expand char literal escape coverage (tests).
1. #35: Char literals in `imm` expressions (parser + tests).
1. #34: Examples compile gate (CI contract test + example updates).
1. #33: Parser `select` arm ordering hardening.
1. #32: Harden asm control keyword parsing (prevent cascaded diagnostics).
1. #31: Roadmap anchors updated to real PR numbers (remove placeholders).
1. #30: Diagnose `case` outside `select` during parsing (negative fixtures).
1. #29: Deduplicate `select` join mismatch diagnostics (regression test).
1. #28: Stacked `select case` labels share one body (spec + tests).

Next (assembler-first):

1. Next PR: Parser/AST closure pass (tighten edge cases, eliminate core TODOs, expand negative fixtures).
1. Following PR: Lowering/frame/op safety pass (SP/control/cleanup invariants + tests).
1. Following PR: ISA coverage tranche (prioritize v0.1 workflows + fixtures).
1. Following PR: CLI parity + `.lst` completion (CLI wiring + contract tests).
1. Following PR: Hardening sweep (determinism + negative coverage + cross-platform gates).
1. Following PR: Debug80 integration (only after all gates pass).

---

## 6) Tracking Discipline

- Every roadmap item must map to: code change + tests + spec/CLI reference.
- Do not mark phases complete based on merged PR count alone.
- If a phase fails exit criteria, roadmap status stays red regardless of partial progress.
