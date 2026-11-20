// Real models behind the model port (M3, first part): judge(), the prompt, reading a model's answers, the scene loop with
// a model, the adapter chain. Level A (docs/sdlc.md §3): no browser, no model; fixed canned responses only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { judge, reversed, readAnswers, understandQuestions, readUnderstanding } from '../core/judge.js';
import { stagePrompt, parseModelTokens, openEndings } from '../core/prompt.js';
import { createSession } from '../core/session.js';
import { createClocks } from '../core/clocks.js';
import { createPaperWorld } from '../core/paper-world.js';
import { serializeTokens } from '../core/tokens.js';
import { replay, modelSummary } from '../core/journal.js';
import { createReflexModel } from '../src/reflex-model.js';
import { createModelPort, createHomeNode, createHostModel, HOME_KEY } from '../src/model-port.js';
import { louisPack } from './core-fixture.mjs';

const ROOT = new URL('../', import.meta.url).pathname;
const REFLEXES = JSON.parse(readFileSync(ROOT + 'src/reflexes.json', 'utf8'));
const ANCHORS = JSON.parse(readFileSync(ROOT + 'stories/louis-round/anchors.json', 'utf8'));
const BEATS = JSON.parse(readFileSync(ROOT + 'stories/louis-round/beats.json', 'utf8'));
const STATIONS = JSON.parse(readFileSync(ROOT + 'stories/louis-round/stations.json', 'utf8')).stations;
const ENGINE = { kind: 'engine', id: 'test' };
const env = { now: () => Date.now(), setTimeout, clearTimeout, setInterval, clearInterval, AbortController };
const CLASSES = { intent: Object.keys(ANCHORS.intent_classes), commit: Object.keys(ANCHORS.commit_classes) };

function louisSession() {
  const c = louisPack(), s = createSession({ scene: c.scene, seed: 5, executor: createPaperWorld() });
  s.loadPrinciples(c.principles); s.start();
  return s;
}
const walk = (s, ...to) => { for (const st of to) s.submit({ author: ENGINE, horizon: 'now', kind: 'act', body: { op: 'go', to: 'station:' + st } }); };
const reflexFor = s => createReflexModel({ verbs: REFLEXES, anchors: ANCHORS, stations: STATIONS, carrier: 'sam', world: () => s.world, serialize: serializeTokens });
/* A live adapter with canned answers: { understand, absolutes, react } → value or (req) => value; `ms` delays an answer. */
const live = (answers, { name = 'host', ms = {} } = {}) => ({
  name, calls: [], can: () => true,
  async decide(req) { this.calls.push(req.question); if (ms[req.question]) await new Promise(r => setTimeout(r, ms[req.question])); const a = answers[req.question]; return typeof a === 'function' ? a(req) : a; },
  async generate(req) { this.calls.push('react'); if (ms.react) await new Promise(r => setTimeout(r, ms.react)); const a = answers.react; return { tokens: typeof a === 'function' ? a(req) : a }; },
});
const clocksFor = (s, model, o = {}) => createClocks(Object.assign({ session: s, model, character: 'sam', name: 'Sam', clock: () => Date.now(),
  lines: { ask: 'ask.back', doubt: REFLEXES.doubt_line, hold: REFLEXES.hold_line }, classes: CLASSES, endings: BEATS.endings }, o));

test('judge(): the confidence is played; on an absolute both orders must agree', () => {
  assert.deepEqual(['act', 'doubt', 'ask'].map((_, i) => judge({ answer: 'x', p: [0.9, 0.6, 0.3][i] }).play), ['act', 'doubt', 'ask']);
  assert.equal(judge({ answer: 'x' }).play, 'act', 'a port with no probability is taken at its word');
  assert.equal(judge({ answer: 'x', p: 0.9 }, { absolute: true }).play, 'ask', 'one order is not enough on an absolute');
  const flip = judge({ answer: true, p: 0.95, reverse: { answer: false, p: 0.9 } });
  assert.deepEqual([flip.uncertain, flip.play, flip.orders], [true, 'ask', 2], 'answers that flip with the order: uncertain');
  assert.equal(judge({ answer: 'none', p: 0.9, reverse: { answer: 'none', p: 0.7 } }).play, 'doubt', 'the lower probability of the two');
  const q = { id: 'D4.0', type: 'choice', absolute: true, options: ['none', 'a', 'b'] };
  assert.deepEqual(reversed(q).options, ['b', 'a', 'none']);
  const J = readAnswers([q, reversed(q)], { answers: { 'D4.0': { answer: 'none', p: 0.9 }, 'D4.0~r': { answer: 'c', p: 0.9 } } });
  assert.equal(J['D4.0'].play, 'ask', 'an answer outside the options is no answer');
});

