# SAX Starting Point

This document is a single, opinionated starting point that synthesizes the current design discussion for **SAX** (Structured Assembler). It is intended to seed a fuller specification.

---

## 1. Purpose and Scope

**SAX** is a structured, register‑centric Z80 language that compiles directly to native machine code. It provides Pascal‑ and C‑style structure (clear control flow, procedures, simple scoping) without losing proximity to hardware.

**In scope**
* Structured control flow (`IF/ELSE`, `WHILE`, `REPEAT/UNTIL`, `FOR`).
* Procedures with explicit calling conventions.
* Minimal type annotations for byte/word and address clarity.
* Clear memory model and stack‑frame conventions.

**Out of scope (for v1)**
* Full Pascal type system (records/arrays with runtime semantics).
* Macro system or textual preprocessing.
* Exception handling.
* Large runtime library.

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

SAX distinguishes:
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

## 5. Control Flow (Structured)

Core forms:
* `IF ... THEN ... ELSE`
* `WHILE ... DO`
* `REPEAT ... UNTIL`
* `FOR ... TO/DOWNTO`

Rules:
* No GOTO in the core language (possible future extension).
* Minimal nesting encouraged; syntax should compile to labels and branches.

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
    ; raw Z80 mnemonics only
    ...
}
```

**Syntax (opcode‑style)**
```
myproc HL, DE
```

**Calling convention (C‑style)**
* Caller pushes args (16‑bit each).
* Caller cleans up after return.
* Return values:
  * 16‑bit in `HL`
  * 8‑bit in `L`
  * (Optional) 32‑bit in `HL:DE`

**Registers are preserved only if specified.** By default, the callee is free to clobber registers unless it declares a preservation set.

---

## 7. Stack Frames and Locals

**No base pointer**
* SAX does **not** use `IX`/`IY` as a frame pointer.
* Stack access is computed from `SP` using known counts of locals and args.
* This avoids `IX`/`IY` overhead and keeps access fast.

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

This SP‑relative scheme is the default and preferred model in SAX.

---

## 8. Types (Minimal)

SAX supports **compile‑time annotations** only. Types exist to define layout, width, and intent. There are no runtime checks by default.

**Built‑in scalar types**
* `byte` (8‑bit, unsigned)
* `word` (16‑bit, unsigned)
* `addr` (16‑bit address)
* `ptr` (16‑bit pointer; may be parameterized later, e.g., `ptr<word>`)

**Type declarations (module‑scope only)**
SAX uses a TypeScript‑style `type` alias with Pascal‑style ranges and enums:
```
type Index = 0..255
type Small = -16..15
type Mode = enum { Read, Write, Append }
type WordPtr = ptr
```

**Ranges**
* `lo..hi` defines a subrange of an integer type.
* Ranges are **compile‑time only** (no bounds checks emitted).
* Range width defaults to the smallest fitting integer width:
  * `0..255` → `byte`
  * `-128..127` → `byte` (signed)
  * Otherwise `word` (signed if range is negative)

**Enums**
* `enum { A, B, C }` defines sequential constants starting at 0.
* Enum values default to `byte` if count ≤ 256, else `word`.
* Enums are distinct type names for readability; no runtime checks.

**Type vs interface**
* SAX has **no `interface`** concept.  
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

Project name: **SAX**  
Meaning:
* **AX** = assembler  
* **S** = structured (or super)

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
