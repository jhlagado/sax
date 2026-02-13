# ZAX v0.1 Scope Decisions

This document lists features requiring decisions about their future in ZAX.

---

## 1. Array Indexing Restrictions

### 1.1 Non-Constant Array Indices (Element Size > 2 bytes)

**Current:** Compile error for runtime indices when element size > 2 bytes.
**Diagnostic:** `Non-constant array indices are not supported yet.`

**Decision:** ✅ **v0.2 delivery** — Adopt **power-of-2 storage sizing** for all composite types so runtime indexing is always shift-based (no multiply).

**Rationale:** An assembler should not generate hidden, bloated code. Arbitrary element sizes require multiplication routines (20+ bytes inlined per access, or subroutine call overhead). Power-of-2 sizes use simple shift sequences:

| Element Size | Shift Sequence | Code Cost | T-states |
| ------------ | -------------- | --------- | -------- |
| 1            | (none)         | 0 bytes   | 0        |
| 2            | `ADD HL,HL`    | 1 byte    | 11       |
| 4            | `ADD HL,HL` ×2 | 2 bytes   | 22       |
| 8            | `ADD HL,HL` ×3 | 3 bytes   | 33       |
| 16           | `ADD HL,HL` ×4 | 4 bytes   | 44       |

**The Rule:**

- **Storage sizes are power-of-2.** Composite types (arrays, records, unions) are rounded up to the next power-of-2 size.
- **Runtime indexing uses shift sequences only.** Index scaling is always `ADD HL,HL` × N where N = `log2(sizeof(element))`.
- **Padding is storage-visible.** A non-power-of-2 type occupies the padded size everywhere (layout, `sizeof`, and indexing).

**Warning message:**

```
Warning: Type Sprite size 5 padded to 8.
  Storage uses 8 bytes per element (3 bytes padding).
  Hint: Explicitly pad your type to suppress this warning.
```

**Behavior:** A 5-byte struct occupies 8 bytes in storage. This is not just for indexing; it is the actual size of the type. The compiler pads each element, ensuring shift-based addressing works. User is informed but code compiles.

**To suppress warning:** Explicitly pad the struct to a power-of-2 size:

```zax
type Sprite       ; 5 bytes naturally
  x: byte
  y: byte
  tile: byte
  flags: word
  _pad: byte[3]   ; explicit padding to 8 bytes — no warning
end
```

**v0.1 Workaround:** Use `select` dispatch on index value (see `examples/stack_and_structs.zax`)

---

### 1.2 Nested Indexed Addresses `grid[row][col]`

**Current:** Compile error.
**Diagnostic:** `Nested indexed addresses are not supported yet.`

**Decision:** ✅ **v0.2 delivery** — requires address computation chain; inherits power-of-2 behavior from §1.1.

**Power-of-2 at each level:** Storage sizing is power-of-2 at each nesting level:

```zax
type Sprite       ; 5 bytes → padded to 8
  x: byte
  y: byte
  tile: byte
  flags: word
end

globals
  grid: Sprite[4][6]   ; 4 rows × 6 columns
```

| Level                        | Element         | Natural Size     | Padded To | Warning? |
| ---------------------------- | --------------- | ---------------- | --------- | -------- |
| `grid[row_index]`            | Row (6 Sprites) | 6 × 5 = 30 bytes | 64 bytes  | Yes      |
| `grid[row_index][col_index]` | Sprite          | 5 bytes          | 8 bytes   | Yes      |

**Memory impact:** Padding compounds. A `Sprite[4][6]` array naturally uses 120 bytes but with padding uses 4 × 64 = 256 bytes total.

**To suppress warnings:** Design types with power-of-2 sizes from the start. Padding is automatic and unavoidable — the warning simply informs you it's happening. If you don't want warnings, structure your data in powers of 2.

**v0.1 Workaround:** Manual address arithmetic or helper ops.

---

### 1.3 Array Index Semantics

**Current:** Grammar excludes `(expr)` inside array indices. The `arr[HL]` syntax implicitly means indirect (byte at HL), creating ambiguity with grouping parentheses.

**Decision:** ✅ **v0.2 delivery** — Unified index semantics with pattern recognition (see §7.2).

**Index Forms (v0.2):**

| Syntax                          | Index Source          | Width            | Notes                               |
| ------------------------------- | --------------------- | ---------------- | ----------------------------------- |
| `arr[5]`, `arr[CONST]`          | Compile-time constant | N/A              | Address computed at compile time    |
| `arr[A]`...`arr[L]`             | 8-bit register value  | 8-bit (0-255)    | Direct register                     |
| `arr[HL]`, `arr[DE]`, `arr[BC]` | 16-bit register value | 16-bit (0-65535) | For large arrays                    |
| `arr[(HL)]`                     | Byte at (HL)          | 8-bit            | Z80 pattern — indirect              |
| `arr[(IX+d)]`                   | Byte at (IX+d)        | 8-bit            | Z80 pattern — indirect              |
| `arr[idx_byte]`                 | Typed byte variable   | 8-bit (0-255)    | Lowered via `HL`/`DE` address path  |
| `arr[idx_word]`                 | Typed word variable   | 16-bit (0-65535) | Lowered via `HL`/`DE` address path  |
| `arr[(CONST+3) * 2]`            | Constant expression   | N/A              | Parens for grouping                 |
| `arr[(3+5)]`                    | Constant expression   | N/A              | **Warning:** redundant outer parens |

