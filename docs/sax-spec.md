# ZAX Language Specification (Draft v0.1)

This document is the tight, implementable first draft specification for **ZAX**: the Z80-family instance of the broader **SAX** (“Structured Assembler”) category.

SAX is intended to be a CPU-agnostic *category* of structured assemblers; each concrete instance targets a specific CPU family and defines its instruction set, registers, and calling convention. **ZAX** is the Z80-family instance. ZAX source files use the `.zax` extension.

ZAX combines:
* module-scope declarations (`type/enum/const/var/data`, imports, extern bindings)
* function declarations with locals
* `asm` bodies containing Z80 mnemonics, `op` invocations, and flag-based structured control flow

This spec intentionally avoids “future ideas”; anything not defined here is undefined behavior or a compile error.

---

## 0. Overview (Non-normative)

This section is explanatory and does not define behavior.

### 0.1 Purpose
**SAX** (“Structured Assembler”) is a CPU-agnostic category: a family of structured assemblers that compile directly to native machine code while keeping assembly-like semantics. **ZAX** is the Z80-family SAX instance defined by this specification.

### 0.2 Design Philosophy
* **High-level structure, low-level semantics.**
* **Registers are first-class.** Register names are visible and directly used.
* **No significant whitespace.** Indentation is ignored; multi-line constructs use explicit terminators (`end`, `until`).
* **Compiler, not preprocessor.** Parse to an AST and emit code with fixups; no textual macros.

### 0.3 Compilation Model
* Parse the whole program into an AST and symbol table.
* Emit code/data with forward-reference fixups.
* Workflow: edit → full recompile → run.

Outputs (typical):
* Binary image
* Optional HEX
* Optional listing with symbols (for debuggers/simulators)

### 0.4 Naming
* **SAX** = “Structured Assembler” (CPU-agnostic category)
* **ZAX** = Z80-family SAX instance (this project)
* ZAX source file extension: `.zax`

## 1. Lexical Rules

### 1.1 Whitespace and Newlines
* In non-`asm` regions, **newlines terminate** declarations and directives.
* In `asm` regions, newlines terminate instructions/keywords.
* Spaces/tabs separate tokens.

Multi-line constructs (v0.1):
* ZAX does not use significant whitespace (indentation is ignored).
* Multi-line constructs are delimited by explicit keywords:
  * `end` terminates `func`, `op`, `type` record bodies, `extern <binName>` blocks, and `if`/`while` blocks.
  * `until <cc>` terminates a `repeat` block.

Labels (v0.1):
* A local label is defined by `<ident>:` at the start of an `asm` line. The `:` token separates the label from any instruction that follows on the same line; the newline still terminates that instruction normally.

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

### 1.5 Reserved Names and Keywords (v0.1)
ZAX treats the following as **reserved** (case-insensitive):
* Z80 mnemonics and assembler keywords used inside `asm` (e.g., `ld`, `add`, `ret`, `jp`, ...).
* Register names: `A F AF B C D E H L HL DE BC SP IX IY I R`.
* Condition codes used by structured control flow: `Z NZ C NC PO PE M P`.
* Structured-control keywords: `if`, `else`, `while`, `repeat`, `until`, `select`, `case`, `end`.
* Module and declaration keywords: `module`, `import`, `type`, `enum`, `const`, `var`, `data`, `bin`, `hex`, `extern`, `func`, `op`, `asm`, `export`, `section`, `align`, `at`, `from`, `in`.

User-defined identifiers (module-scope symbols, locals/args, and labels) must not collide with any reserved name, ignoring case.

In addition, the compiler reserves the prefix `__zax_` for internal temporaries (including generated labels). User-defined symbols and user labels must not start with `__zax_`.

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
* `section <kind> at <imm16>`: selects section and sets its starting address.
* `section <kind>`: selects section without changing its current counter.
* `align <imm>`: advances the current section counter to the next multiple of `<imm>`. `<imm>` must be > 0.

`<kind>` is one of: `code`, `data`, `bss`.

Scope rules (v0.1):
* `section` and `align` directives are module-scope only. They may not appear inside `func`/`op` bodies or inside `asm` streams.

Address rules (v0.1):
* A section’s starting address may be set at most once. A second `section <kind> at <imm16>` for the same section is a compile error.
* `section <kind>` (without `at`) may be used any number of times to switch the active section.

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

