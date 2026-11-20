# Milestones of POC v1

From `docs/sdlc.md` §8. A milestone is done when its exit criterion is measured and written in the "Measured" column, the smoke run was looked at, and known gaps are listed (`docs/sdlc.md` §4). Leave "Measured" empty until it is.

| | Milestone | Exit criterion | How to check | Measured |
|---|---|---|---|---|
| M0 | Foundations | Architecture, scope, SDLC and ADRs accepted; `main` green; CI running | `npm test` passes; the CI workflow is green on `main`; `docs/adr/` holds 0001 to 0007 (0004 may still be a placeholder) | |
| M1 | Core and story on paper | The story pack loads; a full session of "Louis's Round" runs in the paper world with canned model answers and replays to the same hash | The golden replay test passes in CI; replaying the recorded journal twice gives an identical final state hash | |
| M2 | Playable without models | The engine implements the executor; stations and transitions; playable with reflex and fallback lines only | The contract suite passes on both the paper world and the engine adapter; one smoke run plays the recorded journal in a browser with no error and the screenshot is looked at | |
| M3 | Model tiers | Translation and staging tiers live behind the adapter, principles in their prompts; first-reaction and full-reaction latencies measured | Run the latency script against the proxy; read p50 and p95 per tier from the journal timings | |
| M4 | Background and rules | A rule written by a model mid-session fires later in code; the frontier serves a measured share of requests | Find in the journal a model-authored `rule` followed by its firing with no model call; compute the frontier hit rate over a bench run | |
| M5 | Creator loop | Session viewer, principle audit, one rule edited and the session replayed; two layers merged with provenance | Open a journal in the viewer; edit a rule and replay, see the diff; merge two layers and check the author on each field | |
| M6 | Proof | The bench score, the four measurements, a three-minute video, the list of what is v2 | Run the 50-request bench per story and record the score; check the four measurements are in this table; watch the video; read the v2 list in `docs/scope.md` | |
