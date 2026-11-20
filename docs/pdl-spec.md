# PDL v0 — specification

Status: draft for review (contract). Implements pillars 1, 2, 3 and 8 of `docs/architecture.md`. Code: `core/`. Tests: `tests/core-*.test.mjs`.

PDL has three written forms of one thing:

| Form | Who writes it | Authoritative for | Section |
|---|---|---|---|
| **Source** (`*.pdl`) | creators, assistants, story packs | authoring: principles with a strength, explicit rules | §2 |
| **JSON** (canonical) | the code | the machine: validation, execution, journal, replay | §3 to §9 |
| **Tokens** | models during play | the wire between models and the core: compact, line-oriented | §10 |

The JSON form is the canonical form. Tokens round-trip to it exactly. Source compiles to it (some statements by code, some by a model at pack build time, see §2.6).

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
  id, strength: absolute | hard | tendency | open, form: prose | explicit,
  weight?            // tendency only, 0..1
  scope              // story | place | character:<id> | scene:<id>
  horizon            // scene | story
  text, lang
  examples: [ { text, counter: bool } ]
  author { kind, id }, layer, pack, source { file, line }
  compiled?: { kind: rule | constraint, status: to_compile | proposed | compiled | approved, body?, by?, approved_by? }
}
```

A principle is **in scope** for a model call when its scope is `story`, `place`, the speaking character (`character:<id>`), or the current scene (`scene:<id>`). Each model call is journaled with the ids of the soft principles (tendency, open) in scope (§9.2), so the audit can tell what the model was asked to respect.

### 2.8 Audit

The judging is a model call made elsewhere; the core defines its interface and aggregates.

```
judge(input) -> audit[]          // interface only (core/source.js documents it)
input  { principle, entries: [journal entries], examples }
audit  { type: "audit", principle, seq, relevant: bool, respected: bool | null, note?, judge { kind, id, tier? } }
```

`seq` is the journal entry the verdict refers to (a `say`, a model call, an act). `relevant: false` means the principle did not apply there (then `respected` is null). `auditSummary(journal)` (pure) returns, per principle: `relevant`, `respected`, `broken`, `rate` (= respected / relevant), and the seqs of breaks.

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

## 3. Transaction envelope

*(sections 3 to 12 follow; see the table of contents at the top once complete)*
