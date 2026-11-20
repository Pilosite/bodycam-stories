// M2: the engine adapter's pure part against the executor contract (level B, docs/sdlc.md §3), and the model port served by
// code (level A): the real pack, no model, a few sentences through the now loop (core/clocks.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { executorContract } from './core-executor.contract.mjs';
import { createEngineExecutor, lineText } from '../src/adaptateur-core.js';
import { createReflexModel } from '../src/reflex-model.js';
import { createSession } from '../core/session.js';
import { createClocks } from '../core/clocks.js';
import { serializeTokens } from '../core/pdl.js';
import { compilePack } from '../core/source.js';
import { missing } from '../core/ports.js';
import { loadPack, loadLibrary } from '../tools/pack-check.mjs';

const ROOT = new URL('../', import.meta.url).pathname;

test('executor contract: engine adapter (pure part)', () => {
  const cmds = [];
  executorContract(() => createEngineExecutor({ apply: c => cmds.push(c) }));
  const kinds = new Set(cmds.map(c => c.do));
  for (const k of ['go', 'look', 'say', 'sound', 'camera', 'end']) assert.ok(kinds.has(k), 'the page receives ' + k);
  const ex = createEngineExecutor();
  ex.shape({ thing: 'x' }, { seq: 4 }); ex.shape({ thing: 'y' }, { seq: 5 });
  assert.deepEqual(ex.gaps, [{ call: 'shape', why: 'shaping steps are not in PDL v0', seq: 4 }], 'a gap is reported once, never faked');
  assert.equal(lineText({ en: 'One. Two. Three. Four.' }, 'en', 0.5), 'One. Two.');
});

test('model port served by code: lexical match, asking back, a commitment end to end', async () => {
  const pack = loadPack(ROOT + 'stories/louis-round'), c = compilePack(pack, loadLibrary(ROOT + 'patterns'));
  const s = createSession({ scene: c.scene, seed: 3, executor: createEngineExecutor() });
  s.loadPrinciples(c.principles); s.start();
  const m = createReflexModel({ verbs: JSON.parse(readFileSync(ROOT + 'src/reflexes.json', 'utf8')), anchors: JSON.parse(readFileSync(ROOT + 'stories/louis-round/anchors.json', 'utf8')),
    stations: pack.stations.stations, world: () => s.world, serialize: serializeTokens });
  assert.deepEqual(missing('model', m), ['generate'], 'no scene tier: nothing staged');
  const k = createClocks({ session: s, model: m, character: 'sam' });
  const hear = async text => { const n = s.journal.entries.length; await k.hear({ text, lang: 'en' }); return s.journal.entries.slice(n); };
  let E = await hear('blorp wibble');
  assert.deepEqual(E.filter(e => e.type === 'tx' && e.kind === 'act').map(e => e.body.ref), ['ask.back'], 'low confidence: she asks back');
  assert.equal(E.find(e => e.type === 'model_call').tier, 'reflex');
  await hear('go on, please'); E = await hear('look at the orange mark');
  assert.ok(E.some(e => e.type === 'rule' && e.rule === 'louis-marks.sign-read.1' && e.status === 'fired'), 'looking fires the pack rule');
  await hear('keep going please');
  E = await hear('si le geai crie, arrête-toi et couche-toi');
  assert.equal(s.world.commitments['c.jay'].status, 'amended', 'she amends lying in the mud');
  assert.ok(E.every(e => e.type !== 'tx' || e.status !== 'rejected'));
  await hear('continue please'); await hear('take the tape please');
  assert.equal(s.world.body.station, 'approach');
  assert.equal(s.world.commitments['c.jay'].status, 'kept', 'the jay calls at the approach and she keeps her word');
  assert.ok(s.world.place.sun_height > 8, 'the light rose with the stations');
});
