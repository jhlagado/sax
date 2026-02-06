# ZAX Starting Point

This document is a single, opinionated starting point that synthesizes the current design discussion for **ZAX**: the Z80-family instance of the broader **SAX** (“Structured Assembler”) category. It is intended to seed a fuller specification.

For the implementable first draft spec, see `docs/sax-spec.md`.

---

## 1. Purpose and Scope

**SAX** is a CPU-agnostic category: a family of structured assemblers that compile directly to native machine code while keeping assembly-like semantics. **ZAX** is the Z80-family instance. It provides Pascal‑ and C‑style structure (clear control flow, procedures, simple scoping) without losing proximity to hardware.

**In scope**
* Structured control flow (`IF/ELSE`, `WHILE`, `REPEAT/UNTIL`, `FOR`).
* Procedures with explicit calling conventions.
* Minimal type annotations for byte/word and address clarity.
* Clear memory model and stack‑frame conventions.

---

## 2. Design Philosophy

* **High‑level structure, low‑level semantics.**
* **Registers are first‑class.** Register names are visible and directly used.
* **Flat, low‑nesting feel.** Structure is semantic, not a macro veneer.
* **No recursion.** Keep control flow and stack usage predictable.
* **Compiler, not preprocessor.** Parse to an AST and emit code with fixups.

---

## 3. Registers and Data Width

**Registers**
* 8‑bit: `A, B, C, D, E, H, L`
* 16‑bit: `HL, DE, BC`
* Indirect: `(HL)`, `(IX+d)`, `(IY+d)`

**Default width**
* All variables and stack arguments are **16‑bit by default**.
* Byte access must be explicit.

**Explicit width access**
* `word [addr]` fetch/store 16‑bit
* `byte [addr]` fetch/store 8‑bit
* `low(x)` / `high(x)` accessors for low/high byte

---

## 4. Memory and Variables

ZAX distinguishes:
* **Code**
* **Initialized data**
* **Uninitialized data**

Variable categories:
* **Global** (static storage, default word)
* **Local** (stack‑allocated, default word)
* **Arguments** (stack‑passed, default word)

All locals/args are 16‑bit words unless explicitly declared as byte.

**Declaration scope rule**
* `type`, `const`, and `enum` are **module‑scope only**.
* Function bodies allow **`var` declarations only**, followed by pure `asm`.

**Semicolon‑free syntax**
* `;` is the comment delimiter (assembly‑style).
* No semicolons are used for termination.
* Newlines terminate declarations and directives.
* Any **multi‑line construct must be wrapped in `{ ... }`**.

---

## 4.1 Module File Structure (Sections)

At module scope, sections act as **delimiters**. Each section switches parsing mode.

Allowed top‑level sections (order is flexible unless otherwise noted):
* `module` (optional, must be first if present)
* `import`
* `type`
* `enum`
* `const`
* `var`
* `data`
* `func` (function declarations)

Rules:
* Declarations are **one per line**.
* No inner functions.
* `var` and `data` define storage; `func` defines code.
* `asm` only appears **inside** a function body.
* `export` is **inline only** (no separate export section).
* `import` accepts a **module ID** (default) or a **quoted file path**.
* External symbols and binary includes are module‑scope declarations (see below).

**Directive/declaration style (standardized)**
To keep syntax predictable, ZAX uses a small set of clause keywords across declarations:
* `from "<path>"` specifies a file source.
* `in <section>` specifies which section receives emitted bytes.
* `at <expr>` binds a name to an absolute address or computed address.

This yields consistent forms:
```
import IO
import "vendor/legacy_io.zax"

section code at $8000
align 2

bin legacy in code from "asm80/legacy.bin"
hex bios from "rom/bios.hex"

extern func bios_putc(ch: byte): void at $F003
```

**External code/data and binary includes**
To interop with external assemblers (e.g., asm80), ZAX supports:
* `bin` / `hex` declarations to **emit raw bytes** into a target segment and bind a name to the base address.
* `extern func` declarations to bind callable names to absolute addresses or offsets within a `bin`/`hex` include.
* `extern <binName> { ... }` blocks to bind multiple entry points **relative to a `bin` base**.
* Names declared inside an `extern <binName> { ... }` block are regular top‑level symbols; to avoid collisions, prefer the convention `<binName>_name` (e.g., `legacy_putc`).

Example patterns:
```
bin legacy in code from "legacy.bin"    ; legacy: addr (base of blob)
extern legacy {
  func legacy_init(): void at $0000
  func legacy_putc(ch: byte): void at $0030
}

hex bios from "rom/bios.hex"            ; writes bytes at absolute addresses from HEX records
extern func bios_print(ch: byte): void at $F003
```

