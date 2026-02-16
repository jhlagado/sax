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

## 3. Worked Example A: Simple Word Echo

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
  echo $1234
  ld (out), hl
  ret
end
```

### A.2 Lowering Intent

- `echo(v: word)` returns `v` in `HL`
- `main` pushes arg, calls `echo`, cleans arg slots, stores returned `HL`
- callee preserves `AF/BC/DE` conservatively

### A.3 Illustrative Lowered `.asm`

```asm
; ZAX lowered .asm trace
; range: $0000..$0020 (end exclusive)

; func echo begin
echo:
push ix                        ; 0000: DD E5
ld ix, $0000                   ; 0002: DD 21 00 00
add ix, sp                     ; 0006: DD 39
push af                        ; 0008: F5
push bc                        ; 0009: C5
push de                        ; 000A: D5
ld l, (ix+$04)                 ; 000B: DD 6E 04
ld h, (ix+$05)                 ; 000E: DD 66 05
pop de                         ; 0011: D1
pop bc                         ; 0012: C1
pop af                         ; 0013: F1
ld sp, ix                      ; 0014: F9
pop ix                         ; 0015: DD E1
ret                            ; 0017: C9
; func echo end

; func main begin
main:
ld hl, $1234                   ; 0018: 21 34 12
push hl                        ; 001B: E5
call echo                      ; 001C: CD 00 00
inc sp                         ; 001F: 33
inc sp                         ; 0020: 33
ld (out), hl                   ; 0021: 22 00 10
ret                            ; 0024: C9
; func main end
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
inc sp                         ; allocate 2-byte local (example form)
inc sp

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
