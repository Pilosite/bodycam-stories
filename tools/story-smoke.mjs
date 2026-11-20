// The M2 smoke run (docs/sdlc.md §3 level D, exactly one): loads the story mode of dist/index.html in Chrome (software
// rendering), plays a scripted session of « Louis's Round » with no model (manual clock, cuts between stations, fixed seed),
// checks there is no console error, takes one screenshot at the first station and one at the hide, and writes the session's
// journal. With --golden the journal becomes tests/golden/m2-page-session.jsonl, which the golden test replays in the
// paper world to the same hash.
//   node tools/build.mjs && node tools/story-smoke.mjs [--golden]      screenshots in out/story/
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..'), out = join(root, 'out/story');
mkdirSync(out, { recursive: true });
const SCRIPT = [
  ['hear', 'Hello? Can you hear me?'], ['advance', 5],
  ['hear', 'Go on, please.'], ['hear', 'Look at the orange mark.'], ['advance', 4],
  ['hear', 'Keep going, please.'], ['hear', 'If the jay calls, stop and lie down.'], ['advance', 3],
  ['hear', 'Continue please.'], ['advance', 72],
  ['hear', 'Whatever you hear down there, don\'t move and don\'t speak.'],
  ['hear', 'Take the tape.'], ['advance', 3], ['hear', 'Go on, please.'], ['shot', 'hide'],
  ['advance', 42], ['look', 'thing:terrier', 1.5], ['look', 'thing:affut', 3], ['hear', 'blorp wibble'], ['advance', 2],
];

const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 270, height: 480 }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.addInitScript(c => { window.__CFG = c; }, { story: 'louis-round', storyOpts: { seed: 11, clock: 'manual', cut: true, lang: 'en' }, still: true, maxSpp: 6 });
const t0 = Date.now();
await page.goto('file://' + resolve(root, 'dist/index.html'), { timeout: 300000 });
const passes = async (n, max = 240) => { const t = Date.now(); while ((Date.now() - t) / 1000 < max) { const s = await page.evaluate(() => window.__state && window.__state.n); if (s >= n) return s; await page.waitForTimeout(1000); } return null; };
const shot = async name => { await page.waitForTimeout(400); const n = await passes(3); await page.screenshot({ path: join(out, name + '.png'), timeout: 300000 }); console.log('screenshot', name, 'passes', n, ((Date.now() - t0) / 1000).toFixed(0) + ' s'); };
await page.waitForFunction(() => window.story && window.story.state(), null, { timeout: 300000 });
await shot('first-station');
for (const [op, a, b] of SCRIPT) {
  if (op === 'shot') { await shot(a); continue; }
  const r = await page.evaluate(([op, a, b]) => op === 'hear' ? window.story.hear(a) : op === 'advance' ? window.story.advance(a) : window.story.look(a, b).then(() => window.story.state()), [op, a, b]);
  const s = await page.evaluate(() => window.story.state());
  console.log(op, JSON.stringify(a), '→', s.station, 'beat', s.beat, 'battery', s.battery, JSON.stringify(s.commitments), op === 'hear' ? JSON.stringify(r) : '');
}
const hash = await page.evaluate(() => window.story.checkpoint());
const state = await page.evaluate(() => window.story.state()), gaps = await page.evaluate(() => window.story.gaps());
const journal = await page.evaluate(() => window.story.journal()), said = journal.split('\n').filter(Boolean).map(l => JSON.parse(l)).filter(e => e.type === 'event' && e.event === 'said').map(e => e.data.ref || 'line');
writeFileSync(join(out, 'journal.jsonl'), journal);
if (process.argv.includes('--golden')) writeFileSync(join(root, 'tests/golden/m2-page-session.jsonl'), journal);
await browser.close();
console.log(JSON.stringify({ hash, state, said, gaps, seconds: Math.round((Date.now() - t0) / 1000) }, null, 1));
const real = errors.filter(l => !l.includes('ERR_TUNNEL') && !l.includes('Failed to load resource') && !l.includes('fonts.g'));
if (real.length) { console.error('console errors:\n' + real.join('\n')); process.exit(1); }
