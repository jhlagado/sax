# ZAX Language Specification (Draft v0.2)

This document is the implementable first draft specification for **ZAX**, a structured assembler for the Z80 family. It is written for humans: it introduces concepts in the same order you’ll use them when writing ZAX.

ZAX aims to make assembly code easier to read and refactor by providing:

- file structure (`import`, declarations)
- simple layout types (arrays/records/unions) used for addressing
- functions with stack arguments and optional locals
- structured control flow inside function/op instruction streams (`if`/`while`/`repeat`/`select`)
- `op`: inline “macro-instructions” with operand matching

Normative status for v0.2: this document is the sole normative language source. `docs/v02-transition-decisions.md` is a non-normative transition record and does not override this specification.

Grammar companion: `docs/zax-grammar.ebnf.md` provides a single-file syntax reference. If any grammar text diverges from this specification, this specification wins.

Anything not defined here is undefined behavior or a compile error in v0.2.

---

## Authority (Normative)

- `docs/zax-spec.md` is the only normative language authority.
- Supporting documents (`docs/zax-dev-playbook.md`, `docs/v02-transition-decisions.md`) are non-normative and must not introduce conflicting language rules.
- `docs/v02-transition-decisions.md` captures transition rationale and sequencing. It is not a second normative source.
- If supporting text conflicts with this document, this document wins.

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

Implementation note (non-normative): `docs/zax-dev-playbook.md` includes the implementation pipeline mapping used by the current compiler.

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

Labels (v0.2):

- A local label is defined by `<ident>:` at the start of an instruction line inside a function or `op` body.
- Labels in `op` bodies are hygienically rewritten per expansion site to avoid collisions.
- The `:` token separates the label from any instruction that follows on the same line; the newline still terminates that instruction normally.

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

Type expressions (v0.2):

- Scalar types: `byte`, `word`, `addr`, `ptr`
- Arrays: `T[n]` (fixed length) or `T[]` (inferred length; see below). Nested arrays allowed.
- Records: a record body starting on the next line and terminated by `end`

Inferred-length arrays (`T[]`) in v0.2:

- `T[]` in `data` declarations with initializer is allowed; element count is inferred from initializer.
- `T[]` in function parameter position is allowed as an array-view contract (element shape known; length unspecified by signature).
- `T[]` does not imply local stack allocation of unknown-size arrays.
- `T[]` is not permitted in return types, type aliases, record fields, or local storage declarations in this scope.

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

Enum name binding (v0.2):

- Enum members must be referenced with qualified form: `EnumType.Member`.
  - Example: after `enum Mode Read, Write`, use `Mode.Read` and `Mode.Write` in `imm` expressions.
- Unqualified enum member references are compile errors.

Notes (v0.1):

- Trailing commas are not permitted in enum member lists.

### 4.4 Consts

Syntax:

```

const MaxValue = 1024
export const Public = $8000

```

- `const` values are compile-time `imm` expressions.

Notes (v0.2):

- `sizeof(Type)` and `offsetof(Type, fieldPath)` are compile-time built-ins.
- `sizeof` returns storage size (power-of-2 for composites).
- `offsetof` returns byte offset using storage-size field progression.

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

ZAX separates **module variable storage** (`globals`) from **data block declarations** (`data`) because they serve different authoring roles:

- `globals` defines module variable symbols in the `var` section (scalars and composites).
- `data` defines initialized table/blob declarations in the `data` section.
- Both can contribute bytes to final emitted artifacts depending on declaration form.

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

### 6.2 `globals` (Module Storage)

Syntax:

```

globals
total: word
mode: byte
boot_count: word = 1
active_mode = mode

```

- Declares module-scope storage in `var`.
- Declaration forms:
  - storage declaration: `name: Type`
  - typed value initializer: `name: Type = valueExpr`
  - alias initializer (inferred): `name = rhs`
- Typed alias form is invalid: `name: Type = rhs` is a compile error.
- This is **module-scope** storage (addresses in the `var` section). It is distinct from a function-local `var` block, which declares frame-local names (Section 8.1).
- A `globals` block continues until the next module-scope declaration, directive, or end of file.
- Legacy module-scope `var` blocks are rejected in v0.1 with a migration diagnostic (`Top-level "var" block has been renamed to "globals".`).

Initialization semantics (v0.2):

- `name: Type` allocates storage and zero-initializes it.
- `name: Type = valueExpr` allocates storage and initializes from `valueExpr`.
- `name = rhs` allocates no storage; it aliases an existing symbol/address path.
- In image output terms, `globals` storage declarations contribute bytes in `var` (zero-filled unless value-initialized).

Alias compatibility (v0.2):

- Alias declarations use inferred type from `rhs`.
- For arrays, `T[N]` where `T[]` is expected is allowed.
- `T[]` to `T[N]` requires proof that length is exactly `N`; otherwise compile error.
- Element-type mismatch is a compile error.

Initializer classification and diagnostics (normative):

- `valueExpr` is an initializer expression compatible with the declared type.
  - scalar declarations use compile-time immediate expressions (`imm`) valid for declared width.
  - for `globals` composite declarations in v0.2, zero-init form (`= 0`) is supported; aggregate record initializer syntax is deferred.
- `rhs` is an address/reference source (symbol or address path expression).
- `name: Type = valueExpr` is value initialization.
- `name = rhs` is alias initialization with inferred type.
- `name: Type = rhs` is always rejected (typed alias form is not allowed in this scope).

Examples (normative classification):

```zax
globals
  table: byte[4] = { 1, 2, 3, 4 } ; valid value-init
  table_ref = table                ; valid alias-init
  bad_table: byte[4] = table       ; invalid typed alias form

type Pair
  lo: byte
  hi: byte
end

globals
  p: Pair = 0                      ; valid composite zero-init form in v0.2
```

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
- Named-field aggregate syntax is not part of v0.2 (`{ lo: 0, hi: 0 }` is unsupported in this version).

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
- The compiler’s output is an address→byte map. When producing a flat binary image, the compiler emits bytes from the lowest written address to the highest written address. Unwritten addresses within this range are filled with the **gap fill byte**, `$00`. `var` may contribute bytes from `globals` storage declarations.
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
- Width-constrained immediate contexts accept signed-negative forms in addition to unsigned forms:
  - `imm8` contexts accept `-128..255`, then encode low 8 bits.
  - `imm16` contexts accept `-32768..65535`, then encode low 16 bits.

### 7.2 `ea` (Effective Address) Expressions

`ea` denotes an address, not a value. Allowed:

- storage symbols: `globals` names, `data` names, `bin` base names
- function-scope symbols: argument names and local `var` names (as frame slots)
- field access: `rec.field`
- indexing: `arr[i]` and nested `arr[r][c]` (index forms as defined above)
- address arithmetic: `ea + imm`, `ea - imm`

Conceptually, an `ea` is a base address plus a sequence of **address-path** segments: `.field` selects a record field, and `[index]` selects an array element. Both forms produce an address; dereference requires parentheses as described in 6.1.

Value semantics note (v0.2):

- `rec.field` and `arr[idx]` are place expressions (addressable locations).
- In scalar value/store instruction contexts (for example `LD A, rec.field`, `LD rec.field, A`), the compiler inserts required load/store lowering.
- In explicit address contexts (for example `ea`-typed matchers/parameters), the same place expression is used as an address value.
- Explicit address-of syntax (for example `@rec.field`) is deferred to v0.3; v0.2 uses context to disambiguate.

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
  - at most one optional `var` block
  - instruction stream starts after the optional `var` block (or immediately if no `var` block)
  - `end` terminates the function body
- Function instruction streams may contain Z80 mnemonics, `op` invocations, and structured control flow (Section 10).

Function-local `var` declaration forms (v0.2):

- scalar storage declaration: `name: Type`
- scalar value initializer: `name: Type = valueExpr`
- alias initializer: `name = rhs`

Function-local `var` invalid forms and rules:

- typed alias is invalid: `name: Type = rhs`
- non-scalar local storage declaration without alias init is invalid in this scope
- non-scalar locals are allowed only via alias form (`name = rhs`) and allocate no frame slot

Examples (normative classification):

```zax
globals
  table: byte[4] = { 1, 2, 3, 4 }

func sample(): void
  var
    a: word = 0             ; valid scalar value-init
    b = table               ; valid alias-init
    bad: byte[4] = table    ; invalid typed alias form
  end
end
```

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
- Register/flag volatility (typed call boundary, v0.2):
  - typed `func`/`extern func` call sites are preservation-safe at the language boundary.
  - `HL` is boundary-volatile for all typed calls (including `void`).
  - non-`void` calls use `HL` as return channel (`L` for byte returns).
  - all non-`HL` registers/flags are boundary-preserved by typed-call glue.
  - this boundary guarantee is compiler-generated call glue; explicit raw Z80 `call` mnemonics remain raw assembly semantics.

Notes (v0.2):

- Arguments are stack slots, regardless of declared type. For `byte` parameters, the low byte carries the value and the high byte is ignored (recommended: push a zero-extended value).
- `void` functions return no value.

Non-scalar argument contract (v0.2):

- Non-scalar parameters are passed in one 16-bit argument slot as address-like references.
- Parameter type controls callee semantics:
  - `T[]` means element-shape contract only (length unspecified by signature).
  - `T[N]` means exact-length contract.
