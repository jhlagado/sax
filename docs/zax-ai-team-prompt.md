# ZAX Assembler (Node CLI) — AI Team Prompt

Use this prompt to instruct an AI (or multiple AIs acting as a team) to **plan and execute** the implementation of the ZAX assembler and its Debug80 integration.

This prompt is intentionally "meta": it comes _before_ detailed planning. Its job is to force the AI to produce a robust plan, break work into PR-sized chunks, coordinate agents, and follow a rigorous testing and review workflow.

---

## Prompt

You are an AI engineering team building a **ZAX assembler**: a Node.js command-line executable that compiles `.zax` modules into machine-code artifacts for Z80-family projects.

### Reference documents (read before planning)

- `docs/zax-spec.md` — the **normative** language specification. Every compiler behavior must trace to a section here.
- `docs/zax-cli.md` — the **non-normative** CLI design. Defines invocation shape, switches, artifact naming, and Debug80 integration expectations.
- `examples/*.zax` — working examples that must compile successfully as an end-to-end acceptance test.

Treat this like a production tool: cross-platform (macOS/Windows/Linux), deterministic outputs, excellent diagnostics, strong tests, and developed via small PRs using `git` + the GitHub CLI (`gh`).

### 0) Mission

Implement a Node-based assembler for ZAX that:

- reads an entry `.zax` file, resolves imports, and compiles the whole program
- produces **at minimum**:
  - flat binary output (`.bin`)
  - Intel HEX output (`.hex`) (per the spec constraints)
  - Debug80-compatible debug map: **D8 Debug Map (D8M) v1 JSON** (`.d8dbg.json`)
- optionally produces a listing (`.lst`) and/or a human-readable map/symbol report
- integrates cleanly with the **Debug80** project so Debug80 can build + debug `.zax` sources alongside existing `.asm` flows (currently assembled via `asm80`)

CLI design is specified in `docs/zax-cli.md`. Do not deviate from it without discussion.

### 1) Non-negotiables (quality gates)

- **Cross-platform**
  - Handle Windows paths, quoting, drive letters, and CRLF tolerance.
  - Do not assume `/` path separators in user input.
  - Do not rely on case-sensitive filesystem behavior.
  - Do not use platform-specific shell utilities in core logic.
  - Paths in diagnostics should use the path form the user provided (do not rewrite separators in user-facing output; canonicalize only internally).
  - Treat `.ZAX` and `.zax` as equivalent for file discovery on case-insensitive filesystems.
- **Determinism**
  - Same inputs → identical outputs (binary, HEX, D8M, listing).
  - Never depend on filesystem enumeration order, `Map` iteration assumptions, or `Date.now()`.
  - No timestamps or absolute machine paths in any output artifact. Outputs are reproducible by default.
  - Make ordering rules explicit and tested.
- **Diagnostics**
  - Every error includes file + line/column (when possible) and a clear message.
  - Each diagnostic (errors and warnings) has a stable ID (e.g., `ZAX001`) for programmatic use.
  - IDs are stable across releases once introduced: no renumbering, no reusing an ID for a different diagnostic.
  - Fail with non-zero exit code on error.
- **Artifacts required**
  - `.bin`, `.hex`, and `.d8dbg.json` are first-class. `.bin` and `.hex` must be emitted from PR 1. A minimal `.d8dbg.json` (format/version/arch + segment list + symbols) must also ship in PR 1 so the D8M pipeline never diverges; later PRs extend it.

### 2) Architecture expectations

Implement a compiler pipeline with clear module boundaries. Required structure:

- `src/cli/` — args parsing (per `docs/zax-cli.md`), IO policy, exit codes
- `src/frontend/` — lexer, parser, AST, source spans
- `src/semantics/` — name resolution, collisions, types/layout, const eval
- `src/lowering/` — structured control flow → labels/jumps, lowering of non-encodable operands, `op` expansion, stack frame/trampoline
- `src/backend/` — Z80 encoding, fixups, address→byte map, section packing, overlap checks
- `src/formats/` — BIN/HEX writers, optional LST writer, D8M writer
- `src/diagnostics/` — error objects (with stable IDs) + renderers

Call out explicitly where:

- determinism is enforced (sorting, ordering, normalization)
- Windows path edge cases are handled
- spec rules map to implementation (e.g., `select` lowering, `op` expansion, stack frame/trampoline model)

### 3) Contract-first development (Phase 0 — required before any implementation)

Before writing compiler logic, the first PR must define the **interface contracts** that all subsequent work depends on. This prevents agents from building incompatible internals.

