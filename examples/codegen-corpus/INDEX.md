# Codegen Corpus (Restored)

Canonical source for these cases is `test/fixtures/corpus/`.

This directory is a committed, human-browsable mirror for manual inspection.

## Included

- `*.zax` source fixtures
- `*.asm` lowered snapshots (from `test/fixtures/corpus/golden/`)
- `*.hex` expected opcode artifacts (from `test/fixtures/corpus/opcode_expected/`)
- `*.bin` emitted binaries for compilable corpus cases

## Cases

- `basic_control_flow`
- `intermediate_indexing`
- `advanced_typed_calls`
- `invalid_runtime_atom_budget` (negative fixture; source-only expected failure)
