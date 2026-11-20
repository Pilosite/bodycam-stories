// The trailer mode (src/trailer.js): its script loader and the mapping from journal entries to read-outs, both pure.
// Level A (docs/sdlc.md §3): no browser; the golden journals are reused, no new end-to-end run.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fromJSONL } from '../core/journal.js';
import { loadTrailer, createReadout, scriptSeconds } from '../src/trailer.js';

const SCRIPT = JSON.parse(readFileSync(new URL('../stories/louis-round/trailer.json', import.meta.url), 'utf8'));
const M2 = fromJSONL(readFileSync(new URL('./golden/m2-page-session.jsonl', import.meta.url), 'utf8'));
const P8 = fromJSONL(readFileSync(new URL('./golden/p8-louis-pack.jsonl', import.meta.url), 'utf8'));
const feedAll = (E, patterns) => { const r = createReadout({ patterns }), sig = []; for (const e of E) sig.push(...r.feed(e)); return { r, sig }; };

test('the trailer of « Louis\'s Round » loads, in both languages, and lasts about ninety seconds', () => {
  const { script, errors } = loadTrailer(SCRIPT);
  assert.deepEqual(errors, []);
  for (const s of script.steps.filter(s => s.kind === 'say' || s.kind === 'caption')) for (const l of ['en', 'fr']) assert.ok((s.text || s.caption.text)[l], 'step text in ' + l);
  const secs = scriptSeconds(script);
  assert.ok(secs > 75 && secs < 120, secs + ' s');
  assert.equal(script.steps.at(-1).kind, 'end');
  assert.ok(Math.abs(scriptSeconds(script, 1.5) - secs) > 20, 'the pace stretches every step but world time');
});

test('the loader rejects what is not a step and names it; nothing in a script touches the world', () => {
  const { errors, script } = loadTrailer({ story: 'x', pace: 9, steps: [{ say: { en: 'hi' }, camera: 'hold' }, { camera: 'look' }, { time: 40, speed: 40 },
    { show: ['map'] }, { setPlace: { fog: 1 } }, { time: 40, speed: 4 }, { caption: { text: { en: 'a' } } }] });
  assert.deepEqual(errors.map(e => e.step), [null, 0, 1, 2, 3, 4]);
  assert.deepEqual(script.steps.map(s => [s.kind, s.hold]), [['time', 10], ['caption', 0]], 'time holds its real duration');
});

test('read-outs of a session with no model: every live decision is said to be reflex code; rules, patterns, promises from the journal', () => {
  const { r, sig } = feedAll(M2, SCRIPT.patterns);
  const st = r.state();
  assert.deepEqual(st.decisions, { model: 0, reflex: M2.filter(e => e.type === 'model_call').length });
  assert.ok(sig.filter(s => s.kind === 'decision').every(s => s.label === 'reflex (code)'));
  const rules = sig.filter(s => s.kind === 'rule');
  assert.deepEqual(rules.map(s => s.id), M2.filter(e => e.type === 'rule' && e.status === 'fired').map(e => e.rule));
  const mark = rules.find(s => s.id === 'louis-marks.sign-read.1');
  assert.equal(mark.text, 'when look.at(marque-1) once -> reveal(f.marks-private), say(mark.read.1)');
  assert.deepEqual([mark.pattern.id, mark.pattern.name.en, mark.clock], ['trail-of-signs', 'a trail of signs', 'story']);
  assert.equal(rules.find(s => s.id === 'r.rustle').text, 'when station.dwell(hide, 40) once -> sound(bracken.rustle), reveal(f.rustle)');
  assert.equal(rules.find(s => s.id === 'r.rustle').pattern, null);
  const jay = rules.find(s => s.id === 'c.jay');
  assert.deepEqual([jay.by, jay.text], ['player', 'stop and crouch if the jay calls']);
  assert.deepEqual(sig.filter(s => s.kind === 'promise' && s.id === 'c.jay').map(s => s.status), ['amended', 'kept']);
  assert.deepEqual(Object.fromEntries(Object.values(st.promises).map(p => [p.id, p.status])), { 'c.jay': 'kept', 'c.silence': 'kept' });
  const pulses = new Set(sig.filter(s => s.kind === 'pulse').map(s => s.clock));
  assert.deepEqual([...pulses].sort(), ['now', 'scene', 'story']);
});

test('read-outs of a session with models: the decision says model and its tier; an absolute that held shows its own text', () => {
  const { r, sig } = feedAll(P8, SCRIPT.patterns);
  const dec = sig.filter(s => s.kind === 'decision');
  assert.ok(dec.length && dec.every(s => s.by === 'model' && s.label.startsWith('model · ')));
  const abs = sig.filter(s => s.kind === 'absolute');
  assert.deepEqual(abs.map(s => s.id), ['sam.never.harm']);
  assert.match(abs[0].text, /never harms an animal/);
  assert.equal(r.state().absolutes, 1);
  const half = sig.find(s => s.kind === 'rule' && s.id === 'battery-clock.half');
  assert.equal(half.pattern.name.en, 'a ticking clock');
});

test('a new session resets the tally; a pending model call is not a decision yet', () => {
  const r = createReadout();
  assert.deepEqual(r.feed({ type: 'model_call', tier: 'stage', loop: 'scene', status: 'pending' }), []);
  r.feed({ type: 'model_call', tier: 'stage', loop: 'scene', status: 'landed', model: 'some-model' });
  assert.deepEqual(r.state().decisions, { model: 1, reflex: 0 });
  assert.deepEqual(r.state().models, ['some-model']);
  r.feed(M2[0]);
  assert.deepEqual(r.state().decisions, { model: 0, reflex: 0 });
});
