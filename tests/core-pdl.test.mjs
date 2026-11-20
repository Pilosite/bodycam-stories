// Level A: unit tests of core/ where there are branches or invariants not covered by the golden replays (docs/sdlc.md §3).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { validate, canonical, parseTokens, serializeTokens } from '../core/pdl.js';
import { createWorld } from '../core/world.js';
import { parseSource, serializeSource, compilePack } from '../core/source.js';
import { createClocks } from '../core/clocks.js';
import { createCannedModel } from '../core/canned-model.js';
import { missing } from '../core/ports.js';
import { createPaperWorld } from '../core/paper-world.js';
import { fromJSONL } from '../core/journal.js';
import { LOUIS, STAGE, newSession, louisPack } from './core-fixture.mjs';

const ROOT = new URL('../', import.meta.url);
const SPEC = readFileSync(new URL('docs/pdl-spec.md', ROOT), 'utf8');

test('the ten examples of the spec: tokens ⇄ JSON exactly, and the statuses they claim, in one session', () => {
  const blocks = [...SPEC.matchAll(/```pdl-tx\n([\s\S]*?)```\n```json\n([\s\S]*?)```/g)];
  assert.equal(blocks.length, 10);
  const s = newSession();
  s.submit({ author: STAGE, horizon: 'now', kind: 'act', body: { op: 'go', to: 'station:path' } });
  for (const [, tok, json] of blocks) {
    const txs = parseTokens(tok), expect = /\/\/ expect (.*)/.exec(tok)[1].split(' ');
    assert.deepEqual(txs, JSON.parse(json).map(canonical));
    assert.equal(serializeTokens(txs), tok.split('\n').filter(l => l.trim() && !l.startsWith('//')).join('\n'));
    assert.deepEqual(txs.map(t => s.submit(t).status), expect, tok);
  }
});

test('token round trip of every transaction of the golden journals', () => {
  for (const f of readdirSync(new URL('tests/golden/', ROOT))) {
    for (const e of fromJSONL(readFileSync(new URL('tests/golden/' + f, ROOT), 'utf8')).filter(e => e.type === 'tx' && e.status !== 'rejected')) {
      const tx = canonical({ author: e.author, horizon: e.horizon, kind: e.kind, body: e.body, cause: e.cause, ttl: e.ttl });
      assert.deepEqual(parseTokens(serializeTokens(tx)), [tx], f + ' #' + e.seq);
    }
  }
});

test('closed vocabulary: unknown envelope fields, conditions, events, match fields, languages and versions are rejected', () => {
  const w = createWorld(LOUIS);
  const why = tx => validate(tx, w).reasons.map(r => r.why);
  const rule = (extra) => ({ author: STAGE, horizon: 'scene', kind: 'rule', body: Object.assign({ id: 'r', when: { event: 'sound.played' }, then: [{ horizon: 'now', kind: 'act', body: { op: 'stop' } }] }, extra) });
  assert.deepEqual(why(Object.assign(rule(), { colour: 'red' })), ['unknown_field']);
  assert.deepEqual(why(Object.assign(rule(), { v: 1 })), ['unknown_version']);
  assert.deepEqual(why({ author: STAGE, horizon: 'now', kind: 'wish', body: {} }), ['unknown_kind']);
  assert.deepEqual(why(rule({ when: { event: 'sound.heard' } })), ['unknown_event']);
  assert.deepEqual(why(rule({ when: { event: 'sound.played', match: { pitch: 3 } } })), ['unknown_field']);
  assert.deepEqual(why(rule({ if: [{ mood: { of: 'sam' } }] })), ['unknown_condition']);
  assert.deepEqual(why(rule({ then: [{ horizon: 'now', kind: 'rule', body: {} }] })), ['not_allowed_in_rule']);
  assert.deepEqual(why({ author: STAGE, horizon: 'now', kind: 'act', body: { op: 'say', line: { de: 'Hallo' } } }), ['unknown_language']);
  assert.deepEqual(why({ author: STAGE, horizon: 'now', kind: 'effect', body: { op: 'sound.play', cue: 'gunshot' } }), ['unknown_cue']);
});

test('repairs not in the goldens: reach, budget eviction, ttl, coercion, unreachable station', () => {
  const s = newSession();
  const place = (id, offset, horizon = 'scene') => s.submit({ author: STAGE, horizon, kind: 'effect', body: { op: 'thing.place', id, name: id, offset, shapes: [{ shape: 'ball', p: [0, 0.1, 0], size: [0.2, 0.2, 0.2] }] } });
  assert.equal(place('far', [0, 9]).repair[0].action, 'clamp');                                   // beyond the station's reach
  for (let i = 0; i < 7; i++) place('s' + i, [0, 1]);
  const r = place('one-more', [0, 1]);                                                              // 9th thing: the oldest scene thing makes room
  assert.deepEqual(r.repair.find(x => x.action === 'evict').to, ['far']);
  assert.ok(!s.world.things.far && s.world.things['one-more']);
  const t = s.submit({ author: STAGE, horizon: 'now', kind: 'effect', ttl: 600, body: { op: 'sound.play', cue: 'jay_alarm' } });
  assert.deepEqual([t.repair[0].action, t.tx.ttl], ['clamp', 60]);
  assert.equal(s.submit({ author: STAGE, horizon: 'now', kind: 'act', body: { op: 'turn', degrees: '30' } }).repair[0].action, 'coerce');
  const w = createWorld(Object.assign({}, LOUIS, { stations: LOUIS.stations.map(x => x.id === 'hide' ? Object.assign({}, x, { next: [] }) : Object.assign({}, x, { next: x.next.filter(n => n !== 'hide') })) }));
  assert.equal(validate({ author: STAGE, horizon: 'now', kind: 'act', body: { op: 'go', to: 'station:hide' } }, w).reasons[0].why, 'unreachable_station');
});

