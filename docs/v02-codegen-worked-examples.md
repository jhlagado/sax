# v0.2 Codegen Worked Examples (Draft)

This document expands the lowering design with concrete, end-to-end examples.

Normative language semantics are defined by `docs/zax-spec.md`.
This document is a codegen/lowering design reference.

## 1. Assumptions Used in These Examples

Examples below assume the policy direction discussed in v0.2 planning:

- typed function calls are preservation-safe by default
- return channel is `HL` for non-void functions (`L` for byte)
- `HL` is treated as volatile across all typed calls (including `void` returns)
- `IX` is used as frame anchor for function argument/local addressing
- temporary conservative callee-preserved set is `AF`, `BC`, `DE` until volatility inference lands
- `IX` is reserved for frame management
- caller cleans pushed arguments after call
- `IX+d` byte-lane transfers use `DE` shuttle when semantic source/destination is `HL`

## 2. Frame Layout Model

After prologue:

```asm
push ix
ld ix, 0
add ix, sp
```

Frame shape:

- `IX+0..1`: saved old `IX`
- `IX+2..3`: return address
- `IX+4..`: arguments
- `IX-1..`: locals

Canonical epilogue:

```asm
ld sp, ix
pop ix
ret
```

Legal frame-slot word transfer pattern when semantic register is `HL`:

```asm
; HL <- frame slot
ex de, hl
ld e, (ix+disp_lo)
ld d, (ix+disp_hi)
ex de, hl

; frame slot <- HL
ex de, hl
ld (ix+disp_lo), e
ld (ix+disp_hi), d
ex de, hl
```

Local scalar initializers are lowered in declaration order.
For word-slot constants at function entry, examples prefer:

```asm
ld hl, imm16
push hl
```

## 3. Worked Example A: Echo Call With Local Storage

### A.1 Source (`.zax`)

```zax
section code at $0000
section var at $1000

globals
  out: word

func echo(value_word: word): word
  LD HL, value_word
end

export func main(): void
  var
    tmp: word
  end

  echo $1234
  LD tmp, HL
  LD HL, tmp
  LD (out), HL
end
```

### A.2 Lowering Intent

- `echo(value_word: word)` returns `value_word` in `HL`
- `main` allocates one local word (`tmp`) via IX-frame offsets
- `main` pushes arg, calls `echo`, cleans arg slots, round-trips value through `tmp`, then stores to global `out`
- callee preserves `AF/BC/DE` conservatively

### A.3 Illustrative Lowered `.asm`

```asm
; ZAX lowered .asm trace
; range: $0000..$0044 (end exclusive)

; func echo begin
echo:
PUSH IX                        ; 0000: DD E5
LD IX, $0000                   ; 0002: DD 21 00 00
ADD IX, SP                     ; 0006: DD 39
PUSH AF                        ; 0008: F5
PUSH BC                        ; 0009: C5
PUSH DE                        ; 000A: D5
LD L, (IX+$04)                 ; 000B: DD 6E 04
LD H, (IX+$05)                 ; 000E: DD 66 05
POP DE                         ; 0011: D1
POP BC                         ; 0012: C1
POP AF                         ; 0013: F1
LD SP, IX                      ; 0014: F9
POP IX                         ; 0015: DD E1
RET                            ; 0017: C9
; func echo end

; func main begin
main:
PUSH IX                        ; 0018: DD E5
LD IX, $0000                   ; 001A: DD 21 00 00
ADD IX, SP                     ; 001E: DD 39
DEC SP                         ; 0020: 3B
DEC SP                         ; 0021: 3B
PUSH AF                        ; 0022: F5
PUSH BC                        ; 0023: C5
PUSH DE                        ; 0024: D5
LD HL, $1234                   ; 0025: 21 34 12
PUSH HL                        ; 0028: E5
CALL echo                      ; 0029: CD 00 00
INC SP                         ; 002C: 33
INC SP                         ; 002D: 33
LD (IX-$02), L                 ; 002E: DD 75 FE
LD (IX-$01), H                 ; 0031: DD 74 FF
LD L, (IX-$02)                 ; 0034: DD 6E FE
LD H, (IX-$01)                 ; 0037: DD 66 FF
LD (out), HL                   ; 003A: 22 00 10
POP DE                         ; 003D: D1
POP BC                         ; 003E: C1
POP AF                         ; 003F: F1
LD SP, IX                      ; 0040: F9
POP IX                         ; 0041: DD E1
RET                            ; 0043: C9
; func main end

; symbols:
; label echo = $0000
; label main = $0018
; var out = $1000
```

