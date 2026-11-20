// The harvest record (core/harvest.js) and the page's browser cap (src/harvest.js keepRecords). Level A (docs/sdlc.md §3):
// the golden journals and one small legacy fixture (the free session of 20 November 2026, reconstructed); no browser.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { harvestRecord, mergeRecords, parseLegacyJournal, HARVEST_CAPS } from '../core/harvest.js';
import { keepRecords } from '../src/harvest.js';

const read = p => readFileSync(new URL(p, import.meta.url), 'utf8');
const P1 = read('./golden/p1-transactions.jsonl'), M2 = read('./golden/m2-page-session.jsonl');
const FREE = read('../harvest/journals/2026-11-20-free-session-phone.txt');

test('core journal: the three lists, each item with its seq', () => {
  const r = harvestRecord(P1, { gaps: [{ call: 'playSound', why: 'no recipe for the cue jay_alarm', seq: 3 }] });
  const missing = r.asked_not_doable.map(i => i.missing);
  assert.deepEqual(missing, ['playSound', 'material:marble', 'op:fly', 'op:approach', 'unknown_field:body.volume']);
  assert.ok(r.asked_not_doable.every(i => Number.isInteger(i.seq)));
  assert.equal(r.asked_not_doable.find(i => i.missing === 'op:approach').said, 'touche le cairn');
  assert.deepEqual(r.improvised.map(i => i.kind + ':' + i.seq), ['fact:14', 'thing:18']);
  assert.equal(r.improvised[0].said, 'regarde la marque sur ce pin');
  assert.ok(r.slow_or_doubtful.some(i => i.kind === 'repaired' && i.seq === 18));
  assert.ok(r.slow_or_doubtful.some(i => i.kind === 'rejected' && i.why.includes('not_allowed')));
  assert.equal(r.versions.pdl, 0);
  assert.ok(r.versions.vocab && r.versions.budgets.loops_ms.now === 500);
});

test('legacy French journal: header, turns, the refusal, the recorded fact, turns with no first reaction', () => {
  const { head, items } = parseLegacyJournal(FREE);
  assert.equal(head.device, 'Mali-G77'); assert.equal(head.graine, 217113628); assert.equal(head.with_model, true);
  assert.equal(items.filter(i => i.kind === 'call').length, 6);
  const r = harvestRecord(FREE);
  assert.equal(r.mode, 'free'); assert.equal(r.turns, 6); assert.equal(r.duration_s, 114);
  assert.deepEqual(r.asked_not_doable.map(i => [i.kind, i.seq]), [['refused', 1]]);
  const f = r.improvised.filter(i => i.kind === 'fact');
  assert.equal(f.length, 1); assert.match(f[0].text, /Léo .* Manon/); assert.equal(f[0].said, "Comment s'appellent tes mômes ?");
  const nf = r.slow_or_doubtful.filter(i => i.kind === 'no_first_reaction');
  assert.equal(nf.length, 5, 'the only immediate gesture was on turn 2');
  assert.ok(!nf.some(i => i.said === 'Ok va près du feu avec ta famille'));
  assert.equal(r.summary.full_reaction_ms, 5000);
});

test('strip: no player sentence is left anywhere in the record, the class stays', () => {
  const l = harvestRecord(FREE, { strip: true }), c = harvestRecord(P1, { strip: true });
  const all = JSON.stringify(l) + JSON.stringify(c);
  for (const s of ["T'es qui dans l'histoire ?", 'Comment s', 'touche le cairn', 'regarde la marque sur ce pin']) assert.ok(!all.includes(s), s);
  assert.ok(l.stripped && l.improvised.find(i => i.kind === 'fact').said === '[player: voice]');
  assert.match(c.asked_not_doable.find(i => i.missing === 'op:fly').said, /^\[player: \w+\]$/);
});

test('caps: items per list, the journal kept within its bytes, the browser list oldest dropped', () => {
  const E = [{ seq: 0, t: 0, type: 'session', v: 0, seed: 1, scene: {} }];
  for (let i = 1; i <= 100; i++) E.push({ seq: i, t: 0, type: 'tx', kind: 'act', status: 'rejected', author: { kind: 'model', id: 'stager' }, reasons: [{ path: 'body.op', why: 'unknown_op', value: 'fly' + i }], body: { op: 'fly' + i } });
  const r = harvestRecord(E);
  assert.equal(r.asked_not_doable.length, HARVEST_CAPS.items + 1); assert.equal(r.asked_not_doable.at(-1).kind, 'cut');
  const m = harvestRecord(M2, { journalBytes: 60000 });
  assert.ok(m.journal.text.length <= 60000 && /left out/.test(m.journal.cut));
  assert.equal(harvestRecord(M2, { journalBytes: 1000 }).journal.text, null);
  let L = [];
  for (let i = 0; i < 5; i++) L = keepRecords(L, { id: 'r' + i, journal: { text: 'x'.repeat(400) } }, { max: 3, bytes: 100000 });
  assert.deepEqual(L.map(x => x.id), ['r2', 'r3', 'r4']);
  L = keepRecords(L, { id: 'r3', journal: { text: '' } }, { max: 3 });
  assert.deepEqual(L.map(x => x.id), ['r2', 'r4', 'r3'], 'the same session replaces its record');
  assert.deepEqual(keepRecords(L, { id: 'big', journal: { text: 'y'.repeat(2000) } }, { bytes: 1500 }).map(x => x.id), ['big']);
});

test('merged report: one proposal list per layer, counted across records, with provenance', () => {
  const free = harvestRecord(FREE), m = mergeRecords([free, Object.assign(harvestRecord(FREE), { id: 'free-again' }), harvestRecord(P1, { meta: { id: 'p1' } })]);
  const fact = m.proposals.story.find(p => p.kind === 'fact' && /Léo/.test(p.title));
  assert.equal(fact.seen, 2); assert.deepEqual(fact.sessions, ['free-217113628', 'free-again']);
  assert.match(fact.text, /^\/\/ improvised by .* #8 .*\n\? .*\{imp\.[a-z0-9-]+\}$/);
  assert.ok(m.proposals.engine.some(p => p.key === 'material:marble' && p.owner === "the engine's owner"));
  assert.ok(m.proposals.framework.some(p => p.kind === 'prepared_option' && p.seen === 10));
  assert.ok(m.proposals.character.some(p => p.kind === 'example'));
  assert.equal(m.latency['host/invention/voix'].n, 12);
});
