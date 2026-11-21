# Creation pipeline: what the opening promises, and what is real

Status: inventory and mapping for the coordinator. Not a design, not a decision. Written 20 Nov 2026; §6 added by the conception lot (ADR 0011), which made the story half of "from prompt to procedural" real in a first version; §7 added by the studio lot (21 Nov, `briefs/conception-v2.md`: W1, W2, W3, W5, W9 in part, W12 in part). The tables of §1 to §3 describe the recorded replay, which is unchanged; §7 says which rows now also exist live.

Premise (Toine): the opening's loading sequence is taken as the functional and technical script of the real creation pipeline and of the live agents during play. This page lists what that script contains, maps each part to the architecture (`docs/architecture.md`, `docs/adr/0004-model-tiers.md`, `docs/scope.md`), and says what is real today. P19 ("nothing staged") is the yardstick.

Status words: `real` = driven by a live computation in the page or the repo; `partly` = real data or a real call, but the form, the split or the tier is not the one planned; `staged` = illustration or recorded replay, nothing behind it; `not designed` = the opening shows it and the architecture has no slot for it.

## 1. Inventory of the opening and the overlays, in order of appearance

Files: `src/ouverture.js` (O), `src/activite.js` (A), `src/pdl.js` (P), `src/main.js` (M), `ouvertures/champcueil.json` (J), `docs/ouverture.md`, `docs/pdl.md`.

### 1.1 Opening (O unless noted)

| # | What the viewer sees | Where | Driven by |
|---|---|---|---|
| 0a | Intro frame: REC, timecode, "Launch" | `src/ouverture.js:222-244` | staged (timecode is a real clock; the click is the real audio gesture) |
| 0b | Header: Prompt, AI, Image + Sound + Story chain | `src/ouverture.js:193-203` | staged (static text) |
| 0c | Question "Quel monde veux-tu filmer ?", field, mic, "Prompt démo" typed into the field | `src/ouverture.js:206-262` | real input (typing animation staged, submit real); mic real (`deps.dicter`) |
| 0d | Router: prompt matched to a recorded replay by keywords | `correspond` `src/ouverture.js:13-25`, `envoyer` `:274-287` | real code, but it is the switch between staged and real |
| 1 | "pense" line: reading of the request plus coordinates and landmarks as chips | event `pense` `src/ouverture.js:126`, shown `:319` | recorded text from `J.comprendre` (`ouvertures/champcueil.json`); staged |
| 2 | Step "Le lieu · recherche": burst of query chips, then sources (domain, title, state lu / illisible / refusé / extrait), counters, "+N" folding | `programme` `src/ouverture.js:128-131`, shown `:332-380` | replay of a real research session of 19 Nov, done by one agent (`docs/ouverture.md:7,20`); staged as a pipeline |
| 3 | Step "Le lieu · photos": thumbnails in bursts, "reading" frame, kept or "hors sujet", credits | `src/ouverture.js:132-152`, `vignette` `:570`, `vignetteLue` `:597`, `credits` `:605`; data `ouvertures/photos/champcueil.json` | replay of a real Commons search of 20 Nov; staged as a pipeline; the engine never reads the photos (`docs/ouverture.md:28`) |
| 4 | Step "ce que j'en retiens": findings, each with an arrow to a setting, photo pinned | `src/ouverture.js:153-154`, `:370-375` | recorded findings (`J.constats.liste`); staged |
| 5 | Step "Le personnage · recherche" | `src/ouverture.js:155-157` | replay of a real search (6 queries, 10 pages); staged |
| 6 | Step "Le personnage · ce que j'en retiens": findings to settings (tone, fear, vocabulary, humour, know-how, clothes, pockets, camera) | `src/ouverture.js:158-159`; `J.personnage.reglages` | recorded; settings are not read by Sam's voice (`docs/ouverture.md:18`); staged |
| 7 | Step "Écriture en PDL": lines type out; left a tight line per frame, right (wide screens) a preview panel where glyph tokens are written 1 to 3 at a time, some "correct themselves", legend translates tokens, counter "N tokens vs JSON M, -X %" | `pdl()` `src/ouverture.js:58-108`, `src/pdl.js:43-61`, `ecrireTrame` `src/ouverture.js:539-567`, `creerApercu` `:531`, bilan `:359-363` | content real (transcribed from the real fiche JSON and real settings); notation display-only (`docs/pdl.md:3`); self-correcting tokens `:553` staged; the token gain is chars/4 on a made-up alphabet |
| 8 | Step "Contrôle": recorded sentence plus up to 3 real lines, ok / errors | `src/ouverture.js:168-169`, `deps.C.controler` call `:293` | real (geometric check on the fiche, `src/constructeur.js:274`) |
| 9 | "Le monde se construit": live label of what the engine is compiling, then fade on the first frame | `src/ouverture.js:382-391`; `lancerOuverture` `src/main.js:3679`, `pretOuverture` `:3669`, `etatPrep` | real (engine compiles the fiche behind the screen, `prechauffer`; wait bounded) |
| 10 | Photo credits, end of replay | `src/ouverture.js:170`, `:605` | real data |
| 11 | Fallback branch: no replay match, message "Je prépare ce monde pour de vrai…", opening closes after 2.2 s | `src/ouverture.js:284-286` | real chain runs elsewhere (`src/constructeur.js:640 construire`, UI in `src/atelier.js`), not shown in the opening |