Note:

- caller argument cleanup is shown with `inc sp` to avoid clobbering preserved registers.
- if a caller marks a register dead, `pop`-based cleanup can be legal as an optimization.

## 4. Worked Example B: Locals + Nested Call

### B.1 Source (`.zax`)

```zax
func add1(input_value: word): word
  LD HL, input_value
  INC HL
end

export func main(): void
  var
    temp_word: word
  end

  LD HL, $0100
  LD temp_word, HL

  add1 temp_word
  LD temp_word, HL
end
```

### B.2 Lowering Intent

- `main` allocates local `temp_word` in frame (`IX-2..IX-1`)
- `temp_word` load/store use fixed IX displacements
- nested call keeps frame stable and cleans one pushed arg word

### B.3 Illustrative Lowered `.asm`

```asm
; func main begin
main:
PUSH IX
LD IX, $0000
ADD IX, SP
DEC SP                         ; allocate 2-byte local (example form)
DEC SP

PUSH AF
PUSH BC
PUSH DE

LD HL, $0100
LD (IX-$02), L
LD (IX-$01), H

LD L, (IX-$02)
LD H, (IX-$01)
PUSH HL
CALL add1
INC SP
INC SP

LD (IX-$02), L
LD (IX-$01), H

POP DE
POP BC
POP AF
LD SP, IX
POP IX
RET
; func main end
```

## 5. Preservation Policy Table (Design Target)

| Function kind | Return type | Boundary-visible changed regs     | Preserved regs (target)            |
| ------------- | ----------- | --------------------------------- | ---------------------------------- |
| typed `func`  | `void`      | `HL` (undefined on return)        | `AF`, `BC`, `DE`, `IX`             |
| typed `func`  | byte        | `L` (with `HL` volatile)          | non-return boundary regs preserved |
| typed `func`  | word/addr   | `HL`                              | non-return boundary regs preserved |
| `extern`      | any         | per declared ABI/clobber contract | per declared ABI/clobber contract  |

## 6. Transition Note: Volatility Inference

Long-term target:

- infer callee-save requirements from expanded lowered instruction stream
- preserve only actually-clobbered preserved-class registers

Interim acceptable policy:

- conservatively preserve `AF/BC/DE` for typed functions
- move to inferred strategy once side-effect tables and validation are in place

## 7. Why This Matters

This model keeps ZAX predictable as a virtual assembler:

- hidden lowering remains composable
- register damage is bounded by explicit policy
- frame and call behavior are inspectable from emitted `.asm`

## 8. Return-Rewrite Policy (Design Target)

For framed functions, internal `RET` statements should lower to a jump to one synthetic epilogue label.
That keeps unwind behavior centralized and avoids duplicated restore sequences.
The final trailing `RET` in source is redundant and may be omitted when fallthrough reaches the same synthetic epilogue path.

Design-target shape:

```asm
; inside function body
JP __zax_epilogue_funcname

; single epilogue site
__zax_epilogue_funcname:
POP DE
POP BC
POP AF
LD SP, IX
POP IX
RET
```

This is especially important once functions have locals and multiple control-flow exits.

## 9. Worked Example C: Iterative Fibonacci With Structured Loop

### C.1 Source (`.zax`)

```zax
func fib(target_count: word): word
  var
    prev_value: word = $0000
    curr_value: word = $0001
    index_value: word = $0000
    next_value: word = $0000
  end

  while NZ
    LD HL, index_value
    CP HL, target_count
    if Z
      LD HL, prev_value
      RET
    end

    LD HL, prev_value
    ADD HL, curr_value
    LD next_value, HL
    LD HL, curr_value
    LD prev_value, HL
    LD HL, next_value
    LD curr_value, HL
    LD HL, index_value
    INC HL
    LD index_value, HL
  end

  LD HL, prev_value
end
```

### C.2 Lowering Intent

- four locals live in IX-frame space
- local initializers are lowered at function entry
- multiple source `ret` points are rewritten to `JP __zax_epilogue_fib`
- one epilogue does full restore and final `RET`

### C.3 Illustrative Lowered `.asm` (excerpt)

