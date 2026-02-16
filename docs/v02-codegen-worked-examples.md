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

## 3. Worked Example A: Echo Call With Local Storage

### A.1 Source (`.zax`)

```zax
section code at $0000
section var at $1000

globals
  out: word

func echo(value_word: word): word
  LD HL, value_word
  RET
end

export func main(): void
  var
    tmp: word
  end

  echo $1234
  LD tmp, HL
  LD HL, tmp
  LD (out), HL
  RET
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
  RET
end

export func main(): void
  var
    temp_word: word
  end

  LD HL, $0100
  LD temp_word, HL

  add1 temp_word
  LD temp_word, HL

  RET
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
  RET
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

- declarations support explicit initializers (`name: type = value`)
- omitted initializer means logical zero-initialization

Backend note:

- storage classes may still lower differently (initialized image vs zeroed storage), but user-facing declaration semantics stay uniform.
