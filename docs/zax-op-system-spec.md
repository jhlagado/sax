# ZAX `op` System — Expanded Specification (Draft)

This document expands Section 9 of the ZAX language specification (`docs/zax-spec.md`). It serves as a standalone reference for the `op` system: inline macro-instructions with AST-level operand matching.

**Audience and purpose.** This document has two audiences:

1. **Implementers** (including AI assistants building the compiler) need precise algorithms, complete edge-case coverage, and unambiguous rules that translate directly to code.

2. **Advanced users** (programmers writing ZAX code) need to understand how ops behave, how to design op families, and how to diagnose problems when expansions fail.

The document addresses both by stating normative rules precisely while also explaining the rationale and providing worked examples.

**Document conventions:**

- Normative rules are stated directly in prose. Where precision is critical, rules are numbered or bulleted.
- Examples are illustrative unless marked "(normative example)".
- Cross-references to the main spec use the form "Section N of the main spec" to mean `docs/zax-spec.md` Section N.
- Implementation notes marked "(impl)" are recommendations for compiler authors; any compliant implementation that produces the same observable behavior is acceptable.
- Algorithm descriptions use pseudocode for clarity; actual implementation may differ in structure as long as behavior matches.

**Version:** This specification corresponds to ZAX v0.1 as defined in the main spec.

**Related documents:**

- `docs/zax-spec.md` — The main ZAX language specification
- `docs/zax-cli.md` — Command-line interface specification
- `docs/roadmap.md` — Implementation status and priorities

---

## 1. What Ops Are (and What They Are Not)

An `op` in ZAX is an inline macro-instruction that the compiler expands at the AST level during lowering. When you write an `op` invocation inside a function/op instruction stream, the compiler selects the best-matching overload, substitutes the caller's operands into the op body, and emits the resulting instruction sequence in place — as if you had written those instructions directly.

### 1.1 Comparison with Other Macro Systems

Understanding ops requires contrasting them with familiar alternatives:

**Textual macros (traditional assemblers).** TASM, MASM, and similar assemblers provide text-substitution macros. The macro expander operates before parsing: it pastes tokens, re-scans them, and hopes the result parses. This approach has well-known problems. Parameters can accidentally concatenate with surrounding tokens. Internal labels can collide with caller labels (the "hygiene" problem). Error messages point to expanded text, not the original macro invocation. Nested macros interact in surprising ways. There is no notion of operand types, so the same macro body might accidentally work for some operands and fail cryptically for others.

**C preprocessor macros.** The C preprocessor shares most of textual macro problems. The `#define` mechanism operates on tokens before the C parser sees them. Parenthesization discipline can prevent some operator-precedence bugs, but the fundamental fragility remains.

**C++ templates.** Templates operate on parsed, typed AST nodes. This is closer to ZAX ops: the compiler knows the types of template parameters and can perform type checking after substitution. However, C++ templates are primarily a type-parameterization mechanism, not an inline code-generation mechanism. They also carry substantial complexity (SFINAE, template specialization rules, and two-phase name lookup).

**ZAX ops** take the AST-level approach of templates but apply it to assembly-language semantics. The compiler knows that a parameter declared as `reg16` will only ever bind to `HL`, `DE`, `BC`, or `SP` — not to an arbitrary token that happens to look like a register name in some contexts. This means the compiler can reason about ops statically: it can check that an expansion will produce valid instructions and resolve overloads unambiguously — but register/flag effects remain whatever the inline instructions do.

### 1.2 Ops vs Functions

Ops are _not_ functions. They have no stack frame, no calling convention, no return address. An op expansion is purely inline: the instructions appear in the caller's code stream at the point of invocation. There is no `call` or `ret` involved. This is what makes ops zero-overhead — but it also means that ops cannot be recursive (cyclic expansion is a compile error) and cannot declare local variables.

