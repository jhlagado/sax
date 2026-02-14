# ZAX Tutorial

A practical, end-to-end tutorial for writing structured Z80 assembly in ZAX.

This tutorial is instructional and non-normative. Canonical language rules live in `docs/zax-spec.md`.

## 1. Setup and First Build

Requirements:

- Node.js 20+
- Yarn

From the repository root:

```sh
yarn install
yarn -s zax -- examples/hello.zax
```

Expected artifacts next to the source file:

- `.hex`
- `.bin`
- `.lst`
- `.d8dbg.json`

## 2. Your First ZAX Program

Create `hello.zax`:

```zax
export func main(): void
  ld a, 'A'
  ret
end
```

What this demonstrates:

- You are writing direct Z80 instructions (`ld`, `ret`).
- `func` gives structure and symbol naming, not a high-level runtime.
- `export` makes the symbol visible to the build.

## 3. Add Constants and Storage

ZAX separates initialized bytes (`data`) from reserved storage (`globals`).

```zax
const
  MsgLen = 5
end

data
  msg: byte[5] = "HELLO"
end

globals
  cursor: addr
end

export func main(): void
  ld hl, msg
  ld cursor, hl
  ret
end
```

Notes:

- `data` emits bytes into the image.
- `globals` reserves addresses (typically RAM), no emitted bytes.
- `cursor` is a typed scalar with value semantics in `LD`/typed call contexts.

## 4. Structured Control Flow with Real Flags

Control flow is explicit but still flag-driven.

```zax
export func countdown(): void
  ld b, 5
  repeat
    dec b
  until Z
end
```

Key rule:

- Structured keywords test current CPU flags.
- You set flags using normal Z80 instructions (`or a`, `cp`, `dec`, etc.).

## 5. Functions and Typed Call Boundaries

Typed calls use compiler-generated glue and preservation contracts.

```zax
func add_words(a: word, b: word): word
  ld hl, a
  ld de, b
  add hl, de
  ret
end

extern func bios_putc(ch: byte): void at $F003

export func main(): void
  add_words $0010, $0020
  bios_putc L
end
```

Call-boundary model:

- `void` typed calls preserve boundary-visible registers/flags.
- Non-`void` typed calls expose `HL` as return channel (`L` for byte returns).
- Raw mnemonic `call` remains raw Z80 behavior and is outside typed-call guarantees.

## 6. Records, Arrays, `sizeof`, and `offsetof`

Composite storage in v0.2 uses power-of-two sizing.

```zax
type Sprite
  x: byte
  y: byte
  tile: byte
  flags: word
end

const
  SpriteSize = sizeof(Sprite)
  FlagsOff = offsetof(Sprite, flags)
end

globals
  sprites: Sprite[8]
end
```

For this `Sprite`:

- Natural size is 5 bytes.
- Storage size becomes 8 bytes.
- `sizeof(Sprite)` is 8.
- Indexing stride uses 8-byte storage size.

## 7. Indexing Forms and the v0.2 Semantics Shift

The high-impact migration change:

- `arr[HL]` means direct 16-bit index from `HL`.
- `arr[(HL)]` means index loaded from memory at address `(HL)`.

Example:

```zax
globals
  table: byte[512]
  index_ptr: addr
end

export func demo(): void
  ld hl, 200
  ld a, table[HL]   ; direct 16-bit index

  ld hl, index_ptr
  ld a, table[(HL)] ; index byte read from memory at HL
end
```

Keep hidden lowering predictable by staging complex dynamic addressing across lines.

## 8. Inline `op` for Zero-Overhead Instruction Families

`op` expands inline with matcher-based overload resolution.

```zax
op add16(dst: HL, src: reg16)
  add hl, src
end

op add16(dst: DE, src: reg16)
  ex de, hl
  add hl, src
  ex de, hl
end

export func demo_op(): void
  ld de, $1000
  ld bc, $0002
  add16 DE, BC
end
```

Guidance:

- Use `op` for instruction-like local patterns.
- Use `func` for reusable call boundaries with locals/arguments.
- `op` stack/register discipline is developer-managed.

## 9. Multi-Module Layout

ZAX uses imports and deterministic module ordering.

`main.zax`:

```zax
import "math.zax"

export func main(): void
  inc_word
end
```

`math.zax`:

```zax
globals
  counter: word
end

export func inc_word(): void
  ld hl, counter
  inc hl
  ld counter, hl
end
```

Behavior:

- Imported module names enter a shared global namespace.
- Symbol collisions are compile errors.
- Build packing order is deterministic by import graph and stable tie-breakers.

## 10. v0.1 to v0.2 Migration Checklist

Use this when upgrading older sources:

1. Replace unqualified enum members (`Read`) with qualified names (`Mode.Read`).
2. Audit any code that assumed packed composite sizes; use `sizeof`/`offsetof` under storage-size semantics.
3. Update indexing intent:
   `arr[HL]` is direct, `arr[(HL)]` is indirect-byte indexing.
4. Prefer scalar value forms in typed contexts (`ld a, arg`, `ld arg, a`) instead of legacy scalar paren forms.
5. Keep dynamic addressing simple per expression; stage multi-step dynamic work explicitly.

## 11. Common Pitfalls

- Using `case` labels without enum qualification.
- Assuming ops provide automatic preservation boundaries.
- Mixing typed call expectations with raw `call` semantics.
- Forgetting that composite padding affects array stride and offsets.

## 12. Where to Go Next

- Normative language reference: `docs/zax-spec.md`
- Practical chapter guide: `docs/ZAX-quick-guide.md`
- Implementation status and execution queues: `docs/zax-dev-playbook.md`
- Transition rationale and migration context: `docs/v02-transition-decisions.md`
