# ZAX Language Specification (Draft v0.1)

This document is the implementable first draft specification for **ZAX**, a structured assembler for the Z80 family. It is written for humans: it introduces concepts in the same order you’ll use them when writing ZAX.

ZAX aims to make assembly code easier to read and refactor by providing:

- file structure (`import`, declarations)
- simple layout types (arrays/records/unions) used for addressing
- functions with stack arguments and optional locals
- structured control flow inside function/op instruction streams (`if`/`while`/`repeat`/`select`)
- `op`: inline “macro-instructions” with operand matching

Anything not defined here is undefined behavior or a compile error in v0.1.

---

## 0. Overview (Non-normative)

This section is explanatory and does not define behavior.

### 0.1 Purpose

ZAX compiles structured, assembly-like source directly to Z80-family machine code while keeping low-level semantics and explicit register usage.

ZAX is not a “high-level language”. It is still assembly: you choose registers, you manage flags, you decide what lives in RAM vs ROM. The language adds structure and names to make those decisions readable.

### 0.2 A First ZAX File (Non-normative)

```
const MsgLen = 5

data
  msg: byte[5] = "HELLO"

extern func bios_putc(ch: byte): void at $F003

export func main(): void
  var
    p: addr
  end
  ld hl, msg
  ld (p), hl
  ld b, MsgLen
  repeat
    ld hl, (p)
    ld a, (hl)
    inc hl
    ld (p), hl
    push bc
    bios_putc A
    pop bc
    dec b
	  until Z
end
```

Key ideas this demonstrates:

- `data` emits bytes; `var` reserves addresses (emits no bytes).
- `rec.field` and `arr[i]` are effective addresses; when the resulting type is scalar, `LD` and call arguments treat them as values (compiler inserts loads/stores).
- Structured control flow exists only inside function/op instruction streams.

### 0.3 Design Philosophy

- **High-level structure, low-level semantics.** You still choose registers and manage flags.
- **Registers are first-class.** Register names appear directly in code.
- **No significant whitespace.** Multi-line constructs use explicit terminators (`end`, `until`).
- **Compiler, not preprocessor.** ZAX parses to an AST and emits code with fixups — no textual macros.

### 0.4 Compilation Model

Workflow: edit → full recompile → run.

The compiler parses the whole program, resolves forward references, and emits:

- A flat binary image
- Optionally, Intel HEX output
- Optionally, a listing with symbols (for debuggers/simulators — see Appendix B)

Implementation note (non-normative): `docs/assembler-pipeline.md` maps these stages to the current source files.

### 0.5 Entry Point (Non-normative)

Entry-point selection is outside v0.1 scope. A typical convention is `export func main(): void`, but loaders/ROMs may enter at any address.

## 1. Lexical Rules

### 1.1 Whitespace and Newlines

- In module/declaration regions, **newlines terminate** declarations and directives.
- In instruction streams (function bodies and `op` bodies), newlines terminate instructions/keywords.
- Spaces/tabs separate tokens.

Multi-line constructs (v0.1):

- ZAX does not use significant whitespace (indentation is ignored).
- Multi-line constructs are delimited by explicit keywords:
  - `end` terminates `func`, `op`, `type` record bodies, `extern <binName>` blocks, `if`/`while` blocks, and `select` blocks.
  - `until <cc>` terminates a `repeat` block.

Labels (v0.1):

- A local label is defined by `<ident>:` at the start of an instruction line **inside a function body**. Local labels are **not permitted** inside `op` bodies in v0.1. The `:` token separates the label from any instruction that follows on the same line; the newline still terminates that instruction normally.

### 1.2 Comments

- `;` starts a comment that runs to end of line.
- Comments are allowed everywhere.

### 1.3 Identifiers

- Identifier grammar: `[A-Za-z_][A-Za-z0-9_]*`
- Z80 mnemonics and register names are matched **case-insensitively**.
- User-defined symbol names are **case-sensitive**.
  - Note: in v0.1, the compiler also enforces case-insensitive uniqueness for user-defined identifiers: you may not define two names that differ only by case (e.g., `Foo` and `foo`).

### 1.4 Literals

- Decimal integer: `123`
- Hex integer: `$2A`, `$8000`
- Binary integer: `%1010`, `0b1010`
- Char literal: `'A'` (an `imm8`)
- String literal: `"TEXT"` (only valid in `data` initializers; emits bytes, no terminator)

Escapes in string/char literals:

- `\\`, `\"`, `\'`, `\n`, `\r`, `\t`, `\0`, `\xNN`

### 1.5 Reserved Names and Keywords (v0.1)

ZAX treats the following as **reserved** (case-insensitive):

- Z80 mnemonics and assembler keywords used inside instruction streams (e.g., `ld`, `add`, `ret`, `jp`, ...).
- Register names: `A F AF B C D E H L HL DE BC SP IX IY I R`.
- Condition codes used by structured control flow: `Z NZ C NC PO PE M P`.
- Structured-control keywords: `if`, `else`, `while`, `repeat`, `until`, `select`, `case`, `end`.
- Declaration keywords: `import`, `type`, `union`, `enum`, `const`, `globals`, `var`, `data`, `bin`, `hex`, `extern`, `func`, `op`, `export`, `section`, `align`, `at`, `from`, `in`.
  - `var` is reserved for function-local variable blocks. Module-scope storage uses `globals`.

User-defined identifiers (module-scope symbols, locals/args, and labels) must not collide with any reserved name, ignoring case.

In addition, the compiler reserves the prefix `__zax_` for internal temporaries (including generated labels). User-defined symbols and user labels must not start with `__zax_`.

---

## 2. Program Structure

### 2.1 Module File

A compilation unit is a module file containing:

- zero or more `import` lines
- zero or more module-scope directives: `section`, `align`
- module-scope declarations: `type`, `union`, `enum`, `const`, `globals`, `data`, `bin`, `hex`, `extern`
- zero or more `func` and `op` declarations

No nested functions are permitted.

Source files (v0.1):

- ZAX source files use the `.zax` extension.

Module identity (v0.1):

- A module’s canonical ID is the file stem of its source path (basename without `.zax`).
- If two modules in the same build have the same canonical ID, compilation fails (module ID collision).

