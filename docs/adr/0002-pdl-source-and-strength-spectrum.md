# 0002. PDL source and the strength spectrum

- Status: accepted
- Date: 2026-11-20

## Context
JSON describes values; it cannot say "she tends to...". Creators and models need one readable, diffable text that runs from soft tendencies to absolute constraints (`docs/architecture.md`, "The authoring format"). Pillars 3 and 8 depend on it.

## Decision
Story assets are written as PDL source: plain text files, one statement per item, each with a strength mark: `!!` absolute (the validator rejects breaking transactions), `!` hard (compiled once into a deterministic `when / if / then` rule), `when ... -> ...` explicit hard rule, `~` tendency with optional weight, `?` open, `>` example and `x` counter-example (calibration, and tests). Each statement has an id, author, layer, scope (character, place, scene, story) and horizon. JSON stays only as the compiled machine form, cached and versioned with the source. A model compiles `!` statements when the pack is built, never during play, and the creator approves each compiled rule. After a session a judge pass audits soft statements against the journal.

## Consequences
- Rules run in code without calling a model again (pillar 3); soft statements reach models as prompt sections and are audited, not enforced.
- Promoting a tendency to a rule, or relaxing a rule, is a creator action backed by audit numbers.
- A parser, a compiler step and an audit pass must exist (`core/`, `docs/pdl-spec.md`).
- The existing `src/pdl.js` is a display notation only and is unrelated to this format (`docs/pdl.md`).

## Open questions
- Concrete grammar and the rule `when` event vocabulary: open, `docs/pdl-spec.md`.
- Which judge model tier runs the audit: open, see ADR 0004.
