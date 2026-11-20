# 0007. Test strategy

- Status: accepted
- Date: 2026-11-20

## Context
The repository had 270 tests written during a rushed demo; three were left failing. `docs/sdlc.md` §3 sets a rule: test logic where it lives, once, at the lowest level that can catch the failure, with no end-to-end test per feature.

## Decision
Four levels: A unit (pure logic in `core/` and pure engine parts, every commit, no browser); B contract (one suite for the executor interface, run on the paper world every commit and on the engine adapter at milestones); C golden replays (three to five recorded journals, final state hash must match, every commit); D smoke (exactly one browser run per milestone and when rendering or loading changes, one screenshot looked at by a person). Not tests: the free-request bench and the principle audit (evaluations, scored over time, never blocking a commit) and image quality (judged by eye on a contact sheet). Guard rails: a change adds a handful of tests, no test duplicates a golden replay, models are not mocked beyond a fixed canned answer, and a failing test is fixed or deleted with a reason, never skipped. Expected values that come from retuned data are read from that data rather than copied.

## Consequences
- CI runs levels A to C and the build; no browser job (`.github/workflows/ci.yml`).
- Legacy tests stay while they check something meaningful; stale ones are fixed or deleted with a reason.
- Thresholds for bench and audit are set per milestone in `docs/milestones.md`, not in CI.

## Open questions
- Format and storage of golden journals: open, `docs/pdl-spec.md`.
- Whether legacy French tests move under a `legacy/` folder when `core/` tests arrive: open.
