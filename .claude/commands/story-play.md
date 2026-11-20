---
description: Play a scripted session of a story pack in the paper world and tell the creator what happened
argument-hint: "<pack dir> <script file>"
---
Arguments: `$ARGUMENTS` (a pack directory, then a script; scripts live in `<pack>/scripts/`). Read `stories/CLAUDE.md` first if you have not.

1. Run `node tools/story.mjs check <pack>`; stop and report if it fails.
2. Run `node tools/story.mjs play <pack> --script <script>`; it prints each exchange and writes the journal under `out/journals/<pack-id>/`.
3. Run `node tools/story.mjs audit <that journal>`.

Tell the creator, briefly and in their words: what the player said and what she did; each rule that fired and why (quote the rule's line); anything repaired or rejected and by which principle; promises made, kept or broken; the rules that never fired. Say plainly that the model is a heuristic (intents are guessed unless the script pins them with `=>`, tendencies have no effect here), and give the journal's path for a later `/story-whatif`.
