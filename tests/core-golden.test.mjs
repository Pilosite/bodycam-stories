// Level C: golden replays, one journal per pillar (tests/golden/, written by tools/core-golden.mjs).
// Each journal replays to the same entries and the same state hash; a few invariants of its pillar are checked on the replay.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { replay, diff, fromJSONL } from '../core/journal.js';
import { createPaperWorld } from '../core/paper-world.js';
import { auditSummary } from '../core/source.js';

const dir = new URL('./golden/', import.meta.url);
const GOLDEN = Object.fromEntries(readdirSync(dir).filter(f => f.endsWith('.jsonl')).map(f => [f.replace('.jsonl', ''), fromJSONL(readFileSync(new URL(f, dir), 'utf8'))]));
const run = name => { const g = GOLDEN[name], r = replay(g, createPaperWorld()); return { g, r, E: r.journal.entries, w: r.session.world }; };
const txs = E => E.filter(e => e.type === 'tx');

test('golden journals replay identically, same seed, same hash', () => {
  assert.ok(Object.keys(GOLDEN).length >= 3 && Object.keys(GOLDEN).length <= 5);   // docs/sdlc.md §3: three to five
  for (const name of Object.keys(GOLDEN)) {
    const { g, r } = run(name), d = diff(g, r.journal);
    assert.ok(d.equal, `${name}: first difference at seq ${d.first}: ${JSON.stringify(d.changes[0])}`);
    assert.equal(r.hash, g.filter(e => e.type === 'hash').pop().hash, name + ': final state hash');
  }
});

test('p1 transactions: repaired toward the request, rejected with a reason, nothing else enters', () => {
  const { E } = run('p1-transactions'), T = txs(E);
  const why = T.flatMap(e => e.reasons || []).map(r => r.why), act = T.flatMap(e => e.repair || []).map(r => r.action);
  for (const a of ['complete', 'shrink', 'replace', 'step', 'horizon', 'drop']) assert.ok(act.includes(a), 'repair ' + a);
  for (const r of ['unknown_op', 'reserved_v2', 'unknown_field', 'not_allowed']) assert.ok(why.includes(r), 'rejection ' + r);
  const cairn = T.find(e => e.body.op === 'thing.place');
  assert.equal(cairn.repair.find(r => r.action === 'shrink').why, 'the player asked for 0.5 m');
  // every world change has a transaction as cause: events point to a tx entry or a clock/observation input
  for (const e of E.filter(e => e.type === 'event')) assert.ok(['tx', 'advance', 'observe', 'principles'].includes(E[e.cause].type));
});

test('p2 horizons: now expires by ttl, scene with the scene, story stays', () => {
  const { E, w } = run('p2-horizons');
  assert.ok(E.some(e => e.event === 'thing.removed' && e.data.id === 'breath' && e.data.reason === 'expired'));
  assert.equal(w.place.fog, 0.03, 'scene fog reverted at scene change');
  assert.deepEqual(w.facts.map(f => f.predicate), ['last_seen'], 'scene fact gone, story fact kept');
  assert.deepEqual(new Set(txs(E).map(e => e.horizon)), new Set(['now', 'scene', 'story']));
});

test('p3 a model-written rule fires later in code, with no model call; cycles are cut', () => {
  const { E, g } = run('p3-model-rule');
  const reg = E.find(e => e.type === 'tx' && e.body.id === 'jay.stop'), fire = E.find(e => e.type === 'rule' && e.rule === 'jay.stop' && e.status === 'fired');
  assert.ok(reg && fire && fire.t - reg.t >= 100, 'registered at t=0, fired two minutes later');
  assert.equal(E.slice(reg.seq, fire.seq).filter(e => e.type === 'model_call').length, 0, 'no model call in between');
  assert.ok(E.some(e => e.type === 'rule' && e.rule === 'echo.a' && e.status === 'blocked' && e.reason === 'cycle'));
  assert.ok(txs(E).some(e => e.body.id === 'echo.self' && e.reasons[0].why === 'self_trigger'));
  // what-if: the creator narrows the rule to 10 m and replays the same session: it no longer fires
  const r2 = replay(g, createPaperWorld(), undefined, { edit: e => e.type === 'tx' && e.proposed.body.id === 'jay.stop'
    ? Object.assign({}, e, { proposed: Object.assign({}, e.proposed, { body: Object.assign({}, e.proposed.body, { if: [{ near: { a: 'body', b: 'thing:hide', within_m: 10 } }] }) }) }) : e });
  const d = diff(g, r2.journal);
  assert.ok(!d.equal && d.rules.a.includes('jay.stop') && !d.rules.b.includes('jay.stop'));
});