Namespace rule (v0.1):
* `type`, `enum`, `const`, storage symbols (`var`/`data`/`bin`), `func`, and `op` names share the same global namespace. Defining a `func` and an `op` with the same name is a compile error.

Forward references (v0.1):
* ZAX is whole-program compiled: symbols may be referenced before they are declared, as long as they resolve by the end of compilation.
* Circular imports are a compile error.

---

## 4. Types, Enums, Consts

Types exist for layout/width/intent only. No runtime type checks are emitted.

### 4.1 Built-in Scalar Types
* `byte` (8-bit unsigned)
* `word` (16-bit unsigned)
* `addr` (16-bit address)
* `ptr` (16-bit pointer; treated as `addr` for codegen)
* `void` (function return type only)

Notes (v0.1):
* `ptr` is untyped in v0.1 (there is no `ptr<T>`). This is intentional; future versions may add optional pointer parameterization.

### 4.2 Type Aliases
Syntax:
```
type Name byte
type Ptr16 ptr
```

Type expressions (v0.1):
* Scalar types: `byte`, `word`, `addr`, `ptr`
* Arrays: `T[n]` (nested arrays allowed)
* Records: a record body starting on the next line and terminated by `end`

Arrays and nesting (v0.1):
* Array types may be used in aliases (`type Buffer byte[256]`) and as record field types.
* Record field types may reference other record types (nested records).

### 4.3 Enums
Syntax:
```
enum Mode Read, Write, Append
```

Semantics:
* Enum members are sequential integers starting at 0.
* Storage width is `byte` if member count ≤ 256, else `word`.
* Enum members are immediate values usable in `imm` expressions.

Enum name binding (v0.1):
* Enum member names are introduced into the global namespace as immediate values.
  * Example: after `enum Mode Read, Write`, `Read` and `Write` may be used in `imm` expressions.
* Qualified member access (e.g., `Mode.Read`) is not supported in v0.1.

Notes (v0.1):
* Trailing commas are not permitted in enum member lists.

### 4.4 Consts
Syntax:
```
const MaxValue = 1024
export const Public = $8000
```

* `const` values are compile-time `imm` expressions.
* `export` is inline only (e.g., `export const ...`, `export func ...`).

Notes (v0.1):
* There is no built-in `sizeof`/`offsetof` in v0.1. If you need sizes or offsets, define them as explicit `const` values.
* `export op` is not supported in v0.1 (ops are always available for resolution once imported, and v0.1 has no visibility model).

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

Index forms (v0.1):
* constant immediate
* 8-bit register (`A B C D E H L`)
* `(HL)` (byte read from memory at `HL`)

Notes (v0.1):
* The index grammar is intentionally small. Parenthesized expressions are not permitted inside `[]`; `(HL)` is a special-case index form.

### 5.2 Records (Packed Structs)
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
* Records must contain at least one field (empty records are a compile error in v0.1).
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

Notes (v0.1):
* In instruction-operand position, parentheses always mean dereference/indirection. They are not grouping parentheses.
  * Example: `LD A, (X)` always means “load `A` from memory at address `X`”, even if `X` is a `const`.
* Grouping parentheses apply only inside `imm` expressions (e.g., `const X = (1+2)*3`, or `ea + (1+2)`).

### 6.1.1 Lowering of Non-Encodable Operands
Many `ea` forms (locals/args, `rec.field`, `arr[i]`, and address arithmetic) are not directly encodable in a single Z80 instruction. In these cases, the compiler lowers the instruction to an equivalent instruction sequence.

Lowering rules (v0.1):
* The observable effect must match the abstract meaning of the original instruction and operands.
* If the original instruction does not modify flags (e.g., `LD`), the lowered sequence must preserve flags.
* The lowered sequence must preserve registers other than the instruction’s explicit destination(s).
* Any internal stack usage must have net stack delta 0.

Lowering limitations (v0.1):
* Some source forms may be rejected if no correct lowering exists under the constraints above (e.g., operations whose operand ordering cannot be preserved without clobbering).

