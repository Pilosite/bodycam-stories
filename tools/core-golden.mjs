// Regenerates the golden journals of core/ (docs/sdlc.md §3, level C): one per pillar, tests/golden/<name>.jsonl.
// Run after an intended change of the PDL contract, then read the diff of the journals before committing.
//   node tools/core-golden.mjs            write all
//   node tools/core-golden.mjs --print p3-model-rule   print one journal, readable
import { writeFileSync, mkdirSync } from 'node:fs';
import { SCENARIOS, runScenario } from '../tests/core-fixture.mjs';
import { toJSONL } from '../core/journal.js';

const dir = new URL('../tests/golden/', import.meta.url);
const pr = process.argv.indexOf('--print');
if (pr > 0) {
  const s = runScenario(process.argv[pr + 1]);
  for (const e of s.journal.entries) {
    const x = Object.assign({}, e); delete x.scene; delete x.proposed; delete x.records;
    console.log(JSON.stringify(x));
  }
  console.log('hash', s.hash());
} else {
  mkdirSync(dir, { recursive: true });
  for (const name of Object.keys(SCENARIOS)) {
    const s = runScenario(name);
    writeFileSync(new URL(name + '.jsonl', dir), toJSONL(s.journal));
    console.log(name.padEnd(16), String(s.journal.entries.length).padStart(4), 'entries', s.hash());
  }
}
