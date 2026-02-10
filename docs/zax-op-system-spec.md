# ZAX `op` System — Expanded Specification (Draft)

This document expands Section 9 of the ZAX language specification. It is written as a standalone reference for the `op` system: inline macro-instructions with AST-level operand matching. The goal is to give a human reader — whether implementer, language designer, or advanced user — a thorough understanding of how ops work, why they are designed this way, and where the subtle corners live.

Throughout, normative rules are stated directly. Examples are illustrative unless marked otherwise.

---

## 1. What Ops Are (and What They Are Not)

An `op` in ZAX is an inline macro-instruction that the compiler expands at the AST level during lowering. When you write an `op` invocation inside an `asm` block, the compiler selects the best-matching overload, substitutes the caller's operands into the op body, and emits the resulting instruction sequence in place — as if you had written those instructions directly.

This makes ops fundamentally different from textual macros in traditional assemblers. A textual macro operates on strings: it pastes tokens, re-scans them, and hopes the result parses. An `op` operates on parsed, typed AST nodes. The compiler knows that a parameter declared as `reg16` will only ever bind to `HL`, `DE`, `BC`, or `SP` — not to an arbitrary token that happens to look like a register name in some contexts. This means the compiler can reason about ops statically: it can check that an expansion will produce valid instructions, it can resolve overloads unambiguously, and it can enforce preservation guarantees that would be impossible with text substitution.

Ops are _not_ functions. They have no stack frame, no calling convention, no return address. An op expansion is purely inline: the instructions appear in the caller's code stream at the point of invocation. There is no `call` or `ret` involved. This is what makes ops zero-overhead — but it also means that ops cannot be recursive (cyclic expansion is a compile error) and cannot declare local variables.

The design intent is to let you build opcode-like families — things that _feel_ like native Z80 instructions but express patterns the hardware doesn't directly support. The classic example is 16-bit addition into a register pair other than `HL`:

```
op add16(dst: HL, src: reg16)
  add hl, src
end

op add16(dst: DE, src: reg16)
  push hl
  ex de, hl
  add hl, src
  ex de, hl
  pop hl
end

op add16(dst: BC, src: reg16)
  push hl
  push bc
  pop hl
  add hl, src
  push hl
  pop bc
  pop hl
end
```

At the call site, `add16 DE, BC` reads like a native instruction. The compiler selects the `DE` overload, substitutes `BC` for `src`, and emits the exchange-based sequence. The caller doesn't need to know or care about the implementation — the op's preservation guarantees ensure that registers other than the destination are untouched.

---

## 2. Declaration Syntax and Scope

### 2.1 Basic Form

An op is declared at module scope with the `op` keyword, followed by a name, an optional parameter list in parentheses, and a body terminated by `end`:

```
op clear_carry
  or a
end

op load_pair(dst: reg16, src: imm16)
  ld dst, src
end
```

The body is an implicit `asm` stream — you do not write the `asm` keyword inside an op. The instructions in the body follow exactly the same grammar as instructions inside a function's `asm` block: raw Z80 mnemonics, other op invocations, structured control flow (`if`/`while`/`repeat`/`select`), and local labels are all permitted.

An op body may be empty (containing no instructions between the declaration line and `end`). This is occasionally useful as a no-op placeholder during development or as a deliberately empty specialization.

### 2.2 Zero-Parameter Ops

An op with no parameters omits the parentheses entirely:

```
op halt_system
  di
  halt
end
```

At the call site, you invoke it by writing just the name on an `asm` line:

```
func panic(): void
  asm
    halt_system
end
```

This form is useful for giving a meaningful name to a short idiom that takes no operands.

### 2.3 Scope and Nesting Rules

Ops are module-scope declarations only. You cannot define an op inside a function body, inside another op, or inside any other block. However, op _invocations_ are permitted anywhere an instruction can appear: inside function `asm` blocks and inside other op bodies.

An op may invoke other ops in its body, but the expansion graph must be acyclic. If expanding op `A` would require expanding op `B`, which in turn requires expanding op `A`, the compiler reports a cyclic expansion error. The compiler detects this statically during expansion, not at runtime.

### 2.4 No Locals

