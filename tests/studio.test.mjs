// The conception studio (core/studio.js, src/studio.json, briefs/conception-v2.md): stages with canned answers per agent.
// Level A (docs/sdlc.md §3): no browser, no model; the camp fire of the field note of 20 November is the case again.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runStudio, STUDIO_EVENT, creationSummary } from '../core/studio.js';
import { playable, withAnswers } from '../core/sketch.js';
import { harvestRecord } from '../core/harvest.js';
import { loadLibrary, loadSketchBase, loadStudio, writePack, loadPack, checkPack, studioCommand } from '../tools/story.mjs';

const library = loadLibrary(), base = loadSketchBase(), data = loadStudio();
const place = JSON.parse(readFileSync(new URL('./sketch/campfire-place.json', import.meta.url), 'utf8'));
const A = n => readFileSync(new URL(`./studio/${n}.txt`, import.meta.url), 'utf8');
const FREE = 'Une famille autour d\'un feu de camp, la nuit, sous les pins';
const STORY = 'Un père cherche sa femme partie dans la nuit, près du feu de camp';
/* Canned answers per agent: a string, an Error (the call fails), or a list (first call, then repair). Every prompt is kept. */
function canned(over = {}) {
  const asked = [], n = {};
  const answers = Object.assign({ understand: A('understand'), 'research.place': A('research.place'), 'research.people': A('research.people'), people: A('people'),
    interactions: A('interactions'), arc: A('arc'), questions: A('questions') }, over);
  const ask = async (prompt, o) => {
    asked.push({ agent: o.agent, tier: o.tier, prompt });
    const key = o.agent.replace(/\.repair$/, ''), k = n[key] = (n[key] || 0) + 1;
    let a = answers[key]; if (Array.isArray(a)) a = a[Math.min(k, a.length) - 1];
    if (a === undefined) throw new Error('no canned answer for ' + o.agent);
    if (a instanceof Error) throw a;
    return a;
  };
  return { asked, ask };
}
const temp = () => mkdtempSync(join(tmpdir(), 'studio-'));
const terminal = ['done', 'failed', 'skipped', 'fallback', 'repaired'];

test('the camp fire, a free place: findings with their source, a father, an absent wife, two unseen children, interactions, powers, no arc', async () => {
  const m = canned(), r = await runStudio({ sentence: FREE, place, library, base, data, ask: m.ask });
  assert.equal(r.source, 'model');
  const F = r.findings;
  assert.ok(F.length >= 6 && F.every(f => f.text && f.source), 'findings with sources');
  assert.ok(F.every(f => f.source === "the model's knowledge"), 'no web: the source is said as the model\'s knowledge, never an invented title');
  assert.deepEqual([...new Set(F.map(f => f.topic))].sort(), ['people', 'place']);
  const M = r.pack.manifest, doc = f => r.pack.texts[f];
  assert.equal(M.carrier, 'marc'); assert.match(r.about.who, /père/);
  assert.match(doc('characters/claire.pdl'), /@presence absent/);
  for (const k of ['leo', 'manon']) assert.match(doc(`characters/${k}.pdl`), /@presence unseen/);
  assert.match(doc('rules/interactions.pdl'), /when look\.at\(feu\)/);
  assert.ok(M.sketch.powers.some(p => p.granted === true) && M.sketch.powers.some(p => p.granted === false));
  assert.equal(r.pack.stations.stations.length, 1, 'a free place: one station');
  assert.equal(r.creation.events.find(e => e.stage === 'arc').status, 'skipped');
  assert.ok(!m.asked.some(a => a.agent === 'arc'));
  // the agents read what the earlier ones wrote, at their own tier
  const p = m.asked.find(a => a.agent === 'people'), i = m.asked.find(a => a.agent === 'interactions');
  assert.match(p.prompt, /lampe frontale ne porte/); assert.equal(p.tier, 'mid');
  assert.match(i.prompt, /claire \(Claire\), absent/); assert.match(i.prompt, /chaise-2/);
  assert.equal(m.asked.find(a => a.agent === 'research.place').tier, 'fast');
  assert.deepEqual(playable(withAnswers(r.pack, {}), library).errors, []);
});