test('reading a judgement of D1 to D3: a commitment of a known class, an amendment; a malformed answer asks back', () => {
  const s = louisSession(), qs = understandQuestions(s.world, { classes: CLASSES });
  const J = readAnswers(qs, { answers: { D1: { answer: { verb: 'stop', class: 'jay', target: 'nowhere' }, p: 0.9 }, D2: { answer: 'yes', p: 0.92 }, D3: { answer: 'amend', p: 0.85 } } });
  const u = readUnderstanding(J, { text: 'when that bird screams, flatten yourself', classes: CLASSES, commitId: c => 'c.' + c });
  assert.deepEqual([u.play, u.intent.verb, u.intent.class, u.intent.commit, u.stance], ['act', 'commit', 'jay', 'c.jay', 'amend']);
  const bad = readUnderstanding(readAnswers(qs, { answers: { D1: { answer: { verb: 'fly' }, p: 0.99 }, D2: { answer: false, p: 0.9 } } }), { text: 'x', classes: CLASSES, commitId: () => 'c' });
  assert.equal(bad.play, 'ask');
});

test('the stage prompt: a stable prefix with her principles, examples and counter-examples; a small delta; facts only once known', () => {
  const s = louisSession(); walk(s, 'first-mark');
  const a = stagePrompt(s.world, { character: 'sam', name: 'Sam', lang: 'en', endings: BEATS.endings, heard: 'look at the mark' });
  s.advance(20);
  const b = stagePrompt(s.world, { character: 'sam', name: 'Sam', lang: 'en', endings: BEATS.endings, heard: 'what is that?', now: ['m:reflex/reflex now act.say ref=look.ok'] });
  assert.equal(a.prefix, b.prefix, 'the prefix does not change with what is said or with time');
  assert.notEqual(a.delta, b.delta);
  assert.ok(b.delta.length * 8 < b.prefix.length, `delta ${b.delta.length} vs prefix ${b.prefix.length}`);
  for (const id of ['sam.voice.dry', 'sam.never.alive', 'sam.arc.takeover', 'p.no-supernatural', 'voice.assume.office']) assert.ok(a.prefix.includes('{' + id + '}'), id);
  assert.ok(a.prefix.includes("That's not the forestry office.") && !a.prefix.includes('Ça, c\'est pas l\'ONF'), 'examples in the play language');
  assert.ok(a.prefix.includes('x [the voice is rude]'), 'counter-examples');
  assert.ok(!a.prefix.includes('seven entrances') && !a.prefix.includes('{louis.secret}'), 'what she does not know yet is not in her prompt');
  assert.deepEqual(openEndings(s.world, BEATS.endings), []);
  s.submit({ author: ENGINE, horizon: 'story', kind: 'fact', body: { subject: 'f.louis-stayed', predicate: 'established', value: true } });
  const c = stagePrompt(s.world, { character: 'sam', lang: 'en', endings: BEATS.endings });
  assert.notEqual(c.prefix, b.prefix, 'a new fact she knows changes the prefix');
  assert.deepEqual(openEndings(s.world, BEATS.endings).map(e => e.id), ['takeover', 'camera-off']);
  assert.ok(c.delta.includes('takeover:'), 'the decision endings are offered once open');
});

test('reading a model\'s tokens: no envelope, aliases, bullets, a broken quote repaired, prose dropped', () => {
  const { txs, dropped } = parseModelTokens([
    '```', '- say line.en="Right. Not lying in that mud." tone=sad', 'act.wait seconds=12', 'act.look tg=thing:marque-1',
    'Sure! Here is her reaction:', 'story fact subj=sam pred=thinks val=louis_was_here', 'now intent verb=go', 'act.say line.en="unfinished', '```'].join('\n'));
  assert.deepEqual(txs.map(t => [t.horizon, t.kind, t.body.op || t.body.predicate]), [['now', 'act', 'say'], ['now', 'act', 'wait'], ['now', 'act', 'look'], ['story', 'fact', 'thinks'], ['now', 'act', 'say']]);
  assert.ok(txs.every(t => t.author.kind === 'model' && t.author.id === 'stager' && !t.cause));
  assert.deepEqual(dropped.map(d => d.why), ['not_a_transaction', 'intent_is_the_players']);
  const s = louisSession(); walk(s, 'first-mark');
  const r = txs.slice(0, 2).map(t => s.submit(t, { loop: 'scene' }));
  assert.deepEqual(r.map(x => x.status), ['repaired', 'repaired'], 'an unknown tone, a wait too long: repaired by the validator');
  assert.deepEqual(r.map(x => x.repair[0].action), ['replace', 'clamp']);
});

