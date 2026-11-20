// Story pack structure (tools/pack-check.mjs): one structural test file, as docs/sdlc.md §3 asks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { checkPack, loadPack, loadLibrary, parsePdl, mergeLayers } from '../tools/pack-check.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const pack = () => loadPack(root + 'stories/louis-round');
const library = loadLibrary(root + 'patterns');
const clone = p => ({ ...p, texts: { ...p.texts }, manifest: structuredClone(p.manifest), lines: structuredClone(p.lines), beats: structuredClone(p.beats) });

test("Louis's Round checks clean: references resolve, both languages, three bound patterns", () => {
  const r = checkPack(pack(), library);
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.warnings, []);
  assert.equal(r.stats.patterns.length, 3);
  assert.ok(r.stats.rules.creator >= 6 && r.stats.rules.creator <= 10);
  assert.equal(r.stats.lines.fr, r.stats.lines.en);
});

test('layers merge in order, deterministically, with provenance and overrides', () => {
  const p = pack();
  const docs = Object.fromEntries(Object.entries(p.texts).map(([f, t]) => [f, parsePdl(t, f)]));
  const a = mergeLayers(p.manifest, docs), b = mergeLayers(p.manifest, docs);
  assert.deepEqual(a, b);
  const sett = a.statements.find(s => s.id === 'f.sett');
  assert.equal(sett.provenance.layer, 'ranger-notes');
  assert.equal(sett.provenance.author, 'contributor-a');
  assert.equal(sett.overrides[0].layer, 'base');
  const rule = checkPack(p, library).compiled.rules.find(r => r.id === 'rn.rule.last-line');
  assert.equal(rule.provenance.layer, 'ranger-notes');
});

test('broken references are caught: unknown fact, missing translation, unbound role', () => {
  const p = clone(pack());
  p.texts['rules/voice.pdl'] += '\nwhen voice.silent(30) -> reveal(f.nowhere) {r.bad}\n';
  delete p.lines.en.lines['sett.see'];
  p.texts['patterns/marks.pdl'] = p.texts['patterns/marks.pdl'].replace(/^bind reader = sam$/m, '');
  const e = checkPack(p, library).errors.join('\n');
  assert.match(e, /unknown fact "f\.nowhere"/);
  assert.match(e, /key sett\.see missing in en/);
  assert.match(e, /role reader of trail-of-signs is not bound/);
});

test('swapping ticking-clock for slow-light removes the battery rules and orphans the battery ending', () => {
  const p = clone(pack());
  p.texts['patterns/battery.pdl'] = '# battery-clock — pattern instance\n@id battery-clock  @kind pattern-instance  @pattern slow-light  @layer base  @author toine\n## bind\nbind keeper = sam\nbind wrap_line = light.rise\n';
  const r = checkPack(p, library);
  assert.deepEqual(r.errors, []);
  assert.ok(!r.compiled.rules.some(x => /clock\.below/.test(x.source)));
  assert.ok(r.compiled.rules.some(x => x.id === 'battery-clock.rise'));
  assert.match(r.warnings.join('\n'), /ending battery-dies is triggered by a rule, and no rule triggers it/);
});