### 1.2 Agent network, right column (wide screens only)

`creerReseau` `src/ouverture.js:408-446`, comment `:398-404`. Header legend: web, haiku x15 (row y=42, `:410`, `:429`), sonnet x5, "JEV x4 / dLLM · instant" (`:430`), opus x2, engine with three nodes image / audio / story (`MOTEUR` `:181`), counters "tok/s, active agents, queries, sources, PDL tokens" (`:442`).

| Message / pulse | Where | Driven by |
|---|---|---|
| Haiku to web and back, one per query or photo | `reseauLigne` `:506-511` | staged (round-robin `kq % 15`) |
| Haiku to Sonnet, one per source | `:512-515` | staged (`ks`, modulo) |
| Sonnet to JEV to Opus, one per finding; bulk send at start of PDL step | `parJev` `:484-487`, `reseauEtape` `:490-498` | staged |
| Opus to engine nodes, one pulse per token packet | `reseauJeton` `:523-528` | staged |
| Network shrinks to a banner when photos arrive, opus nodes go red during PDL, opus to engine at "Contrôle" | `reseauEtape` `:489-503` | staged |
| Counters, tok/s | `R.cpt` `:439-443` | computed from the replay events, not from model usage |

The file states it: "Il ne mesure rien de ce qui tourne" (`:401`); `docs/ouverture.md:20`: "mise en scène de la démo".

### 1.3 Activity overlay during play (right column, wide screens)

`activite` block `src/main.js:3403-3494`, lines from `src/activite.js`. Switch "Activité : oui/non" (`src/main.js:3491`).

| Line type (sign) | Where | Driven by |
|---|---|---|
| `>` hear "…" | `analyser` `src/activite.js:14` | real |
| local analysis lines: order (go/make), go, shape, make with scale and exploit tier, body, right now | `src/activite.js:17-46` (`MENEUR.ordreDemande`, `modeleDe`, `formesModele`, `palierExploit`, `dureeEffort`, `secoursCorps`) | real, computed by pure code in `src/meneur.js` |
| `~` interpreter / prop master "… 4.2 s" | `ligneAppel` `src/activite.js:52`; `src/main.js:3453,3457` | real timer of a real call (`sampler.json`, `src/main.js:3304,3329`); needs Claude, absent otherwise |
| `<` thought, gate verdict, build, follow-up | `ligneEvenement` `src/activite.js:55-83` (`pensee`, `sas`, `objet_cree`, `suite_programmee`) | real (meneur journal via `surEvenement`) |
| `·` decisions: sequence, exploit, model, scale, shaping, disgust, frame, gives in | same | real |
| `!` guards: request kept, other material refused, preview dropped, thought dropped, place corrected, stop, debug, build failed | same | real |
| `▶` / `✓` actions: walk, turn, posture, look, effort bar, think, place, shape, pick up, aim, zoom | `ligneAction` `:86-105`; `src/main.js:3466-3471` | real (reads `queue[0]`) |
| `◈` demand frame, `⇢` action frame (glyph tokens, plain-language legend scrolling) | `trameDemande` `src/pdl.js:64`, `trameActions` `:75`; `src/main.js:3434,3456,3483` | real data, invented notation, display only |
| persona block: `●` frame of the character's settings, "expected reaction · translated by JEV : grumbles, complies, strong disgust…" | `reactionAttendue` `src/pdl.js:93-113`; `src/main.js:3421-3430` | rule-based pure function over recorded settings and the request's nature; no model; the "JEV" label is false (`docs/pdl.md:18`); staged |