### 2.2 Sections and Location Counters

ZAX produces a final image by **packing per-section** across all imported modules (no external linker).

Section kinds:

- `code`
- `data`
- `var`

Each section has an independent location counter.

Directives:

- `section <kind> at <imm16>`: selects section and sets its starting address.
- `section <kind>`: selects section without changing its current counter.
- `align <imm>`: advances the current section counter to the next multiple of `<imm>`. `<imm>` must be > 0.

`<kind>` is one of: `code`, `data`, `var`.

Scope rules (v0.1):

- `section` and `align` directives are module-scope only. They may not appear inside function/op instruction streams.

Emission rules (v0.1):

- Declarations emit to fixed section kinds, independent of the currently selected section:
  - `func` emits into `code`
  - `data` emits into `data`
  - `var` emits into `var`
- `bin` emits into the section specified by its required `in <kind>` clause.
- `hex` writes bytes to absolute addresses in the final address space and does not affect section counters.
- The currently selected `section` only affects which location counter is advanced by `align` (and which counter is set by `section <kind> at ...`).
- If any two emissions would write a byte to the same absolute address in the final address→byte map, it is a compile error (overlap), even if the byte values are identical.

Address rules (v0.1):

- A section’s starting address may be set at most once. A second `section <kind> at <imm16>` for the same section is a compile error.
- `section <kind>` (without `at`) may be used any number of times to switch the active section.

Packing order:

1. Resolve imports and determine a deterministic module order (topological; ties broken by canonical module ID, then by a compiler-defined normalized module path as a final tiebreaker).

- “Normalized module path” is a deterministic string derived from the resolved module file path and used only for tie-breaking.
  - It must be stable for a given set of input files and resolved import graph, and must not depend on filesystem enumeration order.
  - Recommendation (non-normative): use a project-relative path with `/` separators.

2. For each section kind in fixed order `code`, `data`, `var`, concatenate module contributions in module order.
3. Within a module, preserve source order within each section.

Default placement (if not specified):

- `code at $8000`
- `data` begins immediately after `code`, aligned to 2
- `var` begins immediately after `data`, aligned to 2

---

## 3. Imports and Name Resolution

### 3.1 Import Syntax

- `import <ModuleId>`
- `import "<path>"`

`<ModuleId>` is resolved via the compiler’s search path (project + standard modules). In v0.1, a `ModuleId` maps to a file named `<ModuleId>.zax` on the search path.

`import "<path>"` loads a module from an explicit path. For v0.1, quoted paths should include the `.zax` extension and are resolved relative to the importing file (then search paths, if not found).

### 3.2 Visibility and Collisions

- In v0.1, all module-scope names are public. The `export` keyword is accepted on `const`, `func`, and `op` declarations for clarity and forward compatibility, but has no effect. Using `export` on any other declaration form is a compile error.
- All names from an imported module are brought into the importing module’s global namespace.
- The program has a single global namespace across all modules.
- Any symbol collision is a compile error (no implicit renaming).
  - Collisions are detected ignoring case: you may not define two names that differ only by case (e.g., `Foo` and `foo`).
  - This applies to all user-defined identifiers: module-scope symbols, locals/args, and labels.
- Collisions include:
  - two modules export the same name
  - an import conflicts with a local symbol
  - `bin` base names and `extern` names must also be unique

Namespace rule (v0.1):

- `type`, `union`, `enum`, `const`, storage symbols (`globals`/`data`/`bin`), `func`, and `op` names share the same global namespace. Defining a `func` and an `op` with the same name is a compile error.

Forward references (v0.1):

- ZAX is whole-program compiled: symbols may be referenced before they are declared, as long as they resolve by the end of compilation.
- Circular imports are a compile error.

---

## 4. Types, Enums, Consts

Types exist for layout/width/intent only. No runtime type checks are emitted.

### 4.1 Built-in Scalar Types

- `byte` (8-bit unsigned)
- `word` (16-bit unsigned)
- `addr` (16-bit address)
- `ptr` (16-bit pointer; treated as `addr` for codegen)
- `void` (function return type only)

Notes (v0.1):

- `ptr` is untyped in v0.1 (there is no `ptr<T>`). This is intentional; future versions may add optional pointer parameterization.
- `void` may only appear as a function return type. Using `void` as a variable type, parameter type, record field type, or array element type is a compile error.

Type sizes (v0.1):

- `sizeof(byte)` = 1
- `sizeof(word)` = 2
- `sizeof(addr)` = 2
- `sizeof(ptr)` = 2
- Composite storage sizes are rounded up to the next power of two.
  - `pow2(n)` = smallest power of two ≥ `n` (and `pow2(0) = 0`).
- `sizeof(T[n])` = `pow2(n * sizeof(T))`
- `sizeof(record)` = `pow2(sum of field sizes)`
- `sizeof(union)` = `pow2(max field size)`

### 4.2 Type Aliases

Syntax:

````

type Name byte
type Ptr16 ptr

```

Type expressions (v0.1):

- Scalar types: `byte`, `word`, `addr`, `ptr`
- Arrays: `T[n]` (fixed length) or `T[]` (inferred length; see below). Nested arrays allowed.
- Records: a record body starting on the next line and terminated by `end`

Inferred-length arrays (v0.1):

- `T[]` (with no length) is permitted only in `data` declarations that have an initializer. The compiler infers the element count from the initializer.
- `T[]` is not permitted in any other type position in v0.1 (all other uses require a known size), including:
  - `var` declarations
  - function-local `var` blocks
  - record fields
  - type aliases
  - function parameter and return types

Arrays and nesting (v0.1):

- Array types may be used in aliases (`type Buffer byte[256]`) and as record field types.
- Record field types may reference other record types (nested records).

### 4.3 Enums

Syntax:

```

enum Mode Read, Write, Append

```

Semantics:

- Enum members are sequential integers starting at 0.
- Storage width is `byte` if member count ≤ 256, else `word`.
- Enum members are immediate values usable in `imm` expressions.

Enum name binding (v0.1):

- Enum member names are introduced into the global namespace as immediate values.
  - Example: after `enum Mode Read, Write`, `Read` and `Write` may be used in `imm` expressions.
- Qualified member access (e.g., `Mode.Read`) is not supported in v0.1.

Notes (v0.1):

- Trailing commas are not permitted in enum member lists.

### 4.4 Consts

Syntax:

```