Op bodies do not support `var` blocks. If an expansion needs scratch storage, the op author must manage it through register usage and explicit `push`/`pop` pairs. This restriction keeps ops simple and predictable — there is no hidden stack frame, no frame pointer manipulation, and no interaction with the function-level SP tracking beyond what the op's own `push`/`pop` instructions contribute.

---

## 3. Operand Matchers: The Type System for Op Parameters

The heart of the op system is its operand matchers. Each parameter in an op declaration carries a matcher type that constrains which call-site operands can bind to that parameter. Matchers are not runtime types — they are compile-time patterns that the compiler uses during overload resolution.

### 3.1 Register Matchers

**`reg8`** matches any of the seven general-purpose 8-bit registers: `A`, `B`, `C`, `D`, `E`, `H`, `L`. When a `reg8` parameter binds to a call-site operand, the bound register token is substituted directly into the op body wherever the parameter name appears.

**`reg16`** matches any of the four 16-bit register pairs: `HL`, `DE`, `BC`, `SP`. The same substitution rule applies.

**Fixed-register matchers** constrain a parameter to exactly one register. Writing `dst: HL` means this overload only matches when the caller passes `HL` in that position. Fixed-register matchers exist for `A`, `HL`, `DE`, `BC`, and `SP`.

The distinction between a fixed matcher and a class matcher is central to overload resolution. When the caller writes `add16 HL, BC`, both an overload with `dst: HL` and an overload with `dst: reg16` would accept `HL` in the first position. The fixed matcher wins because it is more specific (Section 5).

Note that `IX` and `IY` are usable in raw Z80 mnemonics throughout ZAX, but they are not supported by op matchers in v0.1. You cannot write `dst: IX` as a fixed matcher, nor does `reg16` match `IX` or `IY`. If you need IX/IY-aware ops, the v0.1 workaround is to use the index registers directly in the op body and accept a less-specific matcher for the parameter (or simply write the instruction sequence inline).

### 3.2 Immediate Matchers

**`imm8`** matches any compile-time immediate expression (per Section 7.1 of the spec) whose value fits in 8 bits (0–255 unsigned, or equivalently the low 8 bits of any integer value). When substituted into the op body, the parameter carries the evaluated immediate value.

**`imm16`** matches any compile-time immediate expression whose value fits in 16 bits.

An important subtlety: a value like `42` fits in both `imm8` and `imm16`. The overload resolver treats `imm8` as more specific than `imm16` for values that fit in 8 bits (Section 5). This lets you write a fast-path overload for small immediates and a general overload for wider values:

```
op load_indexed(dst: reg8, src: imm8)
  ; fast-path: value fits in a byte
  ld dst, src
end

op load_indexed(dst: reg8, src: imm16)
  ; general case: might need wider handling
  ; (illustrative — in practice you'd rarely need this split for ld)
  ld dst, src
end
```

### 3.3 Address and Dereference Matchers

**`ea`** matches an effective-address expression as defined in Section 7.2 of the spec: storage symbols (`var`/`data`/`bin` names), function-local names (as SP-relative slots), field access (`rec.field`), array indexing (`arr[i]`), and address arithmetic (`ea + imm`, `ea - imm`). When substituted, the parameter carries the address expression _without_ implicit parentheses — it names a location, not its contents.