**Key change:** In `[]`, parentheses around Z80 indirect patterns = indirect; other parens = grouping. Redundant parens (no symbols/registers) trigger a lint warning.

**Allowed (documented lowering):** Typed scalar variables can be used directly as indices:

```zax
var
  idx: byte
end

; Allowed — A is destination/output:
LD A, arr[idx]

; Allowed — A is source/output and remains source for final store:
LD arr[idx], A
```

**Lowering policy:**

- Index address computation uses `HL`/`DE` workspace (same core path as register indexing).
- `byte` index variables are zero-extended into `HL`; `word` index variables load directly into `HL`.
- Direct indexed load/store forms (`LD A, arr[idx]`, `LD arr[idx], A`) preserve incoming `HL` with balanced `PUSH HL` / `POP HL`.
- `LD arr[idx], A` does not require implicit `AF` save/restore in the native lowering path.
- Other index forms should remain explicit (`LD A, idx` then `arr[A]`) unless separately promoted.

**Rationale:** This keeps variable indexing ergonomic while preserving predictable workspace behavior and supporting the full 16-bit index range.

---

### 1.4 16-bit Register Indexing

**Current:** Only 8-bit indices supported (A-L registers, 0-255 range).

**Decision:** ✅ **v0.2 delivery** — Allow `arr[HL]`, `arr[DE]`, `arr[BC]` for 16-bit index values (0-65535).

**Rationale:** Arrays >256 elements cannot be runtime-indexed in v0.1. For element size 1-2, 16-bit indexing is simple (`ADD HL,DE`). Larger elements depend on 1.1 (multiply routine).

---

## 2. Op System Restrictions

### 2.1 Local Labels in Op Bodies

**Current:** Compile error.
**Spec:** Section 9, op-system-spec §4.4

**Decision:** ✅ **v0.2 delivery** — Implement hygienic local labels in op expansions.

**Rationale:** Local labels improve ergonomics for non-trivial op bodies while preserving predictable inline behavior. Labels are expansion-scoped via compiler-generated mangling, so each invocation remains isolated.

---

### 2.2 `var` Blocks in Op Bodies

**Current:** Compile error.
**Spec:** Section 9, op-system-spec §2.4

**Decision:** ❌ **Never** — Ops are pure inline expansions with no stack frame interaction.

**Rationale:** Ops expand inline at the call site. Introducing stack frame machinery would violate the zero-overhead principle and create unpredictable code generation. Use functions if you need locals.

---

### 2.3 IX/IY as Op Matchers

**Current:** Not matchable; only usable in raw instructions.
**Spec:** op-system-spec §3.5

**Decision:** ✅ **v0.2 delivery** — Add `idx16` matcher type for IX/IY indexed addressing.

**Rationale:** Consistency. If ops can match `r8`, `r16`, they should match `idx16`. The caller writes natural Z80 syntax; the op captures the whole pattern.

**Syntax:**

```zax
op load_indexed(dst: r8, src: idx16)
  LD dst, src
end

; Usage — caller writes natural Z80 patterns:
load_indexed A, (IX+5)    ; → LD A, (IX+5)
load_indexed B, (IY-2)    ; → LD B, (IY-2)
load_indexed C, (IX)      ; → LD C, (IX+0)
```

**Matcher behavior:** `idx16` matches `(IX)`, `(IX+d)`, `(IX-d)`, `(IY)`, `(IY+d)`, `(IY-d)`. The whole pattern including displacement is captured and substituted as-is.

**Real-world example:**

```zax
type Player
  x: byte      ; offset 0
  y: byte      ; offset 1
  health: byte ; offset 2
end

; Op to load player fields
op get_player_field(dst: r8, field: idx16)
  LD dst, field
end

; With IX pointing to Player struct:
get_player_field A, (IX+0)   ; get x
get_player_field B, (IX+1)   ; get y
get_player_field C, (IX+2)   ; get health
```

---

### 2.4 Condition-Code Matchers for Ops

**Current:** Not supported; must write separate overloads.
**Spec:** op-system-spec §3.5

**Decision:** ✅ **v0.2 delivery** — Add `cc` matcher type for condition codes.

**Rationale:** Simple textual substitution, same as `idx16`. No inversion or manipulation — just capture and substitute.

**Syntax:**