test('a prompt that asks for a story gets an arc: stations along the path, beats, endings; the pack checks and plays', async () => {
  const search = async ({ query }) => [{ title: 'Guide du camping', url: 'https://example.org/guide', text: 'Un feu de camp se fait dans un cercle de pierres. ' + query }];
  const m = canned({ understand: A('understand-story') }), r = await runStudio({ sentence: STORY, place, library, base, data, ask: m.ask, search });
  assert.equal(r.source, 'model');
  const S = r.pack.stations.stations;
  assert.deepEqual(S.map(s => s.id), ['voiture', 'feu', 'sentier']);
  assert.deepEqual(S[1].within_reach.sort(), ['chaise-1', 'chaise-2', 'chaise-3', 'chaise-4', 'feu', 'glaciere'], 'a thing no station named goes to the nearest one');
  assert.deepEqual(S[1].connects.map(c => c.to), ['voiture', 'sentier']);
  assert.deepEqual(r.pack.beats.beats.map(b => [b.id, b.enter.on]), [['camp', 'session.start'], ['sentier', 'station.entered']]);
  assert.deepEqual(r.pack.beats.endings.map(e => e.id), ['back', 'search']);
  assert.ok(r.findings.some(f => f.source.includes('Guide du camping')), 'a cited search result keeps its source');
  assert.ok(r.creation.events.some(e => e.instrument === 'search' && e.kind === 'query' && e.status === 'done'));
  const dir = temp();
  try {
    writePack(dir, withAnswers(r.pack, {}));
    assert.ok(existsSync(join(dir, 'creation.json')));
    const c = checkPack(loadPack(dir), library); assert.deepEqual(c.errors, []);
    const pk = playable(loadPack(dir), library);
    assert.equal(pk.stations.length, 3); assert.deepEqual(pk.endings.map(e => e.id), ['back', 'search']);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('a failing stage is repaired with its own errors, the others are not asked again', async () => {
  const broken = A('interactions').replace('bind resting_place = chaise-2', 'bind resting_place = chaise-rouge');
  const m = canned({ interactions: [broken, A('interactions')] }), r = await runStudio({ sentence: FREE, place, library, base, data, ask: m.ask });
  assert.equal(r.source, 'repaired');
  const rep = m.asked.filter(a => /\.repair$/.test(a.agent));
  assert.deepEqual(rep.map(a => a.agent), ['interactions.repair']);
  assert.match(rep[0].prompt, /unknown thing "chaise-rouge"/); assert.match(rep[0].prompt, /Your previous answer/);
  assert.equal(r.creation.stages.interactions.status, 'repaired');
  assert.ok(r.creation.events.some(e => e.agent === 'interactions.repair' && e.status === 'repaired'));
});

test('a stage that keeps failing falls back without stopping the others', async () => {
  const badArc = A('arc').replace('finds f.lamp-left', 'finds f.nowhere');
  const m = canned({ understand: A('understand-story'), arc: [badArc, badArc], 'research.people': new Error('rate_limited') });
  const r = await runStudio({ sentence: STORY, place, library, base, data, ask: m.ask });
  assert.equal(r.source, 'partial');
  assert.equal(r.creation.stages.arc.status, 'fallback');
  assert.equal(r.pack.stations.stations.length, 1, 'the arc left out: one station');
  assert.equal(r.pack.manifest.carrier, 'marc'); assert.equal(r.questions.length, 2);
  assert.ok(r.findings.length >= 4 && r.findings.every(f => f.topic === 'place'), 'one research worker failed, the other\'s findings stay');
  assert.ok(r.creation.events.some(e => e.agent === 'research.people' && e.status === 'failed'));
  // and with no model at all: every invention skipped, the code sketch, play starts
  const z = await runStudio({ sentence: FREE, place, library, base, data, ask: null });
  assert.equal(z.source, 'fallback');
  assert.deepEqual(playable(z.pack, library).errors, []);
  assert.ok(z.creation.events.filter(e => e.status === 'skipped').length >= 5);
});

test('the creation events of a full run are complete, ordered and in one schema; the harvest record keeps them', async () => {
  let clock = 0; const seen = [];
  const r = await runStudio({ sentence: STORY, place, library, base, data, ask: canned({ understand: A('understand-story') }).ask, now: () => (clock += 7), onEvent: e => seen.push(e) });
  const E = r.creation.events;
  assert.deepEqual(E.map(e => e.seq), E.map((_, i) => i + 1));
  for (let i = 1; i < E.length; i++) assert.ok(E[i].t_ms >= E[i - 1].t_ms);
  for (const e of E) {
    assert.ok(e.stage && e.agent && e.tier && e.instrument && e.status, JSON.stringify(e));
    assert.ok(STUDIO_EVENT.kinds.includes(e.kind) && STUDIO_EVENT.status.includes(e.status), e.kind + ' ' + e.status);
  }
  for (const st of data.stages) {
    const mine = E.filter(e => e.stage === st.id);
    assert.ok(mine.length, st.id + ' emitted nothing');
    assert.ok(mine.some(e => terminal.includes(e.status)), st.id + ' never ended');
    const a = (data.stages.find(x => x.id === st.id).after || []);
    for (const d of a) assert.ok(E.findIndex(e => e.stage === d && terminal.includes(e.status)) < E.findIndex(e => e.stage === st.id), `${st.id} started before ${d} ended`);
  }
  assert.equal(E[E.length - 1].stage, 'check');
  assert.ok(E.some(e => e.kind === 'draft' && e.status === 'done' && e.wrote.some(l => /^# marc/.test(l))), 'what an agent wrote, as source lines');
  assert.ok(E.filter(e => e.kind === 'finding' && e.source).length >= 7);
  assert.ok(seen.length >= E.length);
  const rec = harvestRecord([], { meta: { id: 'x', creation: creationSummary(r.creation) }, strip: true });
  assert.equal(rec.creation.events.length, E.length); assert.equal(rec.creation.sentence, null);
});

test('story sketch --stages: every prompt written beside its answer; the one-call sketch stays the fallback when one call is affordable', async () => {
  const dir = temp();
  try {
    const r1 = await studioCommand({ sentence: FREE, place, dir, library });
    assert.equal(r1.source, 'fallback');
    assert.ok(existsSync(join(dir, 'understand.prompt.txt')) && existsSync(join(dir, 'people.prompt.txt')));
    for (const n of ['understand', 'research.place', 'research.people', 'people', 'interactions', 'questions']) writeFileSync(join(dir, n + '.txt'), A(n));
    const r2 = await studioCommand({ sentence: FREE, place, dir, library });
    assert.equal(r2.source, 'model'); assert.ok(r2.asked.every(a => a.answered));
    const one = await runStudio({ sentence: FREE, place, library, base, data, affordable: 1, ask: async () => readFileSync(new URL('./sketch/campfire.txt', import.meta.url), 'utf8') });
    assert.equal(one.pack.manifest.carrier, 'marc');
    assert.deepEqual([...new Set(one.creation.events.map(e => e.stage))], ['sketch', 'check']);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