| Aspect                | `op`                               | `func`                        |
| --------------------- | ---------------------------------- | ----------------------------- |
| Invocation cost       | Zero (inline expansion)            | `call`/`ret` overhead         |
| Stack frame           | None                               | Optional (if locals declared) |
| Recursion             | Forbidden (cyclic expansion error) | Permitted                     |
| Local variables       | Forbidden                          | Permitted (`var` block)       |
| Overloading           | By operand matchers                | Not supported in v0.1         |
| Register/flag effects | Inline code semantics              | Caller-save convention        |

### 1.3 When to Use Ops

Use ops when you want:

- **Instruction-like syntax** for common patterns that the Z80 doesn't directly support
- **Zero overhead** — no call/ret, no stack frame setup
- **Overloading** by register type or immediate size
- **Inline expansion** with explicit, visible instruction effects

Use functions when you need:

- **Recursion** or mutual recursion
- **Local variables** (stack slots)
- **Single definition** for code that appears in multiple places (ops inline everywhere, increasing code size)
- **Indirect calls** (function pointers)

### 1.4 The Design Intent

The design intent is to let you build opcode-like families — things that _feel_ like native Z80 instructions but express patterns the hardware doesn't directly support.

The design intent is to let you build opcode-like families — things that _feel_ like native Z80 instructions but express patterns the hardware doesn't directly support. The classic example is 16-bit addition into a register pair other than `HL`:

```
op add16(dst: HL, src: reg16)
  add hl, src
end

op add16(dst: DE, src: reg16)
  ex de, hl
  add hl, src
  ex de, hl
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

At the call site, `add16 DE, BC` reads like a native instruction. The compiler selects the `DE` overload, substitutes `BC` for `src`, and emits the exchange-based sequence. Because ops are inline expansions, any register/flag effects are exactly the effects of the instructions written in the op body.

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

The body is an implicit instruction stream. The `asm` marker keyword is not used in op bodies. The instructions in the body follow exactly the same grammar as instructions inside function instruction streams: raw Z80 mnemonics, other op invocations, and structured control flow (`if`/`while`/`repeat`/`select`) are permitted. **Local labels are not permitted inside op bodies in v0.1.**

An op body may be empty (containing no instructions between the declaration line and `end`). This is occasionally useful as a no-op placeholder during development or as a deliberately empty specialization.

### 2.2 Zero-Parameter Ops

An op with no parameters omits the parentheses entirely:

```
op halt_system
  di
  halt
end
```

At the call site, you invoke it by writing just the name on an instruction line:

```
func panic(): void
  halt_system
end
```

This form is useful for giving a meaningful name to a short idiom that takes no operands.

### 2.3 Scope and Nesting Rules

Ops are module-scope declarations only. You cannot define an op inside a function body, inside another op, or inside any other block. However, op _invocations_ are permitted anywhere an instruction can appear: inside function instruction streams and inside other op bodies.

An op may invoke other ops in its body, but the expansion graph must be acyclic. If expanding op `A` would require expanding op `B`, which in turn requires expanding op `A`, the compiler reports a cyclic expansion error. The compiler detects this statically during expansion, not at runtime.

**Forward references.** An op may be invoked before it is declared, consistent with ZAX's whole-program compilation model (Section 3.2 of the main spec). All op declarations are visible throughout the module and any importing modules.

**Import visibility.** Ops follow the same visibility rules as other module-scope declarations. In v0.1, all ops are public; the `export` keyword is accepted for forward compatibility but has no effect.

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

**`ea`** matches an effective-address expression as defined in Section 7.2 of the spec: storage symbols (`globals`/`data`/`bin` names), function-local names (as SP-relative slots), field access (`rec.field`), array indexing (`arr[i]`), and address arithmetic (`ea + imm`, `ea - imm`). When substituted, the parameter carries the address expression _without_ implicit parentheses — it names a location, not its contents.

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

; in some function body:
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

### 4.4 Labels Inside Ops (v0.1 Rule)

Local labels are **forbidden** inside op bodies in v0.1. This avoids introducing label-hygiene and name-mangling machinery in the first implementation. Any `<ident>:` label definition encountered inside an op body is a compile error.

**(impl)** The compiler should reject op bodies containing label definitions during parsing of the op body (or during validation before expansion), with a diagnostic that explicitly states local labels are not permitted inside ops in v0.1.

### 4.5 Expansion Algorithm Summary

For implementers, the complete expansion algorithm is:

```
function expand_op(call_site, op_name, operands):
    // 1. Overload resolution (Section 5)
    candidates = filter_matching_overloads(op_name, operands)
    if candidates.empty():
        error("no matching overload", call_site)
    winner = select_most_specific(candidates)
    if winner is ambiguous:
        error("ambiguous overload", call_site, candidates)

    // 2. Cycle detection
    if op_name in expansion_stack:
        error("cyclic expansion", expansion_stack)
    expansion_stack.push(op_name)

    // 3. Bind operands to parameters
    bindings = zip(winner.parameters, operands)

    // 4. Clone and substitute
    expanded_body = deep_clone(winner.body)
    for each instruction in expanded_body:
        substitute_parameters(instruction, bindings)
        reject_if_label_definition(instruction)

    // 5. Recursive expansion of nested ops
    for each instruction in expanded_body:
        if instruction is op_invocation:
            replace instruction with expand_op(instruction.site, ...)

    // 6. Stack delta check
    delta = compute_stack_delta(expanded_body)
    if delta != 0:
        error("op expansion has non-zero stack delta", call_site)

    expansion_stack.pop()
    return expanded_body