const MaxValue = 1024
export const Public = $8000

```

- `const` values are compile-time `imm` expressions.

Notes (v0.1):

- There is no built-in `sizeof`/`offsetof` in v0.1. If you need sizes or offsets, define them as explicit `const` values.

---

## 5. Arrays, Records, and Unions

### 5.1 Arrays (Nested, 0-based)

Arrays are nested fixed-size arrays:

- `T[n]` is an array of `n` elements of `T`.
- Multidimensional arrays are nested: `T[r][c]`.

Indexing:

- `a[i]` denotes the **effective address** of element `i`.
- When the element type is scalar, `LD A, a[i]` and `LD a[i], A` are allowed and imply a dereference.
- Arrays are **0-based**: valid indices are `0..len-1`. No runtime bounds checks are emitted.

Layout:

- Arrays are contiguous, row-major (C style).
- `a[i]` addresses `base + i * sizeof(T)`.
- `a[r][c]` addresses `base + r * sizeof(T[c]) + c * sizeof(T)` (row stride is `sizeof(T[c])`).

Index forms (v0.1):

- constant immediate
- 8-bit register (`A B C D E H L`)
- 16-bit register (`HL DE BC`)
- `(HL)` (byte read from memory at `HL`) for indirect index
- `(IX±d)` / `(IY±d)` (byte read from indexed address) for indirect index

Notes (v0.1):

- Parentheses inside `[]` are permitted only for Z80 indirect index patterns.
- `arr[i]` is an effective address (`ea`). Use parentheses for explicit dereference, or rely on value semantics in `LD` when the element type is scalar.

### 5.2 Records (Power-of-2 Sized)

Record types are layout descriptions:

```

type Sprite
x: word
y: word
w: byte
h: byte
flags: byte
end

```

Layout rules:

- Records must contain at least one field (empty records are a compile error in v0.1).
- Fields are laid out in source order.
- Each field occupies its full storage size (`sizeof(fieldType)`), which is power-of-2 rounded.
- The record's total storage size is `pow2(sum of field sizes)`.
- `byte` fields are 1 byte; `word` fields are 2 bytes.
- `addr` and `ptr` fields are 2 bytes (same as `word`).

Field access:

- `rec.field` denotes the **effective address** of the field.
- When the field type is scalar, `LD` and call arguments treat `rec.field` as a value (implicit dereference).

Example: arrays of records use `ea` paths (informative):

```

; `sprites[C].x` is an `ea` (address), not a value.
ld hl, (sprites[C].x) ; load word at sprites[C].x
ld (sprites[C].x), hl ; store word to sprites[C].x

```

### 5.3 Unions (Overlays)

Union types overlay multiple field interpretations on the same memory region (C-style union). This is a **layout** feature only: it does not add tags, runtime checks, or type narrowing.

Syntax:

```

union Value
b: byte
w: word
p: ptr
end

```

Layout rules (v0.1):

- Unions must contain at least one field (empty unions are a compile error in v0.1).
- Union declarations are module-scope only.
- All union fields start at offset 0 (overlay).
- Union size is the maximum field size, rounded up to power-of-2: `sizeof(union) = pow2(max(sizeof(fieldType)))`.

Field access:

- `u.field` denotes the **effective address** of the field (which is the union base address plus offset 0).
- Because union fields are overlaid, reading/writing different fields reads/writes the same underlying bytes.

Example (informative):

```

globals
v: Value

func read_value_overlay(): void
  ld a, (v.b) ; read low byte
  ld hl, (v.w) ; read word overlay
  ld de, (v.p) ; read pointer overlay
end

```

---

## 6. Storage Declarations: `globals`, `data`, `bin`, `hex`, `extern`

ZAX separates **uninitialized storage** (`globals`) from **initialized bytes** (`data`) because these play different roles in an 8-bit system:

- `globals` reserves addresses (typically RAM). It does not emit bytes into the output image.
- `data` emits bytes (typically ROM constants and tables).
- Keeping them distinct makes the output deterministic and keeps it obvious which declarations consume bytes in the final image.

### 6.1 Address vs Dereference

- `globals` declarations are typed. Scalar globals use **value semantics** in `LD` and call arguments; composite globals remain addresses.
- `data`, `bin`, and `hex` names denote **addresses** when used as operands.
- Parentheses dereference memory: `(ea)` denotes memory at address `ea` (for scalar globals, `(name)` is allowed but redundant).
- Dereference width is implied by the instruction operand size:
  - `LD A, (ea)` reads a byte
  - `LD HL, (ea)` reads a word
  - `LD (ea), HL` writes a word

Notes (v0.1):

- In instruction-operand position, parentheses always mean dereference/indirection. They are not grouping parentheses.
  - Example: `LD A, (X)` always means “load `A` from memory at address `X`”, even if `X` is a `const`.
- Z80 also has **I/O port indirection** operands for `in`/`out`:
  - `(C)` means “port addressed by register `C`”.
  - `($imm8)` means “port addressed by an immediate 8-bit port number”.
  - These port forms refer to the Z80 I/O space (not memory) and are only valid where a raw Z80 mnemonic expects a port operand. They are not `ea` expressions.
- Grouping parentheses apply only inside `imm` expressions (e.g., `const X = (1+2)*3`, or `ea + (1+2)`).

### 6.1.1 Lowering of Non-Encodable Operands

Many `ea` forms (locals/args, `rec.field`, `arr[i]`, and address arithmetic) are not directly encodable in a single Z80 instruction. In these cases, the compiler lowers the instruction to an equivalent instruction sequence.

Lowering rules (v0.1):

- The observable effect must match the abstract meaning of the original instruction and operands.
- If the original instruction does not modify flags (e.g., `LD`), the lowered sequence must preserve flags.
- The lowered sequence must preserve registers other than the instruction’s explicit destination(s).
- Any internal stack usage must have net stack delta 0.

Lowering limitations (v0.1):

- Some source forms may be rejected if no correct lowering exists under the constraints above (e.g., operations whose operand ordering cannot be preserved without clobbering).

Lowering guarantees and rejected patterns (v0.1):

- The compiler guarantees lowering for loads/stores whose memory operand is an `ea` expression of the following forms:
  - `LD r8, (ea)` and `LD (ea), r8`
  - `LD r16, (ea)` and `LD (ea), r16`
    where `ea` is a local/arg slot, a module-scope storage address (`globals`/`data`/`bin`), `rec.field`, `arr[i]`, or `ea +/- imm`.
- The compiler rejects source forms that are not meaningful on Z80 and do not have a well-defined lowering under the preservation constraints, including:
  - memory-to-memory forms (e.g., `LD (ea1), (ea2)`).
  - instructions where both operands require lowering and a correct sequence cannot be produced without clobbering non-destination registers or flags that must be preserved.

Non-guarantees (v0.1):

- Arithmetic/logical instruction forms that are not directly encodable on Z80 (e.g., `add hl, (ea)`) are not guaranteed to be accepted, even though they may be expressible via a multi-instruction sequence.

### 6.2 `globals` (Uninitialized Storage)

Syntax:

```

