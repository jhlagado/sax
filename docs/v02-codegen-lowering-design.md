# v0.2 Codegen and Lowering Design (Draft)

This document defines the intended lowering/codegen model for ZAX where hidden code generation must remain composable and preservation-safe.

Normative language behavior remains in `docs/zax-spec.md`.
This document is an engineering design target for closeout work and v0.3 planning.

## 1. Problem Statement

ZAX is register-first and assembler-first.
When lowering inserts hidden sequences, accidental register clobber is a larger risk than raw cycle cost.

The codegen model therefore prioritizes:

- explicit register/stack contracts per lowering primitive
- composability of hidden sequences
- predictable frame access for args and locals
- deterministic emitted `.asm` for inspection and review

## 2. Lowering Primitive Contract

Every hidden lowering primitive must define:

- `inputs`: required register/memory state
- `outputs`: destination/result register(s) or memory effect
- `clobbers`: exact register set that may be modified
- `sp_delta`: net stack change in bytes
- `flags_policy`: preserved or clobbered flag behavior

Composition rule:

- Primitives may be composed only when contracts are compatible.
- If live values overlap with `clobbers`, the primitive must self-preserve or use an alternate sequence.
- Net stack effect across a composed block must be known and validated.

## 3. Stack-Effect Model (Forth-style)

ZAX lowering should be reasoned about as stack effects:

- `sp_delta` is first-class, not incidental.
- Structured lowering blocks should compose like stack words/macros.
- Push/pop and exchange primitives are valid composition tools when explicitly contracted.

Common preservation tools in this model:

- `push` / `pop`
- `ex de,hl`
- `ex (sp),hl`

## 4. IX Frame Direction

Preferred direction: frame-based lowering using `IX` as frame anchor.

Rationale:

- low clobber risk for repeated arg/local access
- stable offsets for both args and locals
- simpler composition under strict preservation requirements

### 4.1 Canonical Frame Shape

With prologue saving `IX` and setting `IX = SP`:

- `IX+0..1`: saved old `IX`
- `IX+2..3`: return address
- `IX+4..`: arguments
- `IX-1..`: locals (allocated by lowering)

Conceptual order:

`argN ... arg2 arg1 ret-addr old-ix [IX] var1 var2 ...`

### 4.2 Prologue/Epilogue Pattern

Canonical pattern:

```asm
; prologue
push ix
ld ix, 0
add ix, sp
; allocate locals (SP adjustment)

; epilogue
ld sp, ix
pop ix
ret
```

`ld sp, ix` + `ret` alone is invalid if `IX` was saved in prologue.

## 5. Call-Boundary Interaction

Typed boundary rules still apply.

Additional lowering rule for IX-frame mode:

- `IX` is treated as preserved frame state and must survive nested calls.
- Hidden call wrappers must preserve required live state per primitive contracts.

The implementation may still choose SP-relative access for specific tiny cases, but IX-frame is the default strategy for framed functions under this design.

## 6. Performance Policy

This model is not tuned for minimum instruction count in all cases.

Policy tradeoff:

- prefer predictable preservation and composability
- accept localized overhead in var/arg access
- optimize only where contract safety is not weakened

Practical guidance:

- Use IX-frame where framed access density is meaningful.
- Evaluate SP-relative fallback only when measurable and contract-safe.

## 7. Verification Requirements

Codegen verification should assert both output shape and preservation behavior.

Required checks:

- deterministic `.asm` output for fixture corpus
- hidden-lowering risk-matrix coverage (op expansion, prologue/epilogue, local/arg/global access)
- stack-effect guardrails (`sp_delta` consistency and non-zero exit detection)
- call-boundary preservation checks (typed/raw contract behavior)

## 8. Open Design Items

- Whether IX-frame becomes mandatory default or policy-selectable mode.
- Whether to expose lowering mode as a user-visible flag or keep internal/automatic.
- Exact helper-level representation for clobber/stack contracts in code.
- Criteria for safe dynamic temporary stack regions within structured lowering.

## 9. Backlog Linkage

This design aligns with:

- `#263` hidden-lowering risk matrix and focused coverage
- `#264` opcode/codegen verification workflow
- `#265` v0.2 codegen verification gate tracker
