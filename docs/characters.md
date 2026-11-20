# Characters: light and strong

A character is PDL source in `stories/<pack>/characters/<id>.pdl`. The header and metadata say what it is (`@kind character`, `@strength light | strong | role`, `@presence absent` for someone who never appears); the body is statements with strengths (`!!` absolute, `!` hard, `~w` tendency, `?` open question with a note, `>` example, `x` counter-example). The checker enforces the shape; the model tiers and the fallback lines consume it.

## Light: three lines

```
# walker — character (light)
@id walker  @kind character  @strength light  @name Bernard  @layer base  @author toine  @lang fr  @scope character  @horizon scene
~ Retired, walks the platière every morning, knew Louis by sight as "the ranger with the orange paint".
~ Talks too much about mushrooms and the weather, kind, a little deaf; leaves on his own after a minute.
~ Never knew about the sett; can say he saw the ranger "going down there, towards the sand" more than once.
```

One to three tendencies, no sections, a name. Enough for a model to play a minute of a secondary person, and nothing to maintain. The checker refuses a light sheet with sections or more than three statements: if it needs more, it is a strong character.

## Strong: a full sheet

Sam (`characters/sam.pdl`) has the sections `identity`, `voice`, `knows`, `does-not-know`, `limits`, `secrets`, `arc`, `word` (commitments), `body`, `examples`, `counter-examples`. The carrier of a pack must reach minimums the checker enforces: 3 absolutes, 6 hard statements, 12 weighted tendencies, 6 open questions, 20 examples, 8 counter-examples. Sam has 5, 20, 24, 8, 25 and 9.

How each strength is meant to work:

| Strength | Sam example | Who enforces it |
|---|---|---|
| `!!` | `She does not promise to leave the forest before she knows what Louis was doing.` | the validator rejects a transaction (or a commitment) that breaks it |
| `!` | `She does not shout within 30 m of the hide.` | compiled once into a rule (here already written by hand as `r.no-shout` in `rules/hide.pdl`) |
| `~w` | `~0.7 When she is moved, she names a tree instead of the feeling.` | the staging tier, in context; scored by the audit |
| `?` | `? Does she take orders about Louis? -- not at first; after the platière…` | the model decides, guided by the note |
| `>` / `x` | `> [the jay alarms] fr: Un geai. Il gueule pour nous. … | en: A jay. …` | calibrate the voice; double as audit probes |

An absent strong character (Louis) needs only `identity` and `traces`: he is never played, only read. His sheet is what keeps the traces coherent (the marks, the stones, the hide all say the same man) and what the absolutes protect (`!! Louis is dead; he is never seen, heard or found alive`).

The player's role (`voice.pdl`, `@strength role`) is a third kind: it says what the character assumes about the voice and what the voice can do through her.

## How a sheet feeds the model tiers

- **Translation tier** (fast, small): receives the hard and absolute statements as short constraints, the intent classes of the pack, and the open questions' notes. It does not need the examples.
- **Staging tier** (mid): receives the whole sheet minus secrets not yet unlocked, ordered by strength, with tendencies sorted by weight and the 6 to 8 examples nearest to the current situation (matched on their `[context]`), plus two counter-examples. Weights become wording: 0.9 and above "always", 0.6 to 0.9 "usually", below 0.6 "sometimes".
- **Background tier** (large): the full sheet, secrets and arc included, to plan the frontier.
- **Validator**: the `!!` statements, as rejections, and the commitment absolutes (`sam.word.*`).
- **Audit** (after a session): every `~` and `?` becomes a question to a judge pass ("was she dry and funny when uneasy?"); every `>` and `x` becomes a probe (the closest real line is compared to it). The creator sees, per statement, relevant / respected / broken.

## How a sheet feeds the fallback lines

`lines/<lang>.json` holds lines keyed by situation (`mark.read.1`, `commit.amend`, `battery.critical`…), said when no model answers in time. They are written in the voice the sheet describes, and the best examples of the sheet are reused verbatim (the `>` lines for the jay, the cairn, the ending). Rules and stations name line keys (`say(jay.alarm)`, `arrive_line`), and the checker requires every key in every language. A line can name another speaker (`{ "speaker": "walker", "text": … }`), which must be a character of the pack.

Commitment lines (`commit.accept`, `commit.amend`, `commit.refuse`, `commit.keeping`, `commit.broken`) are the fallback for pillar 9: if the model is slow, she still answers the promise in her voice, and an amended promise is completed by the staging tier when it arrives.