Phase 0 deliverables (all in one PR):

1. **AST node types** (`src/frontend/ast.ts`) — define the stable top-level shape: discriminated union convention, source-span fields, and the concrete node kinds needed for PRs 1–2 (module file, func declaration, asm block, Z80 instruction nodes, const/enum/data). For constructs not yet needed (imports, op, structured control flow, unions, etc.), define placeholder members in the union (e.g., a comment or a generic `UnimplementedNode` kind with a span) so the union is forward-compatible. `UnimplementedNode` may exist in the union for type stability, but the parser must never emit it beyond the slice it is meant to cover — tests must fail if an `UnimplementedNode` appears in the AST output of any passing fixture. Later PRs replace placeholders with concrete node kinds as they go via the contract-change mechanism in §6.2.
2. **Diagnostic types** (`src/diagnostics/types.ts`) — a `Diagnostic` interface with `id` (stable string), `severity`, `message`, `file`, `line`, `column`. An enum or namespace of all diagnostic IDs.
3. **Compiler pipeline interface** (`src/pipeline.ts`) — the top-level function signature: input (entry path + options) → output (artifacts + diagnostics). Define the artifact types (binary buffer, HEX string, D8M JSON object, listing string).
4. **Format writer interfaces** (`src/formats/types.ts`) — each writer takes the compiler's internal address→byte map (or equivalent) plus symbol table and produces an output artifact.

This PR has no implementation, only types and interfaces. It must be reviewed and merged before any other PR begins.

### 4) Testing regime (spec-as-oracle)

The normative spec is the test plan. Every testable rule in `docs/zax-spec.md` must have at least one positive and one negative test fixture, traceable to a section number.

All test code lives under `test/` (not `tests/`). Do not create a parallel directory tree.

#### 4.1 Test categories

- **Unit tests** — lexer tokens, parser AST snapshots, layout/sizeof calculations, const evaluation, name resolution, Z80 instruction encoding, fixups.
- **Integration tests** — run the CLI on `.zax` fixture files and compare outputs:
  - `.hex` output (golden file)
  - `.bin` output (golden file)
  - `.d8dbg.json` output (structural comparison on key fields)
  - `.lst` output if produced (golden file)
