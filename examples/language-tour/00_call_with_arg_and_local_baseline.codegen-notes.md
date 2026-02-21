# Codegen reference for `00_call_with_arg_and_local_baseline`

Authoritative expectations for the hand-crafted `.expected-v02.asm` outputs in this folder. Use these rules when comparing generated asm for the two functions shown in the example program.

## `main` (no return registers)

- HL must be preserved (no return channel), so locals are initialized *before* pushing the preserve set.
- Frame setup:
  1. `PUSH IX`
  2. `LD IX,0` / `ADD IX,SP`
  3. Save HL once: `PUSH HL`
  4. For each local initializer, use the swap pattern so HL is restored after each init:
     - `LD HL,<init>`
     - `EX (SP),HL`  (top of stack becomes the initialized local; HL reg is restored)
  5. After locals, preserve full set in this order: `PUSH AF`, `PUSH BC`, `PUSH DE`, `PUSH HL`.
- Call argument: clobber HL to load the arg, `PUSH HL`, `CALL inc_one`, then clean arg with two `INC SP`.
- Result store uses IX/DE shuttle with locals at IX-2/IX-1 (because locals were placed before preserves):
  - `PUSH DE` / `EX DE,HL`
  - `LD (IX-$0002),E` / `LD (IX-$0001),D`
  - `EX DE,HL` / `POP DE`
- Epilogue restores in reverse preserve order and discards the saved-HL slot by resetting SP from IX:
  - `POP HL`, `POP DE`, `POP BC`, `POP AF`, `LD SP,IX`, `POP IX`, `RET`.

Correct symbol offsets in the expected file:
```
local result_word -> IX-2 / IX-1
__zax_epilogue_1  -> $0153
```

## `inc_one` (returns HL)

- HL is the return channel (volatile), so it is **not** preserved.
- Frame setup:
  1. `PUSH IX`
  2. `LD IX,0` / `ADD IX,SP`
  3. Initialize locals directly (HL is free to clobber):
     - `LD HL,$0022` / `PUSH HL`
     - `LD HL,$0033` / `PUSH HL`
  4. Preserve only AF, BC, DE (in that order): `PUSH AF`, `PUSH BC`, `PUSH DE`.
- Arg load and math:
  - `LD E,(IX+$0004)` / `LD D,(IX+$0005)` / `INC DE`.
- Store/load local via IX-2/IX-1 (locals sit directly below the frame):
  - `LD (IX-$0002),E` / `LD (IX-$0001),D`
  - `LD E,(IX-$0002)` / `LD D,(IX-$0001)`
  - `EX DE,HL` (return value now in HL).
- Epilogue restores preserved regs only: `POP DE`, `POP BC`, `POP AF`, `LD SP,IX`, `POP IX`, `RET`.

## Preservation order summary

- Void/no-return functions: preserve AF, BC, DE, HL **after** locals are initialized.
- Functions that return via HL (or other registers): do **not** preserve return registers; only preserve the remaining set according to the spec table.

These notes are a static reference. Do not regenerate or rewrite this file; use it to validate codegen against the hand-crafted `.expected-v02.asm` outputs in this directory.***
