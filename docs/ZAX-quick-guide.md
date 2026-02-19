# ZAX Quick Guide

A practical quick-start guide to ZAX v0.2.

This guide is instructional, not normative. Canonical language behavior is defined in `docs/zax-spec.md`.

---

## Chapter 1 — Overview and Toolchain

### 1.1 What ZAX Is

ZAX is a structured assembler for Z80-family targets. It compiles directly to machine code — there is no external linker, no object format, and no runtime system. The output is a flat binary image, optionally accompanied by Intel HEX, a symbol listing, and a debug map.

ZAX combines:

- raw Z80 instruction authoring (mnemonics, registers, and flags written directly)
- structured control flow (`if`, `while`, `repeat`, `select`)
- typed storage (`byte`, `word`, `addr`, `ptr`, arrays, records, unions)
- compile-time expressions (`const`, `sizeof`, `offsetof`, `enum`)
- inline macro-instructions (`op`) with AST-level operand matching and overload resolution

The compiler adds structure and names to assembly decisions — it does not make those decisions for you. You choose registers, manage flags, and decide what lives in ROM vs RAM. Where compiler-generated code appears (function prologues, epilogues, call wrappers, index-scaling sequences), it is deterministic and inspectable via the `.asm` or `.lst` outputs.

### 1.2 Why Use It

ZAX targets authors who want assembler-level control with stronger structure, consistency, and refactorability.

Typical use cases:

- game engines and demoscene tools
- firmware, monitor, and ROM code
- hardware drivers
- education and systems programming

ZAX is not a high-level language. It is still assembly.

### 1.3 Minimal Program

```zax
export func main(): void
  ld a, 'A'
  ret
end
```

When compiled and executed:

- register `A` holds `$41`
- `ret` returns to caller

This function has no parameters and no `var` block, so no frame is generated. The `ret` is emitted directly — no synthetic epilogue.

### 1.4 A Slightly Larger Example

```zax
const MsgLen = 5

data
  msg: byte[5] = "HELLO"

extern func bios_putc(ch: byte): void at $F003

export func main(): void
  var
    p: addr
  end
  ld hl, msg        ; address of msg
  ld p, hl          ; store address into local p
  ld b, MsgLen
  repeat
    ld hl, p        ; load current pointer
    ld a, (hl)      ; read byte
    inc hl
    ld p, hl        ; save advanced pointer
    push bc
    bios_putc A
    pop bc
    dec b
  until Z
end
```

Key ideas this demonstrates:

- `data` declares initialized storage in the `data` section; `var` reserves stack-frame locals in the function body.
- `p` is a scalar local of type `addr` — `ld p, hl` and `ld hl, p` use value semantics (compiler emits the IX-relative load/store).
- `bios_putc` is an external function bound to a fixed ROM address.
- `push bc` / `pop bc` around the call is necessary because `extern func` carries no register preservation guarantee.
- Structured control flow (`repeat ... until`) lowers to compiler-generated labels and branches.

### 1.5 CLI Basics

```sh
zax [options] <entry.zax>
```

The entry module must be the last argument.

Common outputs:

| File              | Contents                                            |
| ----------------- | --------------------------------------------------- |
| `.bin`            | flat binary image                                   |
| `.hex`            | Intel HEX output                                    |
| `.lst`            | deterministic byte dump with symbol table           |
| `.d8dbg.json`     | D8 Debug Map for Debug80 and compatible tools       |
| `.asm`            | lowered trace — exactly what the compiler emitted   |

By default, ZAX derives all artifact paths from the primary output path. Use `-o <file>` to set the primary output; `-t hex` or `-t bin` to choose the primary type (default: `hex`). Suppress individual outputs with `--nolist`, `--nobin`, `--nohex`, `--nod8m`, `--noasm`.

Useful diagnostic options:

| Option                  | Effect                                                                  |
| ----------------------- | ----------------------------------------------------------------------- |
| `--case-style <m>`      | Case-style lint: `off`, `upper`, `lower`, or `consistent`              |
| `--op-stack-policy <m>` | Op stack-discipline diagnostics: `off`, `warn`, or `error`             |
| `--type-padding-warn`   | Warn when composite type storage is padded to next power-of-2 size      |
| `--raw-typed-call-warn` | Warn when raw `call` / `call cc,nn` targets a typed callable symbol     |
| `-I <dir>`              | Add import search path (repeatable)                                     |

The full CLI contract is in `docs/zax-spec.md` Appendix D.

---

## Chapter 2 — Storage Model

### 2.1 Scalar Types

| Type   | Size (bytes) | Notes                                                        |
| ------ | ------------ | ------------------------------------------------------------ |
| `byte` | 1            | 8-bit unsigned                                               |
| `word` | 2            | 16-bit unsigned                                              |
| `addr` | 2            | 16-bit address; semantic signal for "holds a memory address" |
| `ptr`  | 2            | 16-bit pointer; untyped in v0.2 (no `ptr<T>`)               |
| `void` | —            | Return type only; not valid as a storage, field, or param type |

There are no signed storage types in v0.2.

`ptr` and `addr` are identical in size and code generation. The distinction is semantic intent: `addr` signals "this holds a data address," `ptr` signals "this holds a pointer to something." Use whichever communicates your intent more clearly; the compiler treats them identically.

`void` may only appear as a function return type. Using `void` as a variable type, parameter type, record field type, or array element type is a compile error.

### 2.2 `globals` — Module Variable Storage

`globals` declares named storage in the `var` section. Three declaration forms are supported:

```zax
globals
  count:     word              ; storage declaration — allocates, zero-initialized
  base:      addr = $C000      ; typed value initializer — allocates and initializes
  alias_ptr  = count           ; alias initializer — no storage; new name for an existing symbol
```

The **typed alias form** `name: Type = rhs` is always a compile error in both `globals` and function-local `var` blocks. Use `name: Type = valueExpr` for value initialization, or `name = rhs` for aliasing.

A `globals` block continues until the next module-scope declaration, directive, or end of file. It is not terminated by `end`.

Composite globals can be zero-initialized using scalar zero:

```zax
type Pair
  lo: byte
  hi: byte
end

globals
  p: Pair = 0    ; zero-initializes all fields
```

Aggregate record initializer syntax for `globals` (positional or named-field) is deferred past v0.2. For initialized composite data, use `data` instead.

### 2.3 `data` — Initialized Storage

`data` declares named, initialized storage in the `data` section:

```zax
data
  banner:  byte[]    = "HELLO"           ; inferred length: 5 bytes
  table:   word[4]   = { 1, 2, 3, 4 }   ; fixed-length word array
  palette: byte[3]   = { $00, $7F, $FF }
```

For fixed-length arrays (`T[n]`), the initializer element count must match `n` exactly. For inferred-length arrays (`T[]`), the length is determined from the initializer.

Record initializers support two equivalent forms:

```zax
; positional aggregate — values in field declaration order
origin: Point = { 0, 0 }

; named-field aggregate — field names explicit, order irrelevant
origin: Point = { x: 0, y: 0 }
```

Named-field aggregate rules: every field must appear exactly once. Unknown field names, duplicate fields, and missing required fields are compile errors. Mixing positional and named entries in one aggregate is a compile error.

String literals (`"TEXT"`) emit ASCII bytes with no null terminator. They are only valid in `data` initializers.

A `data` block continues until the next module-scope declaration, directive, or end of file.

### 2.4 Composite Storage Rule

All composite storage — arrays, records, and unions — is rounded to the **next power of two**:

```
sizeof(T[n])   = pow2(n × sizeof(T))
sizeof(record) = pow2(sum of field storage sizes)
sizeof(union)  = pow2(max field storage size)
```

where `pow2(n)` is the smallest power of two ≥ `n`, and `pow2(0) = 0`.

Example:

```zax
type Sprite
  x:     byte    ; 1 byte
  y:     byte    ; 1 byte
  tile:  byte    ; 1 byte
  flags: word    ; 2 bytes
end
; field sum = 5, sizeof(Sprite) = pow2(5) = 8
; 3 padding bytes follow flags
```

The padding bytes are present in the binary image. They are included in `sizeof` and in array stride computations. The compiler warns when implicit padding occurs (see `--type-padding-warn`). Designing fields to naturally sum to a power of two eliminates the padding.

### 2.5 Why This Rule Exists

The Z80 has no hardware multiply instruction. Indexing into an array of composites requires computing `base + i × sizeof(element)`. When `sizeof(element)` is a power of two, that multiply is a chain of `ADD HL, HL` (left-shift-by-one) instructions — fast, compact, and requiring no helper routine:

| Element storage size | Shift chain to scale index |
| -------------------- | -------------------------- |
| 1                    | none                       |
| 2                    | `ADD HL,HL` × 1            |
| 4                    | `ADD HL,HL` × 2            |
| 8                    | `ADD HL,HL` × 3            |
| 16                   | `ADD HL,HL` × 4            |

Non-power-of-two element sizes would require software multiplication at every indexed access site. The power-of-two rule makes indexed composite arrays practical without a multiply routine.

### 2.6 `sizeof` and `offsetof`

Both are compile-time built-ins:

```zax
const SpriteSize   = sizeof(Sprite)          ; = 8
const TileOffset   = offsetof(Sprite, tile)  ; = 2  (1 + 1)
const FlagsOffset  = offsetof(Sprite, flags) ; = 3  (1 + 1 + 1)
```

`offsetof` accepts nested field paths for records containing other records:

```zax
type Rect
  topLeft:     Point   ; Point has x: word, y: word — sizeof(Point) = 4
  bottomRight: Point
end

const BrXOffset = offsetof(Rect, bottomRight.x)   ; = 4
```

Use `sizeof` and `offsetof` everywhere instead of hand-computed constants. They update automatically when type definitions change.

---

## Chapter 3 — Addressing and Indexing

### 3.1 Place Expressions

In ZAX, `rec.field` and `arr[i]` are **place expressions** — they denote an addressable location in memory, not a value. The compiler resolves them to actual addresses at code-generation time.

In **value/store contexts** (such as `LD A, rec.field` or `LD rec.field, A`), the compiler inserts the required load or store automatically. In **address contexts** (such as an `ea`-typed `op` parameter), the place expression is passed as a 16-bit address without dereferencing.

Use `@place` to force address-of intent explicitly, even in a context that would otherwise apply value semantics:

```zax
ld hl, @sprite.x        ; HL = address of sprite.x field, not its contents
ld hl, sprite.x         ; HL = value stored at sprite.x (value semantics)
```

`@` is a unary prefix operator. It binds tightly: `@arr[i].field` parses as `@(arr[i].field)`, not as `(@arr)[i].field`. `@` may not be applied to registers, immediate expressions, or dereference forms `(ea)`.

### 3.2 Valid Index Forms

Inside `arr[...]`, only the following forms are valid:

| Index form          | Meaning                                                      |
| ------------------- | ------------------------------------------------------------ |
| `5` or `CONST`      | compile-time constant or `const`/enum value                  |
| `A` `B` `C` `D` `E` `H` `L` | 8-bit register (used directly as index)         |
| `HL` `DE` `BC`      | 16-bit register (direct index)                               |
| `(HL)`              | byte loaded from memory at `HL` (indirect index)             |
| `(IX+d)` / `(IX-d)` | byte loaded from IX-relative address; `d` must be in `-128..127` |
| `(IY+d)` / `(IY-d)` | byte loaded from IY-relative address; `d` must be in `-128..127` |

Anything else inside `[...]` is a compile error. In particular: expressions involving arithmetic (`i + j`, `i * 2`, `i << 1`), arbitrary function calls, or other non-register forms are not valid index expressions. If you need a computed index, compute it into a register first.

### 3.3 The Critical v0.2 Distinction: `arr[HL]` vs `arr[(HL)]`

This is the most common migration mistake from v0.1:

```zax
arr[HL]     ; the index IS the 16-bit value in HL (direct register index)
arr[(HL)]   ; the index is the byte READ FROM memory at address HL (indirect)
```

If your code intends to use the byte at the address in `HL` as an index, write `arr[(HL)]`. If `HL` itself is the index, write `arr[HL]`.

### 3.4 Value Semantics in `LD`

Scalar typed storage — `globals`, function-local `var` slots, and scalar record fields — uses **value semantics** in `LD` operands in v0.2. You do not need parentheses to read or write scalar globals:

```zax
globals
  count: word
  mode:  byte

func example(): void
  ld hl, count       ; load the 16-bit value stored in 'count' into HL
  inc hl
  ld count, hl       ; store HL back into 'count'

  ld a, mode         ; load the byte stored in 'mode' into A
  inc a
  ld mode, a         ; store A back into 'mode'
end
```

Explicit parentheses on scalar globals are still accepted but are redundant. Parentheses continue to mean memory dereference for non-scalar expressions and for explicit indirection where the context demands it.

### 3.5 Field and Element Access

`rec.field` and `arr[idx]` are place expressions that resolve to addresses at compile time (for constant indices) or with a shift-chain sequence (for register indices). In `LD` contexts with scalar types, the compiler dereferences them:

```zax
globals
  player: Sprite

func update(): void
  ld a, player.x         ; read player.x (byte) into A
  inc a
  ld player.x, a         ; write A back to player.x

  ld hl, player.flags    ; read player.flags (word) into HL
  set 0, l
  ld player.flags, hl    ; write back
end
```

For non-scalar fields (arrays, nested records), the place expression remains an address and no automatic dereference is inserted.

### 3.6 Combining Field Access and Indexing

Indexed element access and field access compose:

```zax
data
  sprites: Sprite[16]

func move(idx: byte): void
  ld l, idx              ; put index in L (8-bit register)
  ld a, sprites[L].x     ; read x field of sprites[L]
  inc a
  ld sprites[L].x, a     ; write back
end
```

The compiler emits the shift chain for the outer index (`sizeof(Sprite) = 8` → three `ADD HL, HL`), then adds the field offset for `.x` (which is 0, so no additional add is needed here).

### 3.7 Address Arithmetic

Simple arithmetic on `ea` expressions is allowed:

```zax
ld hl, buffer + 16       ; address 16 bytes into buffer
ld hl, table - 2         ; address 2 bytes before table start
```

`ea + imm` and `ea - imm` bind more loosely than address-path segments. `@sprite.x + 4` means `(@sprite.x) + 4`.

`imm + ea` is not permitted — always write `ea + imm`.

---

## Chapter 4 — Constants and Compile-Time Expressions

### 4.1 `const` Declarations

```zax
const ScreenBase  = $C000
const TileWidth   = 8
const TileBytes   = TileWidth * TileWidth
const MaxSprites  = 16
const FlagMask    = (1 << 4) | (1 << 2)
```

Constants are compile-time `imm` expressions. Their values must be fully resolvable at compile time. Forward references between `const` declarations are allowed.

`export const` is accepted and has no effect in v0.2 (see Chapter 10.4).

### 4.2 Literal Forms

| Form         | Example        |
| ------------ | -------------- |
| Decimal      | `255`          |
| Hexadecimal  | `$FF`          |
| Binary       | `%11111111`    |
| Binary (alt) | `0b11111111`   |
| Character    | `'A'`          |

String literals (`"TEXT"`) are only valid in `data` initializers. Character literals are `imm8` values (single ASCII byte).

### 4.3 Operator Precedence

`imm` expressions support the following operators, highest to lowest precedence:

| Precedence | Operators          | Associativity |
| ---------- | ------------------ | ------------- |
| 1 (highest)| unary `+` `-` `~`  | right         |
| 2          | `*` `/` `%`        | left          |
| 3          | `+` `-`            | left          |
| 4          | `<<` `>>`          | left          |
| 5          | `&`                | left          |
| 6          | `^`                | left          |
| 7 (lowest) | `\|`               | left          |

Parentheses are available for explicit grouping.

Division or modulo by zero is a compile error. Negative shift counts are a compile error. When an `imm` value is encoded as `imm8`, the low 8 bits are used (signed or unsigned, `-128..255` accepted). When encoded as `imm16`, the low 16 bits are used (`-32768..65535` accepted).

### 4.4 `sizeof` and `offsetof` in Expressions

Both built-ins are valid in any `imm` expression context:

```zax
const SpriteBytes  = sizeof(Sprite)
const FlagsOff     = offsetof(Sprite, flags)
const BufferBytes  = sizeof(Sprite) * MaxSprites
const BrXOff       = offsetof(Rect, bottomRight.x)   ; nested path
```

`sizeof` returns storage size (power-of-2 rounded for composites). `offsetof` returns the byte offset of the named field using storage-size field progression.

### 4.5 Enums as Compile-Time Constants

Qualified enum members are `imm` values usable in any compile-time expression context:

```zax
enum Priority Low, Normal, High, Critical

const DefaultPriority = Priority.Normal    ; = 1
const MaxPriority     = Priority.Critical  ; = 3
```

Unqualified enum member references (`Normal` instead of `Priority.Normal`) are compile errors in v0.2. See Chapter 8 for full enum coverage.

### 4.6 Type Aliases

The `type` keyword creates named aliases for existing types:

```zax
type TileId   byte        ; semantic alias for byte
type MapAddr  addr        ; semantic alias for addr
type Row      byte[32]    ; array type alias
```

Aliases can be used as field types in records, parameter types in functions, and storage types in `globals` and `data`. An alias has the same storage size as its underlying type.

Inferred-length array aliases (`type T byte[]`) are **not** permitted. `T[]` is only valid in `data` declarations (with an initializer) and in function parameter position. It is not permitted in type aliases, record fields, local `var` declarations, or return types.

### 4.7 Identifiers and Case Rules

User-defined identifiers follow `[A-Za-z_][A-Za-z0-9_]*`. They are **case-sensitive** — `Sprite` and `sprite` are different names — but two names that differ only by case are a collision error (you cannot define both in the same program). Z80 mnemonics and register names are **case-insensitive** and are reserved. The compiler prefix `__zax_` is reserved for internal use.

---

## Chapter 5 — Structured Control Flow

### 5.1 How It Works

Structured control flow is only available inside function and `op` instruction streams. The four constructs — `if`, `while`, `repeat`, `select` — lower to compiler-generated hidden labels and conditional or unconditional jumps. You never write those labels; the compiler manages them. The only labels you write are explicit local labels (see 5.8).

Two important rules govern everything:

**`if` / `while` / `repeat` do not set flags.** They test the current CPU flag state at the point where the condition code keyword appears. It is always the programmer's job to establish the correct flags with a normal Z80 instruction immediately before the condition is tested.

**`select` does not use flags at all.** It dispatches by comparing a selector value against compile-time `case` constants using equality. The compiler-generated compare sequence may modify `A` and flags as a side effect of dispatch.

### 5.2 Condition Codes

| Code | Flag tested                                     |
| ---- | ----------------------------------------------- |
| `Z`  | zero flag set                                   |
| `NZ` | zero flag not set                               |
| `C`  | carry flag set                                  |
| `NC` | carry flag not set                              |
| `PE` | parity/overflow flag set (parity even)          |
| `PO` | parity/overflow flag not set (parity odd)       |
| `M`  | sign flag set (minus)                           |
| `P`  | sign flag not set (plus)                        |

These are the same condition codes used in Z80 branch instructions (`jp cc`, `jr cc`, `ret cc`). ZAX structured constructs simply use them as keywords.

### 5.3 `if` / `else`

`if <cc>` tests the current flags at the `if` keyword.

```zax
; Test whether A equals zero
or a              ; OR A with itself: sets Z if A is 0, clears Z otherwise
if Z
  ld a, 1         ; A was zero
else
  ld a, 2         ; A was non-zero
end
```

The `else` branch is optional. `if ... end` with no `else` is valid. Nesting is allowed.

```zax
cp $10
if C              ; A < $10
  cp $08
  if C            ; A < $08
    ld b, 0
  else            ; $08 <= A < $10
    ld b, 1
  end
else              ; A >= $10
  ld b, 2
end
```

Rules:

- `else` must immediately follow the `if` body — only whitespace and comments are permitted between the last instruction of the `if` body and the `else` keyword.
- There is at most one `else` per `if`.

### 5.4 `while`

`while <cc>` tests the current flags at the `while` keyword on entry and again at the back-edge after each iteration. If the condition is false on entry, the body never executes.

```zax
; Count down from 10 in A
ld a, 10
or a                ; establish NZ (a = 10, non-zero)
while NZ
  dec a
  or a              ; re-establish flags for the next test
end
; A = 0 on exit
```

