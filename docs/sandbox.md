# The satire demo sandbox

Status: proposal, documentation only. No code has moved. Follows `docs/scope.md` (row "The satire demo: kept apart as a sandbox, off the main path") and `docs/sdlc.md` principle 2 (one channel, no side door).

The 20 November demo ("make a 20 kg poop", birds falling dead from the smell, a little man made of it) was a satire. It also produced real mechanisms. This page says which is which, so the POC can drop the first without losing the second. Rule of thumb: if removing a file entry leaves the mechanism with nothing to show, it is demo content; if it only removes one use, it is a mechanism.

## 1. Belongs to the satire (the sandbox)

Data, in `src/` and elsewhere:

| What | Where | Why it is demo |
|---|---|---|
| Model entries `crotte`, `vomi`, `oiseau`, `bonhomme` (with `origine: corps`, `repugnance`, `ambiance`, `transforme`, `besoin`). `baton` and `caillou` are neutral and stay. | `src/modeles.json`, key `modeles` | The punchline objects. The model library itself stays. |
| The `exploit` block's content: `substituts`, `moyens`, `refus`, `avant` (reluctance lines), `souffle` (straining lines), `apres`, and the `consequences` entry (birds: counts, heights, falls, thoughts) | `src/modeles.json`, key `exploit` | Lines and tuning for the joke. The block's structure (`paliers`, `effort`, `bruit`, `consequences` as a list) is the mechanism. |
| The `degout` block's lines (`avant`, `contact`, `pendant`, `autre`, `fin`, `nausee`) and `corps.mains` entries naming these things | `src/modeles.json`, keys `degout`, `corps` | Lines for disgust at the satire objects. The block shape is the mechanism. |
| Sound recipes `flatulence`, `cri_mourant` and the four recorded takes `breve_aigue`, `breve_ronde`, `longue_chantante`, `grondement` (about 62 KB of PCM, with `prises_credit`) | `src/bruitages.json` | Only the joke uses them. Note: the takes are imported recordings, which clashes with the "code only, no imported sound" rule in `CLAUDE.md`; moving them to the sandbox is also what keeps the main path clean. `chute` (a generic fall) and the `micro` and `sortie` chains stay. |
| Fallback phrase lists that recognise the satire requests (`SECOURS_GESTES` entries, `secoursCorps`, `secoursChercher` keywords) | `src/meneur.js`, `src/voix.js` | Their words are demo words; the functions are generic. To audit line by line when the move is done. |
| The demo scene and story | `scenes/09-champcueil-aube.json`, `histoires/avant-la-nuit.json` if it carries the demo requests | To verify before moving. Other scenes and stories are engine fixtures and stay. |
| The opening replay | `ouvertures/champcueil.json` and `ouvertures/photos/` | The recorded "What world do you want to film?" replay of that demo. |
| Demo mode defaults | `REGLAGES_DEMO` (`src/meneur.js`), `DEMO_VITE` (`src/main.js`) | "Claude reacts faster" tuning for the demo; on by default today. |
| UI switches | buttons `docile` ("Debug"), `mention` ("Mention rejeu"), `v2` and `v3` engine toggles, `ouverture` launch (`window.balade.ouverture`) | `docile` and `mention` exist for the demo. `v2`, `v3` are rendering experiments: not satire, but off the POC path (see section 4). |
| Tests tied to the satire phrases | `tests/oiseaux.test.mjs`, `tests/etonne.test.mjs`, `tests/bonhomme-cible.test.mjs`, `tests/demo.test.mjs`, `tests/ordre.test.mjs`, `tests/bouche.test.mjs`, `tests/vite.test.mjs`, `tests/soleil.test.mjs`, `tests/ouverture.test.mjs` | They drive the page with the demo phrases. Each should be re-read when moved: parts that test a generic mechanism through a demo phrase should be rewritten on a neutral fixture, not deleted. |
| Tools | `tools/demo.mjs`, `tools/ouverture.mjs`, `tools/partie.mjs` | Scripts that play the demo. |
| Docs | `docs/bruitages.md` (the table still lists the old plan of "2 short + 1", before the retuning to 10 to 13 sounds), `docs/ouverture.md`, `docs/meneur-de-jeu.md` §15 to §25 for the demo parts | Legacy French docs that describe the demo. Stay where they are, index them as legacy. |

