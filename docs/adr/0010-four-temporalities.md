# 0010. Four temporalities, and the beats of the present

Status: **proposed** (20 November 2026, from Toine's words the same evening). It changes a contract (the `horizon` of every statement and transaction), so it is implemented only once he confirms the two questions at the end.

## Context

Toine: the aim, in the end, is real-time AI: an instant reaction, creative answers synthesized meanwhile, « des demi-tempos de quelques centaines de millisecondes pour réagir, et en parallèle anticiper les actions suivantes ». And: in the semantic framework, events, facts, processes, anything, must be written down « en fonction de quelques niveaux de temporalité : immédiate, conséquence, environnement, long terme. Ce n'est pas si compliqué, il faut juste l'adapter à des interactions agentiques. »

Today the core has three horizons (`now`, `scene`, `story`). What the world does on its own (light, weather, other people, the battery) has no level of its own: it lives in rules on the world's clock, mixed with the consequences of what the player said.

## Decision

**1. Four temporalities. Everything in a story (event, fact, rule, process, gauge, pattern, promise) belongs to exactly one.**

| Level | The question it answers | Its clock | Who decides | In « Louis's Round » |
|---|---|---|---|---|
| **Immediate** | What happens right now, in answer? | tenths of a second | reflex code, then a choice among prepared options, then a short invention | she turns, she says "Wait.", she looks where you said |
| **Consequence** | What does that set off? | seconds | rules, promises falling due, a mid model staging the reaction | the mark she reads reveals a fact; the promise about the jay comes due |
| **Environment** | What is the world doing on its own? | continuous, the world's clock, whether or not anyone speaks | processes and gauges in code; a model only when something must be invented | the light rises, the battery drains, a walker arrives, a jay calls |
| **Long term** | Where is the story going? | minutes and beyond | patterns and beats from the author, a large model preparing ahead | the trail of signs, the absent one, what is ready at the next station |

The three clocks of P20 become four lanes with the same rule: a slower lane may enrich or correct a faster one; it never makes it wait. The environment lane is what makes the game live rather than turn-based: the world does not wait for the player.

**2. The present has beats.** A reaction is not one answer but a short sequence, each step with its own means:

| Beat | Target | Means | What the player perceives |
|---|---|---|---|
| 0 | under 100 ms | code | she heard: a movement, a breath, a look |
| half-beat | a few hundred ms | a choice among prepared options (decision model, frontier) | a first word or act, chosen |
| 1 | one to two seconds | invention (a generative model, compact output, ADR 0009) | the answer that nobody wrote |
| meanwhile | in parallel | the slower lanes | the next likely requests are being prepared |

These are targets, not measurements. The journal records each beat with its latency, so that the day faster models exist, the same story simply plays tighter.

**3. Written by level.** In the authoring source, the level is part of every statement (a default per file, an override per line), and the tools show a story by level: what is immediate, what follows, what the world does, what is long. A creator can ask for "everything the forest does on its own" or "everything that happens within a second of a shout".

## Consequences

- `horizon` goes from three values to four (`now`, `next`, `world`, `story` as working identifiers). The validator, the journal, the guide's lanes and the golden journals follow. `scene` content splits between `next` (set off by an act) and `world` (set off by the clock).
- The clocks get an environment loop of their own, driven by the world's clock, and the now loop gets its beats.
- The frontier (prepared options) becomes central: it is what the half-beat chooses from.

## Questions for Toine

1. **Is "environment" a lane of its own** (its own loop, its own budget, visible as a fourth clock), or a kind of content inside the others? Assumed: its own lane.
2. **« .md »**: should the authoring files literally be Markdown files, so that any editor or assistant shows them as documents? They already read like Markdown (titles, sections, one statement per line); the change would be the extension and a few conventions. Assumed: yes, later, as a cosmetic change; nothing depends on it now.