```

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

### 5.3.1 Specificity Algorithm

**(impl)** The following algorithm implements specificity comparison:

```
function compare_specificity(overload_X, overload_Y, operands):
    // Returns: "X_wins", "Y_wins", "equal", or "incomparable"

    x_better_count = 0
    y_better_count = 0

    for i in 0..operands.length:
        x_matcher = overload_X.parameters[i].matcher
        y_matcher = overload_Y.parameters[i].matcher
        operand = operands[i]

        cmp = compare_matcher_specificity(x_matcher, y_matcher, operand)
        if cmp == "X_more_specific":
            x_better_count += 1
        else if cmp == "Y_more_specific":
            y_better_count += 1
        // if "equal", neither count increments

    if x_better_count > 0 and y_better_count == 0:
        return "X_wins"
    else if y_better_count > 0 and x_better_count == 0:
        return "Y_wins"
    else if x_better_count == 0 and y_better_count == 0:
        return "equal"
    else:
        return "incomparable"  // leads to ambiguity

function compare_matcher_specificity(matcher_X, matcher_Y, operand):
    // Specificity ordering (most to least specific):
    // Fixed register > reg8/reg16 > (none for registers)
    // imm8 > imm16 (for values fitting in 8 bits)
    // mem8/mem16 > ea

    if matcher_X == matcher_Y:
        return "equal"

    // Fixed vs class for registers
    if is_fixed_register(matcher_X) and is_class_register(matcher_Y):
        return "X_more_specific"
    if is_class_register(matcher_X) and is_fixed_register(matcher_Y):
        return "Y_more_specific"

    // imm8 vs imm16
    if matcher_X == "imm8" and matcher_Y == "imm16":
        if operand.value fits in 8 bits:
            return "X_more_specific"
        else:
            return "equal"  // both match equally for large values
    if matcher_X == "imm16" and matcher_Y == "imm8":
        if operand.value fits in 8 bits:
            return "Y_more_specific"
        else:
            return "equal"

    // mem8/mem16 vs ea
    if (matcher_X == "mem8" or matcher_X == "mem16") and matcher_Y == "ea":
        return "X_more_specific"
    if matcher_X == "ea" and (matcher_Y == "mem8" or matcher_Y == "mem16"):
        return "Y_more_specific"

    // mem8 vs mem16: equal specificity (both require dereference)
    if (matcher_X == "mem8" and matcher_Y == "mem16") or
       (matcher_X == "mem16" and matcher_Y == "mem8"):
        return "equal"

    // If we reach here, matchers are incomparable
    return "equal"
