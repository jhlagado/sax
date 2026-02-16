# v0.2 Codegen Worked Examples (Draft)

This document expands the lowering design with concrete, end-to-end examples.

Normative language semantics are defined by `docs/zax-spec.md`.
This document is a codegen/lowering design reference.

## 1. Assumptions Used in These Examples

Examples below assume the policy direction discussed in v0.2 planning:

- typed function calls are preservation-safe by default
- return channel is `HL` for non-void functions (`L` for byte)
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

func echo(v: word): word
  ld hl, v
  ret
end

export func main(): void
  var
    tmp: word
  end

  echo $1234
  ld tmp, hl
  ld hl, tmp
  ld (out), hl
  ret
end
```

### A.2 Lowering Intent

- `echo(v: word)` returns `v` in `HL`
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
func add1(x: word): word
  ld hl, x
  inc hl
  ret
end

export func main(): void
  var
    t: word
  end

  ld hl, $0100
  ld t, hl

  add1 t
  ld t, hl

  ret
end
```

### B.2 Lowering Intent

- `main` allocates local `t` in frame (`IX-2..IX-1`)
- `t` load/store use fixed IX displacements
- nested call keeps frame stable and cleans one pushed arg word

### B.3 Illustrative Lowered `.asm`

```asm
; func main begin
main:
push ix
ld ix, $0000
add ix, sp
dec sp                         ; allocate 2-byte local (example form)
dec sp

push af
push bc
push de

ld hl, $0100
ld (ix-$02), l
ld (ix-$01), h

ld l, (ix-$02)
ld h, (ix-$01)
push hl
call add1
inc sp
inc sp

ld (ix-$02), l
ld (ix-$01), h

pop de
pop bc
pop af
ld sp, ix
pop ix
ret
; func main end
```

## 5. Preservation Policy Table (Design Target)

| Function kind | Return type | Boundary-visible changed regs             | Preserved regs (target)                                |
| ------------- | ----------- | ----------------------------------------- | ------------------------------------------------------ |
| typed `func`  | `void`      | none                                      | `AF`, `BC`, `DE`, `IX` (and `HL` preserved for `void`) |
| typed `func`  | byte        | `L` (or `HL` if normalized policy chosen) | non-return boundary regs preserved                     |
| typed `func`  | word/addr   | `HL`                                      | non-return boundary regs preserved                     |
| `extern`      | any         | per declared ABI/clobber contract         | per declared ABI/clobber contract                      |

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
