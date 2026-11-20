---
description: Start a new story pack from the template and walk the creator through its first edits
argument-hint: "<pack-id> [--author <id>]"
---
Run `node tools/story.mjs new $ARGUMENTS`, then `node tools/story.mjs check stories/<pack-id>` and `node tools/story.mjs play stories/<pack-id> --script stories/<pack-id>/scripts/first.txt`. Read `stories/CLAUDE.md` first if you have not.

Tell the creator what they now have, in a few lines: one place (`place.json`), two stations, one light character, one rule, one open question, lines in English and French, and a first script that plays. The two warnings of the check (fewer than four stations, fewer than two moments that invite a promise) are the to-do list of a sketch, not errors.

Then ask what their story is about (a place, a moment, a person in the middle of something) and change the data one step at a time, checking after each step: the title and summary, the place, the character, the stations, the facts and the first rule. Commit when they are happy, with their author id.
