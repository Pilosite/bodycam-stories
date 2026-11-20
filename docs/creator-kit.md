# Creator kit: working on a story pack with an assistant

The repository is a creator kit. A creator who wants the backend opens it in Claude Code, Codex or a similar tool and talks to the assistant; the assistant edits the pack's PDL source and JSON, checks it, plays a scripted session, replays it against the edit, shows the diff and its effect, and commits. The creator reviews the diff and the effect, not the code. Serves P8 to P12, P16, P17.

## What the assistant reads

`stories/CLAUDE.md` (Claude Code loads it when it works under `stories/`) and the root `AGENTS.md` (the same text, for Codex and the others) are the assistant's instructions: what to read first, the strengths and who enforces each, the loop, the rules, how to read a journal for a creator. They point to `docs/principles.md`, the pack's bible (`docs/story-louis-round.md`), `docs/pdl-spec.md` §2, `docs/characters.md` and `docs/patterns.md`.

Four slash commands in `.claude/commands/` wrap the loop for Claude Code: `/story-check [pack]`, `/story-play <pack> <script>`, `/story-whatif <journal> <pack>`, `/story-new <pack-id>`. Each runs the command line below and says how to present the result.

## Commands

`node tools/story.mjs <command>` (or `npm run story -- <command> …`; `npm run story:check|story:play|story:whatif|story:audit -- …`). No dependency; readable output, `--json` on every command. Everything runs on the real core (`core/`): one parser (`core/source.js`), the real session, the real three clocks, the paper world as executor.

