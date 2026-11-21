# How we build: the SDLC of the POC

Strong on architecture, light on ceremony. This page is binding for everyone working on the POC, people and agents alike.

## 0. The constitution

`docs/principles.md` holds the founding principles (P1 to P23). It ranks above this page, the architecture and the plan. Consequences:

- Every brief names the principles its lot serves or risks. Every review checks the change against them; a change that breaks one is not merged, however good the code.
- A principle changes only through an ADR and Toine's explicit agreement.
- **Reading order for anyone, person or agent, who starts or resumes work:** `docs/principles.md`, `docs/scope.md`, `docs/architecture.md`, `docs/sdlc.md`, then the brief. Nothing essential may live only in a conversation: a decision that is not in these files does not exist.

## 1. Working principles

1. **Contract before code.** A change to a contract (`docs/architecture.md`, `docs/pdl-spec.md`, the executor interface, the pack format, the journal format) is written and agreed first, then implemented. Everything else can be coded directly.
2. **One channel.** Nothing changes the world except a PDL transaction. No side door, even for a demo.
3. **Data over code.** A new thing, line, rule, pattern or character is data. Code grows only when the vocabulary grows.
4. **Deterministic core, indeterminate edge.** Models decide; code validates, repairs, executes and replays. If it cannot be replayed from the journal, it is a bug.
5. **Measure, do not claim.** Each pillar has a number. A pillar without a measurement is not done.
6. **Really running beats nicely planned.** If a part is too hard, it goes to `docs/scope.md` as v2 or target and the POC routes around it. Nothing is staged to look done.
7. **Small vertical slices.** Each milestone ends with something playable or measurable end to end, however thin.

## 2. Decisions: ADRs

Architecture decisions live in `docs/adr/NNNN-title.md`, one page each: context, decision, consequences, status (`proposed`, `accepted`, `superseded`). An ADR is required when a contract changes, when a row of the scope ledger moves, or when we pick a technology. Not for anything else.

Initial set: 0001 PDL is the only channel · 0002 PDL source and the strength spectrum · 0003 v1 is station-based · 0004 model tiers and how they are reached · 0005 language policy · 0006 collaboration is layered packs in Git · 0007 test strategy · 0008 the home node · 0009 output economy · 0010 four temporalities and the beats of the present · 0011 harvest and conception · 0012 powers.

Priorities, open questions and the assumptions work proceeds on are kept in `docs/board.md`.

## 3. Tests: enough, at the right level

The rule: **test logic where it lives, once, at the lowest level that can catch the failure.** No end-to-end test per feature.

| Level | What | When it runs | Budget |
|---|---|---|---|
| A. Unit | Pure logic in `core/` and pure parts of the engine: parsing, validation, repair, rules, merging, replay. Invariants and branches, not getters. | every commit | fast, no browser |
| B. Contract | One suite for the executor interface, run against the paper world and against the engine adapter. | every commit (paper), milestone (engine) | one suite, two targets |
| C. Golden replays | Three to five recorded journals replayed; the final state hash must match. This is the regression net for everything above the core. | every commit | a journal per pillar, no more |
| D. Smoke | One browser run: load, play one recorded journal, no error, one screenshot looked at by a person. | per milestone, and when rendering or loading changes | exactly one |

What is **not** a test:

- **The free-request bench** (50 requests per story) and the **principle audit** are evaluations. They produce scores tracked over time and thresholds at milestones. They never block a commit.
- **Image quality** is judged by eye on a contact sheet, only when rendering changed. No pixel comparison in CI.

Guard rails against over-testing:

- A change adds a handful of tests. If it seems to need more than ten, the design is wrong or the test is at the wrong level.
- No test for behaviour that a golden replay already covers.
- No mocking of models in unit tests beyond a fixed canned response; model behaviour is evaluated, not unit-tested.
- A failing test is fixed or deleted with a reason, never skipped.

## 4. Flow

- **Trunk-based.** `main` is always green and always builds. Work happens on a short-lived branch per lot, merged by the coordinator after review. Tags mark milestones (`poc-v1-m1`…).
- **Review.** The coordinator reads the diff of every merge. An independent review agent is used only for contract changes (the PDL spec, the executor interface, the journal format), where a second, unanchored reading is worth its cost.
- **CI.** On every push: unit, contract (paper), golden replays, build, pack check. Nothing slower.
- **Definition of done for a change:** no founding principle broken · contracts and ADRs updated if touched · tests at the right level · build and CI green · new journal fields documented · scope ledger updated if scope moved · code, keys and logs in English.
- **Definition of done for a milestone:** its exit criterion measured and written in `docs/milestones.md` · the smoke run looked at · known gaps listed.

## 5. Working with agents, without burning tokens

- One agent, one lot, one clone, one brief file (`briefs/<lot>.md` in the repo, so a restart loses nothing). The brief names the contracts to read and nothing else.
- Agents keep `NOTES-AGENT.md` (done / in progress / left) and commit early; a successor resumes from the notes and the log.
- No browser renders unless the brief asks; when it does, small and few.
- Reports are short: what was done, what was measured, what deviates from the contracts, what is left.
- The strongest model is spent on contracts and architecture; mechanical work (moving files, wiring CI, translating keys) goes to a cheaper one.
- Parallelism follows the dependency graph: lots that share a contract start once that contract is committed.
- The coordinator verifies by reading diffs and running the fast tests, not by replaying the agent's work.

## 6. Observability is a feature

The journal is the debug log, the replay source and the analytics source at once. Every model call records its tier, latency, the principles in scope and what the validator did with the answer. If a creator cannot tell from the journal why something happened, that is a defect.

## 7. Secrets and models

No key in the repository or in the page. Models are reached through one adapter with two implementations: the host capability when the page runs as an artifact, and a small local proxy holding the key for development and real tier measurements. Which model serves which tier is configuration, recorded in ADR 0004.

## 8. Milestones of POC v1

| | Milestone | Exit criterion |
|---|---|---|
| M0 | Foundations | architecture, scope, SDLC and ADRs accepted; `main` green; CI running |
| M1 | Core and story on paper | the story pack loads; a full session of « Louis's Round » runs in the paper world with canned model answers and replays to the same hash |
| M2 | Playable without models | the engine implements the executor; stations and transitions; the session is playable with reflex and fallback lines only |
| M3 | Model tiers | translation and staging tiers live behind the adapter, principles in their prompts; first reaction and full reaction latencies measured |
| M4 | Background and rules | a rule written by a model mid-session fires later in code; the frontier serves a measured share of requests |
| M5 | Creator loop | session viewer, principle audit, one rule edited and the session replayed; two layers merged with provenance |
| M6 | Proof | the bench score, the four measurements, a three-minute video, the list of what is v2 |