The body is responsible for re-establishing flags before control returns to the top of the loop. The back-edge jumps to the condition test, which re-tests `<cc>` using the current flags at that point.

**The most common mistake with `while`** is entering it without having set the flags first:

```zax
; WRONG — LD does not affect flags on Z80
ld b, 10
while NZ           ; tests stale flags from earlier code — undefined behaviour
  dec b
end
```

Fix this by either establishing flags explicitly before the `while`, or using `repeat ... until` when the body must run at least once:

```zax
; Correct: pre-establish flags
ld b, 10
ld a, b
or a               ; set NZ because B is 10
while NZ
  dec b
  ld a, b
  or a
end
```

### 5.5 `repeat ... until`

The loop body always executes at least once. `until <cc>` tests the current flags at the `until` keyword — whatever state the loop body left behind.

```zax
; Walk a null-terminated string starting at HL
repeat
  ld a, (hl)        ; load byte
  inc hl
  or a              ; sets Z if byte is zero
until Z
; HL now points one past the null terminator
```

Use `repeat ... until` when:

- the body must run at least once before any test makes sense
- the flags are naturally established inside the body (common for counter loops)

```zax
; Decrement B from some value down to zero
ld b, count
repeat
  ; ... do work ...
  dec b             ; sets Z when B reaches 0
until Z
```

### 5.6 Nesting

All three flag-based constructs may be freely nested. The compiler tracks which `end` and `until` closes which construct:

```zax
or a
if NZ
  ld b, 4
  repeat
    ; inner loop
    ld c, 8
    or c
    while NZ
      dec c
      or c
    end
    dec b
  until Z
end
```

Stack depth must match across all paths at every structured-flow join. The compiler enforces this — a `push` inside an `if` body without a matching `pop` before `end` is a compile error at the join point.

### 5.7 `select` / `case`

`select` dispatches on a selector value compared by equality against compile-time `case` constants. There is **no fallthrough** — after a `case` body completes, control always transfers to after the enclosing `end`.

```zax
ld a, mode             ; load selector value
select A
  case Mode.Idle
    ld a, 0
  case Mode.Run
    ld a, 1
  else                 ; taken if no case matches
    ld a, $FF
end
```

#### Selector Forms

| Selector      | Dispatched on                                           |
| ------------- | ------------------------------------------------------- |
| `reg8`        | 8-bit register value (zero-extended to 16 bits)         |
| `reg16`       | 16-bit register value                                   |
| `imm`         | compile-time constant (may be folded at compile time)   |
| `ea`          | address value of the expression (not a memory read)     |
| `(ea)`        | 16-bit word loaded from memory at `ea`                  |

If you want to dispatch on a byte value stored in memory, load it into a register first. `select (ea)` reads a 16-bit word — if the high byte of that word is non-zero, no 8-bit `case` value will match.

#### Register Effects

The compiler-generated dispatch may modify `A` and flags. All other registers are preserved.

- If the selector is `A`, `A` may be clobbered by dispatch. Do not rely on `A` still holding the selector value inside a `case` body.
- If the selector is any other register, that register's value is preserved across dispatch.

#### Multiple Values per `case`

A single `case` line may list comma-separated values; any of them will match:

```zax
select A
  case Mode.Idle, Mode.Stopped   ; either value routes here
    ld a, 0
  case Mode.Run
    ld a, 1
end
```

Consecutive `case` lines before any instruction share the body that follows (stacked-case syntax):

```zax
select A
  case Mode.Idle
  case Mode.Stopped              ; stacked: same body as Idle
    ld a, 0
  case Mode.Run
    ld a, 1
end
```

#### `select` Rules

- `else` is optional. If no `case` matches and there is no `else`, control falls through to after `end`.
- `else` must be the final arm. A `case` after `else` is a compile error.
- Duplicate `case` values in the same `select` are a compile error.
- `select` must contain at least one arm; a `select` with no arms is a compile error.
- Nested `select` is allowed.
- A `case` value outside `0..255` for a `reg8` selector can never match; the compiler warns and omits those arms from dispatch.

#### Lowering

The compiler may implement `select` as a compare-and-branch chain or as a jump table. The strategy is a quality-of-implementation decision — no threshold is defined. Compile-time `imm` selectors may be folded entirely at compile time. In all cases the observable behavior is identical: the selector is evaluated once, each `case` is compared against it, and the matching body executes.

### 5.8 Local Labels

ZAX discourages labels in favor of structured control flow, but local labels are available for cases where structured forms don't fit — particularly `djnz` loops, computed jumps, and low-level scanning routines.

```zax
func find_byte(buf: addr, len: word, target: byte): addr
  ld hl, buf
  ld b, len
  ld a, target
scan:
  cp (hl)
  jr Z, found
  inc hl
  djnz scan
  ld hl, 0          ; not found: return null address
  ret
found:
  ; HL points to the matching byte
  ret
end
```

Rules:

- `<ident>:` at the start of an instruction line defines a local label at the current code position. It may be followed by an instruction on the same line (`scan: djnz scan`) or may stand alone on its own line.
- Local labels are scoped to the enclosing `func` or `op` body and are not exported or visible outside it.
- Labels in `op` bodies are **hygienically rewritten** per expansion site — each expansion of the same op gets unique label instances automatically, so two expansions at different call sites never collide.
- Forward references to labels within the same body are allowed.
- Label names must not collide with reserved names (mnemonics, register names, control-flow keywords), ignoring case.
- For relative branches (`jr`, `djnz`), if the displacement falls outside `-128..127`, it is a compile error.
- Resolution order inside a body: local labels take precedence over locals/args, which take precedence over global symbols.

---

## Chapter 6 — Functions and Call Boundaries

### 6.1 Function Declaration

```zax
export func add(a: word, b: word): word
  var
    temp: word = 0    ; local scalar, initialized to 0
  end
  ld hl, a            ; load argument a (value semantics)
  ld de, b            ; load argument b (value semantics)
  add hl, de          ; HL = a + b
  ; result in HL — the word return channel
end
```

Rules:

- Functions are module-scope only. Nested functions are not permitted.
- Function bodies emit to `code`.
- At most one optional `var` block; if present it must precede the instruction stream and is terminated by its own `end`.
- The instruction stream may be empty.
- If control falls off the end of the instruction stream, the compiler treats it as an implicit `ret` (routed through the synthetic epilogue if one is needed).

### 6.2 Function-Local `var` Block

Three declaration forms are valid inside a `var` block:

| Form                     | Meaning                                                       |
| ------------------------ | ------------------------------------------------------------- |
| `name: Type`             | allocates a scalar frame slot, zero-initialized               |
| `name: Type = valueExpr` | allocates a scalar frame slot, initialized to `valueExpr`     |
| `name = rhs`             | alias — no frame slot; binds a new name to an existing symbol |

The **typed alias form** `name: Type = rhs` is always a compile error.

Only scalar types (`byte`, `word`, `addr`, `ptr`, or aliases resolving to those) may have frame slots. Non-scalar locals (arrays, records) are allowed only as alias declarations — they name an existing address but allocate no storage:

```zax
globals
  table: byte[16]

func process(): void
  var
    count:   word = 0        ; valid: scalar slot, initialized
    offset:  byte            ; valid: scalar slot, zero-initialized
    tbl    = table           ; valid: alias — 'tbl' is another name for 'table'
    bad:     byte[4] = table ; COMPILE ERROR: typed alias form
  end
  ; tbl and table are the same address
end
```

Scalar initializers are lowered in declaration order at function entry. For zero or constant word-sized init, the preferred lowering is `LD HL, imm16` / `PUSH HL`, which allocates and initializes the slot in one sequence.

### 6.3 The v0.2 Typed Call Boundary

When the compiler generates a call to a typed internal `func`, it enforces a preservation contract at that boundary:

| Register / flags              | Behavior at typed internal call boundary                    |
| ----------------------------- | ----------------------------------------------------------- |
| `HL`                          | **boundary-volatile** for all typed calls including `void`  |
| `L`                           | carries 8-bit return value for `byte`-returning calls       |
| `HL`                          | carries 16-bit return value for `word`/`addr`/`ptr` returns |
| all other registers and flags | **callee-preserved** — restored by compiler-generated epilogue |

This guarantee applies **only** to typed internal `func` calls. It does not apply to:

- **Raw `call` / `call cc, nn` mnemonics** — these are raw assembly. The compiler enforces no preservation contract.
- **`extern func` calls** — the routine at that address is outside the compiler's control. Assume all registers and flags may be clobbered unless you know otherwise from the external ABI documentation.

The `--raw-typed-call-warn` option causes the compiler to warn when a raw `call` instruction targets a symbol that is a typed ZAX function, since that bypasses the typed boundary contract.

### 6.4 Calling Functions

Inside a function or `op` instruction stream, a line beginning with a function name calls that function:

```zax
; zero-argument call
clear_screen

; calls with arguments
draw_tile tile_id, x_pos, y_pos
bios_putc 'A'
```

Argument forms accepted at call sites:

| Form     | What is pushed onto the stack                                    |
| -------- | ---------------------------------------------------------------- |
| `reg16`  | 16-bit register value                                            |
| `reg8`   | 8-bit register, zero-extended to 16 bits                         |
| `imm`    | compile-time immediate, as 16-bit value                          |
| `ea`     | 16-bit address value of the expression                           |
| `(ea)`   | value loaded from memory (word or byte per parameter type; `byte` is zero-extended) |

Arguments are pushed right-to-left (last argument first). The compiler emits the required pushes, the `call`, and cleans up the arguments after return.

#### How the First Token of an Instruction Line Is Resolved

The compiler resolves the first token of each instruction line in this order:

1. Structured-control keyword (`if`, `else`, `while`, `repeat`, `until`, `select`, `case`, `end`)
2. Z80 mnemonic
3. `op` name
4. `func` or `extern func` name
5. Compile error — unknown identifier

Z80 mnemonics and register names are reserved, so user-defined names cannot shadow them.

#### Operand Identifier Resolution

Inside operands, identifiers resolve in this order:

1. Local labels (scoped to the enclosing `func` or `op` body)
2. Locals and arguments (frame-bound names)
3. Module-scope symbols (globals, constants, enum members, data symbols, function names)

An identifier that matches none of these is a compile error.

### 6.5 Non-Scalar Argument Contracts

