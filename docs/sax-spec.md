# ZAX Language Specification (Draft v0.1)

This document is the tight, implementable first draft specification for **ZAX**: the Z80-family instance of the broader **SAX** (“Structured Assembler”) category.

SAX is intended to be a CPU-agnostic *category* of structured assemblers; each concrete instance targets a specific CPU family and defines its instruction set, registers, and calling convention. **ZAX** is the Z80-family instance. ZAX source files use the `.zax` extension.

ZAX combines:
* module-scope declarations (`type/enum/const/var/data`, imports, extern bindings)
* function declarations with locals
* `asm` bodies containing Z80 mnemonics, `op` invocations, and flag-based structured control flow

This spec intentionally avoids “future ideas”; anything not defined here is undefined behavior or a compile error.

---

## 1. Lexical Rules

### 1.1 Whitespace and Newlines
* In non-`asm` regions, **newlines terminate** declarations and directives.
* In `asm` regions, newlines terminate instructions/keywords.
* Spaces/tabs separate tokens.

### 1.2 Comments
* `;` starts a comment that runs to end of line.
* Comments are allowed everywhere.

### 1.3 Identifiers
* Identifier grammar: `[A-Za-z_][A-Za-z0-9_]*`
* Z80 mnemonics and register names are matched **case-insensitively**.
* User-defined symbol names are **case-sensitive**.

### 1.4 Literals
* Decimal integer: `123`
* Hex integer: `$2A`, `$8000`
* Binary integer: `%1010`, `0b1010`
* Char literal: `'A'` (an `imm8`)
* String literal: `"TEXT"` (only valid in `data` initializers; emits bytes, no terminator)

Escapes in string/char literals:
* `\\`, `\"`, `\'`, `\n`, `\r`, `\t`, `\0`, `\xNN`

---

## 2. Program Structure

### 2.1 Module File
A compilation unit is a module file containing:
* optional `module` header
* zero or more `import` lines
* module-scope declarations: `type`, `enum`, `const`, `var`, `data`, `bin`, `hex`, `extern`
* zero or more `func` and `op` declarations

No nested functions are permitted.

### 2.2 File Extension
ZAX source files use the `.zax` extension.

### 2.3 Sections and Location Counters
ZAX produces a final image by **packing per-section** across all imported modules (no external linker).

Section kinds:
* `code`
* `data`
* `bss`

Each section has an independent location counter.

Directives:
* `section <name> at <imm16>`: selects section and sets its starting address.
* `section <name>`: selects section without changing its current counter.
* `align <imm>`: advances the current section counter to the next multiple of `<imm>`.

Packing order:
1. Resolve imports and determine a deterministic module order (topological; ties broken by module ID/path string).
2. For each section kind in fixed order `code`, `data`, `bss`, concatenate module contributions in module order.
3. Within a module, preserve source order within each section.

Default placement (if not specified):
* `code at $8000`
* `data` begins immediately after `code`, aligned to 2
* `bss` begins immediately after `data`, aligned to 2

---

## 3. Imports and Name Resolution

### 3.1 Import Syntax
* `import <ModuleId>`
* `import "<path>"`

`<ModuleId>` is resolved via the compiler’s search path (project + standard modules). In v0.1, a `ModuleId` maps to a file named `<ModuleId>.zax` on the search path.

`import "<path>"` loads a module from an explicit path. For v0.1, quoted paths should include the `.zax` extension and are resolved relative to the importing file (then search paths, if not found).

### 3.2 Visibility and Collisions
* In v0.1, all module-scope names are exported (public). The `export` keyword is accepted for `const` and `func` declarations for clarity and future compatibility, but it does not affect visibility in v0.1.
* All names from an imported module are brought into the importing module’s global namespace.
* The program has a single global namespace across all modules.
* Any symbol collision is a compile error (no implicit renaming):
  * two modules export the same name
  * an import conflicts with a local symbol
  * `bin` base names and `extern` names must also be unique

---

## 4. Types, Enums, Consts

Types exist for layout/width/intent only. No runtime type checks are emitted.