```

### 5.3.2 Selecting the Winner

After computing specificity comparisons for all candidate pairs:

```
function select_most_specific(candidates):
    if candidates.length == 0:
        error("no matching overload")

    if candidates.length == 1:
        return candidates[0]

    // Find a candidate that beats all others
    for each candidate X in candidates:
        beats_all = true
        for each candidate Y in candidates where Y != X:
            cmp = compare_specificity(X, Y, operands)
            if cmp != "X_wins":
                beats_all = false
                break
        if beats_all:
            return X

    // No single winner; check for ambiguity
    error("ambiguous overload", candidates)
```

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

## 6. Register/Flag Effects (v0.1)

Ops are **inline expansions**. They do not have a special preservation guarantee in v0.1. An op body behaves like any other inline instruction sequence: it may read or write registers and flags according to the Z80 instruction semantics used in the body. There is **no compiler-inserted autosave** and no mandatory clobber policy in the op system itself.

If you want register-effect reporting (e.g., “this op clobbers `HL` and flags”), that is a **separate, passive analysis** of the emitted instructions. Such analysis may be performed by the assembler or tooling and may be used for documentation, linting, or diagnostics, but it is not a normative part of op expansion in v0.1.

### 6.1 Structured Control Flow in Op Bodies

Op bodies may contain structured control flow (`if`/`while`/`repeat`/`select`). The same rules apply as in function instruction streams (Section 10 of the main spec):

- Stack depth must match at control-flow joins
- Condition codes test flags that the programmer establishes
- The compiler expands structured control flow without introducing programmer-defined labels

**Stack depth in control flow.** Each control-flow arm must have the same stack depth at joins:

```
; INVALID: mismatched stack depth
op bad_stack(r: reg8)
  or a
  if Z
    push bc        ; +2
  end              ; ERROR: stack depth differs between paths
end
```

The compiler reports this as a stack-depth mismatch error within the op body.

### 6.2 SP Tracking During Op Expansion

When an op is expanded inside a function that has local variables, the function's SP tracking must remain valid. The key rules:

1. **Op expansion is inline.** The expanded instructions become part of the function instruction stream.
2. **SP deltas accumulate.** Each `push`/`pop` in the op body updates the function's SP tracking.
3. **Net delta = 0.** After the complete expansion, the SP offset returns to its pre-expansion value.
4. **Local access remains valid.** Because net delta = 0, local variable offsets computed before the op invocation remain correct after it.

**(impl)** The compiler must:

- Record SP offset before expanding the op
- Track SP changes through the expansion
- Verify SP offset matches after expansion
- Report error if mismatch

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

Invoking `cmp16 HL, 1000` selects the second overload (`imm16` matching the literal). The expansion loads the immediate into `DE`, performs the subtract-and-restore, and pops `DE`. The op body restores `HL` manually and leaves flags set by `sbc`, which is the intended observable output.

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

Note that this op clobbers `HL`, `B`, and `A` internally, plus flags. Because ops have no automatic preservation in v0.1, these effects are visible to the caller unless the op body explicitly saves/restores registers.

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

Good error messages are essential for usability. This section specifies the error categories and provides example diagnostic formats that implementations should follow.

### 8.1 No Matching Overload

When no overload's matchers accept the call-site operands, the compiler reports an error at the call site. The diagnostic should identify the op name, the operand types provided, and list the available overloads with their matcher signatures so the programmer can see why none matched.

**Example diagnostic:**

```
error: no matching overload for 'add16'
  --> src/game.zax:42:5
   |
42 |     add16 IX, DE
   |     ^^^^^^^^^^^^
   |
note: call-site operands: (IX, DE)
note: available overloads:
  - add16(dst: HL, src: reg16)    ; HL does not match IX
  - add16(dst: DE, src: reg16)    ; DE does not match IX
  - add16(dst: BC, src: reg16)    ; BC does not match IX
help: IX is not supported by op matchers in v0.1
```

### 8.2 Ambiguous Overload

When two or more overloads match with equal specificity, the compiler reports an ambiguity error. The diagnostic should identify the competing overloads and suggest adding a more specific overload to resolve the tie.

**Example diagnostic:**

```
error: ambiguous overload for 'problem'
  --> src/game.zax:50:5
   |
