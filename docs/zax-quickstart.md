# ZAX Quickstart (v0.1)

This is a practical, “how to write ZAX” companion to `docs/zax-spec.md`.
It’s intentionally short and example-driven.

Repository examples:
- `examples/hello.zax`
- `examples/stack_and_structs.zax`
- `examples/control_flow_and_labels.zax`

---

## 1) File Skeleton

```zax
module Hello

; Optional imports
; import IO
; import "vendor/legacy_io.zax"

; Module-scope declarations
const MsgLen = 10

data
  msg: byte[10] = "HELLO, ZAX"

extern func bios_putc(ch: byte): void at $F003

export func main(): void
  asm
    ; ...
    ret
end
```

Key points:
- Newlines terminate declarations and `asm` lines.
- Indentation is ignored; multi-line constructs end with `end` / `until <cc>`.

---

## 2) Storage: `var` vs `data`

Use `var` for uninitialized (BSS) storage:

```zax
var
  total: word
  mode: byte
```

Use `data` for initialized storage (emits bytes):

```zax
data
  banner: byte[5] = "HELLO"
  table: word[4] = { 1, 2, 3, 4 }
```

Address vs dereference:
- A storage symbol used as an operand means its **address**: `ld hl, banner`
- Parentheses dereference memory: `ld a, (banner)`

---

## 3) Functions and Locals

Functions are module-scope and contain an `asm` block. Locals are declared with a function-local `var` block.

```zax
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

Calling convention (v0.1):
- args are stack slots (each occupies 16 bits)
- return in `HL` (and for byte returns, in `L`)

---

## 4) Calling Functions From `asm`

Inside `asm`, a line beginning with a function name is a call:

```zax
extern func bios_putc(ch: byte): void at $F003

func print_R(): void
  asm
    bios_putc 'R'
    ret
end
```

Arguments can be registers, immediates, addresses (`ea`), or dereferences (`(ea)`).

---

## 5) Structured Control Flow

ZAX structured control flow is only available inside `asm` streams.

Flag-based forms:

```zax
or a
if Z
  ; ...
else
  ; ...
end

repeat
  dec b
until Z
```

Value dispatch (`select`/`case`, no fallthrough in v0.1):

```zax
ld a, (mode)
select A
  case 0
    ; ...
  else
    ; ...
end
```

---

## 6) Records and Arrays (Effective Addresses)

`rec.field` and `arr[i]` are **effective addresses** (addresses), not dereferences.

```zax
type Sprite
  x: word
  y: word
  flags: byte
end

var
  sprites: Sprite[4]

export func bump_sprite_x(i: byte, dx: byte): void
  asm
    ld a, (i)
    ld c, a

    ; load sprites[i].x
    ld hl, (sprites[C].x)

    ; add dx
    ld a, (dx)
    ld e, a
    ld d, 0
    add hl, de

    ; store back
    ld (sprites[C].x), hl
    ret
end
```

Some `ea` forms aren’t directly encodable in a single Z80 instruction; the compiler may lower them to an equivalent sequence (see spec §6.1.1).

---

## 7) `op` (Inline Macro-Instructions)

`op` defines opcode-like inline macros with operand matchers:

```zax
op add16(dst: HL, src: reg16)
  add hl, src
end
```

Note: `op` bodies are implicit `asm` streams in v0.1 (there is no `asm` keyword inside an `op`).

Invoke an `op` in an `asm` stream like an instruction:

```zax
add16 HL, DE
```

---

## 8) External Bytes: `bin` / `hex`

```zax
bin legacy in code from "asm80/legacy.bin"
hex bios from "rom/bios.hex"
```

- `bin` emits a contiguous blob into a section (`in code|data|var` required).
- `hex` writes bytes to absolute addresses in final address space (see spec §6.4).