### 4.1 Built-in Scalar Types
* `byte` (8-bit unsigned)
* `word` (16-bit unsigned)
* `addr` (16-bit address)
* `ptr` (16-bit pointer; treated as `addr` for codegen)
* `void` (function return type only)

### 4.2 Type Aliases
Syntax:
```
type Name byte
type Ptr16 ptr
```

### 4.3 Enums
Syntax:
```
enum Mode { Read, Write, Append }
```

Semantics:
* Enum members are sequential integers starting at 0.
* Storage width is `byte` if member count ≤ 256, else `word`.
* Enum names and members are immediate values usable in `imm` expressions.

### 4.4 Consts
Syntax:
```
const MaxValue = 1024
export const Public = $8000
```

* `const` values are compile-time `imm` expressions.
* `export` is inline only (e.g., `export const ...`, `export func ...`).

---

## 5. Arrays and Records

### 5.1 Arrays (Nested, 0-based)
Arrays are nested fixed-size arrays:
* `T[n]` is an array of `n` elements of `T`.
* Multidimensional arrays are nested: `T[r][c]`.

Indexing:
* `a[i]` denotes the **effective address** of element `i` (not a dereference).
* Arrays are **0-based**: valid indices are `0..len-1`. No runtime bounds checks are emitted.

Layout:
* Arrays are contiguous, row-major (C style).
* `a[r][c]` addresses `base + (r*COLS + c) * sizeof(T)`.

Index forms (v1):
* constant immediate
* 8-bit register
* `(HL)` (byte read from memory at `HL`)

### 5.2 Records (Packed Structs)
Record types are layout descriptions:
```
type Sprite {
  x: word
  y: word
  w: byte
  h: byte
  flags: byte
}
```

Layout rules:
* Fields are laid out in source order.
* Default layout is packed (no implicit padding).
* `byte` fields are 1 byte; `word` fields are 2 bytes.

Field access:
* `rec.field` denotes the **effective address** of the field.

---

## 6. Storage Declarations: `var`, `data`, `bin`, `hex`, `extern`

### 6.1 Address vs Dereference
* Storage symbols (`var`, `data`, `bin`) denote **addresses** when used as operands.
* Parentheses dereference memory: `(ea)` denotes memory at address `ea`.
* Dereference width is implied by the instruction operand size:
  * `LD A, (ea)` reads a byte
  * `LD HL, (ea)` reads a word
  * `LD (ea), HL` writes a word

### 6.1.1 Lowering of Non-Encodable Operands
Many `ea` forms (locals/args, `rec.field`, `arr[i]`, and address arithmetic) are not directly encodable in a single Z80 instruction. In these cases, the compiler lowers the instruction to an equivalent instruction sequence.

Lowering rules (v0.1):
* The observable effect must match the abstract meaning of the original instruction and operands.
* If the original instruction does not modify flags (e.g., `LD`), the lowered sequence must preserve flags.
* The lowered sequence must preserve registers other than the instruction’s explicit destination(s).
* Any internal stack usage must have net stack delta 0.

### 6.2 `var` (Uninitialized Storage)
Syntax:
```
var
  total: word
  mode: byte
```

* Declares storage in `bss`.
* One declaration per line; no initializers.

### 6.3 `data` (Initialized Storage)
Syntax:
```
data
  table: word = { 1, 2, 3, 4 }
  banner: byte = "HELLO"
  bytes: byte = { $00, $01, $FF }
```

Initialization:
* `byte = { imm8, ... }` emits bytes.
* `word = { imm16, ... }` emits little-endian words.
* `byte = "TEXT"` emits the ASCII bytes of the string, no terminator.

### 6.4 `bin` / `hex` (External Bytes)
`bin` emits a contiguous byte blob into a target section and binds a base name to its start address:
```
bin legacy in code from "asm80/legacy.bin"
```

* The name `legacy` becomes an address-valued symbol of type `addr`.

`hex` reads Intel HEX and emits bytes at absolute addresses specified by records:
```
hex bios from "rom/bios.hex"
```

### 6.5 `extern` (Binding Names to Addresses)
Bind callable names to absolute addresses:
```
extern func bios_putc(ch: byte): void at $F003
```

