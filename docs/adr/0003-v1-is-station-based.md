# 0003. v1 is station-based

- Status: accepted
- Date: 2026-11-20

## Context
Autonomous movement, obstacle handling and pathfinding are the least reliable part of the current engine (`docs/scope.md`; the CLAUDE.md convention that no body crosses anything). The bodycam constraint says we never drive the character. The POC needs each view to settle to full image quality and needs anticipation to have an obvious shape.

## Decision
POC v1 plays like a 1990s adventure with pre-computed views: one place, four to six stations (viewpoints) along one path. At a station the player looks around freely and talks; the character acts in place (looks, crouches, touches, picks up, makes, places, speaks). Moving to the next station is a transition the engine plays when the story or the character decides. No free roaming, no pathfinding, no obstacle logic in v1. Movement in the scope ledger: v2 is autonomous movement on the path, then off it; target is free roaming.

## Consequences
- The vocabulary gains `station` and `go` between adjacent stations (`docs/architecture.md`).
- Anticipation can prepare likely requests per station (pillar 5).
- Existing autonomous walking code is off the critical path; `MENEUR.planTrajet` is not used by v1.
- Moving the ledger row to the left requires a new ADR.

## Open questions
- Transition format (cut, short travelling, duration budget): open.
- Whether stations are authored in `place.json` or derived: open.
