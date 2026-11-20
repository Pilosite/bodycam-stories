# PDL v0 — specification

Status: draft for review (contract). Implements pillars 1, 2, 3 and 8 of `docs/architecture.md`. Code: `core/`. Tests: `tests/core-*.test.mjs`.

PDL has three written forms of one thing:

| Form | Who writes it | Authoritative for | Section |
|---|---|---|---|
| **Source** (`*.pdl`) | creators, assistants, story packs | authoring: principles with a strength, explicit rules | §2 |
| **JSON** (canonical) | the code | the machine: validation, execution, journal, replay | §3 to §9 |
| **Tokens** | models during play | the wire between models and the core: compact, line-oriented | §10 |

The JSON form is the canonical form. Tokens round-trip to it exactly. Source compiles to it (some statements by code, some by a model at pack build time, see §2.7).

## Contents

1. Principles of the language (below)
2. PDL source: one text, a spectrum from soft to hard
3. The transaction envelope and the canonical form
4. Horizons and lifetimes
5. The world the core reasons about (stations, body, things, place, camera, clock, facts, rules, gauges, commitments)
6. The closed vocabulary: kinds and bodies
7. Rules: events, conditions, effects, limits, loop guards
8. Validation and repair
9. Ports, three clocks, session, journal, replay, determinism
10. The token form
11. Ten worked examples: « Louis's Round »
12. Mapping to the existing engine
13. Reserved, deviations, open questions

## 1. Principles of the language

- **One channel** (P16, ADR 0001). Nothing changes the world except a transaction that went through `validate`. The engine receives executor calls made by the session from accepted transactions, never anything else.
- **Closed, typed, extended by data.** Kinds, ops, fields, events and conditions are fixed by this spec (`core/vocab.js`). Values a story needs (sound cues, line ids, things, stations, materials, gauges) come from the pack and the engine's data files; adding one is data, never code.
- **Permissive by default** (P8). The validator accepts; else repairs toward what the player asked; rejects only for a vocabulary or physical bound or an absolute principle, and always says which.
- **Deterministic execution.** Same journal and same seed give the same world state (hash). Models decide; code validates, executes and replays.
- **Everything has an author.** Every transaction, fact, rule, principle and gauge keeps author, layer and the id of the transaction that made it.
- **Hexagonal** (P21). `core/` imports nothing from the engine, the DOM, the models, the input or storage; it reaches them through four ports (§9.1).
- **Three clocks** (P20). `now`, `scene` and `story` loops with their own latency budgets, talking only through transactions and events; a slower loop adds to, amends or cancels what a faster one did, never makes it wait (§9.3).

---

## 2. PDL source: one text, a spectrum from soft to hard

A source file (`*.pdl`, UTF-8) holds **statements**, each with a **strength**. The grammar below is the one the story pack and the pattern library are written in (`stories/louis-round/`, `patterns/`): the pack's de facto draft is adopted, with the differences listed in §2.10. `core/source.js` parses it (`parseSource`, `serializeSource`, `compilePack`); `tools/pack-check.mjs` checks references across a pack.

### 2.1 Lines

```
file        := header meta* (section | statement | comment | blank)*
header      := '# ' doc-id [ ' — ' title ]                 first content line (also '–' or '-')
meta        := '@' key SP value ( SP SP '@' key SP value )*  several on one line; before the first section
section     := '## ' name                                    groups statements (identity, voice, rules, examples…)
comment     := '//' anything
statement   := body [ SP '{' id '}' ]                        the id ends the line
body        := '!!' SP text                                  absolute
             | '!' SP text                                   hard (prose)
             | '~' [weight] SP text                          tendency, weight 0..1
             | '?' SP question [ ' -- ' note ]               open; the note guides the model (required)
             | '>' SP example                                example
             | 'x' SP example ' | why: ' text                counter-example (the why is required)
             | rule                                          hard, explicit (§2.4)
             | 'gauge' SP gauge                              a gauge (§2.5)
             | ('role'|'need'|'param'|'bind'|'set'|'hint'|'variation') SP text     patterns (§2.6)
example     := [ '[' context ']' SP ] lang ':' SP text ( ' | ' lang ':' SP text )*
id          := [A-Za-z0-9_.-]+
```

