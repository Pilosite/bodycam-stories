# Narrative patterns

A pattern is a reusable story shape written as PDL source in `patterns/<id>.pdl`: roles to bind, the facts a story must provide, principles and rules written against the roles (`$role`, `$role.attr`, `$param`), hints for beats, and named variations. A story **instantiates** a pattern with a small file in `stories/<pack>/patterns/` that binds every role; `tools/pack-check.mjs` expands the pattern's rules with the bindings and checks every reference.

Deviation from `docs/architecture.md`: the architecture sketches the library as `patterns/<id>.json`. Since its rules are `when … -> …` statements and its principles carry strengths, the library is PDL source too (`.pdl`), with the sections named after the fields: `summary`, `roles`, `facts_required`, `principles`, `rules`, `beats_hint`, `variations`.

## The library

| Pattern | Shape | Roles |
|---|---|---|
| `absent-one` | Someone who matters is gone; the story is the reading of what they left, until the carrier understands. They never appear. | absent, witness, trace*, resting_place, truth_clue, truth, understand_line; needs absence, truth |
| `ticking-clock` | A visible resource runs down with session time; it sets the length and offers an ending of its own. | clock, keeper, half_line, low_line, critical_line, warning_cue, run_out; params half, low, critical, degrade |
| `trail-of-signs` | A line of marks leads somewhere; the carrier reads them better than the player; the last one asks to leave the obvious way. | reader, sign*, leave_fact, destination; needs code |
| `reluctant-carrier` | The carrier did not choose to be here; trust is earned request by request. | carrier, threshold, please_line, trust_fact |
| `argued-fork` | The way splits; the player proposes, the carrier argues, then decides. | chooser, fork, option* |
| `slow-light` | No clock: time is the light changing; endings come only from decisions. A drop-in replacement for `ticking-clock`. | keeper, wrap_line; params step, steps, long_s |

`*` marks a role bound one or more times; a rule that mentions it is repeated per binding.

## How Louis's Round uses three

| Instance | Pattern | Bindings (abridged) | Rules it brings |
|---|---|---|---|
| `louis-absent` | absent-one | absent = louis, witness = sam, trace = platiere / affut / terrier (each with its fact and line), resting_place = affut, truth_clue = f.sett, truth = f.louis-stayed | three trace readings; the truth lands when she looks at the hide after seeing the sett |
| `battery-clock` | ticking-clock | clock = battery, keeper = sam, warning_cue = camera.beep, run_out = battery-dies | half, low, critical (image degrades, speech halves), run-out ending |
| `louis-marks` | trail-of-signs | reader = sam, sign = marque-1 / chablis / ruban, leave_fact = f.marks-lead-down, destination = hide | one reading per mark |

They contribute 11 of the pack's 22 rules; the other 11 are creator rules (10 base, 1 from the contributor layer). `reluctant-carrier` and `argued-fork` are not instantiated: Sam's reluctance and the argued fork at the platière live in her sheet and in `beats.json`, which shows that a pattern is a shortcut, not a requirement.

## Swapping one pattern: ticking-clock → slow-light

Replace `stories/louis-round/patterns/battery.pdl` with:

```
# battery-clock — pattern instance
@id battery-clock  @kind pattern-instance  @pattern slow-light  @layer base  @author toine
## bind
bind keeper = sam
bind wrap_line = light.rise
```

What changes in the pack (this is exactly what `tests/pack.test.mjs` checks):

- The four battery rules disappear (no `clock.below` anywhere); two new rules appear: the sun rises one degree a minute for twelve minutes, and after fifteen minutes Sam starts to wrap up.
- The ending `battery-dies` is declared `trigger: rule` and nothing triggers it any more: the checker warns. The creator either deletes that ending family or keeps it as a dead branch. The two remaining endings both require a decision at the hide, so every session now ends on Sam's choice.
- Sam's hard statement "below 10% battery she says it once, then talks half as much" no longer has anything to apply to; it stays harmless, and the principle audit will report it as never relevant.
- The session gets longer and calmer; transitions no longer cost anything. The bench requests that lean on the battery ("go faster, the battery is going down", "stay until tonight") change their expected outcome from argues to does-it or deflects.

The other swaps are as cheap: `trail-of-signs → argued-fork` moves the weight from reading marks to arguing at the fork (the marks remain objects, but looking at them reveals nothing by rule; the staging tier must carry it); `absent-one` with variation `alive` changes an absolute and needs a visible character, which the engine does not have (see the engine wishlist in `pack.json`).