- Compatibility:
  - passing `T[N]` to `T[]` is allowed.
  - passing `T[]` to `T[N]` is rejected unless compiler can prove length is exactly `N`.
  - element-type mismatch is rejected.
- This is a type/semantic rule; stack width remains one 16-bit slot for non-scalar args.

### 8.3 Calling Functions From Instruction Streams

Inside a function/op instruction stream, a line starting with a function name invokes that function.

Syntax:

- `name` (call with zero arguments)
- `name <arg0>, <arg1>, ...` (call with arguments)

Argument values (v0.2):

- `reg16`: passed as a 16-bit value.
- `reg8`: passed as a zero-extended 16-bit value.
- `imm` expression: passed as a 16-bit immediate.
- `ea` expression: passed as the 16-bit address value.
- `(ea)` dereference: reads from memory and passes the loaded value (word or byte depending on the parameter type; `byte` is zero-extended).

Calls follow the calling convention in 8.2 (compiler emits the required pushes, call, and any temporary saves/restores).

Example:

```zax
globals
  sample_bytes: byte[10] = { 1,2,3,4,5,6,7,8,9,10 }

func sum_fixed_10(values: byte[10]): word
  ; fixed-length contract
end

func sum_any(values: byte[]): word
  ; flexible array-view contract
end

export func main(): void
  sum_fixed_10 sample_bytes   ; valid
  sum_any sample_bytes        ; valid ([10] -> [])
end
```

Parsing and name resolution (v0.2):

- If an instruction line begins with `<ident>:` it defines a local label in a function or op body. Labels defined in op bodies are hygienically rewritten per expansion site to avoid collisions. Any remaining tokens on the line are parsed as another instruction line (mnemonic/`op`/call/etc.).
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
  2. locals/args (frame-bound names)
  3. module-scope symbols (including `const` and enum members)
     otherwise a compile error (unknown symbol).

### 8.4 Stack Frames and Locals (IX-anchored frame model)

- Framed functions use `IX` as frame anchor.
- Canonical frame setup:
  - `PUSH IX`
  - `LD IX, 0`
  - `ADD IX, SP`
- Arguments and locals are addressed by fixed offsets from `IX`.
- Slot model in current ABI:
  - each argument is one 16-bit slot
  - local scalar storage declarations allocate one 16-bit slot each
- Local storage allocation in this scope remains scalar-slot based (`byte`, `word`, `addr`, `ptr`, or aliases resolving to those scalar types).
- Non-scalar locals are permitted only as alias declarations (`name = rhs`) and do not allocate frame slots.

Frame shape:

- `IX+0..1`: saved prior `IX`
- `IX+2..3`: return address
- `IX+4..`: arguments (0-based word slots)
- `IX-1..`: local scalar slots

Return and cleanup model:

- If a synthetic epilogue is required (`frameSize > 0`, or at least one conditional `ret <cc>` exists), the compiler creates a per-function hidden label:
  - current implementation naming convention: `__zax_epilogue_<n>`
- `ret` and `ret <cc>` in user-authored instruction streams are rewritten to jumps to that synthetic epilogue.
- The synthetic epilogue pops local slots (if any) and performs the final `ret` to caller.
- If there are no locals and no conditional returns, plain `ret` is emitted directly with no synthetic epilogue.
- Canonical epilogue shape for framed functions:
  - restore preserved registers (policy-defined set)
  - `LD SP, IX`
  - `POP IX`
  - `RET`

`retn`/`reti`:

- They are permitted as raw instructions.
- They are not rewritten by this mechanism; only `ret`/`ret <cc>` participate in epilogue rewriting.
- In functions with locals (`frameSize > 0`), `retn`/`reti` are rejected with a compile error because they bypass local-frame cleanup.

The compiler tracks stack depth across the function instruction stream for call-boundary and control-join safety checks.

### 8.5 SP Mutation Rules in Instruction Streams

The compiler tracks SP deltas for:

- `push`, `pop`, `call`, `ret`, `retn`, `reti`, `rst`
- `inc sp`, `dec sp`
- `ex (sp), hl`, `ex (sp), ix`, `ex (sp), iy` (net delta 0)

Other SP assignment instructions (v0.1):

- Instructions that assign to `SP` (e.g., `ld sp, hl`, `ld sp, ix`, `ld sp, iy`, `ld sp, imm16`) are permitted but the compiler does not track their effects.
- When using untracked SP assignment:
  - The programmer is responsible for ensuring SP is correct at structured-control-flow joins and at function exit.
  - Frame-slot addressing uses `IX` offsets; untracked SP assignment still risks breaking call-boundary and epilogue correctness.
  - Current compiler behavior: when stack slots are present (locals and/or params), call-like boundaries (`call`, `rst`) reached with positive tracked stack delta, or after untracked/unknown stack state, are diagnosed.

Note (v0.1):

- The compiler may emit additional SP-mutating instructions in its own prologue/epilogue sequences.

Stack-depth constraints (v0.1):

- At any structured-control-flow join (end of `if`/`else`, loop back-edges, and loop exits), stack depth must match across all paths.
  - Paths that terminate (e.g., `ret`, or an unconditional `jp`/`jr` that exits the construct) do not participate in join stack-depth matching.
- The end of a `select ... end` is also a join point: stack depth must match across all `case`/`else` arms that reach `end`.
- `op` expansion is inline; stack effects are enforced only by these same enclosing function-stream rules.

---

## 9. `op` (Inline Macro-Instructions)

### 9.1 Purpose

`op` defines opcode-like inline macros with compiler-level operand matching. This is used to express accumulator-shaped instruction families and provide ergonomic “opcode-like functions.”

Normative reference:

- Appendix E of this document provides expanded op-system implementation detail.
- This document remains the primary language authority.
- No appendix content may introduce normative behavior absent or contradictory to Sections 1-10.

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
- Local label definitions (`<ident>:`) are permitted inside `op` bodies and must be hygienically rewritten per expansion site.
- `end` terminates the `op` body.
  - `op` bodies may contain structured control flow that uses `end` internally; the final `end` closes the `op` body.
- `op` bodies may be empty (no instructions).
- `op` invocations are permitted inside function/op instruction streams.
- Cyclic `op` expansion is a compile error.

Notes (v0.2):

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
- `IX`/`IY` indexed addressing is matchable via `idx16` matcher forms in v0.2.
- Condition codes are matchable via `cc` in v0.2.

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

### 9.5 Op Clobber and Stack Policy

Ops are inline expansions. They do not have a hidden preservation boundary of their own.

- Register/flag effects of an `op` are the effects of the expanded instruction sequence.
- Stack effects inside an `op` are developer-managed and evaluated by normal enclosing function-stream rules.
- Preservation-safe behavior is guaranteed at typed function-call boundaries (Section 8.2), not at arbitrary inline `op` boundaries.

Destination parameters (v0.2):

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
  case Mode.Read
    ld a, 'R'
  case Mode.Write
    ld a, 'W'
  else
    ld a, '?'
end
```

### 10.4 Local Labels (Discouraged, Allowed in Functions and Ops)

ZAX discourages labels in favor of structured control flow, but allows **local labels** within function and `op` instruction streams for low-level control flow.

Label definition syntax (v0.1):

- `<ident>:` at the start of an instruction line defines a local label at the current code location.
  - A label definition may be followed by an instruction on the same line (e.g., `loop: djnz loop`) or may stand alone.

Scope and resolution (v0.2):

- Local labels are scoped to the enclosing `func` or `op` body and are not exported.
- Labels in `op` bodies are hygienically rewritten per expansion site so separate expansion instances cannot collide.
- A local label may be referenced before its definition within the same function instruction stream (forward reference).
- Local label names must not collide with reserved names (Section 1.5), ignoring case.
- When resolving an identifier in an instruction operand, local labels take precedence over locals/args, which take precedence over global symbols.

Usage (v0.1):

- A local label name may be used anywhere a Z80 mnemonic expects an address/immediate (e.g., `jp loop`, `jr nz, loop`, `djnz loop`).
- For relative branches (`jr`, `djnz`), the displacement must fit the instruction encoding; otherwise it is a compile error.

---

## 11. v0.1 -> v0.2 Migration (Normative)

This section defines required source migration behavior for programs moving from v0.1 semantics to v0.2 semantics.

### 11.1 Required Source Updates

1. Composite storage semantics (`array`/`record`/`union`) use power-of-2 storage sizes.
   - Update any code that assumed packed composite sizes.
   - `sizeof` and indexed addressing use storage size, not natural packed size.
2. Runtime indexed addressing uses direct-register indexing for `arr[HL]`/`arr[DE]`/`arr[BC]`.
   - If legacy code intended indirect-byte indexing through `HL`, rewrite to `arr[(HL)]`.
3. Typed scalar variables use value semantics in `LD` and typed call-argument positions.
   - Rewrite legacy scalar dereference forms (`(arg)`) to direct scalar forms (`arg`) for value loads/stores.
4. Enum members require qualification.
   - Rewrite unqualified members (`Read`) to `EnumName.Member` (`Mode.Read`).
5. `sizeof` and `offsetof` use storage-size rules.
   - Recompute constants that depended on v0.1 packed-size assumptions.
6. Typed internal calls are preservation-safe at the language boundary.
   - `HL` is boundary-volatile for all typed calls (including `void`).
   - Non-`void` typed calls use `HL` as return channel (`L` for byte).
   - Other registers/flags are boundary-preserved by typed-call glue.
   - Do not apply these guarantees to raw Z80 `call` mnemonics.

### 11.2 Before/After Migration Examples

`arr[HL]` semantics:

```zax
; v0.1 intent: index comes from byte at memory[HL]
ld a, arr[HL]