**`mem8`** and **`mem16`** match dereference operands: call-site operands written as `(ea)` with an implied width of 8 or 16 bits respectively. These matchers are necessary because in raw Z80 mnemonics, the width of a memory dereference is implied by the instruction form (the destination or source register determines whether you're reading a byte or a word). But in an op parameter list, you may need to explicitly declare whether a memory operand carries a byte-width or word-width dereference.

When a `mem8` or `mem16` parameter is substituted into the op body, the full dereference operand — including the parentheses — is substituted. This is a critical distinction from `ea`:

```
op read_byte(dst: reg8, src: mem8)
  ld dst, src        ; src substitutes as (ea), producing e.g. ld a, (hero.flags)
end

op get_address(dst: reg16, src: ea)
  ld dst, src        ; src substitutes as ea (no parens), producing e.g. ld hl, hero.flags
end
```

If `src` is bound to `(hero.flags)` via a `mem8` matcher, then `ld dst, src` expands to `ld a, (hero.flags)`. If `src` is bound to `hero.flags` via an `ea` matcher, then `ld dst, src` expands to `ld hl, hero.flags` — loading the _address_ of the field, not its contents.

### 3.4 Matcher Summary

The following table collects all matcher types available in v0.1. The "Accepts" column describes what call-site operands can bind to a parameter of that type. The "Substitutes as" column describes what appears in the expanded op body.

| Matcher | Accepts                                | Substitutes as                        |
| ------- | -------------------------------------- | ------------------------------------- |
| `reg8`  | `A B C D E H L`                        | The register token                    |
| `reg16` | `HL DE BC SP`                          | The register pair token               |
| `A`     | `A` only                               | `A`                                   |
| `HL`    | `HL` only                              | `HL`                                  |
| `DE`    | `DE` only                              | `DE`                                  |
| `BC`    | `BC` only                              | `BC`                                  |
| `SP`    | `SP` only                              | `SP`                                  |
| `imm8`  | Immediate expression fitting 8 bits    | The immediate value                   |
| `imm16` | Immediate expression fitting 16 bits   | The immediate value                   |
| `ea`    | Effective-address expression           | The address expression (no parens)    |
| `mem8`  | `(ea)` dereference, byte-width implied | The full dereference including parens |
| `mem16` | `(ea)` dereference, word-width implied | The full dereference including parens |

### 3.5 What Matchers Do Not Cover in v0.1

Several operand forms that exist in Z80 assembly are not represented by op matchers in v0.1:

Condition codes (`Z`, `NZ`, `C`, `NC`, etc.) are not matchable as op parameters. You cannot write an op that accepts a condition code and dispatches on it. If you need condition-code polymorphism, write separate overloads or use structured control flow inside the op body.

Index registers (`IX`, `IY`) and their displacement forms (`(IX+d)`, `(IY+d)`) are not matchable. They can appear in raw instructions inside an op body, but they cannot be bound as parameters.

The `(HL)` memory operand used in Z80 byte-access instructions (like `ld a, (hl)`) is a register-indirect form, not an `ea` dereference in ZAX's sense. Its interaction with `mem8` matching is as follows: `(HL)` at a call site does not match `mem8` because `HL` is not an `ea` expression — it is a register. If you need to accept `(HL)` as an op parameter, use the fixed form in the op body directly, or provide a separate overload.

---

## 4. Substitution Mechanics

When the compiler expands an op invocation, it performs AST-level substitution: each occurrence of a parameter name in the op body is replaced with the corresponding bound operand from the call site. This substitution operates on parsed AST nodes, not on raw text.

### 4.1 What "AST-Level" Means in Practice

Consider this op and invocation:

```
op move16(dst: reg16, src: mem16)
  ld dst, src
end

; in some function's asm block:
move16 DE, (player.pos)
```

The compiler does not paste the string `"DE"` into the string `"ld dst, src"` and re-parse. Instead, it takes the parsed AST node for the `ld` instruction in the op body, finds the parameter references `dst` and `src`, and replaces them with the AST nodes that represent `DE` (a register-pair operand) and `(player.pos)` (a dereference of a field-access EA). The result is an AST node equivalent to having written `ld de, (player.pos)` directly.

This matters because it prevents a class of bugs that plague textual macros. A textual macro might accidentally concatenate tokens in unexpected ways, or a parameter value containing special characters might be misinterpreted during re-scanning. AST substitution eliminates these failure modes entirely: the operand is already parsed and typed before substitution occurs.

### 4.2 Substitution and Instruction Validity

Substitution produces an instruction AST node, but that node must still represent a valid Z80 instruction (or a valid ZAX construct like another op invocation). If the substituted result is not encodable, the compiler reports an error at the _call site_, not at the op declaration.

This is an important design choice. An op declaration is not validated in isolation against all possible operand combinations — that would be impractical for class matchers like `reg16` where four different registers could be bound. Instead, the op body is treated as a template, and validity is checked after substitution for each concrete invocation.

For example:

```
op swap_with_mem(dst: reg16, src: mem16)
  ex dst, src       ; not a valid Z80 instruction for arbitrary reg16
end
```

This op declaration is accepted by the parser (the body is syntactically valid as an instruction template). But invoking `swap_with_mem DE, (buffer)` will fail during encoding because `ex de, (buffer)` is not an encodable Z80 instruction. The diagnostic points to the call site and explains that the expansion produced an invalid instruction.

This means that op authors bear responsibility for ensuring their bodies are valid for all operands the matcher accepts. If an op only works for a subset of a class matcher, the author should use fixed-register matchers or document the limitation. The compiler will catch invalid expansions, but the error will be reported to the _caller_, which can be confusing if the caller doesn't know the op's internals.

### 4.3 Nested Op Invocations

An op body may invoke other ops. Substitution is applied first to the outermost op, producing an instruction sequence that may itself contain op invocations. Those inner invocations are then expanded in turn, with their own overload resolution and substitution. This process continues until no op invocations remain.

```
op clear_carry
  or a
end

op safe_add16(dst: reg16, src: reg16)
  clear_carry
  add16 dst, src
end
```

Expanding `safe_add16 DE, BC` first substitutes `DE` and `BC` into the body, producing `clear_carry` followed by `add16 DE, BC`. Then `clear_carry` expands to `or a`, and `add16 DE, BC` expands via its `DE`-specific overload. The final instruction sequence is the concatenation of all expanded instructions.

The compiler tracks the expansion stack and reports a cyclic expansion error if it detects that expanding op `X` eventually leads back to expanding op `X` again, regardless of the depth of nesting.

---

## 5. Overload Resolution and Specificity

### 5.1 The Resolution Problem

A single op name may have multiple overloads — declarations with the same name but different parameter matchers. When the compiler encounters an op invocation, it must determine which overload to use. This is the overload resolution problem, and ZAX solves it with a specificity-based ranking system.

### 5.2 Candidate Selection

The first step is candidate filtering: the compiler examines each overload of the named op and checks whether the call-site operands satisfy all parameter matchers. An overload is a candidate if and only if every call-site operand matches the corresponding parameter's matcher type.

For example, given the call `add16 HL, BC`:

- An overload `add16(dst: HL, src: reg16)` is a candidate because `HL` matches the fixed `HL` matcher and `BC` matches `reg16`.
- An overload `add16(dst: reg16, src: reg16)` is also a candidate because `HL` matches `reg16` and `BC` matches `reg16`.
- An overload `add16(dst: DE, src: reg16)` is _not_ a candidate because `HL` does not match the fixed `DE` matcher.

If no overloads are candidates, the compiler reports a "no matching overload" error at the call site.

### 5.3 Specificity Ranking

If multiple candidates survive filtering, the compiler ranks them by specificity. The core principle is: **more constrained matchers are more specific**. The ranking rules, applied per-parameter and then aggregated, are:

**Fixed register beats class.** A parameter declared as `HL` (accepting only `HL`) is more specific than one declared as `reg16` (accepting `HL`, `DE`, `BC`, or `SP`). Similarly, `A` is more specific than `reg8`.

**`imm8` beats `imm16`** for values that fit in 8 bits. If a call-site operand is the immediate value `42`, both `imm8` and `imm16` match, but `imm8` is more specific because it constrains the value to a narrower range.

**`mem8` and `mem16` beat `ea`.** A dereference operand `(buffer)` matches both `mem8` (or `mem16`) and `ea`, but the memory matchers are more specific because they constrain the operand to be a dereference, not just an address.

To compare two candidate overloads, the compiler compares them parameter-by-parameter. Overload X is _strictly more specific_ than overload Y if, for every parameter position, X's matcher is at least as specific as Y's, and for at least one position, X's matcher is strictly more specific.

### 5.4 The Ambiguity Error

If two candidates are equally specific — neither is strictly more specific than the other — the compiler cannot choose between them and reports an ambiguity error. This is a deliberate design choice: silent tie-breaking (e.g., "pick the first declared overload") would make op behavior depend on source ordering in fragile and surprising ways.

Consider this problematic set of overloads:

```
op problem(dst: HL, src: reg16)
  ; overload A: specific in first param, general in second
  ...
end

op problem(dst: reg16, src: BC)
  ; overload B: general in first param, specific in second
  ...
end
```

The call `problem HL, BC` matches both overloads. Overload A is more specific in the first parameter (`HL` vs `reg16`), but overload B is more specific in the second parameter (`BC` vs `reg16`). Neither is strictly more specific overall, so the compiler reports an ambiguity. The fix is to add a third overload that is specific in _both_ positions:

```
op problem(dst: HL, src: BC)
  ; overload C: resolves the ambiguity
  ...
end
```

Now the call `problem HL, BC` matches all three overloads, but overload C is strictly more specific than both A and B, so it wins cleanly.

### 5.5 Arity Matching

Overload resolution requires that the call-site operand count matches the parameter count exactly. An op declared with two parameters cannot be invoked with one or three operands. Different overloads of the same name may have different arities, and arity mismatch simply removes that overload from the candidate set.

---

## 6. The Autosave and Clobber Policy

### 6.1 The Transparency Guarantee

Ops are designed to be drop-in replaceable with raw instruction sequences. The caller should be able to use an op without studying its implementation to know which registers it clobbers. To achieve this, ZAX enforces a transparency guarantee: an op expansion must preserve all registers and flags _except_ the explicit destination(s).

This means that if you write:

```
ld b, 10
add16 DE, HL
; B still contains 10 here
```

The `add16` op's expansion for `DE` might internally use `HL` (via `ex de, hl; add hl, ...; ex de, hl`), but the compiler ensures that `HL`'s original value is restored, and that `B` (and all other non-destination registers) are unaffected. Flags are also preserved unless the destination is `AF`.

### 6.2 How Destinations Are Identified

The compiler uses a naming convention to determine which parameters are destinations:

Any parameter whose name starts with `dst` or `out` (case-sensitive prefix match: `dst`, `dst2`, `dstHi`, `outByte`, etc.) is treated as a destination. The register or memory location bound to that parameter is permitted to be modified by the expansion.

If an op declares no parameters with a `dst` or `out` prefix, the compiler falls back to treating the _first parameter_ as the destination. This default covers the common accumulator-style pattern where the first operand is both source and destination:

```
op inc16(r: reg16)
  inc r           ; r is the first (and only) param, so it's the destination
end
```

### 6.3 Compiler-Inserted Preservation

The compiler is responsible for inserting `push`/`pop` pairs (or equivalent sequences) around the op body to preserve non-destination registers that the body would otherwise clobber. The simplest compliant strategy — and the one recommended for v0.1 — is:

Save `AF` (via `push af`) before the op body and restore it after, unless `AF` (or `A`) is the destination. This preserves flags unconditionally, which is the conservative and predictable choice.

For other registers clobbered by the body, the compiler analyzes the instructions in the expanded body, determines which registers are written, and wraps the body with appropriate save/restore pairs.

The net stack delta of the entire expansion (including any compiler-inserted pushes and pops) must be zero. This ensures that the caller's stack frame is undisturbed.

### 6.4 Practical Implications for Op Authors

Because the compiler handles preservation automatically, op authors can write their bodies focusing on the logic rather than on save/restore bookkeeping. However, there are practical considerations:

The more registers an op body clobbers, the more `push`/`pop` pairs the compiler must insert, and the larger and slower the expanded code becomes. Op authors who care about code size or cycle count should minimize unnecessary register usage in their bodies.

If an op body uses structured control flow, the compiler must ensure that preservation pushes and pops are correctly balanced across all control paths. The stack-depth matching rules from Section 10 of the spec apply within op bodies just as they do in function `asm` blocks.

Op bodies that manipulate `SP` directly (via `ld sp, ...` or similar) interact poorly with the autosave mechanism, because the compiler's inserted `push`/`pop` pairs assume a stable stack. Avoid direct SP manipulation in op bodies; if you must do it, understand that the compiler's SP tracking may become invalid and stack-slot addressing will be rejected.

---

## 7. Worked Examples

This section presents several complete examples that demonstrate how the pieces fit together. Each example shows the op declarations, a call site, and the expected expansion.

### 7.1 A 16-Bit Comparison Family

The Z80 has no direct 16-bit compare instruction. We can build one as an op family:

```
op cmp16(lhs: HL, rhs: reg16)
  ; Compare HL with rhs by subtracting and discarding the result.
  ; Flags are set as if a 16-bit subtraction occurred.
  or a              ; clear carry
  sbc hl, rhs
  add hl, rhs       ; restore HL (does not affect Z flag from sbc)
end

op cmp16(lhs: HL, rhs: imm16)
  ; Compare HL with an immediate value.
  push de
  ld de, rhs
  or a
  sbc hl, de
  add hl, de
  pop de
end
```

Invoking `cmp16 HL, DE` selects the first overload (fixed `HL` in first param, `reg16` matching `DE` in second). The expansion emits `or a; sbc hl, de; add hl, de`. The caller can then test `Z` or `C` flags to determine the comparison result.

Invoking `cmp16 HL, 1000` selects the second overload (`imm16` matching the literal). The expansion loads the immediate into `DE`, performs the subtract-and-restore, and pops `DE`. The compiler's autosave mechanism would also preserve `AF` if the op's destination convention requires it — but note that in this case, the _purpose_ of the op is to set flags, so the author likely intends `lhs` (the first parameter) to be the destination, and flags should be the observable output. This is a case where the naming convention matters: since neither parameter is named `dst*` or `out*`, the first parameter (`lhs`) is treated as the destination, meaning `HL` may be clobbered and flags are not auto-preserved. The op author has taken care to restore `HL` manually and intends the flag side-effects.

### 7.2 A Byte-Fill Op

```
op fill8(dst: ea, val: imm8, count: imm8)
  ld hl, dst
  ld b, count
  ld a, val
  repeat
    ld (hl), a
    inc hl
    dec b
  until Z
end
```

Invoked as `fill8 screenBuffer, $20, 80`, this expands to a loop that writes the value `$20` to 80 consecutive bytes starting at the address `screenBuffer`. The `ea` matcher binds to the effective address of `screenBuffer` (its location in memory), and the two `imm8` matchers bind to the literal values.

Note that this op clobbers `HL`, `B`, and `A` internally, plus flags. The autosave mechanism will preserve all of these except the destination. Since `dst` is the first parameter and matches the `dst*` naming convention, the destination is the `ea` — but an `ea` is an address, not a register. In practice, the compiler preserves the registers that were clobbered (`HL`, `B`, `A`, and flags) except as needed for the destination write. The exact preservation behavior depends on the compiler's clobber analysis.

### 7.3 Overload Resolution in Action

Consider a set of overloads for a hypothetical `move` op:

```
op move(dst: A, src: mem8)
  ld a, src
end

op move(dst: reg8, src: mem8)
  push af
  ld a, src
  ld dst, a
  pop af
end

op move(dst: reg8, src: imm8)
  ld dst, src
end
```

Now consider three call sites:

`move A, (flags)` — The first two overloads are both candidates (both have `mem8` in the second position, and both accept `A` in the first). But the first overload has a fixed `A` matcher, which is more specific than the `reg8` matcher in the second overload. The first overload wins. Expansion: `ld a, (flags)`.

`move B, (flags)` — Only the second overload is a candidate (the first requires `A`, the third requires `imm8`). Expansion: `push af; ld a, (flags); ld b, a; pop af`.

`move C, 42` — Only the third overload is a candidate. Expansion: `ld c, 42`.

`move A, 42` — The first overload does not match (`42` is not `mem8`). The second does not match either. The third matches (`A` satisfies `reg8`, `42` satisfies `imm8`). Expansion: `ld a, 42`.

---

## 8. Error Cases and Diagnostics

### 8.1 No Matching Overload

When no overload's matchers accept the call-site operands, the compiler reports an error at the call site. The diagnostic should identify the op name, the operand types provided, and list the available overloads with their matcher signatures so the programmer can see why none matched.

### 8.2 Ambiguous Overload

When two or more overloads match with equal specificity, the compiler reports an ambiguity error. The diagnostic should identify the competing overloads and suggest adding a more specific overload to resolve the tie (as shown in Section 5.4).

### 8.3 Invalid Expansion

When an overload is selected and expanded, but the resulting instruction sequence contains an invalid Z80 instruction, the compiler reports the error at the call site. The diagnostic should indicate that the error arose from an op expansion and identify which instruction in the expansion is invalid. This helps the caller understand that the problem is in the op's body (or in a combination of operands the op wasn't designed to handle), not in their own code.

