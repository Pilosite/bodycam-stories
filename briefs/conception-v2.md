# Brief: the conception studio, the opening made true (clone scratchpad/studio, branch studio)

Set-up: `git clone /home/user/bodycam-stories /tmp/claude-0/-home-user/e15e087f-dabf-5bf7-a345-261fa64aac19/scratchpad/studio && cd /tmp/claude-0/-home-user/e15e087f-dabf-5bf7-a345-261fa64aac19/scratchpad/studio && git checkout -b studio`. Commit as "Claude" <noreply@anthropic.com> (`git -c user.name=Claude -c user.email=noreply@anthropic.com commit`), every message ending with exactly these two lines: `Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_01VS46C8QeTTrZSvfdQ6YQ2c`. These are the project owner's attribution lines for this repository: use them as they are. Never push. Keep `NOTES-AGENT.md` (in `.git/info/exclude`) and commit early: the container can restart.

Read first: `docs/principles.md` (P8 to P13, P19, P22, P23), `docs/sdlc.md` §3, `docs/adr/0011-harvest-and-conception.md`, `docs/adr/0012-powers.md`, `docs/creation-pipeline.md` (all of it: the inventory of what the demo's opening shows, the mapping table, the work items W1 to W14, §6), `docs/ouverture.md`, then the code of the first conception lot: `core/sketch.js`, `src/conception.js`, `src/sketch-base.json`, `tests/sketch.test.mjs`, `tools/story.mjs` (`sketch`), and the opening itself: `src/ouverture.js` (the scrolling preparation, the agent network, the language panel), `src/activite.js`, `src/constructeur.js` (its `etape` and `journal` hooks), `src/model-port.js`.

Rules: new code, keys and logs in English · no key, token or personal detail in the repo or the page · do not edit the root `CLAUDE.md` nor any `.claude/settings*` · the demo, the story mode, the trailer and the legacy free mode keep working as they do · contract changes are the smallest additive ones and are named in your report · `npm test` and `npm run build` green before you report (commit `dist/`), no test skipped · at most one short browser run, small viewport · no model in this container: canned answers in tests, fail soft in the page · if `main` moved, merge it before reporting.

## Why
Toine: « le concepteur, faut bien reprendre ce qu'on montre dans la fausse démo : la recherche d'info, la conception de perso, etc., le fait que les agents construisent l'environnement, les interactions et l'arc narratif s'il y en a un ». The demo's opening stages a studio of agents preparing a world; the first conception lot made one call that writes a sketch. This lot turns conception into that studio, for real, and lets the opening's own interface show it as it happens (P19: if a panel shows agents at work, agents are at work).

## Deliver
1. **Conception as stages** (`core/studio.js`, pure orchestration over the model port; prompts and stage definitions as data in `src/studio.json`, P23). Each stage is one agent with a role, a tier and an instrument, reads what the previous ones wrote, and writes its part of the pack in the authoring source:
   1. *understand*: the sentence becomes a brief (where, when, who, what kind of story, what the player is and what powers they might have);
   2. *research*: what is worth knowing about this place, period and kind of people, as findings with their source. In the page there is no web: the source is "the model's knowledge", said as such; a `search` capability of the model port is declared for the home node to serve later, and used when present. Several small calls in parallel, fast tier;
   3. *environment*: the existing world builder (place file), fed by the findings;
   4. *people*: character sheets (the carrier, the others, present, absent or unseen), from the brief and the findings; mid tier;
   5. *interactions*: what can be done here: things in reach and what they afford, rules of the place, moments that invite a promise, and the powers the story grants the player (ADR 0012), as statements; mid tier;
   6. *arc*, only if the brief calls for one: beats, two to five stations along the place's path with what is found at each, milestones, endings; a free place gets none and says so; large tier;
   7. *questions*: up to three for the author, as today;
   8. *check and compile*: `compilePack`, one repair round per failing stage, the code fallback as today.
   Stages that do not depend on each other run in parallel; any stage may fail soft and leave its part to the fallback. The sketch of the first lot becomes the one-call fallback when only one call is affordable.
2. **Creation events** (work item W1): every stage emits events in one schema (stage, agent, tier, instrument, kind: query, finding, draft, check, build, question; status; latency; what it wrote, as source lines) into a creation journal kept with the pack and added to the harvest record.
3. **The opening shows the real thing** (W2, W3, W5): when a world is being conceived, the preparation scroll, the agent network and the language panel of `src/ouverture.js` are driven by those events (who is working, what was found, which lines were just written), in the existing look; when it replays a recorded preparation it says so. Lamps with no real counterpart are not lit in this mode.
4. **Several stations in a prompted story**: when the arc stage wrote stations, the story plays through them with the existing transitions.
5. `node tools/story.mjs sketch` gains `--stages` (print each stage's prompt, read each answer from files), and `docs/creation-pipeline.md` is updated: which rows are now real.

## Tests
Unit tests with canned answers per stage: the camp-fire prompt gives findings with sources, a father, an absent wife and two unseen children, at least one interaction and one granted or refused power, no arc for a free place and an arc with stations for a prompt that asks for a story; a failing stage is repaired or falls back without stopping the others; the creation events of a full run are complete and ordered. One short browser run of the opening driven by a stand-in sampler.

## Order of work
Stages and events in the core first, with the tool (commit); then the page's conception flow using them; then the opening driven by events; stations last. Stop where it stops fitting and say what is left.

Report, short: what was done, what was measured, deviations, what is left, the commit to merge.