; v0.2 equivalent
ld a, arr[(HL)]

; v0.2 direct 16-bit register index
ld a, arr[HL]
```

Scalar value semantics:

```zax
; v0.1 style
ld a, (arg)
ld (arg), a

; v0.2 style
ld a, arg
ld arg, a
```

`sizeof` storage-size semantics:

```zax
type Sprite
  x: byte
  y: byte
  tile: byte
  flags: word
end

; v0.1 packed-oriented expectation would be 5
; v0.2 storage-size result is 8
const SpriteBytes = sizeof(Sprite)
```

Typed call boundary expectations:

```zax
extern func putc(ch: byte): void at $F003
extern func next_char(): byte at $F010

; v0.2 typed-call boundary:
; - putc may leave HL undefined (HL is boundary-volatile)
; - next_char preserves all regs/flags except HL (L carries byte return)
putc A
next_char
```

### 11.3 Diagnostic Guidance

- Compilers must emit an error for unqualified enum member references.
- Compilers must emit an error when index expressions use unsupported forms for v0.2 grammar/semantics.
- Compilers should emit diagnostics that distinguish typed-call boundary guarantees from raw Z80 `call` behavior.
- Compilers may emit warnings when composite storage padding materially increases natural packed size.
- Compilers must emit an error for typed alias forms (`name: Type = rhs`) in both `globals` and function-local `var`.
- Compilers must emit an error for non-scalar local storage declarations without alias initialization.

## 12. Examples (Non-normative)

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

## Appendix C: v0.1 -> v0.2 Migration Coverage Tracker

This appendix tracks migration-coverage status against the normative language rules in Sections 1-12.

### C.1 Breaking Changes Checklist

- [x] Composite storage semantics are power-of-2 for arrays/records/unions; padding is storage-visible for layout, `sizeof`, and indexing. (Sections 4.1, 5.1, 5.2, 5.3, 11.1)
- [x] Runtime index scaling is shift-only (`ADD HL,HL` chains); no multiply-based lowering for indexed composite access. (Sections 5.1, 11.1)
- [x] `arr[HL]` is a 16-bit direct index; indirect byte-at-HL indexing uses `arr[(HL)]`. (Sections 5.1, 11.1, 11.2)
- [x] Typed scalar variables use value semantics; legacy scalar paren-dereference examples are removed from normative guidance. (Sections 6.1, 7, 11.1, 11.2)
- [x] Enum members require qualification (`EnumType.Member`); unqualified members are compile errors. (Sections 4.3, 11.1, 11.3)
- [x] `sizeof` semantics are storage-size semantics (including composite padding), replacing v0.1 packed-oriented behavior. (Sections 4.1, 4.4, 11.1, 11.2)
- [x] `offsetof` rules are fully specified (records, nested constant-index paths, and union-member path behavior). (Sections 4.4, 5.2, 5.3)
- [x] Typed internal call boundaries are preservation-safe with `HL` boundary-volatile for all typed calls; non-void returns publish via `HL`/`L`. (Sections 8.2, 11.1, 11.2)

### C.2 Migration Guidance Coverage

- [x] Normative migration subsection maps each breaking change to required source updates. (Section 11.1)
- [x] Before/after examples added for high-impact syntax and semantic changes (`arr[HL]`, `sizeof`, scalar value semantics, call-boundary expectations). (Section 11.2)
- [x] Diagnostics guidance added for common v0.1 -> v0.2 upgrade failures. (Section 11.3)

### C.3 Transition-Record Retirement Criteria

- [x] Every C.1 item is covered by normative language in this file.
- [x] `docs/v01-scope-decisions.md` is explicitly marked archival-only.
- [x] `docs/README.md` continues to identify this file as the sole canonical source.
````

## Appendix D: CLI Contract (Non-normative)

This appendix consolidates former `docs/zax-cli.md` content. It is non-normative and cannot override language rules in this specification.

This document describes recommended command-line behavior for the **ZAX assembler**. It is non-normative: the language rules live in `docs/zax-spec.md`.

The goal is to feel familiar to assembler users (similar to `asm80`) while supporting required ZAX outputs: **BIN**, **Intel HEX**, and **D8 Debug Map (D8M)**.

## Invocation shape

```
zax [options] <entry.zax>
```

`<entry.zax>` is the entry module and must be the **last** argument (assembler-style).

## Status (current implementation)

The v0.1 CLI exists as `src/cli.ts` and is exposed via:

```
yarn -s zax -- [options] <entry.zax>
```

This runs `yarn -s build` first and then executes `dist/src/cli.js`.

## Primary output and derived artifacts

ZAX uses a single “primary output path” to derive sibling artifacts.

- Primary output path:
  - `-o, --output <file>` sets the primary output file path.
  - If omitted, the default primary output path is `<entryDir>/<base>.hex`.
- Default primary output type: `hex`.
- Artifact base:
  - `artifactBase = primaryOutputPath without its extension`
  - When enabled, the assembler writes sibling artifacts next to the primary output:
    - Intel HEX: `artifactBase + ".hex"`
    - Flat binary: `artifactBase + ".bin"`
    - Listing: `artifactBase + ".lst"`
    - Debug map (D8M v1): `artifactBase + ".d8dbg.json"`
    - Lowering trace source: `artifactBase + ".asm"`

Listing note:

- In v0.1, `.lst` is a deterministic byte dump with an ASCII gutter plus a symbol table (not a full source listing).
- Sparse/unwritten bytes inside the written range are rendered as `..` in the hex column.
- Fully empty line spans are collapsed into deterministic `; ... gap $XXXX..$YYYY` markers.
- Use `.d8dbg.json` (D8M) for debugger-grade source mapping.
- D8M emits sparse contiguous `segments` plus `addressWidth: 16` and `endianness: "little"` metadata.
- Intel HEX output emits only records for written addresses (sparse gaps are not zero-filled into intermediate records).

Directory creation:

- If `--output` points into a directory that does not exist, the assembler creates it.

Path handling:

- Accept user-supplied paths as-is (Windows paths, drive letters, separators).
- For debug maps, file keys should be normalized to project-relative paths with `/` separators (see `docs/zax-spec.md`, Appendix B).

## Options (proposed v0.1 baseline)

Keep switches intentionally small:

- `-o, --output <file>` Primary output path (used to derive sibling outputs)
- `-t, --type <type>` Primary output type (default: `hex`)
  - supported: `hex`, `bin`
- `-n, --nolist` Suppress `.lst`
- `--nobin` Suppress `.bin`
- `--nohex` Suppress `.hex`
- `--nod8m` Suppress `.d8dbg.json`
- `--noasm` Suppress `.asm` lowering trace output
- `-I, --include <dir>` Add import search path (repeatable)
- `--case-style <mode>` Optional case-style linting for asm keywords/registers
  - supported: `off`, `upper`, `lower`, `consistent`
- `-V, --version`
- `-h, --help`

## Error contract (current implementation)

- CLI argument/shape errors exit with code `2`, print a `zax:` error line, and include usage text.
- Compile diagnostics errors exit with code `1`, do **not** print usage text, and print source diagnostics only.
- Warnings (for example case-style lint findings) are printed to stderr but still exit with code `0` when there are no errors.
- Source diagnostics include stable diagnostic IDs (for example `[ZAX001]`, `[ZAX003]`, `[ZAX100]`) so tooling/tests can pin failure classes.

## Deterministic module order (imports)

When the entry module imports other modules, the assembler resolves an import graph and chooses a deterministic module order:

- Dependencies are ordered before dependents (topological order).
- Ties are broken by canonical module ID (file stem), then by a normalized module path.

This order is used when packing output sections so builds are stable and independent of filesystem enumeration order.

## Debug80 integration note

Debug80 expects to find:

- `<artifactBase>.hex`
- `<artifactBase>.lst` (unless suppressed)
- `<artifactBase>.d8dbg.json`
- `<artifactBase>.asm` (unless suppressed)

Co-locating these artifacts via the `--output`/artifactBase rule is the simplest integration strategy.

## Appendix E: Op System Deep Reference (Non-normative)

This appendix consolidates former `docs/zax-op-system-spec.md` content. It is detailed implementation/reference guidance and cannot override language rules in this specification.

This document expands Section 9 of the ZAX language specification (`docs/zax-spec.md`). It serves as a standalone reference for the `op` system: inline macro-instructions with AST-level operand matching.

**Audience and purpose.** This document has two audiences:

1. **Implementers** (including AI assistants building the compiler) need precise algorithms, complete edge-case coverage, and unambiguous rules that translate directly to code.

2. **Advanced users** (programmers writing ZAX code) need to understand how ops behave, how to design op families, and how to diagnose problems when expansions fail.

The document addresses both by stating normative rules precisely while also explaining the rationale and providing worked examples.

**Document conventions:**

- Normative rules are stated directly in prose. Where precision is critical, rules are numbered or bulleted.
- Examples are illustrative unless marked "(normative example)".
- Cross-references to the main spec use the form "Section N of the main spec" to mean `docs/zax-spec.md` Section N.
- Implementation notes marked "(impl)" are recommendations for compiler authors; any compliant implementation that produces the same observable behavior is acceptable.
- Algorithm descriptions use pseudocode for clarity; actual implementation may differ in structure as long as behavior matches.

**Version:** This specification corresponds to ZAX v0.2 on `main`.
Normative precedence: `docs/zax-spec.md` governs language behavior; this document expands op-specific details and must not introduce conflicting normative rules.
Authority constraint: if behavior is required by this document but not required by `docs/zax-spec.md`, treat it as implementation guidance until promoted into `docs/zax-spec.md`.

**Related documents:**

- `docs/zax-spec.md` — The main ZAX language specification
- `docs/zax-dev-playbook.md` — Implementation planning, rollout, and contributor workflow

---

## 1. What Ops Are (and What They Are Not)

An `op` in ZAX is an inline macro-instruction that the compiler expands at the AST level during lowering. When you write an `op` invocation inside a function/op instruction stream, the compiler selects the best-matching overload, substitutes the caller's operands into the op body, and emits the resulting instruction sequence in place — as if you had written those instructions directly.

### 1.1 Comparison with Other Macro Systems

Understanding ops requires contrasting them with familiar alternatives:

**Textual macros (traditional assemblers).** TASM, MASM, and similar assemblers provide text-substitution macros. The macro expander operates before parsing: it pastes tokens, re-scans them, and hopes the result parses. This approach has well-known problems. Parameters can accidentally concatenate with surrounding tokens. Internal labels can collide with caller labels (the "hygiene" problem). Error messages point to expanded text, not the original macro invocation. Nested macros interact in surprising ways. There is no notion of operand types, so the same macro body might accidentally work for some operands and fail cryptically for others.

**C preprocessor macros.** The C preprocessor shares most of textual macro problems. The `#define` mechanism operates on tokens before the C parser sees them. Parenthesization discipline can prevent some operator-precedence bugs, but the fundamental fragility remains.

