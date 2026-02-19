
## ZAX Specification v0.2 — Detailed Read-Through

### Overall Character

This is a well-structured, authoritative language spec with clear normative hierarchy. The separation of normative from non-normative content is explicit and consistently enforced (the "this document wins" principle is stated in multiple places). It reads like a mature spec rather than a living design document — the decisions feel settled.

---

### Section by Section

**Sections 0–1: Philosophy and Lexical Rules**

The design philosophy is cleanly articulated: *high-level structure, low-level semantics*. The key distinction — "you still choose registers, you manage flags" — is central to the whole project. ZAX is emphatically not trying to be C.

Lexical rules are mostly conventional, with one notable choice: Z80 mnemonics and register names are case-insensitive, but *user-defined* symbols are case-sensitive, though two names differing only by case are still a collision. This is a practical safety valve — it prevents e.g. `foo` and `FOO` coexisting, while still allowing ZAX source to intermix `LD` and `ld` freely.

The `__zax_` prefix reservation for compiler internals is a sensible convention.

**Section 2: Program Structure and Sections**

The three-section model (`code`, `data`, `var`) maps cleanly to ROM/RAM realities on Z80 targets. The packing-order rules — topological module order, ties broken by canonical module ID then normalized path — are deterministic and build-reproducible, which is exactly right for a cross-compiler targeting embedded/ROM environments.

The overlap rule (any two emissions to the same address are always an error, even with identical byte values) is strict but defensible; it catches mistakes rather than silently accepting coincidental aliasing.

Default placement (`code at $8000`, data and var following) is sensible for typical Z80 setups but appropriately described as just a default.

**Sections 3–4: Imports, Types, Enums, Consts**

The single global namespace is simple and honest — there's no module-qualified access. Collisions are errors, period. That's a valid tradeoff for a project-scale assembler.

The power-of-2 storage size rule for composites (arrays, records, unions) is one of the most distinctive choices in ZAX. It's unusual but internally consistent: it makes index scaling expressible as shift chains (`ADD HL, HL` sequences), which is critical for Z80 since there's no hardware multiply. The spec is clear that `sizeof` reports storage size, not packed size, and the v0.1→v0.2 migration section calls this out explicitly as a breaking change people need to update for.

The enum qualification requirement (`Mode.Read` rather than `Read`) is a good hygiene rule. Unqualified members in v0.2 are compile errors — right call.

**Section 5: Arrays, Records, Unions**

The array addressing model (`a[i]` produces an effective address, not a value) is coherent with Z80 semantics where you always need to be conscious of the distinction between "address of X" and "contents of X". The v0.2 addition of `@place` to force address-of intent is a nice explicit escape hatch.

The indirect index forms — `arr[(HL)]` vs `arr[HL]` — are a direct consequence of the Z80's indirect addressing modes. The migration section handles the potential confusion here carefully with before/after examples.

The record layout rules are straightforward; the power-of-2 total size means a `Sprite` with fields totalling 5 bytes occupies 8. That can waste space, but it makes indexed arrays of records practical on Z80 (no multiply).

**Section 6: Storage Declarations**

The `globals`/`data` distinction (var section vs data section, uninitialized/initialized) is well-motivated. The rejection of typed-alias form (`name: Type = rhs`) with explicit diagnostics is the kind of precision that prevents confusing misuse.

The `bin`/`hex` facilities for ingesting external binary and Intel HEX files are thoughtful — particularly the `hex` name-binding to the lowest written address and the explicit validation requirements (checksum, record types, address range).

The `extern` system, especially relative externs in a `bin` block, handles the common ROM/legacy-blob scenario elegantly.

**Sections 7–8: Expressions and Functions**

The expression system is properly layered between `imm` (compile-time immediate arithmetic) and `ea` (effective addresses). The precedence table is explicit, which is important for a spec.

The calling convention is classic Z80 convention: args right-to-left on stack, caller cleans up, return in `HL`/`L`. The v0.2 addition of typed call boundary guarantees — callee preserves all non-HL registers for internal `func` calls — is significant and useful. The carve-out for `extern func` (no preservation guarantee unless declared) is honest about the ABI boundary.

The IX-anchored frame model is canonical for Z80 with local variables. The byte-lane lowering constraints section (the prohibition on `LD H, (IX+d)` / `LD L, (IX+d)`) is a critical implementation detail that the spec correctly makes explicit — this trips up many Z80 assembler implementers. The canonical shuttle pattern through DE is precisely specified:

```asm
ex de, hl
ld e, (ix+disp_lo)
ld d, (ix+disp_hi)
ex de, hl
```

The synthetic epilogue model (all `ret`/`ret cc` rewritten to `jp __zax_epilogue_N`) is standard and correct for framed functions. The prohibition on `retn`/`reti` in framed functions is exactly right.

Stack depth tracking at control-flow joins is important for correctness and the spec handles it carefully.

**Section 9: The `op` System**

This is the signature feature of ZAX. The `op` system is essentially a typed, AST-level macro system with overload resolution — not text substitution. Key properties:

- **Operand matchers** constrain what a call site can pass: fixed registers (`HL`), register classes (`reg16`), immediates (`imm8`/`imm16`), addresses (`ea`), and dereferences (`mem8`/`mem16`)
- **Overload resolution** selects the best-matching overload by specificity (fixed > class; `imm8` > `imm16` for small values; `mem8`/`mem16` > `ea`)
- **Substitution** operates at AST level (no text manipulation)
- **Label hygiene** prevents collision between labels in expanded ops and the call site
- **Cycle detection** prevents infinite recursive expansion