Non-scalar parameters (`T[N]` or `T[]`) are passed as a 16-bit address in one stack slot. The type annotation controls what the callee is permitted to assume about the referenced data:

| Parameter type | Contract                                              |
| -------------- | ----------------------------------------------------- |
| `T[N]`         | exact-length: exactly `N` elements of type `T`        |
| `T[]`          | element-shape: element type is `T`, length unspecified |

Compatibility at call sites:

- `T[N]` → `T[]` is allowed (narrowing to flexible view)
- `T[]` → `T[N]` is rejected unless the compiler can prove the length is exactly `N`
- Element-type mismatch is always rejected

```zax
globals
  buf: byte[10]

func process_exact(data: byte[10]): void  end
func process_any  (data: byte[]):   void  end

export func main(): void
  process_exact buf    ; valid: exact match
  process_any   buf    ; valid: [10] satisfies []
end
```

### 6.6 The IX-Anchored Frame Model

Functions that have arguments or local scalar variables use an IX-anchored stack frame.

#### Prologue (compiler-generated)

```asm
push ix
ld   ix, 0
add  ix, sp
```

This saves the caller's `IX` and makes `IX` point to the current top of stack.

#### Frame Layout

```
IX+0 .. IX+1    saved prior IX (2 bytes)
IX+2 .. IX+3    return address (2 bytes)
IX+4 .. IX+5    argument 0 (first argument, low byte at IX+4)
IX+6 .. IX+7    argument 1
  ...
IX-2 .. IX-1    local 0 (first declared local, low byte at IX-2)
IX-4 .. IX-3    local 1
  ...
```

Each argument and local scalar occupies one 16-bit slot regardless of declared type. For `byte` parameters, the value is in the low byte of the slot; the high byte is ignored by the callee (recommended: zero-extend when pushing).

#### Epilogue (compiler-generated)

```asm
ld  sp, ix
pop ix
ret
```

A synthetic epilogue is generated whenever frame cleanup is required (locals present, or callee-save register preservation required). When a synthetic epilogue is present, every `ret` and `ret cc` written in the instruction stream is rewritten to `jp __zax_epilogue_N` or `jp cc, __zax_epilogue_N`. This ensures cleanup always runs before returning, even from a conditional early exit.

If no cleanup is needed — no locals, no saved registers — the function is **frameless**: `ret` is emitted directly at each return point and no prologue or synthetic epilogue is generated.

#### `retn` and `reti`

`retn` and `reti` are raw instructions and are not rewritten to the synthetic epilogue jump. In functions with locals (`frameSize > 0`), using `retn` or `reti` is a compile error — they would bypass local-frame cleanup. In frameless functions, `retn` and `reti` are permitted.

### 6.7 The IX Byte-Lane Constraint

The Z80 `(IX+d)` indirect byte instructions only accept registers `A`, `B`, `C`, `D`, `E` as the byte operand. Registers `H` and `L` are not valid with `(IX+d)`. This means the compiler cannot emit `LD H, (IX+d)` or `LD L, (IX+d)`.

When the compiler needs to transfer a 16-bit frame slot to or from `HL`, it uses `DE` as a shuttle via `EX DE, HL`:

```asm
; Read a word frame slot into HL
ex de, hl
ld e, (ix+d)      ; low byte — E is legal
ld d, (ix+d+1)    ; high byte — D is legal
ex de, hl         ; swap: HL now holds the value, DE restored

; Write HL into a word frame slot
ex de, hl
ld (ix+d),   e    ; E = low byte of original HL
ld (ix+d+1), d    ; D = high byte of original HL
ex de, hl         ; HL restored
```

This is entirely compiler-generated and transparent in normal use. It becomes visible when reading the `.asm` or `.lst` output to understand exactly what was emitted for a given source line.

### 6.8 SP Tracking and Stack-Depth Constraints

The compiler tracks SP deltas for:

- `push` / `pop` (±2)
- `call` / `ret` / `retn` / `reti` / `rst` (±2 or ±0)
- `inc sp` / `dec sp` (±1)
- `ex (sp), hl` / `ex (sp), ix` / `ex (sp), iy` (net delta 0)

Instructions that assign `SP` directly (`ld sp, hl`, `ld sp, ix`, `ld sp, imm16`) are permitted but the compiler does not track their delta. If you use these in a framed function, you are responsible for ensuring SP is correct at every structured-flow join and at function exit.

**Stack depth at joins must match.** At every structured-control-flow join — the end of an `if`/`else`, loop back-edges, loop exits, and the end of a `select` — the tracked stack depth must be identical on all paths that reach that join. Paths that terminate unconditionally (an unconditional `jp`/`jr` or a `ret`) do not participate in the join depth check.

```zax
func example(): void
  if Z
    push bc       ; depth +2 on this path
  end             ; COMPILE ERROR: depth mismatch — push only on one branch
end
```

### 6.9 SP and `op` Expansion

`op` expansion is inline. The stack effects of an op body are governed by the same enclosing function-stream rules. If an op pushes inside one branch of its body without a matching pop on all paths, the stack-depth mismatch will be detected at the enclosing function's join points — which may be far from the op invocation in source. Keep op bodies stack-neutral when possible.

### 6.10 Worked Example: Byte Array Sum

```zax
; Sum a byte array, return 16-bit total
func sum_bytes(data: addr, count: byte): word
  var
    total: word = 0
    ptr:   addr
  end

  ; Initialise pointer from argument
  ld hl, data
  ld ptr, hl

  ld b, count         ; loop counter in B
  ld hl, 0            ; running total in HL

loop:
  ld de, ptr          ; load current pointer into DE
  ld a, (de)          ; read byte from memory
  ld e, a
  ld d, 0
  add hl, de          ; accumulate
  inc de              ; advance pointer
  ld ptr, de          ; save advanced pointer
  djnz loop

  ; Return total: HL already holds the result
end
```

Notes:

- `total` is declared but not used here — the running total is kept in `HL` directly. The `var` slot for `total` is still allocated; a later refactor could use it.
- `ptr` is an `addr` local used to persist the pointer across loop iterations.
- `djnz` uses `B` as the decrement-and-branch counter. Keep `B` free inside the loop body.
- The result is in `HL` at function exit — the compiler uses this as the `word` return channel.
- `data` is an `addr` argument: `ld hl, data` reads the 16-bit value from the IX-relative slot via the compiler's DE-shuttle lowering.

---

## Chapter 7 — The `op` System

### 7.1 What `op` Is

`op` defines inline macro-instructions with compile-time operand matching. Unlike a `func` call, an `op` invocation expands its body directly into the instruction stream at the call site — there is no `call` instruction, no stack frame, and no `ret`. The expansion happens at AST level, not at text level: operands are parsed, matched, and substituted as structured nodes, not as character sequences.

The practical effect is opcode-like syntax with compiler-enforced operand constraints. You write `add16 DE, BC` and the compiler selects the matching body, validates the operands, and emits the expanded instructions exactly as if you had written them directly at that position in the source.

`op` is the right tool when:

- a sequence of Z80 instructions repeats across a function or module in a mechanical way
- you want accumulator-family or register-pair operations that look like opcodes at the call site
- you need operand-specific specialization without the overhead of a function call

### 7.2 Declaration

```zax
op add16(dst: HL, src: reg16)
  add hl, src
end

op add16(dst: DE, src: reg16)
  ex de, hl
  add hl, src
  ex de, hl
end
```

Multiple declarations with the same name define an overload set. The compiler selects among them at each call site based on the operands provided.

Rules:

- `op` declarations are module-scope only. An `op` inside a function body is a compile error.
- The body is an implicit instruction stream terminated by the final `end`.
- `op` bodies may be empty (zero instructions).
- `op` bodies may contain structured control flow. Internal `end` keywords close those nested constructs; the last `end` in the body closes the `op` itself.
- `var` blocks are not permitted inside `op` bodies. For temporaries, use registers and explicit `push`/`pop`.
- Cyclic expansion is a compile error. If op A invokes op B which invokes op A, the compiler reports the full cycle chain.

### 7.3 Zero-Parameter Ops

A zero-parameter `op` uses no parentheses in its declaration and is invoked by name alone on an instruction line:

```zax
op save_bc
  push bc
end

op restore_bc
  pop bc
end

op nop_slide               ; empty body — expands to nothing
end

func example(): void
  save_bc                  ; expands to: push bc
  ; ... do work that clobbers BC ...
  restore_bc               ; expands to: pop bc
end
```

**Important:** `op name` with no parentheses is the zero-parameter form. `op name()` with empty parentheses is not valid — do not add parentheses to a zero-parameter op.

Invocation: write the op name alone on a line. The compiler recognises it as an op invocation during instruction-line parsing (after checking for mnemonics).

### 7.4 Matchers

`op` parameters use **matcher types** that constrain which operand forms are accepted at the call site. Matching and substitution operate on AST nodes, not on source text.

#### Register Matchers

| Matcher | Accepts                                      | Notes                                |
| ------- | -------------------------------------------- | ------------------------------------ |
| `reg8`  | `A` `B` `C` `D` `E` `H` `L`                | all 8-bit registers                  |
| `reg16` | `HL` `DE` `BC` `SP`                         | does **not** include `IX` or `IY`   |
| `A`     | only `A`                                    | fixed: more specific than `reg8`     |
| `HL`    | only `HL`                                   | fixed: more specific than `reg16`    |
| `DE`    | only `DE`                                   | fixed                                |
| `BC`    | only `BC`                                   | fixed                                |
| `SP`    | only `SP`                                   | fixed                                |

`reg16` includes `SP` — if your op body is only valid for `HL`, `DE`, and `BC` but not `SP`, use fixed matchers rather than `reg16`.

#### Immediate Matchers

| Matcher | Accepts                                                         |
| ------- | --------------------------------------------------------------- |
| `imm8`  | compile-time `imm` expression whose evaluated value fits in 8 bits |
| `imm16` | compile-time `imm` expression (any value fitting in 16 bits)    |

`imm8` is more specific than `imm16` for values that fit in 8 bits — overload resolution selects the `imm8` overload when possible.

#### Address and Dereference Matchers

| Matcher | Accepts                                    | Substitution                              |
| ------- | ------------------------------------------ | ----------------------------------------- |
| `ea`    | effective address expression, no parens    | substitutes the address expression        |
| `mem8`  | `(ea)` dereference, byte-width context     | substitutes full `(ea)` including parens  |
| `mem16` | `(ea)` dereference, word-width context     | substitutes full `(ea)` including parens  |

