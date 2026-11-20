---
description: Check a story pack (parse, merge layers, every reference) and explain the result to the creator
argument-hint: "[pack dir, default stories/louis-round]"
---
Arguments: `$ARGUMENTS` (a pack directory; if empty, use `stories/louis-round`). Run `node tools/story.mjs check <pack>` (read `stories/CLAUDE.md` first if you have not).

Present the result to the creator in a few lines, in their language:
- "ok" or the number of errors; then each error rewritten as what is wrong in the story and the file and line to fix (for example "the rule r.bad reveals a fact that does not exist: f.nowhere, rules/voice.pdl:12"), not the raw message.
- Warnings as advice, one line each, saying whether they matter for what the creator is doing now.
- How many prose `!`/`!!` statements are not enforced yet, only if the creator touched one.

If there are errors you can fix in the data without guessing the creator's intent (a missing translation, a typo in an id), propose the fix as a diff; otherwise ask.