```zax
op jump_if(cond: cc, target: label)
  JP cond, target
end

; Usage:
jump_if Z, done      ; → JP Z, done
jump_if NC, loop     ; → JP NC, loop
jump_if PE, error    ; → JP PE, error
```

**Matcher behavior:** `cc` matches Z, NZ, C, NC, P, M, PE, PO. The condition is captured and substituted as-is.

**Restriction handling:** If a user passes a condition that's invalid for the instruction (e.g., `PE` with `JR`), the error flows through to the Z80 instruction validation — standard assembler error, not a special op-system error.

---

## 3. Type System Restrictions

### 3.1 Typed Pointers `^Type`

**Current:** Not implemented; `ptr` is untyped (2 bytes). Cannot dereference with field access.
**Spec:** Section 3.2

**Decision:** ⏸️ **v0.3 deferred** — Pascal-style typed pointers are accepted for v0.3; not blocking for v0.2.

**Rationale:** Typed pointers enable direct field access through the pointer (`p^.field`) without manual address arithmetic. This is a quality-of-life feature, not a capability blocker — v0.2 works with explicit loads and indirection.

**Chosen syntax (Pascal-style):**

```zax
type Player
  x: byte
  y: byte
  health: byte
end

globals
  current_player: ^Player   ; pointer to Player
```

**Usage:**

```zax
; With typed pointer (v0.3):
LD A, current_player^.health   ; direct field access through pointer

; Without (v0.2 workaround):
LD HL, current_player          ; load pointer value
LD A, (HL)                     ; manual offset: health is at +2
; ... or use IX:
LD IX, current_player
LD A, (IX+2)                   ; offset for health field
```

**Key features:**

- `^Type` in declarations: "pointer to Type"
- `p^` for dereference: yields the pointed-to value/record
- `p^.field` for field access: dereference + field offset in one expression
- Compile-time only: no runtime type information

**Not generics:** This is simple "pointer to Type" (like Pascal `^Player` or C `Player *`). The compiler knows the pointed-to type and can compute field offsets. No parameterized types, no type variables, no generic programming.

---

### 3.2 Qualified Enum Access `Mode.Read`

**Current:** Compile error; members in global namespace.
**Spec:** Section 3.4

**Decision:** ✅ **v0.2 delivery** — Implement namespace-qualified enum member access (`Mode.Read`).

**Rationale:** Improves readability and avoids global-name collisions with low implementation complexity.

**v0.2 behavior:**

- Allow `EnumType.Member` syntax for enum members.
- Require qualification: unqualified enum members are compile errors.
- Use qualified form in documentation and examples.

---

### 3.3 `sizeof`/`offsetof` Built-ins

**Current:** Not implemented; use explicit `const` values.
**Spec:** Section 4.2

**Decision:** ✅ **v0.2 delivery** — Implement as compile-time built-ins for byte-addressed boundaries.

**Rationale:** Z80 instructions and external interfaces are byte-addressed (`LDIR` lengths, `IX+d` displacements, binary layouts, heap/block allocators). These operators expose required byte constants from type information, avoiding magic numbers.

**v0.2 semantics:**

- `sizeof(Type)` returns the **storage size** of the type (power-of-2 rounded for composites).
- `offsetof(Type, field)` returns the byte offset of `field` from the start of `Type`, using **storage sizes** of preceding fields.
- Both operators are compile-time constants only.

**Usage guidance:** Prefer typed field/index access by default. Use `sizeof`/`offsetof` at byte-level boundaries: bulk copy lengths, allocation sizes, explicit indexed displacements, and binary/hardware/protocol layouts.

---

## 4. Function Restrictions

### 4.1 Function Overloading

**Current:** Not supported; only ops overload.
**Spec:** Section 8

**Decision:** ❌ **Never** — Function overloading is banned; use explicit function names.

**Rationale:** ZAX call sites are register-heavy and semantically low-level. Function overloading adds high resolver complexity and ambiguity for limited practical gain in this model. Explicit names (`load_u8`, `load_u16`, `load_ptr`) are clearer, easier to debug, and align with predictable assembly-style APIs.

**Guidance:** Keep overloading in `op` only. Functions should use explicit names that encode intent/width.

---

## 5. Output Restrictions

### 5.1 Extended-Address HEX Records (Types 02/04)

**Current:** Compile error.
**Spec:** Section 5.2

**Decision:** ❌ **Never** — Extended-address HEX output is out of scope; ZAX targets a 64KB maximum address space.

**Rationale:** Core Z80 addressing is 64KB. Banking and >64KB memory models are platform-specific and require a separate segment/banking design that is intentionally excluded from ZAX core.

---

### 5.2 Source-Level Listing (.lst)

**Current:** Basic byte dump + symbols only.
**Spec:** Appendix A

**Decision:** ⏸️ **v0.3 deferred** — Keep current deterministic byte-dump listing in v0.2; defer source-interleaved listing.