test('a free sentence the reflex does not get: judged by the model at once, Sam invents her answer, an absolute rejects a line', async () => {
  const s = louisSession(); walk(s, 'first-mark', 'fallen-pine');
  const host = live({
    understand: { answers: { D1: { answer: { verb: 'stop', class: 'jay' }, p: 0.9 }, D2: { answer: true, p: 0.95 }, D3: { answer: 'amend', p: 0.9 } } },
    absolutes: req => ({ answers: Object.fromEntries(req.questions.map(q => [q.id, { answer: q.id.startsWith('D4.1') ? 'sam.never.alive' : 'none', p: 0.9 }])) }),
    react: 'act.say line.en="Not flat in the mud. Crouched, still. That I promise." tone=dry\nact.say line.en="Maybe he is still out there."\neffect.sound.play cue=bracken.rustle at=thing:terrier\nstory effect.story.end id=takeover',
  });
  const model = createModelPort({ reflex: reflexFor(s), adapters: [host], env });
  const k = clocksFor(s, model);
  const r = await k.hear({ text: 'should that noisy blue thing up there start yelling, flatten yourself', lang: 'en' });
  assert.equal(r.intent.tx.body.verb, 'commit', 'the judgement landed within the now budget: one intent, judged');
  assert.equal(r.intent.tx.author.tier, 'translate');
  assert.equal(s.world.commitments['c.jay'].status, 'amended', 'D3 said amend: the bank amends, the rule is the class\'s');
  const later = await r.scene;
  const E = s.journal.entries, by = seq => E[seq];
  assert.deepEqual(later.map(x => x.status), ['accepted', 'rejected', 'rejected', 'rejected']);
  assert.equal(by(later[0].seq).cause.amends, r.now.find(x => x.tx.body.op === 'say').seq, 'her invented line amends her first one');
  assert.deepEqual(by(later[1].seq).reasons, [{ path: 'body.line', why: 'constraint', value: 'sam.never.alive', by: 'judgement' }], 'D4, both orders, on a prose absolute');
  assert.equal(by(later[2].seq).reasons[0].value, 'sam.never.harm', 'the compiled absolute, by the validator');
  assert.equal(by(later[3].seq).reasons[0].why, 'ending_not_open', 'an ending she cannot decide yet');
  const calls = E.filter(e => e.type === 'model_call' && e.status !== 'pending');
  assert.deepEqual(calls.map(e => [e.purpose, e.adapter, e.instrument]), [['understand', 'host', 'judgement'], ['intent', 'reflex', 'judgement'], ['react', 'host', 'invention'], ['absolutes', 'host', 'judgement']]);
  assert.ok(calls.every(e => typeof e.latency_ms === 'number'));
  const back = replay(E, createPaperWorld());
  assert.equal(back.hash, s.hash(), 'the vetoes replay from the journal');
  const m = modelSummary(E);
  assert.deepEqual([m.calls['host/invention'], m.calls['host/judgement'], m.rejected, m.rejected_by.sort()], [1, 2, 3, ['ending_not_open', 'sam.never.alive', 'sam.never.harm']]);
  assert.equal(typeof m.first_reaction_ms, 'number');
});

test('Sam\'s own ending: open once the truth has landed, decided by the model', async () => {
  const s = louisSession(); walk(s, 'first-mark', 'fallen-pine', 'platiere', 'approach', 'hide');
  s.submit({ author: ENGINE, horizon: 'story', kind: 'fact', body: { subject: 'f.louis-stayed', predicate: 'established', value: true } });
  const model = createModelPort({ reflex: reflexFor(s), adapters: [live({ react: 'act.say ref=ending.takeover\nstory effect.story.end id=takeover' })], env });
  const r = await clocksFor(s, model, { absolutes: false }).hear({ text: 'hello', lang: 'en' });
  assert.deepEqual((await r.scene).map(x => x.status), ['accepted', 'accepted']);
  assert.equal(s.world.story.ending, 'takeover');
});

