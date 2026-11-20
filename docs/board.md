# Board: priorities, open questions, working assumptions

Kept by the coordinator, read by Toine. One page. It is how we talk without redoing work.

## How we work together

- **Toine says things as they come.** Each new idea is restated in one line and filed the same day: a principle (`principles.md`), a scope row (`scope.md`), a contract (`architecture.md`, an ADR), or a question here.
- **The coordinator asks at most three questions per reply**, ordered by what a wrong guess would cost. Each comes with the assumption work is proceeding on. No answer means the assumption stands.
- **Answering is cheap**: "1 ok, 2 no: …". A question still open after two replies is asked again once, then dropped into "Assumptions".
- **Nothing waits for an answer unless it is expensive to undo.** Those items are marked *held*.
- **Challenges are welcome both ways.** When two of Toine's statements pull apart, the coordinator says so and proposes a reading instead of choosing silently.

## Priorities

| | Now | Owner |
|---|---|---|
| 1 | Engine adapter: stations, transitions, the core driving the page (M2) | **done**: « Louis's Round » plays in the page with no model (`src/story.js`, `src/adaptateur-core.js`, `src/reflex-model.js`); see `docs/milestones.md` |
| 2 | The interactive guide: principles, workflows, the real core running in the page | **done** (`guide/`, `dist/guide.html`, artifact https://claude.ai/artifact/1xjoRPRhuqEgjKU3hKKTqi) |
| 3 | Creator kit: one command line and scoped instructions so an assistant can run the narrative side of the repo | **done** (`tools/story.mjs`, `stories/CLAUDE.md`, `AGENTS.md`, `stories/_template/`) |

Follow-ups noted by the lots: the hide station hides the bank (heading and posture in `stations.json`, a creator's call) · the two endings that are Sam's decision need a model · middle confidence should show doubt · spec §5.1 to mention the station `light` and `anchors.json` in the pack format · the worked examples of `docs/creator-kit.md` to re-run after the p8 golden was regenerated · a pure `judge()` in `core/` for the confidence rule and both-orders (today only in the guide) · a story loop in `core/clocks.js` (`prepare()`) · `model_call` entries must record which adapter answered and whether it was an invention or a judgement (P22) · a compiler for prose `!` and `!!` (44 statements of the pack wait for it) · `story check` in CI · any lot that changes `core/`, the pack or the docs the guide reads must rebuild and commit `dist/guide*.html`.

Done since: the page's model port (home node client, host's model, code), `judge()` in the core, the scene loop with invention, Sam's own endings, adapter and instrument in every `model_call` (`src/model-port.js`, `core/judge.js`, `core/prompt.js`; M3 first part, nothing measured live yet: Toine plays in the artifact, copies the journal, `node tools/model-latency.mjs <journal>`).

Trailer mode, played by the engine (`src/trailer.js`, `stories/louis-round/trailer.json`; « Trailer » on the launch screen, `?trailer=1`, `&lang=fr`, `&clean=1` for recording, `&pace=`): a real session of « Louis's Round » with captions and read-outs fed by the journal. To tune on a GPU: pacing, voices, cuts versus walks.

Next: the home node server (ADR 0008, after Toine's answers) · model tiers live and measured (M3) · background, frontier, a rule written by a model (M4) · creator view (M5).

Creation pipeline (`docs/creation-pipeline.md`): the demo's opening is now the specification of the real path from a prompt to a playable story. Of 17 steps it shows, 3 are real, 7 partly, 4 staged, 3 not designed. Proposed order: W1 to W6 with v1 (one creation-event schema, the agent network drawn only from real model calls, the opening labelled as a replay when it is one, real PDL in the overlays), research and character-from-findings in v2, a full story from a prompt as target.

Later: the satire moved behind `SATIRE=1` · phone · autonomous movement (v2).

## Open questions

| # | Question | Assumption in force | Cost if wrong |
|---|---|---|---|
| Q1 | The desktop: OS, graphics card, memory? | a mid-range gaming PC with a recent GPU; the node serves `embed` and `decide` locally | low: configuration |
| Q2 | Outside the artifact, which generative models can we call (API key Anthropic or Google, or none)? | none; mid and large tiers run only inside the artifact for now | medium: decides whether M3 measures real tiers |
| Q3 | "Real-time dynamism" in v1: the world's clock runs on its own (light rises, the walker comes, the battery drains) whether or not the player speaks, even though she moves station to station? | yes | high: it shapes the session loop and the engine adapter |
| Q4 | Is the prepared future ("the possible", "the worlds that follow") ever shown to the player, or only felt as speed and coherence? | never shown in play; visible in the creator view | medium |
| Q6 | The opening as specification: does the real pipeline have to do web research on the place and the person (queries, sources, photos), as the opening shows? | yes as v2, served by the home node since an artifact has no web access; photos are read for research only, never shown or used as assets | medium |
| Q7 | Hosting: a human game master on a live session. One host and one player first, or a table of several players from the start? | one host, one player, as v2; several players is target | medium: multi-player changes the session model |
| Q8 | Four temporalities (ADR 0010): is the environment a lane of its own, with its own loop, or a kind of content inside the others? | its own lane; implemented once confirmed, since it changes the `horizon` contract | high: every statement and journal carries it |
| Q9 | When the player is a ghost, an object or an idea, is there still one in-world camera (P2), and whose is it? | yes: always one subjective camera carried by someone or something in the world; the player's identity is free, the lens is not | medium |
| Q5 | The story of « Louis's Round »: Louis watched a badger sett and died there of his heart; discreet, nothing supernatural. Keep it? | kept | medium: the pack is written around it |

## Assumptions adopted without an answer

- English is the primary play language; French is fully available; others later (Toine, 20 Nov).
- No paid account is added; no cost ceiling for now (Toine, 20 Nov).
- "JEV" names a class, decision models, not one product; open-source equivalents are welcome (Toine, 20 Nov).