## 2. Generic mechanisms that stay (they came from the demo, they are not the joke)

| Mechanism | Code | Becomes in the POC |
|---|---|---|
| Effort: a body action with duration by "bigness", strain beats, a build-up | `gesteExploit`, `palierExploit`, `etapesFaconnage` in `src/meneur.js` | The `body` vocabulary (move, posture, hands, effort). |
| Body emotion: disgust, nausea, being dazzled, startle | `intensiteDegout`, `planDegout`, `EBLOUI`, `secoursSoleil` | Body or mood effects driven by facts and rules. |
| Ambient consequences: a thing done makes the world react nearby, placed without overlap | `planConsequences`, `placesChute`, `horsDuCorps`, `placeLibre` | A rule's `then` producing `effect` transactions. |
| Shaping: making a thing from matter with hands over time, visible states | `gesteFaconnage`, `etapesFaconnage`, `etatGeste` | `act` and `effect` on `thing`. |
| Hands in the field of view, grabbing | `corps.mains` (shape), hand code in `src/main.js` | Body and camera vocabulary. |
| Sound synthesis from recipes, timed against the action, fall sounds, microphone chain, Web Audio player | `planExploit`, `caler`, `planChute`, `partition`, `synthese`, `chaine`, `creerSons` in `src/son.js` | The `sound` vocabulary (recipes, cues). |
| Scale by mass, model library, fetch and find | `mettreAEchelle`, `aEchelle`, `lieuChercher`, `src/echelle.js` (that one is the v3 shading scale, unrelated) | `thing` (shapes, materials, mass). |
| Body does not cross obstacles | `planTrajet`, `obstaclesConnus`, `MARGE_CORPS` | Off the v1 path (stations, ADR 0003), kept for v2 movement. |
| Activity panel | `src/activite.js`, button `Activité` | The seed of the creator view's timeline. |
| Voice queue and subtitles | `src/voix.js` | Speech vocabulary. |

## 3. Mechanical plan (one small change, later)

Principle: separate by data and by one flag, not by deleting code. Nothing is renamed, no behaviour changes with the flag on.

1. **Move the demo data out of the library files.** Create `sandbox/satire/` with `modeles.json` (the entries and block contents of section 1), `bruitages.json` (the two recipes and four takes), `ouvertures/` (moved from `ouvertures/`) and `scenes/` (the demo scene). In `src/`, keep the generic files with empty or neutral content: `modeles.json` with `baton`, `caillou` and the empty block structures; `bruitages.json` with `micro`, `sortie`, `chute`.
2. **Merge at build time, behind one flag.** `tools/build.mjs` reads `sandbox/satire/*` only when `SATIRE=1` (default off for the POC page, on for the existing demo page, so today's behaviour is reproducible). The merge is a plain deep merge of JSON keys on top of the generic ones; the code in `src/` is not touched. Output: `dist/index.html` (POC page) and `dist/satire.html` (demo page).
3. **UI switches follow the flag.** The `docile`, `mention` buttons and the opening launch are only created when the page was built with `SATIRE=1`: one constant `SATIRE` injected by the build, read where those buttons are created (`src/main.js`).
4. **Tests.** Move the demo-phrase tests to `sandbox/satire/tests/` and run them in CI only with the flag (a second `npm test` step with `SATIRE=1`); tests of generic mechanisms keep running on the generic data. The tests of `son` and `oiseaux` that read bounds from the data keep working as they read `MODELES`.
5. **Tools and docs.** Move `tools/demo.mjs`, `tools/ouverture.mjs`, `tools/partie.mjs` under `sandbox/satire/tools/`; leave pointers in `docs/README.md`.

Order inside the change: data move (1) and build merge (2) first, check that the `SATIRE=1` build is byte-identical to today's `dist/index.html`; then switches (3), tests (4), tools (5).

## 4. Open

- Is `histoires/avant-la-nuit.json` part of the satire or a general engine story? To read before the move.
- Rendering experiments `v2` and `v3` and the `src/shaders/` pipeline are neither satire nor POC logic. Whether the POC page ships with them is a decision for a later ADR (scope row "Platform" and the engine adapter at M2).
- Whether the recorded takes can stay at all, given the "code only" rule of `CLAUDE.md`: open, for the project owner.
