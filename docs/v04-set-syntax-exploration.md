# ZAX Bounded Sets — Design Document

# Part I: v0.4 Deliverables

## 1. Design Anchors

ZAX is an assembler. The programmer chooses registers, writes instructions, and manages flags. Types exist for layout and naming, not for runtime semantics. Anything that implicitly selects an ALU operation on the programmer's behalf is a line we should cross only deliberately, and not in v0.4.

The practical need is real: Z80 programs use byte-wide flag fields constantly — device status masks, permission bits, game-object state, resource tracking. Today, the programmer manually tracks which bit position corresponds to which enum member and writes the shift or mask literal by hand. This is error-prone and hard to refactor. The fix should be a naming and bookkeeping aid, not an abstraction.

The v0.4 approach is:

The compiler exposes two const-expression intrinsics (`bitmask` and `enum_count`) that make enum-to-bit-position mapping explicit and compile-time. An accompanying ops module provides ergonomic helpers for common bitset operations over byte-width values in registers. No new types, no new operators, no implicit codegen.

## 2. `bitmask()` Intrinsic

### 2.1 Semantics

`bitmask(E)` where `E` is a compile-time constant enum member evaluates to `1 << E.value`, where `E.value` is the member's integer value (its position in the enum, 0-based).

The result is a compile-time immediate. It is valid anywhere an `imm` expression is valid — in `const` declarations, as instruction operands, inside other `imm` expressions, and as `op` arguments.

### 2.2 Result Width

The result follows normal `imm` expression semantics: it evaluates over mathematical integers and is truncated to `imm8` or `imm16` at the point of use, exactly like any other const expression. If the enum member's value is 0–7, `bitmask()` produces a value that fits in `imm8`. If the value is 8–15, the result fits in `imm16`. If the value is ≥ 16, the result exceeds 16 bits; using it where an `imm16` is required will truncate to the low 16 bits per the standard truncation rule in Section 7.1 of the spec, which means the bit is silently lost. The compiler should emit a warning when `bitmask()` is applied to an enum member whose value is ≥ 16, since the result cannot represent the intended bit in a 16-bit word.

### 2.3 Composability

Because `bitmask()` produces an `imm` value, it composes with all existing `imm` operators. Combined masks are written naturally:

```
const RW = bitmask(Read) | bitmask(Write)
```

This evaluates entirely at compile time. No new expression grammar is needed.

### 2.4 Error Cases

`bitmask()` requires a compile-time constant argument that resolves to an enum member. The following are compile errors with clear diagnostics:

A non-constant argument. `bitmask(A)` where `A` is a register is not a const expression. The diagnostic should say that `bitmask` requires a compile-time constant, not echo a generic "expected imm" message.

A non-enum argument. `bitmask(42)` or `bitmask(someConst)` where `someConst` is a plain `const` (not an enum member) is a compile error. `bitmask` operates on enum members specifically because the semantic intent is enum-to-bit mapping; arbitrary integer arguments would be a misleading `1 << n` that hides its purpose.

An argument that resolves to an enum member with value ≥ 16 is accepted but produces a warning (see 2.2 above).

### 2.5 Argument Form and the Qualified-Name Question

The current spec (Section 4.3) introduces enum member names into the global namespace as bare identifiers. Qualified access (`Mode.Read`) is not supported in v0.1. This means the v0.4 form of `bitmask` accepts bare member names:

```
enum Mode Read, Write, Append

const ReadBit  = bitmask(Read)    ; = $01
const WriteBit = bitmask(Write)   ; = $02
```

This works within the current language without any parser changes beyond recognizing `bitmask` as a const-expression intrinsic.

If a future version introduces qualified enum access (`Mode.Read`), `bitmask` should accept both forms. But qualified access is a prerequisite for domain-safe set types (Part II), not for `bitmask` itself. Do not block `bitmask` on the qualified-access question.

### 2.6 Example Usage

```
enum Perm Read, Write, Execute

const PermRead    = bitmask(Read)      ; $01
const PermWrite   = bitmask(Write)     ; $02
const PermExecute = bitmask(Execute)   ; $04
const PermRW      = PermRead | PermWrite  ; $03

data
  filePerms: byte[4] = { PermRW, PermRead, PermExecute, $00 }

func check_write(perms: byte): byte
  asm
    ld a, (perms)
    and PermWrite
    ; Z flag now reflects whether Write bit is set
    ; caller tests Z/NZ after return
end
```

The programmer still writes the `and` instruction, still tests the flag, still decides what to do with the result. `bitmask` just eliminated the manual bit-position bookkeeping.

## 3. `enum_count()` Intrinsic

### 3.1 Semantics

`enum_count(T)` where `T` is an enum type name evaluates to the number of members in `T` as a compile-time immediate.

```
enum Mode Read, Write, Append

const ModeCount = enum_count(Mode)   ; = 3
```

### 3.2 Argument Form

The argument is a **type name**, not a value. This is syntactically distinct from every other const-expression operand in ZAX, which are all values. The parser must recognize `enum_count(Mode)` as a special form where `Mode` resolves to an enum type, not to a value in the global namespace.

