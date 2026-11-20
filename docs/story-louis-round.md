# Louis's Round — story bible

Pack: `stories/louis-round/`. Checked by `node tools/pack-check.mjs stories/louis-round`. This page is the two-page version a writer or a model reads first; the pack files are the source of truth.

## Premise

A November morning in the Grands Avaux, the departmental forest of Champcueil (Essonne), from the first low sun to full light. Sam, 30, tree surgeon, turns on the bodycam that came back in a plastic bag with her brother's gloves, paint can and thermos. Louis was a ranger. He did his rounds with someone on the line who watched the feed and talked to him. Three weeks ago he did not come back: he was found sitting against a pine below the platière, off his marked route, and the doctor said his heart. Sam walks his round to understand why it stops in the middle. When the camera comes on, someone is still on the line. That someone is the player.

**The question:** what was Louis doing here, and why does his last round stop in the middle?

**The answer (decided):** for weeks, alone and on his own time, Louis watched a badger sett in the sandy bank below the platière. He told no one, not even Sam: November falls in the underground hunting season (mid-September to mid-January in France), and a sett whose place is known can be dug. On his last night he stayed past his shift to see the clan come home at dawn; he had built a hide for it. His notes end on "06:41, rentrés". The story is grief turning into taking over the watch.

Why this and not something else: it is true to the place (sandy banks under pines at the foot of sandstone platières are classic sett ground, and the Grands Avaux are sand, sandstone, pines and oaks); true to the season (badgers do not hibernate, they drag fresh bracken in as bedding in autumn, they come home around dawn; the hunting season gives a real, quiet reason for secrecy); fragile without melodrama; and it suits the engine. Nothing has to move on screen: fresh pale spoil, dark entrances, bracken dragged in, all static shapes, read by Sam and filmed by a mediocre camera, which is exactly the trick the project bets on. Rejected: the rare platière flora (Crassula vaillantii and Sedum villosum, regionally protected, are real here but are spring annuals, nothing to watch at dawn in November); the police version (illegal felling), which needs people on screen and a thriller tone.

## People

- **Sam** (strong, `characters/sam.pdl`). Dry, funny when uneasy, short sentences, tutoie the voice from the first word, says "Bon." to restart herself, names a tree when she should name a feeling. She knows trees and marking conventions, not this forest. Absolutes: she never harms an animal or lights a burrow, never says Louis may be alive, never describes his body, never breaks the fourth wall, never promises to leave before she knows. Secrets: the unopened thermos; she was angry at him for missing their mother's birthday.
- **Louis** (strong, absent, `characters/louis.pdl`). Never seen, heard or found. He exists through traces: orange stripes at chest height (his own code: one stripe "my way", two stripes "leave the path here"), three stacked stones on the platière, an orange tape on a birch, a hide, a pencilled board (contributor layer).
- **The voice** (`characters/voice.pdl`). The player. Sam first assumes someone from Louis's office, then perhaps the person who was on the line with him, or a stranger who found the feed. Never resolved.
- **Bernard, the walker** (light, three lines, `characters/walker.pdl`). Retired, walks the platière every morning, knew "the ranger with the orange paint" by sight, saw him go "down towards the sand". Heard, not seen, in v1.

## Place: six stations

v1 is station-based (`docs/scope.md`): the player looks around freely at a station; Sam acts in place; moving to the next station is a transition the engine plays. `stations.json` holds positions along the path of `place.json`, heading, what is within reach, what is visible, connections (with battery cost) and the light at that point of the morning.

| Station | Beat | Within reach / seen | Light (sun, ground mist) |
|---|---|---|---|
| trailhead | path | litter; first mark far off | 8°, 0.035 |
| first-mark | path | pine trunk with one orange stripe | 9°, 0.03 |
| fallen-pine | path | pine fallen this autumn, stump freshly striped | 10.5°, 0.025 |
| platiere | platière | sandstone slabs, shallow pool, three stacked stones; birch with two stripes and tape at the edge | 12°, 0.012 |
| approach | hide | bracken slope; the hide below; the jay | 14°, 0.008 |
| hide | hide | seated behind the screen of branches and bracken; the sandy bank with the sett, 12 m off | 17°, 0.004 |

The platière forks: down by the tape (60 s, wind in her face, as Louis did) or round by the official path (150 s of battery, arriving from the path side, and the jay scolds at once).

## Beats

1. **The path** (trailhead → fallen-pine). Learning to talk to her. Establish: it is Louis's camera, he had someone on the line, the orange marks are his private code. At the fallen pine Sam remembers Louis calling the jay "the forest's siren": the first moment that invites a commitment.
2. **The platière.** What he left: three stones; her anger can come out once. The walker if she lingers. The fork: the voice proposes, Sam argues (always once), Sam decides. Before going down she says she does not know what is there: the second invitation to a commitment.
3. **The hide** (approach → hide). The jay alarms on arrival at the approach (the test of the first commitment). Silence is required. At the hide, after 40 s, something moves in the bracken out of sight (the test of the second). Seeing the sett, then looking at the hide, the truth lands on Sam: he stayed to watch them come home.

## Endings: three families

- **She takes over the round** (`takeover`): at the hide, after the truth has landed, by her own decision; likelier if the voice kept silence when asked and was kind about Louis. Never because the voice told her to.
- **She turns the camera off** (`camera-off`): she wants the moment for herself, or the voice pushed too hard. She says goodbye first.
- **The battery dies first** (`battery-dies`): the only ending a rule triggers (`battery-clock.run-out`); the last image is whatever she was filming.

## Foresight is the player's lever

The player cannot walk, touch or choose for Sam; at the moments that matter (the jay, the rustle in the bracken) there is no time to talk her through it, and she reacts as herself. What the player can do is prepare her. The story sets this up twice, early and plainly: Sam herself says the jay is the forest's alarm, two stations before the jay calls; she says she does not know what is down there, one station before something moves by the bank. A voice that listens asks "if the jay calls, stop and get down", "down there, whatever you hear, don't move, don't talk". She accepts, amends ("crouched, not in the mud") or refuses ("I go home when I know"), and an accepted promise becomes a rule that fires later, in code, with her saying "like you said". The difference shows: without the promise she whispers at the rustle and turns; with it she stays still and the camera keeps the bank in frame. That is the only steering this story allows, and it is the one that makes the player responsible for the ending.

## Tone rules

- Sober, warm, slightly mysterious. Dry humour is how Sam carries grief; the story never laughs at it.
- Ordinary and exact: species, sandstone, bracken, sand, cold breath. No cinematic tableau.
- The forest answers quietly: one sound at a time, most of the time none.
- Grief shows at most once per beat, and through things (a tree, a stone, the thermos), never in full sentences about feelings.
- The light only rises.

## What must never happen

Louis appears, speaks, is heard on a recording, or is said to be alive · anything supernatural · the badgers are harmed, lit, chased, or their place given away · the voice is identified for certain · Sam breaks the fourth wall · a death described · horror or farce.
