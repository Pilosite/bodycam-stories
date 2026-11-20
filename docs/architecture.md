# Bodycam Stories — POC architecture (v0)

**This page serves `docs/principles.md`, the project's constitution. If the two disagree, the principles win and this page is wrong.**

This is the shared contract for the real proof of concept. It follows `docs/poc-principes.md` (why) and `docs/plan-poc.md` (plan), and adds what Toine asked on 20 Nov: PDL as a transaction language over three horizons, model-written rules executed by code, narrative patterns, light and strong characters, collaboration, creator-facing logs, and language policy.

**Language policy.** Backend, code, data keys, logs, journals and tool UI are in English. What a character says is in the story's language, shown as subtitles. A player setting can force everything into one language. Existing engine code stays in French until touched; new POC code is English.

**Rule of the POC: simple, but every pillar is shown once, for real.** One place, one playable character, ten minutes. No pillar is faked; where something is out of scope it is absent, not staged.

**Scope and process.** What is in v1, v2 and target is in `docs/scope.md`; how we build is in `docs/sdlc.md`. v1 is **station-based**: a few viewpoints along one path, free look and in-place action at each, transitions between them; no free roaming.

## The ten pillars

| # | Pillar | What it is | What the POC shows |
|---|---|---|---|
| 1 | **PDL transactions** | The only channel between models and the world. Every change is a typed, validated, logged transaction. | The engine accepts nothing else; a session replays from its journal. |
| 2 | **Three horizons** | `now` (an action or effect, seconds), `scene` (state and rules valid for the current scene, minutes), `story` (facts, promises, arcs, persistent). | One transaction of each horizon firing in the same session, visible in the log. |
| 3 | **Rules written by models, run by code** | A model turns an indeterminate prompt into a deterministic rule (`when / if / then`, bounded). Code executes it without calling a model again. | A rule created mid-session by the model, firing later on its own. |
| 4 | **Model tiers** | Reflex (no model), translation (fast small model), staging (mid model), background (large model). All speak PDL. | Measured latency per tier; fallback from one to the next. |
| 5 | **Anticipation** | The background tier keeps a frontier of likely next intents, pre-written as PDL. | Hit rate of the frontier and latency gained. |
| 6 | **Narrative patterns** | Reusable story shapes creators pick from (`absent-one`, `ticking-clock`, `reluctant-guide`…), as data. | The story is assembled from 3 named patterns; swapping one changes the session. |
| 7 | **Characters, light or strong** | A creator gives either a few directions (traits) or a full sheet (voice, limits, secrets, arc). | Sam as a strong character; one light character defined in three lines. |
| 8 | **Soft-to-hard principles** | Assets are written as PDL source with strengths from tendency to absolute; hard ones compile to code, soft ones are evaluated by models and audited. | One tendency, one open question, one hard rule and one absolute on Sam, each visibly at work, and an audit score after the session. |
| 9 | **Commitments** | The player plans ahead through the character: a conditional request becomes a promise and a rule, with a strength, that she keeps (or breaks) later. | One commitment made at an early station and honoured two stations later, linked in the journal. |
| 10 | **Collaboration and creator view** | The narrative space is layered and every transaction carries its author. Creators see what players did and how the world reacted, and refine rules. | Two creator layers merged with provenance; a session viewer; one rule edited and the session replayed against it. |

## Shape: a hexagon and three clocks (P20, P21)

```
        input port            model port             store port
   (speech, text, look)   (embed, decide, generate)   (journal, packs)
            \                    |                      /
             +----------- NARRATIVE CORE ---------------+
             |  world state · principles · gauges        |
             |  commitments · rules · PDL validate/repair|
             |                                           |
             |  NOW loop      SCENE loop     STORY loop  |
             |  < 100 ms      seconds        continuous  |
             +-------------------------------------------+
                                 |
                            engine port
                    (executor: image, sound, body)
```

- **The core is pure** and knows only ports. The engine, the models, the input and the storage are adapters. Tests run the core with a paper world and canned models.
- **Three loops, three budgets.** `now`: reflex code first, then the leanest model; first visible reaction under 0.5 s, and it never awaits another loop. `scene`: full reaction in seconds. `story`: continuous, prepares the frontier and the long arcs.
- **Loops communicate only by PDL transactions and events, asynchronously.** A slower loop may add to, amend or cancel what a faster one did, through transactions tagged with `cause`; it cannot block it. Every transaction records the loop and the latency against its budget, so a blocked present shows up in the journal as a defect.
- **Uncertainty is routed by horizon.** What the player just said goes to `now`. What he might do next goes to `story`, which prepares for it.

