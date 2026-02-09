# ZAX Examples

These examples are part of the assembler contract: they are compiled by the test suite (`test/examples_compile.test.ts`).

Notes:

- Files prefixed with `legacy_` are kept for reference and are not compiled as part of the current ZAX subset.
- Examples may use features that are supported by the compiler even if they are not directly encodable in a single Z80 instruction; such cases are lowered by the compiler.