```asm
; func fib begin
fib:
PUSH IX
LD IX, $0000
ADD IX, SP
DEC SP
DEC SP
DEC SP
DEC SP
DEC SP
DEC SP
DEC SP
DEC SP
PUSH AF
PUSH BC
PUSH DE
; local init (prev_value,curr_value,index_value,next_value)
; ...

__zax_while_head_0:
; compare index_value vs target_count
; ...
JP Z, __zax_if_true_0
JP __zax_if_end_0

__zax_if_true_0:
LD L, (IX-$02)                 ; prev_value low
LD H, (IX-$01)                 ; prev_value high
JP __zax_epilogue_fib

__zax_if_end_0:
; next_value = prev_value + curr_value, rotate values, index_value++
; ...
JP __zax_while_head_0

; fallthrough return path
LD L, (IX-$02)
LD H, (IX-$01)
JP __zax_epilogue_fib

__zax_epilogue_fib:
POP DE
POP BC
POP AF
LD SP, IX
POP IX
RET
; func fib end
```

## 10. Case and Naming Policy (Design Target)

To reduce register/value ambiguity in ZAX source:

- Register tokens are written in uppercase in canonical examples (`A`, `BC`, `HL`, `IX`, `IY`).
- Instruction mnemonics are shown uppercase in canonical examples.
- Variable/arg/local names must not collide with register tokens.

Reserved identifier set (case-insensitive ban):

- `A`, `B`, `C`, `D`, `E`, `H`, `L`, `F`
- `AF`, `BC`, `DE`, `HL`, `IX`, `IY`, `SP`

This preserves compatibility with mixed-case imported asm while keeping human readability and diagnostics unambiguous.

## 11. Declaration Initialization Policy (Design Target)

Language-surface direction:

- value initialization uses explicit typed form (`name: type = value`)
- alias initialization uses inferred form (`name = rhs`)
- typed alias form (`name: type = rhs`) is invalid by design
- omitted initializer means declaration has no explicit source initializer

Backend note:

- storage classes may still lower differently (initialized image vs zeroed storage), but user-facing declaration semantics stay uniform.

### 11.1 Composite Aliasing Policy (Design Target)

Goal: support shape-aware aliasing without requiring explicit pointer operators in v0.2.

Rules:

- Function locals/args remain scalar-slot storage in the current ABI.
- A local composite declaration without initializer is a compile error (would imply stack composite allocation, not currently supported).
- Composite locals may be declared only as aliases using inferred alias form (`name = rhs`).
- In globals, both forms are allowed:
  - value initializer: defines storage contents
  - reference initializer: defines an alias to existing composite storage
- Typed alias spellings are rejected in all scopes.

Global example:

```zax
type Person
  name_word: word
end

globals
  persons: Person[] = { ... }      ; value initializer (storage)
  admins = persons                 ; reference initializer (alias, inferred type)
```

Local alias example (allowed):

```zax
func use_admins(): void
  var
    admin_list = admins            ; reference initializer only (inferred type)
  end

  LD HL, admin_list[2].name_word
end
```

Local composite allocation example (rejected for now):

```zax
func bad_local_composite(): void
  var
    scratch_people: Person[4]      ; error: local composite storage not supported in current ABI
  end
end
```

Type-shape rule:

- Alias shape is inferred from the RHS symbol/address expression.
- If RHS type cannot be resolved to a concrete storage shape, declaration is a compile error.

### 11.2 Scalar Initializers and Aliases (Design Target)

```zax
globals
  glob1: word = 23
  glob2 = glob1

func func1(input_word: word): word
  var
    local1: word = 0
    local2 = glob1
  end

  LD HL, local2
end
```

Interpretation:

- `glob1: word = 23` is typed scalar value initialization.
- `glob2 = glob1` is alias binding with inferred type.
- `local1: word = 0` allocates one local scalar slot and emits entry initialization lowering.
- `local2 = glob1` is a local alias binding (no local slot allocation).

### 11.2a Place Expressions vs Address Context (Design Target)

Goal: keep scalar field/element usage high-level in instruction streams while preserving explicit
address passing where `ea` is required.

```zax
type Pair
  lo: byte
  hi: byte
end

globals
  p: Pair = 0           ; current compiler-supported composite zero-init form

op touch(addr: ea)
  LD A, (addr)
end

func main(): void
  LD A, p.lo            ; value context: reads byte at p.lo
  LD p.lo, A            ; store context: writes byte to p.lo
  touch p.lo            ; ea context: passes address of p.lo
end
```

Context rule:

- `rec.field` and `arr[idx]` are place expressions.
- In value/store instruction contexts, scalar places are read/written as values.
- When a matcher/parameter requires `ea`, place expressions are passed as addresses.
- Explicit address-of is available via `@place` (for example `@p.lo`) when address intent should be explicit.

### 11.3 Non-Scalar Function Arguments: `[]` vs `[N]` (Design Target)

Policy:

- Non-scalar function arguments are passed as 16-bit address-like references at call boundary.
- Parameter type controls callee-side access semantics.
- `T[]` in parameter position means element-shape contract only (length unspecified by signature).
- `T[N]` in parameter position means exact-length contract.

Compatibility:

- Passing `T[N]` to `T[]` is allowed.
- Passing `T[]` to `T[N]` is rejected unless compiler can prove length is exactly `N`.
- Passing mismatched element type is rejected (`byte[]` to `word[]`, etc).

Example: globals array passed to both flexible and fixed signatures

```zax
globals
  sample_bytes: byte[10] = { 1,2,3,4,5,6,7,8,9,10 }

func sum_fixed_10(values: byte[10]): word
  ; fixed contract: exactly 10 bytes expected
  ; ...
end

func sum_any(values: byte[]): word
  ; flexible contract: element type byte, length not encoded in signature
  ; ...
end

export func main(): void
  sum_fixed_10 sample_bytes   ; valid: exact-length match
  sum_any sample_bytes        ; valid: [10] -> [] widening
end
```

Negative example: narrowing without proof

```zax
globals
  inferred_view = sample_bytes

func needs_ten(values: byte[10]): word
  ; ...
end

export func main_bad(): void
  needs_ten inferred_view      ; error unless compiler can prove length is 10
end
```

Lowering note:

- Call lowering still pushes one 16-bit argument slot for non-scalar args.
- The non-scalar "by-reference" meaning is semantic/type-level, not a different stack width.

Implementation evidence:

- `test/pr286_nonscalar_param_compat_matrix.test.ts` covers:
  - `T[N] -> T[]` acceptance
  - exact `T[N] -> T[N]` acceptance
  - `T[] -> T[N]` rejection without exact-length proof
  - element-type mismatch rejection (`byte[]` vs `word[]`)

## 12. Codegen Acceptance Matrix (Must-Complete for v0.2)

Each row requires:

- one `.zax` fixture
- expected lowered `.asm` trace assertions
- negative test (when applicable)

1. Scalar + frame basics

- single arg return (`word` and `byte`)
- one local scalar slot with initializer
- multiple `RET` rewrite to shared epilogue

2. Alias semantics

- global scalar alias (`name = rhs`)
- global composite alias (`admins = persons`)
- local alias to global symbol
- reject typed alias form (`name: Type = rhs`)

2a. Non-scalar call compatibility semantics

- pass `T[N]` to `T[]` argument (accepted)
- pass `T[]` to `T[N]` without proof (rejected)
- pass element-type mismatch (`byte[]` to `word[]`) (rejected)

3. Composite addressing

- array constant index (`arr[2]`)
- array register index (`arr[HL]`)
- indirect index (`arr[(HL)]`)
- nested field/index (`records[index_value].field_word`)

4. Nested expression/runtime-atom bounded lowering

- pass at atom budget limit
- fail over atom budget with diagnostic suggesting staging
- staged equivalent accepted across multiple lines

5. Call-boundary/preservation interactions

- typed call with scalar args and alias-origin operands
- caller arg cleanup shape (`INC SP` or equivalent)
- `HL` treated volatile across all typed calls

## 13. Advanced Nested-Expression Example Set (Planned Fixtures)

### 13.1 Budget-pass example (illustrative)

```zax
; assume atom budget allows this form
LD HL, table_rows[index_value].cells[col_index]
```

Expected:

- accepted lowering
- deterministic hidden sequence
- preservation contract satisfied

### 13.2 Budget-fail example (illustrative)

```zax
LD HL, matrix[row_index + delta_value][col_index + stride_value]
```

Expected:

- compile error: runtime-atom budget exceeded for one expression
- diagnostic suggests staging into intermediate locals/aliases

### 13.3 Staged equivalent (accepted)

```zax
LD HL, row_index
ADD HL, delta_value
LD staged_row, HL

LD HL, col_index
ADD HL, stride_value
LD staged_col, HL

LD HL, matrix[staged_row][staged_col]
```

Expected:

- accepted under atom rules
- same semantic result as budget-fail single-line form