`mem8` and `mem16` are more specific than `ea` in overload resolution.

The distinction between `ea` and `mem8`/`mem16` matters: if the call site writes `(hero.flags)`, an `ea` parameter does not match it — only `mem8` or `mem16` will. Conversely, if the call site writes `hero.flags` (without parens), `mem8`/`mem16` will not match — only `ea` will.

```zax
op store_byte(dst: mem8, val: reg8)
  ld dst, val
end

globals
  hero_hp: byte

func example(): void
  store_byte (hero_hp), A    ; emits: ld (hero_hp), a
  store_byte (hl),      B    ; emits: ld (hl), b
end
```

#### Indexed Register Matchers (`idx16`)

| Matcher | Accepts                                                                    |
| ------- | -------------------------------------------------------------------------- |
| `idx16` | `(IX+d)` `(IX-d)` `(IY+d)` `(IY-d)` — displacement must be in `-128..127` |
| `IX`    | fixed: only `(IX+d)` or `(IX-d)`                                          |
| `IY`    | fixed: only `(IY+d)` or `(IY-d)`                                          |

`IX` and `IY` are fixed matchers and are more specific than `idx16` in overload resolution. A displacement value outside `-128..127` is a compile error at the call site.

The full indexed operand — parentheses, base register, sign, and displacement — is substituted into the op body:

```zax
op poke(dst: idx16, val: reg8)
  ld dst, val
end

func example(): void
  poke (IX+3), A     ; emits: ld (ix+3), a
  poke (IY-1), B     ; emits: ld (iy-1), b
end
```

Note: bare `IX` and bare `IY` without displacement and without parentheses are not matched by `idx16`. They are not members of `reg16` either. To match bare `IX` or `IY` (for instructions like `ld sp, ix`), use the fixed matchers `IX` or `IY` without displacement syntax.

#### Condition Code Matcher (`cc`)

| Matcher | Accepts                                                                  |
| ------- | ------------------------------------------------------------------------ |
| `cc`    | any condition code: `Z` `NZ` `C` `NC` `PO` `PE` `M` `P`               |
| `Z`     | fixed: only `Z` — more specific than `cc`                               |
| `NZ`    | fixed: only `NZ`                                                         |
| `C`     | fixed: only `C`                                                          |
| `NC`    | fixed: only `NC`                                                         |
| *(etc.)*| any individual condition code as a fixed matcher                         |

The matched condition code token is substituted into the op body. The resulting instruction must be valid for that condition code. If your body uses `jr cond, target` and the matched code is `M` or `P` (which `jr` does not accept), it is a compile error at that call site:

```zax
; Generic branch op — uses jp, which accepts all condition codes
op branch_if(cond: cc, target: ea)
  jp cond, target
end

; Specialized for Z — jr is shorter for nearby targets
op branch_if(cond: Z, target: ea)
  jr z, target
end

func example(): void
  branch_if Z,  loop_top    ; selects Z-specialized overload (jr)
  branch_if NZ, loop_top    ; selects generic cc overload (jp)
  branch_if M,  error_exit  ; selects generic cc overload (jp)
end
```

### 7.5 Overload Resolution

When a call site matches multiple overloads, the compiler selects the most specific one. Specificity rules:

| Comparison                                          | Winner              |
| --------------------------------------------------- | ------------------- |
| Fixed register (e.g. `HL`) vs class (e.g. `reg16`) | fixed wins          |
| `imm8` vs `imm16` for values fitting in 8 bits      | `imm8` wins         |
| `mem8` / `mem16` vs `ea`                            | `mem*` wins         |
| Fixed `IX` / `IY` vs `idx16`                        | fixed wins          |
| Fixed condition code vs `cc`                        | fixed wins          |

If no overload matches: compile error, listing the available overloads and why each failed.

If two or more overloads match with equal specificity: ambiguity compile error, listing the competing candidates.

```zax
; These two overloads are ambiguous when called with (HL, BC):
; HL matches both dst: HL and dst: reg16,
; BC matches both src: BC and src: reg16.
; The pair (HL-fixed + BC-class) and (HL-class + BC-fixed) have equal specificity.
op ambig(dst: HL,    src: reg16)  end
op ambig(dst: reg16, src: BC)     end

func test(): void
  ambig HL, BC    ; COMPILE ERROR: ambiguous — two equally-specific candidates
end
```

### 7.6 Substitution

Substitution replaces parameter names in the op body with the AST operands from the call site:

| Matcher              | Substitutes                                                              |
| -------------------- | ------------------------------------------------------------------------ |
| `reg8` / `reg16`     | the matched register token                                               |
| `imm8` / `imm16`     | the immediate expression value                                           |
| `ea`                 | the address expression (no parentheses added)                            |
| `mem8` / `mem16`     | the full dereference expression including parentheses                    |
| `idx16` / `IX` / `IY` | the full indexed operand including parens, register, sign, displacement |
| `cc`                 | the matched condition code token                                         |

The expanded body must produce valid Z80 instructions. If a substituted operand produces an invalid instruction form at the expansion site, it is a compile error at that call site — the error identifies the expanded instruction and the incompatible operand.

### 7.7 Label Hygiene

Local labels inside `op` bodies are **hygienically rewritten** per expansion site. Each expansion gets a unique compiler-generated label instance. Two expansions of the same op at different call sites never share labels:

```zax
op count_down(r: reg8)
inner:
  dec r
  jr NZ, inner
end

func test(): void
  ld b, 10
  count_down B      ; expands with unique label, e.g. __zax_inner_1
  ld c, 5
  count_down C      ; expands with different unique label __zax_inner_2
end                 ; no collision between the two expansions
```

This means you can freely use short, descriptive label names inside op bodies without worrying about conflicts at the call site or between multiple invocations.

### 7.8 Ops Invoking Ops

An op body may invoke other ops. The invoked op expands inline at the point of invocation, not as a call:

```zax
op clear_carry
  or a
end

op safe_adc16(dst: HL, src: reg16)
  clear_carry        ; expands inline: or a
  adc hl, src
end
```

The compiler detects cycles and reports them as compile errors with the full expansion chain. Recursion is not possible.

### 7.9 Register and Stack Effects

Ops are inline expansions. There is **no** compiler-generated preservation boundary around an op invocation, unlike at a typed `func` call boundary.

- The register and flag effects of an op are exactly the effects of the expanded instruction sequence.
- Stack effects in an op body are subject to the same SP-tracking and stack-depth rules as the enclosing function body (see Chapter 6.8).
- If an op pushes without a matching pop on all paths through its body, the stack-depth mismatch will be reported at the enclosing function's structural join points — which may be distant from the op invocation in source.

When an op body needs a temporary register, save and restore explicitly:

```zax
op swap_de_bc
  push de
  push bc
  pop de
  pop bc
end
```

**Destination parameter convention (v0.2):** parameters whose names start with `dst` or `out` are treated as destinations by optional diagnostic tooling. If no parameter starts with `dst` or `out`, the first parameter is assumed to be the destination. This affects only tooling output — it has no effect on expansion or overload resolution.

### 7.10 Complete Example — 16-bit Add Family

```zax
; 16-bit addition for all three main register pairs

op add16(dst: HL, src: reg16)
  add hl, src              ; Z80 has a native add hl, rr instruction
end

op add16(dst: DE, src: reg16)
  ex de, hl                ; bring DE into HL for the add
  add hl, src
  ex de, hl                ; swap back: DE holds result, HL restored
end

op add16(dst: BC, src: reg16)
  push hl                  ; save HL — we need it as scratch
  ld h, b
  ld l, c
  add hl, src              ; HL = BC + src
  ld b, h
  ld c, l
  pop hl                   ; restore HL
end

func vector_add(ax: word, ay: word, bx: word, by: word): void
  ld hl, ax
  ld de, bx
  add16 HL, DE             ; selects first overload; emits: add hl, de
  ; HL = ax + bx

  ld de, ay
  ld bc, by
  add16 DE, BC             ; selects second overload; ex/add/ex sequence
  ; DE = ay + by
end
```

---

## Chapter 8 — Enums

### 8.1 Declaration

```zax
enum Mode    Idle, Run, Pause, Error
enum Signal  Red, Amber, Green
```

Members are sequential integers starting at 0: `Mode.Idle = 0`, `Mode.Run = 1`, `Mode.Pause = 2`, `Mode.Error = 3`.

Storage width is determined automatically by member count:

- `byte` (1 byte) if the member count is ≤ 256
- `word` (2 bytes) if the member count is > 256

Trailing commas in the member list are not permitted.

### 8.2 Qualified Access Is Required

In v0.2, every enum member reference must use the fully qualified form `EnumType.Member`. Unqualified references are always compile errors:

```zax
ld a, Mode.Run    ; correct
ld a, Run         ; COMPILE ERROR: unqualified enum member reference
```

This applies everywhere: `const` declarations, `case` values, `LD` operands, `cp` comparisons, function arguments — everywhere. The qualifier requirement is enforced, not advisory.

### 8.3 Enum Values Are Compile-Time Constants

Qualified enum members are `imm` values. They can be used in any compile-time expression context:

```zax
enum Priority Low, Normal, High, Critical

const DefaultPriority = Priority.Normal    ; = 1
const TopPriority     = Priority.Critical  ; = 3
const PriorityRange   = Priority.Critical - Priority.Low  ; = 3

func at_max(p: byte): byte
  ld a, p
  cp Priority.Critical
  if Z
    ld l, 1
  else
    ld l, 0
  end
  ret
end
```

### 8.4 Using Enums With `select`

`select` / `case` is the idiomatic dispatch mechanism for enum values. `case` values must be compile-time `imm` expressions, and qualified enum members satisfy that:

```zax
enum DeviceState Idle, Busy, Error, Reset

func handle_state(state: byte): void
  ld a, state
  select A
  case DeviceState.Idle
    ; nothing to do
    ret
  case DeviceState.Busy
    ; process pending work
    ret
  case DeviceState.Error
    ; enter fault handling
    ret
  case DeviceState.Reset
    ld a, DeviceState.Idle
    ld state, a
    ret
  end
end
```

All transitions are visible at one dispatch site. No integer literals appear; every value is named.

