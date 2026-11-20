# 0004. Model tiers and how they are reached

- Status: proposed (placeholder)
- Date: 2026-11-20

## Context
`docs/architecture.md` defines four tiers (reflex with no model, translation with a fast small model, staging with a mid model, background with a large model), all speaking PDL, with fallback from one to the next. `docs/sdlc.md` §7 says models are reached through one adapter with two implementations (the host capability when the page runs as an artifact, a local proxy holding the key for development and measurements) and that which model serves which tier is configuration recorded here.

## Decision
Not written yet. Another agent is researching which model serves which tier, with measured latency and cost. This ADR will be filled from that research; until then nothing may hard-code a model name in code (configuration only).

## Consequences
Blocks M3 (model tiers) but not M0 to M2.

## Open questions
- Model per tier, fallback order, latency and cost budgets, proxy contract: open, pending the research.