Lowering guarantees and rejected patterns (v0.1):
* The compiler guarantees lowering for SP-relative loads/stores of locals/args for the following families:
  * `LD r8, (ea)` and `LD (ea), r8`
  * `LD r16, (ea)` and `LD (ea), r16`
  where `ea` is a local/arg slot, `rec.field`, `arr[i]`, or `ea +/- imm`.
* The compiler rejects source forms that are not meaningful on Z80 and do not have a well-defined lowering under the preservation constraints, including:
  * memory-to-memory forms (e.g., `LD (ea1), (ea2)`).
  * instructions where both operands require lowering and a correct sequence cannot be produced without clobbering non-destination registers or flags that must be preserved.

Non-guarantees (v0.1):
* Arithmetic/logical instruction forms that are not directly encodable on Z80 (e.g., `add hl, (ea)`) are not guaranteed to be accepted, even though they may be expressible via a multi-instruction sequence.

### 6.2 `var` (Uninitialized Storage)
Syntax:
```
var
  total: word
  mode: byte
```

* Declares storage in `bss`.
* One declaration per line; no initializers.
* A `var` block continues until the next line whose first non-comment token starts a new module-scope declaration/directive (`type`, `enum`, `const`, `var`, `data`, `bin`, `hex`, `extern`, `func`, `op`, `import`, `module`, `section`, `align`, `export`) or until end of file/scope.
* For function-local `var` blocks, see Section 8.1.

### 6.3 `data` (Initialized Storage)
Syntax:
```
data
  table: word[4] = { 1, 2, 3, 4 }
  banner: byte[5] = "HELLO"
  bytes: byte[3] = { $00, $01, $FF }
```

Initialization:
* `byte[n] = { imm8, ... }` emits `n` bytes.
* `word[n] = { imm16, ... }` emits `n` little-endian words.
* `byte[n] = "TEXT"` emits the ASCII bytes of the string; length must equal `n` (no terminator).
* A `data` block continues until the next line whose first non-comment token starts a new module-scope declaration/directive (`type`, `enum`, `const`, `var`, `data`, `bin`, `hex`, `extern`, `func`, `op`, `import`, `module`, `section`, `align`, `export`) or until end of file/scope.

Type vs initializer (v0.1):
* Initializers must match the declared type; ZAX does not infer array lengths from initializer length.
  * Example: write `table: word[3] = { 1, 2, 3 }`, not `table: word = { 1, 2, 3 }`.
* For array types (e.g., `word[8]` or `Sprite[4]`), the initializer element count must match the total number of scalar elements implied by the array type.
* Record initializers must supply field values in field order; for arrays of records, initializers are flattened in element order.

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

* The name `legacy` becomes an address-valued symbol of type `addr`.

`bin` placement rule (v0.1):
* `in <kind>` is required. There is no default section for `bin`.

`hex` reads Intel HEX and emits bytes at absolute addresses specified by records:
```
hex bios from "rom/bios.hex"
```

`hex` binding and placement rules (v0.1):
* `hex <name> from "<path>"` binds `<name>` to the lowest address written by the HEX file (type `addr`). If the HEX file contains no data records, it is a compile error.
* HEX output is written to absolute addresses in the final address space and does not advance any section’s location counter.
* If a HEX-written byte overlaps any byte emitted by section packing (`code`/`data`/`bin`) or another HEX include, it is a compile error.
* The compiler’s output is an address→byte map. When producing a flat binary image, the compiler emits bytes from the lowest written address to the highest written address, filling gaps with `$00`. `bss` contributes no bytes.

### 6.5 `extern` (Binding Names to Addresses)
Bind callable names to absolute addresses:
```
extern func bios_putc(ch: byte): void at $F003
```

Bind multiple entry points relative to a `bin` base:
```
bin legacy in code from "asm80/legacy.bin"
extern legacy
  func legacy_init(): void at $0000
  func legacy_putc(ch: byte): void at $0030
end
```

Relative `extern` semantics (v0.1):
* In an `extern <binName> ... end` block, the `at <imm16>` value is an **offset** from the base address of `<binName>`.
  * Example: if `legacy` is placed at `$C000`, then `legacy_putc ... at $0030` resolves to absolute address `$C030`.

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

Operator precedence and associativity (v0.1), highest to lowest:
1. Unary `+ - ~` (right-associative)
2. `* / %` (left-associative)
3. `+ -` (left-associative)
4. `<< >>` (left-associative)
5. `&` (left-associative)
6. `^` (left-associative)
7. `|` (left-associative)

