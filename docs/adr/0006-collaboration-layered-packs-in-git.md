# 0006. Collaboration is layered packs in Git

- Status: accepted
- Date: 2026-11-20

## Context
Pillar 9 asks for several creators on one narrative space with provenance. Live shared spaces and a hosted workspace are target features (`docs/scope.md`); accounts, permissions beyond author ids and a marketplace are out of scope for the POC (`docs/architecture.md`).

## Decision
Collaboration v0 is Git. A story is a pack: a folder `stories/<pack-id>/` of files (`pack.json`, `place.json`, characters, patterns, rules as PDL source, beats, lines per language, request bench, generated `build/`). A pack declares layers (`base`, then contributor layers) merged in order; every fact, rule and character field keeps the layer and author it came from at runtime. Contributions are pull requests. Every transaction carries its author.

## Consequences
- Packs must be diffable text; compiled `build/` output is generated and not hand-edited.
- A pack checker and a merge-with-provenance function are needed in `core/` (M5).
- Conflicts are resolved by Git for source and by layer order at runtime.
- Forks, shared packs with tooling and live spaces are v2 or target.

## Open questions
- Layer precedence when two layers set the same field: "in order" is decided, conflict reporting to the creator is open.
- Whether `build/` is committed or produced in CI: open.
