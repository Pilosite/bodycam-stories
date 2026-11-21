// The conception studio smoke run (docs/sdlc.md §3 level D, one run; briefs/conception-v2.md): dist/index.html in Chrome
// (software rendering, a small desktop window so the agent network shows) with a stand-in sampler (no model in this
// container). The opening's question gets a prompt no recorded preparation matches: the studio runs for real over the
// stand-in (each agent's canned answer of tests/studio/ streamed in chunks; the world builder's plan, place and review
// answered from tests/sketch/campfire-place.json), and the opening is driven by its creation events. Then the conception
// panel, « Play », the story on its first station, « Avance », the second station.
// Checks: every stage drawn in the scroll and ended, the network holds only the agents really called (no model family, no
// translator lamp), the live label, the panel's questions, three stations and one transition, no console error.
// Two screenshots in out/studio/: the opening while the agents write, and the end of the opening.
//   node tools/build.mjs && node tools/studio-smoke.mjs
import { chromium } from 'playwright';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..'), out = join(root, 'out/studio');
mkdirSync(out, { recursive: true });
const A = n => readFileSync(join(root, 'tests/studio', n + '.txt'), 'utf8');
const answers = { understand: A('understand-story'), place: A('research.place'), people_r: A('research.people'), people: A('people'), interactions: A('interactions'), arc: A('arc'), questions: A('questions') };
const place = JSON.parse(readFileSync(join(root, 'tests/sketch/campfire-place.json'), 'utf8'));
const SENTENCE = 'Un père cherche sa femme partie dans la nuit, près du feu de camp';
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1100, height: 760 }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
await page.addInitScript(({ c, answers, place }) => {
  window.__CFG = c; window.__asked = [];
  const wait = ms => new Promise(ok => setTimeout(ok, ms));
  const which = p => /You are the first agent/.test(p) ? 'understand' : /Your topic: place/.test(p) ? 'place' : /Your topic: people/.test(p) ? 'people_r'
    : /You conceive the people/.test(p) ? 'people' : /You write what can be done/.test(p) ? 'interactions' : /You lay the narrative arc/.test(p) ? 'arc' : /You ask the creator/.test(p) ? 'questions' : null;
  const sample = async (prompt, o = {}) => {                       // one agent's answer, streamed in 10 chunks over ~1.5 s
    const k = which(String(prompt)), a = answers[k] || '';
    window.__asked.push({ kind: 'text', agent: k, tier: o.modelTier });
    for (let i = 1; i <= 10; i++) { await wait(150); if (o.onText) o.onText({ text: a.slice(0, Math.round(a.length * i / 10)), delta: '' }); }
    return { text: a, truncated: false };
  };
  sample.json = async (prompt, o = {}) => {                        // the world builder (plan, place, review) and the story's judgements
    const p = String(prompt); window.__asked.push({ kind: 'json', tier: o.modelTier, head: p.slice(0, 40) });
    await wait(300);
    if (/^Tu prépares une scène/.test(p)) return { titre: place.titre, depart: 'le feu et les chaises' };
    if (/^Tu écris la fiche de lieu/.test(p)) return JSON.parse(JSON.stringify(place));
    if (/^Tu relis une scène/.test(p)) return { note: 7, fini: true, defauts: [], changements: {} };
    return /You judge/.test(p) ? { answers: {} } : { tokens: 'act.say line.fr="Le feu baisse." tone=flat' };
  };
  window.claude = { use: async name => name === 'sample' ? sample : null };
}, { c: { demo: true, conception: true, still: true, maxSpp: 2, nowalk: true, capPasses: 2 }, answers, place });
const t0 = Date.now();
await page.goto('file://' + resolve(root, 'dist/index.html'), { timeout: 300000 });
await page.waitForSelector('#ouv-launch', { timeout: 300000 });
const press = sel => page.evaluate(q => document.querySelector(q).click(), sel);   // the main thread is busy compiling: no actionability wait
await press('#ouv-launch');
await page.waitForTimeout(1300);
await page.evaluate(t => { document.getElementById('ouv-txt').value = t; document.getElementById('ouv-form').requestSubmit(); }, SENTENCE);
await page.waitForFunction(() => { const v = window.balade.ouverture && document.querySelector('#ouverture'); return v && document.querySelectorAll('#ouv-log .ouv-etape').length >= 4; }, null, { polling: 1000, timeout: 300000 });
await page.screenshot({ path: join(out, 'opening-live.png'), timeout: 300000 });
const live = await page.evaluate(() => ({ mention: document.getElementById('ouv-mention').textContent, net: (document.querySelector('.ouv-vivant') || {}).textContent || '' }));
await page.waitForFunction(() => window.conception.state() && window.conception.state().done, null, { polling: 1000, timeout: 300000 });
const steps = await page.evaluate(() => [...document.querySelectorAll('#ouv-log .ouv-etape')].map(x => x.querySelector('.ouv-titre').textContent + (x.classList.contains('fait') ? ' ✓' : '')));
const agents = await page.evaluate(() => [...document.querySelectorAll('.ouv-vivant .ouv-mc')].map(t => t.textContent));
await page.screenshot({ path: join(out, 'opening-end.png'), timeout: 300000 });
await page.waitForFunction(() => { const c = document.getElementById('conception'); return c && !c.hidden && !document.getElementById('ouverture'); }, null, { polling: 1000, timeout: 300000 });
const st = await page.evaluate(() => window.conception.state());
await press('#conception-play');
await page.waitForFunction(() => window.story.state(), null, { polling: 1000, timeout: 120000 });
const s1 = await page.evaluate(() => window.story.state());
await page.evaluate(() => window.story.hear('Avance'));
await page.waitForFunction(() => window.story.state().station !== 'voiture', null, { polling: 1000, timeout: 120000 }).catch(() => {});
const s2 = await page.evaluate(() => window.story.state());
const asked = await page.evaluate(() => window.__asked);
await browser.close();
const res = { seconds: Math.round((Date.now() - t0) / 1000), mention: live.mention, steps, agents, staged_labels: /haiku|sonnet|opus|JEV/i.test(live.net), conception: st,
  story: s1.story, station_1: s1.station, station_2: s2.station, calls: asked.map(a => a.agent || a.head).join(' | ') };
console.log(JSON.stringify(res, null, 1));
const real = errors.filter(l => !l.includes('ERR_TUNNEL') && !l.includes('Failed to load resource') && !l.includes('fonts.g'));
const ok = /En direct/.test(res.mention) && steps.length >= 9 && steps.filter(s => s.endsWith('✓')).length >= 8 && !res.staged_labels
  && ['understand', 'place', 'people', 'builder', 'interactions', 'arc', 'questions', 'check', 'engine'].every(a => agents.includes(a))
  && st.source === 'model' && st.questions.length === 2 && s1.station === 'voiture' && s2.station === 'feu';
if (real.length) console.error('console errors:\n' + real.join('\n'));
process.exit(real.length || !ok ? 1 : 0);
