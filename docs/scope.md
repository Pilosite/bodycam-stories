# Scope ledger

One table, kept current. Anything too hard for the POC is written here as **v2** or **target** instead of being half-built. A row moves left only by a decision recorded in an ADR.

## What POC v1 must make a stranger feel

1. **You can show anything.** Ask for a thing, a light, a weather, an event: it appears, built by code from a description, never from an asset.
2. **The character is free.** You do not steer her. You talk; she understands, agrees, argues or refuses, and acts on her own.
3. **The story holds anyway.** Nothing is scripted line by line, yet ten minutes later something has been told.

## The v1 frame: stations, like the old pre-rendered adventure games

v1 deliberately plays like a 1990s adventure or puzzle game with pre-computed views: the world is a small number of **stations** (viewpoints) along a path. At a station the player looks around freely and talks; Sam acts in place (looks, crouches, touches, picks up, makes, places, speaks). Going from one station to the next is a **transition** the engine plays when the story or Sam decides to move. There is no free roaming, no pathfinding, no obstacle logic in v1.

Why: it is the bodycam constraint taken seriously (we never drive her), it lets each view settle to full image quality, it gives anticipation an obvious shape (the next stations and the likely requests at each can be prepared ahead), and it removes the least reliable part of the current engine from the critical path. Dynamism comes back in steps.

## Ledger

| Capability | v1 (POC) | v2 | Target |
|---|---|---|---|
| The bubble (P3) and arriving in a story (P4) | one story, one arrival, a bubble of a few stations | several short stories one can drop into; the bubble follows an autonomous character | any situation from a prompt; stories as episodes shared by creators |
| Fuzzy systems (P9, P10) | gauges and principles; one gauge at work in the story | the litmus: a wanted level, a reputation and a guard-and-crime system written in the authoring language only | creators' libraries of systems |
| Movement | transitions between 4 to 6 stations on one path | autonomous movement on the path, then off it | free roaming with real obstacle handling |
| Camera | free look at a station, sensor look | look while moving | — |
| Places | one place, described by a pack | several places, travel between them | any place from a prompt, live |
| Things | anything expressible in the current shape/material vocabulary, within reach | articulated things, containers, fire, liquids | open vocabulary growth by models |
| Character | one strong character, acts in place | autonomous initiative, moves on her own | several characters, creatures |
| Sound | synthesized cues and voice, driven by PDL | ambience beds, spatial sound | — |
| PDL | transactions, three horizons, rules, source format with strengths | richer events, time-based rules | a public, versioned standard |
| Commitments (planning ahead through the character) | conditional requests become promises and rules within a session, kept or broken in character | commitments that persist across sessions; creators define moments that invite them | players' commitments shared and reused as story material |
| Model tiers | reflex (code), translation, staging, background, behind one adapter; judgement (`decide`) separate from invention (P22); a home node on Toine's desktop for real tiers (ADR 0008) | on-device small model for translation; hosted decision models | specialised non-generative models per modality |
| Anticipation | frontier of likely intents per station, measured | speculative pre-rendering of next views | continuous background world growth |
| Creator tools | session viewer, rule what-if, principle audit, pack checker | assistant-driven authoring commands | hosted creator workspace |
| Collaboration | layered packs in Git with provenance | shared packs, forks and merges with tooling | live shared narrative spaces |
| Languages | backend English; English is the primary play language, French fully available, speech with subtitles; one override setting | more languages | — |
| Platform | desktop browser | phone | — |
| The satire demo | kept apart as a sandbox, off the main path | — | — |