globals
total: word
mode: byte

```

- Declares storage in `var` (uninitialized; emits no bytes).
- One declaration per line; no initializers.
- This is **module-scope** uninitialized storage (addresses in the `var` section). It is distinct from a function-local `var` block, which declares stack locals (Section 8.1).
- A `globals` block continues until the next module-scope declaration, directive, or end of file.
- Legacy module-scope `var` blocks are rejected in v0.1 with a migration diagnostic (`Top-level "var" block has been renamed to "globals".`).

### 6.3 `data` (Initialized Storage)

Syntax:

```

data
table: word[4] = { 1, 2, 3, 4 }
banner: byte[] = "HELLO"
bytes: byte[3] = { $00, $01, $FF }

```

- Declares storage in `data`.

Initialization:

- `byte[n] = { imm8, ... }` emits `n` bytes.
- `word[n] = { imm16, ... }` emits `n` little-endian words.
- `byte[n] = "TEXT"` emits the ASCII bytes of the string; length must equal `n` (no terminator).
- A `data` block continues until the next module-scope declaration, directive, or end of file.

Type vs initializer (v0.1):

- For fixed-length arrays (`T[n]`), the initializer element count must match `n` exactly.
  - Example: `table: word[3] = { 1, 2, 3 }` — three elements, matching the declared length.
- For inferred-length arrays (`T[]`), the compiler determines the length from the initializer.
  - Example: `banner: byte[] = "HELLO"` is equivalent to `banner: byte[5] = "HELLO"`.
  - Example: `table: word[] = { 1, 2, 3 }` is equivalent to `table: word[3] = { 1, 2, 3 }`.
- A bare scalar type without `[]` or `[n]` is not an array; `table: word = { 1, 2, 3 }` is a compile error.
- Record initializers must supply field values in field order; for arrays of records, initializers are flattened in element order.

Nested record initializer example (v0.1):

```

type Point
x: word
y: word
end

type Rect
topLeft: Point
bottomRight: Point
end

data
r: Rect = { 0, 0, 100, 100 } ; tl.x, tl.y, br.x, br.y

```

### 6.4 `bin` / `hex` (External Bytes)

`bin` emits a contiguous byte blob into a target section and binds a base name to its start address:

```

bin legacy in code from "asm80/legacy.bin"

```

- The name `legacy` becomes an address-valued symbol of type `addr`.

`bin` placement rule (v0.1):

- `in <kind>` is required. There is no default section for `bin`.

Path resolution (v0.1):

- `bin ... from "<path>"` and `hex ... from "<path>"` resolve `<path>` the same way as `import "<path>"` (Section 3.1): first relative to the current module file, then via search paths if not found. If not found, compilation fails.

`hex` reads Intel HEX and emits bytes at absolute addresses specified by records:

```

hex bios from "rom/bios.hex"

```

`hex` binding and placement rules (v0.1):

- Supported Intel HEX record types in v0.1:
  - `00` (data) and `01` (end-of-file)
  - Any extended-address record (e.g., `02`/`04`) is a compile error in v0.1.
- All data record addresses must fit in 16 bits (`$0000..$FFFF`). Any out-of-range address is a compile error.
- Intel HEX checksums must be validated. A record with an invalid checksum is a compile error.
- `hex <name> from "<path>"` binds `<name>` to the lowest address written by the HEX file (type `addr`). If the HEX file contains no data records, it is a compile error.
  - For disjoint HEX ranges, this remains the minimum written address across all ranges.
- HEX output is written to absolute addresses in the final address space and does not advance any section’s location counter.
- If a HEX-written byte overlaps any other emission, it is a compile error (regardless of whether the bytes are equal). This is an instance of the general overlap rule in Section 2.2.
- The compiler’s output is an address→byte map. When producing a flat binary image, the compiler emits bytes from the lowest written address to the highest written address. Unwritten addresses within this range are filled with the **gap fill byte**, `$00`. `var` contributes no bytes.
  - When producing Intel HEX output, the compiler emits only written bytes/records; gap fill bytes are not emitted.

### 6.5 `extern` (Binding Names to Addresses)

Bind callable names to absolute addresses:

```

extern func bios_putc(ch: byte): void at $F003

```

Standalone `extern func` rules (v0.1):

- The `at <imm16>` clause is required.

Bind multiple entry points relative to a `bin` base:

```

bin legacy in code from "asm80/legacy.bin"
extern legacy
func legacy_init(): void at $0000
func legacy_putc(ch: byte): void at $0030
end