**C++ templates.** Templates operate on parsed, typed AST nodes. This is closer to ZAX ops: the compiler knows the types of template parameters and can perform type checking after substitution. However, C++ templates are primarily a type-parameterization mechanism, not an inline code-generation mechanism. They also carry substantial complexity (SFINAE, template specialization rules, and two-phase name lookup).

**ZAX ops** take the AST-level approach of templates but apply it to assembly-language semantics. The compiler knows that a parameter declared as `reg16` will only ever bind to `HL`, `DE`, `BC`, or `SP` — not to an arbitrary token that happens to look like a register name in some contexts. This means the compiler can reason about ops statically: it can check that an expansion will produce valid instructions and resolve overloads unambiguously — but register/flag effects remain whatever the inline instructions do.

### 1.2 Ops vs Functions

Ops are _not_ functions. They have no stack frame, no calling convention, no return address. An op expansion is purely inline: the instructions appear in the caller's code stream at the point of invocation. There is no `call` or `ret` involved. This is what makes ops zero-overhead — but it also means that ops cannot be recursive (cyclic expansion is a compile error) and cannot declare local variables.

| Aspect                | `op`                               | `func`                        |
| --------------------- | ---------------------------------- | ----------------------------- |
| Invocation cost       | Zero (inline expansion)            | `call`/`ret` overhead         |
| Stack frame           | None                               | Optional (if locals declared) |
| Recursion             | Forbidden (cyclic expansion error) | Permitted                     |
| Local variables       | Forbidden                          | Permitted (`var` block)       |
| Overloading           | By operand matchers                | Not supported for functions   |
| Register/flag effects | Inline code semantics              | Caller-save convention        |

### 1.3 When to Use Ops

Use ops when you want:

- **Instruction-like syntax** for common patterns that the Z80 doesn't directly support
- **Zero overhead** — no call/ret, no stack frame setup
- **Overloading** by register type or immediate size
- **Inline expansion** with explicit, visible instruction effects

Use functions when you need:

- **Recursion** or mutual recursion
- **Local variables** (stack slots)
- **Single definition** for code that appears in multiple places (ops inline everywhere, increasing code size)
- **Indirect calls** (function pointers)

### 1.4 The Design Intent

The design intent is to let you build opcode-like families — things that _feel_ like native Z80 instructions but express patterns the hardware doesn't directly support.

The design intent is to let you build opcode-like families — things that _feel_ like native Z80 instructions but express patterns the hardware doesn't directly support. The classic example is 16-bit addition into a register pair other than `HL`:

```
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
  push bc
  pop hl
  add hl, src
  push hl
  pop bc
  pop hl
end
```

At the call site, `add16 DE, BC` reads like a native instruction. The compiler selects the `DE` overload, substitutes `BC` for `src`, and emits the exchange-based sequence. Because ops are inline expansions, any register/flag effects are exactly the effects of the instructions written in the op body.

---

## 2. Declaration Syntax and Scope

### 2.1 Basic Form

An op is declared at module scope with the `op` keyword, followed by a name, an optional parameter list in parentheses, and a body terminated by `end`:

```
op clear_carry
  or a
end

op load_pair(dst: reg16, src: imm16)
  ld dst, src
end
```

The body is an implicit instruction stream. The `asm` marker keyword is not used in op bodies. The instructions in the body follow exactly the same grammar as instructions inside function instruction streams: raw Z80 mnemonics, other op invocations, and structured control flow (`if`/`while`/`repeat`/`select`) are permitted. Local labels inside op bodies are allowed and must be hygienically rewritten per expansion site.

Compatibility note: early drafts allowed an explicit `asm` marker in declaration bodies. Current behavior removes that form. The parser emits explicit diagnostics when `asm` appears in function/op bodies and continues recovery.

An op body may be empty (containing no instructions between the declaration line and `end`). This is occasionally useful as a no-op placeholder during development or as a deliberately empty specialization.

### 2.2 Zero-Parameter Ops

An op with no parameters omits the parentheses entirely:

```
op halt_system
  di
  halt
end
```

At the call site, you invoke it by writing just the name on an instruction line:

```
func panic(): void
  halt_system
end
```

This form is useful for giving a meaningful name to a short idiom that takes no operands.

### 2.3 Scope and Nesting Rules

Ops are module-scope declarations only. You cannot define an op inside a function body, inside another op, or inside any other block. However, op _invocations_ are permitted anywhere an instruction can appear: inside function instruction streams and inside other op bodies.

An op may invoke other ops in its body, but the expansion graph must be acyclic. If expanding op `A` would require expanding op `B`, which in turn requires expanding op `A`, the compiler reports a cyclic expansion error. The compiler detects this statically during expansion, not at runtime.

**Forward references.** An op may be invoked before it is declared, consistent with ZAX's whole-program compilation model (Section 3.2 of the main spec). All op declarations are visible throughout the module and any importing modules.

**Import visibility.** Ops follow the same visibility rules as other module-scope declarations. Ops are public; the `export` keyword is accepted for clarity/forward compatibility.

### 2.4 No Locals

Op bodies do not support `var` blocks. If an expansion needs scratch storage, the op author must manage it through register usage and explicit `push`/`pop` pairs. This restriction keeps ops simple and predictable — there is no hidden stack frame, no frame pointer manipulation, and no interaction with the function-level SP tracking beyond what the op's own `push`/`pop` instructions contribute.

---

## 3. Operand Matchers: The Type System for Op Parameters

The heart of the op system is its operand matchers. Each parameter in an op declaration carries a matcher type that constrains which call-site operands can bind to that parameter. Matchers are not runtime types — they are compile-time patterns that the compiler uses during overload resolution.

### 3.1 Register Matchers

**`reg8`** matches any of the seven general-purpose 8-bit registers: `A`, `B`, `C`, `D`, `E`, `H`, `L`. When a `reg8` parameter binds to a call-site operand, the bound register token is substituted directly into the op body wherever the parameter name appears.

**`reg16`** matches any of the four 16-bit register pairs: `HL`, `DE`, `BC`, `SP`. The same substitution rule applies.

**Fixed-register matchers** constrain a parameter to exactly one register. Writing `dst: HL` means this overload only matches when the caller passes `HL` in that position. Fixed-register matchers exist for `A`, `HL`, `DE`, `BC`, and `SP`.

The distinction between a fixed matcher and a class matcher is central to overload resolution. When the caller writes `add16 HL, BC`, both an overload with `dst: HL` and an overload with `dst: reg16` would accept `HL` in the first position. The fixed matcher wins because it is more specific (Section 5).

`IX` and `IY` are matchable in v0.2 through `idx16`, and condition codes are matchable through `cc`.

### 3.2 Immediate Matchers

**`imm8`** matches any compile-time immediate expression (per Section 7.1 of the spec) whose value fits in 8-bit encoding range (`-128..255`). When substituted into the op body, the parameter carries the evaluated immediate value.

**`imm16`** matches any compile-time immediate expression whose value fits in 16-bit encoding range (`-32768..65535`).

An important subtlety: a value like `42` fits in both `imm8` and `imm16`. The overload resolver treats `imm8` as more specific than `imm16` for values that fit in 8 bits (Section 5). This lets you write a fast-path overload for small immediates and a general overload for wider values:

