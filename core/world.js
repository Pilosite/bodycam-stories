/* The abstract world the core reasons about (docs/pdl-spec.md §5): stations, body, things, place, camera, clock,
   facts, rules, constraints, principles, commitments. Pure data plus pure queries and the mutations the session applies.
   The engine never writes here: it receives executor calls (EXECUTOR below) and reports events. */
import { refClass, refId } from './vocab.js';

/* ---------------------------------------------------------------- the executor interface (§9.1)
   An engine implements these. Each call gets (args, ctx) with ctx = { world (read-only), seq, seed, rng } and returns an
   array of events [{ event, data }] (or nothing). Calls must not change `world`: the session does, from the events. */
export const EXECUTOR = {
  // body acts, in place (v1 is station-based)
  go: 'transition to an adjacent station: { to, from, station } → station.left, station.entered',
  look: 'free look: { target?, pitch?, yaw?, resolved: {x,z}? }',
  turn: 'turn in place: { degrees }',
  posture: 'eye height as a share of standing: { height }',
  touch: 'reach and touch a thing within reach: { target, thing }',
  take: 'pick up a thing within reach: { target, thing }',
  shape: 'shape a thing with the hands: { target, thing }',
  wait: 'stay still: { seconds }',
  stop: 'stop what she is doing',
  say: 'speak a line (subtitle + voice): { line: {lang: text}, lang, tone, ref? }',
  // world effects
  placeThing: 'create a thing: { id, name, shapes, mass_kg, pos: [x,z], size_m }',
  changeThing: '{ id, scale?, offset?, glow?, wobble? }',
  removeThing: '{ id, reason }',
  playSound: '{ cue, recipe, pos: [x,z], gain, seed, key }',
  setPlace: 'effective place values after the change: { fog, lamp, sun_height, weather }',
  setCamera: 'effective camera values: { battery, degrade, shake }',
  startScene: '{ id }',
};
export const EXECUTOR_METHODS = Object.keys(EXECUTOR);

const clone = o => JSON.parse(JSON.stringify(o));
const r4 = x => Math.round(x * 1e4) / 1e4;

/* A world from a scene description (the place part of a story pack). */
export function createWorld(scene, { seed = 1 } = {}) {
  const sc = clone(scene || {});
  const stations = {};
  for (const s of sc.stations || []) stations[s.id] = { id: s.id, pos: s.pos || [0, 0], heading: s.heading || 0, reach_m: s.reach_m ?? 2.5, next: s.next || [] };
  const first = sc.start || (sc.stations && sc.stations[0] && sc.stations[0].id) || null;
  const things = {};
  for (const t of sc.things || []) things[t.id] = { id: t.id, name: t.name || t.id, shapes: t.shapes || [], mass_kg: t.mass_kg ?? null, pos: t.pos || [0, 0], size_m: t.size_m ?? 1, fixed: true, horizon: 'story', expires: null, scene: null, tx: 0, author: { kind: 'creator', id: sc.author || 'pack' } };
  const place = Object.assign({ fog: 0.011, lamp: false, sun_height: 4, weather: 'clear' }, sc.place || {});
  const cam = Object.assign({ battery: 1, drain_per_s: 0, degrade: 0, shake: 0 }, sc.camera || {});
  return {
    v: 0, seed, langs: sc.langs || ['en'],
    vocab: { materials: (sc.vocab && sc.vocab.materials) || [], cues: (sc.vocab && sc.vocab.cues) || {}, lines: (sc.vocab && sc.vocab.lines) || {} },
    clock: { t: 0, scene: sc.scene || 'start', scene_t0: 0 },
    stations, body: { station: first, yaw: first ? stations[first].heading : 0, pitch: 0, height: 1, held: [] },
    base: { place, camera: { degrade: cam.degrade, shake: cam.shake } },
    place: clone(place), camera: { battery: cam.battery, drain_per_s: cam.drain_per_s, degrade: cam.degrade, shake: cam.shake },
    overlays: [], things, facts: [], rules: {}, constraints: {}, principles: {}, commitments: {}, gauges: {},
    forbidden: sc.forbidden || [], intents: {}, said: [], sounds: [],
  };
}

