# 0011. Everything is harvested; a story is conceived before it is played

Status: **accepted in principle** (Toine, 20 November 2026, after a free session on his phone); the two lots below implement its first version.

## Context

Toine prompted a world (a family around a camp fire at night), played it on his phone and sent the journal. What happened:

- The place was built, with four chairs. The engine cannot show people, so the chairs were empty.
- The model played the carrier well and improvised, turn by turn: a wife who is not on her chair, two children, Léo (4) and Manon (7). One fact was recorded live.
- Nothing had been conceived beforehand: no character, no relation, no stake. « Le modèle aurait dû écrire une histoire ou solliciter le créateur au moment de la conception pour avoir ses inputs. »
- Each answer took 4 to 7.5 seconds, with a single immediate gesture in six turns. This is the legacy free mode; the now loop of the story mode does not serve it yet.
- « Le moteur, on va l'enrichir au fur et à mesure, avec nos essais mais aussi avec ce que les narrateurs et joueurs feront. Faut le prévoir dès le départ de tout pouvoir aspirer. »

## Decision

**1. Conception comes before play.** When a world is prompted, the model does not stop at the place. It writes a first story sketch in the authoring language (who is here, how they relate, what the carrier knows and does not know, what is at stake, two or three open questions, the patterns it leans on), and it may ask the creator a few questions when an answer would change the story ("Where is the mother?", "What does the voice want?"). The creator answers in a word, picks a suggestion, or says "surprise me". The sketch is authored by the model and the answers by the creator: both keep their provenance and both can be edited afterwards like any pack (P11, P12). What the engine cannot show yet (people, here) is stated in the sketch and played as it is (voices, empty chairs), never hidden.

**2. Everything is harvested.** Every session, in every mode, produces one record that can be collected: the journal, the pack and engine versions, the device, and three derived lists that say what to build next:

| List | What it holds | What it feeds |
|---|---|---|
| asked and not doable | requests the engine or the vocabulary could not serve (the executor's gaps, refusals for lack of means) | the engine's vocabulary: what to add next |
| improvised | facts, names, places and people a model made up in play | the story: statements a creator can promote into the pack |
| slow or doubtful | calls over budget, low-confidence judgements, repairs and rejections | the framework: where to prepare, compile or tune |

Records are kept where the page runs (the artifact's shared store when there is one, else the browser, always copyable), pulled into the repository by a tool, and summarised by another. A player's words are personal: a record is collected only after a clear notice in the page, and the harvest tool can strip the sentences and keep only their classes.

## Consequences

- P17 grows: what happened can be read, and it feeds the engine and the stories.
- The legacy free mode (the French "meneur" path) and the story mode (the core) must both emit the harvest record; converging the free mode onto the core is the real fix and is part of the conception lot.
- The creation pipeline (`docs/creation-pipeline.md`) gains its missing stages for real: characters, facts, questions and patterns from a prompt.
