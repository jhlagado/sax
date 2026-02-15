# v0.2 Hidden-Lowering Risk Matrix

This matrix tracks high-risk hidden lowering paths and their focused coverage.

Issue: `#263`  
Normative focus: hidden lowering in op expansion, call boundaries, and stack/frame behavior.

## Matrix

| Risk Category                                    | Invariant                                                                                   | Positive Coverage                                                                             | Negative/Guardrail Coverage                                               |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Op expansion call-site attribution               | Expanded op code remains attributable to call site as macro-originated output               | `test/pr269_d8m_op_macro_callsite_mapping.test.ts`                                            | `test/pr268_op_diagnostics_matrix.test.ts`                                |
| Op expansion stack discipline at call boundaries | Stack-neutral/non-neutral op effects are surfaced at boundaries, including policy mode      | `test/pr271_op_stack_policy_alignment.test.ts` (`warn`)                                       | `test/pr283_hidden_lowering_risk_matrix.test.ts` (`opStackPolicy: error`) |
| Typed call wrappers (`void` vs non-`void`)       | Preservation wrappers are emitted per v0.2 contract; return channel remains HL for non-void | `test/pr276_typed_call_preservation_matrix.test.ts`                                           | `test/pr224_lowering_call_boundary_stack_matrix.test.ts`                  |
| Raw call vs typed-call diagnostics               | Raw-call warnings are distinct and opt-in without changing typed-call rules                 | `test/pr278_raw_call_typed_target_warning.test.ts`                                            | `test/pr275_typed_vs_raw_call_boundary_diagnostics.test.ts`               |
| Function prologue/epilogue rewriting             | Locals trigger synthetic epilogue and conditional-return rewrites correctly                 | `test/pr14_frame_epilogue.test.ts`                                                            | `test/pr229_lowering_retn_reti_safety_matrix.test.ts`                     |
| Local/arg/global access in framed functions      | Lowering preserves stack/frame safety while materializing local/arg/global accesses         | `test/pr283_hidden_lowering_risk_matrix.test.ts` (`pr283_local_arg_global_access_matrix.zax`) | `test/pr14_frame_epilogue.test.ts` (untracked SP slot access error case)  |
| Structured-control + hidden lowering joins       | Unknown/untracked states propagate correctly to ret/fallthrough diagnostics                 | `test/pr221_lowering_op_expansion_retcc_interactions.test.ts`                                 | `test/pr198_lowering_unknown_stack_states.test.ts`                        |

## Notes

- Rows are intentionally mapped to focused tests to reduce false confidence from broad integration suites.
- Add a matrix row before landing any hidden-lowering behavior change that introduces new implicit codegen paths.
- Keep diagnostics IDs/messages stable unless explicitly changed and captured in row coverage updates.
