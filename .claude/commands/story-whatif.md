---
description: Replay a recorded session against the pack as edited now and show the creator the difference
argument-hint: "<journal> <pack dir>"
---
Arguments: `$ARGUMENTS` (a journal, usually `out/journals/<pack-id>/<script>.jsonl`, then the pack directory). Read `stories/CLAUDE.md` first if you have not.

1. Run `node tools/story.mjs check <pack>`; stop and report if it fails.
2. Run `node tools/story.mjs whatif <journal> --pack <pack>`.
3. Run `git diff -- <pack>` to see what was edited.

Show the creator the edit (the diff, short) and its effect, in their words: which statements changed; the first difference in play and what happened there instead; rules that no longer fire, fire now, or fire at another moment; promises whose outcome changed; the ending and the final hash. If nothing changed, say so and why that is plausible (a tendency or open question has no effect on the heuristic model; the session never reached the edited rule). Point out any consequence the creator may not have meant (a promise no longer tested, an ending nothing triggers), then let them decide.