50 |     problem HL, BC
   |     ^^^^^^^^^^^^^^
   |
note: call-site operands: (HL, BC)
note: equally specific candidates:
  - problem(dst: HL, src: reg16)   ; defined at src/ops.zax:10
  - problem(dst: reg16, src: BC)   ; defined at src/ops.zax:15
help: add an overload 'problem(dst: HL, src: BC)' to resolve ambiguity
```

### 8.3 Invalid Expansion

When an overload is selected and expanded, but the resulting instruction sequence contains an invalid Z80 instruction, the compiler reports the error at the call site. The diagnostic should indicate that the error arose from an op expansion and identify which instruction in the expansion is invalid.

**Example diagnostic:**

```
error: invalid Z80 instruction in op expansion
  --> src/game.zax:60:5
   |
60 |     swap_with_mem DE, (buffer)
   |     ^^^^^^^^^^^^^^^^^^^^^^^^^^
   |
note: expansion produced: ex de, (buffer)
note: 'ex' does not support this operand combination
note: op 'swap_with_mem' defined at src/ops.zax:25
help: this op may not support all reg16 values; consider using fixed-register matchers
```

### 8.4 Cyclic Expansion

When expanding an op would lead to infinite recursion, the compiler reports a cyclic expansion error. The diagnostic should show the expansion chain that forms the cycle.

**Example diagnostic:**

```
error: cyclic op expansion detected
  --> src/game.zax:70:5
   |
70 |     op_a HL
   |     ^^^^^^^
   |
note: expansion chain:
  1. op_a (src/ops.zax:30) invokes op_b
  2. op_b (src/ops.zax:40) invokes op_c
  3. op_c (src/ops.zax:50) invokes op_a  <-- cycle
```

### 8.5 Stack Delta Violation

If the instructions in an op body (after expansion of any nested ops) have a net stack delta that is not zero, the compiler reports an error.

**Example diagnostic:**

```
error: op expansion has non-zero stack delta
  --> src/game.zax:80:5
   |
80 |     leaky_op HL
   |     ^^^^^^^^^^^
   |
note: op body has net stack delta of +2 (push without matching pop)
note: op 'leaky_op' defined at src/ops.zax:60
help: ensure all push instructions have matching pop instructions
```

### 8.6 Other Error Conditions

**Undefined op.** If an op invocation references a name that is not defined as an op:

```
error: undefined op 'unknwon_op'
  --> src/game.zax:90:5
   |
90 |     unknwon_op HL
   |     ^^^^^^^^^^
help: did you mean 'unknown_op'?
```

**Arity mismatch.** If the number of operands doesn't match any overload:

```
error: no overload of 'add16' accepts 3 operands
  --> src/game.zax:95:5
   |
95 |     add16 HL, DE, BC
   |     ^^^^^^^^^^^^^^^^
note: available arities: 2
```

**Op defined inside function.** If an op declaration appears inside a function body:

```
error: op declarations must be at module scope
  --> src/game.zax:100:3
    |
100 |   op inner_op(x: reg8)
    |   ^^
