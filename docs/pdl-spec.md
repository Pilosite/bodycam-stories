# PDL v0 — specification

Status: draft for review (contract). Implements pillars 1, 2, 3 and 8 of `docs/architecture.md`. Code: `core/`. Tests: `tests/core-*.test.mjs`.

PDL has three written forms of one thing:

| Form | Who writes it | Authoritative for | Section |
|---|---|---|---|
| **Source** (`*.pdl`) | creators, assistants, story packs | authoring: principles with a strength, explicit rules | §2 |
| **JSON** (canonical) | the code | the machine: validation, execution, journal, replay | §3 to §9 |
| **Tokens** | models during play | the wire between models and the core: compact, line-oriented | §10 |

The JSON form is the canonical form. Tokens round-trip to it exactly. Source compiles to it (some statements by code, some by a model at pack build time, see §2.6).

## Contents

1. Principles of the language (below)
2. PDL source: one text, a spectrum from soft to hard
3. The transaction envelope and the canonical form
4. Horizons and lifetimes
5. The world the core reasons about (stations, body, things, place, camera, clock, facts, rules, gauges, commitments)
6. The closed vocabulary: kinds and bodies
7. Rules: events, conditions, effects, limits, loop guards
8. Validation and repair
9. Session, executor interface, journal, replay, determinism
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

---

## 2. PDL source: one text, a spectrum from soft to hard

A source file (`*.pdl`, UTF-8) is read line by line. It holds **statements**, each with a **strength**, plus **directives** that set metadata for the statements that follow.

### 2.1 Lines

```
line        := blank | comment | directive | statement | attachment | continuation
blank       := spaces only
comment     := '#' anything            (a '#' at line start; inside a statement, '#' is plain text)
directive   := '@' name SP value
statement   := [id ':' SP] mark SP text [SP meta]
attachment  := [SP SP] ('>' | 'x') SP text           example / counter-example of the last statement
continuation:= SP SP text                              (two or more spaces) continues the last statement's text
meta        := '{' key '=' value (SP key '=' value)* '}'   at the very end of the line
id          := [a-z][a-z0-9_.-]*   (lowercase, at most 60 chars)
```

A continuation is joined to the previous statement text with one space. An attachment line attaches to the closest statement above it (any strength). `x` must be followed by a space to be a counter-example (so a sentence starting with "x" in a continuation stays text).

### 2.2 Directives (metadata defaults)

| Directive | Value | Default | Meaning |
|---|---|---|---|
| `@pack` | id | file name | pack the file belongs to |
| `@author` | `kind:id` (kind: creator, model, engine) | `creator:unknown` | author of the following statements |
| `@layer` | id | `base` | collaboration layer |
| `@scope` | `story` · `place` · `character:<id>` · `scene:<id>` | `story` | what the statement is about; drives when soft statements are in a model's context |
| `@horizon` | `scene` · `story` | `story` (or `scene` when scope is `scene:<id>`) | lifetime of what the statement compiles to |
| `@lang` | language code | `en` | language of the prose and examples |

A directive applies to every following statement until the next directive of the same name. Each statement can override any of them in its trailing `{…}` meta (`{scope=character:sam horizon=scene weight=0.6 id=sam.dry}`).

### 2.3 Strengths

| Mark | Strength | `form` | Enforced by | Compiles to |
|---|---|---|---|---|
| `!!` | `absolute` | `prose` | the validator | a **constraint** (§8.4), written by a model at pack build, approved by the creator |
| `!! never …` | `absolute` | `explicit` | the validator | a constraint, compiled by code (§2.5) |
| `!` | `hard` | `prose` | code | a **rule** (§7), written by a model at pack build, approved by the creator |
| `when … -> …` | `hard` | `explicit` | code | a rule, compiled by code (§2.4) |
| `~` or `~w` | `tendency` (weight `w` in 0..1, default 0.5) | `prose` | models, in context; audited | nothing: stays a principle |
| `?` | `open` | `prose` | models decide, guided by the note | nothing: stays a principle |
| `>` / `x` | example / counter-example | — | calibrate the statement above; double as audit test cases | attached to the statement |

Every statement becomes a **principle record** (§2.7), whatever its strength. The id is the leading `id:` or `{id=…}`; without one, the id is `p-` + 8 hex digits of a hash of the scope and the normalised text (stable while the text does not change).

### 2.4 Explicit rules: `when … -> …`

