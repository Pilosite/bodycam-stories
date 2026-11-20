# Bodycam Stories — POC architecture (v0)

This is the shared contract for the real proof of concept. It follows `docs/poc-principes.md` (why) and `docs/plan-poc.md` (plan), and adds what Toine asked on 20 Nov: PDL as a transaction language over three horizons, model-written rules executed by code, narrative patterns, light and strong characters, collaboration, creator-facing logs, and language policy.

**Language policy.** Backend, code, data keys, logs, journals and tool UI are in English. What a character says is in the story's language, shown as subtitles. A player setting can force everything into one language. Existing engine code stays in French until touched; new POC code is English.

**Rule of the POC: simple, but every pillar is shown once, for real.** One place, one playable character, ten minutes. No pillar is faked; where something is out of scope it is absent, not staged.

## The eight pillars

| # | Pillar | What it is | What the POC shows |
|---|---|---|---|
| 1 | **PDL transactions** | The only channel between models and the world. Every change is a typed, validated, logged transaction. | The engine accepts nothing else; a session replays from its journal. |
| 2 | **Three horizons** | `now` (an action or effect, seconds), `scene` (state and rules valid for the current scene, minutes), `story` (facts, promises, arcs, persistent). | One transaction of each horizon firing in the same session, visible in the log. |
| 3 | **Rules written by models, run by code** | A model turns an indeterminate prompt into a deterministic rule (`when / if / then`, bounded). Code executes it without calling a model again. | A rule created mid-session by the model, firing later on its own. |
| 4 | **Model tiers** | Reflex (no model), translation (fast small model), staging (mid model), background (large model). All speak PDL. | Measured latency per tier; fallback from one to the next. |
| 5 | **Anticipation** | The background tier keeps a frontier of likely next intents, pre-written as PDL. | Hit rate of the frontier and latency gained. |
| 6 | **Narrative patterns** | Reusable story shapes creators pick from (`absent-one`, `ticking-clock`, `reluctant-guide`…), as data. | The story is assembled from 3 named patterns; swapping one changes the session. |
| 7 | **Characters, light or strong** | A creator gives either a few directions (traits) or a full sheet (voice, limits, secrets, arc). | Sam as a strong character; one light character defined in three lines. |
| 8 | **Collaboration and creator view** | The narrative space is layered and every transaction carries its author. Creators see what players did and how the world reacted, and refine rules. | Two creator layers merged with provenance; a session viewer; one rule edited and the session replayed against it. |

## Core concepts

### Transaction

```
tx {
  id, t                      // sequence number, session time
  author { kind: player | creator | model | engine, id, tier? }
  horizon: now | scene | story
  kind: intent | act | effect | fact | rule | cancel
  body                       // typed by kind, from the closed vocabulary
  cause?                     // id of the tx or rule that produced it
  ttl?                       // scene/now only
  status: proposed | repaired | accepted | rejected
  repair?                    // what the validator changed, and why
}
```

- A **player** speaks → the translation tier emits an `intent`.
- Models answer with `act`, `effect`, `fact`, `rule` transactions.
- The **validator** checks vocabulary, types, bounds and budget; it repairs what it can (the player's request is the reference), rejects the rest, and always records why.
- The **executor** applies accepted transactions deterministically (same journal + same seed = same session).
- Every transaction, accepted or not, goes to the **journal**.

### Rule

```
rule {
  id, horizon: scene | story, author
  when: event pattern        // e.g. thing.placed, body.near, clock.below, said.matches
  if?: conditions on world state / facts
  then: [transactions]       // bounded count, bounded magnitudes
  limits { max_fires, cooldown_s }
}
```

Rules are data. They are written by creators, by story packs, or by a model during play, and they run in code.

### Vocabulary (closed, typed)

`place` (terrain, light, weather), `thing` (shapes, materials, mass), `body` (move, look, posture, hands, effort), `sound` (recipes, cues), `speech` (line, language, tone), `fact` (subject, predicate, value, certainty), `clock`, `camera`. The existing engine vocabulary (fiche de lieu, formes, matières, bruitages, actions du porteur) is the starting set.

### Story pack

A folder a creator can author, version and share (collaboration v0 is Git: packs are files, contributions are pull requests; provenance is kept at runtime).

```
stories/<pack-id>/
  pack.json          // title, languages, authors, layers, patterns used
  place.json         // the world description
  characters/*.json  // light or strong sheets
  patterns/*.json    // pattern instances (bound to this story)
  rules/*.json       // creator rules
  beats.json         // the three or four beats and the families of endings
  lines/<lang>.json  // fallback lines per language
  tests/requests.json// the free-request bench for this story
```

A pack may declare **layers** (`base`, then one or more contributor layers). Layers merge in order; every fact, rule and character field keeps the layer and author it came from.

### Patterns

```
patterns/<id>.json { id, summary, roles, facts_required, rules, beats_hint, variations }
```

A library lives in `patterns/`; a story instantiates a pattern by binding its roles.

### Characters

- **Light**: `{ id, name, directions: ["dry", "funny", "not easily scared"], language }`.
- **Strong**: adds `voice` (register, tics, sample lines), `knows` / `does_not_know`, `limits` (what she refuses, what costs her), `secrets`, `arc`, `body` (what she can physically do).

Both feed the model tiers' prompts and the fallback line banks.

### Journal and creator view

- **Journal**: append-only JSON lines, one per transaction or engine event, English keys, with timings per tier and frame cost. It is the replay source, the debug log and the analytics source.
- **Creator view**: a page that loads a journal and shows the session timeline (what the player said, what each tier proposed, what was repaired or rejected, which rules fired), aggregate stats over several sessions, and a what-if: edit a rule, replay, see the difference.

## Layout in the repo

```
docs/architecture.md, docs/pdl-spec.md
core/        // pure, no DOM: pdl (types, parse, validate, repair), rules, executor interface, journal, replay, tiers, frontier
stories/     // story packs
patterns/    // pattern library
tools/       // bench runner, journal tools
viewer/      // creator view
src/         // existing engine; adapters from core/ to it
```

`core/` is tested without a browser. The engine implements the executor interface; a paper world implements it for tests.

## Out of scope for the POC

Several places, multiplayer in the same session, accounts and permissions beyond author ids, a marketplace of packs, long saves, the phone.