**Rationale:** Full source-interleaved listing requires instruction-to-source mapping infrastructure across lowering/expansion paths. That is valuable, but not required to ship v0.2 language/core features.

---

## 6. Integer Semantics

### 6.1 Signed Integer Types

**Current:** All arithmetic unsigned with 2's complement truncation.
**Spec:** Section 7.1

**Decision:** ❌ **Never** — Dedicated signed storage types are out of scope for ZAX.

**Rationale:** ZAX is assembler-first: arithmetic and control flow are explicit flag-level operations (`CP`, condition codes), not high-level typed expressions. Signedness is interpretation of bits/flags, not a separate storage kind.

**Guidance:** Keep core types width-based (`BYTE`, `WORD`, `PTR`). For signed behavior, use documented flag recipes or helper `op`s for signed compare/branch patterns.

---

## 7. Modern Addressing Semantics

This section defines a unified addressing model for ZAX, with **value semantics** as the core v0.2 change and explicit operators deferred to v0.3.

### 7.1 Value Semantics for Typed Variables (v0.2)

**Current:** Typed scalar variables use value semantics — `arg` yields the value directly.

**Decision:** ✅ **v0.2 delivery** — Typed scalar variables use value semantics.

**Rationale:** ZAX's typed variables (`globals`, `var`, function args) are NEW abstractions without `db`/`dw` precedent. Users learning ZAX have no preconceptions. C-style value semantics are more intuitive for modern programmers.

**The Rule:**

- **Scalar variables** (byte, word, ptr): name = value directly
- **Composite variables** (arrays, records): name = address (arrays ARE addresses)

| Declaration        | `name` means            | Notes                          |
| ------------------ | ----------------------- | ------------------------------ |
| `byte_count: byte` | value of byte_count     | Scalar — direct value access   |
| `total_word: word` | value of total_word     | Scalar — direct value access   |
| `arr: byte[N]`     | address of array        | Composite — already an address |
| `rec: Record`      | address of record       | Composite — already an address |
| `rec.field`        | value of field (scalar) | Field access yields value      |

**Example:**

```zax
func sum(left_value: word, right_value: word): word
  LD HL, left_value
  LD DE, right_value
  ADD HL, DE
end
```

---

### 7.2 Array Index Pattern Recognition (v0.2)

**Decision:** ✅ **v0.2 delivery** — Inside `[]`, parentheses around Z80 indirect patterns = indirect; otherwise = grouping.

**Recognized Z80 patterns:** `(HL)`, `(DE)`, `(BC)`, `(IX±d)`, `(IY±d)`

| Expression         | Contains       | Interpretation                          |
| ------------------ | -------------- | --------------------------------------- |
| `arr[(HL)]`        | Register HL    | **Indirect** — byte at (HL) as index    |
| `arr[(IX+5)]`      | Index register | **Indirect** — byte at (IX+5) as index  |
| `arr[(CONST + 3)]` | Constant only  | **Grouping** — same as `arr[CONST + 3]` |
| `arr[(3 + 5)]`     | Literals only  | **Redundant** — diagnostic warning      |

**Redundant parens warning:** Outer parentheses containing no symbols or registers should be flagged as a lint-style warning. This catches likely mistakes and keeps code clean.

---

### 7.3 Hidden Code Generation and Preservation Contract (v0.2)

**Principle:** ZAX is a hybrid language. High-level features (`var`/arg access, array/record access, function-call glue) may generate hidden code, and that hidden code must preserve programmer state unless a register is an explicit output/destination.

**Decision:** ✅ **v0.2 delivery** — Language-level lowering is preservation-safe by default.

**Terminology:** In this section, `external clobber` means a register/flag changed at the source-language boundary. Internal scratch usage does not count if restored before control returns to user-visible flow.

---

#### 7.3.1 Array Indexing

Runtime array indexing generates shift sequences (per §1.1 power-of-2 constraint).

| Index Form    | Element Size | Generated Code Sketch                   | Output | External Clobbers  |
| ------------- | ------------ | --------------------------------------- | ------ | ------------------ |
| `arr[reg8]`   | 1            | `LD L,r; LD H,0; LD DE,base; ADD HL,DE` | HL     | —                  |
| `arr[reg8]`   | 2            | above + `ADD HL,HL`                     | HL     | —                  |
| `arr[reg8]`   | 4            | above + `ADD HL,HL` ×2                  | HL     | —                  |
| `arr[reg8]`   | 8            | above + `ADD HL,HL` ×3                  | HL     | —                  |
| `arr[HL]`     | 1            | `LD DE,base; ADD HL,DE`                 | HL     | —                  |
| `arr[HL]`     | 2            | `ADD HL,HL; LD DE,base; ADD HL,DE`      | HL     | —                  |
| `arr[HL]`     | 4+           | `ADD HL,HL` ×N then base add            | HL     | —                  |
| `arr[(HL)]`   | any          | `LD A,(HL); LD L,A; LD H,0; ...`        | HL     | —                  |
| `arr[(IX+d)]` | any          | `LD A,(IX+d); LD L,A; LD H,0; ...`      | HL     | — (`IX` preserved) |

