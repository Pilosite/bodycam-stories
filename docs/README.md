# Docs index

POC documents first (English, binding), then the legacy French docs of the engine and the 20 November demo. Read the POC set in order.

## POC (English)

- `principles.md` — the founding principles (P1 to P22), the constitution; read first
- `architecture.md`: the contract. Nine pillars, transactions, rules, vocabulary, story pack, journal, repo layout.
- `scope.md`: the scope ledger. What is v1, v2 and target; the station-based frame.
- `sdlc.md`: how we build. Principles, ADRs, test levels, flow, working with agents, milestones.
- `milestones.md`: the M0 to M6 table with how to check each and a "Measured" column to fill.
- `adr/`: architecture decision records (`0000-template.md`, then 0001 to 0007).
- `sandbox.md`: what belongs to the satire demo versus the generic mechanisms that stay, and how to separate them.
- `pdl-spec.md`: the PDL specification (source grammar, transactions, rules, validation, ports, clocks, journal).
- `board.md`: priorities, open questions, working assumptions, and how Toine and the coordinator work together.
- `adr/0008-home-node.md`: models reached through Toine's desktop, and how the page detects it.
- `adr/0009-model-output-economy.md`: what each tier is asked to produce (choose, write compact, write long), and how it will be measured.
- `research/models.md`: research behind ADR 0004 (which models for which tier; Jev and decision models, JEPA, embeddings, constrained decoding, the artifact and proxy modes).
- `story-louis-round.md`: the bible of the POC story (premise, people, stations, beats, endings, tone, what must never happen).
- `patterns.md`: the narrative pattern library, how a story binds patterns, and what swapping one changes.
- `characters.md`: light and strong characters in PDL source, and how they feed the model tiers and fallback lines.
- `creator-kit.md`: how a creator works on a pack with an assistant (what to read, commands, example requests and diffs).

## Legacy (French; engine and demo, kept as they are)

- `poc-principes.md`: what the satire demo showed, the five principles, what a real proof must show.
- `plan-poc.md`: the plan for the serious POC and the story "La tournee de Louis".
- `principes.md`: the original project principles.
- `meneur-de-jeu.md`: the game master (story contract, loop, character, props, body, demo sections 15 to 25).
- `contrat-histoire.md`: the story contract format (v0, extended).
- `essai-meneur.md`: how to play "Avant la nuit" with the real model and what to look at.
- `fiche-de-lieu.md`: the place sheet format, the one text the model writes to create a place.
- `constructeur.md`: the scene builder, summary.
- `constructeur-de-monde.md`: the scene builder in detail.
- `refonte-monde-generique.md`: the ongoing rewrite toward a generic world vocabulary.
- `rendu.md`: rendering tracks.
- `moteur-v2.md`: engine v2 ("turn, then project"), design and results.
- `moteur-v3.md`: engine v3 ("sow, do not trace"), design and trial report.
- `bruitages.md`: sound synthesis from recipes (its demo table predates the retuning).
- `activite.md`: the activity panel.
- `ouverture.md`: the demo opening ("What world do you want to film?").
- `pdl.md`: the display-only token notation (not the PDL of `architecture.md`).

## Commands (from the repository root)

```bash
npm install     # Playwright, only for local screenshots; not needed for tests or build
npm test        # all tests, no browser, no model; must be green
npm run build   # assemble src/, scenes/, histoires/ into dist/index.html
```

CI (`.github/workflows/ci.yml`) runs `npm test` and `npm run build` on every push and pull request, and checks that the committed `dist/` matches the build. Browser tools (`tools/shot.mjs`, `tools/demo.mjs`, `tools/partie.mjs`) are run by hand, small and few.