help: move this op declaration outside the function
```

---

## 9. Design Rationale and Future Directions

### 9.1 Why AST-Level, Not Text-Level

The decision to make ops operate on parsed AST nodes rather than raw text was driven by three concerns:

**Safety.** Textual macros in traditional assemblers are a rich source of subtle bugs: unexpected token pasting, re-scanning artifacts, hygiene violations where a macro's internal labels collide with the caller's labels. AST-level substitution eliminates these failure modes because operands are already parsed and typed before substitution.

**Overload resolution.** Text-level macros have no notion of operand types, so they cannot support overloading or specificity-based dispatch. The op system's matcher types enable a principled overload mechanism that is predictable and explainable.

**Compiler integration.** Because the compiler understands the op's parameter types and body structure, it can validate substitutions, check stack deltas, and produce meaningful diagnostics. None of this is possible with text substitution.

### 9.2 What v0.1 Intentionally Omits

Several features that would be natural extensions of the op system are intentionally omitted from v0.1 to keep the initial implementation tractable:

**Condition-code matchers.** A `cc` matcher type that binds to `Z`, `NZ`, `C`, `NC`, etc. would enable ops that abstract over conditional behavior. This is deferred because it complicates overload resolution and condition handling.

**IX/IY matchers.** Extending `reg16` (or adding `idx16`) to cover `IX` and `IY` would be useful but requires rethinking displacement handling in the matcher system.

**Variadic parameters.** Ops with a variable number of operands (e.g., a `push_all` that saves an arbitrary set of registers) would be powerful but significantly complicate overload resolution.

**Typed pointer/array matchers.** Matching on the _type_ of an `ea` (e.g., "this must be an address of a `Sprite` record") would enable safer ops but requires deeper type system integration than v0.1 supports.

**Guard expressions.** Allowing overloads to specify additional constraints beyond matcher types (e.g., "only when `imm8` value is non-zero") would increase expressiveness but adds complexity to the resolution algorithm.

These omissions are deliberate scope boundaries, not oversights. They represent a natural extension path for future versions of the spec.

---

## 10. Summary of Normative Rules

For quick reference, the normative rules governing ops in v0.1 are:

Ops are module-scope declarations. They may not be nested inside functions or other ops. Op invocations are permitted inside function/op instruction streams. Bodies are implicit instruction streams terminated by `end`. Bodies may be empty. Bodies may contain structured control flow, raw Z80 instructions, and other op invocations. Bodies may not contain `var` blocks.

Parameters use matcher types: `reg8`, `reg16`, fixed-register matchers (`A`, `HL`, `DE`, `BC`, `SP`), `imm8`, `imm16`, `ea`, `mem8`, `mem16`. `IX`/`IY` are not matchable. Condition codes are not matchable. Substitution operates on AST nodes, not text.

Overload resolution filters candidates by matcher compatibility, then ranks by specificity. Fixed beats class, `imm8` beats `imm16` for small values, `mem8`/`mem16` beat `ea`. No match is an error. Ambiguous match is an error.

Op expansions are inline; register/flag effects are the effects of the emitted instructions. Net stack delta of an expansion must be zero. Cyclic expansion is a compile error.

---

## 11. Source Mapping for Op Expansions

ZAX produces D8 Debug Map (D8M) files for debugger integration (Appendix B of the main spec). Op expansions require special handling to produce useful debug information.

### 11.1 The Attribution Problem

When an op expands to multiple instructions, the debugger needs to know which source location to show. There are several options:

1. **Attribute to call site.** All expanded instructions point to the op invocation line.
2. **Attribute to op body.** Each expanded instruction points to its original line in the op declaration.
3. **Hybrid.** The first instruction points to the call site; subsequent instructions point to the op body.

### 11.2 Recommended Policy

**(impl)** For v0.1, the recommended policy is:

- All instructions in an op expansion are attributed to the **call site** (the line containing the op invocation).
- The D8M segment for the expansion has `kind: "macro"` to indicate it resulted from op expansion.
- The `confidence` should be `"high"` since the compiler knows the exact mapping.

This policy means that stepping in the debugger will treat an op invocation as a single step, regardless of how many instructions it expands to. This matches the abstraction level at which the programmer wrote the code.

### 11.3 Advanced Debugging (Future)

Future versions may support stepping _into_ op expansions, showing the op body source during single-stepping. This would require:

- D8M segments that reference both the call site and the op body location
- Debugger support for "step into macro" vs "step over macro"
- UI to show macro expansion context

These features are out of scope for v0.1.

### 11.4 Symbol Table

Ops do not appear in the symbol table as callable addresses (since they have no address — they are purely inline). However:

- The op _name_ may appear in diagnostic output
- Op expansions do not define local labels and therefore do not add label symbols
- The D8M may include op definitions in a separate metadata section for tooling purposes

---

## 12. Interaction with Functions and the Calling Convention

### 12.1 Ops Inside Function Bodies

Ops are expanded inline within the enclosing function instruction stream. This means:

- The function's local variables remain accessible during op expansion (as SP-relative slots)
- The function's stack frame is not modified by the op (net stack delta = 0)
- The function's SP tracking is updated by any `push`/`pop` in the op body

### 12.2 Function Calls Inside Op Bodies

An op body may invoke a function using the normal function-call syntax (Section 8.3 of the main spec). When this happens:

- The compiler generates the call sequence (push arguments, `call`, pop arguments)
- The call clobbers registers per the calling convention (AF, BC, DE, HL are volatile)
- The resulting register/flag effects are simply the effects of the call plus any surrounding op instructions

This interaction can lead to significant expansion overhead. Consider:

```
op process_with_log(dst: reg16, src: imm16)
  log_debug "processing"    ; function call inside op
  ld dst, src