```

Relative `extern` semantics (v0.1):

- In an `extern <binName> ... end` block, the `at <imm16>` value is an **offset** from the base address of `<binName>`.
  - Example: if `legacy` is placed at `$C000`, then `legacy_putc ... at $0030` resolves to absolute address `$C030`.

`extern`-declared names are normal global symbols; collisions are errors. Prefer `<binName>_name` conventions (e.g., `legacy_putc`).

---

## 7. Expressions

Expressions are used in `imm` and `ea` contexts.

### 7.0 Fixups and Forward References (v0.1)

ZAX supports forward references for labels and symbols that are ultimately resolved to an address (e.g. `jp label`, `jr label`, `call func`, `ld hl, dataSymbol`).

Implementation model (v0.1):

- During code emission, the compiler may emit placeholder bytes and record a fixup at that location.
- After all code/data/var addresses are known, fixups are resolved by writing the computed target address (abs16) or displacement (rel8) into the emitted bytes.
- If a referenced symbol is never defined, compilation fails with an unresolved symbol diagnostic.
- For rel8 branches (`jr`, `djnz`), if the final displacement is not in `-128..127`, compilation fails.

### 7.1 `imm` (Immediate) Expressions

Allowed:

- numeric literals, char literals
- `const` and `enum` names
- operators: unary `+ - ~`, binary `* / % + - & ^ | << >>`
- parentheses for grouping

Operator precedence and associativity (v0.1), highest to lowest:

1. Unary `+ - ~` (right-associative)
2. `* / %` (left-associative)
3. `+ -` (left-associative)
4. `<< >>` (left-associative)
5. `&` (left-associative)
6. `^` (left-associative)
7. `|` (left-associative)

Integer semantics (v0.1):

- Immediate expressions evaluate over mathematical integers.
- Division/modulo by zero is a compile error.
- Shift counts must be non-negative; shifting by a negative count is a compile error.
- When an `imm` value is encoded as `imm8`/`imm16`, the encoded value is the low 8/16 bits of the integer (two’s complement truncation).

### 7.2 `ea` (Effective Address) Expressions

`ea` denotes an address, not a value. Allowed:

- storage symbols: `globals` names, `data` names, `bin` base names
- function-scope symbols: argument names and local `var` names (as SP-relative stack slots)
- field access: `rec.field`
- indexing: `arr[i]` and nested `arr[r][c]` (index forms as defined above)
- address arithmetic: `ea + imm`, `ea - imm`

Conceptually, an `ea` is a base address plus a sequence of **address-path** segments: `.field` selects a record field, and `[index]` selects an array element. Both forms produce an address; dereference requires parentheses as described in 6.1.

Value semantics note (v0.2):

- When a scalar-typed variable, field, or element appears in `LD` or call-argument position, the compiler inserts the implicit dereference. In other contexts, `ea` still denotes an address value.

Precedence (v0.1):

- Address-path segments (`.field`, `[index]`) bind tighter than address arithmetic (`ea + imm`, `ea - imm`).

Notes (v0.1):

- `imm + ea` is not permitted; write `ea + imm`.
- `ea` describes memory addresses. Z80 I/O port operands (e.g., `(C)` and `($imm8)` used by `in`/`out`) are not `ea` expressions.

---

## 8. Functions (`func`)

### 8.1 Declaration Form

Syntax:

```zax
export func add(a: word, b: word): word
  var
    temp: word
  end
  ld hl, a
  ld de, b
  add hl, de