test('p3 bis a gauge named in source rises, its word fires a rule, a model call sees it, an absolute rejects', () => {
  const { E } = run('p3-model-rule');
  assert.deepEqual(E.filter(e => e.type === 'event' && e.event === 'gauge.changed').map(e => e.data.word), ['medium', 'high']);
  assert.ok(E.some(e => e.type === 'rule' && e.rule === 'hide.quiet' && e.status === 'fired'));
  const mc = E.filter(e => e.type === 'model_call').pop();
  assert.deepEqual(mc.gauges, [{ id: 'disturbance', value: 1, word: 'high', mentioned_by: ['sam.hush', 'sam.closer'] }]);
  assert.deepEqual(mc.principles, ['sam.hush', 'sam.closer']);
  assert.ok(txs(E).some(e => e.reasons && e.reasons[0].value === 'sam.hide-early'));
});

test('p8 the real pack: layers merged with provenance, explicit and pattern rules in code, an absolute, a commitment kept', () => {
  const { E, w } = run('p8-louis-pack');
  const P = w.principles;
  assert.equal(P['f.sett'].layer, 'ranger-notes');
  assert.deepEqual(P['f.sett'].overrides.map(o => o.layer), ['base']);
  assert.equal(w.rules['rn.rule.last-line'].author.id, 'contributor-a');
  assert.equal(w.rules['louis-marks.sign-read.1'].principle, 'louis-marks.sign-read.1');
  assert.equal(P['louis-marks.sign-read.1'].pattern, 'trail-of-signs');
  assert.ok(txs(E).some(e => e.status === 'rejected' && e.reasons.some(r => r.why === 'constraint' && r.value === 'sam.never.harm')));
  assert.equal(P['sam.never.harm'].compiled.approved_by, 'creator:toine');
  const fired = E.filter(e => e.type === 'rule' && e.status === 'fired').map(e => e.rule);
  for (const r of ['louis-marks.sign-read.1', 'r.jay-first', 'c.jay', 'battery-clock.half']) assert.ok(fired.includes(r), r + ' fired');
  // the commitment: made at the third station, kept at the fifth, every act linked to it
  const c = w.commitments['c.jay'];
  assert.deepEqual(c.history.map(h => h.status), ['proposed', 'amended', 'due', 'kept']);
  assert.equal(E[c.intent].body.class, 'jay');
  assert.deepEqual(txs(E).filter(e => e.cause && e.cause.commit === 'c.jay' && e.author.kind === 'engine').map(e => e.body.op || e.body.predicate), ['stop', 'posture', 'say', 'kept']);
  // soft principles in scope of a model call, and the audit
  assert.ok(E.find(e => e.type === 'model_call').principles.includes('sam.voice.dry'));
  assert.deepEqual(auditSummary(E)['sam.word.keeps'], { relevant: 1, respected: 1, broken: 0, rate: 1, breaks: [] });
  // the three clocks: every tx has its loop, the late one is flagged
  assert.ok(txs(E).every(e => ['now', 'scene', 'story'].includes(e.loop)));
  assert.deepEqual(txs(E).filter(e => e.late).map(e => e.body.verb), ['commit']);
  for (const f of w.facts) assert.ok(f.author && f.author.kind && Number.isInteger(f.tx));
});