**Key points:**

- No multiply routine — shifts only
- Native output register is `HL` (effective address).
- Internal workspace may use `A`, `DE`, and `HL` depending on index form.
- Non-output registers used as scratch are restored before returning to user-visible flow.
- `IX/IY` remain preserved when used as index source.
- Variable-index lowering (`arr[idx_byte]`, `arr[idx_word]`) follows the same `HL`/`DE` internal address path.
- For direct indexed load/store forms, compiler preserves incoming `HL` via balanced `PUSH HL` / `POP HL`.

---

#### 7.3.2 Value Semantics Loads

With v0.2 value semantics (§7.1), loading a typed variable generates a memory read.

**Rule:** Value loads are preservation-safe; only the requested destination/output register is written.

Examples:

- `LD A, byte_var` → `LD A, (byte_var_addr)` (direct global read)
- `LD HL, word_var` → `LD HL, (word_var_addr)` (direct global read)
- `LD A, arg` / `LD HL, local` lower via SP-relative stack-slot addressing (`SP+N`) with no external register clobbers.

---

#### 7.3.3 Struct Field Access

Accessing fields of a record variable.

**Rule:** Non-indexed field loads (`LD <dest>, rec.field`) are preservation-safe: only the explicit destination/output changes.

| Source Code                            | Context         | Generated Code                | Output | External Clobbers |
| -------------------------------------- | --------------- | ----------------------------- | ------ | ----------------- |
| `LD A, records[item_index].field_name` | indexed + field | index code + field offset add | A      | —                 |

**Indexed struct access** combines array indexing with field offset, and preserves non-output registers at the language boundary.

---

#### 7.3.4 Function Calls

Function calls have defined register conventions.

**Convention:** Calls are preservation-safe at the source-language boundary.

- Return channel is `HL` for all non-void calls (`L` carries byte result).
- Non-output registers/flags are preserved across the call boundary by compiler-generated save/restore as needed.
- Arguments are pushed right-to-left; transient SP movement is balanced by compiler-generated cleanup.
- Net SP delta at the call boundary is zero.

**Argument surface (v0.2):**

- Arity is strict for typed `func`/`extern func` calls.
- Variadic calls are out of scope for v0.2 (future design, likely explicit/extern-only).
- Keep call-site arguments simple and staged; complex computation should be done in prior instructions.

| Category               | Allowed in v0.2                                                     | Not allowed in v0.2                                       |
| ---------------------- | ------------------------------------------------------------------- | --------------------------------------------------------- |
| Registers              | `reg8`, `reg16`                                                     | —                                                         |
| Immediate values       | Literal, named constant, simple compile-time constant form          | Deep nested arithmetic expressions at call site           |
| Address values (`ea`)  | `name`, `name.field`, `name + const`, `name - const`, `name[const]` | Dynamic index forms (`name[idx]`, `name[(HL)]`, etc.)     |
| Memory values (`(ea)`) | `(name)`, `(name.field)`, `(name + const)`, `(name[const])`         | Dynamic/nested indexed forms (`(name[idx])`, `(a[b[c]])`) |

**Notes:**

- `name[const]` is allowed: it is fixed-offset addressing resolved at compile time.
- Dynamic or nested indexed arguments are deferred until their lowering can be guaranteed preservation-safe with low surprise.
- Multi-step style is preferred: compute first, then pass a simple register/slot/address argument.

---

#### 7.3.5 Stack Frame Operations

Function prologue/epilogue for locals.

| Operation      | Generated Code      | External Clobbers | Notes                          |
| -------------- | ------------------- | ----------------- | ------------------------------ |
| Frame setup    | `PUSH BC` × N       | —                 | Internal reserve for locals    |
| Frame teardown | `POP BC` × N, `RET` | —                 | Balanced cleanup before return |

**Note:** Current model is SP-only. `IX/IY` are available for indexed addressing/typed access patterns. Arg/local stack-slot addressing does not itself clobber registers; SP-management/tracking constraints still apply.

---

#### 7.3.6 Control Flow

Structured control flow scaffolding generates branch/jump sequences and is preservation-safe for general-purpose registers.

| Construct            | Generated Code Example | External Clobbers | Notes                                  |
| -------------------- | ---------------------- | ----------------- | -------------------------------------- |
| `if <cc> ... end`    | `JP <cc>, ...`         | —                 | Uses already-established flags         |
| `while <cc> ... end` | `JP <cc>, ...`         | —                 | Re-tests current flags each iteration  |
| `repeat ... until`   | `JP <cc>, ...`         | —                 | Condition checked at `until`           |
| `select ...`         | Dispatch sequence      | —                 | Internal scratch preserved at boundary |