| Command | What it does | Status |
|---|---|---|
| `check <pack>` | parses every `.pdl` through `core/source.js` (`compilePack`: layers merged with provenance, patterns instantiated, explicit rules, absolutes and gauges compiled), then checks every reference across the pack (facts, lines in every language, stations, things, beats, endings, cues, clocks, gauges, commit and intent classes), speech in every language, character shapes, the carrier's minimums when it is strong, the bench, a stale build; counts what is not enforced yet; exit 1 on errors; `--json`: `{ ok, errors, warnings, stats, compiled }` | works |
| `build <pack>` | writes `<pack>/build/compiled.json`: principles with provenance, the scene, the explicit rules, pattern bindings, the source hash; compiled forms a model proposed or a creator approved are carried over while their statement's text is unchanged | works; nothing writes approved forms yet (the model compiler is a later lot) |
| `explain <pack> <id>` | the statement, its strength, layer, author, file and line, overrides, pattern, compiled form, who enforces it, and what refers to it (other statements, beats, stations, endings, pattern bindings); also line keys, stations, things, beats, endings, cues | works |
| `play <pack> --script <file> [--seed n] [--out f] [--lang l] [--verbose]` | a session in the paper world, driven by the script, through `createClocks` with the heuristic model; prints each exchange (what was said, how it was heard, what she did and said, rules fired with their line, repairs and rejections with the principle, principles in scope) and writes the journal | works; heuristic model only (see below) |
| `replay <journal>` | re-runs the journal's inputs: same entries, same hash? exit 1 if not | works |
| `whatif <journal> --pack <pack> [--out f]` | replays the journal with the pack as edited now (its principles and its scene replace the recorded ones; approved compiled forms are carried from the journal): statements added, removed or changed, first difference (and first difference in play, after the rules' registration), rules that no longer fire, fire now or fire at another moment, promises, beat, ending, battery, hashes | works |
| `audit <journal>` | what the player asked, what was repaired or rejected and by which principle, rules fired, never fired and blocked, commitments with their course, gauges' course, judge verdicts (`auditSummary`), model calls, late answers | works; judge verdicts appear only when the journal has `audit` entries (no judge pass yet) |
| `journal <journal> [--all] [--lang l]` | a journal, one readable line per entry; her lines in the asked language | works |
| `new <pack-id> [--author id]` | a new pack from `stories/_template/` | works |
| `harvest <files or folders…> [--out f] [--strip] [--json]` | alias of `node tools/harvest.mjs`: harvest records or raw journals (both formats) → the merged report and its proposals, written as Markdown under `harvest/` (see "The harvest" below) | works |
| `node tools/pack-check.mjs <pack> [--json]` | alias of `check`, kept for habits and scripts | works |

### Play scripts

```
# comment
lang fr                                      the language of what follows
wait 30                                      time passes (the session advances in 5 s steps)
look marque-1 3                              the player's gaze rests on a thing for 3 s (an input observation)
say Bonjour. Je suis là.                     something said; the heuristic model guesses the intent
say! ARRÊTE DE PARLER                        said loudly
say regarde ce trait orange => look marque-1 the intent pinned, as a translation tier would answer (canned)
say si le geai crie, arrête-toi et couche-toi => commit jay amend
  when sound(jay.alarm) -> body.stop, body.posture(0.55), say(commit.keeping)
                                             a promise (class jay, she amends it) and the rule she agrees to, in source grammar
say par le ruban, descends => go approach via=tape
```

A pin is `verb [target] [key=value…]`, with `accept|amend|refuse` and `hard|tendency` for promises. A JSON array (`[{ "say": "…", "lang": "fr", "pin": { "verb": "look", "target": "marque-1" } }, { "wait": 30 }]`) is accepted too.

### The heuristic model

`play` has no model: it uses the last link of the fallback chain (`docs/architecture.md`, decision points), a small French and English lexicon plus the pack's names, behind the model port. It guesses the verb (go, look, touch, take, stop, wait, posture, make, commit, ask, other), a thing whose name shares words with the sentence, the next station forward, a commit or intent class whose id appears in the sentence, loudness from capitals. Her immediate reaction is the act asked and a line of the pack's bank when one exists (`move.ok`, `look.ok`, `touch.ok`, `take.ok`, `commit.accept|amend|refuse`). The staging tier answers nothing. It writes no rule for a promise: pin one. In the journal its answers are authored `m:heuristic`; the intent itself is authored by the core's translator identity (`core/clocks.js`). Consequences a creator must hear: tendencies, open questions, examples and prose `!`/`!!` have no effect in `play` (they are only listed as in scope); latencies are not measured (the clock is fixed at 0).

## Where things live

| What | Where | In Git |
|---|---|---|
| a story pack | `stories/<pack-id>/` (`docs/architecture.md`, "Story pack") | yes |
| play scripts | `stories/<pack-id>/scripts/*.txt` (an addition to the pack layout; no loader reads them) | yes |
| journals written by `play` | `out/journals/<pack-id>/<script>.jsonl` (`--out` to choose) | no (`out/` is ignored); a script regenerates its journal |
| golden journals of the core | `tests/golden/*.jsonl` (`node tools/core-golden.mjs`) | yes |
| the compiled pack | `stories/<pack-id>/build/compiled.json` (`story build`) | when it carries approved compiled forms; `check` warns when it is older than the sources |
| the template | `stories/_template/`: one place, two stations, one light character (`ana`), one rule, one open question, lines in English and French, one script | yes |

## Three example requests, re-run with the tool

The outputs below are real (20 November 2026), abridged where marked. The session they compare against is `stories/louis-round/scripts/jay.txt`, played once before the edit:

```
$ node tools/story.mjs play stories/louis-round --script stories/louis-round/scripts/jay.txt
…
── t=35s  you: « si le geai crie, arrête-toi et couche-toi »   [intent pinned: commit jay]
   model:translator/translate now asks for a promise (jay): if "le geai crie" then "arrête-toi et couche-toi"
   in scope (sam): 43 principles — sam 32 · facts 1 · place 6 · louis-absent 2 · battery-clock 1 · louis-marks 1
   model:heuristic/translate now say commit.amend (flat)  « Pas comme ça. Mais je ferai ça, à la place : »
   player now promise c.jay amended (hard): sam promised "arrête-toi et couche-toi"
   player now rule c.jay registered for promise c.jay: when sound.played {"cue":"jay.alarm"}
…
── t=65s  you: « par le ruban, descends »   [intent pinned: go approach]
   model:heuristic/translate now go to approach by tape
   · station.entered id=approach
   · beat.entered id=hide
   rule r.jay-first fired on station.entered — base/toine: when station.entered(approach) once -> sound(jay.alarm), reveal(f.jay-heard), say(jay.alarm)
   rule c.jay fired on sound.played — player, promise c.jay
   rules now say jay.alarm (flat)  « Un geai. Il gueule pour nous. … Enfin, pour moi. »
   rules now stop
   rules now posture height=0.55
   rules now say commit.keeping (flat)  « Comme t'as dit. Je le fais. »
   rules now promise c.jay kept (hard): sam kept c.jay
…
── t=110s  you (loud): « ARRÊTE DE PARLER »
   rule r.jay-loud fired on intent.heard — base/toine: when said.loud cooldown 45s if beat(hide) and fact(f.jay-heard) -> sound(jay.alarm)
   rule c.jay blocked (max_fires)

journal: out/journals/louis-round/jay.jsonl (236 entries, hash 1fa4f23a50de3f)
```

`audit` on it: 8 requests, 0 repaired, 0 rejected, 4 rules fired (`louis-marks.sign-read.1, r.jay-first, c.jay, r.jay-loud`), 19 never fired, `c.jay: proposed #118 → amended #124 → due #176 → kept #190`, `c.jay` blocked once by `max_fires` (the jay called twice; the promise is kept once: a creator who wants her to drop at every call writes `max 3`).

### 1. "Make Sam more guarded with strangers"

The edit: `voice.assume.office` from `~0.9` to `~1.0`; in `characters/sam.pdl` a tendency `sam.voice.guarded` (~0.8), one example and one counter-example (both languages). No rule: wariness is a tendency, audited, not enforced.

```
$ node tools/story.mjs check <edited pack>
…
ok
$ node tools/story.mjs explain <edited pack> sam.voice.guarded
sam.voice.guarded  ~  tendency 0.8 (prose)  scope character:sam, horizon story
  "With someone she does not know yet (the voice at first, the walker), she gives facts, not feelings, until they have been right once."
  from characters/sam.pdl:13, layer base, author toine
  enforced by: the models, in context, on every call where it is in scope (character:sam); weighed at 0.8, audited afterwards
referred to by (0):
$ node tools/story.mjs whatif out/journals/louis-round/jay.jsonl --pack <edited pack>
pack changes: 3 added, 0 removed, 1 changed
  ~ voice.assume.office (weight 0.9→1)
  + sam.voice.guarded ~ With someone she does not know yet (the voice at first, the walker), she gives facts, not…
  + sam.examples.1 > [a stranger asks how she feels] fr: Ça va. Il fait froid. On avance ? | en: I'm fine. It'…
  + sam.counter-examples.1 x [the voice's second sentence] fr: Tu sais, depuis qu'il est mort, je dors plus. | en: You…

first difference: #59
  before: model call translate/intent (done): 43 principles in scope
  now:    model call translate/intent (done): 44 principles in scope

rules that fired before and no longer: —
rules that fire now and did not: —
promise c.jay: kept → kept
beat: hide → hide · ending: — → — · rejected transactions: 0 → 0
final hash: 1fa4f23a50de3f → 0633ff3d321ccf
```

What to tell the creator: the new tendency is now in scope of every model call where Sam speaks (43 → 44 principles); nothing in code changes, as intended. Its effect shows only with a real staging tier, and the audit will score it once a judge pass exists. The example and counter-example have no `{id}`: their ids are positional, so `whatif` matches them by content.

### 2. "The jay should only call if Sam makes noise on the way down"

The edit, in `rules/hide.pdl`:

```diff
-when station.entered(approach) once -> sound(jay.alarm), reveal(f.jay-heard), say(jay.alarm) {r.jay-first}
+when said.loud once if at(approach) -> sound(jay.alarm), reveal(f.jay-heard), say(jay.alarm) {r.jay-first}
```

Before the edit, `explain` already says what depends on the rule:

```
$ node tools/story.mjs explain stories/louis-round r.jay-first
…
  enforced by: code: a rule, registered at session start, fires without any model (compiled by code)
referred to by (1):
  beats.json  path: tests the commitment invited at fallen-pine (c.jay), at approach
```

Against the golden session of the core (`tests/golden/p8-louis-pack.jsonl`, a quiet arrival):

```
$ node tools/story.mjs whatif tests/golden/p8-louis-pack.jsonl --pack <edited pack>
pack changes: 0 added, 0 removed, 1 changed; compiled forms carried from the journal: sam.never.harm
  ~ r.jay-first (text)
      was: when station.entered(approach) once -> sound(jay.alarm), reveal(f.jay-heard), say(jay.alarm)
      now: when said.loud once if at(approach) -> sound(jay.alarm), reveal(f.jay-heard), say(jay.alarm)

first difference: #4 (the pack's rules as registered); first difference in play: #94
  before: rule r.jay-first fired on station.entered — base/toine: when station.entered(approach) once -> sound(jay.alarm), reveal(f.jay-heard), say(jay.alarm)
  now:    · camera.changed battery=0.8035 degrade=0 shake=0

rules that fired before and no longer: r.jay-first, c.jay
rules that fire now and did not: —
promise c.jay: kept → amended
beat: hide → hide · ending: — → — · rejected transactions: 1 → 1
final hash: 04839b198109b2 → 1bcbf791e04398   (recorded before stations carried their light; the base hash of p8 is now 03708ce55e2d0f, re-run to refresh)
```

Against the scripted session, where the player shouts at the approach:

```
$ node tools/story.mjs whatif out/journals/louis-round/jay.jsonl --pack <edited pack>
…
rules that fired before and no longer: r.jay-loud
rules that fire now and did not: —
fire at another moment (first firing): r.jay-first t=65→110, c.jay t=65→110
promise c.jay: kept → kept
```

What to tell the creator: in a quiet session the first promise of the story (`c.jay`, invited at the fallen pine) is never tested any more: it stays `amended`, and the beat's `commit_invite.tested_by` now points to a rule that may not fire. When the player shouts, the jay calls at the shout and the promise is kept then; `r.jay-loud` no longer fires: when she shouted, the jay had not been heard yet. `r.wrong-side` still makes the jay call when she comes round by the path. The creator decides whether that is the point.

### 3. "Give the player more time"

The clock is a pattern instance; the edit is data in two places and leaves the rules alone: `pack.json` `clocks.battery.runs_out_s` 840 → 1080, and `set low = 0.2` in `patterns/battery.pdl`.

```
$ node tools/story.mjs whatif tests/golden/p8-louis-pack.jsonl --pack <edited pack>
pack changes: 0 added, 0 removed, 1 changed; scene: camera; compiled forms carried from the journal: sam.never.harm
  ~ battery-clock.low (text)
      was: when clock.below(battery, 0.25) once -> say(battery.low), sound(camera.beep), image.degrade(0.15)
      now: when clock.below(battery, 0.2) once -> say(battery.low), sound(camera.beep), image.degrade(0.15)

first difference: #32 (the pack's rules as registered); first difference in play: #55
  before: · camera.changed battery=0.9702 degrade=0 shake=0
  now:    · camera.changed battery=0.9769 degrade=0 shake=0

rules that fired before and no longer: —
rules that fire now and did not: —
promise c.jay: kept → kept
beat: hide → hide · ending: — → — · rejected transactions: 1 → 1
battery at the end: 0.3273 → 0.4768
final hash: 04839b198109b2 → 1a7ed820c003aa   (recorded before stations carried their light; the base hash of p8 is now 03708ce55e2d0f, re-run to refresh)
```

What to tell the creator: the same session ends with 48 % of battery instead of 33 %; `battery-clock.half` still fires at the end (transitions cost their `cost_s` on top of time); the low notice will come at 20 % instead of 25 % (this session does not reach it either way). If the creator wants no clock at all, propose the swap of `docs/patterns.md` (ticking-clock → slow-light) and report the warning `check` then gives: the `battery-dies` ending is no longer triggered by anything.

## The harvest: what sessions propose (ADR 0011, P17, P23)

Every session, in every mode (story, trailer, the legacy free walk and legacy stories), produces one **harvest record**: who played what on which versions, and three lists that say what to build next. The page keeps it; the coordinator pulls it; `tools/harvest.mjs` turns a set of records into a report that ends in proposals, one section per layer, each accepted or dropped by a person. Nothing is applied automatically.

### The record (`core/harvest.js`, `harvestRecord`)

```
{ type: "harvest", v: 1, id, created, source: "core" | "legacy", mode: "story" | "trailer" | "free",
  pack: { id, version, legacy? }, device, lang, seed, with_model, duration_s, turns,
  versions: { pdl, vocab, budgets: { loops_ms, tx }, harvest, engine_build, pack, thresholds: { act_from, ask_below },
              reflexes, model: { judge, invent, home, host_tiers, limits_ms } }            // story mode
          | { harvest, engine_build, contract, models_library, settings, settings_overrides, model: { adapter, tier } },  // legacy
  summary: { calls, first_reaction_ms, full_reaction_ms, …, latency: { "<adapter>/<instrument>/<purpose>": { n, p50, p95, budget, ms } } },
  asked_not_doable: [ { seq, kind, what, missing, said, … } ],   // engine_gap, rejected_missing, dropped_missing, not_understood; legacy: refused, legacy_<event>
  improvised:       [ { seq, kind, text, said, by, … } ],        // fact, thing, rule, line
  slow_or_doubtful: [ { seq, kind, what, said, … } ],            // over_budget, held, failed, stale, late, unsure, repaired, rejected, dropped_lines; legacy: no_first_reaction, adapted, invalid
  stripped, journal: { format: "jsonl" | "legacy-text", text, cut } }
```

`seq` is the journal entry it comes from (for the legacy text journal: the block's rank, the header being 0). `said` is the player's sentence that led to it; with `strip` every player sentence is replaced by `[player: <class>]` (the intent's class or verb; `voice` in the legacy path), in the lists and in the journal. Each list keeps 80 items at most (then one `cut` item). The journal is kept when it fits 150 000 bytes; else a lean form without derived events, principles in scope and principle records (not replayable as is: the pack at `versions.pack` holds them), else none, and `journal.cut` says which.

`versions` names everything that steers behaviour (ADR 0011 §4): the PDL version and a hash of the closed vocabulary, the loop budgets and the transaction budget, the engine build (`ENGINE_BUILD`, a hash of the page's code written by `tools/build.mjs`), the pack's source hash (`version` of each compiled pack), the reflex thresholds and a hash of `src/reflexes.json`, which adapter served judgement and invention, the host's tiers and the time limits; in the legacy path the contract's and the model library's fingerprints and a hash of the meneur's settings.

### In the page (`src/harvest.js`)

At a session's end and on « Copy journal » (story mode), and wherever the legacy path produces its journal (« Journal », the end of a story, leaving the free walk), the page builds the record. The first time, a one-line notice asks: "This session's journal is kept to improve the game. [Keep] [Don't keep]"; the answer is remembered (`bodycam-harvest-consent`), and nothing is kept before it or after a "Don't keep". Kept records go:

- to **the artifact's shared store**, when the page has one (the `db` capability, the same `capacite("db")` the scene bank uses): **collection `harvest`, one document per session, document id = the record's `id`** (`[a-z0-9-]`, e.g. `louis-round-123456789-lx3k9q`, `free-libre-217113628-lx3k9q`), **document body = the record built with `strip`** (the player's sentences replaced by their class), because with the artifact's default rules every signed-in viewer can read shared documents. To keep full sentences in the shared store, the artifact would first need rules that hide the collection from other players (a `harvest/{self}` subtree read by `admin`), which is a later decision.
- to **this browser** (`localStorage` `bodycam-harvest`, the full record, 20 records and 1.5 MB at most, oldest dropped).

« Harvest » (the tools menu, and the story debug panel) lists the kept records with « Copy all », which copies the browser's records as one JSON array. Nothing is sent anywhere else.

### Pulling the records (the coordinator)

From a Claude Code session that can reach the artifact: the `ArtifactData` tool, `action: "list"`, `url: <the artifact's link>`, `collection: "harvest"` (page through it; `get` with `doc_id` for one record). Each document's data is one record as above. Save the documents as one JSON array (or one file per record) under `harvest/records/`, then:

```
node tools/harvest.mjs harvest/records --out harvest/<date>-report.md
```

A player can also paste « Copy all » (a JSON array), a story journal (« Copy journal », JSON lines) or a legacy journal (the French text that begins `JOURNAL · `) into a file: the tool reads all three, from files or folders, and `--strip` strips the sentences of what it reads.

### The report

Sessions (with their versions) · what was asked and not doable, grouped by what was missing, with the sentences · everything improvised · the latency table by adapter, instrument and purpose (n, p50, p95, budget, over budget) · **proposals**, one section per layer, each with where it came from (record and `seq`), how often it was seen across the records, and who decides:

1. engine and vocabulary (the engine's owner): a draft sound plan for `src/bruitages.json` (a cue with no recipe), a draft model for `src/modeles.json` (a thing refused or failed), else a line for the engine's vocabulary wishlist (an op, a field, a material, `reserved_v2`);
2. story (the story's author): improvised facts, things and rules as PDL source lines (`~<certainty>` when the model gave one, else `? … -- note`), each under a `//` line naming the session and `seq`;
3. characters (the story's author): invented lines as examples (`>`), turned-down lines as counter-examples (`x … | why:`), refusals as open questions (`?`);
4. framework (the engine's owner): sentences the reflex could not place (an anchor or intent class), turns with no visible reaction within the now budget (a prepared option), slow, held or failed calls (a budget or a time limit), unsure judgements (a threshold), repeated repairs and rejections (a compiled rule or a prompt note).

The first two reports are `harvest/2026-11-20-free-session-phone.md` (Toine's free session on his phone; its journal is **reconstructed** from `docs/field/2026-11-20-free-session-phone.md` in `harvest/journals/`, the raw text not being in the repository) and `harvest/golden-journals.md` (the core's golden journals).

What the legacy journal cannot tell: that people were asked for and could not be shown (the free mode has no executor gaps; "Parle à ta femme" played as an empty chair is not recorded as a gap). Converging the free mode onto the core (the conception lot) brings its gaps into the record.

## Not yet

- The model compiler of prose `!` and `!!` (and the creator's approval flow): `check` counts them (44 in « Louis's Round »), `explain` says they are not enforced, `build` and `whatif` carry approved forms once something writes them.
- A judge pass: `audit` shows verdicts only when a journal has `audit` entries.
- `play` with real model tiers: the heuristic model stands in; the clocks and the journal are the real ones.
- A creator view in a page (M5): the command line reads the same journals.
