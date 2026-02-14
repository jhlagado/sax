# ZAX Developer Playbook (Non-normative)

This document consolidates execution planning, architecture notes, implementation checklists, and contributor workflow guidance.

Normative language behavior is defined only by `docs/zax-spec.md`.

## 0. Document Scope

This playbook replaces the previous split across:

- `docs/roadmap.md`
- `docs/v02-implementation-checklist.md`
- `docs/assembler-pipeline.md`
- `docs/zax-ai-team-prompt.md`

## 1. Architecture Brief

### 1.1 Decision Hierarchy

| Level | Source                             | Role                                  |
| ----- | ---------------------------------- | ------------------------------------- |
| 1     | `docs/zax-spec.md`                 | Canonical language authority          |
| 2     | `docs/v02-transition-decisions.md` | Transition rationale/history          |
| 3     | This playbook                      | Execution and implementation guidance |

Conflict rule: if guidance here conflicts with `docs/zax-spec.md`, the spec wins.

### 1.1.1 Execution Priority Contract

Execution priority is derived from normative language in `docs/zax-spec.md`, not from transition-doc breadth.

- Queue A (Conformance): `MUST` / required behavior in `docs/zax-spec.md`.
- Queue B (Advisory): `SHOULD`, optional warnings, and quality improvements.
- Transition items from `docs/v02-transition-decisions.md` enter execution only after mapping to Queue A or Queue B.

Priority rule:

1. Queue A items are implemented first and define conformance.
2. Queue B items are staged separately and do not block Queue A completion.
3. If a Queue B item should become mandatory, promote it by updating `docs/zax-spec.md` first.

### 1.1.2 Normative Priority Tags

Use one of the following tags on every scoped issue/PR:

| Tag                | Meaning                                                          | Blocking for v0.2 conformance |
| ------------------ | ---------------------------------------------------------------- | ----------------------------- |
| `NORMATIVE-MUST`   | Required behavior from `docs/zax-spec.md`                        | Yes                           |
| `NORMATIVE-SHOULD` | Advisory behavior from `docs/zax-spec.md`                        | No                            |
| `TRANSITION-NOTE`  | Transition rationale/policy with no direct normative requirement | No                            |

### 1.2 Runtime-Atom Mental Model

- A runtime atom is one runtime-varying source in address computation.
- v0.2 source-level `ea` budget: max one runtime atom per expression.
- v0.2 direct call-site `ea`/`(ea)` arguments: runtime-atom-free.
- User model: one moving part per expression; stage multi-dynamic work over lines.
- Implementation note: the lowering path rejects `ea` expressions over budget with explicit diagnostics (for example, `grid[row][col]` / `arr[i + j]` when both names are runtime scalar indices).
- Implementation note: direct call-site `ea`/`(ea)` argument forms now reject any runtime-atom use and include staged-lowering guidance in diagnostics.

### 1.3 Preservation and Lowering Model

- Typed call boundaries are preservation-safe per `docs/zax-spec.md`.
- `op` bodies are inline; stack/register discipline is developer-managed.
- Hidden lowering should stay bounded and predictable.

### 1.4 Rollout Waves