Bind multiple entry points relative to a `bin` base:
```
bin legacy in code from "asm80/legacy.bin"
extern legacy {
  func legacy_init(): void at $0000
  func legacy_putc(ch: byte): void at $0030
}
```

`extern`-declared names are normal global symbols; collisions are errors. Prefer `<binName>_name` conventions (e.g., `legacy_putc`).

---

## 7. Expressions

Expressions are used in `imm` and `ea` contexts.

### 7.1 `imm` (Immediate) Expressions
Allowed:
* numeric literals, char literals
* `const` and `enum` names
* operators: unary `+ - ~`, binary `* / % + - & ^ | << >>`
* parentheses for grouping

### 7.2 `ea` (Effective Address) Expressions
`ea` denotes an address, not a value. Allowed:
* storage symbols: `var` names, `data` names, `bin` base names
* function-scope symbols: argument names and local `var` names (as SP-relative stack slots)
* field access: `rec.field`
* indexing: `arr[i]` and nested `arr[r][c]` (index forms as defined above)
* address arithmetic: `ea + imm`, `ea - imm`

Conceptually, an `ea` is a base address plus a sequence of **address-path** segments: `.field` selects a record field, and `[index]` selects an array element. Both forms produce an address; dereference requires parentheses as described in 6.1.

---

## 8. Functions (`func`)

### 8.1 Declaration Form
Syntax:
```
export func add(a: word, b: word): word {
  var
    temp: word
  asm
    ld hl, (a)
    add hl, (b)
    ret
}
```

Rules:
* Module-scope only; no inner functions.
* Inside a function body:
  * optional `var` block (locals, one per line)
  * required `asm` block
* `asm` blocks may contain Z80 mnemonics, `op` invocations, and structured control flow (Section 10).

### 8.2 Calling Convention
* Arguments are passed on the stack, each argument occupying 16 bits.
* Caller pushes arguments right-to-left (last argument pushed first).
* Caller cleans up the arguments after return.
* Return values:
  * 16-bit return in `HL`
  * 8-bit return in `L`

Notes (v0.1):
* Arguments are stack slots, regardless of declared type. For `byte` parameters, the low byte carries the value and the high byte is ignored (recommended: push a zero-extended value).
* `void` functions return no value.

### 8.3 Calling Functions From `asm`
Inside an `asm` block, a line starting with a function name invokes that function.

Syntax:
* `name` (call with zero arguments)
* `name <arg0>, <arg1>, ...` (call with arguments)

Argument values (v0.1):
* `reg16`: passed as a 16-bit value.
* `reg8`: passed as a zero-extended 16-bit value.
* `imm` expression: passed as a 16-bit immediate.
* `ea` expression: passed as the 16-bit address value.
* `(ea)` dereference: reads from memory and passes the loaded value (word or byte depending on the parameter type; `byte` is zero-extended).

Calls follow the calling convention in 8.2 (compiler emits the required pushes, call, and any temporary saves/restores).

### 8.4 Stack Frames and Locals (SP-relative, no base pointer)
* ZAX does not use `IX`/`IY` as a frame pointer.
* Locals and arguments are addressed as `SP + constant offset` computed into `HL`.
* The compiler knows local/arg counts from the signature and `var` block.

At the start of the user-authored `asm` block, the compiler has already reserved space for locals (if any) by adjusting `SP` by the local frame size. The local frame size is the packed byte size of locals rounded up to an even number of bytes.

Conceptual layout at the start of `asm`:
* locals occupy space at the top of the frame (if any), starting at `SP + 0`
* return address is at `SP + <frameSize>`
* arguments follow the return address

Argument offsets (given `argc` arguments and local frame size `frameSize`):
* The first argument (`0`) is closest to the return address.
* Argument `i` (0-based) is at `SP + frameSize + 2 + 2*i`.

The compiler tracks stack depth across the `asm` block to keep SP-relative locals/args resolvable.

### 8.5 SP Mutation Rules in `asm`
The compiler tracks SP deltas for:
* `push`, `pop`, `call`, `ret`, `rst`, `ex (sp), hl`