### 8.5 Multiple Values per Case

Comma-separated enum members and stacked `case` lines both work:

```zax
enum Signal Red, Amber, Green, FlashAmber

func is_stop(sig: byte): byte
  ld a, sig
  select A
  case Signal.Red, Signal.FlashAmber   ; either value takes this body
    ld l, 1
    ret
  case Signal.Amber
  case Signal.Green                    ; stacked: share body below
    ld l, 0
    ret
  end
  ld l, $FF                            ; unreachable if all cases covered
  ret
end
```

Duplicate `case` values within the same `select` are a compile error.

### 8.6 Enums and `byte` Parameters

When passing an enum value as a `byte` function parameter, it travels in the low byte of the 16-bit stack slot. For enums with ≤ 256 members this is always safe — the value fits in one byte. For enums with > 256 members, declare the parameter as `word` to ensure the full value is preserved.

### 8.7 Enums and the Global Namespace

Enum type names live in the global namespace and must be unique across all modules. Enum member names (`Idle`, `Run`, etc.) are not directly accessible as unqualified identifiers — they must always be prefixed with the enum type name. This means member names do not pollute the global namespace and multiple enums may use the same member names without collision:

```zax
enum StateA   Idle, Running
enum StateB   Idle, Stopped    ; 'Idle' and 'Idle' are fine — accessed as StateA.Idle, StateB.Idle
```

---

## Chapter 9 — Records and Unions

### 9.1 Records

A record is a named layout description — a sequence of named fields placed at fixed, sequential offsets.

```zax
type Sprite
  x:     byte     ; offset 0
  y:     byte     ; offset 1
  tile:  byte     ; offset 2
  flags: word     ; offset 3
end
; field sum = 5, sizeof(Sprite) = pow2(5) = 8
; 3 padding bytes follow flags in the 8-byte storage block
```

Fields are laid out in source order. Total storage size is rounded to the next power of two. The padding bytes are present in the binary and are included in `sizeof` and array stride computations.

Records must contain at least one field — an empty `type ... end` is a compile error.

### 9.2 Field Access and Value Semantics

`rec.field` is a **place expression** — it denotes the address of the field, not its value. In value/store contexts (LD, typed call arguments), the compiler inserts the required load or store automatically:

```zax
globals
  player: Sprite

func update(): void
  ld a, player.x         ; read player.x byte into A (value semantics)
  inc a
  ld player.x, a         ; write A back to player.x (value semantics)

  ld hl, player.flags    ; read player.flags word into HL (value semantics)
  set 0, l               ; set bit 0
  ld player.flags, hl    ; write back
end
```

To get the address of a field rather than its value, use `@`:

```zax
  ld hl, @player.x       ; HL = address of player.x — NOT its value
```

### 9.3 `sizeof` and `offsetof` for Records

```zax
const SpriteSize  = sizeof(Sprite)            ; = 8
const XOff        = offsetof(Sprite, x)       ; = 0
const YOff        = offsetof(Sprite, y)       ; = 1
const TileOff     = offsetof(Sprite, tile)    ; = 2
const FlagsOff    = offsetof(Sprite, flags)   ; = 3
```