### 1.4 "Régie" panel, left column during play

`regie` `src/main.js:3499-3520`, comment `:3496`: "Une illustration de démo (pas une mesure)". Title "Agents · live". Seven rows, three states each, refreshed every 250 ms:

| Row (states) | Trigger in code | Driven by |
|---|---|---|
| Sky · light (idle, exposure, haze) | `i%23<3` or exposure gap | half periodic fake, half real sensor state |
| World · terrain (idle, seeding, terrain) | `walking`, else `i%17<2` | half real, half periodic fake |
| Story (listening, writing, deciding) | thought bubble waiting "…" or shown | real state of the meneur call |
| Events (idle, staging, firing) | queue head is effort/poser/faconner/chercher | real queue |
| Behavior (rest, planning, acting) | queue non-empty | real queue |
| Audio · voice (silent, mixing, playing) | `balSon.occupe()`, speaking, listening | real state |
| Translation · PDL (idle, listening, translating) | `activite.traduit()` | timer since a frame was added; staged |

None of the seven is an agent: they are lamps over one engine and at most one Claude call.

## 2. The pipeline the opening promises

Ordered list of stages, using only the opening's own steps (inventory rows 1 to 9, plus the arrival). The opening itself ends on a place with no story: the carrier looks around and thinks one line (`docs/ouverture.md:66`).

1. **Understand the request**: reading of the prompt, place coordinates, landmarks (row 1).
2. **Place research**: queries fired in a burst, sources fetched and read, some unreadable or refused (row 2).
3. **Place photos**: image search, each photo looked at, kept or dropped as off-topic (row 3).
4. **Place findings to settings**: each retained fact tied to the setting it justifies, or an assumed deviation (row 4).
5. **Character research**: queries and sources about how such a person lives, speaks, dresses (row 5).
6. **Character findings to settings**: tone, fear, vocabulary, humour, know-how, clothes, pockets, camera (row 6).
7. **Write the intermediate language**: the place and character become PDL, written by the large tier, via instant translators (row 7).
8. **Check**: the world is verified without an image: field of view, haze range, path (row 8).
9. **Build the world and arrive**: the engine compiles and renders; fade into the first frame (rows 9, 10).

Then the **live agents during play**, as the overlays show them: local understanding of the sentence, the interpreter call, the prop-master call, the meneur's thoughts / gates / guards / decisions, the action queue, PDL frames of the demand and of the actions, the character's expected reaction, and the seven régie lamps (sky, world, story, events, behavior, audio, translation).

Stages not shown by the opening although the architecture has them: see section 4.

## 3. Mapping table

Tier names follow ADR 0004 and P22 (`fast`, `mid`, `large` generative; `decide` model; code). Clock: now / scene / story as in P20. Creation stages run before play and belong to no clock: the architecture gives creation no clock and no latency budget (see section 4).