**Flags semantics:** Control-flow decisions consume the currently established flags. This is semantic flag usage, not an external register-clobber contract on language scaffolding.

---

#### 7.3.7 Design Principle

ZAX does NOT:

- Expose language users to hidden scratch-register side effects
- Insert undocumented code paths

ZAX DOES:

- Preserve non-output registers/flags for language-level features by default
- Treat hidden scratch/save-restore as compiler responsibility
- Keep net SP effects balanced at feature boundaries
- Document generated lowering and boundary-visible effects

---

#### 7.3.8 Composable Preservation Helpers (Draft)

**Draft direction:** Build language lowering from small composable helpers with explicit stack effects (Forth-style), preservation by default, and stack-oriented result flow.

**Helper contract:**

- Each helper declares stack effect (`--`, `-- w`, `w --`, etc.).
- Non-output registers are preserved at helper boundary.
- Internal scratch is allowed only if restored before helper exit.
- Result values default to stack output unless helper explicitly targets a destination register.
- Net stack effect must match the declared helper contract exactly.

**v0.2 helper surface as `op` declarations (draft):**

```zax
; Stack effects are documented in comments.
; Matcher names follow current op-system forms (`reg8`, `reg16`, `imm8`, `imm16`, `ea`, `mem8`, `mem16`).

op push_imm16(value: imm16)               ; -- w
  PUSH HL
  LD HL, value
  EX (SP), HL
end

op push_reg8_zx(value: reg8)              ; -- w
  ; Universal form (handles value = H/L safely), preserves HL/AF.
  PUSH AF
  PUSH HL
  LD A, value
  LD H, 0
  LD L, A
  EX (SP), HL
  POP AF
end

op push_addr(addr_expr: ea)               ; -- addr
  ; Same preservation template as push_imm16, but input matcher is `ea`.
  PUSH HL
  LD HL, addr_expr
  EX (SP), HL
end

op push_load8(source: mem8)               ; -- w
  ; Universal mem8 load path: LD A,source is broadly encodable; HL/AF preserved.
  PUSH AF
  PUSH HL
  LD A, source
  LD H, 0
  LD L, A
  EX (SP), HL
  POP AF
end

op push_load16(source: mem16)             ; -- w
  PUSH HL
  LD HL, source
  EX (SP), HL
end

op index_base_scale(base_addr: imm16, shift_count: imm8) ; idx -- addr
  ; TOS contains idx on entry.
  EX (SP), HL
  PUSH DE
  PUSH AF
  LD DE, base_addr
  LD A, shift_count
  OR A
  while NZ
    ADD HL, HL
    DEC A
  end
  ADD HL, DE
  POP AF
  POP DE
  EX (SP), HL
end

op pop_to_reg8(target: reg8)              ; w --   (target must not be H/L)
  ; Fast path for A/B/C/D/E.
  EX (SP), HL
  LD target, L
  POP HL
end

op pop_to_reg8(target: L)                 ; w --
  ; H and A preserved; routes low byte from TOS into L.
  LD L, A
  LD A, H
  EX (SP), HL
  LD H, A
  EX (SP), HL
  LD A, L
  POP HL
end

op pop_to_reg8(target: H)                 ; w --
  ; L and A preserved; routes low byte from TOS into H.
  LD H, A
  LD A, L
  EX (SP), HL
  LD H, L
  LD L, A
  EX (SP), HL
  LD A, H
  POP HL
end

op store8_ea_from_tos(dest: ea)           ; w --
  ; Store low byte of TOS word into dest, consume TOS, preserve HL/AF.
  EX (SP), HL
  PUSH AF
  LD A, L
  LD dest, A
  POP AF
  POP HL
end

op store16_ea_from_tos(dest: ea)          ; w --
  EX (SP), HL
  LD dest, HL
  POP HL
end

```

| Op Name               | Stack Effect  | Purpose                              | Boundary Contract                 |
| --------------------- | ------------- | ------------------------------------ | --------------------------------- |
| `push_imm16`          | `-- w`        | Push literal word                    | Preserve all registers            |
| `push_reg8_zx`        | `-- w`        | Push zero-extended byte              | Preserve all non-output registers |
| `push_addr`           | `-- addr`     | Push effective address               | Preserve all non-output registers |
| `push_load8`          | `-- w`        | Push zero-extended memory byte       | Preserve all non-output registers |
| `push_load16`         | `-- w`        | Push memory word                     | Preserve all non-output registers |
| `index_base_scale`    | `idx -- addr` | Compute base + scaled index          | Preserve all non-output registers |
| `pop_to_reg8(reg8)`   | `w --`        | Route low byte to `A/B/C/D/E`        | Preserve all other registers      |
| `pop_to_reg8(L)`      | `w --`        | Route low byte to `L` (special path) | Preserve all other registers      |
| `pop_to_reg8(H)`      | `w --`        | Route low byte to `H` (special path) | Preserve all other registers      |
| `store8_ea_from_tos`  | `w --`        | Store low byte from stack            | Preserve all non-output registers |
| `store16_ea_from_tos` | `w --`        | Store word from stack                | Preserve all non-output registers |

