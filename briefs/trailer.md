# Brief: the trailer, played by the engine itself (clone scratchpad/trailer, branch trailer)

Set-up: `git clone /home/user/bodycam-stories /tmp/claude-0/-home-user/e15e087f-dabf-5bf7-a345-261fa64aac19/scratchpad/trailer && cd /tmp/claude-0/-home-user/e15e087f-dabf-5bf7-a345-261fa64aac19/scratchpad/trailer && git checkout -b trailer`. Commit as "Claude" <noreply@anthropic.com> (`git -c user.name=Claude -c user.email=noreply@anthropic.com commit`), every message ending with exactly these two lines, whatever model you are: `Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_01VS46C8QeTTrZSvfdQ6YQ2c`. Never push. Keep `NOTES-AGENT.md` (in `.git/info/exclude`) and commit early: the container can restart.

Read first, in this order: `docs/principles.md` (P1 to P22), `docs/scope.md`, `docs/architecture.md`, `docs/sdlc.md` (§3: tests at the right level, few; no end-to-end test per feature), `docs/milestones.md` (M2 as delivered), `docs/board.md`. Then what this brief names.

Rules for every lot: new code, keys and logs in English · no key, token or personal detail in the repo or the page · do not edit the root `CLAUDE.md` nor any `.claude/settings*` · the existing demo keeps working exactly as it does when your mode is off · a contract change is the smallest additive one and is named in your report · `npm test` and `npm run build` green before you report (the build also rebuilds `dist/guide*.html`; commit `dist/`), no test skipped · Playwright: `ln -sfn /opt/node-tools/node_modules/playwright node_modules/playwright`; software rendering is slow and the machine is shared with other agents, so one short browser run, small viewport · if `main` moved, merge it before reporting.

Report, short: what was done, what was measured, deviations, what is left, the commit to merge.

Also read: `src/story.js`, `src/adaptateur-core.js`, `src/reflex-model.js`, `tools/story-smoke.mjs` and its script, `src/ouverture.js` (launch screen), `stories/louis-round/` (`stations.json`, `anchors.json`, `lines/en.json`, `patterns/`).

## Why
Toine: the slides and the guide are « pas assez dans l'esprit du jeu Bodycam ». He wants « une sorte de trailer dans le jeu, avec notre moteur 3D, mais qui explique les principes », which can stay in the game. A friend of his opens one link, presses one button, and in about ninety seconds has seen the game and understood what is underneath. He can also screen-record it on his PC to get the video. Serves P17 and above all P19: **nothing staged**. The trailer is a real session of « Louis's Round », driven through the real input port, core and executor, with captions on top.

## What to build
A **trailer mode** of the game page: a « Trailer » choice on the launch screen and `?trailer=1` (with `&lang=fr` for French captions and lines; `&loop=1` to restart at the end). It needs no model and no typing.

- **A script as data** (`stories/louis-round/trailer.json`): timed steps of four kinds: something the player says (shown the way the game shows the player's words, then sent through the story's input port exactly as if typed), time passing (the world's clock, which may run faster than real time between beats if a small "×4" mark shows it), a camera wish (look at a thing, look around, hold), and a caption. Nothing in the script touches the world directly (P16).
- **Captions in the project's art direction** (the teaser's: near-black panels, warm off-white `#f3f0e8`, one red `#ff3b30`, DM Sans for sentences, DM Mono uppercase letter-spaced for labels, the REC dot, corner brackets; see `/tmp/claude-0/-home-user/e15e087f-dabf-5bf7-a345-261fa64aac19/scratchpad/vignette/s0-small.png` and `gen8.py` there for the look). One idea on screen at a time, a kicker and one sentence, never a paragraph, placed so the image stays the subject. English and French.
- **Live read-outs, fed only by what really happens** (subscribe to the session's journal; add a small `on(event, handler)` to `src/story.js` if there is none, as one delimited block at the end of the file, because another agent is editing that file's model wiring):
  - a three-light strip, NOW · THE SCENE · THE STORY, that pulses when a transaction of that clock is journaled;
  - a running tally of the inversion: a red dot for each decision taken live (by a model or by the reflex code standing in for it: say which, honestly) and a white diamond for each rule or absolute written by an author that fired, with the rule's own text flashing briefly when it does (for example `when station.dwell(hide, 40) -> sound(bracken.rustle)`);
  - promise tags: made, amended, kept or broken, from the commitment's real status;
  - the pattern behind a rule when it has one (`the absent one`, `a trail of signs`, `a ticking clock`).
- **The beats to cover**, in an order that makes a small film (adapt to what the engine really does; if a beat cannot be shown for real, drop it and tell me):
  1. Title over the live image: BODYCAM STORIES, « An AI-driven procedural experience », and one honest line: « This is the engine running, not a video. »
  2. « You talk. She decides. »: the player asks to leave the trail and follow the orange marks; Sam answers.
  3. « If you can say it, it can happen. »: two or three varied requests that the engine truly performs today (look, posture, making and placing a thing with the shape vocabulary if the executor does it; check its `gaps` list first), with « All generated: image, sound, story ».
  4. « Three clocks »: a transition to the next station; the strip shows the present answering at once while scene and story rules land on their own time (the mark being read, the light rising).
  5. « Plan ahead »: the jay promise made at the fallen pine, amended by Sam, then kept at the approach.
  6. « Agentic by default. Deterministic by exception. »: the tally in view, an author's rule firing at the hide.
  7. « Written like a book »: the pack's patterns named as their rules fire; then the end card with « Play the story » (enters the normal story mode) and « Private preview ».
- A recording-friendly variant: `&clean=1` hides every button so a screen capture shows only the film.

## Honesty
With no model connected, Sam's answers come from the line banks through reflex code: the read-outs say « reflex (code) », never « model ». When another lot connects real models, the same trailer will show them without change, because it reads the journal.

## Tests
The script loader and the mapping from journal entries to read-outs are pure: a handful of unit tests. One browser run of the trailer (small viewport, cuts instead of walks if the smoke tool does that), no console error, two screenshots looked at.
