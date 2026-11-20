# Brief: the interactive guide (clone scratchpad/guide, branch guide)

Set-up: `git clone /home/user/bodycam-stories /tmp/claude-0/-home-user/e15e087f-dabf-5bf7-a345-261fa64aac19/scratchpad/guide && cd /tmp/claude-0/-home-user/e15e087f-dabf-5bf7-a345-261fa64aac19/scratchpad/guide && git checkout -b guide`. Commit as "Claude" <noreply@anthropic.com> (`git -c user.name=Claude -c user.email=noreply@anthropic.com commit`), every message ending with the two lines `Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_01VS46C8QeTTrZSvfdQ6YQ2c`. Never push. Keep `NOTES-AGENT.md` (done / in progress / left; add it to `.git/info/exclude`) and commit early and often: the container can restart, a successor resumes from your notes and log.

Read first, in this order: `docs/principles.md` (the constitution, P1 to P22), `docs/scope.md`, `docs/architecture.md`, `docs/sdlc.md` (§3 tests: right level, few; no end-to-end test per feature), `docs/pdl-spec.md`, `docs/board.md`. Then only what this brief names.

Rules that hold for every lot: new code, keys and logs in English · no key, token or personal detail in the repo or the page · do not edit the root `CLAUDE.md`, nor any `.claude/settings*` · do not touch the satire demo's behaviour · a contract you need changed (`docs/architecture.md`, `docs/pdl-spec.md`, executor, pack or journal format) is proposed in your report with the smallest additive change made, never changed silently · `npm test` and `npm run build` green before you report, no test skipped · Playwright: `ln -sfn /opt/node-tools/node_modules/playwright node_modules/playwright`, Chromium is installed, software rendering is slow (about 10 s per pass at 270 × 480), so few and small renders.

Report, short: what was done, what was measured, what deviates from the contracts, what is left.

## Why
Toine asked for « une putain de doc didactique en html dynamique, avec des explications des workflows sur lesquels on peut agir ». Readers: Toine, his colleagues (AI practitioners), future creators and whoever opens the backend. After twenty minutes with it, a reader understands what Bodycam Stories is, how a word becomes a world, and has changed something and seen the effect. Serves P11, P17, P19: **nothing staged**. Every live piece runs the real `core/` in the page, on the real pack `stories/louis-round` and the real golden journals. Where a model would answer, the canned answers are used and labelled "recorded answer".

## What to build
`guide/` (sources) built by `tools/build-guide.mjs` into two files: `dist/guide.html` (a complete document, for GitHub Pages) and `dist/guide-artefact.html` (the same without doctype, html, head or body: claude.ai wraps it; see how `tools/build.mjs` writes `dist/artefact.html`). One self-contained file each: `core/` inlined as modules (no bundler is installed; write the small inliner, no new dependency), the pack and one or two golden journals inlined as data. `npm run build` builds the guide too, deterministically (CI checks `git diff --exit-code -- dist`).

Sections, each one short prose plus one thing to act on:
1. **What it is.** The game table, not the rule book; you talk with the one who acts; two ways to play (live a story, write one). The three teaser lines are the tone: "You can't touch this world. You talk to someone who's in it."
2. **From soft to hard.** A source editor on real lines of the pack: type or edit a line (`?`, `~w`, `!`, `when … -> …`, `!!`, gauge) and see at once its strength, who enforces it (a model weighs it, code runs it), its compiled form or its error. `core/source.js`.
3. **One channel.** A transaction bench: pick or edit a transaction, see accept / repair (what changed, toward what intent) / reject (which principle or bound), and its token form. `core/pdl.js`.
4. **Three clocks.** Three lanes (now, scene, story). Say one of a few preset sentences taken from `stories/louis-round/tests/requests.json`; the now lane answers at once, the scene answer lands later and adds or amends, the story lane prepares. A delay slider per tier shows that a slow layer never holds a fast one. `core/clocks.js`, `core/canned-model.js`.
5. **Invention and judgement.** The decision points D1 to D10 of `docs/architecture.md`: pick a question, move the confidence, see what the code does (act, act with the doubt showing, ask back), the both-orders rule on an absolute, the fallback chain.
6. **Promises.** Make the jay commitment in words, see the promise and the rule it becomes, move to the station where it falls due, see it kept or broken and why.
7. **Gauges.** One gauge rising and fading over time, its words (low, medium, high), a principle that refers to it.
8. **What happened, and what if.** Step through `tests/golden/p8-louis-pack.jsonl`: each entry readable (who, which clock, why, cause chain). Edit one rule, replay, see the difference and the state hash. `core/journal.js`.
9. **A story is a folder.** The pack's tree, layers and provenance (who wrote which line), and what a creator's assistant runs (the commands of `docs/creator-kit.md`; another lot is adding `tools/story.mjs`, link to the doc, do not depend on it).
10. **Where the models live.** Tiers, the home node and how the page detects it (`docs/adr/0008-home-node.md`), what the artifact can and cannot do.
11. **What is v1, v2, target.** The scope ledger and the milestones, as they are in the docs (read them at build time, do not retype them).

## Form
- English first, with a French switch covering all prose (copy in one table per language; code, keys and journal fields stay English).
- The project's identity, already set by the teaser images: near-black ground, warm off-white text, one red accent, DM Sans for text and DM Mono for labels and code (Google Fonts link with real fallback stacks), bodycam vernacular used sparingly (REC dot, timecode). Dark first, with a designed light theme. Define every colour as a token on bare `:root`, redefine for light under `@media (prefers-color-scheme: light){:root:not([data-theme="dark"]){…}}` and again under `:root[data-theme="light"]`; `color-scheme` set accordingly; `body` has an explicit background.
- A `<title>` at the very top: `Bodycam Stories Field Guide`. Works at 400 px wide with a 16 px gutter (`padding-left:max(16px,env(safe-area-inset-left,0px))`, same on the right, and `<meta name="claude:viewport-fit-sides" content="cover">` beside the title), no horizontal page scroll; wide code and tables scroll in their own box. Complete at rest: every section readable and in a realistic state on load, nothing waiting for a click to appear. Visible keyboard focus, `prefers-reduced-motion` respected, stable `id` on form controls.
- In the artifact: scripts only inline (or cdnjs with a pinned version, and you should not need any); no fetch, no download link, no `alert/confirm/prompt`, `localStorage` only inside try/catch and only for the language and theme choice. Under 2 MB.
- Plain, direct sentences. No filler, no mannered phrasing. Section numbers are fine here: it is a path.

## Tests (the budget is small on purpose)
The logic is the core's and is already tested. Add: one node test that the inlined core, loaded from the built file, replays the p8 golden journal to the committed hash; one check that the build is deterministic. Then one look: two screenshots (1280 and 400 wide), read them, fix what they show, once.

