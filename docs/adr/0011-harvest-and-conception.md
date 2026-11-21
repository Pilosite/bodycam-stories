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

**3. From harvest to growth: propose, accept, enter (P23).** What is harvested is turned into proposals, each addressed to the layer it would enrich and to the person who owns that layer:

| Proposal | Becomes | Accepted by |
|---|---|---|
| a thing or a sound players asked for and the engine lacked | an entry of the model library or a sound recipe; when that is not enough, a line on the engine's vocabulary wishlist | the engine's owner |
| a person, a name, a fact, a place a model improvised | statements in a pack (character, fact, open question), with the session as their source | the story's author |
| a way of speaking or reacting that worked, or grated | a tendency, an example or a counter-example on a character sheet | the story's author |
| a judgement that was often unsure, a call that was often slow | a prepared option, a compiled rule, a threshold or a budget | the engine's owner |

Nothing is applied without a person's yes. Accepted proposals enter as data, with their provenance.

**4. Everything is steerable.** All that tunes behaviour is data in the repository and visible in the tools: vocabulary, model tiers and adapters, prompts, confidence thresholds, latency budgets, principles, packs. A change is a commit; a session records the versions it ran on, so any behaviour can be traced to the data that produced it and replayed against a change.

**5. The narrator's lean loop.** For whoever keeps a story alive, the harvest closes a loop: write, let people play, read what happened, improve or extend the scenario and its events, and again. Reading takes two forms, both over the same records: **figures** (where players go, what they ask most, which rules fire and which never do, promises kept and broken, where sessions end, what was asked and could not be done) and **insights** written by a model that has read the sessions (what players were trying to do, what surprised them, what the story lacks), each insight pointing to the sessions it comes from. Because a story is a folder of plain words in a repository and a harvest is a set of files, the whole loop runs in the narrator's own assistant (Claude Code, Codex, Antigravity or another) as well as in the project's tools: `story harvest` gives the figures and the proposals, the assistant reads the records and writes the insights, the narrator decides.

## Consequences

- P17 grows: what happened can be read, and it feeds the engine and the stories.
- The legacy free mode (the French "meneur" path) and the story mode (the core) must both emit the harvest record; converging the free mode onto the core is the real fix and is part of the conception lot.
- The creation pipeline (`docs/creation-pipeline.md`) gains its missing stages for real: characters, facts, questions and patterns from a prompt.
