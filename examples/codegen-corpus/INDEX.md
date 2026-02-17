# Codegen Corpus (Curated Inspection Set)

This directory is a committed, human-inspection corpus.

Canonical ownership remains:

- source-of-truth fixtures: `test/fixtures/` and `test/fixtures/corpus/`
- this folder: curated mirror for side-by-side `.zax` and generated artifacts

## Included per positive case

- `<name>.zax`
- `<name>.asm`
- `<name>.bin`
- `<name>.hex`

## Cases

1. `basic_control_flow`
2. `intermediate_indexing`
3. `advanced_typed_calls`
4. `pr222_locals_retcc_and_ret`
5. `pr258_op_cc_matcher`
6. `pr258_op_idx16_matcher`
7. `pr259_op_ea_dotted_field`
8. `pr266_negative_immediate_lowering`
9. `pr269_d8m_op_macro_callsite`
10. `pr272_runtime_affine_valid`
11. `pr276_typed_call_preservation_matrix`
12. `pr283_local_arg_global_access_matrix`

Negative fixture (source-only expected failure):

- `invalid_runtime_atom_budget.zax`

## Regeneration

Use the assembler directly for each fixture:

```bash
yarn -s zax -o examples/codegen-corpus/<name>.hex -t hex --nod8m --nolist test/fixtures/<name>.zax
```
