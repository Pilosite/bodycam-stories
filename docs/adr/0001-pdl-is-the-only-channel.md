# 0001. PDL is the only channel

- Status: accepted
- Date: 2026-11-20

## Context
The 20 November satire demo let several paths change the world (scripted lines, direct engine calls, model output parsed ad hoc). Pillar 1 of `docs/architecture.md` says every change must be a typed, validated, logged transaction, and `docs/sdlc.md` principle 2 says "one channel, no side door, even for a demo". Principle 4 asks that any session be replayable from its journal.

## Decision
Nothing changes the world except a PDL transaction (`tx`: id, t, author, horizon, kind, body, cause, ttl, status, repair). Players speak, which yields an `intent`; models answer with `act`, `effect`, `fact` or `rule`. The validator checks vocabulary, types, bounds and budget, repairs what it can (the player's request is the reference), rejects the rest, and always records why. The executor applies accepted transactions deterministically. Every transaction, accepted or not, is appended to the journal.

## Consequences
- The engine accepts nothing else: existing direct calls (the `window.balade` API, scripted demo orders) must be routed through transactions or fenced in the sandbox (`docs/sandbox.md`).
- A session replays from journal plus seed to the same state hash; this makes golden replays (ADR 0007) possible.
- The vocabulary is closed and typed; growing it is a contract change (`docs/pdl-spec.md`, written first).
- The journal doubles as debug log and analytics source (`docs/sdlc.md` §6).

## Open questions
- Exact wire format of `body` per kind: open, to be fixed in `docs/pdl-spec.md`.
- How the existing French engine orders map onto the closed vocabulary: open, adapter work from M2.