Integer semantics (v0.1):
* Immediate expressions evaluate over mathematical integers.
* Division/modulo by zero is a compile error.
* Shift counts must be non-negative; shifting by a negative count is a compile error.
* When an `imm` value is encoded as `imm8`/`imm16`, the encoded value is the low 8/16 bits of the integer (two’s complement truncation).

### 7.2 `ea` (Effective Address) Expressions
`ea` denotes an address, not a value. Allowed:
* storage symbols: `var` names, `data` names, `bin` base names
* function-scope symbols: argument names and local `var` names (as SP-relative stack slots)
* field access: `rec.field`
* indexing: `arr[i]` and nested `arr[r][c]` (index forms as defined above)
* address arithmetic: `ea + imm`, `ea - imm`

Conceptually, an `ea` is a base address plus a sequence of **address-path** segments: `.field` selects a record field, and `[index]` selects an array element. Both forms produce an address; dereference requires parentheses as described in 6.1.

Precedence (v0.1):
* Address-path segments (`.field`, `[index]`) bind tighter than address arithmetic (`ea + imm`, `ea - imm`).

Notes (v0.1):
* `imm + ea` is not permitted; write `ea + imm`.

---

## 8. Functions (`func`)

### 8.1 Declaration Form
Syntax:
```
export func add(a: word, b: word): word
  var
    temp: word
  asm
    ld hl, (a)
    ld de, (b)
    add hl, de
    ret
end
```

Rules:
* Module-scope only; no inner functions.
* Inside a function body:
  * at most one optional `var` block (locals, one per line)
  * exactly one required `asm` block
  * `end` terminates the function body
* `asm` blocks may contain Z80 mnemonics, `op` invocations, and structured control flow (Section 10).

Function-body block termination (v0.1):
* Inside a function/op body, a `var` block (if present) continues until the `asm` keyword.
* `asm` bodies may be empty (no instructions).

### 8.2 Calling Convention
* Arguments are passed on the stack, each argument occupying 16 bits.
* Caller pushes arguments right-to-left (last argument pushed first).
* Caller cleans up the arguments after return.
* Return values:
  * 16-bit return in `HL`
  * 8-bit return in `L`
* Register/flag volatility (v0.1): unless explicitly documented otherwise, functions may clobber any registers and flags (other than producing the return value in `HL`/`L`). The caller must save anything it needs preserved.

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

Parsing and name resolution (v0.1):
* If an `asm` line begins with `<ident>:` it defines a local label. Any remaining tokens on the line are parsed as another `asm` line (mnemonic/`op`/call/etc.).
* Otherwise, the first token of an `asm` line is interpreted as:
  1) a structured-control keyword (`if`, `else`, `while`, `repeat`, `until`, `select`, `case`, `end`), else
  2) a Z80 mnemonic, else
  3) an `op` invocation, else
  4) a `func`/`extern func` call, else
  5) a compile error (unknown instruction/op/function).
* Because Z80 mnemonics and register names are reserved, user-defined symbols cannot shadow instructions/registers.

Operand identifier resolution (v0.1):
* For identifiers used inside operands, resolution proceeds as:
  1) local labels
  2) locals/args (stack slots)
  3) module-scope symbols (including `const` and enum members)
  otherwise a compile error (unknown symbol).

### 8.4 Stack Frames and Locals (SP-relative, no base pointer)
* ZAX does not use `IX`/`IY` as a frame pointer.
* Locals and arguments are addressed as `SP + constant offset` computed into `HL`.
* The compiler knows local/arg counts from the signature and `var` block.

At the start of the user-authored `asm` block, the compiler has already reserved space for locals (if any) by adjusting `SP` by the local frame size. The local frame size is the packed byte size of locals rounded up to an even number of bytes.

Function prologue/epilogue (v0.1):
* The compiler emits a prologue before the user-authored `asm` stream to reserve the local frame (adjusting `SP` by `-frameSize`).
* The compiler emits an epilogue to deallocate the local frame (restoring `SP` by `+frameSize`) immediately before returning from the function.
  * Any return instruction in the user-authored `asm` stream (e.g., `ret`, `retn`, `reti`, and conditional `ret <cc>`) is lowered to execute the epilogue first, then perform the return.
  * Implementation note: this is typically done by branching to a compiler-generated hidden return label that performs epilogue + return.

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