---

## 5. Control Flow (Structured)

ZAX supports structured control flow inside function bodies (within `asm` blocks). These constructs compile to labels and conditional/unconditional jumps.

Core forms:
* `if <cc> { ... } else { ... }`
* `while <cc> { ... }`
* `repeat { ... } until <cc>`
* (Optional) `for` (defer until needed)

Rules:
* Conditions are **flag-based** (assembly-style). `<cc>` is one of: `Z NZ C NC M P` (extend later if needed).
* Control-flow keywords are only recognized inside `asm` blocks.
* No user labels; the compiler generates hidden labels for structured blocks.
* No GOTO in the core language (possible future extension).
* Minimal nesting encouraged; syntax should compile to straightforward branch sequences.

**Flag-based conditions**
ZAX does not introduce expression-based boolean conditions. Instead, structured control flow branches on CPU flags that are set by the immediately preceding instructions, just like hand-written Z80.

Condition codes (v1):
* `Z` / `NZ`: zero flag set / not set
* `C` / `NC`: carry flag set / not set
* `M` / `P`: sign flag set (minus) / not set (plus)

The programmer is responsible for establishing flags before the control-flow statement. Typical flag-setting idioms:
* Test `A` for zero/non-zero: `or a` (sets Z if A==0)
* Compare `A` to an immediate: `cp 10` (sets Z/C/M based on `A-10`)
* Compare two registers via `cp r` (for 8-bit comparisons)
* 16-bit comparisons are typically sequences (e.g., compare high bytes then low bytes); ZAX does not hide this in v1.

**Lowering model (what the compiler emits)**
These forms are syntax for generating hidden labels and jumps:
* `if <cc> { T } else { F }` lowers to a conditional branch around `T` or into `F`.
* `while <cc> { B }` lowers to a loop header label, a conditional exit branch, then a back-edge jump.
* `repeat { B } until <cc>` lowers to a body label, then a conditional exit branch (post-test).

No flags or registers are implicitly modified by the control-flow construct itself; only your surrounding Z80 instructions affect flags.

**Examples**
```
; if A == 0 then ...
or a
if Z {
  ; A was zero
} else {
  ; A was non-zero
}

; while C is clear (e.g., after a compare)
cp 10
while NC {
  ; ...
  cp 10
}

; repeat-until A becomes zero
repeat {
  dec a
  or a
} until Z
```

---

## 6. Procedures and Calls

**Syntax model (TypeScript‑style)**
* Type annotations use `name: type`.
* Blocks use `{ ... }`.
* Function declarations use `func` and type‑annotated parameters.

Example signature:
```
func add(a: word, b: word): word {
  ; raw Z80 mnemonics only
  ld hl, (a)
  add hl, (b)
  ret
}
```

**Function body template**
```
func name(a: word, b: word): word {
  var
    temp: word
    flag: byte
  asm
    ; Z80 mnemonics + structured control flow
    ; (structured control flow compiles to hidden labels + jumps)
    ...
}
```

**Syntax (opcode‑style)**
```
myproc HL, DE
```

**Calling convention (C‑style)**
* Caller pushes args right-to-left (last argument pushed first; 16‑bit each).
* Caller cleans up after return.
* Return values:
  * 16‑bit in `HL`
  * 8‑bit in `L`
  * (Optional) 32‑bit in `HL:DE`

**Registers are preserved only if specified.** By default, the callee is free to clobber registers unless it declares a preservation set.

---

## 6.1 `op` (Inline Macro-Instructions)

ZAX also supports `op` declarations: **opcode-like inline macros** that expand to Z80 mnemonics at compile time.

Goals:
* Keep call sites opcode-like.
* Allow operand-driven implementations (because Z80 has implicit accumulators like `A`/`HL`).
* Keep compiler-level matching confined to `op` (functions use explicit control flow).

**Definition**
* `op` expands inline (no call/ret).
* Parameters are **typed operands** (AST operands), not text.
* Operands are substituted structurally into emitted mnemonics.
* Multiple `op` declarations with the same name are allowed; the compiler selects the best match based on operand classes and fixed-register patterns.

**Operand matcher types (patterns)**
`op` parameters use matcher types that constrain what the call site may supply:
* `reg8` / `reg16` (register operands)
* `imm8` / `imm16` (immediate values: literals, `const`, `enum` values, simple expressions)
* `mem8` / `mem16` (dereferenced memory operands: `(expr)` where width is known)
* `ea` (effective address expressions: symbols, `rec.field`, `arr[i]`, pointer-ish address arithmetic; i.e., something you can take the address of without dereferencing)
* Fixed-register matchers like `HL`, `DE`, `BC`, `A` may be used as patterns for accumulator-shaped ops.