| # | Stage (what the opening shows) | Tier or instrument in the real architecture · clock | Real component today | Status | What is missing |
|---|---|---|---|---|---|
| 1 | Understand the request, coordinates, landmarks | mid or large generative (plan) · pre-play (closest: story) | `src/constructeur.js:640 construire`, step `plan` (`MODELES.plan = 'default'`, `:629`), prompt `consignePlan` `:504`; replay text in `ouvertures/champcueil.json` | partly | the replay shows a recorded sentence; the real plan step returns a plan object, not "reperes" or coordinates; no geocoding; runs only with the artifact `sample` capability |
| 2 | Place research (queries, sources read) | fast generative fan-out for queries, mid for reading, code for fetching · pre-play | none (grep finds no search or fetch in `src/constructeur.js`, `src/main.js`, `core/`) | not designed | no research stage in `docs/architecture.md`, `docs/scope.md` or the ADRs; `ModelPort` has only `embed`, `decide`, `generate` (`core/ports.js:13`); no web access in an artifact (ADR 0004 fact 3, ADR 0008) |
| 3 | Place photos (search, look, keep or drop) | fast/mid multimodal reading · pre-play | none; images only enter the chain as engine captures for the review (`construire`, `choisirVues` `src/constructeur.js:403`) | not designed | not planned; conflicts with "code only" and P13 (documented exception, `docs/ouverture.md:8`); the engine never reads them |
| 4 | Findings tied to settings (arrows) | large generative, written into the fiche · pre-play | `construire` steps `fiche` (`MODELES.fiche='complex'`) and `relecture` (image review, 2 rounds); `validerFiche` `:66`, `appliquerPatch` `:178`; history in `historique` | partly | the fiche is really written and reviewed; the finding-to-setting link (`constat` + `reglage`) exists only in the recording; no provenance from source to field |
| 5 | Character research | fast/mid generative · pre-play | none | not designed | architecture's characters are written by creators or an assistant as PDL sheets (`docs/architecture.md` "Characters", `docs/characters.md`); no research step |
| 6 | Character findings to settings | mid/large generative writing a `characters/*.pdl` sheet (light or strong) · pre-play | `stories/louis-round/characters/*.pdl` exist (hand-written); parser `core/source.js:20 parseSource`; the page keeps its own voice prompt (`docs/ouverture.md:18`). Since the conception lot: the large tier writes the carrier's sheet and the other people's light sheets from the prompt and the place (`core/sketch.js`, §6), without research | staged in the opening; partly real after « Décrire un monde » (§6) | nothing generates a sheet from findings; the opening's settings object (`ton`, `peur`, `vocabulaire`, `humour`, `sait`, `tenue`, `poches`, `camera`) is not the architecture's sheet (`voice`, `knows`, `limits`, `secrets`, `arc`, `body`, statements with `!!`, `!`, `~`, `?`); only `reactionAttendue` reads it |
| 7 | Write PDL (Opus, via JEV; tokens, -X % vs JSON) | large generative compiling PDL source (`!`, `!!`, `~`, `?`) into rules and prompt sections, at pack build, with creator approval · story | `core/source.js` (deterministic parse, `compileRule`, `compileGauge`, `compilePack`), `core/tokens.js` (real PDL token form), `core/pdl.js` (validate); display notation `src/pdl.js` | staged | no model compiler (`docs/creator-kit.md` "will add"); the engine reads fiche JSON, not PDL (`docs/pdl.md:3`); `src/pdl.js` is a second, invented notation unrelated to `core/tokens.js`; "JEV" between Sonnet and Opus has no counterpart (decision models never write) |
| 8 | Check without image | code · pre-play | `controler` `src/constructeur.js:274`; `core/pdl.js validate`; `tools/pack-check.mjs`; `tests/pack.test.mjs` | real | two checkers (fiche check for places, pack checker for stories) with no common report; the opening shows only the first |
| 9 | Build the world, arrive, first frame | code (engine executor) · now | `lancerOuverture` / `pretOuverture` `src/main.js:3679,3669`; `applyFiche`; `prechauffer` and `COMP` queue (`docs/moteur-v3.md`); arrival `arrivee()` | real | the path goes fiche to engine, not PDL transactions to `EXECUTOR` (`core/world.js:9`); `src/adaptateur-core.js` is `ENABLED = false`, not built (`:3`); no story starts at arrival (only the free walk) |
| L1 | `>` hear and local analysis | reflex code · now | `analyser` `src/activite.js:13`; `MENEUR.*` in `src/meneur.js` | real | the architecture's D1 to D3 and encoder matching (ADR 0004) are not in the page; the page's own analysis stands in for them |
| L2 | `~ interpreter … N s` | translate tier (`decide` D1-D3, then fast generative) · now | `sampler.json` calls (`src/main.js:1922`, `:3304`); `core/clocks.js:8 createClocks.hear` (real shape, uses `model.decide`) | partly | one hosted call with the `quick` tier, not an embed + decide split; `ModelPort` has only `cannedPort` (`core/canned-model.js`), no `artifactPort`, no `proxyPort`, no `tools/home-node.mjs` (ADR 0008 proposed) |
| L3 | `~ prop master … N s` | mid generative (staging) · scene | accessoiriste call in `src/main.js`/`src/meneur.js` (`objetMeneur`, §15 of `docs/meneur-de-jeu.md`) | partly | not a tier of the architecture: staging there emits PDL transactions (`act`, `effect`, `fact`, `rule`), here it emits shapes for the engine; no streaming of transactions |
| L4 | `<` `·` `!` thought, gate, guards, decisions, build, follow-up | validator + journal (code), decisions D4, D7 (`decide`) · now/scene | meneur events `src/activite.js:55-83`; `core/pdl.js validate` (repair + reasons), `core/journal.js` | partly | two parallel event systems: meneur's `surEvenement` (page) and the core journal (not wired); gates and guards are the meneur's, not validator repairs citing a principle (P8 check) |
| L5 | `▶ ✓` action queue | engine executor, deterministic · now | `queue`, `ligneAction` `src/activite.js:86`; `core/world.js EXECUTOR`, `core/paper-world.js` | partly | queue is the page's; executor interface only implemented by the paper world |
| L6 | `◈` demand frame, `⇢` action frame | PDL `intent` / `act` transactions, token form `core/tokens.js` · now | `trameDemande`, `trameActions` `src/pdl.js:64,75` | partly | real data, glyph notation display-only; real PDL transactions (`serializeTokens` `core/tokens.js:20`) are not produced in the page |
| L7 | Persona block, "expected reaction · translated by JEV" | decision D3 (does she go along?) plus line from bank or invention · now | `reactionAttendue` `src/pdl.js:93` (rule-based, no model) | staged | no `decide` call; settings are the recorded ones, not a character sheet; label "JEV" contradicts ADR 0004 (and `docs/pdl.md:18`) |
| L8 | Régie: sky, world, story, events, behavior, audio, translation lamps ("Agents · live") | three loops now / scene / story (`core/clocks.js`, `LOOPS` `core/session.js:13`); sky, world, audio are engine executor activity, not agents | `regie` `src/main.js:3499`; loops in `core/clocks.js` (not wired) | staged | no such agents; two lamps partly periodic fakes (`i%23`, `i%17`); no per-tier activity read from `modelCall` records (`core/session.js`) |