Other SP-mutating instructions are compile errors in v0.1 (e.g., `ld sp, hl`, `inc sp`, `dec sp`).

Stack-depth constraints (v0.1):
* At any structured-control-flow join (end of `if`/`else`, loop back-edges, and loop exits), stack depth must match across all paths.
  * Paths that terminate (e.g., `ret`, or an unconditional `jp`/`jr` that exits the construct) do not participate in join stack-depth matching.
* The net stack delta of an `op` expansion must be 0.

---

## 9. `op` (Inline Macro-Instructions)

### 9.1 Purpose
`op` defines opcode-like inline macros with compiler-level operand matching. This is used to express accumulator-shaped instruction families and provide ergonomic “opcode-like functions.”

### 9.2 Declaration Form
Syntax:
```
op add16(dst: HL, src: reg16)
  asm
    add hl, src
end

op add16(dst: DE, src: reg16)
  asm
    ex de, hl
    add hl, src
    ex de, hl
end
```

Rules:
* `op` is module-scope only.
* `op` bodies contain an `asm` stream.
* `end` terminates the `op` body.
* `asm` bodies may be empty.
* `op` invocations are permitted inside `asm` streams of `func` and `op`.
* Cyclic `op` expansion is a compile error.

Zero-parameter ops (v0.1):
* `op name` (with no parameter list) is permitted and defines a zero-parameter op.
* A zero-parameter op is invoked by writing just `name` on an `asm` line.

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

Notes (v0.1):
* Matchers constrain call sites, but the `op` body must still be valid for all matched operands. If an expansion yields an illegal instruction form for a given call, compilation fails at that call site.
* In `op` parameters, `mem8` and `mem16` disambiguate dereference width. In raw Z80 mnemonics, dereference width is implied by the instruction form (destination/source registers).
* `reg16` includes `SP`; `op` authors should use fixed-register matchers if an expansion is only valid for a subset of register pairs.
* `IX`/`IY` are usable in raw Z80 mnemonics but are not supported by `op` matchers in v0.1.

Operand substitution (v0.1):
* `op` parameters bind to parsed operands (AST operands), not text.
  * `reg8`/`reg16` parameters substitute the matched register token(s).
  * `imm8`/`imm16` parameters substitute the immediate expression value.
  * `ea` parameters substitute the effective-address expression (without implicit parentheses).
  * `mem8`/`mem16` parameters substitute the full dereference operand including parentheses.
    * Example: if `src: mem8` matches `(hero.flags)`, then `ld a, src` emits `ld a, (hero.flags)`.

### 9.4 Overload Resolution
* `op` overloads are selected by best match on matcher types and fixed-register patterns.
* If no overload matches, compilation fails.
* If multiple overloads match equally, compilation fails (ambiguous).

Specificity (v0.1):
* Fixed-register matchers (e.g., `HL`) are more specific than class matchers (e.g., `reg16`).
* `imm8` is more specific than `imm16` for values that fit in 8 bits.
* `mem8`/`mem16` are more specific than `ea`.

### 9.5 Autosave Clobber Policy
To keep `op` expansions transparent:
* An `op` expansion must preserve all registers and flags **except** explicit destination(s).
* The compiler may use scratch registers and `push/pop` internally.
* Net stack delta must be zero.

The simplest implementation is permitted: always preserve flags (save/restore `AF`) unless `AF` is an explicit destination.

Destination parameters (v0.1):
* By convention, any `op` parameter whose name starts with `dst` or `out` (e.g., `dst`, `dst2`, `out`) is treated as a destination.
* If an `op` declares no `dst*`/`out*` parameters, the first parameter is treated as the destination.

---

## 10. Structured Control Flow in `asm` (Flag-Based)

ZAX supports structured control flow only inside `asm` blocks. Conditions are flag-based; the user establishes flags using normal Z80 instructions.

### 10.1 Condition Codes (v0.1)
* `Z` / `NZ`: zero flag set / not set
* `C` / `NC`: carry flag set / not set
* `PE` / `PO`: parity even / parity odd (parity/overflow flag set / not set)
* `M` / `P`: sign flag set (minus) / not set (plus)