Notes:
* Matchers are about **shape**, not runtime type checks.
* A call site can pass registers *or* values depending on the matcher (e.g., `src: imm16` vs `src: reg16`).

**Matcher definitions and examples**
`reg8`
* Matches one of: `A B C D E H L`
* Example call: `inc8 A`

`reg16`
* Matches one of: `HL DE BC SP` (and optionally `IX/IY` if you ever enable them)
* Example call: `mov16 DE, HL`

`imm8` / `imm16`
* Matches a compile-time constant expression.
* Allowed forms (v1): literals (`42`, `$2A`), `const`/`enum` names, `+ - * /` with other `imm` values, and parentheses.
* Examples:
  * `add8 A, 1`
  * `add16 HL, MaxValue + 2`

`ea` (effective address)
* Matches an expression that denotes an address (not a dereferenced value).
* Allowed forms (v1):
  * storage symbols: globals in `var`, items in `data`, `bin` base names
  * record fields: `hero.x`
  * array elements: `table[8]`, `table[C]`, `grid[B][C]`
  * address arithmetic with constants: `buffer + 16`, `legacy + $0030`
* Examples:
  * `lea HL, table[8]`
  * `lea DE, hero.flags`

`mem8` / `mem16`
* Matches a dereference operand written as `(ea)`.
* Width is determined by the matcher:
  * `mem8` reads/writes 1 byte
  * `mem16` reads/writes 2 bytes (little endian)
* Examples:
  * `load8 A, (banner[2])`
  * `load16 HL, (table[C])`

**Autosave clobber policy**
To keep expansions transparent, `op` uses **autosave**:
* An `op` expansion must preserve all registers and flags **except** the instruction's explicit destination(s).
* The compiler may use scratch registers and `push`/`pop` internally, but the net stack delta must be zero.
* This is required because function locals/args are SP-relative; the compiler tracks stack depth during expansion.

Tradeoff:
* Autosave makes `op` feel like a real instruction but can be slower than handwritten sequences. A future `unsafe op` could relax preservation rules if needed.

**`op` usage inside `asm` and inside other `op`s**
* In any `asm` stream (inside `func` or `op`), a line may be either:
  * a raw Z80 mnemonic, or
  * an `op` invocation (which expands inline).
* `op`s may call other `op`s. The compiler must detect and reject cyclic expansions.

**Examples**
```
op add16(dst: HL, src: reg16) {
  asm
    add hl, src
}

op add16(dst: DE, src: reg16) {
  asm
    ; autosave scratch + flags as needed
    ex de, hl
    add hl, src
    ex de, hl
}

op lea(dst: reg16, src: ea) {
  asm
    ; compute address of src into dst
    ld dst, src
}

op load16(dst: reg16, src: mem16) {
  asm
    ; conceptually: dst = *(word*)src
    ; compiler may expand and autosave as needed
    ld dst, src
}

op store16(dst: mem16, src: reg16) {
  asm
    ; conceptually: *(word*)dst = src
    ld dst, src
}

op add16(dst: HL, src: imm16) {
  asm
    ; expand via a scratch regpair if needed
    ; (autosave policy applies)
    add16 HL, DE
}

; call sites look like opcodes
add16 HL, DE
add16 DE, BC
lea HL, table[C]
load16 BC, (table[8])
store16 (table[C]), HL
```

## 7. Stack Frames and Locals

**No base pointer**
* ZAX uses `SP`‑relative addressing with known counts of locals and args.
* Offsets are computed in `HL`, then added to `SP`.

**Access pattern (SP‑relative)**
* The compiler knows:
  * number of local variables
  * number of formal arguments
* Locals and arguments are addressed by **SP + constant offset**.
* The offset is computed in `HL`, then added to `SP`:
  * `HL = offset`
  * `HL = HL + SP`
  * access `[HL]` (or `[HL+1]` for word high byte)

**Stack layout (conceptual)**
* `SP` points to the top of the local area.
* The **last local** is at `SP + 2`.
* The **first local** is at `SP + (locals * 2)`.
* The **return address** is immediately above locals.
* Formal arguments follow above the return address.

This SP‑relative scheme is the default and preferred model in ZAX.

---

## 8. Types (Minimal)

ZAX supports **compile‑time annotations** only. Types exist to define layout, width, and intent. There are no runtime checks by default.

**Built‑in scalar types**
* `byte` (8‑bit, unsigned)
* `word` (16‑bit, unsigned)
* `addr` (16‑bit address)
* `ptr` (16‑bit pointer; may be parameterized later, e.g., `ptr<word>`)