Other SP-mutating instructions are compile errors in v0.1 (e.g., `ld sp, hl`, `add sp, n`, `inc sp`, `dec sp`).

Stack-depth constraints (v0.1):
* At any structured-control-flow join (end of `if`/`else`, loop back-edges, and loop exits), stack depth must match across all paths.
* The net stack delta of an `op` expansion must be 0.

---

## 9. `op` (Inline Macro-Instructions)

### 9.1 Purpose
`op` defines opcode-like inline macros with compiler-level operand matching. This is used to express accumulator-shaped instruction families and provide ergonomic “opcode-like functions.”

### 9.2 Declaration Form
Syntax:
```
op add16(dst: HL, src: reg16) {
  asm
    add hl, src
}

op add16(dst: DE, src: reg16) {
  asm
    ex de, hl
    add hl, src
    ex de, hl
}
```

Rules:
* `op` is module-scope only.
* `op` bodies contain an `asm` stream.
* `op` invocations are permitted inside `asm` streams of `func` and `op`.
* Cyclic `op` expansion is a compile error.

### 9.3 Operand Matchers
`op` parameters use matcher types (patterns). These constrain call-site operands.

Scalar/register matchers:
* `reg8`: `A B C D E H L`
* `reg16`: `HL DE BC SP`
* fixed register patterns: `A`, `HL`, `DE`, `BC` as matchers

Immediate matchers:
* `imm8`, `imm16`: compile-time immediate expressions (Section 7.1)

Address/deref matchers:
* `ea`: effective address expressions (Section 7.2)
* `mem8`, `mem16`: dereference operands written as `(ea)` with implied width

### 9.4 Overload Resolution
* `op` overloads are selected by best match on matcher types and fixed-register patterns.
* If no overload matches, compilation fails.
* If multiple overloads match equally, compilation fails (ambiguous).

### 9.5 Autosave Clobber Policy
To keep `op` expansions transparent:
* An `op` expansion must preserve all registers and flags **except** explicit destination(s).
* The compiler may use scratch registers and `push/pop` internally.
* Net stack delta must be zero.

The simplest implementation is permitted: always preserve flags (save/restore `AF`) unless `AF` is an explicit destination.

---

## 10. Structured Control Flow in `asm` (Flag-Based)

ZAX supports structured control flow only inside `asm` blocks. Conditions are flag-based; the user establishes flags using normal Z80 instructions.

### 10.1 Condition Codes (v0.1)
* `Z` / `NZ`: zero flag set / not set
* `C` / `NC`: carry flag set / not set
* `M` / `P`: sign flag set (minus) / not set (plus)

### 10.2 Forms
* `if <cc> { ... } else { ... }`
* `while <cc> { ... }`
* `repeat { ... } until <cc>`

These forms lower to compiler-generated hidden labels and conditional/unconditional jumps. Control-flow constructs do not themselves set flags.

Notes:
* `else { ... }` is optional.

Condition evaluation points (v0.1):
* `if <cc> { ... }`: `<cc>` is evaluated at the `if` keyword using the current flags.
* `while <cc> { ... }`: `<cc>` is evaluated at the `while` keyword on entry and after each iteration. The back-edge jumps to the `while` keyword.
* `repeat { ... } until <cc>`: `<cc>` is evaluated at the `until` keyword using the current flags.

### 10.3 Examples
```
; if A == 0 then ...
or a
if Z {
  ; ...
} else {
  ; ...
}

; repeat-until A becomes zero
repeat {
  dec a
  or a
} until Z
```

---

## 11. Example Module

```
module Math

import IO
import Mem
import "vendor/legacy_io.zax"

enum Mode { Read, Write, Append }

type Index byte
type WordPtr ptr

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
  banner: byte = "HELLO"

bin legacy in code from "asm80/legacy.bin"
extern legacy {
  func legacy_print(msg: addr): void at $0000
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

func demo(): word {
  asm
    print HL
    legacy_print HL
    ld hl, (hero.x)
    or a
    if Z {
      ; ...
    } else {
      ; ...
    }
    ret
}
```