```
op load_indexed(dst: reg8, src: imm8)
  ; fast-path: value fits in a byte
  ld dst, src
end

op load_indexed(dst: reg8, src: imm16)
  ; general case: might need wider handling
  ; (illustrative — in practice you'd rarely need this split for ld)
  ld dst, src
end
```

### 3.3 Address and Dereference Matchers

**`ea`** matches an effective-address expression as defined in Section 7.2 of the spec: storage symbols (`globals`/`data`/`bin` names), function-local names (as frame slots), field access (`rec.field`), array indexing (`arr[i]`), and address arithmetic (`ea + imm`, `ea - imm`). When substituted, the parameter carries the address expression _without_ implicit parentheses — it names a location, not its contents.

The main spec's runtime-atom expression budget applies to `ea` matching. In v0.2, matcher acceptance does not bypass that budget: if a call-site `ea` contains too many runtime atoms, the invocation is rejected before or during semantic validation.

User-facing rule of thumb (informative): one moving part per expression. If an op call-site needs multiple runtime-varying address components, stage the address over multiple lines first, then pass a simpler operand.

**`mem8`** and **`mem16`** match dereference operands: call-site operands written as `(ea)` with an implied width of 8 or 16 bits respectively. These matchers are necessary because in raw Z80 mnemonics, the width of a memory dereference is implied by the instruction form (the destination or source register determines whether you're reading a byte or a word). But in an op parameter list, you may need to explicitly declare whether a memory operand carries a byte-width or word-width dereference.

When a `mem8` or `mem16` parameter is substituted into the op body, the full dereference operand — including the parentheses — is substituted. This is a critical distinction from `ea`:

```
op read_byte(dst: reg8, src: mem8)
  ld dst, src        ; src substitutes as (ea), producing e.g. ld a, (hero.flags)
end

op get_address(dst: reg16, src: ea)
  ld dst, src        ; src substitutes as ea (no parens), producing e.g. ld hl, hero.flags
end
```

If `src` is bound to `(hero.flags)` via a `mem8` matcher, then `ld dst, src` expands to `ld a, (hero.flags)`. If `src` is bound to `hero.flags` via an `ea` matcher, then `ld dst, src` expands to `ld hl, hero.flags` — loading the _address_ of the field, not its contents.

### 3.4 Matcher Summary

The following table collects matcher types available in v0.2. The "Accepts" column describes what call-site operands can bind to a parameter of that type. The "Substitutes as" column describes what appears in the expanded op body.

| Matcher | Accepts                                | Substitutes as                        |
| ------- | -------------------------------------- | ------------------------------------- |
| `reg8`  | `A B C D E H L`                        | The register token                    |
| `reg16` | `HL DE BC SP`                          | The register pair token               |
| `A`     | `A` only                               | `A`                                   |
| `HL`    | `HL` only                              | `HL`                                  |
| `DE`    | `DE` only                              | `DE`                                  |
| `BC`    | `BC` only                              | `BC`                                  |
| `SP`    | `SP` only                              | `SP`                                  |
| `imm8`  | Immediate expression fitting 8 bits    | The immediate value                   |
| `imm16` | Immediate expression fitting 16 bits   | The immediate value                   |
| `ea`    | Effective-address expression           | The address expression (no parens)    |
| `mem8`  | `(ea)` dereference, byte-width implied | The full dereference including parens |
| `mem16` | `(ea)` dereference, word-width implied | The full dereference including parens |
| `idx16` | `IX` or `IY`                           | The index register token              |
| `cc`    | `Z NZ C NC PE PO M P`                  | The condition-code token              |

### 3.5 What Matchers Do Not Cover in v0.2

Several operand forms that exist in Z80 assembly are still not represented by dedicated op matchers in v0.2:

The `(HL)` memory operand used in Z80 byte-access instructions (like `ld a, (hl)`) is a register-indirect form, not an `ea` dereference in ZAX's sense. Its interaction with `mem8` matching is as follows: `(HL)` at a call site does not match `mem8` because `HL` is not an `ea` expression — it is a register. If you need to accept `(HL)` as an op parameter, use the fixed form in the op body directly, or provide a separate overload.

---

## 4. Substitution Mechanics

When the compiler expands an op invocation, it performs AST-level substitution: each occurrence of a parameter name in the op body is replaced with the corresponding bound operand from the call site. This substitution operates on parsed AST nodes, not on raw text.

### 4.1 What "AST-Level" Means in Practice

Consider this op and invocation:

```
op move16(dst: reg16, src: mem16)
  ld dst, src
end

; in some function body:
move16 DE, (player.pos)
```

The compiler does not paste the string `"DE"` into the string `"ld dst, src"` and re-parse. Instead, it takes the parsed AST node for the `ld` instruction in the op body, finds the parameter references `dst` and `src`, and replaces them with the AST nodes that represent `DE` (a register-pair operand) and `(player.pos)` (a dereference of a field-access EA). The result is an AST node equivalent to having written `ld de, (player.pos)` directly.

This matters because it prevents a class of bugs that plague textual macros. A textual macro might accidentally concatenate tokens in unexpected ways, or a parameter value containing special characters might be misinterpreted during re-scanning. AST substitution eliminates these failure modes entirely: the operand is already parsed and typed before substitution occurs.

### 4.2 Substitution and Instruction Validity

Substitution produces an instruction AST node, but that node must still represent a valid Z80 instruction (or a valid ZAX construct like another op invocation). If the substituted result is not encodable, the compiler reports an error at the _call site_, not at the op declaration.

This is an important design choice. An op declaration is not validated in isolation against all possible operand combinations — that would be impractical for class matchers like `reg16` where four different registers could be bound. Instead, the op body is treated as a template, and validity is checked after substitution for each concrete invocation.

For example:

```
op swap_with_mem(dst: reg16, src: mem16)
  ex dst, src       ; not a valid Z80 instruction for arbitrary reg16
end
```

This op declaration is accepted by the parser (the body is syntactically valid as an instruction template). But invoking `swap_with_mem DE, (buffer)` will fail during encoding because `ex de, (buffer)` is not an encodable Z80 instruction. The diagnostic points to the call site and explains that the expansion produced an invalid instruction.

This means that op authors bear responsibility for ensuring their bodies are valid for all operands the matcher accepts. If an op only works for a subset of a class matcher, the author should use fixed-register matchers or document the limitation. The compiler will catch invalid expansions, but the error will be reported to the _caller_, which can be confusing if the caller doesn't know the op's internals.

### 4.3 Nested Op Invocations

An op body may invoke other ops. Substitution is applied first to the outermost op, producing an instruction sequence that may itself contain op invocations. Those inner invocations are then expanded in turn, with their own overload resolution and substitution. This process continues until no op invocations remain.

```
op clear_carry
  or a
end

op safe_add16(dst: reg16, src: reg16)
  clear_carry
  add16 dst, src
end
```

Expanding `safe_add16 DE, BC` first substitutes `DE` and `BC` into the body, producing `clear_carry` followed by `add16 DE, BC`. Then `clear_carry` expands to `or a`, and `add16 DE, BC` expands via its `DE`-specific overload. The final instruction sequence is the concatenation of all expanded instructions.

The compiler tracks the expansion stack and reports a cyclic expansion error if it detects that expanding op `X` eventually leads back to expanding op `X` again, regardless of the depth of nesting.

### 4.4 Labels Inside Ops (v0.2 Rule)

Local labels are allowed inside op bodies in v0.2. Implementations must perform hygiene/name-mangling per expansion site so independent expansion instances cannot collide.

**(impl)** The compiler should rewrite op-local labels to unique internal names keyed by expansion site while preserving diagnostics at source-level labels.

### 4.5 Expansion Algorithm Summary

For implementers, the complete expansion algorithm is:

```
function expand_op(call_site, op_name, operands):
    // 1. Overload resolution (Section 5)
    candidates = filter_matching_overloads(op_name, operands)
    if candidates.empty():
        error("no matching overload", call_site)
    winner = select_most_specific(candidates)
    if winner is ambiguous:
        error("ambiguous overload", call_site, candidates)

    // 2. Cycle detection
    if op_name in expansion_stack:
        error("cyclic expansion", expansion_stack)
    expansion_stack.push(op_name)

    // 3. Bind operands to parameters
    bindings = zip(winner.parameters, operands)

    // 4. Clone and substitute
    expanded_body = deep_clone(winner.body)
    for each instruction in expanded_body:
        substitute_parameters(instruction, bindings)
        rewrite_local_labels_hygienically(instruction, call_site)

    // 5. Recursive expansion of nested ops
    for each instruction in expanded_body:
        if instruction is op_invocation:
            replace instruction with expand_op(instruction.site, ...)

    expansion_stack.pop()
    return expanded_body
```

---

## 5. Overload Resolution and Specificity

### 5.1 The Resolution Problem

A single op name may have multiple overloads — declarations with the same name but different parameter matchers. When the compiler encounters an op invocation, it must determine which overload to use. This is the overload resolution problem, and ZAX solves it with a specificity-based ranking system.

### 5.2 Candidate Selection

The first step is candidate filtering: the compiler examines each overload of the named op and checks whether the call-site operands satisfy all parameter matchers. An overload is a candidate if and only if every call-site operand matches the corresponding parameter's matcher type.

For example, given the call `add16 HL, BC`:

- An overload `add16(dst: HL, src: reg16)` is a candidate because `HL` matches the fixed `HL` matcher and `BC` matches `reg16`.
- An overload `add16(dst: reg16, src: reg16)` is also a candidate because `HL` matches `reg16` and `BC` matches `reg16`.
- An overload `add16(dst: DE, src: reg16)` is _not_ a candidate because `HL` does not match the fixed `DE` matcher.

If no overloads are candidates, the compiler reports a "no matching overload" error at the call site.

### 5.3 Specificity Ranking

If multiple candidates survive filtering, the compiler ranks them by specificity. The core principle is: **more constrained matchers are more specific**. The ranking rules, applied per-parameter and then aggregated, are:

**Fixed register beats class.** A parameter declared as `HL` (accepting only `HL`) is more specific than one declared as `reg16` (accepting `HL`, `DE`, `BC`, or `SP`). Similarly, `A` is more specific than `reg8`.

**`imm8` beats `imm16`** for values that fit in 8 bits. If a call-site operand is the immediate value `42`, both `imm8` and `imm16` match, but `imm8` is more specific because it constrains the value to a narrower range.

**`mem8` and `mem16` beat `ea`.** A dereference operand `(buffer)` matches both `mem8` (or `mem16`) and `ea`, but the memory matchers are more specific because they constrain the operand to be a dereference, not just an address.

To compare two candidate overloads, the compiler compares them parameter-by-parameter. Overload X is _strictly more specific_ than overload Y if, for every parameter position, X's matcher is at least as specific as Y's, and for at least one position, X's matcher is strictly more specific.

### 5.3.1 Specificity Algorithm

**(impl)** The following algorithm implements specificity comparison:

```
function compare_specificity(overload_X, overload_Y, operands):
    // Returns: "X_wins", "Y_wins", "equal", or "incomparable"

    x_better_count = 0
    y_better_count = 0

    for i in 0..operands.length:
        x_matcher = overload_X.parameters[i].matcher
        y_matcher = overload_Y.parameters[i].matcher
        operand = operands[i]

        cmp = compare_matcher_specificity(x_matcher, y_matcher, operand)
        if cmp == "X_more_specific":
            x_better_count += 1
        else if cmp == "Y_more_specific":
            y_better_count += 1
        // if "equal", neither count increments

    if x_better_count > 0 and y_better_count == 0:
        return "X_wins"
    else if y_better_count > 0 and x_better_count == 0:
        return "Y_wins"
    else if x_better_count == 0 and y_better_count == 0:
        return "equal"
    else:
        return "incomparable"  // leads to ambiguity

function compare_matcher_specificity(matcher_X, matcher_Y, operand):
    // Specificity ordering (most to least specific):
    // Fixed register > reg8/reg16 > (none for registers)
    // imm8 > imm16 (for values fitting in 8 bits)
    // mem8/mem16 > ea

    if matcher_X == matcher_Y:
        return "equal"

    // Fixed vs class for registers
    if is_fixed_register(matcher_X) and is_class_register(matcher_Y):
        return "X_more_specific"
    if is_class_register(matcher_X) and is_fixed_register(matcher_Y):
        return "Y_more_specific"

    // imm8 vs imm16
    if matcher_X == "imm8" and matcher_Y == "imm16":
        if operand.value fits in 8 bits:
            return "X_more_specific"
        else:
            return "equal"  // both match equally for large values
    if matcher_X == "imm16" and matcher_Y == "imm8":
        if operand.value fits in 8 bits:
            return "Y_more_specific"
        else:
            return "equal"

    // mem8/mem16 vs ea
    if (matcher_X == "mem8" or matcher_X == "mem16") and matcher_Y == "ea":
        return "X_more_specific"
    if matcher_X == "ea" and (matcher_Y == "mem8" or matcher_Y == "mem16"):
        return "Y_more_specific"

    // mem8 vs mem16: equal specificity (both require dereference)
    if (matcher_X == "mem8" and matcher_Y == "mem16") or
       (matcher_X == "mem16" and matcher_Y == "mem8"):
        return "equal"

    // If we reach here, matchers are incomparable
    return "equal"
```

### 5.3.2 Selecting the Winner

After computing specificity comparisons for all candidate pairs:

```
function select_most_specific(candidates):
    if candidates.length == 0:
        error("no matching overload")

    if candidates.length == 1:
        return candidates[0]

    // Find a candidate that beats all others
    for each candidate X in candidates:
        beats_all = true
        for each candidate Y in candidates where Y != X:
            cmp = compare_specificity(X, Y, operands)
            if cmp != "X_wins":
                beats_all = false
                break
        if beats_all:
            return X

    // No single winner; check for ambiguity
    error("ambiguous overload", candidates)
```

### 5.4 The Ambiguity Error

If two candidates are equally specific — neither is strictly more specific than the other — the compiler cannot choose between them and reports an ambiguity error. This is a deliberate design choice: silent tie-breaking (e.g., "pick the first declared overload") would make op behavior depend on source ordering in fragile and surprising ways.

Consider this problematic set of overloads:

```
op problem(dst: HL, src: reg16)
  ; overload A: specific in first param, general in second
  ...
end

op problem(dst: reg16, src: BC)
  ; overload B: general in first param, specific in second
  ...
end
```

The call `problem HL, BC` matches both overloads. Overload A is more specific in the first parameter (`HL` vs `reg16`), but overload B is more specific in the second parameter (`BC` vs `reg16`). Neither is strictly more specific overall, so the compiler reports an ambiguity. The fix is to add a third overload that is specific in _both_ positions:

```
op problem(dst: HL, src: BC)
  ; overload C: resolves the ambiguity
  ...
end
```

Now the call `problem HL, BC` matches all three overloads, but overload C is strictly more specific than both A and B, so it wins cleanly.

### 5.5 Arity Matching

Overload resolution requires that the call-site operand count matches the parameter count exactly. An op declared with two parameters cannot be invoked with one or three operands. Different overloads of the same name may have different arities, and arity mismatch simply removes that overload from the candidate set.

---

## 6. Register/Flag Effects (v0.2)

Ops are **inline expansions**. They do not have a special preservation guarantee by themselves. An op body behaves like any other inline instruction sequence: it may read or write registers and flags according to the Z80 instruction semantics used in the body. There is **no compiler-inserted autosave** and no mandatory clobber policy in the op system itself.

If you want register-effect reporting (e.g., "this op clobbers `HL` and flags"), that is a **separate, passive analysis** of the emitted instructions. Such analysis may be performed by the assembler or tooling and may be used for documentation, linting, or diagnostics, but it is not a normative part of op expansion.

### 6.1 Structured Control Flow in Op Bodies

Op bodies may contain structured control flow (`if`/`while`/`repeat`/`select`). The same rules apply as in function instruction streams (Section 10 of the main spec):

- Condition codes test flags that the programmer establishes
- The compiler expands structured control flow without introducing programmer-defined labels

**Stack usage discipline.** Stack behavior in op bodies is developer-managed. Authors should keep structured-control-flow arms stack-balanced to avoid downstream function-stream stack diagnostics.

```
; Caution example: stack use inside one arm only
op caution_stack(r: reg8)
  or a
  if Z
    push bc        ; +2
  end              ; risky unless balanced elsewhere
end
```

### 6.2 SP Tracking During Op Expansion

When an op is expanded inside a function that has local variables, the function's SP tracking must remain valid for surrounding code. The key rules:

1. **Op expansion is inline.** The expanded instructions become part of the function instruction stream.
2. **SP deltas accumulate.** Each `push`/`pop` in the op body updates the function's SP tracking.
3. **No op-local preservation contract.** The op system does not impose a net-stack rule for individual ops.
4. **Developer responsibility.** If an op leaves the enclosing function in an invalid stack state at a join/call boundary, diagnostics come from the normal function-stream stack rules.

**(impl)** The compiler should attribute stack-related failures to the op call site when possible, but enforcement remains the same as for any inline instruction sequence.

---

## 7. Worked Examples

This section presents several complete examples that demonstrate how the pieces fit together. Each example shows the op declarations, a call site, and the expected expansion.

### 7.1 A 16-Bit Comparison Family

The Z80 has no direct 16-bit compare instruction. We can build one as an op family:

```
op cmp16(lhs: HL, rhs: reg16)
  ; Compare HL with rhs by subtracting and discarding the result.
  ; Flags are set as if a 16-bit subtraction occurred.
  or a              ; clear carry
  sbc hl, rhs
  add hl, rhs       ; restore HL (does not affect Z flag from sbc)
end

op cmp16(lhs: HL, rhs: imm16)
  ; Compare HL with an immediate value.
  push de
  ld de, rhs
  or a
  sbc hl, de
  add hl, de
  pop de
end
```

Invoking `cmp16 HL, DE` selects the first overload (fixed `HL` in first param, `reg16` matching `DE` in second). The expansion emits `or a; sbc hl, de; add hl, de`. The caller can then test `Z` or `C` flags to determine the comparison result.

Invoking `cmp16 HL, 1000` selects the second overload (`imm16` matching the literal). The expansion loads the immediate into `DE`, performs the subtract-and-restore, and pops `DE`. The op body restores `HL` manually and leaves flags set by `sbc`, which is the intended observable output.

### 7.2 A Byte-Fill Op

```
op fill8(dst: ea, val: imm8, count: imm8)
  ld hl, dst
  ld b, count
  ld a, val
  repeat
    ld (hl), a
    inc hl
    dec b
  until Z
end
```

Invoked as `fill8 screenBuffer, $20, 80`, this expands to a loop that writes the value `$20` to 80 consecutive bytes starting at the address `screenBuffer`. The `ea` matcher binds to the effective address of `screenBuffer` (its location in memory), and the two `imm8` matchers bind to the literal values.

Note that this op clobbers `HL`, `B`, and `A` internally, plus flags. Because ops have no automatic preservation, these effects are visible to the caller unless the op body explicitly saves/restores registers.

### 7.3 Overload Resolution in Action

Consider a set of overloads for a hypothetical `move` op:

```
op move(dst: A, src: mem8)
  ld a, src
end

op move(dst: reg8, src: mem8)
  push af
  ld a, src
  ld dst, a
  pop af
end

op move(dst: reg8, src: imm8)
  ld dst, src
end
```

Now consider three call sites:

`move A, (flags)` — The first two overloads are both candidates (both have `mem8` in the second position, and both accept `A` in the first). But the first overload has a fixed `A` matcher, which is more specific than the `reg8` matcher in the second overload. The first overload wins. Expansion: `ld a, (flags)`.

`move B, (flags)` — Only the second overload is a candidate (the first requires `A`, the third requires `imm8`). Expansion: `push af; ld a, (flags); ld b, a; pop af`.

`move C, 42` — Only the third overload is a candidate. Expansion: `ld c, 42`.

`move A, 42` — The first overload does not match (`42` is not `mem8`). The second does not match either. The third matches (`A` satisfies `reg8`, `42` satisfies `imm8`). Expansion: `ld a, 42`.

---

## 8. Error Cases and Diagnostics

Good error messages are essential for usability. This section specifies the error categories and provides example diagnostic formats that implementations should follow.

### 8.1 No Matching Overload

When no overload's matchers accept the call-site operands, the compiler reports an error at the call site. The diagnostic should identify the op name, the operand types provided, and list the available overloads with their matcher signatures so the programmer can see why none matched.

**Example diagnostic:**

```
error: no matching overload for 'add16'
  --> src/game.zax:42:5
   |
42 |     add16 IX, DE
   |     ^^^^^^^^^^^^
   |
note: call-site operands: (IX, DE)
note: available overloads:
  - add16(dst: HL, src: reg16)    ; HL does not match IX
  - add16(dst: DE, src: reg16)    ; DE does not match IX
  - add16(dst: BC, src: reg16)    ; BC does not match IX
help: use `idx16` for IX/IY matcher-based overloads in v0.2
```

### 8.2 Ambiguous Overload

When two or more overloads match with equal specificity, the compiler reports an ambiguity error. The diagnostic should identify the competing overloads and suggest adding a more specific overload to resolve the tie.

**Example diagnostic:**

```
error: ambiguous overload for 'problem'
  --> src/game.zax:50:5
   |
50 |     problem HL, BC
   |     ^^^^^^^^^^^^^^
   |
note: call-site operands: (HL, BC)
note: equally specific candidates:
  - problem(dst: HL, src: reg16)   ; defined at src/ops.zax:10
  - problem(dst: reg16, src: BC)   ; defined at src/ops.zax:15
help: add an overload 'problem(dst: HL, src: BC)' to resolve ambiguity
```

### 8.3 Invalid Expansion

When an overload is selected and expanded, but the resulting instruction sequence contains an invalid Z80 instruction, the compiler reports the error at the call site. The diagnostic should indicate that the error arose from an op expansion and identify which instruction in the expansion is invalid.

**Example diagnostic:**

```
error: invalid Z80 instruction in op expansion
  --> src/game.zax:60:5
   |
60 |     swap_with_mem DE, (buffer)
   |     ^^^^^^^^^^^^^^^^^^^^^^^^^^
   |
note: expansion produced: ex de, (buffer)
note: 'ex' does not support this operand combination
note: op 'swap_with_mem' defined at src/ops.zax:25
help: this op may not support all reg16 values; consider using fixed-register matchers
```

### 8.4 Cyclic Expansion

When expanding an op would lead to infinite recursion, the compiler reports a cyclic expansion error. The diagnostic should show the expansion chain that forms the cycle.

**Example diagnostic:**

```
error: cyclic op expansion detected
  --> src/game.zax:70:5
   |
70 |     op_a HL
   |     ^^^^^^^
   |
note: expansion chain:
  1. op_a (src/ops.zax:30) invokes op_b
  2. op_b (src/ops.zax:40) invokes op_c
  3. op_c (src/ops.zax:50) invokes op_a  <-- cycle
```

### 8.5 Other Error Conditions

**Undefined op.** If an op invocation references a name that is not defined as an op:

```
error: undefined op 'unknwon_op'
  --> src/game.zax:90:5
   |
90 |     unknwon_op HL
   |     ^^^^^^^^^^
help: did you mean 'unknown_op'?
```

**Arity mismatch.** If the number of operands doesn't match any overload:

```
error: no overload of 'add16' accepts 3 operands
  --> src/game.zax:95:5
   |
95 |     add16 HL, DE, BC
   |     ^^^^^^^^^^^^^^^^
note: available arities: 2
```

**Op defined inside function.** If an op declaration appears inside a function body:

```
error: op declarations must be at module scope
  --> src/game.zax:100:3
    |
100 |   op inner_op(x: reg8)
    |   ^^
help: move this op declaration outside the function
```

---

## 9. Design Rationale and Future Directions

### 9.1 Why AST-Level, Not Text-Level

The decision to make ops operate on parsed AST nodes rather than raw text was driven by three concerns:

**Safety.** Textual macros in traditional assemblers are a rich source of subtle bugs: unexpected token pasting, re-scanning artifacts, hygiene violations where a macro's internal labels collide with the caller's labels. AST-level substitution eliminates these failure modes because operands are already parsed and typed before substitution.

**Overload resolution.** Text-level macros have no notion of operand types, so they cannot support overloading or specificity-based dispatch. The op system's matcher types enable a principled overload mechanism that is predictable and explainable.

**Compiler integration.** Because the compiler understands the op's parameter types and body structure, it can validate substitutions and produce meaningful diagnostics. None of this is possible with text substitution.

### 9.2 What v0.2 Intentionally Omits

Several features that would be natural extensions of the op system are intentionally omitted from v0.2 to keep the implementation tractable:

**Variadic parameters.** Ops with a variable number of operands (e.g., a `push_all` that saves an arbitrary set of registers) would be powerful but significantly complicate overload resolution.

**Typed pointer/array matchers.** Matching on the _type_ of an `ea` (e.g., "this must be an address of a `Sprite` record") would enable safer ops but requires deeper type system integration than v0.2 currently supports.

**Guard expressions.** Allowing overloads to specify additional constraints beyond matcher types (e.g., "only when `imm8` value is non-zero") would increase expressiveness but adds complexity to the resolution algorithm.

**Unbounded single-expression dynamic addressing.** v0.2 intentionally caps source-level addressing complexity via the runtime-atom budget. Deep dynamic addressing is expected to be staged across multiple lines (or helper-op compositions), not packed into one expression.

These omissions are deliberate scope boundaries, not oversights. They represent a natural extension path for future versions of the spec.

---

## 10. Summary of Normative Rules

For quick reference, the normative rules governing ops in v0.2 are:

Ops are module-scope declarations. They may not be nested inside functions or other ops. Op invocations are permitted inside function/op instruction streams. Bodies are implicit instruction streams terminated by `end`. Bodies may be empty. Bodies may contain structured control flow, raw Z80 instructions, and other op invocations. Bodies may not contain `var` blocks.

Parameters use matcher types: `reg8`, `reg16`, fixed-register matchers (`A`, `HL`, `DE`, `BC`, `SP`), `imm8`, `imm16`, `ea`, `mem8`, `mem16`, `idx16`, and `cc`. Substitution operates on AST nodes, not text.

Overload resolution filters candidates by matcher compatibility, then ranks by specificity. Fixed beats class, `imm8` beats `imm16` for small values, `mem8`/`mem16` beat `ea`. No match is an error. Ambiguous match is an error.

Op expansions are inline; register/flag effects are the effects of the emitted instructions. Stack effects are developer-managed and evaluated only by normal enclosing function-stream rules. Cyclic expansion is a compile error.

---

## 11. Source Mapping for Op Expansions

ZAX produces D8 Debug Map (D8M) files for debugger integration (Appendix B of the main spec). Op expansions require special handling to produce useful debug information.

### 11.1 The Attribution Problem

When an op expands to multiple instructions, the debugger needs to know which source location to show. There are several options:

1. **Attribute to call site.** All expanded instructions point to the op invocation line.
2. **Attribute to op body.** Each expanded instruction points to its original line in the op declaration.
3. **Hybrid.** The first instruction points to the call site; subsequent instructions point to the op body.

### 11.2 Recommended Policy

**(impl)** For v0.2, the recommended policy is:

- All instructions in an op expansion are attributed to the **call site** (the line containing the op invocation).
- The D8M segment for the expansion has `kind: "macro"` to indicate it resulted from op expansion.
- The `confidence` should be `"high"` since the compiler knows the exact mapping.

This policy means that stepping in the debugger will treat an op invocation as a single step, regardless of how many instructions it expands to. This matches the abstraction level at which the programmer wrote the code.

### 11.3 Advanced Debugging (Future)

Future versions may support stepping _into_ op expansions, showing the op body source during single-stepping. This would require:

- D8M segments that reference both the call site and the op body location
- Debugger support for "step into macro" vs "step over macro"
- UI to show macro expansion context

These features are out of scope for v0.2.

### 11.4 Symbol Table

Ops do not appear in the symbol table as callable addresses (since they have no address — they are purely inline). However:

- The op _name_ may appear in diagnostic output
- Op-local labels are hygienically rewritten and may appear in lowered/internal symbol forms
- The D8M may include op definitions in a separate metadata section for tooling purposes

---

## 12. Interaction with Functions and the Calling Convention

### 12.1 Ops Inside Function Bodies

Ops are expanded inline within the enclosing function instruction stream. This means:

- The function's local variables remain accessible during op expansion (as frame slots)
- The op may modify stack depth; correctness is judged at enclosing function joins/call boundaries
- The function's SP tracking is updated by any `push`/`pop` in the op body

### 12.2 Function Calls Inside Op Bodies

An op body may invoke a function using the normal function-call syntax (Section 8.3 of the main spec). When this happens:

- The compiler generates the call sequence (push arguments, `call`, pop arguments)
- The typed-call boundary is preservation-safe in v0.2 (`HL` boundary-volatile for all typed calls; non-void uses `HL`/`L` return channel).
- Any additional clobbers are from surrounding op instructions (ops still have no automatic preservation)

This interaction can lead to significant expansion overhead. Consider:

```
op process_with_log(dst: reg16, src: imm16)
  log_debug "processing"    ; function call inside op
  ld dst, src
end
```

In v0.2, the function call boundary itself is preservation-safe; visible clobbers come from explicit instructions in the op body.

**Guidance for op authors:** Avoid function calls inside ops when possible. If you must call a function, consider whether the op should be a function instead.

### 12.3 Ops That Establish Stack Frames

Ops cannot declare local variables (`var` blocks are forbidden). However, an op may manually manipulate the stack for temporary storage:

```
op temp_storage_example(dst: reg16)
  push bc           ; save working register
  ; ... use BC for computation ...
  pop bc            ; restore
  ; ... store result to dst ...
end
```

This is permitted. Any save/restore discipline is explicitly authored in the op body.

### 12.4 Calling Ops from Functions vs Calling Functions from Ops

| Scenario                | Effect                                                                              |
| ----------------------- | ----------------------------------------------------------------------------------- |
| Function calls op       | Op expands inline; stack/register effects are exactly those of the emitted sequence |
| Op calls function       | Full call sequence generated; typed call boundary remains preservation-safe in v0.2 |
| Op calls op             | Nested inline expansion; no call overhead                                           |
| Function calls function | Normal call/ret; stack frame management                                             |

---

### Appendix E.A: Implementation Checklist

This checklist is for compiler implementers. It covers the essential components needed for a compliant v0.2 op implementation.

### A.1 Parser

- [ ] Parse `op` declarations at module scope
- [ ] Parse zero-parameter ops (no parentheses)
- [ ] Parse parameter lists with matcher types
- [ ] Reject `op` declarations inside function bodies
- [ ] Reject `var` blocks inside op bodies
- [ ] Parse op bodies as implicit instruction streams
- [ ] Handle `end` termination (including nested control flow)

### A.2 Name Resolution

- [ ] Register op names in the global namespace
- [ ] Detect name collisions with functions, types, etc.
- [ ] Support forward references to ops
- [ ] Build overload sets (multiple declarations with same name)

### A.3 Overload Resolution

- [ ] Filter candidates by matcher compatibility
- [ ] Implement specificity ordering:
  - [ ] Fixed register > class matcher
  - [ ] `imm8` > `imm16` for small values
  - [ ] `mem8`/`mem16` > `ea`
- [ ] Detect and report ambiguity
- [ ] Detect and report no-match

### A.4 Substitution

- [ ] Clone op body AST for each expansion
- [ ] Substitute parameter references with bound operands
- [ ] Handle all matcher types (reg8, reg16, fixed, imm8, imm16, ea, mem8, mem16, idx16, cc)
- [ ] Preserve AST structure (no text-level manipulation)

### A.5 Label Hygiene

- [ ] Rewrite local labels inside op bodies using expansion-site hygiene

### A.6 Cycle Detection

- [ ] Track expansion stack during recursive expansion
- [ ] Detect when an op appears twice in the stack
- [ ] Report cycle with full chain

### A.7 Register-Effect Analysis (Optional)

- [ ] (Optional tooling) Analyze emitted instructions to report registers/flags written
- [ ] (Optional tooling) Surface effects in documentation or lint diagnostics

### A.8 Stack-Effect Tooling (Optional)

- [ ] (Optional tooling) Track stack effects through expanded op bodies
- [ ] (Optional tooling) Handle `push`, `pop`, `call`, `ret`, `inc sp`, `dec sp`
- [ ] (Optional tooling) Surface likely stack-discipline risks in lint/docs output
- [ ] Keep core op expansion semantics independent of stack-effect tooling

### A.9 Code Emission

- [ ] Emit expanded instructions to code stream
- [ ] Handle lowering of non-encodable operands (per Section 6.1.1 of main spec)
- [ ] Generate D8M segments with call-site attribution

### A.10 Diagnostics

- [ ] No matching overload (with available overloads listed)
- [ ] Ambiguous overload (with competing candidates)
- [ ] Invalid expansion (with expanded instruction)
- [ ] Cyclic expansion (with chain)
- [ ] Stack delta violation
- [ ] Undefined op
- [ ] Arity mismatch
- [ ] Op inside function

---

### Appendix E.B: Test Cases for Op Implementation

This appendix provides test case outlines for validating an op implementation. Each test should verify both successful compilation and correct code generation.

### B.1 Basic Expansion

```
; Test: simple op with reg16 parameter
op simple_inc(dst: reg16)
  inc dst
end

func test(): void
  simple_inc HL    ; should expand to: inc hl
  simple_inc DE    ; should expand to: inc de
end
```

### B.2 Fixed-Register Overloads

```
; Test: fixed-register matcher wins over class matcher
op add16(dst: HL, src: reg16)
  add hl, src
end

op add16(dst: DE, src: reg16)
  ex de, hl
  add hl, src
  ex de, hl
end

func test(): void
  add16 HL, BC     ; should select first overload
  add16 DE, BC     ; should select second overload
end
```

### B.3 Specificity Ranking

```
; Test: imm8 beats imm16
op load_val(dst: reg8, val: imm8)
  ld dst, val
end

op load_val(dst: reg8, val: imm16)
  ; This overload exists but should not be selected for small values
  ld dst, val
end

func test(): void
  load_val A, 42   ; should select imm8 overload
  load_val A, 1000 ; should select imm16 overload
end
```

### B.4 Ambiguity Detection

```
; Test: should report ambiguity error
op ambig(dst: HL, src: reg16)
end

op ambig(dst: reg16, src: BC)
end

func test(): void
  ambig HL, BC     ; ERROR: ambiguous
end
```

### B.5 Cycle Detection

```
; Test: should report cyclic expansion
op cycle_a(r: reg16)
  cycle_b r
end

op cycle_b(r: reg16)
  cycle_a r        ; ERROR: cycle
end
```

### B.6 Stack-Discipline Example (Developer Managed)

```
; Test: demonstrate explicit stack discipline by authoring balanced save/restore
op scoped_temp(r: reg16)
  push hl
  ; ... use HL as scratch ...
  pop hl
end
```

### B.7 Labels Inside Ops (Hygiene Rewrite)

```
; Test: op with local labels should compile via hygiene rewrite
op with_label(r: reg8)
  ld r, 10
loop:
  dec r
  jr nz, loop
end
; Expected: no collision; each expansion instance gets unique internal label names
```

### B.8 Nested Op Expansion

```
; Test: ops invoking other ops
op clear_flags
  or a
end

op safe_add(dst: reg16, src: reg16)
  clear_flags
  adc dst, src
end

func test(): void
  safe_add HL, DE  ; should expand clear_flags then adc
end
```

---

### Appendix E.C: Glossary

**AST (Abstract Syntax Tree):** The parsed representation of source code as a tree structure, where each node represents a syntactic construct.

**Candidate:** An overload that matches the call-site operands and could potentially be selected.

**Effective Address (EA):** An expression that evaluates to a memory address.

**Expansion:** The process of replacing an op invocation with the op's body after substitution.

**Fixed Matcher:** A matcher that accepts exactly one register (e.g., `HL`).

**Class Matcher:** A matcher that accepts a class of registers (e.g., `reg16` accepts HL, DE, BC, SP).

**Hygiene:** The property that internal names (like labels) in a macro/op do not collide with names at the call site.

**Matcher:** A compile-time pattern that constrains which operands can bind to an op parameter.

**Overload:** One of potentially multiple declarations of the same op name with different parameter matchers.

**Specificity:** The relative "narrowness" of a matcher; more specific matchers win during overload resolution.

**Stack Delta:** The net change in stack pointer caused by a sequence of instructions.

**Substitution:** The process of replacing parameter names in an op body with the corresponding call-site operands.