end
```

Rules:

- Module-scope only; no inner functions.
- Function bodies emit instructions into `code`.
- Inside a function body:
  - at most one optional `var` block (locals, one per line)
  - instruction stream starts after the optional `var` block (or immediately if no `var` block)
  - `end` terminates the function body
- Function instruction streams may contain Z80 mnemonics, `op` invocations, and structured control flow (Section 10).

Function-body block termination (v0.1):

- Inside a function body, a `var` block (if present) is terminated by `end`.
- The `asm` marker keyword is not used in v0.1 function or op bodies.
- Legacy explicit `asm` body markers are rejected with diagnostics (`Unexpected "asm" in function body ...`).
- Function instruction streams may be empty (no instructions).
- If control reaches the end of the function instruction stream (falls off the end), the compiler behaves as if a `ret` instruction were present at that point (i.e., it returns via the normal return/trampoline mechanism described in 8.4).

### 8.2 Calling Convention

- Arguments are passed on the stack, each argument occupying 16 bits.
- Caller pushes arguments right-to-left (last argument pushed first).
- Caller cleans up the arguments after return.
- Return values:
  - 16-bit return in `HL`
  - 8-bit return in `L`
- Register/flag volatility (v0.1): unless explicitly documented otherwise, functions may clobber any registers and flags (other than producing the return value in `HL`/`L`). The caller must save anything it needs preserved.

Notes (v0.1):

- Arguments are stack slots, regardless of declared type. For `byte` parameters, the low byte carries the value and the high byte is ignored (recommended: push a zero-extended value).
- `void` functions return no value.

### 8.3 Calling Functions From Instruction Streams

Inside a function/op instruction stream, a line starting with a function name invokes that function.

Syntax:

- `name` (call with zero arguments)
- `name <arg0>, <arg1>, ...` (call with arguments)

Argument values (v0.1):

- `reg16`: passed as a 16-bit value.
- `reg8`: passed as a zero-extended 16-bit value.
- `imm` expression: passed as a 16-bit immediate.
- `ea` expression: passed as the 16-bit address value.
- `(ea)` dereference: reads from memory and passes the loaded value (word or byte depending on the parameter type; `byte` is zero-extended).

Calls follow the calling convention in 8.2 (compiler emits the required pushes, call, and any temporary saves/restores).

Parsing and name resolution (v0.1):

- If an instruction line begins with `<ident>:` it defines a local label **inside a function body**. Local labels are **not permitted** inside `op` bodies in v0.1; any `<ident>:` definition in an `op` body is a compile error. Any remaining tokens on the line are parsed as another instruction line (mnemonic/`op`/call/etc.).
- Otherwise, the first token of an instruction line is interpreted as:
  1. a structured-control keyword (`if`, `else`, `while`, `repeat`, `until`, `select`, `case`, `end`), else
  2. a Z80 mnemonic, else
  3. an `op` invocation, else
  4. a `func`/`extern func` call, else
  5. a compile error (unknown instruction/op/function).
- Because Z80 mnemonics and register names are reserved, user-defined symbols cannot shadow instructions/registers.

Operand identifier resolution (v0.1):

- For identifiers used inside operands (in function bodies), resolution proceeds as:
  1. local labels
  2. locals/args (stack slots)
  3. module-scope symbols (including `const` and enum members)
     otherwise a compile error (unknown symbol).

### 8.4 Stack Frames and Locals (SP-relative, no base pointer)

- ZAX does not use `IX`/`IY` as a frame pointer.
- Locals and arguments are addressed as `SP + constant offset` computed into `HL`.
- The compiler knows local/arg counts from the signature and `var` block.
- In the current ABI, each local and each argument occupies one 16-bit slot.
- Supported local/parameter types in this ABI: `byte`, `word`, `addr` (or aliases that resolve to those scalar types).

Frame model (v0.1 current):

- Prologue reserves locals as words (`frameSize = localCount * 2`).
- No trampoline metadata is pushed.
- At the start of the user-authored instruction stream:
  - local slot `i` is at `SP + 2*i`
  - return address is at `SP + frameSize`
  - argument `i` (0-based) is at `SP + frameSize + 2 + 2*i`

Return and cleanup model:

- If a synthetic epilogue is required (`frameSize > 0`, or at least one conditional `ret <cc>` exists), the compiler creates a per-function hidden label:
  - current implementation naming convention: `__zax_epilogue_<n>`
- `ret` and `ret <cc>` in user-authored instruction streams are rewritten to jumps to that synthetic epilogue.
- The synthetic epilogue pops local slots (if any) and performs the final `ret` to caller.
- If there are no locals and no conditional returns, plain `ret` is emitted directly with no synthetic epilogue.

`retn`/`reti`:

- They are permitted as raw instructions.
- They are not rewritten by this mechanism; only `ret`/`ret <cc>` participate in epilogue rewriting.
- In functions with locals (`frameSize > 0`), `retn`/`reti` are rejected with a compile error because they bypass local-frame cleanup.

The compiler tracks stack depth across the function instruction stream to keep SP-relative locals/args resolvable.

### 8.5 SP Mutation Rules in Instruction Streams

The compiler tracks SP deltas for:

- `push`, `pop`, `call`, `ret`, `retn`, `reti`, `rst`
- `inc sp`, `dec sp`
- `ex (sp), hl`, `ex (sp), ix`, `ex (sp), iy` (net delta 0)

Other SP assignment instructions (v0.1):

- Instructions that assign to `SP` (e.g., `ld sp, hl`, `ld sp, ix`, `ld sp, iy`, `ld sp, imm16`) are permitted but the compiler does not track their effects.
- When using untracked SP assignment:
  - The programmer is responsible for ensuring SP is correct at structured-control-flow joins and at function exit.
  - Local/arg slot references assume the compiler's tracked SP offset; untracked SP assignment can make stack-slot addressing invalid.
  - Current compiler behavior: once such an assignment is seen, stack-slot addressing is rejected with a compile error.
  - Current compiler behavior: when stack slots are present (locals and/or params), call-like boundaries (`call`, `rst`) reached with positive tracked stack delta, or after untracked/unknown stack state, are diagnosed.

Note (v0.1):

- The compiler may emit additional SP-mutating instructions in its own prologue/epilogue sequences.

Stack-depth constraints (v0.1):

- At any structured-control-flow join (end of `if`/`else`, loop back-edges, and loop exits), stack depth must match across all paths.
  - Paths that terminate (e.g., `ret`, or an unconditional `jp`/`jr` that exits the construct) do not participate in join stack-depth matching.
- The end of a `select ... end` is also a join point: stack depth must match across all `case`/`else` arms that reach `end`.
- The net stack delta of an `op` expansion must be 0.

---

## 9. `op` (Inline Macro-Instructions)

### 9.1 Purpose

`op` defines opcode-like inline macros with compiler-level operand matching. This is used to express accumulator-shaped instruction families and provide ergonomic “opcode-like functions.”

Normative reference:

- The **op system specification** (`docs/zax-op-system-spec.md`) is the normative source for op expansion semantics, overload resolution, autosave/clobber rules, and diagnostics. This section is a compact summary for the core language spec; where the two documents overlap, the op system specification takes precedence.

### 9.2 Declaration Form

Syntax:

```
op add16(dst: HL, src: reg16)
  add hl, src
end

op add16(dst: DE, src: reg16)
  ex de, hl
  add hl, src
  ex de, hl
