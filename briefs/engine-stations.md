# Brief: the engine adapter, stations and a playable session without models, M2 (clone scratchpad/engine-stations, branch engine-stations)

Set-up: `git clone /home/user/bodycam-stories /tmp/claude-0/-home-user/e15e087f-dabf-5bf7-a345-261fa64aac19/scratchpad/engine-stations && cd /tmp/claude-0/-home-user/e15e087f-dabf-5bf7-a345-261fa64aac19/scratchpad/engine-stations && git checkout -b engine-stations`. Commit as "Claude" <noreply@anthropic.com> (`git -c user.name=Claude -c user.email=noreply@anthropic.com commit`), every message ending with the two lines `Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_01VS46C8QeTTrZSvfdQ6YQ2c`. Never push. Keep `NOTES-AGENT.md` (done / in progress / left; add it to `.git/info/exclude`) and commit early and often: the container can restart, a successor resumes from your notes and log.

Read first, in this order: `docs/principles.md` (the constitution, P1 to P22), `docs/scope.md`, `docs/architecture.md`, `docs/sdlc.md` (§3 tests: right level, few; no end-to-end test per feature), `docs/pdl-spec.md`, `docs/board.md`. Then only what this brief names.

Rules that hold for every lot: new code, keys and logs in English · no key, token or personal detail in the repo or the page · do not edit the root `CLAUDE.md`, nor any `.claude/settings*` · do not touch the satire demo's behaviour · a contract you need changed (`docs/architecture.md`, `docs/pdl-spec.md`, executor, pack or journal format) is proposed in your report with the smallest additive change made, never changed silently · `npm test` and `npm run build` green before you report, no test skipped · Playwright: `ln -sfn /opt/node-tools/node_modules/playwright node_modules/playwright`, Chromium is installed, software rendering is slow (about 10 s per pass at 270 × 480), so few and small renders.

Report, short: what was done, what was measured, what deviates from the contracts, what is left.

Also read: `docs/adr/0003-v1-is-station-based.md`, `docs/milestones.md` (M2), `docs/pdl-spec.md` §9 and §12, `src/adaptateur-core.js`, `core/world.js` (EXECUTOR), `core/session.js`, `core/clocks.js`, `tests/core-executor.contract.mjs`, `stories/louis-round/` (`pack.json`, `place.json`, `stations.json`, `lines/`), `docs/story-louis-round.md`, and in the page: `tools/build.mjs`, `src/main.js` (large: search it, do not read it whole), `src/meneur.js`, `src/voix.js`, `src/son.js`, `src/bruitages.json`.

## Goal (M2 exit criterion)
« Louis's Round » is playable in the page with no model at all: the core drives the engine through the executor, Sam stands at stations and goes from one to the next by transitions, the player looks around and speaks or types, the answer comes from reflex code, compiled rules and the line banks. The session writes a journal that replays to the same hash in the paper world. Serves P1 to P7, P16, P20, P21; ADR 0003.

## Deliver
1. **The core in the page.** The build embeds `core/` and the compiled pack. A story mode, entered from the launch screen (a second choice beside the existing demo) or by `?story=louis-round`; the existing demo path is untouched when the mode is off.
2. **The executor implemented by the engine** (`src/adaptateur-core.js` wired, pure translation kept separate from the DOM so the contract suite can run on it): place from `place.json`, stations and transitions (the carrier walks the path between station positions with the existing walk, or a cut when a walk is impossible; no free roaming, no obstacle logic), posture, look and turn, say (subtitle, voice in the story language), sound cues of the pack as data in the existing synth, things made and placed with the existing shape vocabulary, light rising, camera battery and its states as far as cheap, the end screen. What the engine cannot do yet is reported by the executor as such and listed in your report, never faked.
3. **The session loop.** The world's clock runs on its own whether or not the player speaks: light rises, dwell rules fire, the battery drains (assumption Q3 of `docs/board.md`). The player's words go through the input port to the now loop; with no model, the model port is served by a code adapter: nearest match of the sentence against the pack's intent classes and anchors (plain lexical match is enough for M2), with a low confidence turning into Sam asking back. Commitments work end to end with this adapter for the classes the pack declares.
4. **English first, French available**: lines from `lines/en.json` or `fr.json` by a setting; subtitles always.
5. **The journal out of the page**: kept in memory, copyable from a small debug panel (English labels, hidden by default), and replayable by `core/journal.js` in node.
6. `docs/milestones.md`: M2 measured (what works, what the executor reports as missing).

## Tests
The executor contract suite run against the adapter's pure part. One journal recorded from a scripted session in the page and replayed in the paper world to the same hash (a golden, the only new one). Exactly one browser smoke: load the story mode, play that script, no console error, one screenshot at the first station and one at the hide, looked at. Nothing else in a browser.

## Order of work
Make the thinnest path first (load, first station, one exchange, one transition, journal), commit, then widen. If the whole does not fit, stop at a playable three stations and say what is left.

