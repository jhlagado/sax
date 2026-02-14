# ZAX Agent Brief (Non-normative)

This brief summarizes the current project direction for fast onboarding.

Normative language behavior is defined by `zax-spec.md`.

## Core model

- ZAX is a structured assembler for Z80-family targets focused on predictable lowering, explicit control, and assembler-first semantics.
- ZAX keeps direct Z80 instruction authoring and adds structured flow (`if`, `while`, `repeat`, `select`), typed storage, and compile-time expressions.
- ZAX does not add a runtime, GC, hidden scheduler, or implicit high-level execution model.
- The language is intentionally "virtual assembler" in places: source may be rewritten to preserve structured guarantees (example: conditional returns lowered through epilogues).

## v0.2 semantic direction

- Composite storage uses power-of-two sizing (arrays, records, unions).
- Padding is storage-visible and affects layout, `sizeof`, and indexing stride.
- `sizeof` returns padded storage size (breaking vs v0.1 expectations).
- `offsetof` is aligned to the same storage model.
- No packed-vs-stride dual model.

## Addressing/indexing

- `arr[HL]` means direct 16-bit index.
- `arr[(HL)]` means indirect index loaded from memory at `(HL)`.
- Runtime index scaling is shift-based (`ADD HL,HL` chains), not multiply-based.
- Nested indexing is in scope for v0.2, but expression complexity is intentionally bounded by a runtime-atom budget so hidden lowering stays limited and predictable.
- Exceeding runtime-atom budget should produce compile errors that suggest staging across multiple lines.

## Type/symbol semantics

- Enum members must be qualified (`Mode.Read`); unqualified members are compile errors.
- Typed scalar variables follow value semantics in v0.2.
- Composites remain address-like.
- Signed storage types are intentionally out of scope.
- Typed pointers (`^Type`) are deferred (v0.3 target).

## Call boundary and preservation contract

- Hidden lowering is compiler responsibility, not user burden.
- Typed call boundaries are preservation-safe by contract.
- `void` typed calls: no boundary-visible clobbers.
- Non-void typed calls: only `HL` is boundary-visible as return channel (`L` for byte return).
- This typed-call contract applies to typed `func`/`extern func` call sites; raw Z80 `call` mnemonics remain raw assembly ABI/clobber semantics.

## `op` system

- `op` is inline expansion with matcher-based overload resolution.
- No implicit preservation guarantee from the language itself; stack/register discipline inside `op` bodies is developer-managed.
- For compiler-owned hidden lowering, composable helper mechanisms should carry explicit stack-effect contracts.

## Docs/source-of-truth direction

- Canonical normative spec: `docs/zax-spec.md`.
- `docs/v02-transition-decisions.md` is transition rationale (non-normative).
- `docs/v01-scope-decisions.md` is a compatibility pointer during migration.
- Supporting docs (quick guide, roadmap, process docs) should not define independent language rules.