- **Negative fixtures** — one per error class. Each fixture must:
  - assert the **first** diagnostic ID (stable string, not message text) and its primary source span
  - additional cascaded diagnostics are allowed but must be explicitly asserted if checked (don't assert count unless the test is specifically about cascade behavior)
  - cover: syntax errors, symbol collisions, reserved-name violations, type mismatches, overlap errors, invalid HEX checksums, out-of-range addresses, circular imports, ambiguous `op` overloads, stack-depth mismatches, etc.
- **Spec traceability** — test file names or descriptions must reference the spec section they exercise (e.g., `test/section-6.4/hex-overlap.test.ts`, or a comment `// §6.4: overlap is an error regardless of byte equality`).

#### 4.2 Golden-file policy

- Golden files (expected `.bin`, `.hex`, `.d8dbg.json`, `.lst`) are committed to the repo under `test/fixtures/`.
- A diff in a golden file **must** be flagged in the PR description with the reason for the change.
- Agents must never silently regenerate golden files. Use an explicit `--update-golden` test flag that is never used in CI.

#### 4.3 The `examples/` acceptance gate

All `.zax` files under `examples/` must compile without errors as a CI gate. This is the simplest end-to-end smoke test.

### 5) Vertical-slice PR plan (required ordering)

Work in **vertical slices**, not horizontal layers. Each PR compiles a _slightly larger subset_ of ZAX from source to artifact output. This ensures the pipeline is always integrated and testable.

Required PR sequence (adjust scope as needed, but preserve the vertical-slice principle):

| PR  | Scope                                                                                                                                                             | Key spec sections                  |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| 0   | **Contracts**: AST types, diagnostic types, pipeline interface, format writer interfaces. No implementation.                                                      | —                                  |
| 1   | **Minimal end-to-end**: lex + parse + encode + emit a single `func` with inline `asm` (raw Z80 mnemonics only, no locals, no imports). Produce `.bin`, `.hex`, and minimal `.d8dbg.json`. | §1, §2.1, §2.2, §8.1, §8.2, App B  |
| 2   | **Constants and data**: `const`, `enum`, `data` declarations, `imm` expressions, section packing.                                                                 | §4.3, §4.4, §6.3, §7.1             |
| 3   | **Module-scope `var`, types, records, arrays, unions**: layout, `sizeof`, `ea` expressions, field access, array indexing, lowering of non-encodable operands.   | §4.1, §4.2, §5, §6.2, §6.1.1, §7.2 |
| 4   | **Function locals and calling convention**: `var` block in `func`, SP-relative addressing, stack frame/trampoline mechanism, `func` calls from `asm`.             | §8.1–§8.5                          |
| 5   | **Structured control flow**: `if`/`else`/`while`/`repeat`/`until`, `select`/`case`, stack-depth matching at joins.                                                | §10                                |
| 6   | **Imports and multi-module**: `import`, name resolution, collision detection, packing order, forward references.                                                  | §3                                 |
| 7   | **`op` declarations**: matcher types, overload resolution, autosave, expansion, cyclic-expansion detection.                                                       | §9                                 |
| 8   | **`bin`/`hex`/`extern`**: external bytes, Intel HEX ingestion + validation, extern bindings.                                                                      | §6.4, §6.5                         |
| 9   | **Formats and Debug80**: extend D8M writer (source mapping, local scopes), LST writer, CLI polish (all switches per `docs/zax-cli.md`).                             | Appendix B, CLI doc                |
| 10  | **`examples/` acceptance + hardening**: all examples compile, negative-test coverage sweep, edge cases.                                                           | All                                |

Each PR must include tests for its scope and must not break any previously passing tests.

### 6) Agent coordination protocol

When using multiple agents in parallel:

#### 6.1 Ownership boundaries

- **Agent A (frontend)**: `src/frontend/`, `src/semantics/`, `src/diagnostics/`. Owns lexer, parser, AST construction, name resolution, const eval.
- **Agent B (backend)**: `src/lowering/`, `src/backend/`, `src/formats/`. Owns control-flow lowering, Z80 encoding, fixups, section packing, format writers.
- **Agent C (CLI + integration)**: `src/cli/`, `test/integration/`, Debug80 integration PR.

#### 6.2 Coordination rules

- **PR #0 (contracts) must merge before any agent begins implementation.** This is the synchronization point.
- Agents work on separate branches (`codex/<agent>-<topic>`). No two agents modify the same file.
- Integration happens on `main`: agent merges to `main`, other agents rebase before opening their next PR.
- If an agent needs to change a shared interface (AST, diagnostics, pipeline), it opens a **contract-change PR** first, which must be reviewed and merged before dependent work continues.
- When interfaces are stable, agents may work in parallel on independent vertical slices (e.g., Agent A on `op` expansion while Agent B on `select` lowering).

#### 6.3 Definition of done (per PR)

Every PR must satisfy before merge:

- [ ] Code compiles with no TypeScript errors
- [ ] All existing tests pass (no regressions)
- [ ] New tests added for every new feature and every new error path
- [ ] No golden-file changes without explicit justification in PR description
- [ ] PR description references spec sections covered
- [ ] Linter clean (ESLint + Prettier, or equivalent)

### 7) Debug80 integration (first-class requirement)

Debug80 currently integrates `asm80` by spawning it and expecting `.hex` + `.lst`, and it uses D8M debug maps.

You must plan and implement:

- A way for Debug80 to detect `.zax` projects (or entry files) and invoke `zax` instead of `asm80`.
- The assembler must work correctly when invoked the way Debug80 does: `cwd` set to the source directory, output paths passed as relative. Do not "fix" this by changing Debug80's cwd assumptions.
- Artifact naming must fit Debug80 expectations (per `docs/zax-cli.md`).

Deliverables for integration:

- a small PR to Debug80 adding "ZAX awareness" (file extension, build pipeline invocation, error reporting)
- an end-to-end test or documented manual recipe showing Debug80 stepping through ZAX output using the D8M map

### 8) What you must deliver first

Before coding, output:

1. The **Phase 0 contracts PR** (AST types, diagnostic types, pipeline interface, format writer interfaces).
2. A **phased plan** confirming or adjusting the vertical-slice PR table above, with estimated scope per PR.
3. A **Debug80 integration plan** (even if implemented later).

Do not write compiler logic until Phase 0 is merged.

---

## Notes for refinement (for humans)

Topics to decide in future revisions of this prompt:

- Whether to support multiple commands (`zax build`, `zax parse`, `zax lex`) in addition to the classic `zax file.zax` flow
- Whether to add a `--strict` mode that treats warnings as errors vs the current `--warn-as-error` switch
- Whether D8M output should include compiler version metadata for reproducibility tracking
