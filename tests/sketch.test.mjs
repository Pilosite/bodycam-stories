// Conception before play (core/sketch.js, briefs/conception.md): a sketch from a sentence and a built place, with canned
// model answers. Level A (docs/sdlc.md §3): no browser, no model; the camp fire of the field note of 20 November is the case.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { conceive, readQuestions, withAnswers, checkSketch, playable } from '../core/sketch.js';
import { loadLibrary, loadPack, checkPack, play, explain, writePack, sketchCommand, loadSketchBase } from '../tools/story.mjs';

const library = loadLibrary(), base = loadSketchBase();
const place = JSON.parse(readFileSync(new URL('./sketch/campfire-place.json', import.meta.url), 'utf8'));
const GOOD = readFileSync(new URL('./sketch/campfire.txt', import.meta.url), 'utf8');
const SENTENCE = 'Une famille autour d\'un feu de camp, la nuit, sous les pins';
const canned = (...answers) => { const asked = []; return { asked, ask: async prompt => { asked.push(prompt); const a = answers[asked.length - 1]; if (a instanceof Error) throw a; return a; } }; };
const temp = () => mkdtempSync(join(tmpdir(), 'sketch-'));

test('the camp fire: a father carries the camera, the mother is absent, the children are people the engine cannot show', async () => {
  const m = canned(GOOD), r = await conceive({ sentence: SENTENCE, place, library, base, ask: m.ask });
  assert.equal(r.source, 'model'); assert.equal(m.asked.length, 1);
  assert.match(m.asked[0], /feu de camp/); assert.match(m.asked[0], /chaise-2/); assert.match(m.asked[0], /Never "Sam"/);
  const M = r.pack.manifest, doc = f => r.pack.texts[f];
  assert.equal(M.carrier, 'marc'); assert.equal(r.about.pronoun, 'he'); assert.match(r.about.who, /père/);
  assert.match(doc('characters/claire.pdl'), /@presence absent/);
  for (const k of ['leo', 'manon']) assert.match(doc(`characters/${k}.pdl`), /@strength light .*@presence unseen/);
  assert.ok(M.sketch.cannot_show.includes('people'));
  assert.match(doc('rules/engine.pdl'), /cannot show: people/);
  assert.equal(r.questions.length, 2);
  const pk = playable(r.pack, library);
  assert.equal(pk.name, 'Marc'); assert.match(pk.stage.story, /Claire \(claire, absent\)/); assert.match(pk.stage.story, /Léo \(leo, unseen\)/);
  assert.deepEqual(pk.scene.stations[0].within, place.objets.map(o => o.id));
});

test('a good sketch compiles into a playable pack: two layers, provenance, a pattern at work', async () => {
  const r = await conceive({ sentence: SENTENCE, place, library, base, ask: canned(GOOD).ask });
  const dir = temp();
  try {
    writePack(dir, withAnswers(r.pack, {}));
    const pack = loadPack(dir), c = checkPack(pack, library);
    assert.deepEqual(c.errors, []);
    assert.deepEqual(pack.manifest.layers.map(l => l.id), ['base', 'creator']);
    const p = c.compiled.principles.find(x => x.id === 'marc.who');
    assert.deepEqual([p.layer, p.author], ['base', { kind: 'model', id: 'sketcher' }]);
    const g = await play(pack, library, [{ kind: 'look', target: 'glaciere', seconds: 2 }, { kind: 'look', target: 'chaise-2', seconds: 2 }]);
    const fired = g.session.journal.entries.filter(e => e.type === 'rule' && e.status === 'fired').map(e => e.rule);
    assert.ok(fired.includes('claire-absent.truth-lands'), fired.join());
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('a broken sketch is repaired by the second answer, with the errors in the second prompt', async () => {
  const broken = GOOD.replace('bind resting_place = chaise-2', 'bind resting_place = chaise-rouge');
  const m = canned(broken, GOOD), r = await conceive({ sentence: SENTENCE, place, library, base, ask: m.ask });
  assert.equal(r.source, 'repaired'); assert.equal(m.asked.length, 2);
  assert.match(m.asked[1], /unknown thing "chaise-rouge"/);
  assert.deepEqual(checkSketch(r.pack, library).errors, []);
});

test('a hopeless answer falls back to a sketch built by code from the place, and play starts', async () => {
  for (const ask of [canned('I cannot do that.', 'Still no.').ask, canned(new Error('rate_limited')).ask, null]) {
    const r = await conceive({ sentence: 'A family around a camp fire at night', place, library, base, ask });
    assert.equal(r.source, 'fallback');
    assert.deepEqual(checkSketch(r.pack, library).errors, []);
    const pk = playable(r.pack, library);
    assert.notEqual(pk.carrier, 'sam'); assert.equal(pk.name, 'The one filming');
    assert.equal(pk.principles.filter(p => p.strength === 'open' && p.doc === 'sketch-facts').length, 2);
    assert.equal(pk.scene.things.length, place.objets.length);
  }
});

test('the creator\'s answers override the model\'s guesses in their own layer; "surprise me" lets the guess stand', async () => {
  const r = await conceive({ sentence: SENTENCE, place, library, base, ask: canned(GOOD).ask });
  const dir = temp();
  try {
    writePack(dir, withAnswers(r.pack, { 'q.claire-where': 'Elle est restée à la voiture', 'q.voice': 'surprise' }));
    const pack = loadPack(dir), x = explain(pack, library, 'f.claire-where'), y = explain(pack, library, 'f.voice');
    assert.equal(x.text, 'Où est Claire, la mère ? Elle est restée à la voiture');
    assert.deepEqual([x.layer, x.author, x.author_kind], ['creator', 'creator', 'creator']);
    assert.deepEqual([x.overrides[0].layer, x.overrides[0].author.kind], ['base', 'model']);
    assert.deepEqual([y.layer, y.author_kind, y.overrides], ['base', 'model', undefined]);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('questions are read while the answer is still being written', () => {
  const cut = GOOD.indexOf('q f.voice') + 12;
  assert.deepEqual(readQuestions(GOOD.slice(0, cut)).map(q => q.target), ['f.claire-where']);
  const q = readQuestions(GOOD.slice(0, GOOD.indexOf('=== about') + 9));
  assert.deepEqual(q.map(x => x.id), ['q.claire-where', 'q.voice']);
  assert.equal(q[0].options.length, 3);
});

test('story sketch with no model writes the code fallback as a pack that checks', async () => {
  const r = await sketchCommand({ sentence: 'A family around a camp fire at night', place, library, answer: null });
  const dir = temp();
  try { writePack(dir, r.pack); assert.equal(r.source, 'fallback'); assert.deepEqual(checkPack(loadPack(dir), library).errors, []); }
  finally { rmSync(dir, { recursive: true, force: true }); }
});