end
```

The function call `log_debug` clobbers AF, BC, DE, HL. Because ops are inline expansions, those clobbers are visible unless the op body explicitly saves/restores registers around the call. This can make such ops expensive or surprising.

**Guidance for op authors:** Avoid function calls inside ops when possible. If you must call a function, consider whether the op should be a function instead.

### 12.3 Ops That Establish Stack Frames

Ops cannot declare local variables (`var` blocks are forbidden). However, an op may manually manipulate the stack for temporary storage:

```
op temp_storage_example(dst: reg16)
  push bc           ; save working register
  ; ... use BC for computation ...
  pop bc            ; restore
  ; ... store result to dst ...
end
```

This is permitted, but the net stack delta must still be zero. Any save/restore is explicitly authored in the op body.

### 12.4 Calling Ops from Functions vs Calling Functions from Ops

| Scenario                | Effect                                               |
| ----------------------- | ---------------------------------------------------- |
| Function calls op       | Op expands inline; function's frame unaffected       |
| Op calls function       | Full call sequence generated; clobbers volatile regs |
| Op calls op             | Nested inline expansion; no call overhead            |
| Function calls function | Normal call/ret; stack frame management              |

---

## Appendix A: Implementation Checklist

This checklist is for compiler implementers. It covers the essential components needed for a compliant v0.1 op implementation.

### A.1 Parser

- [ ] Parse `op` declarations at module scope
- [ ] Parse zero-parameter ops (no parentheses)
- [ ] Parse parameter lists with matcher types
- [ ] Reject `op` declarations inside function bodies
- [ ] Reject `var` blocks inside op bodies
- [ ] Parse op bodies as implicit instruction streams
- [ ] Handle `end` termination (including nested control flow)

### A.2 Name Resolution

- [ ] Register op names in the global namespace
- [ ] Detect name collisions with functions, types, etc.
- [ ] Support forward references to ops
- [ ] Build overload sets (multiple declarations with same name)

### A.3 Overload Resolution

- [ ] Filter candidates by matcher compatibility
- [ ] Implement specificity ordering:
  - [ ] Fixed register > class matcher
  - [ ] `imm8` > `imm16` for small values
  - [ ] `mem8`/`mem16` > `ea`
- [ ] Detect and report ambiguity
- [ ] Detect and report no-match

### A.4 Substitution

- [ ] Clone op body AST for each expansion
- [ ] Substitute parameter references with bound operands
- [ ] Handle all matcher types (reg8, reg16, fixed, imm8, imm16, ea, mem8, mem16)
- [ ] Preserve AST structure (no text-level manipulation)

### A.5 Label Hygiene

- [ ] Reject local label definitions inside op bodies

### A.6 Cycle Detection

- [ ] Track expansion stack during recursive expansion
- [ ] Detect when an op appears twice in the stack
- [ ] Report cycle with full chain

### A.7 Register-Effect Analysis (Optional)

- [ ] (Optional tooling) Analyze emitted instructions to report registers/flags written
- [ ] (Optional tooling) Surface effects in documentation or lint diagnostics

### A.8 Stack Delta Verification

- [ ] Track stack delta through op body
- [ ] Handle `push`, `pop`, `call`, `ret`, `inc sp`, `dec sp`
- [ ] Verify net delta = 0 after expansion
- [ ] Report violation with clear diagnostic

### A.9 Code Emission

- [ ] Emit expanded instructions to code stream
- [ ] Handle lowering of non-encodable operands (per Section 6.1.1 of main spec)
- [ ] Generate D8M segments with call-site attribution

### A.10 Diagnostics

- [ ] No matching overload (with available overloads listed)
- [ ] Ambiguous overload (with competing candidates)
- [ ] Invalid expansion (with expanded instruction)
- [ ] Cyclic expansion (with chain)
- [ ] Stack delta violation
- [ ] Undefined op
- [ ] Arity mismatch
- [ ] Op inside function

---

## Appendix B: Test Cases for Op Implementation

This appendix provides test case outlines for validating an op implementation. Each test should verify both successful compilation and correct code generation.

### B.1 Basic Expansion

```
; Test: simple op with reg16 parameter
op simple_inc(dst: reg16)
  inc dst
