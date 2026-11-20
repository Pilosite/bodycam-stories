# Working on a story pack (instructions for the narrative assistant)

You help a creator write a story for Bodycam Stories. The creator says what they want in words; you edit the pack's data, run the tool, show the diff and its effect in a replayed session, and commit. They review the diff and the effect, not code. Writing a world is a game too (P11): keep it quick, show it at once. The engine and the core (`src/`, `core/`) are not yours: for the rest of the repository read the root `CLAUDE.md`.

## Read first

1. `docs/principles.md`, P8 to P12 at least: everything not forbidden is possible; principles, not features; hard to fuzzy; creators are the point; every contribution keeps its author.
2. The bible of the pack (`docs/story-<pack>.md` when it exists), then `pack.json`, then the file the request is about.
3. `docs/pdl-spec.md` §2: the source grammar. `docs/characters.md` and `docs/patterns.md` when you touch a character or a pattern.

## The strengths and who enforces each

| Write | Strength | Who enforces it |
|---|---|---|
| `~0.8 text {id}` | tendency (weight 0..1) | the models, in context, when in scope; audited after a session |
| `? question -- note {id}` | open | the models decide, guided by the note (the note is required) |
| `> [context] fr: … \| en: …` | example | calibrates the soft statements of its file; an audit probe |
| `x [context] fr: … \| en: … \| why: …` | counter-example | the same, the other way (the why is required) |
| `when event(args) [once] [if cond] -> action(args), … {id}` | hard, explicit | code: a rule, no model involved |
| `! text {id}` | hard, prose | nobody yet: waits for a model to compile it into a rule and a creator to approve it |
| `!! never action(args) [if cond] {id}` | absolute, explicit | the validator rejects any transaction that matches |
| `!! text {id}` | absolute, prose | nobody yet: waits for compilation and approval, like `!` |
| `gauge id "label": rises … by n; fades n/min {id}` | gauge | code: a fuzzy quantity rules and models can name |

In a `facts` file, `!` is a fact that can be revealed (`reveal(f.x)`), `!!` canon, `?` left open on purpose. `node tools/story.mjs explain <pack> <id>` says who enforces a given statement and what refers to it.

## The loop

1. Before editing, have a session to compare with: `node tools/story.mjs play <pack> --script <pack>/scripts/<name>.txt` (writes `out/journals/<pack>/<name>.jsonl`). Write a script when none tests what the creator asks about.
2. Edit the data.
3. `node tools/story.mjs check <pack>`: no error before you show anything. Warnings are advice; say them.
4. `node tools/story.mjs whatif out/journals/<pack>/<name>.jsonl --pack <pack>`: the same player and the same answers against the pack as edited now.
5. Show the creator the diff (`git diff`) and its effect from the what-if: rules that fire or no longer fire, a promise kept or not, the first difference, in their words, not as a dump.
6. Commit in the right layer, with the author: a contributor's work goes in their own layer and file (`pack.json` layers), never into `base`; the commit message says what changed in the story and why.

## Rules

- Data, never engine code. If a request needs a word the engine lacks (a moving animal, a second voice, writing on a surface), say so and add it to `engine_wanted` in `pack.json`; do not fake it with a special case (P13, P18).
- One statement per line. Give it an `{id}` when anything else refers to it; never change an id something refers to without changing the references (`explain` lists them).
- Speech in every language of the pack: examples carry `fr: … | en: …`, every line key exists in every `lines/<lang>.json`.
- A tendency before a rule, a rule before an absolute. Most wishes ("more guarded", "funnier") are tendencies with an example and a counter-example. Reach for `when … -> …` only for something that must happen in code, and for `!!` only for what must never happen.
- The player never steers her (P1): no rule makes her obey the voice; promises (commitments) are the player's lever.
- Keep a pack small enough to read: a light character is three lines; a pattern is a shortcut, not an obligation.

## Reading a journal for a creator

`node tools/story.mjs audit <journal>` and `node tools/story.mjs journal <journal> --lang en`. Tell the creator, in this order: what the player asked; what she did and said; which rule fired and why (the rule's text is printed beside it); what was repaired or rejected and by which principle; promises made, kept or broken; gauges; rules that never fired (a rule that never fires in any session is either a dead branch or waiting for a session that tests it). `play` uses a heuristic model, not a real one: a tendency or an open question has no effect there, and its intents are guesses unless the script pins them (`say … => look marque-1`). Say so rather than reading meaning into it.

## Commands

`node tools/story.mjs` (or `npm run story -- …`): `check`, `build`, `explain`, `play`, `replay`, `whatif`, `audit`, `journal`, `new <pack-id>`. Every command takes `--json`. Details and worked examples: `docs/creator-kit.md`. Slash commands in Claude Code: `/story-check`, `/story-play`, `/story-whatif`, `/story-new`.
