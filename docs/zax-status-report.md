# ZAX Assembler Status Report

**Version:** v0.1 (Draft)
**Date:** 2026-02-12
**Test Suite:** 398 tests across 197 test files
**Anchored PRs:** 93 merged
**Test Fixtures:** 324 .zax files

---

## Executive Summary

| Metric                   | Value                                     |
| ------------------------ | ----------------------------------------- |
| **Working Estimate**     | ~87% complete (range 82-90%)              |
| **Strict Gate-Based**    | 0/6 gates fully green                     |
| **Production Readiness** | **Conditional Yes** — usable with caveats |

The ZAX assembler has a functional end-to-end pipeline. Real Z80 programs can be written today using most language features. The core language constructs are well-tested and reliable, while some advanced features remain narrow in coverage or intentionally deferred to future versions.

---

## Gate Status

| Gate          | Current | Target | Notes                                                 |
| ------------- | ------- | ------ | ----------------------------------------------------- |
| 1. Spec       | ~74%    | 100%   | Most v0.1 features implemented or explicitly rejected |
| 2. Parser/AST | ~68%    | 100%   | Grammar stable, recovery paths expanding              |
| 3. Codegen    | ~66%    | 100%   | SP tracking solid, edge cases hardening               |
| 4. ISA        | ~53%    | 100%   | Core instructions complete, rare forms expanding      |
| 5. CLI/output | ~72%    | 100%   | Contract tests locked, determinism verified           |
| 6. Hardening  | ~77%    | 100%   | Examples compile, negative coverage strong            |

**Note:** Strict gate-based completion remains 0% until all six gates are fully green. The working estimate reflects risk-weighted progress toward that goal.

---

## Feature Status

| Feature                              | Status               | Confidence |
| ------------------------------------ | -------------------- | ---------- |
| Structured control flow              | Production ready     | High       |
| Functions with parameters/locals     | Production ready     | High       |
| Ops (macro instructions)             | Production ready     | High       |
| Type system (records, unions, enums) | Solid                | High       |
| Module system (import/export)        | Working              | High       |
| Core Z80 instructions                | Well tested          | High       |
| SP/stack tracking                    | Comprehensive        | High       |
| Diagnostic quality                   | Explicit, actionable | High       |
| Complex nested types                 | Functional           | Medium     |
| Advanced memory addressing           | Partial              | Medium     |
| Listing output (.lst)                | Basic                | Low        |
| Typed pointers (ptr<T>)              | Not implemented      | N/A        |

---

## Production-Ready Features

### 1. Structured Control Flow

All control structures work correctly with comprehensive test coverage (47 dedicated tests):

```zax
func example()
    if Z
        ; zero flag set path
    else
        ; zero flag clear path
    end

    while NZ
        ; loop while non-zero
    end

    repeat
        ; execute at least once
    until Z

    select HL
        case 0
            ; handle zero
        case 1, 2, 3
            ; handle 1-3 (comma-separated)
        else
            ; default
    end
end
```

**Capabilities:**

- All 8 condition codes: `Z`, `NZ`, `C`, `NC`, `PE`, `PO`, `M`, `P`
- Nested control structures to arbitrary depth
- Stack depth validation at all join points
- Mismatch propagation (join mismatches invalidate downstream tracking)
- Compile-time selector folding in `select` (constant optimization)
- `reg8` selector optimization (single-byte comparisons)
- Unreachable path detection

### 2. Functions with Parameters and Locals

```zax
func add(a: word, b: word): word
    var
        temp: word
    end
    ld HL, a
    ld DE, b
    add HL, DE
    ld temp, HL
    ret
end
```

**Capabilities:**

- Stack-based parameter passing (16-bit slots)
- Local variables via `var` blocks
- SP-relative addressing (no frame pointer overhead)
- Automatic prologue/epilogue generation
- `ret cc` paths rewrite to shared epilogue target
- Return values in `HL` (word) or `L` (byte)
- Forward references between functions
- Calling convention: arguments pushed right-to-left, caller cleanup

**Stack Safety Diagnostics:**

- `ret with non-zero tracked stack delta`
- `ret reached with unknown stack depth`
- `ret reached after untracked SP mutation`
- `call/rst reached with positive tracked stack delta`
- `retn/reti is not supported in functions with locals`

### 3. Ops (Macro Instructions)