end
```

Rules:

- `op` is module-scope only.
- `op` bodies are implicit instruction streams.
- Legacy explicit `asm` body markers are rejected with diagnostics (`Unexpected "asm" in op body ...`).
- Local label definitions (`<ident>:`) are **not permitted** inside `op` bodies in v0.1.
- `end` terminates the `op` body.
  - `op` bodies may contain structured control flow that uses `end` internally; the final `end` closes the `op` body.
- `op` bodies may be empty (no instructions).
- `op` invocations are permitted inside function/op instruction streams.
- Cyclic `op` expansion is a compile error.

Notes (v0.1):

- `op` bodies do not support `var` blocks. If an expansion needs temporaries, implement them via register usage and autosave (`push`/`pop`) as needed.

Zero-parameter ops (v0.1):

- `op name` (with no parameter list) is permitted and defines a zero-parameter op.
- A zero-parameter op is invoked by writing just `name` on an instruction line.

### 9.3 Operand Matchers

`op` parameters use matcher types (patterns). These constrain call-site operands.

Scalar/register matchers:

- `reg8`: `A B C D E H L`
- `reg16`: `HL DE BC SP`
- fixed register patterns: `A`, `HL`, `DE`, `BC` as matchers

Immediate matchers:

- `imm8`, `imm16`: compile-time immediate expressions (Section 7.1)

Address/deref matchers:

- `ea`: effective address expressions (Section 7.2)
- `mem8`, `mem16`: dereference operands written as `(ea)` with implied width

Notes (v0.1):

- Matchers constrain call sites, but the `op` body must still be valid for all matched operands. If an expansion yields an illegal instruction form for a given call, compilation fails at that call site.
- In `op` parameters, `mem8` and `mem16` disambiguate dereference width. In raw Z80 mnemonics, dereference width is implied by the instruction form (destination/source registers).
- `reg16` includes `SP`; `op` authors should use fixed-register matchers if an expansion is only valid for a subset of register pairs.
- `IX`/`IY` are usable in raw Z80 mnemonics but are not supported by `op` matchers in v0.1.

Operand substitution (v0.1):

- `op` parameters bind to parsed operands (AST operands), not text.
  - `reg8`/`reg16` parameters substitute the matched register token(s).
  - `imm8`/`imm16` parameters substitute the immediate expression value.
  - `ea` parameters substitute the effective-address expression (without implicit parentheses).
  - `mem8`/`mem16` parameters substitute the full dereference operand including parentheses.
    - Example: if `src: mem8` matches `(hero.flags)`, then `ld a, src` emits `ld a, (hero.flags)`.

### 9.4 Overload Resolution

- `op` overloads are selected by best match on matcher types and fixed-register patterns.
- If no overload matches, compilation fails.
- If multiple overloads match equally, compilation fails (ambiguous).

Specificity (v0.1):

- Fixed-register matchers (e.g., `HL`) are more specific than class matchers (e.g., `reg16`).
- `imm8` is more specific than `imm16` for values that fit in 8 bits.
- `mem8`/`mem16` are more specific than `ea`.

### 9.5 Autosave Clobber Policy

To keep `op` expansions transparent:

- An `op` expansion must preserve all registers and flags **except** explicit destination(s).
- The compiler may use scratch registers and `push/pop` internally.
- Net stack delta must be zero.

The simplest implementation is permitted: always preserve flags (save/restore `AF`) unless `AF` is an explicit destination.

Destination parameters (v0.1):

- By convention, any `op` parameter whose name starts with `dst` or `out` (e.g., `dst`, `dst2`, `out`) is treated as a destination.
- If an `op` declares no `dst*`/`out*` parameters, the first parameter is treated as the destination.

---

## 10. Structured Control Flow

Structured control flow is only available inside function/op instruction streams. For `if`/`while`/`repeat`, conditions test CPU flags that the programmer establishes with normal Z80 instructions. `select`/`case` dispatches by equality on a selector value.

### 10.1 Condition Codes (v0.1)

- `Z` / `NZ`: zero flag set / not set
- `C` / `NC`: carry flag set / not set
- `PE` / `PO`: parity even / parity odd (parity/overflow flag set / not set)
- `M` / `P`: sign flag set (minus) / not set (plus)

### 10.2 Forms

- `if <cc> ... end` (optional `else`)
- `while <cc> ... end`
- `repeat ... until <cc>`
- `select <selector> ... end` (case dispatch)

These forms lower to compiler-generated hidden labels and conditional/unconditional jumps. `if`/`while`/`repeat` do not themselves set flags; `select` lowering may set flags as part of dispatch.

Notes:

- `else` is optional.
- For `if` blocks, `else` must immediately follow the `if` body with only whitespace/comments/newlines in between.

`select` notes (v0.1):

- `select` does not use condition codes. It dispatches based on equality against a selector value.
- `select` cases do not fall through in v0.1.
- Register/flag effects: the compiler-generated dispatch may modify `A` and flags. All other registers are preserved across dispatch.
  - If the selector is `A`, the selector value is not preserved (since `A` may be clobbered by dispatch).
  - If the selector is any other register (`reg8` or `reg16`), that register’s value is preserved across dispatch.

Condition evaluation points (v0.1):

- `if <cc> ... end`: `<cc>` is evaluated at the `if` keyword using the current flags.
- `while <cc> ... end`: `<cc>` is evaluated at the `while` keyword on entry and after each iteration. The back-edge jumps to the condition test at the top of the loop, which re-tests `<cc>` using the current flags. The loop body is responsible for establishing flags for the next condition check.
- `repeat ... until <cc>`: `<cc>` is evaluated at the `until` keyword using the current flags. The loop body is responsible for establishing flags for the `until` check.

### 10.2.1 `select` / `case` (v0.1)

`select` introduces a multi-way branch based on a selector operand evaluated once.

Syntax:

```
select <selector>
  case <imm>[, <imm> ...]
  case <imm>[, <imm> ...]
  else ...
end
```

Rules:

- `<selector>` is evaluated once at `select` and treated as a 16-bit value.
  - Allowed selector forms: `reg16`, `reg8` (zero-extended), `imm` expression, `ea` (address value), `(ea)` (loaded value).
  - `(ea)` selectors read a 16-bit word from memory.
- Each `case` value must be a compile-time immediate (`imm`) and is compared against the selector.
  - Comparisons are by 16-bit equality.
  - For `reg8` selectors, the selector value is in the range `0..255` (zero-extended). `case` values outside `0..255` can never match; the compiler may warn.
- `else` is optional and is taken if no `case` matches. If no `else` is present and no `case` matches, control transfers to after the enclosing `end`.
- If present, `else` must be the final arm in the `select`. A `case` after `else` is a compile error.
- There is no fallthrough: after a `case` body finishes, control transfers to after the enclosing `end` (unless the case body terminates, e.g., `ret`).
- Duplicate `case` values within the same `select` are a compile error.
- Nested `select` is allowed.
- A `case` line may list one or more values separated by commas (for example, `case 0, 1`).
- Consecutive `case` lines before statements share one clause body (stacked-case syntax), e.g.:
  - `case 0`
  - `case 1`
  - `<body>`
- Shared-case examples (no fallthrough, shared body):
  - `case 0, 1`
  - `nop`
  - `case 0`
  - `case 1`
  - `nop`
- `case` and `else` are only valid inside `select` (and `else` is also valid inside `if`). Encountering them outside their enclosing construct is a compile error.
- A `select` must contain at least one arm (`case` or `else`). A `select` with no arms is a compile error.

Notes:

- `select <ea>` dispatches on the address value of `<ea>`. To dispatch on the stored value, use `select (ea)`.
- If you want to dispatch on a byte-sized value in memory, prefer loading into a `reg8` and using `select <reg8>` rather than `select (ea)` (which reads a 16-bit word).
- The current compiler implementation emits a warning when a `reg8` selector has a `case` value outside `0..255`, because that arm can never match.
  - Those unreachable `reg8` case values are omitted from runtime dispatch comparisons.

Lowering (informative):

- The compiler may lower `select` either as a sequence of compares/branches or as a jump table, depending on target and case density. Behavior must be equivalent.
  - For `reg8` selectors, lowering naturally uses 8-bit compares (e.g., `ld a, <reg8>` then `cp imm8`) because the selector’s high byte is always zero.
    - The current compiler implementation loads the selector byte once and reuses it across the compare chain.
  - For `reg16` selectors, lowering may require multi-instruction comparison sequences.
  - Runtime compare-chain lowering evaluates the selector once, then compares case values against that stable selector value.
  - The compiler may test `case` values in any order.
    - Do not rely on any particular case-test order or intermediate dispatch effects.
  - If the selector is a compile-time `imm` expression, the compiler may resolve the match at compile time and emit only the matching arm (or nothing).
    - The current compiler implementation folds the dispatch compare chain for compile-time `imm` selectors.

### 10.3 Examples

```
; if A == 0 then ...
or a
if Z
  ; ...
