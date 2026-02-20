# ZAX Return Register Policy (v0.2 Detailed Design)

Status: non-normative companion to `docs/zax-spec.md` §8.2. Intended for developers and reviewers implementing register-based returns and preservation.

## 1. Goals
- Make return channels explicit and user-controlled via declared registers.
- Derive preservation mechanically from the declared return set.
- Keep a single-pass-friendly model: no body analysis required to know volatility.
- Avoid accidental clobber during local initializers (the HL-save problem).

## 2. Surface Syntax (recap)
- Canonical: `func name(...): <return-reg-list>` where the list is one of:
  - `none` (void)
  - `HL`
  - `HL,DE`
  - `HL,DE,BC`
  - Any of the above with `AF` appended (publishes flags)
- Aliases (compat): `byte`/`word` ≡ `HL` (byte returns in `L`), `long` ≡ `HL,DE`, `verylong` ≡ `HL,DE,BC`.
- `extern func` uses the same form; `op` has no return declaration.

## 3. Preservation Matrix (derived)
Preserve = {AF, BC, DE, HL} \ ReturnSet (IX always preserved).

| Declared returns  | Preserved regs |
|-------------------|----------------|
| none              | AF, BC, DE, HL |
| HL                | AF, BC, DE     |
| HL,AF             | BC, DE         |
| HL,DE             | AF, BC         |
| HL,DE,AF          | BC             |
| HL,DE,BC          | AF             |
| HL,DE,BC,AF       | —              |

Extern typed calls: same return registers, but preservation is caller-responsible unless an explicit ABI is provided.

## 4. Prologue/Epilogue Strategies
### 4.1 Non-void (HL volatile)
- Locals-before-preserves ordering is fine: use HL for initializers, then push preserves (AF/BC/DE as needed).
- Example (HL return):
  - locals init via `ld hl, imm` / `push hl`
  - `push af`, `push bc`, `push de` as required
  - Epilogue: pop in reverse, `ld sp, ix`, `pop ix`, `ret`.

### 4.2 Void / HL-preserved cases (none, HL not in returns)
Problem: locals initialized via HL would clobber the incoming HL before it’s saved.

Solution (swap pattern):
- Prologue:
  1) `push ix`; `ld ix,0`; `add ix,sp`
  2) `push hl`              ; save incoming HL
  3) For each local init: `ld hl, <init>` then `ex (sp),hl` (init lands on stack; saved HL restored to HL)
  4) Push preserves in order: `push de`, `push bc`, `push af`
- Epilogue:
  - `pop af`; `pop bc`; `pop de`; `pop hl` (discard saved-HL slot); `ld sp, ix`; `pop ix`; `ret`
- Only used when the declared return set does **not** include HL.

### 4.3 Flags in return set
- Including `AF` in the return list drops AF from the preserve set. No extra prologue steps; just omit pushing AF.

## 5. Lowering Rules for Address Materialization
- Prefer base in DE, offset/scale in HL; `add hl, de` for the final address.
- Use DE shuttle for IX+d lane transfers when semantic register is HL (per v0.2 byte-lane rule).
- Local+local base/index is high-cost; warn/reject under runtime-atom budget unless one side is hoisted to a register (per `docs/arrays.md`). If allowed, save/restore any scratch pair used.

## 6. Call-Site Semantics
- Internal typed calls: callee preserves per matrix; caller cleans args; HL volatility per declared returns.
- Extern typed calls: caller must preserve anything it cares about beyond the return set; declarations only publish the return registers.
- Raw `call` mnemonics: no contract.

## 7. Migration Notes
- Old `: long` / `: verylong` map to `: HL,DE` / `: HL,DE,BC`.
- Old `flags` modifier maps to adding `AF` to the return list.
- Consider a diagnostic phase to steer users toward register lists; aliases may be removed in v0.3.

## 8. Tests to Add/Update
- Parser: accept register lists; aliases still parse.
- Preservation matrix: one test per return set (with/without AF) validating prologue/epilogue pushes/pops.
- Void prologue swap: assert HL is not clobbered by local initializers (see pattern above).
- Array/record lowering: ensure temp preserves and destination-only mutation with new preservation rules.

## 9. Open Questions (for follow-up)
- Should `byte` remain as HL/L or become `A`? (Currently HL/L.)
- Should extern declarations optionally carry an ABI/preserve annotation to override caller-responsible default?
