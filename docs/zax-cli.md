# ZAX CLI (Draft v0.1, Non-normative)

This document describes recommended command-line behavior for the **ZAX assembler**. It is non-normative: the language rules live in `docs/zax-spec.md`.

The goal is to feel familiar to assembler users (similar to `asm80`) while supporting required ZAX outputs: **BIN**, **Intel HEX**, and **D8 Debug Map (D8M)**.

## Invocation shape

```
zax [options] <entry.zax>
```

`<entry.zax>` is the entry module and must be the **last** argument (assembler-style).

## Status (current implementation)

The v0.1 CLI exists as `src/cli.ts` and is exposed via:

```
yarn -s zax -- [options] <entry.zax>
```

This runs `yarn -s build` first and then executes `dist/src/cli.js`.

## Primary output and derived artifacts

ZAX uses a single “primary output path” to derive sibling artifacts.

- Primary output path:
  - `-o, --output <file>` sets the primary output file path.
  - If omitted, the default primary output path is `<entryDir>/<base>.hex`.
- Default primary output type: `hex`.
- Artifact base:
  - `artifactBase = primaryOutputPath without its extension`
  - When enabled, the assembler writes sibling artifacts next to the primary output:
    - Intel HEX: `artifactBase + ".hex"`
    - Flat binary: `artifactBase + ".bin"`
    - Listing: `artifactBase + ".lst"`
    - Debug map (D8M v1): `artifactBase + ".d8dbg.json"`

Listing note:

- In v0.1, `.lst` is a deterministic byte dump with an ASCII gutter plus a symbol table (not a full source listing).
- Sparse/unwritten bytes inside the written range are rendered as `..` in the hex column.
- Fully empty line spans are collapsed into deterministic `; ... gap $XXXX..$YYYY` markers.
- Use `.d8dbg.json` (D8M) for debugger-grade source mapping.
- D8M emits sparse contiguous `segments` plus `addressWidth: 16` and `endianness: "little"` metadata.
- Intel HEX output emits only records for written addresses (sparse gaps are not zero-filled into intermediate records).

Directory creation:

- If `--output` points into a directory that does not exist, the assembler creates it.

Path handling:

- Accept user-supplied paths as-is (Windows paths, drive letters, separators).
- For debug maps, file keys should be normalized to project-relative paths with `/` separators (see `docs/zax-spec.md`, Appendix B).

## Options (proposed v0.1 baseline)

Keep switches intentionally small:

- `-o, --output <file>` Primary output path (used to derive sibling outputs)
- `-t, --type <type>` Primary output type (default: `hex`)
  - supported: `hex`, `bin`
- `-n, --nolist` Suppress `.lst`
- `--nobin` Suppress `.bin`
- `--nohex` Suppress `.hex`
- `--nod8m` Suppress `.d8dbg.json`
- `-I, --include <dir>` Add import search path (repeatable)
- `-V, --version`
- `-h, --help`

## Error contract (current implementation)

- CLI argument/shape errors exit with code `2`, print a `zax:` error line, and include usage text.
- Compile diagnostics errors exit with code `1`, do **not** print usage text, and print source diagnostics only.
- Source diagnostics include stable diagnostic IDs (for example `[ZAX001]`, `[ZAX003]`, `[ZAX100]`) so tooling/tests can pin failure classes.

## Deterministic module order (imports)

When the entry module imports other modules, the assembler resolves an import graph and chooses a deterministic module order:

- Dependencies are ordered before dependents (topological order).
- Ties are broken by canonical module ID (file stem), then by a normalized module path.

This order is used when packing output sections so builds are stable and independent of filesystem enumeration order.

## Debug80 integration note

Debug80 expects to find:

- `<artifactBase>.hex`
- `<artifactBase>.lst` (unless suppressed)
- `<artifactBase>.d8dbg.json`

Co-locating these artifacts via the `--output`/artifactBase rule is the simplest integration strategy.
