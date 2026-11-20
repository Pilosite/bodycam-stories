#!/usr/bin/env node
// Story pack checker: an alias of `node tools/story.mjs check` (docs/creator-kit.md), kept for scripts and habits.
// One parser: the PDL source is read by core/source.js; the checks across the pack's files live in tools/story.mjs.
//
//   node tools/pack-check.mjs stories/louis-round          report, exit 1 on errors
//   node tools/pack-check.mjs stories/louis-round --json   the report as JSON: ok, errors, warnings, stats, compiled form
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { main } from './story.mjs';

export { checkPack, loadPack, loadLibrary, EVENTS, CONDITIONS, ACTIONS, BENCH_TAGS, BENCH_EXPECT, CARRIER_MIN } from './story.mjs';

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(['check', ...process.argv.slice(2)]).then(code => { process.exitCode = code; });
}
