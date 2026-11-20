// The trailer's smoke run (docs/sdlc.md §3 level D, one run): plays the trailer of « Louis's Round » in dist/index.html in
// Chrome (software rendering: frames take seconds, so the script runs slower than on a GPU, in the same order), checks
// there is no console error, takes screenshots at a few steps and prints what the read-outs saw (from the journal).
// The engine renders at a small internal resolution (--res, the overlay stays at the viewport's) and the script may run at a
// slower pace (--pace) so that the gaze dwell, which counts real time between frames, has frames to count.
//   node tools/build.mjs && node tools/trailer-smoke.mjs [--lang fr] [--size 270x480] [--res 108x192] [--pace 1.5]   → out/trailer/
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..'), out = join(root, 'out/trailer');
mkdirSync(out, { recursive: true });
const arg = k => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const lang = arg('--lang') || 'en', [W, H] = (arg('--size') || '270x480').split('x').map(Number);
const SHOTS = (arg('--shots') || '1,11,25,end').split(',');      // step indexes (after the step started) and 'end'
const [RW, RH] = (arg('--res') || '108x192').split('x').map(Number), pace = +(arg('--pace') || 1.5);

const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.addInitScript(c => { window.__CFG = c; }, { trailer: true, lang, pace, maxSpp: 4, w: RW, h: RH });
const t0 = Date.now(), sec = () => ((Date.now() - t0) / 1000).toFixed(0) + ' s';
await page.goto('file://' + resolve(root, 'dist/index.html'), { timeout: 300000 });
// the start card, as a visitor sees it: once the engine has drawn, one press on Play
await page.waitForSelector('#tr .tr-card button', { timeout: 300000 });
await page.waitForFunction(() => window.__state && window.__state.n >= 1, null, { timeout: 300000 });
await page.screenshot({ path: join(out, lang + '-start.png'), timeout: 300000 });
await page.click('#tr .tr-card button');
await page.waitForFunction(() => window.trailer.get() && window.trailer.get().on(), null, { timeout: 300000 });
const step = () => page.evaluate(() => { const t = window.trailer.get(); return t ? t.step() : -1; });
const ended = () => page.evaluate(() => { const c = document.querySelector('#tr .tr-card'); return !!c && !c.hidden; });
let last = -2;
for (const s of SHOTS) {
  const want = s === 'end' ? Infinity : +s;
  while (true) {
    const i = await step(), done = await ended();
    if (i !== last) { console.log('step', i, sec(), JSON.stringify(await page.evaluate(() => window.story.state()))); last = i; }
    if (done || i >= want) break;
    if (Date.now() - t0 > 1500000) throw new Error('trailer did not progress');
    await page.waitForTimeout(1000);
  }
  await page.waitForTimeout(600);
  await page.screenshot({ path: join(out, lang + '-' + s + '.png'), timeout: 300000 });
  console.log('screenshot', s, sec());
}
const result = await page.evaluate(() => ({ readout: window.trailer.get().readout(), state: window.story.state(), gaps: window.story.gaps(), seconds: window.trailer.get().seconds() }));
writeFileSync(join(out, 'journal-' + lang + '.jsonl'), await page.evaluate(() => window.story.journal()));
await browser.close();
console.log(JSON.stringify(Object.assign(result, { wall_s: Math.round((Date.now() - t0) / 1000) }), null, 1));
const real = errors.filter(l => !l.includes('ERR_TUNNEL') && !l.includes('Failed to load resource') && !l.includes('fonts.g'));
if (real.length) { console.error('console errors:\n' + real.join('\n')); process.exit(1); }