### 8.4 Cyclic Expansion

When expanding an op would lead to infinite recursion (op A invokes op B which invokes op A), the compiler reports a cyclic expansion error. The diagnostic should show the expansion chain that forms the cycle.

### 8.5 Stack Delta Violation

If the instructions in an op body (after expansion of any nested ops) have a net stack delta that is not zero, the compiler reports an error. This catches cases where a `push` without a matching `pop` (or vice versa) would corrupt the caller's stack.

---

## 9. Design Rationale and Future Directions

### 9.1 Why AST-Level, Not Text-Level

The decision to make ops operate on parsed AST nodes rather than raw text was driven by three concerns:

**Safety.** Textual macros in traditional assemblers are a rich source of subtle bugs: unexpected token pasting, re-scanning artifacts, hygiene violations where a macro's internal labels collide with the caller's labels. AST-level substitution eliminates these failure modes because operands are already parsed and typed before substitution.

**Overload resolution.** Text-level macros have no notion of operand types, so they cannot support overloading or specificity-based dispatch. The op system's matcher types enable a principled overload mechanism that is predictable and explainable.

**Compiler integration.** Because the compiler understands the op's parameter types and body structure, it can perform clobber analysis, insert preservation code, check stack deltas, and produce meaningful diagnostics. None of this is possible with text substitution.