```zax
op load16 dest:reg16, src:mem16
    ld L, (src)
    inc src
    ld H, (src)
    ld dest, HL
end

op load16 dest:reg16, src:imm16
    ld dest, src
end
```

**Capabilities:**

- Overload resolution by specificity (fixed > class, `imm8` > `imm16`)
- Parameter matchers: `reg8`, `reg16`, `imm8`, `imm16`, `ea`, `mem8`, `mem16`
- Fixed register matchers: `A`, `HL`, `DE`, `BC`, `SP`
- Cyclic expansion detection (prevents infinite loops)
- Local labels with per-expansion-site hygiene
- Control flow inside op bodies
- Implicit instruction streams (no `asm` keyword needed)
- Stack-delta validation (net delta must be 0)

### 4. Type System

```zax
type Point
    x: byte
    y: byte
end

union Value
    asWord: word
    asBytes: byte[2]
end

enum Mode
    Read
    Write
    ReadWrite
end

data points: Point[3] = { 10, 20, 30, 40, 50, 60 }
```

**Capabilities:**

- Scalars: `byte`, `word`, `addr`, `ptr`
- Arrays: fixed `T[n]` and inferred `T[]` in data initializers
- Records (structs): packed layout, field access via `.field`
- Unions: overlay semantics, size = max field size
- Enums: sequential members (0-indexed), auto-width selection
- `sizeof()` operator for type sizes

### 5. Module System

```zax
import Utils
import "path/to/module.zax"

export myFunc
```

**Capabilities:**

- Topological sort for correct processing order
- Include path resolution (`-I` flags)
- Circular import detection with stable diagnostics
- Forward references across modules
- `extern` blocks for ROM/library symbols
- Single global namespace with collision detection

### 6. Z80 Instruction Coverage

| Family                                | Status   | Notes                                     |
| ------------------------------------- | -------- | ----------------------------------------- |
| 8-bit loads                           | Complete | All register and memory forms             |
| 16-bit loads                          | Complete | Including IX/IY variants                  |
| Arithmetic (ADD, ADC, SUB, SBC)       | Complete | All operand forms                         |
| Logic (AND, OR, XOR, CP)              | Complete | Explicit `A` forms supported              |
| INC/DEC                               | Complete | 8-bit and 16-bit                          |
| Push/Pop                              | Complete | All register pairs                        |
| Rotates/Shifts (CB prefix)            | Complete | All forms including indexed               |
| Bit ops (BIT, SET, RES)               | Complete | All bit indices and destinations          |
| Jumps (JP, JR, DJNZ)                  | Complete | Conditional and unconditional             |
| Calls (CALL, RET, RST)                | Complete | All condition codes                       |
| IX/IY indexed                         | Complete | Displacement addressing, `(ix)` shorthand |
| Block ops (LDIR, CPIR, etc.)          | Complete | All block move/search/IO                  |
| I/O (IN, OUT)                         | Complete | Port and register forms                   |
| System (DI, EI, IM, HALT, RETN, RETI) | Complete | All system instructions                   |

---

## Diagnostic Quality

ZAX produces explicit, actionable error messages without generic fallbacks:

| Category            | Example Diagnostic                                |
| ------------------- | ------------------------------------------------- |
| ISA malformed forms | `add expects destination A, HL, IX, or IY`        |
| Stack safety        | `ret reached with unknown stack depth`            |
| Control flow        | `Stack depth mismatch at select join`             |
| Parser recovery     | `Unterminated func "...": expected function body` |
| Fixups              | `Relative branch target out of range`             |

All diagnostics include file, line, and column information.

---

## Features Requiring Caution

### 1. Complex Nested Type Structures

While the type system works, test coverage is narrow for:

- Deeply nested arrays of structs
- Union fields with complex types
- Multi-level pointer chains

**Recommendation:** Test thoroughly when using complex nested types.

### 2. Advanced Memory Addressing

Some EA (effective address) combinations are less tested:

```zax
; Supported:
ld A, (buffer + 5)
ld A, (arr.field)
ld A, (table + IX)
ld A, (ix)        ; Zero-displacement shorthand

; Explicitly unsupported:
ld A, (arr[i][j])  ; Nested indexing rejected with diagnostic
```

### 3. ISA Edge Cases

While the core instruction set is well-tested, some rare combinations may have gaps:

- Unusual ED-prefix forms (most common ones covered)
- Some obscure operand combinations

