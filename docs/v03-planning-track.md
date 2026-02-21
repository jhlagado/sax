# ZAX v0.3 Planning Track

This document is the post-v0.2 planning scaffold.

Normative language behavior for shipped versions remains in `docs/zax-spec.md`.

## 1. Inputs from v0.2 Closeout

- v0.2 codegen reference and invariants: `docs/v02-codegen-reference.md`

## 2. Initial Candidate Themes

1. Listing quality uplift

- source-interleaved `.lst` design and implementation plan

2. Debug80 integration tranche

- integration gate criteria, acceptance tests, and rollout plan

3. Explicit pointer/address operators

- scoped design for `^` and `@` operators and typed-pointer ergonomics

4. Optional typed-register field access extensions

- evaluate `IX/IY`-scoped typed field patterns

## 3. Planning Rules

- Keep v0.2 behavior stable while v0.3 planning is in progress.
- For each v0.3 candidate, define:
  - problem statement
  - minimal viable scope
  - diagnostics/compatibility impact
  - required tests
  - go/no-go criteria

## 4. Next Step

Open one issue per selected v0.3 candidate and prioritize by risk and user value.