/* ---------------------------------------------------------------- queries */
export const live = (x, t) => x && (x.expires === null || x.expires === undefined || x.expires > t);
export function liveThings(w) { return Object.values(w.things).filter(x => live(x, w.clock.t)); }
export function station(w, id = w.body.station) { return id ? w.stations[id] || null : null; }
/* Position of a ref: body = its station; thing; station. null if unknown. */
export function posOf(w, ref) {
  const c = refClass(ref), id = refId(ref);
  if (c === 'body') { const s = station(w); return s ? s.pos : [0, 0]; }
  if (c === 'station') return w.stations[id] ? w.stations[id].pos : null;
  if (c === 'thing') { const t = w.things[id]; return t && live(t, w.clock.t) ? t.pos : null; }
  return null;
}
export const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
export function inReach(w, thingId) {
  const t = w.things[thingId], s = station(w);
  if (!t || !s || !live(t, w.clock.t)) return false;
  if (w.body.held.includes(thingId)) return true;
  return dist(t.pos, s.pos) <= s.reach_m + (t.size_m || 0) / 2;
}
/* First step from the current station toward `to` along adjacency (breadth-first, ties by declaration order). */
export function stepToward(w, to) {
  const from = w.body.station; if (!from || !w.stations[to]) return null;
  const prev = { [from]: null }, q = [from];
  while (q.length) {
    const s = q.shift(); if (s === to) break;
    for (const n of w.stations[s].next) if (!(n in prev) && w.stations[n]) { prev[n] = s; q.push(n); }
  }
  if (!(to in prev)) return null;
  let s = to; while (prev[s] && prev[s] !== from) s = prev[s];
  return s === from ? null : s;
}
export const adjacent = (w, a, b) => !!(w.stations[a] && w.stations[a].next.includes(b)) || !!(w.stations[b] && w.stations[b].next.includes(a));

/* A fact query: the current value of (subject, predicate), newest live first. */
export function factOf(w, subject, predicate) {
  for (let i = w.facts.length - 1; i >= 0; i--) { const f = w.facts[i]; if (f.subject === subject && f.predicate === predicate && live(f, w.clock.t)) return f; }
  return null;
}
export function readPath(w, path) {
  const [a, b] = path.split('.');
  if (a === 'clock') return b === 'scene_t' ? r4(w.clock.t - w.clock.scene_t0) : w.clock[b];
  if (a === 'camera' || a === 'place' || a === 'body') return w[a][b];
  return undefined;
}

/* Conditions (§7.3): pure over the world. */
export function evalCond(w, c) {
  if (!c || typeof c !== 'object') return false;
  if (c.not) return !evalCond(w, c.not);
  if (c.near) { const a = posOf(w, c.near.a), b = posOf(w, c.near.b); return !!(a && b) && dist(a, b) <= c.near.within_m; }
  if (c.fact) { const f = factOf(w, c.fact.subject, c.fact.predicate); return !!f && (c.fact.value === undefined || f.value === c.fact.value) && (c.fact.min_certainty === undefined || f.certainty >= c.fact.min_certainty); }
  if (c.scene) return w.clock.scene === c.scene.id;
  if (c.station) return w.body.station === c.station.id;
  if (c.gauge) { const g = w.gauges[c.gauge.id]; if (!g) return false; return (c.gauge.word === undefined || gaugeWord(g) === c.gauge.word) && (c.gauge.gt === undefined || g.value > c.gauge.gt) && (c.gauge.lt === undefined || g.value < c.gauge.lt); }
  if (c.state) return compare(readPath(w, c.state.path), c.state);
  return false;
}
/* A value against a comparator object { eq, ne, lt, le, gt, ge, in, contains } (all given must hold). */
export function compare(v, m) {
  if (m === null || typeof m !== 'object' || Array.isArray(m)) return v === m;
  for (const [op, x] of Object.entries(m)) {
    if (op === 'path') continue;
    const ok = op === 'eq' ? v === x : op === 'ne' ? v !== x : op === 'lt' ? v < x : op === 'le' ? v <= x : op === 'gt' ? v > x : op === 'ge' ? v >= x
      : op === 'in' ? Array.isArray(x) && x.includes(v) : op === 'contains' ? typeof v === 'string' && v.toLowerCase().includes(String(x).toLowerCase()) : false;
    if (!ok) return false;
  }
  return true;
}

