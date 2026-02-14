# ZAX v0.2 Implementation Checklist

This checklist is non-normative planning support.

Normative language behavior is defined in `docs/zax-spec.md`.

## Usage

1. Create one GitHub issue per planned change (use the `v0.2 Change Task` template).
2. Add or update a row in the table below with the issue number and status.
3. Link the implementing PR in the `PR` column.
4. Keep rule text in `docs/zax-spec.md`; keep this file as a pointer/checklist only.

## Active Queue

| Area                    | Change                                                       | Issue                                              | Status      | PR                                               |
| ----------------------- | ------------------------------------------------------------ | -------------------------------------------------- | ----------- | ------------------------------------------------ |
| docs                    | Runtime-atom model and single-expression budget              | —                                                  | In progress | [#219](https://github.com/jhlagado/ZAX/pull/219) |
| semantics/lowering      | Enforce runtime-atom quota for source-level `ea` expressions | [#221](https://github.com/jhlagado/ZAX/issues/221) | Planned     | —                                                |
| semantics/lowering      | Enforce runtime-atom-free direct `ea`/`(ea)` call-site args  | [#222](https://github.com/jhlagado/ZAX/issues/222) | Planned     | —                                                |
| lowering/spec-alignment | Resolve op stack-policy mismatch (docs vs implementation)    | [#223](https://github.com/jhlagado/ZAX/issues/223) | Planned     | —                                                |

## Rollout Schedule (Spec-First, Implementation Catch-Up)

This section makes implementation lag explicit so contributors can plan work against v0.2 normative direction.

| Wave   | Target                                              | Scope                                                                | Tracking                                           |
| ------ | --------------------------------------------------- | -------------------------------------------------------------------- | -------------------------------------------------- |
| Wave 1 | Runtime-atom enforcement in `ea` expressions        | Implement quota checks + user-friendly diagnostics + fixture updates | [#221](https://github.com/jhlagado/ZAX/issues/221) |
| Wave 2 | Runtime-atom-free direct call-site `ea`/`(ea)` args | Enforce staged-arg model + diagnostics + fixture updates             | [#222](https://github.com/jhlagado/ZAX/issues/222) |
| Wave 3 | Op stack-policy alignment                           | Finalize one policy and align docs/implementation/tests              | [#223](https://github.com/jhlagado/ZAX/issues/223) |

## Team Signal

- `docs/zax-spec.md` remains canonical for target behavior.
- Until Waves 1-3 land, some implementation paths are intentionally behind the spec and are tracked by the issues above.
- New feature work touching addressing/calls/ops should cross-check this schedule before adding behavior.

## Status Legend

- `Planned`: scoped issue exists; work not started.
- `In progress`: PR open or implementation active.
- `Blocked`: waiting on dependency/decision.
- `Done`: merged to `main`.