`offsetof` is the byte offset of the named field from the start of the record, based on the sum of preceding field storage sizes. It does not include padding that might appear after the last field (padding is at the tail of the struct, contributing to `sizeof` but not to any field's offset).

Always use `sizeof` and `offsetof` in code. Never hardcode field offsets — if the record changes, the built-ins update automatically.

### 9.4 Nested Records

Record fields may be of other record types, creating nested layouts:

```zax
type Point
  x: word    ; 2 bytes
  y: word    ; 2 bytes
end
; sizeof(Point) = pow2(4) = 4

type Rect
  topLeft:     Point    ; 4 bytes at offset 0
  bottomRight: Point    ; 4 bytes at offset 4
end
; sizeof(Rect) = pow2(8) = 8

data
  viewport: Rect = { 0, 0, 320, 200 }   ; tl.x, tl.y, br.x, br.y
```

Nested field access uses chained dot notation:

```zax
globals
  vp: Rect

func clip_right(x: word): word
  ld de, x
  ld hl, vp.bottomRight.x    ; load the word value of bottomRight.x
  sbc hl, de
  ; result in HL
  ret
end
```

`offsetof` accepts nested paths:

```zax
const BrXOff = offsetof(Rect, bottomRight.x)   ; = 4
const BrYOff = offsetof(Rect, bottomRight.y)   ; = 6
```

### 9.5 Arrays of Records

When you declare an array of a record type, the element stride is `sizeof(record)` — power-of-2 rounded. This keeps the shift-only index scaling rule intact:

```zax
const MaxSprites = 16

globals
  sprites: Sprite[MaxSprites]

func move_all(): void
  ld b, MaxSprites
  ld hl, 0              ; element index (0-based integer, not byte offset)
loop:
  ld a, sprites[HL].x   ; load x field of sprites[HL] (value semantics)
  inc a
  ld sprites[HL].x, a   ; write back

  inc hl                ; advance to next index
  djnz loop
  ret
end
```

The index here is `HL` holding a 0-based element number (0..15). The compiler emits the shift chain for `HL × sizeof(Sprite)` — three `ADD HL, HL` for a stride of 8 — then adds the field offset for `.x` (which is 0, so no extra add).

**`sizeof(Sprite[MaxSprites])` = pow2(16 × 8) = pow2(128) = 128 bytes.** The array itself also follows the power-of-2 rule.

### 9.6 Designing for Clean Sizes

Implicit padding is legal but adds silent bytes to the binary. Design record fields to naturally sum to a power of two, and use explicit pad fields when you need to document the intent:

```zax
; Natural sum = 5 — implicitly padded to 8 (3 silent bytes)
type SpriteSloppy
  x:     byte
  y:     byte
  tile:  byte
  flags: word
end

; Explicit pad fields — sum = 8, no implicit padding, intent clear
type SpriteClean
  x:     byte
  y:     byte
  tile:  byte
  flags: word
  pad0:  byte
  pad1:  byte
  pad2:  byte
end
; sizeof(SpriteClean) = pow2(8) = 8 — same storage, zero waste
```

Both have the same storage size. The `--type-padding-warn` option will warn for `SpriteSloppy` and not for `SpriteClean`.

### 9.7 Unions

A union overlays multiple field interpretations on the same memory region. All fields start at **offset 0**. The union's storage size is the maximum field size, rounded to the next power of two:

```zax
union Overlay
  w:  word     ; 2 bytes at offset 0
  lo: byte     ; 1 byte  at offset 0 — same address as w's low byte
end
; sizeof(Overlay) = pow2(max(2,1)) = pow2(2) = 2
```

There are no runtime tags, no type narrowing, and no safety checking. A union is purely a layout description.

### 9.8 Union Field Access

All union fields share offset 0. Reading or writing any field reads or writes the same underlying bytes:

```zax
globals
  val: Overlay

func split(): void
  ld hl, $1234
  ld val.w, hl          ; write 16-bit word: memory holds $34 at offset 0, $12 at offset 1
  ld a, val.lo          ; read low byte: A = $34 (offset 0 — same as low byte of w)
end
```

This is the idiomatic ZAX way to read the individual bytes of a 16-bit value without using `AND` masking.

### 9.9 The Offset-0 Trap

Because all union fields start at offset 0, a union of two `byte` fields does **not** give you access to two distinct bytes:

```zax
; THIS IS WRONG if you want byte 0 and byte 1 of a word
union TwoBytes
  lo: byte    ; offset 0
  hi: byte    ; offset 0 — SAME address as lo, not offset 1
end
```

Both `lo` and `hi` alias the same single byte. If you want independent access to both bytes of a word at their correct positions, use a **record**, not a union:

```zax
; Correct: record gives sequential byte offsets
type WordBytes
  lo: byte    ; offset 0
  hi: byte    ; offset 1
end
```

To have both a word view and a byte-pair view simultaneously, use a union containing a word field and a record field:

```zax
type BytePair
  lo: byte
  hi: byte
end

union SplitWord
  w:    word      ; 16-bit view — offset 0
  pair: BytePair  ; byte-pair view — also offset 0; pair.lo at 0, pair.hi at 1
end

globals
  sw: SplitWord

func example(): void
  ld hl, $ABCD
  ld sw.w, hl             ; write $ABCD
  ld a, sw.pair.lo        ; read low byte: A = $CD
  ld a, sw.pair.hi        ; read high byte: A = $AB
end
```

### 9.10 Union Rules

- At least one field is required — an empty union is a compile error.
- Union declarations are module-scope only.
- All fields start at offset 0.
- `sizeof(union) = pow2(max field storage size)`.
- `offsetof(union, field)` is always 0 for any field.
- Unions may contain records as fields (as in `SplitWord` above). Records may contain unions as field types.

### 9.11 Type Aliases

The `type` keyword also creates simple aliases for existing scalar or array types:

```zax
type TileId   byte         ; semantic alias for byte
type MapAddr  addr         ; semantic alias for addr
type ScanLine byte[40]     ; array type alias — 40-byte row
```

Aliases can be used as field types in records, parameter types in functions, and storage types in `globals` and `data`. An alias has the same storage size as its underlying type.

Restrictions:

- `T[]` (inferred-length array) is not valid in a type alias. It is only permitted in `data` declarations (with an initializer) and in function parameter position.
- `void` is not valid as an alias target.

### 9.12 Design Guidance

**Use records for any memory layout that has named fields.** Even for simple two-byte pairs, a record makes the field names explicit and keeps `offsetof` working correctly as the type evolves.

**Use unions for multi-width views of the same bytes.** The classic case is reading a 16-bit word either as a unit or as its two constituent bytes. A union of `word` and a `BytePair` record is the idiomatic form.

**Design record fields to sum to a power of two.** Check `sizeof` against your field sum. If they differ, you have implicit padding — decide whether to accept it or add explicit pad fields to document the choice.

**Never hardcode field offsets.** Use `offsetof` everywhere layout arithmetic appears. A record refactor that changes field order or adds a field will silently break any hardcoded offset constant; `offsetof` updates automatically.

**Be explicit about which byte of a union you are accessing.** Union access at offset 0 is always unambiguous — that is always the low byte of whatever word-sized field overlaps it, for little-endian Z80 memory layout.

---

## Chapter 10 — Modules and Imports

### 10.1 What a Module Is

A ZAX module is a single `.zax` source file. Its **canonical ID** is the file's stem — the basename without the `.zax` extension. If two modules in the same build have the same canonical ID, compilation fails with a module ID collision error.

A module file may contain, in any order:

- zero or more `import` lines (must be at module scope)
- section and alignment directives (`section`, `align`)
- module-scope declarations: `type`, `union`, `enum`, `const`, `globals`, `data`, `bin`, `hex`, `extern`
- `func` and `op` declarations

Nested functions are not permitted. `op` declarations inside function bodies are not permitted.

### 10.2 Importing Modules

Two import forms are available:

```zax
import core                    ; resolved by module ID — looks for core.zax on the search path
import "drivers/uart.zax"      ; explicit path, resolved relative to the importing file
```

For quoted paths, the `.zax` extension should be included. Resolution is: first relative to the importing file's directory, then via compiler search paths (added with `-I`). If the file is not found, compilation fails.

Circular imports are a compile error.

### 10.3 Single Global Namespace

All module-scope names — `type`, `union`, `enum`, `const`, `globals`, `data`, `bin`, `func`, `op`, and `extern` names — share **one global namespace** across all modules in the build. There is no module-qualified access syntax in v0.2.

Every name in that namespace must be unique. Collision detection is **case-insensitive**: you cannot define `Sprite` in one module and `sprite` in another, even if the files are otherwise unrelated.

What counts as a collision:

- two modules declaring the same name (any kind)
- a `func` and an `op` with the same name (they share the namespace)
- a `bin` base name clashing with any other symbol
- an `extern` name clashing with any other symbol
- a local label or argument name that collides with a reserved keyword (mnemonics, register names, control-flow keywords), ignoring case

Any collision is a compile error. There is no implicit renaming or shadowing.

### 10.4 The `export` Keyword

`export` is accepted on `const`, `func`, and `op` declarations. In v0.2, it has no runtime effect — all module-scope names are public regardless. Its purpose is forward compatibility: when qualified-name access is introduced (planned for v1.0 or later), `export` will control which symbols are externally accessible. Using `export` on any other declaration form is a compile error.

```zax
export const ScreenWidth = 320
export func main(): void  end
export op add16(dst: HL, src: reg16)  end
```

### 10.5 Forward References

ZAX is whole-program compiled. You may reference a symbol before it is declared, as long as it is defined somewhere in the build by the end of compilation. There is no "declaration before use" requirement at the source level.

```zax
; This is fine — draw_sprite is defined later in the same build
export func main(): void
  draw_sprite 0, 10, 20
end

func draw_sprite(id: byte, x: byte, y: byte): void
  ; ...
end
```

Fixups for forward references to addresses (labels, functions, data symbols) are resolved after all code and data have been placed.

### 10.6 Deterministic Module Ordering

The compiler resolves the full import graph and assigns a deterministic packing order:

1. Dependencies before dependents (topological order).
2. Ties broken by canonical module ID (file stem), alphabetically.
3. Remaining ties broken by a normalized module path (project-relative, `/` separators).

This order controls how each section's contributions from multiple modules are concatenated. The build output is stable and independent of filesystem enumeration order.

### 10.7 Name Resolution Scope Recap

Inside a function body, identifier resolution proceeds in this order:

1. Local labels (scoped to the enclosing `func` or `op` body)
2. Locals and arguments (frame-bound names from the `var` block and parameter list)
3. Module-scope symbols (the global namespace: constants, enums, storage, functions, ops)

An identifier that matches none of these is a compile error.

---

## Chapter 11 — Binary Layout and Hardware Mapping

### 11.1 Sections

ZAX uses three section kinds:

| Section | Contains                                        | Default start address            |
| ------- | ----------------------------------------------- | -------------------------------- |
| `code`  | function bodies, `op` emission                  | `$8000`                          |
| `data`  | initialized storage (`data` declarations, `bin`) | immediately after `code`, aligned to 2 |
| `var`   | uninitialized / zero-initialized storage (`globals`) | immediately after `data`, aligned to 2 |

Each section has an independent location counter. There is no external linker — ZAX resolves everything itself.

### 11.2 Section Directives

```zax
section code at $0000    ; set code section start to $0000
section data at $8000    ; set data section start to $8000
section var  at $A000    ; set var section start to $A000
align 16                 ; advance the current section counter to the next multiple of 16
```

Rules:

- `section <kind> at <addr>`: sets the starting address for that section. May only be done **once per section** — a second `at` for the same section is a compile error.
- `section <kind>` (without `at`): switches the active section without moving its counter. May appear any number of times.
- `align <n>`: advances the current section's location counter to the next multiple of `n`. `n` must be > 0.
- `section` and `align` are module-scope only. They may not appear inside function or `op` bodies.

### 11.3 What Emits Where

Each declaration kind emits to a fixed section regardless of which section is currently selected:

| Declaration | Always emits to |
| ----------- | --------------- |
| `func`      | `code`          |
| `data`      | `data`          |
| `globals`   | `var`           |
| `bin`       | the section named in its `in <kind>` clause |
| `hex`       | absolute addresses in the final image (does not affect any section counter) |

The currently selected section only affects which counter `align` advances and which counter `section <kind> at <addr>` sets. You cannot redirect a `func` into `data` by selecting the `data` section first.

### 11.4 The Overlap Rule

If any two emissions would write a byte to the same absolute address, it is a compile error — regardless of whether the byte values are identical. This catches accidental section collisions before the binary is produced.

### 11.5 `bin` — Embedding External Binaries

`bin` embeds a raw binary file into a named section and binds its start address to a symbol:

```zax
bin sprite_data in data from "assets/sprites.bin"
```

- `in <kind>` is required — there is no default section for `bin`.
- The name (`sprite_data`) becomes an `addr`-typed global symbol bound to the first byte of the embedded blob.
- The path resolves relative to the current source file, then via search paths.

`bin` symbols can be used like any other address symbol:

```zax
func blit_sprites(count: byte): void
  ld hl, sprite_data    ; address of the embedded blob
  ; ...
end
```

### 11.6 `hex` — Placing Intel HEX at Absolute Addresses

`hex` reads an Intel HEX file and places its bytes at the absolute addresses specified in the HEX records:

```zax
hex bios from "rom/bios.hex"
```

- The name (`bios`) is bound to the **lowest address** written by the HEX file, as an `addr`-typed symbol.
- For disjoint HEX ranges, the binding is still the minimum written address across all ranges.
- `hex` output does not advance any section's location counter.
- If the HEX file contains no data records, it is a compile error.

Intel HEX validation rules:

- Only record types `00` (data) and `01` (end-of-file) are supported. Any extended-address record (`02`, `04`, etc.) is a compile error.
- All data record addresses must fit in 16 bits (`$0000..$FFFF`).
- Checksums must be valid. An invalid checksum is a compile error.
- Any `hex`-written byte that overlaps another emission (from any source) is a compile error.

### 11.7 `extern` — Binding Names to External Addresses

Use `extern func` to bind a callable name to an absolute address — typically a BIOS or ROM entry point:

```zax
extern func bios_putc(ch: byte): void at $F003
extern func bios_getc(): byte at $F006
```

- `at <imm16>` is required.
- `extern`-declared names enter the global namespace. Collisions with other symbols are errors.
- `extern func` calls carry **no** compiler-generated register preservation. Assume any register or flag may be clobbered on return. (Clobber annotation syntax is planned — see `docs/zax-spec.md` Appendix F.)

### 11.8 Relative `extern` Blocks for `bin` Entry Points

When a `bin` file contains multiple entry points, you can bind them relative to the blob's base address using an `extern <binName> ... end` block:

```zax
bin legacy in code from "asm80/legacy.bin"

extern legacy
  func legacy_init(): void at $0000
  func legacy_putc(ch: byte): void at $0030
  func legacy_getc(): byte at $0034
end
```

- Each `at <offset>` value is a **byte offset from the bin symbol's base address**, not an absolute address.
- If `legacy` is placed at `$C000`, then `legacy_putc` resolves to `$C030` and `legacy_getc` to `$C034`.
- The resolved absolute addresses are used for `call` emission at the call site.
- Naming convention: prefix with the bin name to avoid collisions (`legacy_putc`, not just `putc`).

### 11.9 Output Files and Gap Fill

The compiler produces an **address→byte map**. When writing a flat `.bin` output:

- Bytes are emitted from the lowest written address to the highest.
- Any unwritten address within that range is filled with `$00` (the gap fill byte).

When writing Intel HEX output:
- Only written bytes appear in output records. Gap addresses are not zero-filled into intermediate records.

The `.lst` file is a deterministic byte dump with an ASCII gutter and symbol table. Sparse unwritten bytes appear as `..` in the hex column. Empty spans are collapsed into `; ... gap $XXXX..$YYYY` markers. For debugger-grade source mapping, use the `.d8dbg.json` (D8M) output.

### 11.10 A Complete Layout Example

```zax
; Place code in ROM, data in ROM, vars in RAM
section code at $0000
section data at $4000
section var  at $8000

; BIOS entry points
extern func bios_cls(): void at $FF00
extern func bios_putc(ch: byte): void at $FF03

; External ROM blobs
bin font_data in data from "assets/font.bin"

; Initialized lookup table in ROM
data
  sin_table: byte[64] = { 0, 12, 25, 37, 49, ... }

; RAM storage
globals
  cursor_x: byte
  cursor_y: byte
  frame_count: word = 0

export func main(): void
  bios_cls
  ; ...
end
```

---

## Chapter 12 — Design Patterns and Structured Systems

### 12.1 Introduction

This chapter demonstrates how ZAX's features combine into practical system-level patterns. Each pattern is self-contained and uses v0.2 syntax throughout — value semantics for scalar globals, qualified enum references, and `op` declarations without parentheses for zero-parameter forms.

---

### 12.2 Pattern 1 — State Machine with `enum` + `select`

The combination of `enum` for symbolic states and `select`/`case` for dispatch is the idiomatic ZAX state machine:

```zax
enum DeviceState Idle, Busy, Error

globals
  state: byte = 0    ; initialized to DeviceState.Idle

func tick(): void
  ld a, state        ; value semantics — no parentheses needed
  select A
  case DeviceState.Idle
    ; check for work, transition to Busy if found
    ld a, DeviceState.Busy
    ld state, a
  case DeviceState.Busy
    ; do work, transition back to Idle when done
    ld a, DeviceState.Idle
    ld state, a
  case DeviceState.Error
    ; latch error, transition to Idle for recovery
    ld a, DeviceState.Idle
    ld state, a
  end
  ret
end
```

Key properties:

- `state` is a scalar global: `ld a, state` and `ld state, a` use value semantics directly — no `(state)` dereference.
- Enum qualification (`DeviceState.Idle`) makes every state name unambiguous even after imports.
- All state transitions are visible at one dispatch site. No hidden transitions elsewhere.
- `select` lowering is bounded compare/branch — no software multiply or jump table at three cases.

---

### 12.3 Pattern 2 — Hardware Register Driver

Typed layout + `op` for polling idioms + explicit function boundaries for ABI-safe entry points:

```zax
type UartRegs
  status:  byte     ; offset 0
  control: byte     ; offset 1
  tx_data: byte     ; offset 2
  rx_data: byte     ; offset 3
end
; sizeof(UartRegs) = pow2(4) = 4

section var at $FF80
globals
  uart: UartRegs

; Bit constants for the status register
const UART_TX_READY = %00000001
const UART_RX_READY = %00000010

op uart_wait_tx
poll_tx:
  ld a, uart.status    ; value semantics — reads the status byte
  and UART_TX_READY
  jr Z, poll_tx
end

op uart_wait_rx
poll_rx:
  ld a, uart.status
  and UART_RX_READY
  jr Z, poll_rx
end

func uart_send(ch: byte): void
  uart_wait_tx         ; inline poll — no call overhead
  ld uart.tx_data, ch  ; write via value semantics
  ret
end

func uart_recv(): byte
  uart_wait_rx
  ld l, uart.rx_data   ; result in L (byte return channel)
  ret
end
```

Key properties:

- Hardware register offsets are derived from the typed `UartRegs` layout. The compiler computes `uart.tx_data` as `uart_base + offsetof(UartRegs, tx_data)` at compile time — no manual offset arithmetic.
- The polling ops expand inline. The emitted inner loop is identical to hand-written assembly.
- `uart_send` and `uart_recv` have typed function boundaries: callee preserves all registers except `HL`. Callers can rely on `BC`, `DE`, `IX`, `IY` surviving across these calls.
- `extern func` would be used instead if the UART driver were a pre-assembled binary at a fixed ROM address.

---

### 12.4 Pattern 3 — Command Dispatch with `select`

Dispatching on a command byte received from hardware or a protocol:

```zax
enum Command CmdNop, CmdRead, CmdWrite, CmdReset, CmdStatus

func handle_command(cmd: byte): byte
  ld a, cmd
  select A
  case Command.CmdNop
    ld l, 0
  case Command.CmdRead
    ; perform read, return result in L
    ld l, 1
  case Command.CmdWrite
    ; perform write
    ld l, 0
  case Command.CmdReset
    ; reset state
    ld l, 0
  case Command.CmdStatus
    ; return status byte
    ld a, status_flags
    ld l, a
  else
    ; unknown command — return error code
    ld l, $FF
  end
  ret
end
```

Key properties:

- All dispatch is in one place. Adding a new command means adding one `case` arm.
- The `else` arm catches any byte value not covered by a `case` — important for protocol robustness.
- `cmd` is a `byte` parameter: it arrives in the low byte of its 16-bit frame slot. `ld a, cmd` reads from the IX-relative slot via compiler lowering.
- No fallthrough between arms. Each arm is isolated.

---

### 12.5 Pattern 4 — Record Array Iteration

Iterating over a fixed-size array of records using a register-based index:

```zax
type Entity
  x:      byte
  y:      byte
  active: byte
  speed:  byte
end
; sizeof(Entity) = pow2(4) = 4  — exactly a power of two, no padding

const MaxEntities = 16

globals
  entities: Entity[MaxEntities]

func update_all(): void
  ld b, MaxEntities     ; loop counter
  ld hl, 0              ; element index (0-based)

loop:
  ld a, entities[HL].active   ; load active flag for entity HL
  or a
  if NZ
    ; entity is active: update position
    ld a, entities[HL].x
    add a, entities[HL].speed
    ld entities[HL].x, a
  end

  inc hl                ; advance index
  djnz loop
  ret
end
```

Key properties:

- `HL` holds the 0-based element index, not a byte offset. The compiler emits the scaling shift chain (`sizeof(Entity) = 4` → two `ADD HL, HL` instructions) for each indexed access.
- Field accesses inside the loop (`entities[HL].active`, `entities[HL].x`) use value semantics — the compiler emits the dereference.
- Because `sizeof(Entity)` is exactly 4, there is no implicit padding and no surprise in `sizeof` or stride.
- `djnz` uses `B` as the counter. Keep `B` free inside the loop body; don't use it for arithmetic without saving first.

---

### 12.6 Pattern 5 — `op` Overload Set for Register-Pair Arithmetic

Building a family of ops that abstract over which register pair is being operated on:

```zax
; 16-bit addition for any register pair destination
op add16(dst: HL, src: reg16)
  add hl, src
end

op add16(dst: DE, src: reg16)
  ex de, hl
  add hl, src
  ex de, hl
end

op add16(dst: BC, src: reg16)
  push hl
  ld h, b
  ld l, c
  add hl, src
  ld b, h
  ld c, l
  pop hl
end

; Clear a register pair
op clr16(dst: HL)
  ld hl, 0
end

op clr16(dst: DE)
  ld de, 0
end

op clr16(dst: BC)
  ld bc, 0
end

func vector_add(ax: word, ay: word, bx: word, by: word): void
  ld hl, ax
  ld de, bx
  add16 HL, DE          ; HL = ax + bx
  ld de, ay
  ld bc, by
  add16 DE, BC          ; DE = ay + by
  ret
end
```

Key properties:

- `add16 HL, DE` selects the `dst: HL` overload — the most direct form, emitting a single `add hl, de`.
- `add16 DE, BC` selects the `dst: DE` overload — using `ex de, hl` to leverage Z80's `add hl, *` instruction.
- `add16 BC, DE` would select the `dst: BC` overload — using `HL` as a scratch register with save/restore.
- Overload resolution is a compile-time decision. No runtime branching on the register pair.

---

### 12.7 Pattern 6 — Interrupt Handler with Layered Abstraction

A safe interrupt handler that preserves state, does minimal work inline, and delegates to a typed function:

```zax
globals
  irq_pending: byte
  irq_count:   word

op save_all
  push af
  push bc
  push de
  push hl
  push ix
  push iy
end

op restore_all
  pop iy
  pop ix
  pop hl
  pop de
  pop bc
  pop af
end

; This function body is the actual ISR — entered via Z80 interrupt vector
; No func declaration here: it is a raw label targeted by the interrupt vector.
; Place it via an explicit extern or section directive in the loader.
func isr_handler(): void
  save_all

  ; Minimal work: set a flag for the main loop to act on
  ld a, 1
  ld irq_pending, a

  ; Increment counter
  ld hl, irq_count    ; value semantics: loads the current count
  inc hl
  ld irq_count, hl    ; store back

  restore_all
  reti                ; raw reti — NOT rewritten to epilogue jump
end
```

Key properties:

- `save_all` and `restore_all` are zero-parameter ops. They expand inline with no call overhead.
- The compiler does not generate a frame for `isr_handler` because it has no parameters and no `var` block — so no IX is clobbered by the prologue.
- `reti` is a raw instruction and is **not** rewritten to the synthetic epilogue jump. This is correct for ISRs. If `isr_handler` had locals, `reti` would be a compile error (it would bypass frame cleanup).
- `irq_pending` and `irq_count` use value semantics for both read and write. The compiler emits the correct loads and stores.
- The main loop checks `irq_pending` by polling:

```zax
export func main(): void
main_loop:
  ld a, irq_pending
  or a
  if NZ
    ld a, 0
    ld irq_pending, a   ; clear the flag
    ; handle the interrupt event
  end
  jr main_loop
end
```

---

### 12.8 Layered Abstraction Model

ZAX rewards a four-level layering model:

| Level    | Tool             | Role                                                         |
| -------- | ---------------- | ------------------------------------------------------------ |
| Micro    | `op`             | Inline sequences that repeat across a function or module — polling loops, save/restore idioms, register-pair arithmetic |
| Callable | `func`           | Boundary-safe units with typed parameters, typed return, callee preservation — the public API surface of a module |
| Domain   | `enum`           | Symbolic names for states, commands, modes — wherever an integer would otherwise be magic |
| Layout   | `type` / `union` | Binary structures that map to hardware registers, protocol packets, sprite tables, file headers |

When deciding which tool to use:

- If it has no call overhead and the body is mechanical: `op`
- If it crosses a module boundary or needs a stable ABI surface: `func`
- If it is a named set of integer constants that appear in `select`/`case`: `enum`
- If it describes a fixed memory layout: `type` or `union`

---

### 12.9 Predictability Checklist

Working in ZAX means keeping the lowering predictable. A few habits help:

- **Design record fields to sum to a power of two.** Implicit padding is legal but adds silent bytes. Either add explicit pad fields or redesign the record.
- **Keep index expressions within the valid index forms.** Only constant, 8-bit register, 16-bit register, `(HL)`, and `(IX/IY±d)` are valid inside `[...]`. Stage any pre-computation into a register first.
- **Establish flags immediately before `if`/`while`/`until`.** The condition is tested at the keyword using whatever flags are current. A `ld` between your compare and your `if` will overwrite the flags silently on Z80.
- **Keep `op` bodies small and mechanical.** If an op body is doing significant work, consider whether a `func` with its typed boundary guarantees would be clearer.
- **Use `sizeof` and `offsetof` everywhere.** Never hardcode a field offset. If the type changes, the built-ins update automatically.
- **Use qualified enum names everywhere.** `Mode.Run` everywhere, never bare `Run`. Unqualified references are compile errors in v0.2 — this is enforced, not advisory.
- **Check the `.asm` or `.lst` output when something looks wrong.** The lowered trace shows exactly what the compiler emitted. The IX byte-lane shuttle (`ex de, hl` / `ld e, (ix+d)` / ...) is particularly visible here.
- **Treat `docs/zax-spec.md` as the final authority.** This guide is instructional; the spec is normative.

