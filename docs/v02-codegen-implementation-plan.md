# v0.2 Codegen Implementation Plan

This plan turns the v0.2 frame/call policy into implemented lowering behavior.

Normative references:

- `docs/zax-spec.md` (language authority)
- `docs/v02-codegen-verification.md` (verification strategy)
- `docs/v02-codegen-worked-examples.md` (worked lowering shapes)

## 1. Scope and Success Criteria

Scope:

- IX-anchored framed-function lowering
- typed-call boundary preservation contract
- legal IX-displacement lowering for word slots using DE shuttle
- declaration-order local scalar initializer lowering
- epilogue rewrite policy (only when needed)

Done means:

- emitted `.asm` for language-tour baseline examples matches v0.2 expected patterns
- test matrix covers positive/negative cases for frame access, call boundaries, and epilogue rewriting
- no hidden-lowering sequence emits illegal IX+H/L byte-lane forms

## 2. Execution Order

### Phase 0: Baseline Lock

Deliverables:

- freeze baseline examples and expected traces
- ensure one canonical expected file per baseline example where behavior is still converging

Tasks:

- keep `examples/language-tour/00_call_with_arg_and_local_baseline.zax`
- keep `examples/language-tour/00_call_with_arg_and_local_baseline.expected-v02.asm`
- add a compare harness test that diffs emitted `.asm` against expected for this baseline

Exit criteria:

- deterministic baseline comparison test exists and passes for expected build

### Phase 1: Frame Slot Access Rewriter (P0)

Deliverables:

- lowering rule that rewrites word slot transfers through legal `DE` byte-lane operations

Tasks:

- implement frame-slot read lowering: `slot -> HL` via `EX DE,HL` + `LD E/D,(IX+d)` + `EX DE,HL`
- implement frame-slot write lowering: `HL -> slot` via `EX DE,HL` + `LD (IX+d),E/D` + `EX DE,HL`
- forbid illegal hidden forms that mention `H/L` with `IX+d` in lowered output

Tests:

- positive: arg/local read/write in word functions
- negative: assertion that hidden lowering never emits illegal `IX+d` with `H/L`

Exit criteria:

- all frame-slot word accesses emitted in legal pattern

### Phase 2: Local Initializer Lowering (P0)

Deliverables:

- initializer lowering in source declaration order

Tasks:

- lower scalar local initializers at function entry in declaration order
- for 16-bit constants use `LD HL, imm16` + `PUSH HL`
- keep stack-slot offsets consistent with declaration order and frame model

Tests:

- multiple locals with mixed constants (`0`, nonzero)
- verify offsets map to declared symbol order

Exit criteria:

- initializer emission order and offsets are stable and documented

### Phase 3: Typed-Call Glue vs Function Body Preservation (P0)

Deliverables:

- call-boundary behavior matches v0.2 contract

Tasks:

- enforce: HL volatile for all typed calls
- enforce: non-HL boundary state preserved at typed call boundaries
- keep raw `call` behavior distinct from typed-call glue behavior

Tests:

- matrix for `void`/`byte`/`word` returns
- typed vs raw call diagnostics and behavior tests

Exit criteria:

- call-boundary tests pass and regressions are guarded

### Phase 4: Epilogue Rewrite Tightening (P1)

Deliverables:

- synthetic epilogue only when needed

Tasks:

- emit synthetic epilogue only for `frameSize > 0` or conditional returns
- avoid redundant `JP epilogue` when fallthrough reaches same epilogue block
- preserve existing `retn`/`reti` guardrails

Tests:

- straight-line no-early-return functions
- multi-return/conditional-return functions

Exit criteria:

- no redundant synthetic-jump artifacts in straight-line cases

### Phase 5: Corpus Expansion and Audit (P1)

Deliverables:

- expanded examples with expected lowering patterns

Tasks:

- add expected-v02 asm for additional language-tour examples
- add focused cases for args/locals/aliases/arrays/records
- add one nested-index expression case near runtime-atom budget limit

Tests:

- doc/codegen drift checks on curated examples

Exit criteria:

- representative coverage for v0.2 feature set

### Phase 6: Readiness Gate (P0)

Deliverables:

- implementation readiness report and merge gate checklist

Tasks:

- run targeted test suites from `docs/v02-codegen-verification.md`
- perform manual audit on emitted `.asm` for baseline and two advanced examples
- collect unresolved deltas as v0.2 blockers or explicitly defer to v0.3

Exit criteria:

- no P0 blockers remain for frame/call/lowering correctness

## 3. Backlog Structure (GitHub Issues)

Create one issue per phase plus one umbrella tracking issue.

Recommended labels:

- `v0.2`
- `codegen-lowering`
- `priority:P0` / `priority:P1`
- `status:ready` / `status:blocked`

Issue template discipline:

- use `.github/ISSUE_TEMPLATE/v02-change-task.yml` fields
- include: problem statement, normative references, acceptance checks, non-goals

## 4. Suggested 4-Week Schedule

- Week 1: Phase 0 + Phase 1
- Week 2: Phase 2 + Phase 3
- Week 3: Phase 4 + Phase 5 (initial slice)
- Week 4: Phase 5 completion + Phase 6 readiness gate

If Phase 1 or 3 slips, shift Phase 5 and protect Phase 6 as a hard gate.