`enum_count(Read)` where `Read` is an enum member (not a type) is a compile error. The diagnostic should say that `enum_count` expects an enum type name, not a member or value.

### 3.3 Use Cases

Sizing arrays to match an enum's domain:

```
var counters: byte[enum_count(Mode)]
```

Loop bounds:

```
ld b, enum_count(Mode)
repeat
  ; iterate over modes
  dec b
until Z
```

### 3.4 Stability Note

`enum_count` returns the current member count. Adding members to an enum changes the result. This is the correct and expected behavior — if your array is sized by `enum_count`, adding an enum member automatically grows the array. But it also means that adding an enum member is a binary-incompatible change to any data structure sized by `enum_count`. This is inherent and does not need a special diagnostic; it is the programmer's responsibility to manage enum evolution, same as in any language.

## 4. Bit Numbering Stability

`bitmask()` derives bit positions from enum member ordering. If `enum Perm Read, Write, Execute` assigns `Read = 0, Write = 1, Execute = 2`, then `bitmask(Read) = $01`, `bitmask(Write) = $02`, `bitmask(Execute) = $04`.

Inserting a member changes all subsequent bit positions. If someone inserts `List` between `Read` and `Write`:

```
enum Perm Read, List, Write, Execute
```

Now `bitmask(Write)` is `$04` instead of `$02`. Any stored bitfield using the old layout is silently incompatible.

This is a real hazard. For v0.4, the mitigation is documentation, not language machinery:

**Convention:** if an enum is used with `bitmask()`, treat its member ordering as part of the binary interface. New members should be appended, not inserted. Document this convention prominently in the `bitmask` reference and in the ops module README.

**Future option (not v0.4):** allow explicit value assignment on enum members (`enum Perm Read = 0, Write = 1, Execute = 2`). This would let `bitmask` derive positions from explicit values rather than implicit ordering, making insertion safe. This is a natural extension of the existing enum system but requires parser and semantic changes that belong in a later version.

## 5. Op-Backed Helpers Module

The second v0.4 deliverable is a `.zax` module (e.g., `bitflags.zax`) providing ops for common byte-wide bitset operations. This serves two purposes: it gives users clean ergonomics for flag manipulation, and it validates that the op system is expressive enough to handle this pattern without language changes.

### 5.1 Design Constraints

All helpers operate on byte-width values. The Z80's bitwise ALU instructions (`and`, `or`, `xor`) operate on the accumulator, so any op that modifies a flag field must route through `A`. The ops must respect the autosave policy: non-destination registers and flags are preserved except where explicitly intended.

### 5.2 Proposed Ops

**`flags_test`** — test whether a bit (or mask) is set; result is in flags (`Z`/`NZ`).

```
op flags_test(src: A, mask: imm8)
  and mask
end
```

The caller loads the flag byte into `A`, then writes `flags_test A, bitmask(Read)`. After expansion, `A` contains the masked result and the `Z` flag reflects whether the tested bits were set. The caller follows with `if NZ` or `if Z`.

This op has a deliberate design choice: it clobbers `A` with the masked value. The destination is `A` (first parameter, matching the default destination convention), so the autosave policy does not preserve `A`'s original value. This is the right behavior — the caller loaded `A` for the purpose of testing it, and the masked result in `A` is often useful afterward.

**`flags_set`** — set bits in a memory-resident flag byte.

```
op flags_set(dst: mem8, mask: imm8)
  push af
  ld a, dst
  or mask
  ld dst, a
  pop af
end
```

Invoked as `flags_set (permissions), bitmask(Write)`. The op loads the byte from memory, ORs in the mask, stores the result, and restores `AF`. The `mem8` matcher ensures the caller writes the operand with parentheses, making the memory access visually explicit at the call site.

**`flags_clear`** — clear bits in a memory-resident flag byte.

```
op flags_clear(dst: mem8, mask: imm8)
  push af
  ld a, dst
  and ~mask         ; complement of mask; constant-folded
  ld dst, a
  pop af
end
```

Note the use of `~mask` inside the op body. Since `mask` is an `imm8`, `~mask` is a const expression computed at expansion time. The op body never executes a `cpl` instruction — the complemented value is baked into the `and` immediate.

**`flags_toggle`** — flip bits in a memory-resident flag byte.

```
op flags_toggle(dst: mem8, mask: imm8)
  push af
  ld a, dst
  xor mask
  ld dst, a
  pop af
end
```

Same pattern as `flags_set` and `flags_clear`, using `xor` instead.

**`flags_union`** — OR two byte-width flag fields.

```
op flags_union(dst: A, src: reg8)
  or src
end

op flags_union(dst: A, src: mem8)
  or src
end
```

Two overloads: one for a register source, one for a memory source. The `A` fixed matcher on `dst` reflects the Z80 reality that `or` always operates on the accumulator.

**`flags_intersect`** — AND two byte-width flag fields.

```
op flags_intersect(dst: A, src: reg8)
  and src
end

op flags_intersect(dst: A, src: mem8)
  and src
end
```

### 5.3 Usage Example

A complete example showing the ops in context:

```
import bitflags

enum Perm Read, Write, Execute

const PermRead  = bitmask(Read)
const PermWrite = bitmask(Write)
const PermExec  = bitmask(Execute)
const PermRW    = PermRead | PermWrite

var
  filePerms: byte

func grant_read_write(): void
  asm
    flags_set (filePerms), PermRW
end

func check_write(): void
  asm
    ld a, (filePerms)
    flags_test A, PermWrite
    if NZ
      ; has write permission — do something
      nop
    end
end

func revoke_execute(): void
  asm
    flags_clear (filePerms), PermExec
end
```

Every instruction the CPU executes is visible or predictable from the call site. The ops provide naming and structure; the programmer retains control.

### 5.4 What the Helpers Validate

If these ops feel natural and sufficient for real use cases — device status registers, game-object flags, permission masks — that is strong evidence that language-level sets are unnecessary. If they're awkward in specific patterns (say, testing membership of a runtime-variable enum value, or operating on flag fields wider than 8 bits), those friction points will tell us exactly where a language feature would add real value versus ceremonial syntax.

## 6. Implementation Checklist

For `bitmask()`:

Add `bitmask` as a recognized identifier in const-expression parsing. When the parser encounters `bitmask(X)` in an `imm` context, resolve `X` as an enum member, evaluate `1 << X.value`, and return the result as a compile-time immediate. Emit a diagnostic if `X` is not a constant enum member. Emit a warning if `X.value >= 16`.

For `enum_count()`:

Add `enum_count` as a recognized identifier in const-expression parsing. When the parser encounters `enum_count(T)` in an `imm` context, resolve `T` as an enum type name and return the member count as a compile-time immediate. Emit a diagnostic if `T` is not an enum type.

For the ops module:

Create `lib/bitflags.zax` containing the op declarations from Section 5.2. Add test fixtures that compile programs using the helpers and verify the emitted bytes match expected instruction sequences. Add a negative fixture confirming that mismatched operand types (e.g., `flags_test HL, ...`) produce a clear "no matching overload" diagnostic.

---

# Part II: Future Set Type Exploration (Parking Lot)

Everything below is deferred. It is recorded for design continuity, not as a plan. Do not implement any of this until the v0.4 helpers have shipped and user feedback indicates that language-level support is needed.

## 7. Prerequisites for a Language-Level Set Type

Before a `set<Enum>` type can exist, ZAX needs:

**Qualified enum access.** The current spec (Section 4.3) puts enum members in the global namespace as bare names. A typed set needs domain disambiguation — `Mode.Read` versus `Perm.Read` — which requires a namespace resolution mechanism that does not exist today. This is a prerequisite language change that affects parsing, name resolution, and potentially the global-namespace collision rules.

**An `in` operator with type semantics.** `value in setExpr` only makes sense if the compiler can verify that `value` and `setExpr` share the same enum domain. Without a set type, there is no type to check against, and `in` becomes unanchored sugar for `and` + flag test with no safety benefit.

**Representation selection rules.** The compiler would need to choose between inline-word and byte-buffer representations based on enum size, with clear diagnostics when the choice matters for footprint. The rules must be explicit and documented, not heuristic.

These are not small changes. Each one touches the parser, the semantic layer, and potentially the codegen pipeline. They should be planned as a coordinated feature, not tacked on incrementally.

## 8. Candidate Type Syntax

The leading candidate if a set type ships:

```
var perms: set<Mode>
```

With optional annotations to force representation:

```
var perms: set<Mode> @inline       ; force word-sized; error if enum too large
var live:  set<RegClass> @bytes(32) ; force 32-byte buffer
```

Without annotation, the compiler selects representation based on enum member count: inline word for ≤ 16 members, byte buffer otherwise.

## 9. Candidate Literal Syntax

```
const rw = set{Mode.Read, Mode.Write}
const empty = set{}
const all = set{Mode.*}    ; possible full-universe literal
```

Qualification is required inside the braces to avoid ambiguity when multiple enums share member names. The `set{}` form makes the empty set explicit and visually distinct.

## 10. Candidate Operators

If a typed set exists, permit the standard bitwise operators with domain checks:

`a | b` (union), `a & b` (intersection), `~a` (complement), `a ^ b` (symmetric difference). Difference via `a & ~b`. Both operands must be `set<Same>` — mixed-domain operations are a compile error.

`value in setExpr` for membership. Const-only to start; dynamic membership (where the value is a runtime variable) could be added later with explicit codegen.

`==` and `!=` for equality. No ordering operators.

## 11. Open Questions (for future resolution)

Should `in` ever support dynamic (runtime) values, or should dynamic membership always go through an explicit op/function call?

Should enums support explicit value assignment (`enum Perm Read = 0, Write = 4, Execute = 7`) for stable bit-position mapping?

Should the compiler auto-select representation silently, or require the programmer to opt in to byte-buffer layout with an annotation?

Should there be a `for member in set` iteration syntax, or is iteration always library/ops-level?

What is the maximum supported set size? (32 bytes = 256 members is a natural ceiling for Z80 targets.)

These questions do not need answers until the prerequisites in Section 7 are met and user feedback indicates demand.