**Recommendation:** Verify output bytes for uncommonly-used instruction forms.

### 4. Listing Output (.lst)

The listing file provides a basic byte dump, not a full source listing:

```
; ZAX listing
; range: $0000..$000A (end exclusive)

0000: 3E 05 C9 .. 48 45 4C 4C 4F  |>.. HELLO|

; symbols:
; data msg = $0004
```

**Recommendation:** Use `.d8dbg.json` (D8M) for source-level debugging.

---

## Features Not Implemented (v0.1 Scope)

### Typed Pointers

```zax
; NOT supported in v0.1:
type IntPtr = ptr<word>  ; No parameterized pointers

; Current approach:
type IntPtr = ptr  ; Untyped pointer (2 bytes)
```

### Var Blocks in Ops

```zax
op myOp x:reg8
    var           ; NOT allowed in v0.1
        temp: byte
    end
end
```

### Recursive Ops

```zax
op recurse x:imm8
    recurse x - 1  ; Error: cyclic expansion detected
end
```

### Qualified Enum Access

```zax
enum Mode
    Read
    Write
end

; NOT supported:
ld A, Mode.Read

; Current approach:
ld A, Read  ; Members in global namespace
```

### Extended-Address HEX Records

Intel HEX files with type `02` or `04` records (extended addressing beyond 64KB) will produce an error.

### Signed Integer Semantics

All arithmetic is unsigned with two's complement truncation. No explicit signed types or overflow detection.

---

## Output Artifacts

| Artifact    | Extension     | Status   | Notes                                             |
| ----------- | ------------- | -------- | ------------------------------------------------- |
| Intel HEX   | `.hex`        | Complete | Standard format, sparse records, 64KB limit       |
| Flat binary | `.bin`        | Complete | Gap-filled with $00                               |
| Debug map   | `.d8dbg.json` | Complete | D8M v1 format with sparse segments, grouped files |
| Listing     | `.lst`        | Basic    | Byte dump + symbols only                          |

### CLI Usage

```bash
yarn -s zax -- [options] <entry.zax>

Options:
  -o, --output <file>   Primary output path
  -t, --type <type>     Primary output type (hex, bin)
  -n, --nolist          Suppress .lst
  --nobin               Suppress .bin
  --nohex               Suppress .hex
  --nod8m               Suppress .d8dbg.json
  -I, --include <dir>   Add import search path (repeatable)
  -V, --version
  -h, --help
```

---

## Use Cases

### Well-Suited For

1. **Small to medium Z80 programs** (games, utilities, ROM routines)
2. **Structured code** with functions and control flow
3. **Modular projects** with imports and exports
4. **Type-safe data structures** with records and unions
5. **Reusable instruction macros** via ops with overloading

### Proceed with Care

1. **Large multi-module projects** — test cross-module interactions thoroughly
2. **Complex pointer arithmetic** — verify manually
3. **Obscure Z80 instructions** — check byte output against reference

### Defer Until Future Versions

1. **Typed pointer generics** (`ptr<T>`)
2. **Extended HEX files** (beyond 64KB address space)
3. **Source-level listing** (use D8M for debugging)

---

## Testing Recommendations

Before shipping code compiled with ZAX:

1. **Compile and verify** — Run `yarn -s zax -- yourfile.zax`
2. **Check HEX output** — Load in emulator or disassembler
3. **Use D8M for debugging** — The `.d8dbg.json` has source mapping
4. **Write test cases** — Especially for complex control flow or type structures

---

## Conclusion

ZAX is functional for writing real Z80 programs. The core language pipeline (parser → lowering → encoder → emit) is solid with extensive test coverage across 397 tests and 324 fixtures. Structured control flow, functions, ops, and the type system are production-ready.

**Key strengths:**

- Comprehensive stack safety checking with explicit diagnostics
- Production-quality error messages without generic fallbacks
- Deterministic output verified by contract tests
- All core Z80 instruction families implemented

**Primary gaps:**

- ISA coverage breadth (~53%) — rare instruction forms
- Parser error recovery depth (~68%) — uncommon edge cases
- Cross-platform gate enforcement pending

**Recommendation:** Start using ZAX for hobby and educational projects now. For production work, stay within well-tested paths (as demonstrated by `examples/*.zax`) and verify output bytes for any unusual instruction forms.

The assembler will continue to mature as ISA coverage expands and the remaining gates progress toward 100%.