Counts: 9 creation stages and 8 live-agent rows = 17 rows. real 3 (8, 9, L1); partly 7 (1, 4, L2, L3, L4, L5, L6); staged 4 (6, 7, L7, L8); not designed 3 (2, 3, 5).

## 4. Gaps and contradictions

Opening shows, architecture does not plan:

- Place research and character research (stages 2, 5): no research stage, no `search` or `fetch` in `ModelPort` (`core/ports.js:13`).
- Photo search (stage 3): outside the architecture and against "code only" (exception recorded `docs/ouverture.md:8`).
- A research fan-out of many fast workers (15 + 5 + 2 + 4 nodes, `src/ouverture.js:410`): the architecture has one model per tier and a single `decide` entry (ADR 0004); no fan-out, no worker count.
- Finding-to-setting provenance (arrows, pinned photos): the architecture's provenance is author + layer per statement (P12), not source-to-field.
- A pre-play creation phase: the architecture gives clocks to play only (P20); creation has no clock, no latency budget, no journal format.
- Instant "translators" between analysis and writing (JEV x4): decision models answer typed questions D1-D10 and never carry text between writers.
- Model-family names on screen (Haiku, Sonnet, Opus, `src/ouverture.js:429-431`, `src/pdl.js` none): ADR 0004 names tiers by role (`fast`, `mid`, `large`), never by family; `src/activite.js:3` also bans model names in code.

Architecture plans, opening does not show:

- Patterns, rules and principles (`~`, `?`, `!`, `!!`) and the compile step with creator approval.
- Beats, endings, stations, lines in both languages (`stories/louis-round/beats.json`, `stations.json`, `lines/*.json`): the opening produces a place only and ends with no story.
- Frontier / anticipation (large tier, story clock, ADR 0004).
- Decision-model judgements D1-D10, their probabilities and fallback chain, journaled per call.
- Commitments and gauges (P6, P10).
- Pack check (`tools/pack-check.mjs`), principle audit and creator view (M5): not in the opening's Contrôle step.
- Review loop of the real chain (capture then image review, 2 rounds, best version kept, `src/constructeur.js:700-745`): not in the replay.

Contradictions:

- Two meanings of "PDL": `src/pdl.js` is an invented glyph alphabet describing a fiche (display only); `core/pdl.js` + `core/tokens.js` is the transaction language of ADR 0001 / P16. The engine consumes the fiche JSON, so the "only channel" rule (P16) does not hold for place creation.
- "JEV" is drawn and labelled as translators (`src/ouverture.js:400,430`, comment still says "modèles de langage à diffusion"); `docs/pdl.md:18` and ADR 0004 say decision models. The ADR asked for the correction (consequences, last bullet).
- Régie title "Agents · live" (`src/main.js:3503`) against P19 and against its own comment ("illustration de démo", `:3496`).
- Recorded replay shown as live: mention "Rejeu accéléré…" is off by default (`docs/ouverture.md:54-56`).
- Network counts (tok/s, 15/5/2/4 nodes) are constants over replay events, while the recording was done by one agent (`docs/ouverture.md:20`).
- Character settings are shown as guiding the voice but the voice does not read them (`docs/ouverture.md:18`); the persona block reads them for a canned reaction.
- Real-chain branch hands over to a different progress UI: the opening closes after 2.2 s (`src/ouverture.js:286`) and the chain reports in the atelier's chantier (`src/atelier.js`), so the opening's script and the real pipeline have two separate displays.
- Tier names differ across the three vocabularies: opening (haiku / sonnet / JEV / opus), ADR 0004 table (reflex / translation / staging / background), P22 (fast / mid / large + decide).
- `src/ouverture.js:181` MOTEUR shows engine nodes image / audio / story; no `story` consumer exists in the page for a generated story (core not wired, `src/adaptateur-core.js:3`).
- `valeur` line genre is handled in the renderer (`src/ouverture.js:368`) and weighted (`:117`) but `programme` never emits it (dead path).

## 5. What a "nothing staged" opening would need (P19)

Proposals for the coordinator, shortest list that lets the same sequence be driven by the real pipeline. Tags follow `docs/scope.md`: v1 (POC), v2, target. Dependencies in brackets.

| # | Work item | Tag |
|---|---|---|
| W1 | One creation-event schema (`stage`, `kind`: query / source / finding / draft / check / build, `tier`, `model`, `latency_ms`, `status`), emitted by `construire` (hooks `etape` and `journal` already exist, `src/constructeur.js:641`) and consumed by the opening instead of `programme()`; the replay becomes a recording of this same stream | v1 |
| W2 | Render the agent network and the régie only from `modelCall` records and the real queue (`core/session.js modelCall`: tier, purpose, status pending / landed, latency); delete lamps with no counterpart (sky, world as "agents"), remove periodic fakes | v1 [wire core, M2 adapter] |
| W3 | Turn the replay mention on by default and label the opening "replay of a recorded run" when it is one (`docs/ouverture.md:56`); keep the live branch visibly live | v1 |
| W4 | Settle the PDL name: show real `core/tokens.js` transactions (intent, act) in the activity overlay, and label the fiche notation as a display of the place file; or drop the notation. Remove "JEV" labels where no decision model answered; show `decide` with its `backend` once reported (ADR 0008 `/health`) | v1 |
| W5 | Place creation from a prompt as the one real creation path shown: plan, fiche, check, image review, build (all exist in `construire`); show its real steps and notes in the opening's own UI rather than the atelier's | v1 |
| W6 | Wire `core/` to the page (engine adapter, `ENABLED` true) so the overlay reads core journal entries (validator repairs with reasons, loop and latency per transaction) instead of meneur events | v1 [M2] |
| W7 | Findings with provenance: `construire` returns findings (`text`, `source`, `setting`) and the fiche history keeps them | v2 |
| W8 | A `search` capability on `ModelPort` served by the home node (artifact network is closed, ADR 0008), with a research journal (queries, pages, state) from real calls; fast-tier fan-out measured by real usage | v2 |
| W9 | Character sheet written from findings as `characters/*.pdl` (statements with strengths, both languages), consumed by the voice prompt, so the persona block reads the real sheet and a real `decide` for D3 | v2 |
| W10 | Model compiler for `!` statements with creator approval (architecture "Compilation"): makes "the large tier writes PDL" true and gives stage 7 a real output | v2 |
| W11 | Photo research: either drop it, or keep it as research-only fed by W8, never read by the engine; decision on the "code only" exception | v2 |
| W12 | Stages the opening lacks (patterns, rules, beats, lines, stations) generated from a prompt, so the sequence ends in a story and not only a place | target (scope: "any situation from a prompt", "any place from a prompt, live"); **first version real** after « Décrire un monde » (§6): characters, facts, open questions, patterns, lines; one station; no beats beyond one, no endings |
| W13 | Creation clock and budget: a stated latency, progress and fallback for the pre-play phase (the real chain takes minutes, `src/ouverture.js:285`), plus speculative creation while the question is asked | target |
| W14 | Decision-model nodes shown only when a decision model is reachable; otherwise labelled as the fast generative fallback | v2 (ADR 0004 v2 row) |