/* A gauge's word (§6.5): low below words.medium, high from words.high. */
export const gaugeWord = g => g.value >= g.words.high ? 'high' : g.value >= g.words.medium ? 'medium' : 'low';

/* ---------------------------------------------------------------- mutations (called by the session only) */
/* Expiry of a horizon-bound item created at time t. */
export function expiryOf(w, horizon, ttl) {
  if (horizon === 'story') return null;
  if (ttl !== undefined && ttl !== null) return r4(w.clock.t + ttl);
  return null;                                    // scene items without ttl end with the scene (scene field)
}
export function recompute(w) {
  const t = w.clock.t;
  w.overlays = w.overlays.filter(o => live(o, t) && (o.horizon !== 'scene' || o.scene === w.clock.scene));
  const place = clone(w.base.place), cam = clone(w.base.camera);
  for (const o of w.overlays) (o.group === 'place' ? place : cam)[o.key] = o.value;
  w.place = place; w.camera.degrade = cam.degrade; w.camera.shake = cam.shake;
}
/* Removes what has expired (time) or belongs to another scene. Returns events. */
export function expire(w) {
  const t = w.clock.t, sc = w.clock.scene, ev = [];
  const dead = x => !live(x, t) || (x.horizon === 'scene' && x.scene !== sc);
  for (const th of Object.values(w.things).sort((a, b) => a.tx - b.tx)) if (!th.fixed && dead(th)) { delete w.things[th.id]; w.body.held = w.body.held.filter(h => h !== th.id); ev.push({ event: 'thing.removed', data: { id: th.id, reason: 'expired' } }); }
  const nf = w.facts.length; w.facts = w.facts.filter(f => !dead(f));
  if (w.facts.length !== nf) ev.push({ event: 'fact.expired', data: { n: nf - w.facts.length } });
  for (const r of Object.values(w.rules).sort((a, b) => a.tx - b.tx)) if (dead(r)) { delete w.rules[r.id]; ev.push({ event: 'rule.expired', data: { id: r.id } }); }
  const before = JSON.stringify([w.place, w.camera.degrade, w.camera.shake]);
  recompute(w);
  if (JSON.stringify([w.place, w.camera.degrade, w.camera.shake]) !== before) ev.push({ event: 'place.changed', data: clone(w.place) });
  return ev;
}