```
rule      := 'when' SP event [SP 'if' SP cond (SP 'and' SP cond)*] SP '->' SP call (',' SP? call)* [SP limit]*
event     := EVENT [SP test (SP 'and' SP test)*]          an event name from §7.1 with tests on its fields
           | PATH SP op SP value                          shorthand: a state path; becomes its change event (below)
test      := field SP op SP value
op        := '<' | '<=' | '>' | '>=' | '=' | '!=' | 'contains'
cond      := 'not' SP cond
           | REF SP 'within' SP number 'm' SP 'of' SP REF     → { near: { a, b, within_m } }
           | 'fact' SP id SP id [SP '=' SP value]             → { fact: { subject, predicate, value? } }
           | 'scene' SP '=' SP id                             → { scene: { id } }
           | PATH SP op SP value                              → { state: { path, <op>: value } }
call      := name '(' [arg (',' SP? arg)*] ')'
arg       := value | key '=' value                    a bare value fills the op's primary field (§6, "primary")
limit     := 'once' | 'max' SP int | 'cooldown' SP number 's'
value     := number | number '%' | number 'm' | number 's' | 'true' | 'false' | bare | '"' json-string '"'
```

- **State-path shorthand.** `camera.battery < 10%` means event `camera.changed` with test `battery < 0.1`. Paths: `camera.battery`, `camera.degrade`, `place.fog`, `place.lamp`, `place.sun_height`, `clock.t`, `clock.scene_t` (event `clock.tick`). `clock.battery` is accepted as an alias of `camera.battery`.
- **Units.** `10%` → 0.1; `20m` → 20 (metres); `30s` → 30 (seconds). Numbers are plain decimals.
- **Calls.** `name` is an act or effect op of §6 (`say`, `stop`, `look`, `sound.play`, `camera.set`, …) or `fact`. Aliases: `image.degrade(x)` → `camera.set(degrade=x)`; `image.shake(x)` → `camera.set(shake=x)`; `say(id)` with a bare id → `say(ref=id)` (a line of the pack's line bank); `say("…")` → a line in the file's `@lang`. `fact(subject, predicate, value)` is positional. A call may end with `horizon=scene` / `horizon=story` / `ttl=…`.
- **Limits.** `once` = `max_fires 1`. Default when absent: `max_fires 1`, `cooldown_s 0` (rules must ask to fire more than once).
- **Horizon** of the rule: the statement's horizon (story or scene).

Example (the architecture's): `when clock.battery < 10% once -> say(battery_low), image.degrade(0.3)` compiles to

```json
{ "id": "battery.low", "when": { "event": "camera.changed", "match": { "battery": { "lt": 0.1 } } },
  "then": [ { "horizon": "now", "kind": "act", "body": { "op": "say", "ref": "battery_low" } },
            { "horizon": "now", "kind": "effect", "body": { "op": "camera.set", "degrade": 0.3 } } ],
  "limits": { "max_fires": 1, "cooldown_s": 0 } }
```

### 2.5 Explicit absolutes: `!! never …`

```
absolute := '!!' SP 'never' SP call [SP 'if' SP cond (SP 'and' SP cond)*]
```

The call is a **pattern**: its op and the arguments given must all match a transaction for the constraint to apply; arguments not given match anything. `!! never go(station:hide) if not scene = platiere` rejects any `act go` to the hide station while the current scene is not `platiere`.

### 2.5 bis Gauges: `gauge id "label": …`

A gauge (§5.6) is declared in source; it compiles by code.

```
gauge    := 'gauge' SP id SP '"' label '"' ':' SP clause (';' SP clause)*
clause   := 'rises' SP event SP 'by' SP number [SP 'if' SP cond (SP 'and' SP cond)*]
          | 'fades' SP number '/min'
          | 'words' SP number SP number            thresholds of "medium" and "high" (defaults 0.34 0.67)
```

Rules and conditions read gauges by word or value: `when gauge.disturbance is high -> …`, `if gauge.trust < 0.3`.

```pdl
gauge disturbance "how much the animals near the hide have been disturbed": rises said by 0.2 if body within 30m of thing:hide; rises sound.played cue = branch_snap by 0.5; fades 0.1/min; words 0.3 0.6
hide.quiet: when gauge.disturbance is high -> say(jay_stop), posture(0.5)
```

### 2.6 Compilation and approval

| Statement | Compiled by | When | Record |
|---|---|---|---|
| `when … -> …`, `!! never …` | code (`core/source.js`), deterministic | at load | `compiled.status = "compiled"` |
| `!` prose, `!!` prose | a model (compiler) | at pack build, never during play | stub `compiled.status = "to_compile"`, then `"proposed"` with the model's rule / constraint (validated like any rule), then `"approved"` by a creator |
| `~`, `?`, `>`, `x` | nobody | — | principle only; fed to model prompts, audited |

A stub keeps the prose. Only `compiled` and `approved` compiled forms are loaded into a session; a `!` or `!!` still `to_compile` or `proposed` is loaded as a principle and reported by the pack check, never enforced half-way. The compiled form is cached under `build/` and versioned with the source.

### 2.7 The principle record

```
principle {
  id, strength: absolute | hard | tendency | open | gauge, form: prose | explicit,
  weight?            // tendency only, 0..1
  scope              // story | place | character:<id> | scene:<id>
  horizon            // scene | story
  text, lang
  examples: [ { text, counter: bool } ]
  author { kind, id }, layer, pack, source { file, line }
  compiled?: { kind: rule | constraint | gauge, status: to_compile | proposed | compiled | approved | error, body?, by?, approved_by? }
}
```

A principle is **in scope** for a model call when its scope is `story`, `place`, the speaking character (`character:<id>`), or the current scene (`scene:<id>`). Each model call is journaled with the ids of the soft principles (tendency, open) in scope (§9.2), so the audit can tell what the model was asked to respect.

### 2.8 Audit

The judging is a model call made elsewhere; the core defines its interface and aggregates.

```
judge(input) -> audit[]          // interface only (core/source.js documents it)
input  { principle, entries: [journal entries], examples }
audit  { type: "audit", principle, ref_seq, relevant: bool, respected: bool | null, note?, judge { kind, id, tier? } }
```

`ref_seq` is the journal entry the verdict refers to (a `say`, a model call, an act). `relevant: false` means the principle did not apply there (then `respected` is null). `auditSummary(journal)` (pure) returns, per principle: `relevant`, `respected`, `broken`, `rate` (= respected / relevant), and the seqs of breaks.

### 2.9 A sample file

```pdl
@pack louis-round
@author creator:toine
@layer base
@scope character:sam
@lang en

sam.dry: ~0.8 Dry, funny when uneasy. Short sentences.
  > "C'est un pin sylvestre. Malade, celui-là."
  x "Oh my god, I am so scared, what should I do?"
sam.climb: ? Would she climb? Yes if asked twice, and she complains.
sam.no-harm: !! Sam never harms an animal.
sam.hide-quiet: ! She does not shout within 30 m of the hide.
sam.hide-early: !! never go(station:hide) if not scene = platiere
battery.low: when camera.battery < 10% once -> say(battery_low), image.degrade(0.3)
jay.stop: when sound.played cue = jay_alarm if body within 20m of thing:hide -> stop(), say(jay_stop) {scope=scene:platiere horizon=scene}
```

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

**5.1 Stations** (v1 is station-based, ADR 0003). `station { id, pos [x, z] m, heading deg, reach_m, next [ids] }`. Adjacency is the union of both directions of `next`. The body is always at a station (`body.station`); `go` moves to an adjacent one as a transition the engine plays. Free movement (`move`, `approach`, `frame`, `climb`, `descend`, `search`) is **reserved for v2**: those ops exist in the engine today and are rejected with `reserved_v2`.

**5.2 Body.** `{ station, yaw, pitch, height (share of standing eye height), held [thing ids] }`. The engine owns the body: the core mirrors what the executor reports (`station.entered`, `body.pose`, `body.held`).

**5.3 Things.** `{ id, name, shapes, mass_kg, pos, size_m, fixed, horizon, expires, scene, tx, author }`. Pack things are `fixed` (story horizon). A thing is **within reach** when its distance to the current station is at most `reach_m + size_m / 2`, or it is held.

**5.4 Place and camera.** `place { fog, lamp, sun_height, weather }`, `camera { battery, drain_per_s, degrade, shake }`. Effective value = base, overridden by live overlays (now/scene effects) in order. The battery drains `drain_per_s` per second on `advance` and emits `camera.changed`.

**5.5 Clock and scene.** `clock { t, scene, scene_t0 }`. Time only moves by `advance(dt)` (an input); nothing reads a wall clock.

**5.6 Gauges** (P10). `gauge { id, label, value 0..1, rises [ { on: { event, match }, by, if? } ], fades { per_minute }, words { medium, high }, author, layer }`. On every event, each gauge whose `rises` match (and whose `if` holds) gains `by` (clamped to 1) and emits `gauge.changed { id, value, word, was }`; a gauge never rises on its own `gauge.changed`. On `advance` it fades; `gauge.changed` is emitted when its word changes. The word is `low` below `medium`, `high` from `high`. The engine knows no gauge name.

**5.7 Facts, rules, constraints, principles, commitments.** Facts `{ subject, predicate, value, certainty, source?, commit?, tx, t, author, horizon, scene }` (newest live one answers a query); rules §7; constraints §8.4; principles §2.7; commitments §8.6.

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
| `condition`, `behaviour` | text ≤ 200 | required when `verb = commit` (§8.6) |
| `commit` | id | the commitment's id (default `c<seq>`) |

### 6.2 `act` (horizon now): what the character does, in place

| op | Fields | Engine today |
|---|---|---|
| `go` | `to` station ref, required (intent: target) | transition (new in v1) |
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
| `camera.set` | one of `battery`, `degrade`, `shake` (0..1) | capteur (new) |
| `scene.start` | `id` required | — (new) |

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
| `intent.heard` | verb, target, text | intent |
| `act.done` | op, target, to | every act |
| `said` | text, lang, ref | act say |
| `sound.played` | cue, at | effect sound.play |
| `thing.placed` / `thing.changed` / `thing.removed` | id, name / id / id, reason | effects, expiry |
| `fact.added` | subject, predicate, value, certainty | fact |
| `camera.changed` | battery, degrade, shake | camera.set, battery drain |
| `place.changed` | fog, lamp, sun_height, weather | place.set, overlay expiry |
| `station.entered` / `station.left` | id | executor, on go |
| `scene.started` | id | scene.start |
| `clock.tick` | t, scene_t | advance |
| `commitment.due` | commit, rule | a tendency rule firing |
| `gauge.changed` | id, value, word | gauges |

Engine observations `body.pose`, `body.held` and bookkeeping events (`rule.registered`, `fact.expired`, `rule.expired`, `cancelled`) are journaled but cannot be matched.

**Match.** `{ field: value }` is equality; `{ field: { eq | ne | lt | le | gt | ge | in | contains: x } }` all must hold. A key not listed for the event is rejected.

### 7.2 Conditions (`if`, all must hold)

`{ near: { a, b, within_m } }` (refs; body = its station's position) · `{ fact: { subject, predicate, value?, min_certainty? } }` · `{ state: { path, eq|ne|lt|le|gt|ge } }` with path in `camera.battery camera.degrade camera.shake place.fog place.lamp place.sun_height clock.t clock.scene_t body.station body.height` · `{ scene: { id } }` · `{ station: { id } }` · `{ gauge: { id, word? , gt?, lt? } }` · `{ not: cond }`.

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

`constraint { id, forbid { kind, op?, fields? }, if? [cond], author, layer }`, compiled from `!!` (§2.5). A transaction matching `forbid` (same kind, same op, every given field equal) while all `if` conditions hold is rejected with `{ why: constraint, value: <id> }`, whoever wrote it, including rule-fired transactions.

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

1. The translation tier emits `intent { verb: commit, condition, behaviour, commit: <id> }` → commitment `proposed`.
2. The character answers in character (`act say`), then a **fact** authored by the player, with `commit { id, party: <character>, status: accepted | amended | refused, strength: hard | tendency }` (the promise and its wording).
3. If accepted or amended, a **rule** authored by the player with `commit: <id>`, horizon scene or story, `strength` as promised.
4. When the rule fires: the commitment becomes `due`. **hard**: the templates run (linked by `cause.commit`) and the session records an engine fact `kept` (or `broke` if one was rejected) with `commit.status`. **tendency**: `commitment.due` is emitted and a model tier resolves it by submitting acts and a fact with status `kept` or `broken` (cause: the firing).
5. Lifecycle (validated): `proposed → accepted | amended | refused`; `accepted | amended → due → kept | broken`; a `cancel commit:<id>` breaks it.

## 9. Session, executor, journal, replay

### 9.1 The executor interface (`core/world.js`, `EXECUTOR`)

The engine implements: `go, look, turn, posture, touch, take, shape, wait, stop, say, placeThing, changeThing, removeThing, playSound, setPlace, setCamera, startScene`. Each call is `(args, ctx)` with `ctx { world (read-only), seq, seed, rng }` and returns events (`station.left/entered`, `body.pose`, `body.held`, …). Calls never change the core world; the session applies the reported events. Asynchronous observations come back through `session.observe(event)`, which is an input. `core/paper-world.js` implements it in memory; `tests/core-executor.contract.mjs` is the contract suite both implementations run.

### 9.2 The journal (`core/journal.js`)

JSON lines, English keys, append-only. Every entry has `seq`, `t`, `type`.

| type | Keys | Input (replayed) |
|---|---|---|
| `session` | v, seed, scene, budget | header |
| `tx` | author, tier, horizon, kind, status, repair, reasons, cause, depth, body, ttl, timings, input, proposed | yes when `input: true` (the `proposed` form is re-submitted); rule-fired ones are derived |
| `event` | event, data, cause (seq) | no |
| `rule` | rule, status (fired, blocked), reason, event, cause, author, layer | no |
| `advance` | dt | yes |
| `observe` | event, data | yes |
| `principles` | records | yes |
| `model_call` | tier, purpose, character, principles (ids of soft principles in scope), timings | yes |
| `audit` | principle, ref_seq, relevant, respected, note, judge | yes |
| `hash` | hash | yes (re-computed) |

`timings` (`model_ms`, …) are wall-clock measurements: kept, never compared.

### 9.3 Session loop (`core/session.js`)

`submit(tx)` → id and time assigned → `validate` → journal → apply (core state + executor call) → events (journaled) → gauges → rules → their transactions queued, processed breadth-first through the same path. Other inputs: `advance(dt)`, `observe(ev)`, `loadPrinciples(records)` (constraints and gauges installed; compiled rules submitted as creator transactions with `principle`), `modelCall({ tier, purpose, character, timings })`, `audit(records)`, `checkpoint()`.

### 9.4 Determinism and replay

The state hash is a 53-bit hash of the canonical JSON of the world (sorted keys, numbers to 1e-6). Randomness comes only from `rngFor(seed, seq)`. `replay(journal, executor, seed?, { edit })` re-runs the inputs in a fresh session and returns `{ session, hash, journal }`; with the same executor and seed it reproduces every entry and the hash. `edit(entry)` returns a replacement input (what-if: the creator edits a rule and replays). `diff(a, b)` compares entry by entry (timings ignored) and lists the rules fired on each side and the checkpoint hashes.

**Golden journals** (ADR 0007): `tests/golden/<pillar>.jsonl`, one per pillar (p1 transactions, p2 horizons, p3 model rule, p8 principles, p9 commitment), written by `node tools/core-golden.mjs` from `tests/core-fixture.mjs` and replayed by `tests/core-golden.test.mjs`.

## 10. The token form

For models: one transaction per line, compact, line-oriented, exact round trip to the canonical form (`core/tokens.js`).

```
tx        := head (SP field)* NL (SP SP cont NL)*
head      := ['#' int SP] ['@' number SP] author SP horizon SP kind ['.' op] [SP '^' cause] [SP '~' ttl]
author    := ('p' | 'c' | 'm' | 'e') ':' id ['/' tier] ['+' layer]       player, creator, model, engine
cause     := [int] ['/' rule-id] ['!' commit-id]
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

Sam walks her missing brother Louis's forest round wearing his bodycam; the player is the voice on the feed. The place is `tests/core-fixture.mjs` (`LOUIS`): six stations `trailhead → path → pines → platiere → hide-edge → hide`, things `pine-mark`, `pine-3`, `hide`, `jay-oak`, cues `jay_alarm`, `branch_snap`, `steps_leaves`, and a line bank in French and English. The examples run **in order in one session** starting with Sam at `path`; `tests/core-pdl.test.mjs` checks that each token block parses to the JSON beside it, serializes back to the same text, and gets the statuses in its `// expect` line.

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

**9. A commitment (intent commit → say → fact + rule by the player).** "Si tu entends le geai, arrête-toi et baisse-toi." She amends it: she will stop and crouch, not lie in the mud. Made here at `path`, it fires two stations later at `platiere` (golden p9), where the journal links `stop`, `posture`, `say commit_recall` and the `kept` fact to `c.jay`.

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
| observations | `window.balade.corps()`, `percevoir()` | → `session.observe({event:'body.pose'})` | — |

## 13. Reserved, deviations, open questions

**Reserved for v2**: free movement acts (§5.1), time-based rules beyond `clock.tick` matching, shaping steps in PDL, tone driving the voice, a compact shape sub-notation in tokens (shapes are JSON literals today).

**Deviations from `docs/architecture.md`**: `cause` is an object `{ tx, rule, commit }` rather than one id (a rule-fired transaction needs both the firing and the rule); transaction ids are journal sequence numbers; event names differ from the architecture's examples (`body.near` is a condition `near`, `clock.below` is a `camera.changed`/`clock.tick` match, `said.matches` is `said` with `contains`); `station.entered/left`, `commitment.due` and `gauge.changed` are added; the `place` and `camera` vocabularies are limited to what the engine has (fog, lamp, sun height, weather; battery, degrade, shake).

**Open**: whether `!` prose compilation needs the creator's approval per firing context or once per pack version (once, here); whether a `refused` commitment should also produce a principle for the audit; the judge tier (ADR 0004).
