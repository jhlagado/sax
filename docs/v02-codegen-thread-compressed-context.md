# ZAX Codegen Thread Compressed Context (AI Handoff)

## Intent

This is a compressed handoff of the design discussion about ZAX lowering/codegen policy.
Goal: continue implementation/planning without re-reading chat history.

## Core Position

- ZAX is a virtual assembler: register-first semantics with hidden lowering when needed.
- Main risk is hidden codegen clobbering registers and making composition unsafe.
- Correctness/preservation predictability is prioritized over minimal cycle count.

## Current Verification State

- `.asm` deterministic lowering trace exists and is now first-class output.
- Tiered `.asm` golden corpus and hidden-lowering risk matrix workstreams have landed substantial coverage.
- Remaining gate work is opcode/contract verification policy/workflow.

## Key Design Direction

### 1) Function model vs naked subroutine model

- Two concepts should coexist:
  - `func`: encapsulated, language-level preservation guarantees.
  - ABI-style/naked (`extern`-like): explicit clobber contract, caller-managed.
- Typed `func` should not require user to reason about machine-level clobbers by default.

### 2) Return policy == boundary clobber policy

- Non-void typed calls: `HL` is boundary-visible return channel (or `L` for byte).
- `void` typed calls: `HL` is treated as volatile/undefined on return.
- Practical consequence: caller treats `HL` as changed after any typed call.

### 3) Stack-effect is first-class

- Lowering composition should be reasoned Forth-style via net `sp_delta`.
- Hidden helpers/ops should be composable with explicit stack effect and register side effects.
- `push/pop`, `ex de,hl`, `ex (sp),hl` are valid composition primitives.

## IX Frame Strategy (Preferred)

### Why

- Better non-clobber composability for arg/local access than repeated SP-relative HL rebuilding.
- Acceptable cost tradeoff for ZAX’s preservation constraints.

### Frame shape (with `push ix`, then `ix = sp`)

- `IX+0..1`: saved old IX
- `IX+2..3`: return address
- `IX+4..`: args
- `IX-1..`: locals

Conceptual stack order near entry:
`argN ... arg2 arg1 ret-addr old-ix [IX] var1 var2 var3 ...`

### Canonical epilogue

- If prologue saved IX, epilogue must be:
  - `ld sp, ix`
  - `pop ix`
  - `ret`
- `ld sp, ix` + `ret` alone is invalid in this scheme.

### Save-area separation refinement

- Preferred layout: allocate locals before preserved-reg save area.
- This keeps args/locals at stable offsets and separates semantic frame data from preservation payload.

## Call Preservation Policy (Interim)

- Ops must be expanded before any future inferred volatility analysis.
- Until volatility inference exists, conservative default accepted:
  - save/restore `AF`, `BC`, `DE` around typed function bodies/calls as needed by policy.
- `IX` is reserved for frame scheme.
- `IY` currently not protected by default (policy-dependent; revisit per target/runtime constraints).
- Caller cleanup of args should avoid accidental clobber when preservation contract matters.

## Inference vs Syntax

- Preference: infer volatility/clobbers from lowered instruction stream (no new surface syntax now).
- Explicit `volatile BC,DE` syntax was considered but not preferred.
- If explicit mode ever added, it should be optional/verified against inferred behavior.

## IY Ideas

- Candidate use: global/context/environment pointer (long-lived base).
- Also useful for passing large-structure context by reference in API patterns.
- Analogous to known ABI patterns: context pointer / static base register.
- Caution: some targets/environments may reserve IY; keep policy configurable.

## ABI Clarification (agreed direction)

ABI here means machine-level call contract:

- arg passing
- return channel
- clobbers/preserved regs
- stack cleanup responsibility
- frame/prologue/epilogue discipline

ZAX needs this defined for typed internal calls (not only `extern`).

## Open Decisions (to resolve explicitly)

1. Default long-term preservation strategy:
   - keep conservative save-all subset (`AF/BC/DE`) or
   - move to inferred callee-saves-used once reliable.
2. IX policy scope:
   - mandatory for framed funcs, or selectable mode/heuristic.
3. IY policy:
   - free scratch vs dedicated global/context pointer vs target-specific reserved.
4. Caller arg cleanup canonical sequence under non-clobber guarantees.

## Immediate Next Work Suggested

1. Add a normative "typed internal call ABI" section to spec/design docs with exact preserved/clobbered sets by return type.
2. Define and test interim conservative call wrapper behavior (`AF/BC/DE` save policy) as explicit contract.
3. Add opcode side-effect metadata infrastructure for future clobber inference (no syntax change).
4. Extend verification to assert register-preservation invariants, not just emitted artifact text.

## Canonical Related Artifacts

- `docs/v02-codegen-lowering-design.md`
- `docs/v02-hidden-lowering-risk-matrix.md`
- `docs/v02-dev-complete-review.md`
- Issue tracker: `#263`, `#264`, `#265`
