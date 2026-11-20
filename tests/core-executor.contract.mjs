// The executor contract (docs/pdl-spec.md §9.1, docs/sdlc.md §3 level B): one suite, run on the paper world now
// (tests/core-executor.test.mjs) and on the engine adapter at milestones. `make()` returns a fresh executor.
import assert from 'node:assert/strict';
import { EXECUTOR_METHODS, createWorld, snapshot, rngFor } from '../core/world.js';
import { EVENTS } from '../core/vocab.js';
import { createSession } from '../core/session.js';
import { LOUIS, SCENARIOS } from './core-fixture.mjs';

const OBSERVATIONS = ['body.pose', 'body.held'];
const ARGS = {
  go: { to: 'station:path', from: 'trailhead', station: 'path' }, look: { target: 'thing:pine-mark' }, turn: { degrees: 30 }, posture: { height: 0.5 },
  touch: { target: 'thing:pine-mark', thing: 'pine-mark' }, take: { target: 'thing:pine-mark', thing: 'pine-mark' }, shape: { target: 'thing:pine-mark', thing: 'pine-mark' },
  wait: { seconds: 1 }, stop: {}, say: { line: { fr: 'Bon.', en: 'Right.' }, lang: 'fr', tone: 'dry' },
  placeThing: { id: 'x', name: 'x', shapes: [{ shape: 'ball', p: [0, 0.1, 0], size: [0.2, 0.2, 0.2], color: '#777777' }], mass_kg: 1, pos: [0, 2], size_m: 0.2 },
  changeThing: { id: 'x', scale: 2 }, removeThing: { id: 'x', reason: 'removed' }, playSound: { cue: 'jay_alarm', recipe: 'jay_alarm', pos: [0, 0], gain: 0.5 },
  setPlace: { fog: 0.02, lamp: false, sun_height: 4, weather: 'clear' }, setCamera: { battery: 0.5, degrade: 0, shake: 0 }, startScene: { id: 'path' },
};

export function executorContract(make) {
  const w = createWorld(LOUIS, { seed: 3 });
  const ex = make();
  for (const m of EXECUTOR_METHODS) assert.equal(typeof ex[m], 'function', 'implements ' + m);
  const before = snapshot(w);
  for (const m of EXECUTOR_METHODS) {
    const r = ex[m](JSON.parse(JSON.stringify(ARGS[m])), { world: w, seq: 1, seed: 3, rng: rngFor(3, 1) });
    assert.ok(r === undefined || Array.isArray(r), m + ' returns events or nothing');
    for (const e of r || []) {
      assert.ok(e && typeof e.event === 'string' && (EVENTS[e.event] || OBSERVATIONS.includes(e.event)), m + ' reports a known event: ' + (e && e.event));
      assert.ok(!e.data || typeof e.data === 'object', m + ': data is an object');
    }
    if (m === 'go') assert.ok((r || []).some(e => e.event === 'station.entered' && e.data.id === 'path'), 'go reports the station entered');
  }
  assert.equal(snapshot(w), before, 'calls never change the core world');
  // a whole session through this executor: the commitment of p9 is kept
  const s = createSession({ scene: LOUIS, seed: 7, executor: make() });
  SCENARIOS['p9-commitment'](s);
  assert.equal(s.world.commitments['c.jay'].status, 'kept');
  assert.equal(s.world.body.station, 'platiere');
}
