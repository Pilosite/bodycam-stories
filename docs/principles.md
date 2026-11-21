# Bodycam Stories — founding principles

This is the constitution of the project. It comes before the architecture, the plan and the code, and it outlives any conversation. A change here needs an ADR and Toine's explicit agreement. Every brief, every review and every milestone is checked against it.

Source: Toine's statements of 19 and 20 November 2026, restated (last additions on the evening of the 20th: the game table, "the player is not the player", creating as a game, P22). Where a principle is my reading rather than his words, it is marked *(reading)*.

## What Bodycam Stories is

A place where people come to **tell themselves stories**: to enter an atmosphere, a universe, a situation, and see what happens. Its value is the richness of what can be imagined and lived, not reaction speed. The agents, the language and the engine exist to serve that, and are replaceable; the experience below is not.

The model is the **game table**, not the rule book. Around a table, a player says what they want and a game master rules on it, whatever it is; the dice and the stat sheet are a detail. That freedom, with the dynamism of real time, is what we are after.

And every Bodycam Stories game is a game where **the player is not the player**: you are never the one who acts, you are the one who talks *with* the person who acts. This is true of every story on the platform, by construction.

There are three ways to play, and all three are games: **living a story** (talking with the one who is there), **writing one** (P11), and **hosting one**: a person may sit in the game master's chair of a live session and steer it for the players, in place of or alongside the models (P12). What we show first is never the constraint ("you cannot act") but what it opens: immersion, and the fact that anything that can be said can happen.

The founding postulate is **non-deterministic and procedural**: everything is generated, and nothing is decided in advance unless an author chose to fix it. It is not a slow game either: the world lives in real time and does not wait for the player; the aim is an instant reaction, with slower intelligence enriching it as it arrives (P20, ADR 0010).

It is a human experience, as real tabletop role-playing is: the generated image, sound, voices and story are a medium at the service of play that people drive, alone or together.

Under it lies one bet: **semantic engineering**. We are building a system that translates what a story is, and what a game is, into something a machine can run, starting from words.

## The two key drivers

Every design choice is weighed against these two, in this order of layers:

1. **Creativity.** The range and richness of what can be imagined, told and lived. This is why people come.
2. **Reactivity of the present.** What happens right now, between the player and the character, answers at once. The layer that handles the present is deliberately lean: little AI, fast AI, nothing that waits.

They do not compete, because they do not live in the same layer. Like a film, a story has what is happening now, what is brewing in the scene, and what is being prepared far ahead. Each has its own clock and its own means, and **the slow layers never hold the fast one back** (P20).

## A. The experience

**P1. You never hold the character's controls.** The heart of the game is speaking in the head of someone who is in the world: they understand, agree, argue, refuse and act on their own. That is the main arc, and it is the identity of the game, not a limitation to work around. It is not the only lever. From where the player stands, they may also act on the world itself when the story grants it: change the weather or the hour, make a sound, move a thing, set off an event, so as to push a character toward something or to see what happens. Both levers are indirect with respect to the character: one persuades, the other changes the circumstances. Who the player is, is the author's choice: a voice on the line in one story, a ghost, an object, an idea that has to spread in another; and so is what they can do to the world (a **power**, granted or not, wide or narrow). *Check: there is no input that moves a character's body or makes them act; everything the player does to the world is a transaction in the one channel, allowed by a power the story grants, and journaled like any other.*

**P2. The lens is imposed on purpose.** One body camera, one subjective view, the look of phone footage. The frame constrains what can be asked and seen, and that constraint is the art direction: it is what makes an open world of possibilities elegant and tractable. *Check: nothing is shown that the camera could not have filmed.*

**P3. The world is a bubble around the carrier.** The world exists where the character is, as far as the camera reaches, and is made as it is needed. The character can move, and the bubble moves with her. We do not build maps; we build what surrounds a person in a situation. *(reading)* v1 uses the smallest bubble (a few stations); autonomy and range grow version by version.