- Wave 1: runtime-atom enforcement for source-level `ea` expressions (#221).
- Wave 2: runtime-atom-free direct call-site `ea`/`(ea)` enforcement (#222).
- Wave 3: op stack-policy alignment across docs/implementation/tests (#223).

## 2. Roadmap (Consolidated)

This roadmap replaces optimistic status tracking with a risk-first plan.

Normative behavior is defined by `docs/zax-spec.md`. `docs/v02-transition-decisions.md` is transition rationale only. This roadmap is execution planning, not a language authority.

Core policy:

- Build a fully working assembler first.
- Defer Debug80 integration until assembler completion gates are met.

**Last updated:** 2026-02-14

Progress snapshot (rough, assembler-first):

- Completed PR anchors listed below: 105
- Assembler completion gates fully green: 0/6
- Integration readiness with Debug80: not yet (gates not satisfied)

Progress estimate (percentage):

- Strict (gate-based): 0% complete until all 6 completion gates are green (Section 3).
- Working estimate (risk-weighted): ~92% complete (range 87-95%).
- Why this is not higher: closure work remains substantial across parser/AST depth, deeper lowering invariants, ISA breadth, CLI contract hardening, and acceptance gates.

Working estimate scorecard (risk-weighted, subjective):

- Spec gate: ~74%
- Parser/AST gate: ~71%
- Codegen gate: ~66%
- ISA gate: ~53%
- CLI/output gate: ~74%
- Hardening gate: ~83%

What moves the needle fastest:

- Make the CLI/output gate real: implement `Appendix D of docs/zax-spec.md` options in code, and add contract tests that verify the artifact set and naming rules.
- Expand ISA coverage with fixtures + negative tests until every instruction needed by `examples/*.zax` and the active spec is supported (or explicitly rejected).
- Add hardening gates that are difficult to game: examples compile (already exists) plus determinism checks and broad negative fixture classes.

## v0.2 Execution Queues

### Queue A: Conformance (`NORMATIVE-MUST`)

These items are implementation priority and gate conformance claims:

| Priority | Constraint                                                   | Issue                                              | Delivery intent                      |
| -------- | ------------------------------------------------------------ | -------------------------------------------------- | ------------------------------------ |
| 1        | Enforce runtime-atom quota for source-level `ea` expressions | [#221](https://github.com/jhlagado/ZAX/issues/221) | Next lowering/diagnostics tranche    |
| 2        | Enforce runtime-atom-free direct call-site `ea`/`(ea)` args  | [#222](https://github.com/jhlagado/ZAX/issues/222) | Immediately after #221               |
| 3        | Resolve op stack-policy mismatch (docs vs implementation)    | [#223](https://github.com/jhlagado/ZAX/issues/223) | After #221/#222 policy stabilization |

### Queue B: Advisory (`NORMATIVE-SHOULD`)

Track recommendation-quality work separately from Queue A:

| Priority | Constraint                                     | Issue                 | Delivery intent                  |
| -------- | ---------------------------------------------- | --------------------- | -------------------------------- |
| A1       | Optional warning quality and refinement passes | (add issue as needed) | After Queue A active tranche     |
| A2       | Additional migration guidance polish           | (add issue as needed) | Batched with docs quality cycles |

Team rule for in-flight work:

- Every PR touching language/lowering semantics must include one priority tag: `NORMATIVE-MUST`, `NORMATIVE-SHOULD`, or `TRANSITION-NOTE`.
- Queue B work must not displace Queue A sequencing.
- `docs/v02-transition-decisions.md` provides rationale; it does not by itself set implementation priority.

---

## 1) Reality Check (Current State)

The codebase has meaningful progress, but it is **not near complete** for a production-grade v0.2 assembler.

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
- CLI parity with `Appendix D of docs/zax-spec.md` is not fully proven as a stable contract.

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

- All active features in `docs/zax-spec.md` are implemented, or intentionally rejected with stable diagnostics.
- Migration items tracked in `docs/zax-spec.md` Appendix C are either folded into normative sections or explicitly deferred.

1. Parser/AST gate

- Grammar behavior is explicitly documented for all accepted/rejected forms.
- No known parser TODOs in core grammar paths remain unresolved.
- Error reporting spans are consistent for syntax/structure failures.

1. Codegen gate

- Frame/SP semantics validated across nested control flow and op expansion paths.
- Return rewriting/epilogue behavior is proven by focused tests (including corner cases).
- Address map/fixup behavior is deterministic and overlap-safe.

1. ISA gate

- Required Z80 instruction subset for active examples and intended workflows is implemented and tested.
- Relative branch range validation exists where applicable.

1. CLI/output gate

- `Appendix D of docs/zax-spec.md` baseline options are implemented and tested.
- `.bin`, `.hex`, `.d8dbg.json`, and `.lst` behavior is deterministic and contract-tested.

1. Hardening gate

- `examples/*.zax` compile in CI on macOS/Linux/Windows.
- Negative fixture coverage includes major parser/semantic/lowering/encoding failure classes.
- Determinism checks prove output stability independent of host/path ordering.

---

## 4) Execution Plan (Serious Ordering)

### Plan you can track (concrete milestones)

Milestone 1: CLI contract is real (Gate 5 trending green)

- Implement the `Appendix D of docs/zax-spec.md` baseline flags in the real CLI.
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

- Complete CLI option behavior against `Appendix D of docs/zax-spec.md`.
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

1. #201: hardening/acceptance pass (CLI failure-contract matrix now pins module-ID collision source-span diagnostics in stderr while preserving no-artifact-on-failure guarantees).

Next PR (anchored as soon as opened):

1. Next PR: hardening/acceptance pass (expand negative-contract classes and acceptance-matrix strictness beyond D8M ownership/order coverage).

Completed (anchored, most recent first):

1. #200: hardening/acceptance pass (CLI failure-contract matrix now pins import and import-cycle source-span diagnostics in stderr while preserving no-artifact-on-failure guarantees).
1. #199: hardening/acceptance pass (module-ID collision diagnostics now pin to the colliding module file/span with cross-platform same-basename fixture coverage).
1. #198: hardening/acceptance pass (import-cycle diagnostics now report stable import-site file/line/column at the edge that closes the cycle).
1. #197: hardening/acceptance pass (import-resolution diagnostics now carry import-site line/column spans for unresolved and unreadable import candidates).
1. #196: hardening/acceptance pass (D8M contract hardening: deterministic symbol ordering + per-file segment ownership mapping and fallback behavior).
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

## 3. Implementation Checklist (Consolidated)

This checklist is non-normative planning support.

Normative language behavior is defined in `docs/zax-spec.md`.

## Usage

1. Create one GitHub issue per planned change (use the `v0.2 Change Task` template).
2. Add or update a row in the table below with the issue number and status.
3. Link the implementing PR in the `PR` column.
4. Keep rule text in `docs/zax-spec.md`; keep this file as a pointer/checklist only.

## Active Queue

| Area                    | Change                                                       | Issue                                              | Status      | PR                                               |
| ----------------------- | ------------------------------------------------------------ | -------------------------------------------------- | ----------- | ------------------------------------------------ |
| docs                    | Runtime-atom model and single-expression budget              | —                                                  | In progress | [#219](https://github.com/jhlagado/ZAX/pull/219) |
| semantics/lowering      | Enforce runtime-atom quota for source-level `ea` expressions | [#221](https://github.com/jhlagado/ZAX/issues/221) | Done        | [#236](https://github.com/jhlagado/ZAX/pull/236) |
| semantics/lowering      | Enforce runtime-atom-free direct `ea`/`(ea)` call-site args  | [#222](https://github.com/jhlagado/ZAX/issues/222) | Done        | [#237](https://github.com/jhlagado/ZAX/pull/237) |
| lowering/spec-alignment | Resolve op stack-policy mismatch (docs vs implementation)    | [#223](https://github.com/jhlagado/ZAX/issues/223) | In progress | [#238](https://github.com/jhlagado/ZAX/pull/238) |

## Rollout Schedule (Spec-First, Implementation Catch-Up)

This section makes implementation lag explicit so contributors can plan work against v0.2 normative direction.

| Wave   | Target                                              | Scope                                                                | Tracking                                           |
| ------ | --------------------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------- |
| Wave 1 | Runtime-atom enforcement in `ea` expressions        | Implement quota checks + user-friendly diagnostics + fixture updates | [#221](https://github.com/jhlagado/ZAX/issues/221) |
| Wave 2 | Runtime-atom-free direct call-site `ea`/`(ea)` args | Enforce staged-arg model + diagnostics + fixture updates             | [#222](https://github.com/jhlagado/ZAX/issues/222) |
| Wave 3 | Op stack-policy alignment                           | Finalize one policy and align docs/implementation/tests              | [#223](https://github.com/jhlagado/ZAX/issues/223) |

## Team Signal

- `docs/zax-spec.md` remains canonical for target behavior.
- Until Waves 1-3 land, some implementation paths are intentionally behind the spec and are tracked by the issues above.
- New feature work touching addressing/calls/ops should cross-check this schedule before adding behavior.

## Status Legend

- `Planned`: scoped issue exists; work not started.
- `In progress`: PR open or implementation active.
- `Blocked`: waiting on dependency/decision.
- `Done`: merged to `main`.

## 4. Assembler Pipeline Reference (Consolidated)

This document explains how the ZAX toolchain turns a `.zax` entry file into output artifacts (`.bin`, `.hex`, `.d8dbg.json`, `.lst`), and how it handles forward references (fixups).

This describes **current code**, not an aspirational design.

---

## 1. Inputs and Outputs

Inputs:

- An entry module path (a `.zax` file).
- Optional `includeDirs` used when resolving `import` statements.

Outputs (in-memory artifacts returned by the compiler):

- Flat binary image (`.bin`)
- Intel HEX (`.hex`)
- D8 debug map (`.d8dbg.json`)
- Listing (`.lst`) (currently a minimal byte dump + symbols; not yet a full source listing)

Implementation entrypoint:

- `src/compile.ts` (`compile(...)`)

---

## 2. High-Level Stages

### Stage A: Load modules (imports)

ZAX is compiled as a whole-program unit. Starting from the entry file:

1. Read and parse the entry module.
2. Collect `import` targets.
3. Resolve each import against:
   1. The importing module directory
   2. Each `includeDirs` entry (in order)
4. Read and parse imported modules, recursively.
5. Detect:
   - Import cycles
   - Module ID collisions (case-insensitive), where module ID is derived from the filename (without extension)
6. Topologically sort modules so dependencies are processed first (deterministic ordering).

Implementation:

- `src/compile.ts`: `loadProgram(...)`

### Stage B: Build semantic environment (names + types)

The compiler builds a global environment from the whole program:

- Declared symbols (functions, ops, consts, data/var names, etc.)
- Type layouts for `type` declarations (records/unions) and derived layouts for `data`/`var`

Implementation:

- `src/semantics/env.ts`: `buildEnv(...)`
- `src/semantics/layout.ts`: type layout helpers

### Stage C: Lower + emit (code/data bytes + fixups)

Lowering walks the AST and emits:

- Code section bytes
- Data section bytes
- A symbol table (addresses for labels / globals)
- Fixups: “patch this placeholder once the target address is known”

The key point is that **forward references are allowed** in many forms (labels before definition, calls/jumps to later symbols). Emission records a fixup at the use site and patches it once layout is complete.

Implementation:

- `src/lowering/emit.ts`: `emitProgram(...)`
- See `docs/zax-spec.md` “Fixups and Forward References (v0.1)” for the language-level contract.

### Stage D: Format writers (artifacts)

The emitter returns a memory map + symbols. Format writers turn that into artifacts:

- `src/formats/writeBin.ts`
- `src/formats/writeHex.ts`
- `src/formats/writeD8m.ts`
- `src/formats/writeListing.ts`

The compile pipeline currently does **not** write to disk itself; it returns artifacts in-memory and the CLI (or caller) decides what to do with them.

Implementation:

- `src/compile.ts`: calls `deps.formats.*`

---

## 3. Forward References and Fixups (How It Works)

### What is a fixup?

A fixup is a record that says:

- Where in the output bytes a placeholder was emitted
- What symbol/expression it should be patched with
- What encoding rule applies (e.g., absolute 16-bit address, rel8 displacement)

Examples of things that generally require fixups:

- `jp label` (absolute 16-bit)
- `jr label` (relative 8-bit displacement, range-checked)
- `call func` (absolute 16-bit)
- `ld hl, dataSymbol` (absolute 16-bit immediate)

### When do fixups resolve?

Fixups resolve after enough emission has happened to know final addresses, i.e. after:

- All code/data bytes are emitted
- The symbol table has final addresses

At that point the compiler patches placeholder bytes.

### What if a fixup cannot resolve?

If a referenced symbol cannot be resolved, emission reports an error diagnostic like:

- `Unresolved symbol "<name>" in 16-bit fixup.`
- `Unresolved symbol "<name>" in rel8 <mnemonic> fixup.`

Implementation:

- `src/lowering/emit.ts` (unresolved symbol diagnostics during fixup resolution)

---

## 4. Determinism Notes (Why Ordering Matters)

Several pipeline steps intentionally impose deterministic ordering so builds are stable:

- Import graph traversal and topo ordering is sorted by `(moduleId, path)`.
- Emission uses stable symbol maps where practical; instability here shows up as non-deterministic output bytes or symbol addresses.

Implementation:

- `src/compile.ts`: deterministic topo sort for modules

## 5. Team Workflow Prompt (Consolidated)

Use this prompt to instruct an AI (or multiple AIs acting as a team) to **plan and execute** the implementation of the ZAX assembler.

This prompt is intentionally "meta": it comes _before_ detailed planning. Its job is to force the AI to produce a robust plan, break work into PR-sized chunks, coordinate agents, and follow a rigorous testing and review workflow.

---

## Prompt

You are an AI engineering team building a **ZAX assembler**: a Node.js command-line executable that compiles `.zax` modules into machine-code artifacts for Z80-family projects.

### Reference documents (read before planning)

- `docs/zax-spec.md` — the **normative** language specification. Every compiler behavior must trace to a section here.
- `Appendix D of docs/zax-spec.md` — the **non-normative** CLI design. Defines invocation shape, switches, artifact naming, and Debug80 integration expectations.
- `examples/*.zax` — working examples that must compile successfully as an end-to-end acceptance test.

Treat this like a production tool: cross-platform (macOS/Windows/Linux), deterministic outputs, excellent diagnostics, strong tests, and developed via small PRs using `git` + the GitHub CLI (`gh`).

### 0) Mission

Implement a Node-based assembler for ZAX that:

- reads an entry `.zax` file, resolves imports, and compiles the whole program
- produces **at minimum**:
  - flat binary output (`.bin`)
  - Intel HEX output (`.hex`) (per the spec constraints)
  - Debug80-compatible debug map: **D8 Debug Map (D8M) v1 JSON** (`.d8dbg.json`)
- optionally produces a listing (`.lst`) and/or a human-readable map/symbol report
- reaches a **fully working assembler** baseline before any external integration work

CLI design is specified in `Appendix D of docs/zax-spec.md`. Do not deviate from it without discussion.

### 1) Non-negotiables (quality gates)

- **Cross-platform**
  - Handle Windows paths, quoting, drive letters, and CRLF tolerance.
  - Do not assume `/` path separators in user input.
  - Do not rely on case-sensitive filesystem behavior.
  - Do not use platform-specific shell utilities in core logic.
  - Paths in diagnostics should use the path form the user provided (do not rewrite separators in user-facing output; canonicalize only internally).
  - Treat `.ZAX` and `.zax` as equivalent for file discovery on case-insensitive filesystems.
- **Determinism**
  - Same inputs → identical outputs (binary, HEX, D8M, listing).
  - Never depend on filesystem enumeration order, `Map` iteration assumptions, or `Date.now()`.
  - No timestamps or absolute machine paths in any output artifact. Outputs are reproducible by default.
  - Make ordering rules explicit and tested.
- **Diagnostics**
  - Every error includes file + line/column (when possible) and a clear message.
  - Each diagnostic (errors and warnings) has a stable ID (e.g., `ZAX001`) for programmatic use.
  - IDs are stable across releases once introduced: no renumbering, no reusing an ID for a different diagnostic.
  - Fail with non-zero exit code on error.
- **Artifacts required**
  - `.bin`, `.hex`, and `.d8dbg.json` are first-class. `.bin` and `.hex` must be emitted from PR 1. A minimal `.d8dbg.json` (format/version/arch + segment list + symbols) must also ship in PR 1 so the D8M pipeline never diverges; later PRs extend it.

### 2) Architecture expectations

Implement a compiler pipeline with clear module boundaries. Required structure:

- `src/cli/` — args parsing (per `Appendix D of docs/zax-spec.md`), IO policy, exit codes
- `src/frontend/` — lexer, parser, AST, source spans
- `src/semantics/` — name resolution, collisions, types/layout, const eval
- `src/lowering/` — structured control flow → labels/jumps, lowering of non-encodable operands, `op` expansion, stack frame/trampoline
- `src/backend/` — Z80 encoding, fixups, address→byte map, section packing, overlap checks
- `src/formats/` — BIN/HEX writers, optional LST writer, D8M writer
- `src/diagnostics/` — error objects (with stable IDs) + renderers

Call out explicitly where:

- determinism is enforced (sorting, ordering, normalization)
- Windows path edge cases are handled
- spec rules map to implementation (e.g., `select` lowering, `op` expansion, stack frame/trampoline model)

### 3) Contract-first development (Phase 0 — required before any implementation)

Before writing compiler logic, the first PR must define the **interface contracts** that all subsequent work depends on. This prevents agents from building incompatible internals.

Phase 0 deliverables (all in one PR):

1. **AST node types** (`src/frontend/ast.ts`) — define the stable top-level shape: discriminated union convention, source-span fields, and the concrete node kinds needed for PRs 1–2 (module file, func declaration, asm block, Z80 instruction nodes, const/enum/data). For constructs not yet needed (imports, op, structured control flow, unions, etc.), define placeholder members in the union (e.g., a comment or a generic `UnimplementedNode` kind with a span) so the union is forward-compatible. `UnimplementedNode` may exist in the union for type stability, but the parser must never emit it beyond the slice it is meant to cover — tests must fail if an `UnimplementedNode` appears in the AST output of any passing fixture. Later PRs replace placeholders with concrete node kinds as they go via the contract-change mechanism in §6.2.
2. **Diagnostic types** (`src/diagnostics/types.ts`) — a `Diagnostic` interface with `id` (stable string), `severity`, `message`, `file`, `line`, `column`. An enum or namespace of all diagnostic IDs.
3. **Compiler pipeline interface** (`src/pipeline.ts`) — the top-level function signature: input (entry path + options) → output (artifacts + diagnostics). Define the artifact types (binary buffer, HEX string, D8M JSON object, listing string).
4. **Format writer interfaces** (`src/formats/types.ts`) — each writer takes the compiler's internal address→byte map (or equivalent) plus symbol table and produces an output artifact.

This PR has no implementation, only types and interfaces. It must be reviewed and merged before any other PR begins.

### 4) Testing regime (spec-as-oracle)

The normative spec is the test plan. Every testable rule in `docs/zax-spec.md` must have at least one positive and one negative test fixture, traceable to a section number.

All test code lives under `test/` (not `tests/`). Do not create a parallel directory tree.

#### 4.1 Test categories

- **Unit tests** — lexer tokens, parser AST snapshots, layout/sizeof calculations, const evaluation, name resolution, Z80 instruction encoding, fixups.
- **Integration tests** — run the CLI on `.zax` fixture files and compare outputs:
  - `.hex` output (golden file)
  - `.bin` output (golden file)
  - `.d8dbg.json` output (structural comparison on key fields)
  - `.lst` output if produced (golden file)
- **Negative fixtures** — one per error class. Each fixture must:
  - assert the **first** diagnostic ID (stable string, not message text) and its primary source span
  - additional cascaded diagnostics are allowed but must be explicitly asserted if checked (don't assert count unless the test is specifically about cascade behavior)
  - cover: syntax errors, symbol collisions, reserved-name violations, type mismatches, overlap errors, invalid HEX checksums, out-of-range addresses, circular imports, ambiguous `op` overloads, stack-depth mismatches, etc.
- **Spec traceability** — test file names or descriptions must reference the spec section they exercise (e.g., `test/section-6.4/hex-overlap.test.ts`, or a comment `// §6.4: overlap is an error regardless of byte equality`).

#### 4.2 Golden-file policy

- Golden files (expected `.bin`, `.hex`, `.d8dbg.json`, `.lst`) are committed to the repo under `test/fixtures/`.
- A diff in a golden file **must** be flagged in the PR description with the reason for the change.
- Agents must never silently regenerate golden files. Use an explicit `--update-golden` test flag that is never used in CI.

#### 4.3 The `examples/` acceptance gate

All `.zax` files under `examples/` must compile without errors as a CI gate. This is the simplest end-to-end smoke test.

#### 4.4 Fully working assembler gate (required before integrations)

Treat the assembler as "complete enough for integration" only when all of the following are true:

- All v0.1 language features in `docs/zax-spec.md` are implemented, or explicitly rejected with intentional diagnostics.
- CLI baseline behavior in `Appendix D of docs/zax-spec.md` is implemented (`-o`, `-t`, include paths, output suppression switches, help/version).
- CI passes on macOS, Linux, and Windows with deterministic outputs.
- `examples/*.zax` compile successfully and artifact tests are stable.
- Negative tests cover major diagnostic classes and stable IDs.
- Remaining work is polish/hardening only, not missing core compiler capability.

### 5) Vertical-slice PR plan (required ordering)

Work in **vertical slices**, not horizontal layers. Each PR compiles a _slightly larger subset_ of ZAX from source to artifact output. This ensures the pipeline is always integrated and testable.

Required PR sequence (adjust scope as needed, but preserve the vertical-slice principle):

| PR  | Scope                                                                                                                                                                                     | Key spec sections                               |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| 0   | **Contracts**: AST types, diagnostic types, pipeline interface, format writer interfaces. No implementation.                                                                              | —                                               |
| 1   | **Minimal end-to-end**: lex + parse + encode + emit a single `func` with inline `asm` (raw Z80 mnemonics only, no locals, no imports). Produce `.bin`, `.hex`, and minimal `.d8dbg.json`. | §1, §2.1, §2.2, §8.1, §8.2, App B               |
| 2   | **Constants and data**: `const`, `enum`, `data` declarations, `imm` expressions, section packing.                                                                                         | §4.3, §4.4, §6.3, §7.1                          |
| 3   | **Module-scope `var`, types, records, arrays, unions**: layout, `sizeof`, `ea` expressions, field access, array indexing, lowering of non-encodable operands.                             | §4.1, §4.2, §5 (incl. §5.3), §6.2, §6.1.1, §7.2 |
| 4   | **Function locals and calling convention**: `var` block in `func`, SP-relative addressing, stack frame/trampoline mechanism, `func` calls from `asm`.                                     | §8.1–§8.5                                       |
| 5   | **Structured control flow**: `if`/`else`/`while`/`repeat`/`until`, `select`/`case`, stack-depth matching at joins.                                                                        | §10                                             |
| 6   | **Imports and multi-module**: `import`, name resolution, collision detection, packing order, forward references.                                                                          | §3                                              |
| 7   | **`op` declarations**: matcher types, overload resolution, autosave, expansion, cyclic-expansion detection.                                                                               | §9                                              |
| 8   | **`bin`/`hex`/`extern`**: external bytes, Intel HEX ingestion + validation, extern bindings.                                                                                              | §6.4, §6.5                                      |
| 9   | **Assembler completeness pass**: finish CLI polish (all switches per `Appendix D of docs/zax-spec.md`), complete D8M/LST quality, and close remaining core compiler gaps.                 | CLI doc, Appendix B, relevant spec sections     |
| 10  | **`examples/` acceptance + hardening**: all examples compile, negative-test coverage sweep, cross-platform path edge cases, determinism audit.                                            | All                                             |
| 11  | **Debug80 integration (deferred)**: integrate Debug80 only after PR10 and the fully-working-assembler gate (§4.4) are satisfied.                                                          | CLI doc, Appendix B                             |

Each PR must include tests for its scope and must not break any previously passing tests.

### 6) Agent coordination protocol

When using multiple agents in parallel:

#### 6.1 Ownership boundaries

- **Agent A (frontend)**: `src/frontend/`, `src/semantics/`, `src/diagnostics/`. Owns lexer, parser, AST construction, name resolution, const eval.
- **Agent B (backend)**: `src/lowering/`, `src/backend/`, `src/formats/`. Owns control-flow lowering, Z80 encoding, fixups, section packing, format writers.
- **Agent C (CLI + integration)**: `src/cli/`, `test/integration/`, and deferred Debug80 integration after the assembler-complete gate.

#### 6.2 Coordination rules

- **PR #0 (contracts) must merge before any agent begins implementation.** This is the synchronization point.
- Agents work on separate branches (`codex/<agent>-<topic>`). No two agents modify the same file.
- Integration happens on `main`: agent merges to `main`, other agents rebase before opening their next PR.
- If an agent needs to change a shared interface (AST, diagnostics, pipeline), it opens a **contract-change PR** first, which must be reviewed and merged before dependent work continues.
- When interfaces are stable, agents may work in parallel on independent vertical slices (e.g., Agent A on `op` expansion while Agent B on `select` lowering).

#### 6.3 Definition of done (per PR)

Every PR must satisfy before merge:

- [ ] Code compiles with no TypeScript errors
- [ ] All existing tests pass (no regressions)
- [ ] New tests added for every new feature and every new error path
- [ ] No golden-file changes without explicit justification in PR description
- [ ] PR description references spec sections covered
- [ ] Linter clean (ESLint + Prettier, or equivalent)

### 7) Debug80 integration (deferred requirement)

Debug80 currently integrates `asm80` by spawning it and expecting `.hex` + `.lst`, and it uses D8M debug maps.

This work is intentionally deferred until the assembler is fully working per §4.4.

Do not prioritize Debug80 integration while core compiler behavior, CLI behavior, or test completeness is still in progress.

You must plan and implement:

- A way for Debug80 to detect `.zax` projects (or entry files) and invoke `zax` instead of `asm80`.
- The assembler must work correctly when invoked the way Debug80 does: `cwd` set to the source directory, output paths passed as relative. Do not "fix" this by changing Debug80's cwd assumptions.
- Artifact naming must fit Debug80 expectations (per `Appendix D of docs/zax-spec.md`).

Deliverables for integration:

- a small PR to Debug80 adding "ZAX awareness" (file extension, build pipeline invocation, error reporting)
- an end-to-end test or documented manual recipe showing Debug80 stepping through ZAX output using the D8M map

### 8) What you must deliver first

Before coding, output:

1. The **Phase 0 contracts PR** (AST types, diagnostic types, pipeline interface, format writer interfaces).
2. A **phased plan** confirming or adjusting the vertical-slice PR table above, with estimated scope per PR.
3. A **clear assembler-complete gate checklist** (feature coverage, CLI readiness, tests, determinism, diagnostics).

Do not write compiler logic until Phase 0 is merged.

---

## Notes for refinement (for humans)

Topics to decide in future revisions of this prompt:

- Whether to support multiple commands (`zax build`, `zax parse`, `zax lex`) in addition to the classic `zax file.zax` flow
- Whether to add a `--strict` mode that treats warnings as errors vs the current `--warn-as-error` switch
- Whether D8M output should include compiler version metadata for reproducibility tracking
