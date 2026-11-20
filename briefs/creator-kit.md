# Brief: the creator kit (clone scratchpad/creator-kit, branch creator-kit)

Set-up: `git clone /home/user/bodycam-stories /tmp/claude-0/-home-user/e15e087f-dabf-5bf7-a345-261fa64aac19/scratchpad/creator-kit && cd /tmp/claude-0/-home-user/e15e087f-dabf-5bf7-a345-261fa64aac19/scratchpad/creator-kit && git checkout -b creator-kit`. Commit as "Claude" <noreply@anthropic.com> (`git -c user.name=Claude -c user.email=noreply@anthropic.com commit`), every message ending with the two lines `Co-Authored-By: Claude Fable 5.2 <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_01VS46C8QeTTrZSvfdQ6YQ2c`. Never push. Keep `NOTES-AGENT.md` (done / in progress / left; add it to `.git/info/exclude`) and commit early and often: the container can restart, a successor resumes from your notes and log.

Read first, in this order: `docs/principles.md` (the constitution, P1 to P22), `docs/scope.md`, `docs/architecture.md`, `docs/sdlc.md` (§3 tests: right level, few; no end-to-end test per feature), `docs/pdl-spec.md`, `docs/board.md`. Then only what this brief names.

Rules that hold for every lot: new code, keys and logs in English · no key, token or personal detail in the repo or the page · do not edit the root `CLAUDE.md`, nor any `.claude/settings*` · do not touch the satire demo's behaviour · a contract you need changed (`docs/architecture.md`, `docs/pdl-spec.md`, executor, pack or journal format) is proposed in your report with the smallest additive change made, never changed silently · `npm test` and `npm run build` green before you report, no test skipped · Playwright: `ln -sfn /opt/node-tools/node_modules/playwright node_modules/playwright`, Chromium is installed, software rendering is slow (about 10 s per pass at 270 × 480), so few and small renders.

Report, short: what was done, what was measured, what deviates from the contracts, what is left.

Also read: `docs/creator-kit.md`, `docs/story-louis-round.md`, `docs/characters.md`, `docs/patterns.md`, `tools/pack-check.mjs`, `core/source.js`, `core/session.js`, `core/journal.js`, `tests/core-fixture.mjs`.

## Why
Toine: the narrative side must be « bien découplé ou outillé pour qu'un projet Claude Code ou autre puisse gérer l'aspect narratif, on pense repo ». A creator opens this repository in Claude Code, Codex or a similar tool, says what they want in words, and the assistant edits the pack, shows the effect and commits. Writing a world is a game too (P11): quick to try, visible at once. Serves P8 to P12, P16, P17.

## Deliver
1. **`tools/story.mjs`**, one command line over the real core, no dependency, readable output by default and `--json` on every command:
   - `check <pack>` (what pack-check does, through `core/source.js`: one parser; `tools/pack-check.mjs` stays as a thin alias with the same behaviour)
   - `build <pack>` writes the compiled pack
   - `explain <pack> <statement-id>` the line, its strength, layer, author, compiled form, who enforces it, what refers to it
   - `play <pack> --script <file>` runs a session in the paper world from a list of things said and time passing, with the canned or heuristic model; prints each exchange as the creator would want to read it (what was said, what she did, which principles were in scope, which rule fired and why) and writes the journal
   - `replay <journal>` and `whatif <journal> --pack <pack>` (replay against the pack as edited now) with the difference: what changed, first divergence, state hashes
   - `audit <journal>` what players asked, what was repaired or rejected and by which principle, rules that fired or never fired, commitments made, kept, broken, gauges' course
   - `journal <file>` a readable rendering of a journal
   - `new <pack-id>` from `stories/_template/`
   npm scripts for the common ones.
2. **`stories/_template/`**: the smallest pack that passes `check` and plays: one place, two stations, one light character, one rule, one open question, lines in English and French.
3. **Scoped instructions for the narrative assistant**: `stories/CLAUDE.md` and an `AGENTS.md` with the same content at the repository root if none exists (Codex reads it), short: what to read first, the strengths and who enforces each, the loop (edit data → check → play or whatif → show the creator the diff and its effect in the replay → commit in the right layer with the author), the rules (data never engine code; one statement per line with an id when referred to; speech in both languages; a tendency before a rule, a rule before an absolute; say when a request needs vocabulary the engine lacks instead of faking it), how to read a journal for a creator.
4. **Four slash commands** in `.claude/commands/`: `story-check`, `story-play`, `story-whatif`, `story-new` (short prompts that call the command line and say how to present the result).
5. **`docs/creator-kit.md`** brought up to date: the commands with their real status, the three worked examples re-run with the tool and their real output, where journals live.

## Tests
A handful on the pure functions behind the commands (script parsing, the audit summary on the p8 golden journal, whatif on one edited rule, the template passes check). Reuse the golden journals; no new end-to-end run.

