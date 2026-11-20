# Brief: the guide, second pass: show it, do not tell it (clone scratchpad/guide-v2, branch guide-v2)

Set-up: `git clone /home/user/bodycam-stories /tmp/claude-0/-home-user/e15e087f-dabf-5bf7-a345-261fa64aac19/scratchpad/guide-v2 && cd /tmp/claude-0/-home-user/e15e087f-dabf-5bf7-a345-261fa64aac19/scratchpad/guide-v2 && git checkout -b guide-v2`. Commit as "Claude" <noreply@anthropic.com> (`git -c user.name=Claude -c user.email=noreply@anthropic.com commit`), every message ending with the two lines `Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_01VS46C8QeTTrZSvfdQ6YQ2c` (use exactly these lines, whatever model you are). Never push. Keep `NOTES-AGENT.md` (in `.git/info/exclude`) and commit early.

Read first: `docs/principles.md` (all of it, including the three ways to play and P22), `docs/sdlc.md` §3, `briefs/guide.md` (the first pass: its hard constraints on the artifact, themes, responsiveness, honesty and tests all still hold), then `guide/` and `tools/build-guide.mjs` as they are. Do not edit `core/`, `src/`, `stories/`, `tools/story.mjs`, the root `CLAUDE.md` or `.claude/`.

## What Toine said after seeing the first pass
The art direction is right; keep it. But the guide must be « infiniment plus sexy » and more didactic with **far less text**: apply the principles in images and in things one can play with, and make the reader want to know more. What it must make felt:
- We generate **image, sound, story and interaction**, all procedurally, and on **three time scales at once**: the instant, the scene, and the long thread that holds a story together like a book.
- **Anything is possible**: the fun of saying anything and seeing the world answer. Never lead with the constraint ("you cannot act"); lead with what it opens.
- **Agentic by default, deterministic by exception.** The usual order is reversed: agents decide, and an author fixes only what must hold. This is also, underneath, another way of working with AI.
- A Bodycam Story can be **a real book**: a person has thought through the characters and what can happen between them, without rigid machinery, and their imagination comes through in play, directly, indirectly or subtly.
- **Three ways to play**: live a story, write one, host one (a human in the game master's chair).

## What to build
Reorganise the page in two parts.

**Part I, "See it"** (what a visitor meets first; each block is mostly picture or play, with at most two short sentences and captions):
1. **A scene you can play, as the hero of the page.** A portrait bodycam frame showing a real render of the engine (stills, see below), with the REC overlay. Under it, a few things to say (chips taken from the pack's bench, plus a text field served by a simple lexical match). When something is said, the real core session runs: Sam's line appears as a subtitle (from the line bank, in the page's language), the pack's sound cue plays through the project's own synthesizer when there is one, the still changes when she moves to another station, and beside the frame a small live trace shows what just happened on the three clocks (now, scene, story) in plain words, with the journal lines one tap away. This single block must show image, sound, story, interaction and time at once.
2. **The inversion in one picture.** Every statement of the real pack as one mark, drawn by strength: open, tendency, hard rule, absolute. A field of soft marks with a few hard ones. Tap a mark to read its line and who enforces it. Give the real counts.
3. **A story is a book.** The pack shown as a book: a cover (title, authors, layers), chapters (the beats) along a line of time, the characters as pages one can open, real lines with their strength. One line can be edited in place and its effect seen (reuse the source editor).
4. **Three clocks**, as one compact animated strip (reuse the lanes), and **the promise** (reuse), each reduced to the picture and one sentence.
5. **What happened, and what if** (reuse), presented as "rewind, change one line, play again".
6. **Three ways to play**: play, write, host, three cards; "host" is marked as planned, not built.

**Part II, "Open the hood"**: the existing technical sections (transactions bench, decision points, gauges, the folder and the commands, where the models live, the scope ledger), tightened, each prose block cut to what a practitioner needs. They stay visible and complete on load.

Words: Part I has no paragraph longer than two sentences. Headlines say the idea ("Agentic by default, deterministic by exception"), not the topic. English first, French switch for everything.

## Real material, nothing staged (P19)
- **Stills**: render them from the real engine with `node tools/shot.mjs` (read its header; software rendering takes about 10 s per pass at 270 × 480, so at most six stills, 14 passes each, run three at a time in the background). Use the forest of `scenes/01-grands-avaux.json` or `09-champcueil-aube.json` at several positions along the path (`z`) and looks (`lookYaw`, `pitch`) to stand for the stations, and say in a caption that these are captured renders of the engine, not live rendering. Ready-made renders of other worlds (night forest, dunes, village at night, San Francisco, cemetery, dawn) are in `/tmp/claude-0/-home-user/e15e087f-dabf-5bf7-a345-261fa64aac19/scratchpad/vignette/w/*.png` if you want a strip of "other worlds from one sentence"; check they exist and look right before using them. Embed as JPEG data URIs, about 30 KB each; the artifact stays under 2 MB.
- **Sound**: `src/son.js` is the project's synthesizer and `src/bruitages.json` its recipes; embed them and play real cues after a user gesture. If a cue the pack names has no recipe yet, play nothing and show a small "no recipe yet" note rather than a stand-in.
- **Answers**: as in the first pass, the core runs for real and model answers are canned and labelled.

## Tests and looks
Keep the two existing tests green; add none unless you add logic outside the core. Two looks at the page (1280 and 400 wide, dark), read them, fix once. `npm test` and `npm run build` green, `dist/guide*.html` rebuilt and committed (if `main` moved, merge it and rebuild before reporting).

Report, short: what changed, sizes, what you could not make real and how the page says so, the commit to merge.