/* Applies an effect body to the core state; returns { events, call } (call: the executor method and its args). */
export function applyEffect(w, body, meta) {
  const t = w.clock.t, exp = expiryOf(w, meta.horizon, meta.ttl);
  const own = { horizon: meta.horizon, expires: exp, scene: meta.horizon === 'scene' || meta.horizon === 'now' ? w.clock.scene : null, tx: meta.seq, author: meta.author };
  switch (body.op) {
    case 'thing.place': {
      for (const id of meta.evict || []) if (w.things[id]) { delete w.things[id]; }
      const base = posOf(w, body.at) || posOf(w, 'body');
      const s = station(w), hd = (s ? s.heading : 0) * Math.PI / 180;
      const [dx, dz] = body.offset;   // dx: to the right of the station heading, dz: ahead
      const pos = [r4(base[0] + dz * Math.sin(hd) + dx * Math.cos(hd)), r4(base[1] + dz * Math.cos(hd) - dx * Math.sin(hd))];
      const th = Object.assign({ id: body.id, name: body.name, shapes: body.shapes, mass_kg: body.mass_kg ?? null, pos, size_m: spanOf(body.shapes), fixed: false }, own);
      w.things[body.id] = th;
      return { events: [...(meta.evict || []).map(id => ({ event: 'thing.removed', data: { id, reason: 'evicted' } })), { event: 'thing.placed', data: { id: body.id, name: body.name } }],
        call: ['placeThing', { id: th.id, name: th.name, shapes: th.shapes, mass_kg: th.mass_kg, pos, size_m: th.size_m }] };
    }
    case 'thing.change': {
      const id = refId(body.target), th = w.things[id];
      if (body.scale !== undefined) { th.scale = body.scale; th.size_m = r4(spanOf(th.shapes) * body.scale); }
      if (body.offset) th.pos = [r4(th.pos[0] + body.offset[0]), r4(th.pos[1] + body.offset[1])];
      if (body.glow !== undefined) th.glow = body.glow;
      if (body.wobble !== undefined) th.wobble = body.wobble;
      const p = { id }; for (const k of ['scale', 'offset', 'glow', 'wobble']) if (body[k] !== undefined) p[k] = body[k];
      return { events: [{ event: 'thing.changed', data: { id } }], call: ['changeThing', p] };
    }
    case 'thing.remove': {
      const id = refId(body.target); delete w.things[id]; w.body.held = w.body.held.filter(h => h !== id);
      return { events: [{ event: 'thing.removed', data: { id, reason: 'removed' } }], call: ['removeThing', { id, reason: 'removed' }] };
    }
    case 'sound.play': {
      const pos = posOf(w, body.at) || posOf(w, 'body');
      w.sounds.push({ t, cue: body.cue, at: body.at, tx: meta.seq });
      const cue = w.vocab.cues[body.cue] || {};
      return { events: [{ event: 'sound.played', data: { cue: body.cue, at: body.at } }], call: ['playSound', { cue: body.cue, recipe: cue.recipe || body.cue, pos, gain: body.gain }] };
    }
    case 'place.set': case 'camera.set': {
      const group = body.op === 'place.set' ? 'place' : 'camera', data = {};
      for (const [k, v] of Object.entries(body)) {
        if (k === 'op') continue;
        if (k === 'battery') { w.camera.battery = v; continue; }                     // physical: never an overlay
        if (meta.horizon === 'story') w.base[group][k] = v;
        else w.overlays.push(Object.assign({ group, key: k, value: v }, own));
      }
      recompute(w);
      const eff = group === 'place' ? clone(w.place) : { battery: w.camera.battery, degrade: w.camera.degrade, shake: w.camera.shake };
      Object.assign(data, eff);
      return { events: [{ event: group + '.changed', data }], call: [group === 'place' ? 'setPlace' : 'setCamera', eff] };
    }
    case 'scene.start': {
      const old = w.clock.scene; w.clock.scene = body.id; w.clock.scene_t0 = t;
      const ev = expire(w);
      return { events: [...ev, { event: 'scene.started', data: { id: body.id, from: old } }], call: ['startScene', { id: body.id }] };
    }
  }
  return { events: [], call: null };
}

/* The span of a set of shapes (largest extent of their bounding box), the "envergure" of the engine. */
export function spanOf(shapes) {
  if (!shapes || !shapes.length) return 0;
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const s of shapes) for (let i = 0; i < 3; i++) { lo[i] = Math.min(lo[i], s.p[i] - s.size[i] / 2); hi[i] = Math.max(hi[i], s.p[i] + s.size[i] / 2); }
  return r4(Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]));
}

/* Applies the events an executor reported about the body (the engine owns the body; the core mirrors it). */
export function observe(w, e) {
  const d = e.data || {};
  if (e.event === 'station.entered' && w.stations[d.id]) { w.body.station = d.id; w.body.yaw = w.stations[d.id].heading; }
  if (e.event === 'body.pose') { for (const k of ['yaw', 'pitch', 'height']) if (typeof d[k] === 'number') w.body[k] = r4(d[k]); }
  if (e.event === 'body.held' && typeof d.id === 'string' && w.things[d.id] && !w.body.held.includes(d.id)) w.body.held.push(d.id);
}

/* A stable snapshot and its hash: what replay must reproduce (§9.4). Logs (said, sounds) are included. */
export function snapshot(w) { return canonicalJSON(w); }
export function canonicalJSON(o) {
  if (Array.isArray(o)) return '[' + o.map(canonicalJSON).join(',') + ']';
  if (o && typeof o === 'object') return '{' + Object.keys(o).sort().filter(k => o[k] !== undefined).map(k => JSON.stringify(k) + ':' + canonicalJSON(o[k])).join(',') + '}';
  if (typeof o === 'number') return JSON.stringify(Math.round(o * 1e6) / 1e6);
  return JSON.stringify(o === undefined ? null : o);
}
/* cyrb53-style 53-bit hash, as 14 hex digits. */
export function hashString(s) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, '0');
}
export const stateHash = w => hashString(snapshot(w));

/* Seeded generator (mulberry32), keyed by seed and sequence number: same journal, same draws. */
export function rngFor(seed, key) {
  let a = (Math.imul(seed | 0, 0x9e3779b1) ^ Math.imul(key | 0, 0x85ebca6b)) >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