### 9.2 What v0.1 Intentionally Omits

Several features that would be natural extensions of the op system are intentionally omitted from v0.1 to keep the initial implementation tractable:

**Condition-code matchers.** A `cc` matcher type that binds to `Z`, `NZ`, `C`, `NC`, etc. would enable ops that abstract over conditional behavior. This is deferred because it interacts with flag preservation in complex ways.

**IX/IY matchers.** Extending `reg16` (or adding `idx16`) to cover `IX` and `IY` would be useful but requires rethinking displacement handling in the matcher system.

**Variadic parameters.** Ops with a variable number of operands (e.g., a `push_all` that saves an arbitrary set of registers) would be powerful but significantly complicate overload resolution.

**Typed pointer/array matchers.** Matching on the _type_ of an `ea` (e.g., "this must be an address of a `Sprite` record") would enable safer ops but requires deeper type system integration than v0.1 supports.

**Guard expressions.** Allowing overloads to specify additional constraints beyond matcher types (e.g., "only when `imm8` value is non-zero") would increase expressiveness but adds complexity to the resolution algorithm.

These omissions are deliberate scope boundaries, not oversights. They represent a natural extension path for future versions of the spec.

---

## 10. Summary of Normative Rules

For quick reference, the normative rules governing ops in v0.1 are:

Ops are module-scope declarations. They may not be nested inside functions or other ops. Op invocations are permitted inside `asm` streams of functions and op bodies. Bodies are implicit `asm` streams terminated by `end`. Bodies may be empty. Bodies may contain structured control flow, raw Z80 instructions, and other op invocations. Bodies may not contain `var` blocks.

Parameters use matcher types: `reg8`, `reg16`, fixed-register matchers (`A`, `HL`, `DE`, `BC`, `SP`), `imm8`, `imm16`, `ea`, `mem8`, `mem16`. `IX`/`IY` are not matchable. Condition codes are not matchable. Substitution operates on AST nodes, not text.

Overload resolution filters candidates by matcher compatibility, then ranks by specificity. Fixed beats class, `imm8` beats `imm16` for small values, `mem8`/`mem16` beat `ea`. No match is an error. Ambiguous match is an error.

Autosave preserves all registers and flags except destinations. Destination parameters are identified by `dst`/`out` name prefix, or the first parameter by default. Net stack delta of an expansion must be zero. Cyclic expansion is a compile error.
