// The conception smoke run (docs/sdlc.md §3 level D, one run): dist/index.html in Chrome (software rendering, small viewport)
// with a stand-in sampler (no model in this container): the camp fire place of tests/sketch/, the conception panel opened as
// « Décrire un monde » opens it once the place is built, the canned sketch streamed in chunks, one answer picked, « Play »,
// then one sentence heard on the narrative core. Checks: the first question shows before the sketch is finished, the story
// mode runs the generated pack, the stage prompt carries the sketch, no console error. One screenshot of the panel.
//   node tools/build.mjs && node tools/conception-smoke.mjs        screenshot in out/conception/
import { chromium } from 'playwright';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..'), out = join(root, 'out/conception');
mkdirSync(out, { recursive: true });
const answer = readFileSync(join(root, 'tests/sketch/campfire.txt'), 'utf8'), place = JSON.parse(readFileSync(join(root, 'tests/sketch/campfire-place.json'), 'utf8'));
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 360, height: 640 }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.addInitScript(({ c, answer }) => {
  window.__CFG = c; window.__asked = [];
  const wait = ms => new Promise(ok => setTimeout(ok, ms));
  // the stand-in sampler: the sketch streamed in 12 chunks over ~2.4 s; judgement and invention answer at once
  const sample = async (prompt, o = {}) => {
    window.__asked.push({ kind: 'text', tier: o.modelTier, head: String(prompt).slice(0, 80) });
    const n = 12;
    for (let i = 1; i <= n; i++) { await wait(200); if (o.onText) o.onText({ text: answer.slice(0, Math.round(answer.length * i / n)), delta: '' }); }
    return { text: answer, truncated: false };
  };
  sample.json = async (prompt, o = {}) => {
    window.__asked.push({ kind: 'json', tier: o.modelTier, prompt: String(prompt) });
    return /You judge/.test(prompt) ? { answers: {} } : { tokens: 'act.say line.fr="Elle va revenir. Elle revient toujours." tone=flat' };
  };
  window.claude = { use: async name => name === 'sample' ? sample : null };
}, { c: { conception: true, still: true, maxSpp: 4, nowalk: true }, answer });
const t0 = Date.now();
await page.goto('file://' + resolve(root, 'dist/index.html'), { timeout: 300000 });
await page.waitForFunction(() => window.conception && window.story, null, { timeout: 300000 });
await page.waitForTimeout(500);
await page.evaluate(p => window.conception.open('Une famille autour d\'un feu de camp, la nuit, sous les pins', p), place);
await page.waitForFunction(() => document.querySelector('#conception .cc-q'), null, { timeout: 60000 });
const early = await page.evaluate(() => window.conception.state());
await page.waitForFunction(() => window.conception.state() && window.conception.state().done, null, { timeout: 60000 });
await page.click('#conception .cc-q[data-q="q.claire-where"] button:nth-child(2)');
const done = await page.evaluate(() => window.conception.state());
await page.screenshot({ path: join(out, 'panel.png'), timeout: 300000 });
await page.click('#conception-play');
await page.waitForFunction(() => window.story.state(), null, { timeout: 60000 });
const heard = await page.evaluate(() => window.story.hear('Où est ta femme ?'));
await page.waitForTimeout(4000);
const state = await page.evaluate(() => window.story.state());
const journal = (await page.evaluate(() => window.story.journal())).split('\n').filter(Boolean).map(l => JSON.parse(l));
const asked = await page.evaluate(() => window.__asked);
await browser.close();
const stage = asked.find(a => a.kind === 'json' && !/You judge/.test(a.prompt));
const said = journal.filter(e => e.type === 'event' && e.event === 'said').map(e => e.data.ref || 'line');
const answerP = journal.find(e => e.type === 'principles').records.find(p => p.id === 'f.claire-where');
const res = {
  seconds: Math.round((Date.now() - t0) / 1000),
  first_question_before_done: !early.done && early.questions.length >= 1, first_question_ms: done.first_question_ms, done_ms: done.done_ms, source: done.source,
  answers: done.answers, sketch_call_tier: asked[0] && asked[0].tier, story: state.story, station: state.station, said,
  answer_layer: answerP && answerP.layer + ' by ' + answerP.author.kind,
  stage_prompt_has_sketch: !!(stage && /conceived before play/.test(stage.prompt) && /Claire \(claire, absent\)/.test(stage.prompt) && /Marc is "he"/.test(stage.prompt)),
  heard, model_calls: journal.filter(e => e.type === 'model_call' && e.status !== 'pending').map(e => `${e.purpose} ${e.status} ${e.adapter || ''}${e.error ? ' ' + e.error : ''}`),
};
console.log(JSON.stringify(res, null, 1));
const real = errors.filter(l => !l.includes('ERR_TUNNEL') && !l.includes('Failed to load resource') && !l.includes('fonts.g'));
const ok = res.first_question_before_done && res.source === 'model' && /^sketch-/.test(state.story) && res.stage_prompt_has_sketch && said.includes('greet') && res.answer_layer === 'creator by creator';
if (real.length) console.error('console errors:\n' + real.join('\n'));
process.exit(real.length || !ok ? 1 : 0);
