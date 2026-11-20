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
  assert.ok(Object.keys(GOLDEN).length >= 3 && Object.keys(GOLDEN).length <= 5);
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

test('p8 principles: absolute rejects, hard rules fire, soft ones are in scope and audited, provenance kept', () => {
  const { E, w } = run('p8-principles');
  assert.ok(txs(E).some(e => e.status === 'rejected' && e.reasons.some(r => r.why === 'constraint' && r.value === 'sam.hide-early')));
  assert.deepEqual(E.filter(e => e.type === 'rule' && e.status === 'fired').map(e => e.rule), ['hide.quiet', 'battery.low']);
  assert.deepEqual(E.find(e => e.type === 'model_call').principles, ['sam.dry', 'sam.climb']);
  assert.deepEqual(auditSummary(E)['sam.dry'], { relevant: 1, respected: 1, broken: 0, rate: 1, breaks: [] });
  for (const f of w.facts) assert.ok(f.author && f.author.kind && Number.isInteger(f.tx));
  for (const r of Object.values(w.rules)) assert.ok(r.author && r.author.kind && Number.isInteger(r.tx) && r.principle);
  assert.equal(w.rules['battery.low'].layer, 'base');
  assert.equal(w.principles['lea.fog'].layer, 'lea');
});

test('p9 commitment: made at an early station, kept two stations later, linked by cause', () => {
  const { E, w } = run('p9-commitment');
  const c = w.commitments['c.jay'];
  assert.deepEqual(c.history.map(h => h.status), ['proposed', 'amended', 'due', 'kept']);
  const fired = txs(E).filter(e => e.cause && e.cause.commit === 'c.jay' && e.author.kind === 'engine');
  assert.deepEqual(fired.map(e => e.body.op || e.body.predicate), ['stop', 'posture', 'say', 'kept']);
  assert.equal(E[c.intent].body.verb, 'commit');
});