## 6. Conception before play (ADR 0011): what is real now

After « Décrire un monde » has built a place (the builder's chain, rows 1, 4, 8, 9), the page no longer stops at the place. Files: `core/sketch.js` (pure), `src/conception.js` (the panel), the conception block at the end of `src/main.js`, `tools/story.mjs sketch`, `src/sketch-base.json` (the base bank and the fallback's words, data).

| # | Stage | Tier or instrument · clock | Component | Status | What is missing |
|---|---|---|---|---|---|
| C1 | The sentence and the built place become a story sketch: the carrier's sheet (who the prompt makes them, never "Sam"), the other people as light sheets with their presence (`absent`, `unseen`), facts (true, known, not known), three open questions, one or two patterns of the library with their roles bound, bank lines in the play language, what the camera cannot show | large generative (host's `complex` tier, streamed) · pre-play | `sketchPrompt`, `parseSketch`, `sketchPack`, `conceive` | **real** (needs the `sample` capability; nothing measured with a real model yet) | research (rows 2, 5), several stations and beats, endings; the home node is not asked (host only) |
| C2 | Check and repair | code (`compilePack` + the references a sketch uses), then one repair call with the errors · pre-play | `checkSketch`, `repairPrompt` | **real** | the full checker (`story check`) runs only out of the page |
| C3 | Fallback so that play always starts | code · pre-play | `fallbackSketch`: one carrier, the place's things as facts, two generic open questions, the base bank | **real**, and the panel says it ("No model answered…") | — |
| C4 | Questions to the creator, suggested answers, « Surprise me », own words; the first question shows while the rest is written | large generative (same call: questions come first in the answer) · pre-play | `readQuestions` on the stream, `src/conception.js` | **real** (smoke run with a stand-in sampler: first question at 0.4 s, sketch done at 4.5 s of a 2.4 s stream) | — |
| C5 | The creator's answers in their own layer over the model's guesses, provenance kept | code · pre-play | `answersText`, `withAnswers`; author role `model` in `core/source.js`; `story explain` shows "author sketcher (a model)" and what an answer overrides | **real** | answers are prose facts (`!`), not compiled |
| C6 | The prompted world played on the narrative core | the three clocks; reflex for the present, the page's model port for judgement and invention with the sketch in the stage prompt | `playable` → `STORY_PACKS[id]`, story mode (`src/story.js`) | **real**; the legacy free mode stays one button away (« Promenade libre ») | the reflex's anchors are only the things' names; one station, so "go" answers that there is nowhere else |
| C7 | Out of the page | the creator's assistant, or a saved answer | `node tools/story.mjs sketch "<sentence>" --place <file> [--answer <file>] [--answers <json>] [--prompt]` writes a pack folder that `check`, `play`, `explain` and `whatif` take | **real** (no model in the tool: `--prompt` prints what to ask, `--answer` reads what was answered; without it, the code fallback, said so) | a model call from the tool (no key in the repo, Q2) |

Still staged in the opening itself (rows 1 to 7): the recorded replays. A prompt that matches no replay goes to the real chain, which now ends in a conceived story.

## 7. The conception studio (briefs/conception-v2.md): the opening made true

A prompt that no recorded preparation matches now runs the **studio** (`core/studio.js`, stages, tiers, prompts and budgets as data in `src/studio.json`), and the opening draws itself from its **creation events** instead of a replay. Files: `core/studio.js` (pure), `src/studio.json`, `src/conception.js` (the panel, the calls), the conception block of `src/main.js` (model port, world builder), `src/ouverture.js` (`vivre`, the live network), `src/model-port.js` (`create`, `search`), `tools/story.mjs sketch --stages`, `tests/studio.test.mjs`, `tools/studio-smoke.mjs`.

The stages (one agent each; parallel where nothing depends; each fails soft):

