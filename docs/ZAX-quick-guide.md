# ZAX Quick Guide

A practical quick-start guide to ZAX v0.2.

This guide is instructional, not normative. Canonical language behavior is defined in `docs/zax-spec.md`.

## Table of Contents

- [Chapter 1 - Overview and Toolchain](#chapter-1---overview-and-toolchain)
- [Chapter 2 - Storage Model](#chapter-2---storage-model)
- [Chapter 3 - Addressing and Indexing](#chapter-3---addressing-and-indexing)
- [Chapter 4 - Constants and Compile-Time Expressions](#chapter-4---constants-and-compile-time-expressions)
- [Chapter 5 - Structured Control Flow](#chapter-5---structured-control-flow)
- [Chapter 6 - Functions and Call Boundaries](#chapter-6---functions-and-call-boundaries)
- [Chapter 7 - The `op` System](#chapter-7---the-op-system)
- [Chapter 8 - Enums and Namespaces](#chapter-8---enums-and-namespaces)
- [Chapter 9 - Records and Unions](#chapter-9---records-and-unions)
- [Chapter 10 - Modules and Imports](#chapter-10---modules-and-imports)
- [Chapter 11 - Binary Layout and Hardware Mapping](#chapter-11---binary-layout-and-hardware-mapping)
- [Chapter 12 - Design Patterns and Structured Systems](#chapter-12---design-patterns-and-structured-systems)

## Chapter 1 - Overview and Toolchain

### 1.1 What ZAX Is

ZAX is a structured assembler for Z80-family targets.

It combines:

- raw Z80 instruction authoring
- structured control flow (`if`, `while`, `repeat`, `select`)
- typed storage (`byte`, `word`, `addr`, arrays, records, unions)
- compile-time expressions (`const`, `sizeof`, `offsetof`)
- inline macro-instructions (`op`)

ZAX does not add a runtime system, hidden allocation, or hidden scheduler model.
Function lowering may still emit compiler-owned prologue/epilogue frame code where required by the typed function contract.

### 1.2 Why Use It

ZAX targets teams that want assembler-level control with stronger structure and consistency.

Typical use cases:

- game engines
- firmware and monitor tools
- ROM code
- education and systems programming

### 1.3 Minimal Program

```zax
export func main(): void
  ld a, 'A'
  ret
end
```

When compiled and executed in a typical monitor flow:

- register `A` holds `0x41`
- control returns to caller via `RET`

### 1.4 CLI Basics

```sh
zax [options] <entry.zax>
```

Common outputs:

- `.hex`
- `.bin`
- `.d8dbg.json`
- `.lst`
- `.asm` (deterministic lowered trace for codegen inspection)

Useful contract options:

- `--case-style <m>` (`off|upper|lower|consistent`) for case-style linting
- `--op-stack-policy <m>` (`off|warn|error`) for optional op stack-policy diagnostics at typed call boundaries
- `--type-padding-warn` to emit warnings when composite type storage is padded to power-of-2 size
- `--raw-typed-call-warn` to warn when raw `call` targets typed callable symbols

## Chapter 2 - Storage Model

### 2.1 Scalar Types

| Type   | Size (bytes) | Notes                  |
| ------ | ------------ | ---------------------- |
| `byte` | 1            | 8-bit storage          |
| `word` | 2            | 16-bit storage         |
| `addr` | 2            | 16-bit address storage |

There are no signed storage types in v0.2.

### 2.2 Composite Storage Rule

Composite storage (`array`, `record`, `union`) is rounded to the next power of two.

Example:

```zax
type Sprite
  x: byte
  y: byte
  tile: byte
  flags: word
end
```

Natural size is `5`, storage size is `8`.

The compiler warns when a composite type is implicitly padded. Explicit padding to a power-of-2 size suppresses the warning.

### 2.3 Why This Rule Exists

Runtime scaling uses shifts, not multiplication.

| Element size | Scaling sequence |
| ------------ | ---------------- |
| 1            | none             |
| 2            | `ADD HL,HL`      |
| 4            | `ADD HL,HL` x2   |
| 8            | `ADD HL,HL` x3   |

### 2.4 `sizeof` and `offsetof`

- `sizeof(Type)` returns storage size
- `offsetof(Type, fieldPath)` returns byte offset

```zax
const SpriteSize = sizeof(Sprite)
const FlagOffset = offsetof(Sprite, flags)
```

### 2.5 `globals` and Alias Forms

`globals` supports three declaration forms:

- storage declaration: `name: Type`
- typed value initializer: `name: Type = valueExpr`
- alias initializer (inferred): `name = rhs`

Typed alias form is invalid:

- `name: Type = rhs` is rejected.

```zax
globals
  boot_count: word = 1
  current_count = boot_count
```

## Chapter 3 - Addressing and Indexing

### 3.1 Core Forms

```zax
arr[5]
arr[A]
arr[HL]
arr[idx]
arr[(HL)]
```

### 3.2 Critical v0.2 Semantics

- `arr[HL]` means direct 16-bit index from `HL`
- `arr[(HL)]` means index comes from byte at memory address `(HL)`
- `arr[(3+5)]` is valid but warns as redundant grouping (same as `arr[3+5]`)

### 3.3 Runtime Atom Rule

A source-level `ea` expression may contain at most one runtime-varying source.

Allowed:

```zax
arr[CONST1 + CONST2 * 4]
arr[CONST1 + CONST2 * 4][idx]
arr[idx].field
arr[idx + 3]
arr[(idxw << 1) + 6]
grid[idx][0]
grid[0][idx]
```

Current lowering supports single-atom affine forms using constants with `+`, `-`, `*` (power-of-2 multipliers), and `<<`.
Runtime expressions that require non-affine ops (`/`, `%`, `&`, `|`, `^`, `>>`) should be staged first.

Rejected in one expression:

```zax
arr[i + j]
grid[row][col]
```

Stage multi-dynamic work over multiple lines.

## Chapter 4 - Constants and Compile-Time Expressions

### 4.1 `const`

```zax
const ScreenBase = $C000
const TileBytes = 32
```

### 4.2 Operators

`imm` expressions support unary and binary arithmetic/bitwise operators plus parentheses.

Use compile-time constants to keep runtime lowering simple.

### 4.3 Example

```zax
const BufferSize = sizeof(Sprite) * 8
```

## Chapter 5 - Structured Control Flow

### 5.1 `if` / `else`

```zax
cp 0
if Z
  ld a, 1
else
  ld a, 2
end
```

### 5.2 `while`

```zax
ld b, 10
while NZ
  dec b
  ld a, b
  or a
end
```

### 5.3 `repeat ... until`

```zax
repeat
  dec b
  ld a, b
  or a
until Z
```

### 5.4 `select`

```zax
ld a, mode
select A
  case Mode.Idle
    ld a, 0
  case Mode.Run
    ld a, 1
  else
    ld a, $FF
end
```

## Chapter 6 - Functions and Call Boundaries

### 6.1 Function Shape

```zax
export func add8(lhs: byte, rhs: byte): byte
  ld a, lhs
  add a, rhs
  ld l, a
  ret
end
```

### 6.2 v0.2 Typed Call Boundary Contract

- `HL` is boundary-volatile for all typed calls (including `void`)
- non-`void` typed calls use `HL` as return channel (`L` for byte returns)
- non-`HL` registers/flags are boundary-preserved by typed-call glue

Lowering consequence:

- call wrappers do not preserve incoming `HL`
- non-void call wrappers publish result via `HL`/`L`

### 6.3 Practical Rule

Keep call-site arguments simple; stage dynamic address/value work first.

- Scalar value-semantic arguments (`var`, `rec.field`, `arr[idx]`) may use the normal source `ea` runtime-atom rule (max one runtime atom).
- Direct address arguments (`ea`/`(ea)` as address-style call-site forms) remain runtime-atom-free in v0.2.
- Stack-verification diagnostics distinguish typed call boundaries from raw `call` instructions.
- `--raw-typed-call-warn` is available as an advisory lint when raw `call`/`call cc,nn` targets a typed callable symbol.

### 6.4 Non-Scalar Argument Contracts (`[]` vs `[N]`)

- non-scalar args are passed as 16-bit address-like references
- `T[]` parameter: element-shape contract, length unspecified
- `T[N]` parameter: exact-length contract

Compatibility:

- `T[N] -> T[]` allowed
- `T[] -> T[N]` rejected unless exact-length proof exists
- element-type mismatch rejected

```zax
globals
  sample_bytes: byte[10] = { 1,2,3,4,5,6,7,8,9,10 }

func sum_fixed_10(values: byte[10]): word
end

func sum_any(values: byte[]): word
end

export func main(): void
  sum_fixed_10 sample_bytes
  sum_any sample_bytes
end
```

### 6.5 Frame Model Summary (IX-Anchored)

Framed functions use:

- prologue: `PUSH IX`, `LD IX,0`, `ADD IX,SP`
- args at positive offsets (`IX+4..`)
- scalar locals at negative offsets (`IX-1..`)
- epilogue: `LD SP,IX`, `POP IX`, `RET`

## Chapter 7 - The `op` System

### 7.1 What `op` Is

`op` is inline expansion with operand matching, not a function call.

```zax
op clear_carry()
  or a
end
```

### 7.2 Overloads by Matcher

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

### 7.3 Key Constraints

- module-scope declarations only
- no `var` blocks in `op` bodies
- cyclic expansion is an error
- stack/register discipline in op bodies is developer-managed

## Chapter 8 - Enums and Namespaces

### 8.1 Declaration

```zax
enum Mode Idle, Run, Panic
```

### 8.2 Qualified Usage Required

```zax
ld a, Mode.Run
```

Unqualified references (`Run`) are compile errors.

## Chapter 9 - Records and Unions

### 9.1 Record

```zax
type Point
  x: byte
  y: byte
end
```

### 9.2 Union

```zax
union WordBytes
  w: word
  lo: byte
  hi: byte
end
```

Union fields share offset `0`; storage size follows max-member, power-of-two storage rules.

## Chapter 10 - Modules and Imports

### 10.1 Imports

```zax
import core
import "drivers/uart.zax"
```

### 10.2 Global Namespace

Imported module-scope names share global namespace; collisions are errors.

### 10.3 Deterministic Build

Module ordering and section packing are deterministic.

## Chapter 11 - Binary Layout and Hardware Mapping

### 11.1 Sections

- `code`
- `data`
- `var`

```zax
section code at $8000
align 16
```

### 11.2 External Binary Sources

```zax
bin sprite_data in data from "assets/sprites.bin"
hex bios from "rom/bios.hex"
```

### 11.3 `extern`

```zax
extern func bios_putc(ch: byte): void at $F003
```

## Chapter 12 - Design Patterns and Structured Systems

### 12.1 Introduction

This chapter combines structured control flow, typed layout, inline `op` expansion, and explicit function boundaries into reusable system-level patterns.

### 12.2 Pattern 1 - State Machine with `enum` + `select`

```zax
enum DeviceState Idle, Busy, Error

globals
  state: byte

export func main(): void
loop:
  ld a, state
  select A
  case DeviceState.Idle
    ld a, DeviceState.Busy
    ld state, a
  case DeviceState.Busy
    ld a, DeviceState.Idle
    ld state, a
  case DeviceState.Error
    ld a, DeviceState.Idle
    ld state, a
  end
  jr loop
end
```

Behavior:

- state transitions stay explicit in source
- enum qualification keeps state names unambiguous
- lowering stays bounded to direct compare/branch dispatch

### 12.3 Pattern 2 - Hardware Driver Skeleton

```zax
type UART
  status: byte
  control: byte
  tx_data: byte
end

section var at $A000
globals
  uart: UART

op wait_ready()
wait:
  ld a, uart.status
  cp 1
  jr NZ, wait
end

func uart_send(value: byte): void
  wait_ready
  ld uart.tx_data, value
  ret
end
```

Behavior:

- register offsets are resolved from typed layout at compile time
- `op` expansion is inline (no function-call boundary for `wait_ready`)
- polling loop remains visible and reviewable in emitted flow

### 12.4 Pattern 3 - Structured Command Dispatch

```zax
enum Command CmdRead, CmdWrite, CmdReset

func handle_command(cmd: byte): void
  ld a, cmd
  select A
  case Command.CmdRead
    ; read handler
  case Command.CmdWrite
    ; write handler
  case Command.CmdReset
    ; reset handler
  end
  ret
end
```

Behavior:

- dispatch intent is explicit at one site
- enum-qualified cases avoid ambiguous integer literals
- manual compare-chain duplication is avoided in source

### 12.5 Pattern 4 - Layered Abstraction

Use this layering model:

- `op` for local micro-sequences
- `func` for boundary-safe callable units
- `enum` for symbolic state and command domains
- records/unions for deterministic binary layout

### 12.6 Maintaining Predictability

- Keep composite types power-of-two aligned.
- Keep each address expression within runtime-atom budget.
- Stage multi-step dynamic addressing over multiple lines.
- Keep `op` bodies small and mechanical.
- Use `sizeof` and `offsetof` instead of manual layout math.
- Use qualified enum names everywhere.

### 12.7 Mini Firmware Loop Example

```zax
enum Mode Normal, Panic

globals
  mode: byte
  fault_latched: byte

export func main(): void
main_loop:
  ld a, fault_latched
  or a
  if NZ
    ld a, Mode.Panic
    ld mode, a
  end

  ld a, mode
  select A
  case Mode.Normal
    ; normal work
  case Mode.Panic
    ; safe mode
  end

  jr main_loop
end
```

Execution model:

- flags are established explicitly before `if`
- state transitions remain value-visible in typed scalars
- no hidden scheduler or runtime is introduced

### 12.8 Final Checklist

- Prefer constants and compile-time layout queries.
- Keep addressing expressions within runtime-atom budget.
- Keep `op` bodies mechanical and reviewable.
- Keep function boundaries explicit and typed.
- Treat `docs/zax-spec.md` as final authority.

### 12.9 Summary

These patterns keep large Z80 systems maintainable while preserving assembler-level control and predictable lowering.

---

End of quick guide.
