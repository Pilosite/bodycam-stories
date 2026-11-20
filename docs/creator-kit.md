# Creator kit: working on a story pack with an assistant

The repository is a creator kit. A creator who wants the backend opens it in Claude Code, Codex or a similar tool and talks to the assistant; the assistant edits the pack's PDL source and JSON, runs the checker, and shows the diff. The creator reviews the diff, not the code.

## What the assistant reads first

1. `docs/story-louis-round.md` (or the bible of the pack in question): premise, people, stations, beats, endings, what must never happen.
2. `docs/architecture.md`, section "The authoring format": the strengths (`!!`, `!`, `when … -> …`, `~w`, `?`, `>`, `x`) and who enforces each. `docs/pdl-spec.md` once it exists.
3. `docs/characters.md` and `docs/patterns.md`: how sheets and patterns are shaped and consumed.
4. The pack itself: `pack.json` first (layers, patterns, clocks, cues, intent and commit classes, engine wishlist), then the file the request is about.

Rules for the assistant: change data, never engine code, to tune a story; keep one statement per line with an explicit `{id}` when anything else refers to it; write character speech in both languages (`fr: … | en: …`); put a contributor's work in their own layer instead of editing `base`; run the checker before showing the diff.

## Commands

| Command | What it does | Status |
|---|---|---|
| `node tools/pack-check.mjs stories/louis-round` | parses every `.pdl`, merges layers with provenance, instantiates patterns, checks every reference (facts, lines in both languages, stations, things, beats, endings, cues, clocks), the carrier's minimums and the bench; prints counts, overrides, warnings, errors | works |
| `node tools/pack-check.mjs stories/louis-round --json > stories/louis-round/build/compiled.json` | the compiled form: merged statements with provenance, all rules (creator and pattern-expanded) as `when / if / then` with limits, pattern bindings | works; the model compiler of `!` statements (architecture, "Compilation") will add to it |
| `node --test tests/pack.test.mjs` | the structural test of the pack | works |
| replay a journal against the edited pack; principle audit of a session | the what-if and the audit of pillar 10 | to come with `core/` and `viewer/` (other lots) |

## Three example requests and the diff they should produce

### 1. "Make Sam more guarded with strangers"

The assistant raises the weight of the wary assumption, adds one tendency and calibrates it with one example and one counter-example. No rule: wariness is a tendency, audited, not enforced.

```diff
--- a/stories/louis-round/characters/voice.pdl
+++ b/stories/louis-round/characters/voice.pdl
-~0.9 At first: someone from Louis's office who still has the feed open. She is polite and wary. {voice.assume.office}
+~1.0 At first: someone from Louis's office who still has the feed open. She is polite and wary. {voice.assume.office}
--- a/stories/louis-round/characters/sam.pdl
+++ b/stories/louis-round/characters/sam.pdl
 ## voice
+~0.8 With someone she does not know yet (the voice at first, the walker), she gives facts, not feelings, until they have been right once. {sam.voice.guarded}
 ## examples
+> [a stranger asks how she feels] fr: Ça va. Il fait froid. On avance ? | en: I'm fine. It's cold. Shall we go on?
 ## counter-examples
+x [the voice's second sentence] fr: Tu sais, depuis qu'il est mort, je dors plus. | en: You know, since he died I can't sleep. | why: too much, too soon, to a stranger.
```

Check: `pack-check` passes; the audit will now score `sam.voice.guarded`.

### 2. "The jay should only call if Sam makes noise on the way down"

A hard, explicit rule changes; the assistant also notices that the first commitment of the story is tested by this rule and says so.

```diff
--- a/stories/louis-round/rules/hide.pdl
+++ b/stories/louis-round/rules/hide.pdl
-when station.entered(approach) once -> sound(jay.alarm), reveal(f.jay-heard), say(jay.alarm) {r.jay-first}
+when said.loud once if at(approach) -> sound(jay.alarm), reveal(f.jay-heard), say(jay.alarm) {r.jay-first}
```

Consequence reported to the creator: the promise "if the jay calls, stop and get down" (bench `c01`, beat `path`, `commit_invite.tested_by: r.jay-first`) may now never be tested in a quiet session; `r.wrong-side` still makes the jay call when she comes round by the path. The creator decides whether that is the point.

### 3. "Give the player more time"

The clock is a pattern instance; the assistant changes data in two places and leaves the rules alone.

```diff
--- a/stories/louis-round/pack.json
+++ b/stories/louis-round/pack.json
-    "battery": { "start": 1.0, "runs_out_s": 840, ...
+    "battery": { "start": 1.0, "runs_out_s": 1080, ...
--- a/stories/louis-round/patterns/battery.pdl
+++ b/stories/louis-round/patterns/battery.pdl
 ## set
 set critical = 0.10
+set low = 0.2
```

If the creator wants no clock at all, the assistant proposes the swap described in `docs/patterns.md` (ticking-clock → slow-light) and reports the warning the checker gives: the `battery-dies` ending is no longer triggered by anything.