test('PDL source: every file of the pack and the pattern library parses and round-trips; strengths; provenance', () => {
  const texts = {};
  for (const d of ['stories/louis-round/characters/', 'stories/louis-round/rules/', 'stories/louis-round/facts/', 'stories/louis-round/patterns/', 'patterns/'])
    for (const f of readdirSync(new URL(d, ROOT)).filter(f => f.endsWith('.pdl'))) texts[d + f] = readFileSync(new URL(d + f, ROOT), 'utf8');
  for (const [file, t] of Object.entries(texts)) {
    const a = parseSource(t, { file });
    assert.deepEqual(a.errors, [], file);
    const b = parseSource(serializeSource(a), { file }), strip = d => d.statements.map(x => Object.assign({}, x, { source: undefined }));
    assert.deepEqual([b.id, b.meta, strip(b)], [a.id, a.meta, strip(a)], file);
  }
  const c = louisPack(), P = Object.fromEntries(c.principles.map(p => [p.id, p]));
  assert.deepEqual(c.errors, []);
  assert.deepEqual([P['sam.voice.dry'].strength, P['sam.voice.dry'].weight, P['sam.voice.dry'].scope], ['tendency', 0.9, 'character:sam']);
  assert.deepEqual([P['sam.dnk.voice'].strength, P['sam.dnk.voice'].note.slice(0, 16)], ['open', 'let her guesses ']);
  assert.deepEqual([P['sam.no-shout'].strength, P['sam.no-shout'].compiled.status], ['hard', 'to_compile']);
  assert.deepEqual([P['sam.never.alive'].strength, P['sam.never.alive'].compiled.status], ['absolute', 'to_compile']);
  assert.deepEqual(P['r.jay-first'].compiled.body.then.map(t => t.body.op || t.body.predicate), ['sound.play', 'established', 'say']);
  const ex = c.principles.find(p => p.strength === 'counter' && p.doc === 'sam');
  assert.ok(ex.lines.fr && ex.lines.en && ex.why);
  assert.deepEqual([P['f.sett'].layer, P['f.sett'].author.id, P['f.sett'].overrides[0].author.id], ['ranger-notes', 'contributor-a', 'toine']);
  const bad = compilePack(Object.assign({}, { manifest: { id: 'x', layers: [{ id: 'base', files: ['a.pdl'] }] }, texts: { 'a.pdl': '# a\n## r\nwhen moon.rises -> say(x) {r.x}\n' } }));
  assert.equal(bad.errors[0].why, 'compile_error');
});

test('three clocks: the now reaction completes while the scene answer is pending, then the scene answer amends it', async () => {
  let ms = 0;
  const s = newSession();
  s.submit({ author: STAGE, horizon: 'now', kind: 'act', body: { op: 'go', to: 'station:path' } });
  const model = createCannedModel({
    intent: () => { ms += 180; return { answer: { verb: 'look', target: 'thing:pine-mark' } }; },
    reaction: () => { ms += 60; return { answer: 'm:translator/translate now act.look tg=thing:pine-mark\nm:translator/translate now act.say ref=mark_line' }; },
    react: ({ context }) => { ms += 2400; return { tokens: `m:stager/stage now act.say ^${context.call}=${context.now[1]} line.fr="Du bleu. Sa couleur à lui, pour les malades." line.en="Blue. His colour for the sick ones." tone=dry\nm:stager/stage story fact ^${context.call} subj=louis pred=marked_sick_trees val=blue` }; },
  }, { hold: ['react'] });
  assert.deepEqual(missing('model', model), []);
  assert.deepEqual(missing('engine', createPaperWorld()), []);
  const clocks = createClocks({ session: s, model, character: 'sam', clock: () => ms });
  const r = await clocks.hear({ text: 'regarde la marque', lang: 'fr' });
  const E = s.journal.entries;
  assert.deepEqual(r.now.map(x => x.status), ['accepted', 'accepted']);
  assert.ok(E.some(e => e.type === 'model_call' && e.loop === 'scene' && e.status === 'pending'));
  assert.ok(!E.some(e => e.type === 'tx' && e.seq > r.intent.seq && e.loop === 'scene'), 'nothing from the scene loop yet');
  assert.ok(E.filter(e => e.type === 'tx' && e.loop === 'now').every(e => e.latency_ms <= e.budget_ms));
  model.release('react');
  const later = await r.scene;
  const amend = E[later[0].seq];
  assert.deepEqual([amend.loop, amend.cause.amends, amend.late], ['scene', r.now[1].seq, false]);
  assert.equal(s.world.said.find(x => x.tx === r.now[1].seq).amended_by, later[0].seq);
  assert.equal(E.find(e => e.type === 'model_call' && e.status === 'landed').ref_seq, E.find(e => e.status === 'pending').seq);
});
