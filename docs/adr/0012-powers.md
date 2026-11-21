# 0012. Powers: what a player may do to the world itself

Status: **accepted in principle** (Toine, 21 November 2026). Not built; to be specified with the next change of the PDL contract.

## Context

Toine: « même si l'arc principal de gameplay, c'est de parler dans la tête du personnage, on ne s'interdit pas qu'on puisse agir sur l'environnement lui-même ou avec d'autres choses dans le monde, de la position du joueur. Changer le temps, etc. C'est pour pousser un personnage à faire quelque chose, par exemple. Ou déclencher des événements. »

Until now P1 read "the player never acts on the world". It now reads "the player never holds the character's controls": speaking to the character stays the main arc, and acting on the world is a second, equally indirect lever.

## Decision

**1. A power is a grant.** A story grants a role (the player, a host) the right to author certain kinds of transactions on the world: place (weather, hour, light), sound, things (make, move, remove), events (set off something the story defined). A grant can be wide or narrow, permanent or earned, costly or free, and it is written in the authoring language like everything else:

```
? Can the voice change the weather? -- only once it has learned the place's name.
~0.6 The ghost can move small things when nobody is looking.
!! The voice never moves a person.
```

**2. One channel, as always (P16).** What the player does to the world is a transaction authored by the player, validated against the grants and the principles, repaired or rejected with its reason, executed, journaled and replayable. Nothing reaches the character's body: the validator rejects any player transaction whose subject is a character's act.

**3. Spoken like anything else.** "Make it rain" is said the way "follow the marks" is. The first judgement on a sentence (D1) gains one answer: who it is addressed to, the character or the world. An author may also expose a power as a quick gesture; the transaction is the same.

**4. Characters react to the world, not to the player.** A character perceives the rain, the noise, the door that opens, and does what their principles say. Whether they suspect the player behind it is the author's choice (an open question on the character sheet), unknown by default.

**5. The game master is the same thing with more of it.** A host is a role with many powers and the right to write rules mid-session (ADR in scope: hosting). Player, ghost, spirit of the place, game master: one scale of powers, not four systems.

## Consequences

- P1 is restated; the "rules out" list now forbids controls for the character only.
- The authority table of the PDL (who may author which kind of transaction) becomes data granted by the pack, not a constant of the core.
- D1 (what is asked) gains an addressee; the bench of free requests gains sentences spoken to the world.
- Harvest: a power that players ask for and a story did not grant shows up as "asked and not doable", addressed to that story's author.