| Stage | Agent · tier · instrument | Reads | Writes (authoring source) |
|---|---|---|---|
| understand | 1 · mid · invention | the sentence | the brief: where, when, who, kind (story or free), the player, powers proposed, research topics |
| research | one worker per topic (≤ 3, budget) · fast · invention, and `search` when the port has it | brief | findings, each with its source; with no search the source is "the model's knowledge", said as such (code enforces it) |
| environment | the world builder (`construire`: plan, place, check, review) · its own tiers | sentence + findings | the place file; its steps are build events |
| people | 1 · mid · invention | brief, findings | the carrier (strong sheet), the others (light, with `@presence`), the bank lines, facts about them |
| interactions | 1 · mid · invention | brief, findings, place, people | what things afford, rules, moments inviting a promise, **powers** granted, open or refused (ADR 0012, as statements in `rules/powers.pdl`), at most one pattern instance |
| arc | 1 · large · invention, only when the brief says `story` | brief, place's path, people | the question, 2 to 5 stations along the path with what is found at each, beats, endings; a free place gets none and the event says so |
| questions | 1 · mid · invention | brief, people | up to three questions, with the model's guess as a fact (streamed: each question shows as soon as it is written) |
| check | code | every part | `compilePack` + the sketch's references + the arc's; errors blamed to the stage that wrote the file; **one repair round per failing stage** (its own errors, its own previous answer); a stage still failing is left out (the people's part is replaced by a code carrier); the code sketch when nothing holds |

Creation events (W1), one schema: `seq, t_ms, stage, agent, role, tier, instrument, kind (query, finding, draft, check, build, question), status (pending, writing, step, done, failed, repaired, skipped, fallback), latency_ms, text, wrote (source lines), source, adapter`. `writing` events (the lines of a streamed answer, as they arrive) go to the listeners only; all others form the **creation journal**, kept with the pack (`creation.json`, `manifest.creation`) and added to the harvest record (`creation`, the sentence removed when stripped; failed, repaired and fallen-back stages join `slow_or_doubtful`).

Rows of §3 that now exist live (the replay rows stay staged where the replay is shown, and the replay now says it is one):

| # | Row | Live status | Note |
|---|---|---|---|
| 1 | Understand the request | **real** (understand stage) | no coordinates, no geocoding |
| 2 | Place research | **partly**: real calls, real findings with their source; the source is the model's knowledge | `search` is declared on the port and used when present; no server serves it yet (W8) |
| 3 | Place photos | not designed (unchanged) | W11 |
| 4 | Findings tied to settings | **partly**: findings feed the builder's description and the people's prompt, each finding says what it supports | no field-level provenance (W7) |
| 5 | Character research | **partly**: a research topic about the people, same as row 2 | |
| 6 | Character findings to settings | **real** for sheets (people stage, W9 first part): the architecture's sheet, from brief and findings | not yet read by the persona block (W9 rest) |
| 7 | Write PDL | **partly**: the language panel shows the real authoring source each agent writes, line by line | no model compiler of `!` statements (W10) |
| 8 | Check | **real**: the pack check of the studio, shown in the scroll with its errors and repairs | the place's geometric check stays inside the builder's steps |
| 9 | Build and arrive | **real** (unchanged), then the conception panel | |
| net | Agent network (§1.2) | **real** in live mode: one node per agent really called, by tier; pulses follow what each agent reads; the counters are calls, findings, lines written and seconds | no tokens per second (not measured); no model family names, no translator row; a `web` row appears only when a search really happened |
| W12 | Stages the opening lacked | **partly**: people, interactions, powers, beats, stations (2 to 5, played with the existing transitions), endings | lines in one language only; endings are judged by the model at play |

Out of the page: `node tools/story.mjs sketch "<sentence>" --place <file> --stages <dir>` writes each agent's prompt to `<dir>/<agent>.prompt.txt` and reads its answer from `<dir>/<agent>.txt` (a missing answer is a failed stage); run again as answers are written. The first lot's one-call sketch remains the fallback when only one call is affordable (`runStudio({ affordable: 1 })`).

Measured (no model in this container): unit tests with canned answers per stage (`tests/studio.test.mjs`, 6 tests); one browser run of the opening with a stand-in sampler (`tools/studio-smoke.mjs`). Nothing is measured yet with a real model: the number of calls of a full run is 8 to 10 (plus the builder's 2 to 4), and the stages' latencies are the first thing to read in the creation journal of a real run.