**Type declarations (module‑scope only)**
ZAX uses a simple `type` alias and `enum` declarations:
```
type Index byte
type WordPtr ptr
enum Mode { Read, Write, Append }
```

**Arrays (nested, C‑style)**
* Arrays are declared as nested fixed-size arrays: `T[rows][cols]` (not `T[rows, cols]`).
* Indexing is nested postfix: `a[r][c]`.
* Layout is contiguous **row‑major** (C‑style): `a[r][c]` addresses `base + (r*COLS + c) * sizeof(T)`.
* For v1, indices inside `[]` should be simple (constant, 8‑bit register, or `(HL)`).
* Arrays are **0-based**. Valid indices are `0..len-1`. No runtime bounds checks are emitted by default.

**Records (structs)**
Records are compile-time layout descriptions (like C structs).

Syntax:
```
type Sprite {
  x: word
  y: word
  w: byte
  h: byte
  flags: byte
}
```

Layout rules (v1):
* Fields are laid out in source order.
* Default layout is **packed** (no implicit padding).
* `byte` fields consume 1 byte; `word` fields consume 2 bytes (little endian when accessed as a word).
* If alignment is required, it must be explicit (e.g., via `align` directives around storage, or a future `aligned(N)` type wrapper).

**Address expressions: arrays and fields**
* `name` (for `var`, `data`, `bin`) denotes the **address** of the storage.
* `const` and `enum` names denote immediate values.
* `rec.field` denotes the **address** of the field.
* `arr[i]` denotes the **address** of the element.
* Parentheses dereference memory in operands: `(expr)` means “memory at address `expr`”.
* Dereference width is implied by the instruction operand size:
  * `LD A, (expr)` reads a byte.
  * `LD HL, (expr)` reads a word.
  * `LD (expr), HL` writes a word.

**Enums**
* `enum { A, B, C }` defines sequential constants starting at 0.
* Enum values default to `byte` if count ≤ 256, else `word`.
* Enums are distinct type names for readability; no runtime checks.

**Type vs interface**
* ZAX has **no `interface`** concept.  
* A single `type` system is used for layout and annotations only.
* This keeps the language small and avoids a second, overlapping type mechanism.

---

## 9. Compilation Model

* Parse whole program into AST and symbol table.
* Emit code with forward‑reference fixups.
* No macros or textual substitution.
* Workflow: **edit → full recompile → run**.

Outputs:
* Binary image
* Optional HEX
* Optional listing with symbols for Debug80

---

## 10. Naming

Names:
* **SAX** = “Structured Assembler” (CPU-agnostic category).
* **ZAX** = Z80-family SAX instance (this project).
* File extension for ZAX source: `.zax`.

---

## 11. Open Questions (Next Decisions)

* Confirm opcode‑style call syntax vs explicit `call`.
* Decide if `FOR` is core or optional.
* Clarify register preservation rules.
* Decide whether self‑describing frames are enabled by default.

---

## 12. Next Steps

* Expand this into a full specification (syntax, grammar, examples).
* Write 2–3 example programs to validate the calling convention.
* Define a precise stack layout table with offsets and sizes.

---

## 13. Representative Module Example

This example exercises **imports/exports, types, enums, consts, vars, data, and functions**.

```
module Math

import IO
import Mem
	import "vendor/legacy_io.zax"

type Index byte
type WordPtr ptr

enum Mode { Read, Write, Append }

type Sprite {
  x: word
  y: word
  w: byte
  h: byte
  flags: byte
}

export const MaxValue = 1024
const TableSize = 8

var
  total: word
  mode: byte
  hero: Sprite

data
  table: word = { 1, 2, 3, 4, 5, 6, 7, 8 }
  banner: byte = { 72, 69, 76, 76, 79 } ; "HELLO"

bin legacy in code from "asm80/legacy.bin"
extern legacy {
  func legacy_print(msg: addr): void at $0000
  func legacy_read(out: addr): void at $0040
}

export func add(a: word, b: word): word {
  var
    temp: word
  asm
    ld hl, (a)
    add hl, (b)
    ld (temp), hl
    ld hl, (temp)
    ret
}

export func mul(a: word, b: word): word {
  asm
    ; naive multiply (placeholder)
    ld hl, 0
    ret
}

func demo(): word {
  asm
    ; imported functions are callable like opcodes
    print HL
    read DE
    ; code inside an included binary can be called by extern-bound name
    legacy_print HL
    ; record field access is address arithmetic + dereference
    ld hl, (hero.x)
    ; structured control flow uses flag conditions
    or a
    if Z {
      ; ...
    } else {
      ; ...
    }
    ret
}
```