else
  ; ...
end

; repeat-until A becomes zero
repeat
  dec a
  or a
until Z

; nesting is allowed
or a
if NZ
  while NZ
    dec a
    or a
  end
end

; select/case (no fallthrough)
ld a, (mode)
select A
  case Read
    ld a, 'R'
  case Write
    ld a, 'W'
  else
    ld a, '?'
end
```

### 10.4 Local Labels (Discouraged, Allowed in Functions Only)

ZAX discourages labels in favor of structured control flow, but allows **local labels** within a function instruction stream for low-level control flow.

Label definition syntax (v0.1):

- `<ident>:` at the start of an instruction line defines a local label at the current code location.
  - A label definition may be followed by an instruction on the same line (e.g., `loop: djnz loop`) or may stand alone.

Scope and resolution (v0.1):

- Local labels are scoped to the enclosing `func` body and are not exported.
- Local labels are **not permitted** inside `op` bodies in v0.1; any label definition in an `op` body is a compile error.
- A local label may be referenced before its definition within the same function instruction stream (forward reference).
- Local label names must not collide with reserved names (Section 1.5), ignoring case.
- When resolving an identifier in an instruction operand, local labels take precedence over locals/args, which take precedence over global symbols.

Usage (v0.1):

- A local label name may be used anywhere a Z80 mnemonic expects an address/immediate (e.g., `jp loop`, `jr nz, loop`, `djnz loop`).
- For relative branches (`jr`, `djnz`), the displacement must fit the instruction encoding; otherwise it is a compile error.

---

## 11. Examples (Non-normative)

This specification keeps its embedded examples short. For working, end-to-end source examples, see:

- `examples/hello.zax`
- `examples/stack_and_structs.zax`
- `examples/control_flow_and_labels.zax`

All examples are non-normative; the normative rules are the numbered sections above.

---

## Appendix A: SAX vs ZAX (Non-normative)

**SAX** (“Structured Assembler”) is intended as a CPU-agnostic category: a family of structured assemblers that compile directly to native machine code while keeping assembly-like semantics.

Each concrete SAX instance targets a specific CPU family and defines its instruction set, registers, calling convention, and lowering rules. **ZAX** is the Z80-family SAX instance defined by this specification.

---

## Appendix B: Source Mapping (Non-normative)

ZAX is a compiler: it may lower a single source line into multiple machine instructions, or combine multiple source lines into a single emitted range. A useful build therefore produces a **source map** alongside the binary/HEX to support stepping, breakpoints, and symbol lookup in debuggers.

### B.1 Recommended format: D8 Debug Map (D8M) v1

The recommended mapping format is **D8 Debug Map (D8M) v1**, used by Debug80. It is a JSON file whose canonical name is:

- `<artifactBase>.d8dbg.json`

At a minimum, a ZAX compiler can populate:

- instruction/data byte ranges (`segments`)
- symbol definitions (`symbols`)

The full D8M schema is documented in Debug80 (`debug80/docs/d8-debug-map.md`). This appendix summarizes the key conventions needed to produce a useful map.

### B.2 Paths

In D8M, the top-level `files` object is keyed by source file path strings. Recommended:

- project-relative paths
- `/` path separators

### B.3 Segments (address → source)

Each segment maps a byte range to a source location:

- `start`: start address (inclusive)
- `end`: end address (exclusive)
- `lstLine`: a listing line number (required by D8M; if not available, set `0`)
- `line` / `column`: 1-based source location (when known)
- `kind`: `code` / `data` / `directive` / `label` / `macro` / `unknown`
- `confidence`: `high` / `medium` / `low` (useful if mapping is inferred rather than emitted directly)

ZAX can generally produce **high confidence** mappings because it controls code emission (even after lowering).

### B.4 Symbols

Symbols describe named addresses and constants:

- `name`
- `address` (for address-bearing symbols)
- `value` (for `kind: constant`)
- `kind`: `label`, `constant`, `data`, `unknown`
- `scope`: `global` or `local`
- `size` (optional; bytes)

Constant symbol note (v0.1):

- For `kind: constant`, D8M should carry the full integer in `value`.
- For compatibility with older tooling, writers may also include `address` set to `value & 0xFFFF`.

### B.5 Suggested ZAX mapping policy

Recommended (non-normative) policy for a ZAX compiler:

- Emit one `code` segment per contiguous emitted range that originates from a single source line in a function/op instruction stream.
  - Lowering may produce multiple segments tied to the same source location.
- Emit `data` segments for `data` initializers and `bin` includes.
- Record local labels as `symbols` of `scope: local`.
- Record `const` and enum members as `symbols` of `kind: constant` with `value` as the full integer.
- For compatibility with older tooling, also emit `address = value & 0xFFFF` on constant symbols.

### B.6 Minimal example (illustrative)

```json
{
  "format": "d8-debug-map",
  "version": 1,
  "arch": "z80",
  "addressWidth": 16,
  "endianness": "little",
  "files": {
    "examples/hello.zax": {
      "segments": [
        {
          "start": 32768,
          "end": 32771,
          "line": 40,
          "kind": "code",
          "confidence": "high",
          "lstLine": 1
        }
      ],
      "symbols": [
        {
          "name": "main",
          "address": 32768,
          "line": 36,
          "kind": "label",
          "scope": "global"
        }
      ]
    }
  }
}
```
````