end

func test(): void
  simple_inc HL    ; should expand to: inc hl
  simple_inc DE    ; should expand to: inc de
end
```

### B.2 Fixed-Register Overloads

```
; Test: fixed-register matcher wins over class matcher
op add16(dst: HL, src: reg16)
  add hl, src
end

op add16(dst: DE, src: reg16)
  ex de, hl
  add hl, src
  ex de, hl
end

func test(): void
  add16 HL, BC     ; should select first overload
  add16 DE, BC     ; should select second overload
end
```

### B.3 Specificity Ranking

```
; Test: imm8 beats imm16
op load_val(dst: reg8, val: imm8)
  ld dst, val
end

op load_val(dst: reg8, val: imm16)
  ; This overload exists but should not be selected for small values
  ld dst, val
end

func test(): void
  load_val A, 42   ; should select imm8 overload
  load_val A, 1000 ; should select imm16 overload
end
```

### B.4 Ambiguity Detection

```
; Test: should report ambiguity error
op ambig(dst: HL, src: reg16)
end

op ambig(dst: reg16, src: BC)
end

func test(): void
  ambig HL, BC     ; ERROR: ambiguous
end
```

### B.5 Cycle Detection

```
; Test: should report cyclic expansion
op cycle_a(r: reg16)
  cycle_b r
end

op cycle_b(r: reg16)
  cycle_a r        ; ERROR: cycle
end
```

### B.6 Stack Delta Violation

```
; Test: should report stack delta error
op leaky(r: reg16)
  push hl          ; +2
  ; missing pop    ; net delta +2, ERROR
end
```

### B.7 Labels Inside Ops (Should Fail)

```
; Test: op with local labels should be rejected
op with_label(r: reg8)
  ld r, 10
loop:
  dec r
  jr nz, loop
end
; Expected: error: local labels are not allowed inside op bodies
```

### B.8 Nested Op Expansion

```
; Test: ops invoking other ops
op clear_flags
  or a
end

op safe_add(dst: reg16, src: reg16)
  clear_flags
  adc dst, src
end

func test(): void
  safe_add HL, DE  ; should expand clear_flags then adc
end
```

---

## Appendix C: Glossary

**AST (Abstract Syntax Tree):** The parsed representation of source code as a tree structure, where each node represents a syntactic construct.

**Candidate:** An overload that matches the call-site operands and could potentially be selected.

**Effective Address (EA):** An expression that evaluates to a memory address.

**Expansion:** The process of replacing an op invocation with the op's body after substitution.

**Fixed Matcher:** A matcher that accepts exactly one register (e.g., `HL`).

**Class Matcher:** A matcher that accepts a class of registers (e.g., `reg16` accepts HL, DE, BC, SP).

**Hygiene:** The property that internal names (like labels) in a macro/op do not collide with names at the call site.

**Matcher:** A compile-time pattern that constrains which operands can bind to an op parameter.

**Overload:** One of potentially multiple declarations of the same op name with different parameter matchers.

**Specificity:** The relative "narrowness" of a matcher; more specific matchers win during overload resolution.

**Stack Delta:** The net change in stack pointer caused by a sequence of instructions.

**Substitution:** The process of replacing parameter names in an op body with the corresponding call-site operands.