test('a slow judgement: she holds at once, the judged intent lands in the scene loop and amends the reflex one; a dead model falls back', async () => {
  const s = louisSession(); walk(s, 'first-mark');
  const host = live({ understand: { answers: { D1: { answer: { verb: 'look', target: 'thing:marque-1' }, p: 0.85 }, D2: { answer: false, p: 0.9 }, D3: { answer: 'accept', p: 0.9 } } }, react: '' }, { ms: { understand: 60 } });
  const k = clocksFor(s, createModelPort({ reflex: reflexFor(s), adapters: [host], env }), { judgeWaitMs: 5 });
  const r = await k.hear({ text: 'what on earth is that thing on the bark', lang: 'en' });
  assert.deepEqual(r.now.map(x => x.tx.body.ref), ['hold.think'], 'the present answers at once: she thinks');
  const later = await r.scene;
  const i2 = s.journal.entries[later[0].seq];
  assert.deepEqual([i2.kind, i2.loop, i2.cause.amends, i2.body.verb, i2.body.target], ['intent', 'scene', r.intent.seq, 'look', 'thing:marque-1']);
  assert.ok(later.some(x => x.tx.body.op === 'look'), 'then the reaction to what was meant');
  // the model is gone: the reflex answers alone, she asks back (no hold, nothing staged)
  const dead = { name: 'host', can: () => true, decide: async () => { throw new Error('offline'); }, generate: async () => { throw new Error('offline'); } };
  const r2 = await clocksFor(s, createModelPort({ reflex: reflexFor(s), adapters: [dead], env })).hear({ text: 'blorp wibble', lang: 'en' });
  assert.deepEqual(r2.now.map(x => x.tx.body.ref), ['ask.back']);
  assert.deepEqual(await r2.scene, []);
  assert.deepEqual(s.journal.entries.filter(e => e.type === 'model_call' && e.status === 'failed').map(e => e.purpose), ['understand', 'react']);
});

test('the adapter chain: home node when healthy, else the host\'s model, each cut at its time limit; no key in the page', async () => {
  const store = new Map(), storage = { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: k => store.delete(k) };
  let healthy = true, seen = [];
  const fetch = async (url, o = {}) => {
    seen.push([url, o.headers && o.headers.Authorization]);
    if (url.endsWith('/health')) return { ok: healthy, status: healthy ? 200 : 503, json: async () => ({ ok: true, node: 'desk', capabilities: { decide: { warm: true }, generate: { fast: null, mid: { model: 'x' }, large: null } } }) };
    if (url.endsWith('/v1/decide')) return new Promise(() => {});              // never answers: cut at the limit
    return { ok: true, json: async () => ({ tokens: 'act.say ref=look.ok', latency_ms: 900 }) };
  };
  const home = createHomeNode({ fetch, storage, env });
  assert.equal((await home.health()).configured, false, 'not configured: no call');
  storage.setItem(HOME_KEY, JSON.stringify({ url: 'https://node.example/', token: 't0k' }));
  const st = await home.health();
  assert.deepEqual([st.up, st.caps.decide, st.caps.generate.mid, st.caps.generate.large], [true, true, true, false]);
  let sampled = 0;
  const sampler = { json: async (prompt, o) => { sampled++; assert.equal(o.modelTier, 'quick'); assert.ok(/"answers"/.test(prompt)); return { answers: { D2: { answer: true, p: 0.9 } } }; } };
  const host = createHostModel({ sample: () => sampler });
  const port = createModelPort({ reflex: { decide: async () => ({ answer: { verb: 'other' }, p: 0.3, tier: 'reflex' }), arrival: () => [] }, adapters: [home, host], env, limits: { judge_ms: 30, invent_ms: 200 } });
  assert.deepEqual(port.status(), { judge: 'home', invent: 'home' });
  const g = await port.generate({ tier: 'stage', purpose: 'react', prompt: { prefix: 'p', delta: 'd' } });
  assert.deepEqual([g.adapter, g.tokens], ['home', 'act.say ref=look.ok']);
  assert.ok(seen.some(([u, a]) => u === 'https://node.example/v1/generate' && a === 'Bearer t0k'));
  const d = await port.decide({ tier: 'translate', question: 'understand', questions: [{ id: 'D2', type: 'bool', text: '?' }] });
  assert.deepEqual([d.adapter, d.answers.D2.answer, sampled], ['host', true, 1], 'the home node timed out: the host answered');
  assert.equal((await port.decide({ question: 'intent', text: 'x' })).adapter, 'reflex', 'the now loop\'s own questions stay with the reflex');
  healthy = false; await home.health();
  assert.deepEqual(port.status(), { judge: 'host', invent: 'host' });
  const none = createModelPort({ reflex: { decide: async () => ({}) }, adapters: [createHostModel({ sample: () => null })], env });
  assert.deepEqual([none.available('judge'), none.available('invent'), (await none.generate({ tier: 'stage' })).failed], [false, false, 'no model']);
  const src = readFileSync(ROOT + 'src/model-port.js', 'utf8');
  assert.ok(!/claude-[a-z]+-\d|sk-ant|api[_-]?key/i.test(src), 'no model name and no key in the page\'s port');
});
