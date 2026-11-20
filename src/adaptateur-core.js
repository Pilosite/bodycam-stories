/* The engine adapter (docs/pdl-spec.md §9.2, §12): the page implements the executor of core/ here.
   Split in two, so that the contract suite (tests/core-executor.contract.mjs) runs on the pure part in node:
   - createEngineExecutor({ apply }): every executor call (args, ctx) → the events the engine reports, computed from the core's
     read-only world exactly as core/paper-world.js does (a session recorded in the page replays to the same hash in the
     paper world), plus page commands handed to `apply(cmd)`. No DOM, no import, no engine state.
   - src/story.js and src/main.js: `apply` turns commands into what the page does (walk, look, subtitles, voice, sounds,
     shapes, light, sensor, end screen).
   What the engine cannot do yet is recorded in `gaps` (call, why), shown in the debug panel and listed in docs/milestones.md;
   it is never faked. */

export const ENABLED = true;

/* executor call → existing call in src/main.js / src/meneur.js / src/son.js; gap: what the engine still lacks (M2). */
export const MAPPING = [
  { call: 'go', engine: 'station transition: walk along the path (tourner + marcher, no obstacle logic) or a cut', gap: null },
  { call: 'look', engine: "enqueue([{type:'viser', objet}]) ; regarder {degres} ; tourner to a yaw", gap: 'dir:* is not looked at (no compass in the page)' },
  { call: 'turn', engine: "enqueue([{type:'tourner', degres}])", gap: null },
  { call: 'posture', engine: "enqueue([{type:'posture', hauteur}])", gap: null },
  { call: 'touch', engine: "enqueue([{type:'viser', objet}, {type:'posture', hauteur:0.5}])", gap: 'hand contact (no hands in frame)' },
  { call: 'take', engine: "enqueue([{type:'viser', objet}, {type:'posture', hauteur:0.5}])", gap: 'taking a given thing in place: she looks and bends, nothing leaves the ground' },
  { call: 'shape', engine: 'none', gap: 'shaping steps are not in PDL v0' },
  { call: 'wait', engine: "enqueue([{type:'attendre', secondes}])", gap: null },
  { call: 'stop', engine: "executer({type:'stop'})", gap: null },
  { call: 'say', engine: 'subtitle + a voice per speaker and language (src/story.js)', gap: 'tone drives only the whisper' },
  { call: 'placeThing', engine: 'fiche.objets + buildShapes at the core position', gap: null },
  { call: 'changeThing', engine: "objetMeneur({op:'modifier', id, echelle, decale, vacille})", gap: null },
  { call: 'removeThing', engine: "objetMeneur({op:'retirer', id})", gap: null },
  { call: 'playSound', engine: 'jouerBruit(plan) from the recipes of src/bruitages.json (indices: cue → plans)', gap: 'spatial position of a sound' },
  { call: 'setPlace', engine: 'patchScene({brume, lampe, soleil:{hauteur}})', gap: 'weather' },
  { call: 'setCamera', engine: 'camera.frag uAbime (degrade, off) + shake on the pose', gap: null },
  { call: 'setSpeech', engine: 'whisper: lower voice and small subtitle; shorten: the line cut to its first sentences', gap: null },
  { call: 'startScene', engine: 'none', gap: 'scene table in the pack' },
  { call: 'endStory', engine: 'the end screen (#fin)', gap: null },
];

const r2 = x => Math.round(x * 100) / 100;
const clone = o => o === undefined ? undefined : JSON.parse(JSON.stringify(o));
/* Position of a ref in the core world, as core/world.js posOf (body = its station). */
function posOf(w, ref) {
  if (ref === 'body') { const s = w.stations[w.body.station]; return s ? s.pos : [0, 0]; }
  const i = String(ref || '').indexOf(':'), c = ref.slice(0, i), id = ref.slice(i + 1);
  if (c === 'station') return w.stations[id] ? w.stations[id].pos : null;
  if (c === 'thing') { const t = w.things[id]; return t && (t.expires === null || t.expires === undefined || t.expires > w.clock.t) ? t.pos : null; }
  return null;
}