**Rule:** Do not define wrapper ops for direct machine primitives. Use raw Z80 instructions directly (`PUSH rr`, `POP rr`, `EX DE,HL`, `EX (SP),HL`).

**Address form scope for `ea_simple` (v0.2 draft):** `name`, `name.field`, `name +/- const`, `name[const]`.

**Preferred Z80 primitives:**

- Prefer `EX DE,HL` to move values between working pairs without additional scratch registers.
- Prefer `EX (SP),HL` for stack/HL exchange patterns (notably "restore HL while leaving computed result on top of stack").
- Use `PUSH`/`POP` save/restore when exchange instructions cannot express the required transformation safely.

**Pending:** Add worked examples for each helper and two or three composed pipelines (`arr[idx]` load, struct-field load, argument marshalling sequence).

**Validation required (before promotion beyond draft):**

- `push_reg8_zx` with each source register (`A/B/C/D/E/H/L`), especially `H`.
- `push_load8` across memory forms (`(name)`, `(HL)`, `(IX+d)`, `(IY+d)`).
- `pop_to_reg8` overload dispatch and correctness for `A/B/C/D/E/L/H`.
- End-to-end stack-effect proof (`-- w`, `w --`, `idx -- addr`) in nested op compositions.

---

### 7.4 Raw Data Semantics (Future)

If ZAX adds traditional `db`/`dw` directives:

```zax
data
  buffer: db 0, 0, 0, 0
  message: db "Hello", 0
```

These would use **address semantics** (traditional assembler):

- `buffer` = address of the data
- `(buffer)` = first byte value (traditional syntax)

This maintains clear separation: typed variables are high-level (value semantics), raw data is low-level (address semantics).

---

### 7.5 The `^` and `@` Operators (v0.3 — Deferred)

**Decision:** ⏸️ **v0.3 deferred** — Explicit dereference and address-of operators are nice-to-haves, not required for v0.2.

**Rationale:** With value semantics for typed variables, most common operations don't need explicit dereference. The traditional two-step approach works:

```zax
; Pointer dereference without ^ operator:
LD HL, ptr        ; get pointer value
LD A, (HL)        ; dereference via register

; vs with ^ (v0.3):
LD A, ptr^^       ; double dereference in one expression
```

**v0.3 proposal:**

| Operator | Position | Meaning     | Example                |
| -------- | -------- | ----------- | ---------------------- |
| `^`      | postfix  | dereference | `ptr^`, `HL^`, `ptr^^` |
| `@`      | prefix   | address-of  | `@var`, `@arg`         |

**Note:** `@` is only needed for scalar variables where you want the address. Arrays and records are already addresses, so `@buffer` would be redundant (and should be flagged).

---

### 7.6 Typed Register Field Access (v0.3 — Deferred)

**Decision:** ⏸️ **v0.3 deferred** — Add compile-time typed register ascription for field access, with native support limited to `IX/IY`.

**Rationale:** `IX/IY` are the only Z80 register pairs with displacement addressing, so they support typed field access transparently. Extending this to `HL/DE/BC` requires hidden scratch usage and stack traffic, conflicting with ZAX's explicit code-generation principles.

**Proposed form (illustrative):**

```zax
; Treat IX as pointer-to-Person at this use site:
LD A, (IX: ^Person).name
```

**Rules:**

- Compile-time only ascription: validates type/field and computes offset; no runtime conversion.
- Native built-in surface is intentionally minimal: typed field loads/stores through `IX/IY` only.
- `HL/DE/BC` typed field access is not built-in; users should write explicit address math or helper `op`s.
- For helper `op`s that preserve caller registers, prefer stack save/restore (`PUSH`/`POP`) over hidden global temp storage.
- Treat arg/local slot access as a separate SP-relative concern; do not implicitly compose it into typed-register field lowering.

---

### 7.7 Builtin Promotion Process

**Decision:** ✅ **Adopt process** — Build features as `op`s first, then promote selected patterns to builtins.

**Process:**

- Start with a small core `op` library for addressing/preservation patterns.
- Use those `op`s in docs, examples, and fixtures first.
- Track repeated usage and friction points.
- Promote only patterns that are high-frequency, low-surprise, and have stable preservation/SP behavior.
- Keep uncommon or high-cost patterns as explicit `op`s with documented side effects.

**Rationale:** This keeps the language core minimal while still enabling advanced workflows, and ensures builtin features are validated by real usage before being standardized.

---