A statement without `{id}` gets `<doc-id>.<section>.<n>` (stable while the file's order does not change); ids are required for anything another file or a rule refers to.

### 2.2 Metadata

| Key | Values | Meaning |
|---|---|---|
| `@id` | id | the document (the header carries it too) |
| `@kind` | `character`, `rules`, `principles`, `facts`, `pattern`, `pattern-instance` | what the file is |
| `@layer` | id | collaboration layer; must match the layer that lists the file in `pack.json` |
| `@author` | creator id | default: the layer's author |
| `@lang` | language code | of the prose (`fr` for Sam's voice examples, `en` for rules) |
| `@scope` | `story`, `place`, `scene`, `character` | `character` means `character:<doc-id>` |
| `@horizon` | `scene`, `story` | of what the statements compile to |
| `@strength`, `@name`, `@presence` | character files | `strong`/`light`/`role`, a light character's name, `absent` |
| `@pattern` | pattern id | in a pattern instance |

### 2.3 Strengths

| Mark | Strength | `form` | Enforced by | Compiles to |
|---|---|---|---|---|
| `!!` | `absolute` | `prose` | the validator | a **constraint** (§8.4), written by a model at pack build, approved by the creator |
| `!! never …` | `absolute` | `explicit` | the validator | a constraint, compiled by code (§2.4) |
| `!` | `hard` | `prose` | code | a **rule** (§7), written by a model at pack build, approved by the creator |
| `when … -> …` | `hard` | `explicit` | code | a rule, compiled by code (§2.4) |
| `~` / `~w` | `tendency`, weight (none = unweighted) | `prose` | models, in context; audited | stays a principle |
| `?` | `open` | `prose` | models decide, guided by the note | stays a principle |
| `>` / `x` | `example` / `counter` | — | calibrate the document's soft statements; double as audit cases | stays a principle (context, lines per language, why) |
| `gauge` | `gauge` | `explicit` | code | a gauge (§5.6) |

In a `facts` file, `!!` is canon nothing may contradict, `!` a fact that is true and can be revealed (`reveal(f.x)`), `?` left open on purpose.

### 2.4 Explicit rules and absolutes: the call grammar

```
rule     := 'when' SP call [SP limit]* [SP 'if' SP cond (SP 'and' SP cond)*] SP '->' SP call (',' SP call)*
limit    := 'once' | 'max' SP int | 'cooldown' SP int 's'          (default: max 1, cooldown 0)
cond     := ['not' SP] call
call     := name [ '(' arg (',' SP? arg)* ')' ]                     args are ids, numbers or "quoted text"
absolute := '!!' SP 'never' SP call [SP 'if' SP cond (SP 'and' SP cond)*]
```

Every name compiles to the canonical JSON of §6 and §7 (`compileEvent`, `compileCond`, `compileAction`). A bare id argument that names a thing of `place.json` becomes `thing:<id>`, otherwise `station:<id>`.

| Events (`when …`) | Canonical |
|---|---|
| `session.start` | `session.started` |
| `station.entered(s)`, `station.left(s)` | same event, `match { id: s }` |
| `station.dwell(s, n)` | `clock.tick`, `match { station: s, dwell_s: { ge: n } }` |
| `clock.below(c, x)` | the clock's change event: `battery` → `camera.changed`, `match { battery: { lt: x } }` (`le` when x = 0) |
| `clock.every(n)` | `clock.tick`, `t ≥ n`, cooldown n, max 20 unless given |
| `time.elapsed(n)` | `clock.tick`, `match { t: { ge: n } }` |
| `look.at(x[, n])` | `look.at`, `match { target: thing:x, s: { ge: n } }` |
| `said.matches(class)`, `said.loud` | `intent.heard`, `match { class }` / `{ loud: true }` (what the player said, classified by the translation tier) |
| `voice.silent(n)` | `clock.tick`, `match { silent_s: { ge: n } }` |
| `beat.enter(b)` | `beat.entered`, `match { id: b }` |
| `fact.established(f)` | `fact.added`, `match { subject: f, predicate: established }` |
| `sound(cue)` | `sound.played`, `match { cue }` |
| `gauge(g[, word])` | `gauge.changed`, `match { id: g, word }` |

| Conditions (`if …`) | Canonical |
|---|---|
| `fact(f)` | `{ fact: { subject: f, predicate: established } }` |
| `beat(b)`, `at(s)`, `scene(id)` | `{ beat: { id } }`, `{ station: { id } }`, `{ scene: { id } }` |
| `within_reach(x)` | `{ reach: { target: thing:x } }` |
| `ending.any`, `ending(e)` | `{ ending: {} }`, `{ ending: { id } }` |
| `clock.below(c, x)` | `{ state: { path: camera.battery, lt: x } }` |
| `promised(class)` | `{ promised: { class } }`: a commitment of that class is accepted, amended or due |
| `gauge(g, word)` | `{ gauge: { id, word } }` |
| `near(a, b, m)` | `{ near: { a, b, within_m } }` |
| `not c` | `{ not: c }` |

| Actions (`-> …`) | Canonical template (horizon) |
|---|---|
| `say(line)` | act `say { ref }` (now) |
| `reveal(f)` | fact `{ subject: f, predicate: established, value: true }` (story) |
| `beat(b)`, `ending(e)` | effect `beat.set` / `story.end { id }` (story) |
| `go(s)` | act `go { to: station:s }` (now) |
| `sound(cue[, at])` | effect `sound.play { cue, at? }` (now) |
| `light.raise(n)` | effect `light.raise { degrees }` (story) |
| `image.degrade(x)`, `camera.off` | effect `camera.set { degrade }` / `{ off: true }` (story) |
| `speech.volume(level)`, `speech.shorten(x)` | effect `speech.set { volume }` (scene) / `{ shorten }` (story) |
| `body.posture(h)`, `body.stop` | act `posture { height }` / `stop` (now) |
| `fact(s, p, v)` | fact `{ subject, predicate, value }` (story) |
| any op of §6 | that op, the argument filling its primary field (`stop()`, `posture(0.5)`, `sound.play(jay.alarm)`) |

The pack's examples: `when station.entered(approach) once -> sound(jay.alarm), reveal(f.jay-heard), say(jay.alarm) {r.jay-first}`; `when clock.below(battery, 0.10) once -> say(battery.critical), image.degrade(0.35), speech.shorten(0.5)` (from the `ticking-clock` pattern). An absolute in the explicit form: `!! never go(hide) if not scene(platiere) {sam.hide-early}` rejects any `act go` to the hide outside that scene.

### 2.5 Gauges

```
gauge := 'gauge' SP id SP '"' label '"' ':' SP clause (';' SP clause)* [SP '{' id '}']
clause:= 'rises' SP event-call SP 'by' SP number [SP 'if' SP cond (SP 'and' SP cond)*]
       | 'fades' SP number '/min'
       | 'words' SP number SP number            thresholds of medium and high (default 0.34 0.67)
```

`gauge disturbance "how much the animals near the hide have been disturbed": rises sound(branch_snap) by 0.5; rises said.loud by 0.3 if near(body, hide, 30); fades 0.1/min; words 0.3 0.6`. Rules test it by word (`when gauge(disturbance, high) -> …`, `if gauge(disturbance, low)`); a soft statement that mentions it (by id or label) gets its value and word in every model call's principles-in-scope record (§9.2).

### 2.6 Patterns

A pattern (`patterns/<id>.pdl`, `@kind pattern`) declares `role name[*] : type : description` (`*`: several bindings), `need name : type : description`, `param name = value : description`, its principles and rules with `$role`, `$role.attr` and `$param`, `hint` and `variation` lines. An instance (`@kind pattern-instance @pattern <id>`) binds roles (`bind role = value [attr=value …]`) and overrides params (`set param = value`). Instantiation substitutes, repeats a statement once per binding of a many-role it mentions, and ids become `<instance>.<statement-id>[.<n>]`. Principles and rules from an instance carry `pattern` and `instance` in their provenance.

### 2.7 Compilation, layers and approval

`compilePack(pack, library)` (pure; the store adapter reads the files): parses every file of every layer in `pack.json` order, instantiates patterns, compiles explicit rules, absolutes and gauges by code, and merges by id: **the same id in a later layer replaces the earlier one and records it in `overrides`** (layer, author, source). Prose `!` and `!!` become stubs `compiled.status = "to_compile"`; at pack build a model proposes a rule or constraint (`attachCompiled`, validated like any rule: `"proposed"`), and a creator approves it (`approve`: `"approved"`, `approved_by`). Only `compiled` and `approved` forms are enforced; a stub is reported, never half-enforced. `loadPrinciples` installs constraints and gauges and submits the compiled rules as creator transactions carrying `principle: <id>`.

### 2.8 The principle record

```
principle {
  id, strength: absolute | hard | tendency | open | example | counter | gauge, form: prose | explicit,
  weight?, text?, note?, context?, lines? { <lang>: text }, why?
  scope: story | place | scene | scene:<id> | character:<id>, horizon: scene | story, section, lang
  author { kind, id }, layer, pack, doc, doc_kind, source { file, line }, overrides?, pattern?, instance?
  compiled?: { kind: rule | constraint | gauge, status: to_compile | proposed | compiled | approved | error, body?, by?, approved_by?, error? }
}
```

**In scope** for a model call: tendencies and open questions whose scope is `story`, `place`, `scene`, the current `scene:<id>`, or the speaking `character:<id>`.

### 2.9 Audit

The judging is a model call made elsewhere (`ModelPort.decide`); the core defines the record and aggregates.

```
judge({ principle, entries, examples }) → [ audit ]
audit { type: "audit", principle, ref_seq, relevant: bool, respected: bool | null, note?, judge { kind, id, tier? } }
```

`ref_seq` is the journal entry the verdict is about. `auditSummary(journal)` returns per principle `{ relevant, respected, broken, rate, breaks: [ref_seq] }`.

### 2.10 Differences from the pack's draft grammar, and how they were resolved

| # | Point | Pack draft (`tools/pack-check.mjs`) | Canonical (this spec, `core/source.js`) | Why |
|---|---|---|---|---|
| 1 | Line grammar, header, `@meta`, `## sections`, `{id}` at end, `? … -- note`, `> [ctx] fr: … \| en: …`, `x … \| why:` | as written | **adopted unchanged** | readable, already used by ~200 statements; my first draft (`id:` prefix, `@scope` directives mid-file, indented examples) dropped |
| 2 | Rule surface `when ev(args) [limits] [if …] -> act(args)`, limits before `if` | as written | **adopted unchanged** | one grammar for creators and models |
| 3 | Event, condition and action names (`station.dwell`, `said.matches`, `reveal`, `speech.volume`…) | its own closed tables, not tied to PDL | **kept as the source vocabulary**, each compiled to a canonical PDL event, condition or template (§2.4 tables); the core gained what they needed: `look.at`, `beat.entered`, `story.ended`, `session.started`, `speech.changed` events; `beat`, `reach`, `ending`, `promised` conditions; `beat.set`, `story.end`, `light.raise`, `speech.set`, `camera.set off` effects; `class` and `loud` on intents; `station`, `dwell_s`, `silent_s` on `clock.tick` | the source stays the creators' words; the machine form stays one closed vocabulary |
| 4 | My shorthand `camera.battery < 10%` and `x = y` tests | — | **dropped** in favour of calls (`clock.below(battery, 0.10)`) | one way to write it |
| 5 | Default limits | none (fires every time) | **max 1, cooldown 0** unless `max N` / `cooldown` | P8-safe default: a rule that should repeat says so; the pack's rules all say `once` or `cooldown` where it matters |
| 6 | Facts revealed by id (`reveal(f.x)`, `fact(f.x)`) | statement ids | a fact `{ subject: f.x, predicate: established, value: true }` | facts of the pack and facts written in play share one store |
| 7 | Commitment classes (`promised(silence)`) | `pack.json commit_classes` | `intent.class` of a `commit` intent becomes the commitment's `class` | the translation tier classifies; the condition reads the commitment |
| 8 | Stations (`stations.json`: `along_m`, `side_m`, `connects { to, cost_s, via?, establishes? }`, `within_reach`, `beat`, `posture`) | data | read by `sceneOf`: position `[side_m, along_m]`, adjacency from `connects`, reach = the `within_reach` list, a transition drains `cost_s` of battery and reveals `establishes`, entering a station enters its beat, `go` takes `via` | v1 is station-based (ADR 0003) |
| 9 | Line bank (`lines/<lang>.json`, variants, `{ speaker, text }`) | data | `say { ref }` draws one variant with the seeded generator (same index in every language) | deterministic replay |
| 10 | Absolutes in prose only | — | **added** the explicit `!! never call [if …]` form, compiled by code | lets a creator write an absolute that holds today, without a compile step |
| 11 | Gauges | — | **added** `gauge id "label": …` (§2.5) | architecture "Gauges" (P10) |
| 12 | Counter-example why, open-question note | required | required (parse error otherwise) | as the pack |
| 13 | Parser | `tools/pack-check.mjs` has its own | `core/source.js` is the reference; both parse the pack identically today | follow-up: pack-check should import the parser from core (not done: outside this lot) |

---

## 3. The transaction envelope and the canonical form

```
tx {
  v: 0                                   // PDL version
  id, t                                  // assigned by the session: id = journal seq, t = session clock (s)
  author { kind: player | creator | model | engine, id, tier?: reflex | translate | stage | background, layer? }
  horizon: now | scene | story
  kind: intent | act | effect | fact | rule | cancel
  body                                   // typed by kind (and op), §6
  cause? { tx?, rule?, commit? }         // the journal entry, rule and commitment that produced it
  ttl?                                   // seconds; now and scene only
  status: proposed | accepted | repaired | rejected   // set by validation
  repair?: [ { path, action, from?, to?, why } ]     // what the validator changed
  reasons?: [ { path, why, value? } ]                // why it was rejected
}
```

**3.1 Who may submit what.** player: `intent` only, plus the `fact` and `rule` of a commitment (§8.6). model: everything but direct engine control. creator: `effect`, `fact`, `rule`, `cancel`. engine: everything. A transaction fired by a rule has author `{ kind: engine, id: rules }` and `cause.rule`.

**3.2 Ids.** Transaction ids are journal sequence numbers. Thing, rule, gauge, principle and commitment ids follow `[a-z][a-z0-9_.-]{0,59}`. References to the world use `body`, `thing:<id>`, `station:<id>`, `dir:<sun|north|south|east|west|back|left|right|up|down>`.

**3.3 Canonical form.** Keys in a fixed order (envelope order; then `op`; then the schema order of §6; keys without a schema sorted); numbers rounded to 4 decimals (fields with a declared precision use it; integers stay integers); strings NFC; absent optional fields omitted, never `null`. Both encodings are compared on `canonical(tx)` (`core/pdl.js`). Validation output is canonical.

## 4. Horizons and lifetimes

| Horizon | Kinds | Lifetime of what it creates | `ttl` |
|---|---|---|---|
| `now` | intent, act, effect, cancel | an act is instantaneous; what a `now` effect creates (a thing, a light change) lives `ttl` seconds | default 8, max 60 (effects) |
| `scene` | effect, fact, rule | until the scene changes (`effect scene.start`), or `ttl` if given | optional, max 3600 |
| `story` | effect, fact, rule | the whole story | none (a given `ttl` is dropped, recorded as a repair) |

A transaction with a horizon its kind does not admit is repaired to the kind's first horizon (act at `story` → `now`). Expiry is checked on every `advance` and at each scene change; it emits `thing.removed` (reason `expired`), and place/camera values set by an expired overlay revert to the underlying value (§5.4). Story effects on place/camera change the base value; `battery` is physical and never an overlay.

## 5. The world the core reasons about

`core/world.js`. Pure data, hashed for replay (§9.4).

**5.1 Stations** (v1 is station-based, ADR 0003). `station { id, pos [x, z] m, heading deg, reach_m, next [ids], edges? [{ to, cost_s, via?, establishes? }], within? [thing ids], beat?, posture? }`, read from the pack's `stations.json` (§2.10 row 8). Adjacency is the union of both directions of `next` (from `edges` when given). A transition drains `cost_s` of battery, reveals the edge's `establishes` fact, sets the arrival posture, and entering a station of another beat emits `beat.entered`. The body is always at a station (`body.station`); `go` moves to an adjacent one as a transition the engine plays. Free movement (`move`, `approach`, `frame`, `climb`, `descend`, `search`) is **reserved for v2**: those ops exist in the engine today and are rejected with `reserved_v2`.

**5.2 Body.** `{ station, yaw, pitch, height (share of standing eye height), held [thing ids] }`. The engine owns the body: the core mirrors what the executor reports (`station.entered`, `body.pose`, `body.held`).

**5.3 Things.** `{ id, name, shapes, mass_kg, pos, size_m, fixed, horizon, expires, scene, tx, author }`. Pack things (`place.json objets`) are `fixed` (story horizon). A thing is **within reach** when it is in the station's `within` list (when the station has one), else when its distance to the station is at most `reach_m + size_m / 2`; a held thing is always within reach.

**5.4 Place and camera.** `place { fog, lamp, sun_height, weather }`, `camera { battery, drain_per_s, degrade, shake }`. Effective value = base, overridden by live overlays (now/scene effects) in order. The battery drains `drain_per_s` per second on `advance` and emits `camera.changed`.

**5.5 Clock, scene, story.** `clock { t, scene, scene_t0, station_t0, voice_t }` (dwell and silence are derived from the last two); `story { beat, ending, beats, endings }`; `body.speech { volume, shorten }`; `camera.off`. Time only moves by `advance(dt)` (an input); nothing reads a wall clock.

**5.6 Gauges** (P10). `gauge { id, label, value 0..1, rises [ { on: { event, match }, by, if? } ], fades { per_minute }, words { medium, high }, author, layer }`. On every event, each gauge whose `rises` match (and whose `if` holds) gains `by` (clamped to 1) and emits `gauge.changed { id, value, word, was }`; a gauge never rises on its own `gauge.changed`. On `advance` it fades; `gauge.changed` is emitted when its word changes. The word is `low` below `medium`, `high` from `high`. The engine knows no gauge name.

**5.7 Facts, rules, constraints, principles, commitments.** Facts `{ subject, predicate, value, certainty, source?, commit?, tx, t, author, horizon, scene }` (newest live one answers a query); rules §7; constraints §8.4; principles §2.8; commitments §8.6.

## 6. The closed vocabulary: kinds and bodies

Bounds are inclusive. A number outside them is clamped (repair). "intent" names the field of the player's intent a missing value is completed from.

### 6.1 `intent` (horizon now)

| Field | Type | |
|---|---|---|
| `text` | text ≤ 300, required | the player's words |
| `lang` | id, required | repaired to the story's first language if not one of `langs` |
| `verb` | `look turn posture touch take shape make wait stop say go commit ask other`, required | |
| `target` | ref (thing, dir, station, body) | |
| `params` | `{ degrees, height, seconds, size_m 0.01..50, mass_kg, what }` | what the player quantified |
| `class` | id | the pack's intent or commit class (`shout`, `bare_order`, `jay`…) as the translation tier classified it |
| `loud` | bool | the player spoke loudly |
| `condition`, `behaviour` | text ≤ 200 | required when `verb = commit` (§8.6) |
| `commit` | id | the commitment's id (default `c<seq>`) |

### 6.2 `act` (horizon now): what the character does, in place

| op | Fields | Engine today |
|---|---|---|
| `go` | `to` station ref, required (intent: target); `via` id (which edge, when two lead there) | transition (new in v1) |
| `look` | one of `target` (thing, dir, station), `pitch` −60..75, `yaw` −180..180 | `viser`, `regarder` |
| `turn` | `degrees` −180..180, required | `tourner` |
| `posture` | `height` 0.35..1, required | `posture` |
| `touch` | `target` thing within reach, required | `cadrer` sur place + `posture` |
| `take` | `target` thing within reach, required | ramassage (part of `chercher`) |
| `shape` | `target` thing within reach, required | `faconner` |
| `wait` | `seconds` 0..5 (default 1) | `attendre` |
| `stop` | — | « arrête-toi » (`stop`) |
| `say` | one of `line` `{ <lang>: text ≤ 300 }` or `ref` (a line id of the pack), `tone` (`flat dry warm low tense amused whisper`, default flat) | pensée + voix |

### 6.3 `effect`: what the world does

| op | Fields | Engine today |
|---|---|---|
| `thing.place` | `id` required; `name` ≤ 60 required; `shapes` required (1..12, §6.4); `mass_kg` 0.001..500; `at` (thing, body; default body); `offset` [right, ahead] m −8..8, default [0, 1], within the station's reach | accessoiriste `objet creer` |
| `thing.change` | `target` required; one of `scale` 0.2..4, `offset`, `glow`, `wobble` 0..1 | `objet modifier` |
| `thing.remove` | `target` required | `objet retirer` |
| `sound.play` | `cue` (a cue of the pack, required), `at` (thing, body, station; default body), `gain` 0..0.9 (default 0.5) | `jouerBruit` with a recipe |
| `place.set` | one of `fog` 0..0.06, `lamp`, `sun_height` −20..90, `weather` (`clear`, `veil`) | `patchScene` (ambiance) |
| `camera.set` | one of `battery`, `degrade`, `shake` (0..1), `off` | capteur (new) |
| `light.raise` | `degrees` −30..30, required (relative sun height) | `patchScene` soleil |
| `speech.set` | one of `volume` (`whisper`, `low`, `normal`), `shorten` 0..1 | voice (new) |
| `scene.start` | `id` required | — (new) |
| `beat.set` | `id` required | — (story state) |
| `story.end` | `id` (an ending family) required | écran de fin |

### 6.4 Shapes (the engine's vocabulary, English keys)

`{ shape: box | ball | cylinder | cone | capsule | roof (boite, boule, cylindre, cone, capsule, toit), p [x,y,z] −6..6, size [x,y,z] 0.01..8, color #rrggbb, material (a recipe of src/matieres.json), yaw −360..360, tilt [a,b] −90..90, round 0..0.3, smooth 0..0.5 }`. An unknown material is dropped (engine default); an invalid colour is replaced by `#777777`.

### 6.5 `fact` (horizon story or scene)

`{ subject id, predicate id, value (text ≤ 120 | number | bool), certainty 0..1, source? text ≤ 120, commit? }`, all but `certainty`, `source`, `commit` required. Default certainty: model 0.7, player 0.9, creator and engine 1.

### 6.6 `rule` (horizon scene or story)

`{ id, when { event, match? }, if? [cond ≤ 4], then [template 1..4], limits { max_fires 1..20 (default 1), cooldown_s 0..3600 (default 0) }, strength (hard | tendency, default hard), commit?, principle? }`. A template is `{ horizon, kind: act | effect | fact, body, ttl? }`; string fields may be `$event.<field>`, replaced at firing. See §7.

### 6.7 `cancel` (horizon now)

`{ target: rule:<id> | tx:<seq> | commit:<id>, reason? }`. Cancels a rule, the thing or fact a transaction created, or a commitment (then `broken`). Allowed to the target's author, a creator, or the engine.

## 7. Rules

### 7.1 Events (and the fields `match` may test)

| Event | Fields | Emitted by |
|---|---|---|
| `session.started` | — | `start()` |
| `intent.heard` | verb, target, text, class, loud | intent |
| `look.at` | target, s (seconds the gaze rests) | act look (s = 0); engine observation |
| `act.done` | op, target, to | every act |
| `said` | text, lang, ref | act say |
| `sound.played` | cue, at | effect sound.play |
| `thing.placed` / `thing.changed` / `thing.removed` | id, name / id / id, reason | effects, expiry |
| `fact.added` | subject, predicate, value, certainty | fact |
| `camera.changed` | battery, degrade, shake | camera.set, battery drain |
| `place.changed` | fog, lamp, sun_height, weather | place.set, overlay expiry |
| `station.entered` / `station.left` | id | executor, on go |
| `scene.started` | id | scene.start |
| `clock.tick` | t, scene_t, station, dwell_s, silent_s | advance |
| `beat.entered` / `story.ended` | id | station of another beat, beat.set / story.end |
| `speech.changed` | volume, shorten | speech.set |
| `commitment.due` | commit, rule | a tendency rule firing |
| `gauge.changed` | id, value, word | gauges |

Engine observations `body.pose`, `body.held` and bookkeeping events (`rule.registered`, `fact.expired`, `rule.expired`, `cancelled`) are journaled but cannot be matched.

**Match.** `{ field: value }` is equality; `{ field: { eq | ne | lt | le | gt | ge | in | contains: x } }` all must hold. A key not listed for the event is rejected.

### 7.2 Conditions (`if`, all must hold)

`{ near: { a, b, within_m } }` (refs; body = its station's position) · `{ fact: { subject, predicate, value?, min_certainty? } }` · `{ state: { path, eq|ne|lt|le|gt|ge } }` with path in `camera.battery camera.degrade camera.shake place.fog place.lamp place.sun_height clock.t clock.scene_t body.station body.height` · `{ scene: { id } }` · `{ station: { id } }` · `{ beat: { id } }` · `{ reach: { target } }` · `{ ending: { id? } }` · `{ promised: { class } }` · `{ gauge: { id, word? , gt?, lt? } }` · `{ not: cond }`.

### 7.3 Firing

For each event, in emission order: live rules whose `when` matches, in registration order (then id). A rule fires when, in this order: `fires < max_fires`; `t − last_fire ≥ cooldown_s`; it is not already in the event's causal chain (**cycle**); the chain is shorter than `rule_depth_max` = 3 (**depth**); its conditions hold. A firing is journaled (`type: rule, status: fired`) and its templates are instantiated and queued as transactions with `cause { tx: <the firing entry>, rule, commit? }`, `depth + 1`, chain + rule id. They go through validation like any transaction. Processing is breadth-first. Blocked firings (other than a false condition) are journaled with their reason.

A `scene` rule only fires in the scene it was registered in. A `tendency` rule does not execute its templates: it emits `commitment.due` (§8.6).

### 7.4 Loops are forbidden

1. **Statically**, at validation: a rule whose templates emit an event that certainly matches its own `when` (same event, all equality tests satisfied) is rejected `self_trigger`.
2. **At run time**: a rule never fires twice in one causal chain (`cycle`), and chains stop at depth 3 (`depth`). `max_fires` defaults to 1.

## 8. Validation and repair

`validate(tx, world, budget) → { status, tx, repair, reasons }` (`core/pdl.js`). The player's intent (the transaction's `cause.tx`, else the newest intent of the last 15 s) is the reference for every repair.

### 8.1 Order

1. Envelope: unknown key → `unknown_field`; `v` ≠ 0 → `unknown_version`; unknown kind → `unknown_kind`; bad author → `bad_author`; authority (§3.1) → `not_allowed`.
2. Horizon and ttl (§4): repaired.
3. Body, field by field (closed: an unknown field is rejected; a reserved op `reserved_v2`; an unknown op `unknown_op`).
4. Per-kind checks (§8.3).
5. Absolute constraints (§8.4).

### 8.2 Repairs (always recorded)

| action | When | Example |
|---|---|---|
| `complete` | a required field is missing and the intent has it | `act look` without target ← the intent's target |
| `replace` | a ref is unknown, forbidden or out of reach and the intent names a valid one; an id is not normalised; an enum with a default gets an unknown value; mass far from the requested mass | `touch thing:hide` (out of reach) → `thing:cairn` |
| `clamp` | a number or vector outside its bounds; an offset beyond the station's reach | `turn 400` → 180 |
| `shrink` / `grow` | a thing's span differs from the size the player asked (±25 %), or exceeds `size_max_m` (3 m) without a request | a 1.8 m "knee-high cairn" → 0.5 m |
| `truncate` | text, line, shapes, conditions or templates over their maximum | a 14-shape thing → 12 |
| `step` | `go` to a station that is not adjacent | path → platiere becomes path → pines |
| `horizon` | a horizon the kind does not admit | act at story → now |
| `drop` | an unknown material, a ttl on a story transaction | |
| `coerce` | a number written as text | `"2"` → 2 |
| `evict` | over the thing or shape budget: the oldest non-story things make room (the engine's recycling) | |

### 8.3 Rejections (`reasons[].why`)

`unknown_field`, `unknown_kind`, `unknown_op`, `reserved_v2`, `unknown_value`, `unknown_event`, `unknown_operator`, `unknown_condition`, `unknown_cue`, `unknown_line`, `unknown_language`, `unknown_target`, `forbidden_target`, `out_of_reach`, `wrong_target_class`, `bad_ref`, `missing`, `missing_one_of`, `not_a_number` (and other type errors), `already_there`, `unreachable_station`, `over_budget`, `self_trigger`, `id_taken`, `not_owner`, `not_allowed`, `constraint` (value: the principle id), `unknown_commitment`, `bad_transition`, `commit_needs_condition_and_behaviour`. Every rejection names the field path and the bound, vocabulary entry or principle that caused it (P8).

### 8.4 Absolute constraints

`constraint { id, forbid { kind, op?, fields? }, if? [cond], author, layer }`, compiled from `!!` (§2.4, §2.7). A transaction matching `forbid` (same kind, same op, every given field equal) while all `if` conditions hold is rejected with `{ why: constraint, value: <id> }`, whoever wrote it, including rule-fired transactions.

### 8.5 Budget

| Bound | Default | Source |
|---|---|---|
| things alive (not fixed) | 8 | engine `OBJETS_MOTEUR` |
| shapes alive | 64 | engine `FORMES_MOTEUR` |
| shapes per thing | 12 | engine `OBJET_FORMES_MAX` |
| span without request / with request | 3 m / 8 m | |
| line per language | 300 characters | engine `nettoyerParole` |
| rules alive per horizon | scene 12, story 24 | |
| conditions / templates per rule | 4 / 4 | |
| rule chain depth | 3 | |

### 8.6 Commitments (pillar 9, P6)

1. The translation tier emits `intent { verb: commit, class?, condition, behaviour, commit: <id> }` → commitment `proposed` (its `class` is what `promised(class)` tests).
2. The character answers in character (`act say`), then a **fact** authored by the player, with `commit { id, party: <character>, status: accepted | amended | refused, strength: hard | tendency }` (the promise and its wording).
3. If accepted or amended, a **rule** authored by the player with `commit: <id>`, horizon scene or story, `strength` as promised.
4. When the rule fires: the commitment becomes `due`. **hard**: the templates run (linked by `cause.commit`) and the session records an engine fact `kept` (or `broke` if one was rejected) with `commit.status`. **tendency**: `commitment.due` is emitted and a model tier resolves it by submitting acts and a fact with status `kept` or `broken` (cause: the firing).
5. Lifecycle (validated): `proposed → accepted | amended | refused`; `accepted | amended → due → kept | broken`; a `cancel commit:<id>` breaks it.

## 9. Ports, three clocks, session, journal, replay

### 9.1 Ports (P21, `core/ports.js`)

| Port | Interface | Adapters |
|---|---|---|
| engine | the executor below | `core/paper-world.js` (tests); the page (M2, §12) |
| model | `embed(texts)`, `decide({ tier, question, options?, state? }) → { answer, p?, uncertain? }`, `generate({ tier, purpose, context }) → { tokens }` (ADR 0004; tiers are roles, models are configuration) | `core/canned-model.js` (tests); artifact and proxy adapters (later lot) |
| input | `subscribe(handler)`; events `{ kind: speech, text, lang, loud? }`, `{ kind: look, target, s }` | the page (later) |
| store | `readPack`, `readLibrary`, `appendJournal`, `readJournal` | `tools/pack-check.mjs` `loadPack` / `loadLibrary` (files) |

`missing(port, impl)` lists what an adapter lacks. Whatever a model returns goes through `validate`; the core never trusts a port.

### 9.2 The executor interface (`core/world.js`, `EXECUTOR`)

The engine implements: `go, look, turn, posture, touch, take, shape, wait, stop, say, placeThing, changeThing, removeThing, playSound, setPlace, setCamera, setSpeech, startScene, endStory`. Each call is `(args, ctx)` with `ctx { world (read-only), seq, seed, rng }` and returns events (`station.left/entered`, `body.pose`, `body.held`, …). Calls never change the core world; the session applies the reported events. Asynchronous observations come back through `session.observe(event)`, which is an input. `core/paper-world.js` implements it in memory; `tests/core-executor.contract.mjs` is the contract suite both implementations run.

### 9.3 Three clocks (P20, `core/clocks.js`, `LOOPS` in `core/session.js`)

| Loop | Budget (first visible effect) | Who | Job |
|---|---|---|---|
| `now` | 500 ms | reflex code, then `decide` at the translation tier | the intent and the immediate reaction |
| `scene` | 8 s | `generate` at the staging tier | the full reaction: lines, things, facts |
| `story` | 120 s, continuous | the background tier | rules, the frontier, arcs |

`createClocks({ session, model, clock })`: `hear(utterance)` runs the now loop (decide the intent, submit it; decide the reaction, submit it) and returns as soon as that is done; it opens a `scene` model call (journaled `status: pending`) whose answer lands later (`status: landed`, `ref_seq`) and is submitted with `cause { tx: <the call>, amends?: <a now transaction> }`. Nothing in the now loop awaits a slower loop. Every transaction entry records `loop`, `latency_ms`, `budget_ms` and `late`; a late present shows up in the journal as a defect. Rule-fired transactions inherit the loop of their cause.

### 9.4 The journal (`core/journal.js`)

JSON lines, English keys, append-only. Every entry has `seq`, `t`, `type`.

| type | Keys | Input (replayed) |
|---|---|---|
| `session` | v, seed, scene, budget | header |
| `tx` | loop, latency_ms, budget_ms, late, author, tier, horizon, kind, status, repair, reasons, cause, depth, body, ttl, timings, input, proposed | yes when `input: true` (the `proposed` form is re-submitted); rule-fired ones are derived |
| `event` | event, data, cause (seq) | no |
| `rule` | rule, status (fired, blocked), reason, event, cause, author, layer | no |
| `advance` | dt | yes |
| `observe` | event, data | yes |
| `principles` | records | yes |
| `model_call` | loop, status (done, pending, landed), ref_seq, tier, purpose, character, principles (ids of soft principles in scope), gauges ([{ id, value, word, mentioned_by }] for gauges those principles mention), latency_ms, timings | yes |
| `start` | — | yes (emits `session.started`) |
| `audit` | principle, ref_seq, relevant, respected, note, judge | yes |
| `hash` | hash | yes (re-computed) |

`timings` (`model_ms`, …) are wall-clock measurements: kept, never compared.

### 9.5 Session loop (`core/session.js`)

`submit(tx)` → id and time assigned → `validate` → journal → apply (core state + executor call) → events (journaled) → gauges → rules → their transactions queued, processed breadth-first through the same path. Other inputs: `start()`, `advance(dt)`, `observe(ev)`, `loadPrinciples(records)` (constraints and gauges installed; compiled rules submitted as creator transactions with `principle`), `modelCall({ tier, purpose, character, timings })`, `audit(records)`, `checkpoint()`.

### 9.6 Determinism and replay

The state hash is a 53-bit hash of the canonical JSON of the world (sorted keys, numbers to 1e-6). Randomness comes only from `rngFor(seed, seq)`. `replay(journal, executor, seed?, { edit })` re-runs the inputs in a fresh session and returns `{ session, hash, journal }`; with the same executor and seed it reproduces every entry and the hash. `edit(entry)` returns a replacement input (what-if: the creator edits a rule and replays). `diff(a, b)` compares entry by entry (timings ignored) and lists the rules fired on each side and the checkpoint hashes.

**Golden journals** (ADR 0007): `tests/golden/<name>.jsonl`, four journals: `p1-transactions`, `p2-horizons`, `p3-model-rule` (plus a gauge and an absolute from source), and `p8-louis-pack` (the real pack: two layers, pattern rules, a compiled absolute, the jay commitment made at the third station and kept at the fifth, battery clock, audit, loops). Written by `node tools/core-golden.mjs` from `tests/core-fixture.mjs`, replayed by `tests/core-golden.test.mjs`. A journal is JSON lines; the first line is the `session` header with the scene; inputs carry `input: true`.

## 10. The token form

For models: one transaction per line, compact, line-oriented, exact round trip to the canonical form (`core/tokens.js`).

```
tx        := head (SP field)* NL (SP SP cont NL)*
head      := ['#' int SP] ['@' number SP] author SP horizon SP kind ['.' op] [SP '^' cause] [SP '~' ttl]
author    := ('p' | 'c' | 'm' | 'e') ':' id ['/' tier] ['+' layer]       player, creator, model, engine
cause     := [int] ['/' rule-id] ['!' commit-id] ['=' amended-seq]
field     := key '=' value
key       := segment ('.' segment)*            dotted keys build nested objects
value     := number | 'true' | 'false' | 'null' | bare | json-string | json-array | json-object
bare      := [A-Za-z_$][A-Za-z0-9_:.\-/$]*
cont      := 'if' SP ['not' SP]* condition-kind (SP field)*            (rules only)
           | 'then' SP horizon SP kind ['.' op] [SP '~' ttl] (SP field)*
comment   := '//' anything                     on its own line, ignored
```

- Arrays, and objects inside arrays (shapes), are JSON literals without spaces outside strings.
- Key aliases (segment by segment, both directions): `target tg`, `certainty cert`, `subject subj`, `predicate pred`, `value val`, `when on`, `event ev`, `match m`, `limits lim`, `max_fires max`, `cooldown_s cd`, `within_m within`. The serializer always writes the alias; the parser accepts both.
- `status`, `repair`, `reasons` are journal metadata and are not written in tokens.
- A model may stream: each complete head line (with its continuation lines) is a transaction and can be validated as soon as the next head arrives.
- **Glyph display** (optional, never parsed): `display(tx)` prefixes the token line with a glyph per kind (◈ intent, ⇢ act, ∿ effect, ∴ fact, ↯ rule, ⊘ cancel), in the style of `src/pdl.js`.

## 11. Ten worked examples: « Louis's Round »

Sam walks her missing brother Louis's forest round wearing his bodycam; the player is the voice on the feed. The place is `tests/core-fixture.mjs` (`LOUIS`): six stations `trailhead → path → pines → platiere → hide-edge → hide`, things `pine-mark`, `pine-3`, `hide`, `jay-oak`, cues `jay_alarm`, `branch_snap`, `steps_leaves`, and a line bank in French and English (a simplified paper place; the real pack's stations are used by the golden `p8-louis-pack`). The examples run **in order in one session** starting with Sam at `path`; `tests/core-pdl.test.mjs` checks that each token block parses to the JSON beside it, serializes back to the same text, and gets the statuses in its `// expect` line.

**1. The player speaks (intent, now).** "Regarde la marque sur ce pin." The translation tier writes the intent.

```pdl-tx
// expect accepted
m:translator/translate now intent text="regarde la marque sur ce pin" lang=fr verb=look tg=thing:pine-mark
```
```json
[{"author":{"kind":"model","id":"translator","tier":"translate"},"horizon":"now","kind":"intent","body":{"text":"regarde la marque sur ce pin","lang":"fr","verb":"look","target":"thing:pine-mark"}}]
```

**2. She looks and answers (act, now).** The staging tier forgot the target: it is completed from the intent (`repair: complete`). She reads the mark better than we do.

```pdl-tx
// expect repaired accepted
m:stager/stage now act.look
m:stager/stage now act.say ref=mark_line tone=dry
```
```json
[{"author":{"kind":"model","id":"stager","tier":"stage"},"horizon":"now","kind":"act","body":{"op":"look"}},{"author":{"kind":"model","id":"stager","tier":"stage"},"horizon":"now","kind":"act","body":{"op":"say","ref":"mark_line","tone":"dry"}}]
```

**3. A story fact (fact, story).** "Louis marked sick trees in blue", with its certainty and source.

```pdl-tx
// expect accepted
m:stager/stage story fact subj=louis pred=marked_sick_trees val=blue cert=0.9 source="the blue mark on the pine"
```
```json
[{"author":{"kind":"model","id":"stager","tier":"stage"},"horizon":"story","kind":"fact","body":{"subject":"louis","predicate":"marked_sick_trees","value":"blue","certainty":0.9,"source":"the blue mark on the pine"}}]
```

**4. A jay alarm call (effect, now).** A sound cue of the pack, placed at the old oak; it gets the default ttl.

```pdl-tx
// expect accepted
e:page now effect.sound.play cue=jay_alarm at=thing:jay-oak gain=0.6
```
```json
[{"author":{"kind":"engine","id":"page"},"horizon":"now","kind":"effect","body":{"op":"sound.play","cue":"jay_alarm","at":"thing:jay-oak","gain":0.6}}]
```

**5. A scene rule written by the background tier (rule, scene).** "When a jay alarm call plays and Sam is within 20 m of the hide, she stops." Here (at `path`, 140 m away) it does not fire; at `hide-edge` it would, without any model call (golden p3).

```pdl-tx
// expect accepted
m:keeper/background scene rule id=jay.stop on.ev=sound.played on.m.cue=jay_alarm lim.max=1 lim.cd=0
  if near a=body b=thing:hide within=20
  then now act.stop
  then now act.say ref=jay_stop tone=whisper
```
```json
[{"author":{"kind":"model","id":"keeper","tier":"background"},"horizon":"scene","kind":"rule","body":{"id":"jay.stop","when":{"event":"sound.played","match":{"cue":"jay_alarm"}},"if":[{"near":{"a":"body","b":"thing:hide","within_m":20}}],"then":[{"horizon":"now","kind":"act","body":{"op":"stop"}},{"horizon":"now","kind":"act","body":{"op":"say","ref":"jay_stop","tone":"whisper"}}],"limits":{"max_fires":1,"cooldown_s":0}}}]
```

**6. A story rule from the creator (rule, story).** "When camera battery < 10 %, the image degrades and she says so once" (source: `when camera.battery < 10% once -> say(battery_low), image.degrade(0.3)`).

```pdl-tx
// expect accepted
c:toine+base story rule id=battery.low on.ev=camera.changed on.m.battery.lt=0.1
  then now act.say ref=battery_low
  then now effect.camera.set degrade=0.3
```
```json
[{"author":{"kind":"creator","id":"toine","layer":"base"},"horizon":"story","kind":"rule","body":{"id":"battery.low","when":{"event":"camera.changed","match":{"battery":{"lt":0.1}}},"then":[{"horizon":"now","kind":"act","body":{"op":"say","ref":"battery_low"}},{"horizon":"now","kind":"effect","body":{"op":"camera.set","degrade":0.3}}]}}]
```

**7. The fog thickens for this scene (effect, scene).** It reverts when the scene changes (golden p2).

```pdl-tx
// expect accepted
m:keeper/background scene effect.place.set fog=0.045
```
```json
[{"author":{"kind":"model","id":"keeper","tier":"background"},"horizon":"scene","kind":"effect","body":{"op":"place.set","fog":0.045}}]
```

**8. "Fais un petit cairn, à hauteur de genou" (repair: shrink).** The player asked for 0.5 m; the staging tier wrote a 1.4 m cairn. The request is the reference: the shapes are scaled to 0.5 m and the repair says why.

```pdl-tx
// expect accepted repaired
m:translator/translate now intent text="fais un petit cairn, à hauteur de genou" lang=fr verb=make params.size_m=0.5
m:stager/stage scene effect.thing.place id=cairn name="small cairn" shapes=[{"shape":"ball","p":[0,0.3,0],"size":[1.4,0.6,1.2],"material":"gres"},{"shape":"ball","p":[0,0.9,0],"size":[0.9,0.6,0.8],"material":"gres"}] mass_kg=12
```
```json
[{"author":{"kind":"model","id":"translator","tier":"translate"},"horizon":"now","kind":"intent","body":{"text":"fais un petit cairn, à hauteur de genou","lang":"fr","verb":"make","params":{"size_m":0.5}}},{"author":{"kind":"model","id":"stager","tier":"stage"},"horizon":"scene","kind":"effect","body":{"op":"thing.place","id":"cairn","name":"small cairn","shapes":[{"shape":"ball","p":[0,0.3,0],"size":[1.4,0.6,1.2],"material":"gres"},{"shape":"ball","p":[0,0.9,0],"size":[0.9,0.6,0.8],"material":"gres"}],"mass_kg":12}}]
```

**9. A commitment (intent commit → say → fact + rule by the player).** "Si tu entends le geai, arrête-toi et baisse-toi." She amends it: she will stop and crouch, not lie in the mud. Made here at `path`, it would fire two stations later. The same commitment on the real pack (golden `p8-louis-pack`) is made at `fallen-pine` and kept at `approach`, where the journal links `stop`, `posture`, `say commit.keeping` and the `kept` fact to `c.jay`.

```pdl-tx
// expect accepted accepted accepted accepted
m:translator/translate now intent text="si tu entends le geai, arrête-toi et baisse-toi" lang=fr verb=commit condition="you hear the jay" behaviour="stop and get down" commit=c.jay
m:stager/stage now act.say line.en="I’ll stop. I’m not lying down in that mud." line.fr="Je m’arrête. Je ne me couche pas dans cette boue." tone=dry
p:player story fact subj=sam pred=promised val="stop and crouch if the jay calls" commit.id=c.jay commit.party=sam commit.status=amended commit.strength=hard
p:player story rule id=c.jay on.ev=sound.played on.m.cue=jay_alarm commit=c.jay
  then now act.stop
  then now act.posture height=0.55
  then now act.say ref=commit_recall tone=whisper
```
```json
[{"author":{"kind":"model","id":"translator","tier":"translate"},"horizon":"now","kind":"intent","body":{"text":"si tu entends le geai, arrête-toi et baisse-toi","lang":"fr","verb":"commit","condition":"you hear the jay","behaviour":"stop and get down","commit":"c.jay"}},{"author":{"kind":"model","id":"stager","tier":"stage"},"horizon":"now","kind":"act","body":{"op":"say","line":{"en":"I’ll stop. I’m not lying down in that mud.","fr":"Je m’arrête. Je ne me couche pas dans cette boue."},"tone":"dry"}},{"author":{"kind":"player","id":"player"},"horizon":"story","kind":"fact","body":{"subject":"sam","predicate":"promised","value":"stop and crouch if the jay calls","commit":{"id":"c.jay","party":"sam","status":"amended","strength":"hard"}}},{"author":{"kind":"player","id":"player"},"horizon":"story","kind":"rule","body":{"id":"c.jay","when":{"event":"sound.played","match":{"cue":"jay_alarm"}},"then":[{"horizon":"now","kind":"act","body":{"op":"stop"}},{"horizon":"now","kind":"act","body":{"op":"posture","height":0.55}},{"horizon":"now","kind":"act","body":{"op":"say","ref":"commit_recall","tone":"whisper"}}],"commit":"c.jay"}}]
```

**10. One station at a time, and a model withdraws its rule (repair: step; cancel).** The staging tier sends her to the platiere from `path`: stations are not adjacent, so she goes to `pines` first. The background tier cancels its own scene rule.

```pdl-tx
// expect repaired accepted
m:stager/stage now act.go to=station:platiere
m:keeper/background now cancel tg=rule:jay.stop reason="the platiere scene has its own rule"
```
```json
[{"author":{"kind":"model","id":"stager","tier":"stage"},"horizon":"now","kind":"act","body":{"op":"go","to":"station:platiere"}},{"author":{"kind":"model","id":"keeper","tier":"background"},"horizon":"now","kind":"cancel","body":{"target":"rule:jay.stop","reason":"the platiere scene has its own rule"}}]
```

## 12. Mapping to the existing engine

How the page would implement the executor by calling what exists (`src/main.js`, `src/meneur.js`, `src/son.js`). Not wired: `src/adaptateur-core.js` holds this table as data, behind `ENABLED = false`; wiring is a later lot (M2).

| Executor call | Existing call | Translation | Gap |
|---|---|---|---|
| `go` | none (free walk today: `enqueue([{type:'marcher'}])`, `planTrajet`) | station transition: camera path from station to station | **new**: stations and transitions (M2) |
| `look` target | `enqueue([{type:'viser', objet}])` | thing id → fiche object id | `dir:*` other than sun has no equivalent; `regarder {vers:'soleil'}` for `dir:sun`, `regarder {degres}` for pitch |
| `turn` | `enqueue([{type:'tourner', degres}])` | same | — |
| `posture` | `enqueue([{type:'posture', hauteur}])` | same | — |
| `touch` | `enqueue([{type:'cadrer', objet, sur_place:true}, {type:'posture', hauteur:0.5}])` | | no hand contact animation (mains §17 exist, not tied) |
| `take` | the ramassage part of `chercher` (`MENEUR.ramassage`) | | **new**: take a given thing in place |
| `shape` | `enqueue([{type:'faconner', objet}])` + `objetMeneur({op:'faconner', etapes})` | the steps come from a model | steps are not in PDL v0 |
| `wait` | `enqueue([{type:'attendre', secondes}])` | | — |
| `stop` | `executer({type:'stop'})` | | — |
| `say` | `penser(texte)` + `direVoix(texte)` | line in the player's language | tone not used by the voice |
| `placeThing` | `objetMeneur({op:'creer', objet:{id, nom, formes, degage}, ...})` | shapes: `box→boite, ball→boule, cylinder→cylindre, cone→cone, capsule→capsule, roof→toit`, `p, size→taille, color→couleur, material→matiere, yaw→cap, tilt→penche, round→arrondi, smooth→lisse`; position → `versFiche(x, z)` | — |
| `changeThing` | `objetMeneur({op:'modifier', id, echelle, decale, vacille})` | glow → `lumineux` | — |
| `removeThing` | `objetMeneur({op:'retirer', id})` | | — |
| `playSound` | `jouerBruit(plan)` with `SON.partition` of a recipe in `src/bruitages.json` | cue → recipe, `graine: seed, cle: seq` | **new recipes**: `jay_alarm`, `branch_snap`, `steps_leaves` (data only) |
| `setPlace` | `patchScene({ambiance:{brume, lampe, soleil:{hauteur}, meteo}})` | fog→brume, lamp→lampe, weather clear/veil → clair/voile | — |
| `setCamera` | none (capteur in `camera.frag` has no degrade uniform) | | **new**: degrade/shake uniforms |
| `startScene` | `applyFiche` / `patchScene` of the pack's scene | | scene table in the pack |
| `setSpeech` | `voixP` (rate, volume) and the pensée length | whisper → low volume; shorten → `couperPensee` budget | **new** |
| `endStory` | `executer({type:'fin', id, titre, replique})` | ending family → title and line from the pack | — |
| observations | `window.balade.corps()`, `percevoir()` | → `session.observe({event:'body.pose'})` | — |

## 13. Reserved, deviations, open questions

**Reserved for v2**: free movement acts (§5.1), time-based rules beyond `clock.tick` matching, shaping steps in PDL, tone driving the voice, a compact shape sub-notation in tokens (shapes are JSON literals today).

**Deviations from `docs/architecture.md`**: `cause` is an object `{ tx, rule, commit, amends }` rather than one id (a rule-fired transaction needs both the firing and the rule); transaction ids are journal sequence numbers; event names differ from the architecture's examples (`body.near` is a condition `near`, `clock.below` is a `camera.changed`/`clock.tick` match, `said.matches` is `said` with `contains`); `station.entered/left`, `commitment.due` and `gauge.changed` are added; the `place` and `camera` vocabularies are limited to what the engine has (fog, lamp, sun height, weather; battery, degrade, shake).

**Beats and scenes.** The pack's beats (path, platiere, hide) are story state (`story.beat`), not PDL scenes: a scene change expires scene-horizon items, and the pack's `@horizon scene` rules are meant to hold across beats. Whether a beat change should also start a scene is open.

**Open**: whether `!` prose compilation needs the creator's approval per firing context or once per pack version (once, here); whether a `refused` commitment should also produce a principle for the audit; the judge tier (ADR 0004).