### 10.2 Forms
* `if <cc> ... end` (optional `else`)
* `while <cc> ... end`
* `repeat ... until <cc>`
* `select <operand> ... end` (case dispatch)

These forms lower to compiler-generated hidden labels and conditional/unconditional jumps. Control-flow constructs do not themselves set flags.

Notes:
* `else` is optional.
* `else` must immediately follow the `if` body with only whitespace/comments/newlines in between.

`select` notes (v0.1):
* `select` does not use condition codes. It dispatches based on equality against a selector value.
* `select` cases do not fall through in v0.1.

Condition evaluation points (v0.1):
* `if <cc> ... end`: `<cc>` is evaluated at the `if` keyword using the current flags.
* `while <cc> ... end`: `<cc>` is evaluated at the `while` keyword on entry and after each iteration. The back-edge jumps to the `while` keyword. The loop body is responsible for establishing flags for the next condition check.
* `repeat ... until <cc>`: `<cc>` is evaluated at the `until` keyword using the current flags. The loop body is responsible for establishing flags for the `until` check.

### 10.2.1 `select` / `case` (v0.1)
`select` introduces a multi-way branch based on a selector operand evaluated once.

Syntax:
```
select <selector>
  case <imm> ...
  case <imm> ...
  else ...
end
```

Rules:
* `<selector>` is evaluated once at `select` and treated as a 16-bit value.
  * Allowed selector forms: `reg16`, `reg8` (zero-extended), `imm` expression, `ea` (address value), `(ea)` (loaded value).
* Each `case` value must be a compile-time immediate (`imm`) and is compared against the selector.
* `else` is optional and is taken if no `case` matches.
* There is no fallthrough: after a `case` body finishes, control transfers to after the enclosing `end` (unless the case body terminates, e.g., `ret`).
* Duplicate `case` values within the same `select` are a compile error.
* Nested `select` is allowed.

Lowering (informative):
* The compiler may lower `select` either as a sequence of compares/branches or as a jump table, depending on target and case density. Behavior must be equivalent.

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

### 10.4 Local Labels (Discouraged, Allowed)
ZAX discourages labels in favor of structured control flow, but allows **local labels** within an `asm` block for low-level control flow.

Label definition syntax (v0.1):
* `<ident>:` at the start of an `asm` line defines a local label at the current code location.
  * A label definition may be followed by an instruction on the same line (e.g., `loop: djnz loop`) or may stand alone.

Scope and resolution (v0.1):
* Local labels are scoped to the enclosing `func` or `op` body and are not exported.
* A local label may be referenced before its definition within the same `asm` block (forward reference).
* Local label names must not collide with reserved names (Section 1.5), ignoring case.
* When resolving an identifier in an instruction operand, local labels take precedence over locals/args, which take precedence over global symbols.

Usage (v0.1):
* A local label name may be used anywhere a Z80 mnemonic expects an address/immediate (e.g., `jp loop`, `jr nz, loop`, `djnz loop`).
* For relative branches (`jr`, `djnz`), the displacement must fit the instruction encoding; otherwise it is a compile error.

---

## 11. Example Module

```
module Math

import IO
import Mem
import "vendor/legacy_io.zax"

enum Mode Read, Write, Append

type Index byte
type WordPtr ptr

type Sprite
  x: word
  y: word
  w: byte
  h: byte
  flags: byte
end

export const MaxValue = 1024
const TableSize = 8

var
  total: word
  mode: byte
  hero: Sprite

data
  table: word[8] = { 1, 2, 3, 4, 5, 6, 7, 8 }
  banner: byte[5] = "HELLO"

bin legacy in code from "asm80/legacy.bin"
extern legacy
  func legacy_print(msg: addr): void at $0000
end

export func add(a: word, b: word): word
  var
    temp: word
  asm
    ld hl, (a)
    ld de, (b)
    add hl, de
    ld (temp), hl
    ld hl, (temp)
    ret
end

func demo(): word
  asm
    ; `print` is assumed to be provided by the imported `IO` module.
    print HL
    legacy_print HL
    ld hl, (hero.x)
    or a
    if Z
      ; ...
    else
      ; ...
    end
    ret
end
```