export function createEngineExecutor({ apply = () => {} } = {}) {
  const gaps = [], seen = new Set();
  const gap = (call, why, seq) => { const k = call + '|' + why; if (seen.has(k)) return; seen.add(k); gaps.push({ call, why, seq }); };
  const send = (cmd, ctx) => { try { apply(Object.assign({ seq: ctx && ctx.seq }, cmd)); } catch (e) { gap(cmd.do, 'page error: ' + (e && e.message), ctx && ctx.seq); } };
  const ex = {
    gaps,
    go(a, ctx) {
      const w = ctx.world, from = w.stations[a.from], to = w.stations[a.station];
      send({ do: 'go', from: a.from, to: a.station, via: a.via, from_pos: from && from.pos, to_pos: to && to.pos, heading: to ? to.heading : 0, posture: a.posture }, ctx);
      return [{ event: 'station.left', data: { id: a.from } }, { event: 'station.entered', data: { id: a.station } }, ...(a.posture !== undefined ? [{ event: 'body.pose', data: { height: a.posture } }] : [])];
    },
    look(a, ctx) {
      const w = ctx.world, pose = {};
      if (a.target && !a.target.startsWith('dir:')) {
        const p = posOf(w, a.target), s = posOf(w, 'body');
        if (p && s) pose.yaw = r2(Math.atan2(p[0] - s[0], p[1] - s[1]) * 180 / Math.PI);
      }
      if (a.yaw !== undefined) pose.yaw = a.yaw;
      if (a.pitch !== undefined) pose.pitch = a.pitch;
      if (a.target && a.target.startsWith('dir:')) gap('look', 'dir:* is not looked at (' + a.target + ')', ctx.seq);
      send({ do: 'look', thing: a.thing, yaw: a.target && a.target.startsWith('thing:') ? undefined : pose.yaw, pitch: a.pitch }, ctx);
      return Object.keys(pose).length ? [{ event: 'body.pose', data: pose }] : [];
    },
    turn(a, ctx) { send({ do: 'turn', degrees: a.degrees }, ctx); return [{ event: 'body.pose', data: { yaw: r2(((ctx.world.body.yaw + a.degrees + 540) % 360) - 180) } }]; },
    posture(a, ctx) { send({ do: 'posture', height: a.height }, ctx); return [{ event: 'body.pose', data: { height: a.height } }]; },
    touch(a, ctx) { gap('touch', 'hand contact (no hands in frame)', ctx.seq); send({ do: 'reach', thing: a.thing }, ctx); return []; },
    take(a, ctx) { gap('take', 'taking a given thing in place: she looks and bends, nothing leaves the ground', ctx.seq); send({ do: 'reach', thing: a.thing }, ctx); return [{ event: 'body.held', data: { id: a.thing } }]; },
    shape(a, ctx) { gap('shape', 'shaping steps are not in PDL v0', ctx.seq); send({ do: 'reach', thing: a.thing }, ctx); return []; },
    wait(a, ctx) { send({ do: 'wait', seconds: a.seconds ?? 1 }, ctx); return []; },
    stop(a, ctx) { send({ do: 'stop' }, ctx); return []; },
    say(a, ctx) { send({ do: 'say', line: clone(a.line), lang: a.lang, tone: a.tone, ref: a.ref }, ctx); return []; },
    placeThing(a, ctx) { send({ do: 'thing.place', id: a.id, name: a.name, shapes: clone(a.shapes), pos: a.pos }, ctx); return []; },
    changeThing(a, ctx) { send(Object.assign({ do: 'thing.change' }, clone(a)), ctx); return []; },
    removeThing(a, ctx) { send({ do: 'thing.remove', id: a.id }, ctx); return []; },
    playSound(a, ctx) { send({ do: 'sound', cue: a.cue, recipe: a.recipe, pos: a.pos, gain: a.gain, seed: ctx.seed, key: ctx.seq }, ctx); return []; },
    setPlace(a, ctx) { if (a.weather && a.weather !== 'clear') gap('setPlace', 'weather ' + a.weather, ctx.seq); send(Object.assign({ do: 'place' }, clone(a)), ctx); return []; },
    setCamera(a, ctx) { send(Object.assign({ do: 'camera' }, clone(a)), ctx); return []; },
    setSpeech(a, ctx) { send(Object.assign({ do: 'speech' }, clone(a)), ctx); return []; },
    startScene(a, ctx) { gap('startScene', 'no scene table in the pack: nothing changes on screen', ctx.seq); return []; },
    endStory(a, ctx) { send({ do: 'end', id: a.id }, ctx); return []; },
  };
  return ex;
}

/* PDL shapes (English keys) → the formes of the existing vocabulary (creerMonde, validerForme). */
const SHAPE = { box: 'boite', ball: 'boule', cylinder: 'cylindre', cone: 'cone', capsule: 'capsule', roof: 'toit' };
export function toFormes(shapes) {
  return (shapes || []).map(s => Object.assign({ f: SHAPE[s.shape], p: s.p, taille: s.size, couleur: s.color || '#777777', matiere: s.material || 'mat' },
    s.yaw !== undefined ? { cap: s.yaw } : {}, s.tilt ? { penche: s.tilt } : {}, s.round !== undefined ? { arrondi: s.round } : {}, s.smooth !== undefined ? { lisse: s.smooth } : {}));
}

/* The line a say command shows, in the play language (else the first one it has), shortened by speech.shorten. */
export function lineText(line, lang, shorten = 0) {
  const L = line || {}; let t = L[lang] || Object.entries(L).filter(([k]) => k !== 'speaker').map(([, v]) => v)[0] || '';
  if (shorten > 0) {
    const parts = String(t).match(/[^.!?…]+[.!?…]*\s*/g) || [t], keep = Math.max(1, Math.round(parts.length * (1 - shorten)));
    t = parts.slice(0, keep).join('').trim();
  }
  return String(t);
}