### 7.8 Implementation Scope (v0.2)

**Files affected:**

- `src/lowering/emit.ts` — resolveEa(), pushMemValue(), arg passing (~300 lines)
- `src/frontend/parser.ts` — Z80 pattern recognition in index context
- Test fixtures — ~49 files with locals, ~79 access patterns

**Migration:**

- v0.2 uses `arg` (value) form for typed scalar variables in docs and examples
- Redundant parens in indices generate warnings
- v0.3 adds optional `^` and `@` operators

---

## 8. Coding Style and Linting

### 8.1 Case Style for Z80 Keywords

**Current:** ZAX accepts any case for mnemonics and registers (`LD`, `ld`, `Ld` all valid). No consistency enforcement.

**Decision:** ✅ **v0.2 delivery** — Optional case style linting via compiler flag.

**Flag:** `--case-style=<mode>`

| Mode         | Mnemonics          | Registers          | Behavior              |
| ------------ | ------------------ | ------------------ | --------------------- |
| `upper`      | UPPERCASE required | UPPERCASE required | Warn on lowercase     |
| `lower`      | lowercase required | lowercase required | Warn on uppercase     |
| `mixed`      | Any case           | Any case           | No warnings (default) |
| `consistent` | Match first use    | Match first use    | Warn on inconsistency |

**Scope:** Only applies to Z80 keywords (mnemonics, register names, condition codes). User-defined identifiers (variables, labels, types, constants) are always case-sensitive and unaffected by this setting.

**Examples:**

```zax
; With --case-style=upper
LD A, 0           ; ✓ OK
ld a, 0           ; ⚠ Warning: lowercase mnemonic 'ld', expected 'LD'

; With --case-style=consistent (first use sets style)
ld a, 0           ; Sets style to lowercase
LD B, 1           ; ⚠ Warning: inconsistent case, expected 'ld'
```

**Rationale:** ZAX respects decades of existing Z80 code in various styles. Enforcement is opt-in. Teams can mandate house style; individuals can work as they prefer.

**Documentation convention:** ZAX official docs use UPPERCASE for Z80 keywords to maximize visual distinction from user-defined lowercase identifiers.

**Naming convention for examples:** Avoid single-letter parameter/local names that can be mistaken for register tokens (`A`, `B`, `C`, `D`, `E`, `H`, `L`). Use descriptive names.

**Pending cleanup (appendix candidate):** Add an "Example Hygiene Checklist" appendix and run a repo-wide sweep across docs, examples, and test fixtures.

- Use UPPERCASE for Z80 keywords.
- Avoid single-letter parameter/local names that can be confused with registers.
- Keep examples aligned with current v0.2 semantics (no legacy scalar-paren patterns).

---

## Summary Table

| Feature                            | Decision         | Complexity | Section |
| ---------------------------------- | ---------------- | ---------- | ------- |
| Non-constant indexing (power-of-2) | ✅ v0.2 delivery | Low        | §1.1    |
| Nested `grid[row][col]`            | ✅ v0.2 delivery | High       | §1.2    |
| Array index semantics              | ✅ v0.2 delivery | Medium     | §1.3    |
| 16-bit register indexing           | ✅ v0.2 delivery | Low        | §1.4    |
| Local labels in ops                | ✅ v0.2 delivery | Medium     | §2.1    |
| `var` in ops                       | ❌ Never         | —          | §2.2    |
| IX/IY matchers (`idx16`)           | ✅ v0.2 delivery | Medium     | §2.3    |
| Condition-code matchers (`cc`)     | ✅ v0.2 delivery | Medium     | §2.4    |
| Typed pointers (`^Type`)           | ⏸️ v0.3 deferred | Medium     | §3.1    |
| Qualified enum `Mode.Read`         | ✅ v0.2 delivery | Low        | §3.2    |
| `sizeof`/`offsetof`                | ✅ v0.2 delivery | Low        | §3.3    |
| Function overloading               | ❌ Never         | —          | §4.1    |
| Extended HEX (>64KB)               | ❌ Never         | —          | §5.1    |
| Source-level listing               | ⏸️ v0.3 deferred | Medium     | §5.2    |
| Signed integers                    | ❌ Never         | —          | §6.1    |
| **Value semantics for variables**  | ✅ v0.2 delivery | Medium     | §7.1    |
| **Index pattern recognition**      | ✅ v0.2 delivery | Low        | §7.2    |
| **Hidden code gen & preservation** | ✅ v0.2 delivery | Low        | §7.3    |
| `^` dereference operator           | ⏸️ v0.3 deferred | Medium     | §7.5    |
| `@` address-of operator            | ⏸️ v0.3 deferred | Low        | §7.5    |
| Typed register field access        | ⏸️ v0.3 deferred | Medium     | §7.6    |
| **Case style linting**             | ✅ v0.2 delivery | Low        | §8.1    |