**P4. You arrive in a story.** A story is something you drop into: a place, a moment, a person already in the middle of something. Stories can be short and self-contained, like episodes, and a player can go from one to another. Arriving, working out where you are and who you are with, is part of the play. *(reading, from the Quantum Leap reference: the player is the companion who can see and speak but cannot touch; we take the structure, never the show's characters or plots.)*

**P5. The character is a person.** She has a will, a voice, limits and a past. She understands, agrees, argues, refuses, gets things wrong, and can break her word. The imprecision of the models is absorbed here and becomes character.

**P6. Foresight is the player's lever.** Because the player cannot act, their power is to prepare: to agree with the character on what to do if something happens. These commitments are recorded in the story and honoured or broken later.

**P7. Depth is prepared, the present is immediate.** We optimise atmosphere, coherence and the feeling that anything can be told, and we get that depth from the layers that have time. The present moment must still answer at once: the character reacts, even if the full consequence arrives a little later. Time the system needs to think is given to the character as time to act or hesitate, never to the player as waiting.

## B. Authoring: for players and creators alike

**P8. Everything that is not forbidden is possible.** There is no list of features. A player may ask for anything; a creator may establish anything. The system's default answer is to make it happen within the world's laws, and it refuses only what a principle forbids or what cannot physically be shown. *Check: the validator repairs before it rejects, and every rejection cites the principle or bound that caused it.*

**P9. Principles, not features.** The systems people know from other games (a law that reacts to the player, reputation, needs, factions, an economy, day and night, stealth, relationships) are never coded as features. They are stated as principles and emerge from them. A narrator writes "if he comes round too often, the police start to take an interest", and that is enough. *Check, the litmus: a wanted-level system, a reputation system and a guard-and-crime system can each be written in the authoring language alone, with no new code.*

**P10. The whole spectrum, from hard to fuzzy.** Players and creators can both state things that must hold (deterministic, run by code), things that tend to hold (fuzzy, weighed by a model in context) and things left open (decided in the moment). Fuzzy notions such as "too often", "close", "late", "angry" are first-class: they are named quantities that rise and fade, and principles refer to them in words. No one should have to write a complicated rule to get a simple effect.

**P11. Creators are the point, and creating is a game.** An author is not there to set limits but to lead the imagination: what they write into a story (a character, a pattern, a moment that must come) is an intention the world works toward, never a fence around the player. The project lives if people come and write stories in it. Writing a world, watching players meet it and adjusting it must be as playable as living a story: quick to try, visible at once, never a chore of configuration. Every mechanism must be something a creator can state in words, see at work, and adjust. Most creators talk to an assistant; a few open the backend. A player who makes commitments is already writing rules: the path from player to creator is continuous.

**P12. The narrative space is shared.** Stories are made by several hands, and can be run by a person: a human game master is one more author, whose rulings go through the same channel as a model's (P16) and are journaled the same way. Play happens in sessions. Everything in a story keeps its author, so that contributions can be layered, merged, credited and revised.

## C. The engine

**P13. Procedural at the root.** Everything shown is made by code from a description. Nothing is predefined: no asset, no hard-coded object, place or line. When a request fails, the vocabulary grows; a special case is never added.

**P14. Cost does not depend on content.** The budget per frame is fixed. A richer world is rendered more coarsely, not more slowly.

**P15. The camera's flaws are our cover.** Grain, compression, exposure and motion blur make it credible and hide the engine's shortcuts. Credible beats beautiful.

**P16. One channel, replayable.** Nothing changes the world except a transaction in the intermediate language. Decisions are indeterminate; their execution is deterministic. A session can be replayed from its journal.

**P20. Three clocks, decoupled.** The present (what is happening), the scene (what is brewing here) and the story (what is being prepared far ahead) are separate layers. Each has its own latency budget and its own kind of intelligence: reflexes and the leanest models for the present, fuller models for the scene, the largest for the story. They talk only through the intermediate language, asynchronously. A slow layer can enrich or correct what a fast one did; it can never make it wait. Not knowing what the player will do next (go back to the car, or stay) is the business of the slow layers; answering what he just said is the business of the fast one.

**P21. Hexagonal.** The narrative core (story state, principles, horizons, commitments) knows nothing of the engine, the models, the input device or storage. Each is reached through a port and can be replaced without touching the core. This is what lets the rendering, the models and the tools evolve while the gameplay stays.

**P22. A semantic engine on several levels: invention and judgement are different instruments.** AI serves the story in two distinct ways, never confused. *Invention* is the creative edge: generative models write what nobody wrote, in three sizes matched to the three clocks (fast, mid, large). *Judgement* is synthesis: decision models turn something open (a sentence, a situation, a fuzzy notion) into a typed answer the code can act on (yes or no, one of these, how much), with a confidence. A generative model is never asked to judge when a judgement will do, and a judgement never writes. Which instrument reads which thing is an explicit choice, recorded in `docs/architecture.md`. *Check: every model call in the journal is either an invention or a judgement, and says which.*

**P17. What happened can be read, and it feeds everything.** The engine and the stories grow from what players and narrators actually do: what was asked and could not be done, what was improvised, what was slow or doubtful is collected from the first day (ADR 0011). Those who keep a story alive must be able to see what players did, how the world and its principles reacted, and why, in order to refine them.

**P23. The game grows from play, and everything can be steered.** Because nothing here is deterministic, what people actually do in the game, players, narrators and ourselves, is the material the game is made from. Every session feeds every layer: the things and sounds that can be shown and heard, the characters, the stories and their subtleties, and the engine itself. Nothing harvested changes anything on its own: it becomes a proposal, a person accepts it, and it enters as data with its author (P12). And every layer can be steered from the outside: vocabulary, models and their tiers, prompts, thresholds, budgets, principles and packs are data that can be read, changed, versioned and rolled back, never behaviour buried in code. *Check: for any behaviour seen in a session, one can point to the data that produced it and change it without touching the engine's code; and any request the game could not serve shows up, counted, in the next harvest.*

## D. How we go

**P18. Crescendo.** Each version shows less than we imagine and does it for real. What is too hard is written down as later, not faked. Dynamism (movement, initiative, range, persistence) is introduced step by step.

**P19. Nothing staged.** A demonstration may be simple; it may not pretend. If a panel shows agents at work, agents are at work.

## What these principles rule out

- A control scheme for the character: a stick, a "use" button, a cursor that makes them act. (Acting on the world itself, where a story grants it, is not ruled out: P1.)
- A camera that leaves the body.
- A feature built for one kind of object, creature or situation.
- A rule language so precise that only a programmer can write it.
- Refusing a request because nobody planned for it.
- An answer in the present that waits for a slow layer.
- A slow model on the path between the player's words and the character's first reaction.
- A stat sheet that decides in place of the table: numbers may inform a ruling, they never replace it.
- A story in which the player is the one who acts.