## Where judgement happens: the decision points (P22, ADR 0004)

Judgement is the second instrument of the engine: a **decision model** (the class opened by Jev: Clef, the Decisions API, open-source equivalents) reads a state and a typed question and returns a typed answer with a probability. It never writes. In the core it is one port method, `decide({ tier, question, options?, state }) → { answer, p, uncertain }`, with three answer types: `bool`, `choice` (one of a closed list) and `score` (a level on a short scale).

| # | Clock | Question | Type | What the code does with it |
|---|---|---|---|---|
| D1 | now | What is the player asking? (intent class and target, among the closed vocabulary) | choice | builds the `intent` transaction; asked only when the nearest-match on embeddings is below its threshold |
| D2 | now | Is it for now, or for later under a condition? | bool | routes to a commitment instead of an act |
| D3 | now | Does she go along? (accept, amend, refuse, argue), given her tendencies in scope | choice | picks the reaction family; the line itself is a bank line or an invention |
| D4 | scene | Does this proposed transaction break a principle in scope that code cannot check (`!` not yet compiled, strong `~`)? | bool | accept, or repair toward the intent; on `!!` the question is asked in both orders |
| D5 | scene | Is this fuzzy condition true now? ("too often", "close", "she has had enough") when no gauge answers it | bool or score | fires or holds a rule's `if`; a gauge, when one exists, answers in code instead |
| D6 | scene | Has what the player planned for just happened? (a commitment's condition, stated in words) | bool | marks the commitment `due` |
| D7 | scene | Did she keep her word? | choice | `kept` or `broken`, with the reason journaled |
| D8 | story | Has this beat reached its goal? | bool | lets the story move on |
| D9 | story | Which requests are likely at the next stations? | score | orders the frontier the large model prepares |
| D10 | story | Was each principle in scope respected in this window? | score | the principle audit of the creator view |

Rules of use:

- **A judgement has a confidence, and the confidence is played.** High: act. Middle: act in character with the doubt showing (she hesitates, she checks). Low: she asks back. The thresholds are configuration per question; the default is 0.8 and 0.5. Uncertainty is given to the character, never to the player as an error (P5, P7).
- **Stakes decide the care.** On an absolute (`!!`) a binary question is asked twice, in both orders, and a disagreement counts as "uncertain". Elsewhere once is enough.
- **One fallback chain, the same everywhere:** a decision model when one is reachable, else the fast generative model with a flat structured output, else the code heuristic (lexicon, nearest match). The journal records which one answered, its probability and its latency, so a creator can see where the engine guessed.
- **Never on the reflex path.** What code can answer (a gauge, a compiled rule, a closed match) is not asked to a model.
- D1 to D3 are the only judgements between the player's words and the character's first reaction; they share one call when the model allows several questions per call.
- In code: `core/judge.js` applies these rules (`judge()`, both orders as `<id>~r` questions, D1 to D3 in one call, D4 on invented lines); `core/clocks.js` asks D1 to D3 only when the reflex is below `act_from`, and D4 on every invented line while prose `!!` are in scope (M3, `docs/pdl-spec.md` §9.1.1, §9.3).

## The authoring format: one text, a spectrum from soft to hard

JSON describes values; it cannot say "she tends to…". Story assets are therefore written as **PDL source**: plain text files, readable by a person and by a model, diffable in Git. JSON remains only as the compiled, machine form.

A PDL source file is a list of statements, each with a **strength**:

| Mark | Strength | Who enforces it | Example |
|---|---|---|---|
| `!!` | absolute | the validator: a transaction that breaks it is rejected | `!! Sam never harms an animal.` |
| `!` | hard | code: compiled once into a deterministic rule | `! She does not shout within 30 m of the hide.` |
| `when … -> …` | hard, explicit | code, as written | `when clock.battery < 10% once -> say(battery_low), image.degrade(0.3)` |
| `~` | tendency (optional weight) | the models, in context; audited afterwards | `~0.8 Dry, funny when uneasy. Short sentences.` |
| `?` | open | the models decide, guided by the note | `? Would she climb? Yes if asked twice, and she complains.` |
| `>` / `x` | example / counter-example | calibrates `~` and `?`; doubles as a test | `> "C'est un pin sylvestre. Malade, celui-là."` |

Every statement has an id, an author, a layer, a scope (character, place, scene, story) and a horizon.

**Compilation.** A compiler (a model, run when the pack is built, not during play) turns each `!` into a `when / if / then` rule and shows it to the creator for approval; `!!` become validator constraints; `~`, `?` and their examples become the character and scene sections of the model tiers' prompts. The compiled result is cached and versioned with the source.

**Audit.** After a session, a judge pass scores the journal against the soft statements ("was she dry and funny when uneasy?") and against the examples. The creator view shows, per statement: how often it was relevant, respected, broken, and lets the creator promote a tendency to a hard rule, or relax a rule into a tendency. That loop is how creators tune a living story.

**Who writes it.** Most creators never see this file: they talk to an assistant that writes and edits it for them. The repository doubles as a **creator kit** for those who want the backend: opened in Claude Code, Codex or a similar tool, it gives the assistant the spec, the checker, the replay and the audit as commands, so a creator can say "make Sam more guarded with strangers" and review the diff.

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

### Commitments: the player plans ahead through the character

The player never acts on the world, but can ask the character to **prepare**: "if you hear the jay, stop and get down", "tomorrow, if someone is at the hide, do not show yourself". This is the same rule mechanism, opened to the player and mediated by the character:

1. The translation tier recognises a conditional request and emits an `intent` of sub-kind `commit` (a condition and a wanted behaviour, in the player's words).
2. The character answers in character: she accepts, amends ("I will stop, I will not lie down in that mud") or refuses. Her principles decide (`? does she take orders about Louis?`).
3. If accepted, two transactions are recorded with the player as author and the character as party: a `fact` (the promise, with its wording and certainty) and a `rule` (`when / if / then`, horizon `scene` or `story`).
4. The commitment carries a **strength**, like any statement: a promise she will keep in code (`!`), or one she will try to keep and that the model weighs against the moment (`~`). A strong character may break her word, and the journal shows that she did and why.
5. When it fires, the journal links the act back to the commitment, and she can say so ("You told me to stop if the jay called.").

Commitments are what makes the indirect control a game: the player's lever is foresight, not steering. They are also the first authoring tool: a player who writes commitments is already writing rules, which is the path from player to creator.

### Gauges: fuzzy quantities anyone can name

Principle P10 asks that notions like "too often", "close", "angry" or "wanted" be first-class, so that classic game systems emerge from principles instead of features (P9). The mechanism is one generic thing, the **gauge**:

```
gauge { id, label, value 0..1, author, layer, scope
        rises:  [ { on: event pattern, by } ]     // what feeds it
        fades:  { per_minute }                     // how it decays
        words:  { low, medium, high }              // the vocabulary principles use
}
```

A creator (or a player, through a commitment) names a gauge in words and says what feeds it. Hard statements can test it (`when heat is high -> …`, thresholds from `words`); soft statements mention it and the models receive its current value and word (`~ when heat is high, the police take an interest`). Reputation, suspicion, trust, fatigue, a wanted level, disturbance near an animal: all are gauges plus principles. The engine knows none of these names.

**Default permissive (P8).** The validator's order is: accept; else repair toward what was asked; reject only when a `!!` statement or a physical bound forbids it, and say which.

### Vocabulary (closed, typed)

`place` (terrain, light, weather), `station` (a named viewpoint: position, heading, what is within reach; `go` moves between adjacent stations as a transition), `thing` (shapes, materials, mass), `body` (move, look, posture, hands, effort), `sound` (recipes, cues), `speech` (line, language, tone), `fact` (subject, predicate, value, certainty), `clock`, `camera`. The existing engine vocabulary (fiche de lieu, formes, matières, bruitages, actions du porteur) is the starting set.

### Story pack

A folder a creator can author, version and share (collaboration v0 is Git: packs are files, contributions are pull requests; provenance is kept at runtime).

```
stories/<pack-id>/
  pack.json          // title, languages, authors, layers, patterns used
  place.json         // the world description
  characters/*.pdl   // light or strong sheets, PDL source
  patterns/*.pdl     // pattern instances (bound to this story)
  rules/*.pdl        // creator rules and principles, PDL source
  beats.json         // the three or four beats and the families of endings
  lines/<lang>.json  // fallback lines per language
  tests/requests.json// the free-request bench for this story
  build/             // compiled machine form (JSON), generated
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