The zero-parameter op form (`op name` with no parens, invoked as `name`) is a nice convenience for things like flag-setting idioms.

The clobber/stack policy is appropriately honest: ops are inline, they have no preservation boundary of their own, and the developer manages stack discipline. The optional register-effect analysis and stack-effect tooling in the implementation checklist (Appendix E.A) are marked optional, correctly, since they're tooling niceties rather than language semantics.

**Section 10: Structured Control Flow**

The flag-based control flow (`if Z`, `while NZ`, `repeat ... until C`) is a natural fit for Z80 — it works exactly how a Z80 programmer thinks. The spec correctly notes that `if`/`while`/`repeat` don't themselves set flags; the programmer establishes flags beforehand with normal instructions.

The `select`/`case` system is more interesting. Key points:
- No fallthrough (unlike C `switch`)
- Stacked `case` lines share a body (multi-value dispatch without fallthrough)
- Dispatch may clobber `A` and flags, but preserves all other registers
- `reg8` selectors generate an efficient compare chain; the compiler folds constant selectors at compile time
- Unreachable `case` values for `reg8` selectors (values > 255) generate warnings

The label system (allowed but discouraged) with its hygiene rewrite for `op`-internal labels is well-specified.

---

### Notable Design Decisions Worth Highlighting

**Power-of-2 composites.** Unusual but internally consistent given the Z80's lack of hardware multiply. The spec is transparent about the tradeoff (storage waste vs. indexability).

**Single global namespace with case-sensitive collision detection.** Simple and avoids import-qualifier complexity, at the cost of requiring unique names across all modules.

**No preprocessor — AST-level everything.** The `op` system explicitly rejects text-level macro approaches. This is a principled stance that makes ZAX a *compiler* rather than an assembler wrapper.

**Typed call boundaries for internal functions only.** The spec doesn't overclaim — `extern func` calls get no preservation guarantee, which is correct and honest.

**Deterministic cross-module packing.** The topological + alphabetical tie-breaking ensures reproducible binary output regardless of filesystem iteration order. This is important for embedded targets where binary layout matters.

---

### A Few Observations / Potential Questions

1. **`idx16` and `cc` matchers** are mentioned as available in v0.2 (`op` parameter matchers for `IX`/`IY` indexed addressing and condition codes), but the spec doesn't elaborate them as fully as the other matchers. Is there a section that defines their exact matching semantics that I might have missed, or is this deliberately thin for v0.2?

2. **`@place` address-of syntax.** Introduced in Section 7.2 as `@rec.field`, `@arr[idx]`, `@symbol`. This is a clean addition but the spec doesn't call out parser implications — in particular, `@` needs to be lexed as a unary prefix operator distinct from everything else. Is this handled in the grammar companion (the EBNF)?

3. **`globals` composite zero-init form (`= 0`) in v0.2.** Section 6.2 says aggregate record initializer syntax for `globals` is *deferred* — only `= 0` is supported for composite globals. This seems like it could be a gap if you want to put pre-initialized composite data in the var section. Is that intentional (initialize in code, not declaratively)?

4. **`select` lowering note** says the compiler *may* use either compare-chain or jump table depending on density. But the spec doesn't define a threshold or policy for this decision — deliberately left as a quality-of-implementation choice?

5. **The `ptr` type** is noted as untyped in v0.1 with a comment that future versions may add `ptr<T>`. Given v0.2 is the current version, is there any movement on this, or is it still deferred?


**F.2 (Composite size rationale)** is entirely new. It explains *why* power-of-2 is load-bearing (no hardware multiply → shift chains only), spells out the space and ABI churn costs honestly, and mentions the possible future `packed` opt-out without committing to it.

**F.3 (Namespace scaling)** is new. It defends the single namespace as a deliberate and appropriate choice for current ZAX scale, acknowledges its limits, and sketches the `ModuleId.symbolName` qualified-access plan that `export` is already forward-compatible with.

**F.4 (Lowering diagnostics)** is marked **normative**. It requires the diagnostic to name the rejected instruction, state the specific reason from a defined set, and identify the preserving constraint that blocked lowering. It also requires listing annotation at the source line, not just in an error summary.

**F.5 (select QoI)** makes the chain-vs-jump-table decision completely explicit as implementation-defined with no mandated threshold — but restates the one normative requirement (observable equivalence) so there's no ambiguity about what "free choice" means.

**F.6 (normative corners)** is marked **normative** and fully specifies all three deferred features. `idx16` gets displacement range rules, fixed `IX`/`IY` sub-matchers with specificity ordering, and the explicit note that `IX`/`IY` are not in `reg16`. `cc` gets the full eight condition codes, fixed-condition matchers, substitution validity requirements, and a note on the missing complement form. `@place` gets a lexer rule (tokenized before identifier recognition), a formal grammar production with left-recursive address-path binding, the complete valid/invalid operand lists, and semantic precision distinguishing it from implicit `ea` in value contexts.

**F.7 (clobber and raw escape)** now clearly explains why a raw-escape block solves the wrong problem, then specifies the intended clobber annotation system in detail — including the stack-delta declaration for routines that mutate SP non-uniformly, and the per-overload clobber semantics for multi-overload ops.
