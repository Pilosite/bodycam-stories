/* PDL v0 vocabulary: the closed, typed tables (docs/pdl-spec.md §4 to §8).
   Pure data and small schema helpers. Everything a transaction may say is listed here; what is not here cannot be written.
   Story packs extend values (sound cues, line ids, things, stations), never keys or ops. */

export const PDL_VERSION = 0;
export const HORIZONS = ['now', 'scene', 'story'];
export const KINDS = ['intent', 'act', 'effect', 'fact', 'rule', 'cancel'];
export const AUTHOR_KINDS = ['player', 'creator', 'model', 'engine'];
export const TIERS = ['reflex', 'translate', 'stage', 'background'];

/* Which horizons a kind admits; the first is the default (used to repair a wrong horizon). */
export const KIND_HORIZONS = {
  intent: ['now'], act: ['now'], effect: ['now', 'scene', 'story'],
  fact: ['story', 'scene'], rule: ['scene', 'story'], cancel: ['now'],
};
/* Who may submit what. A player may also author a fact or rule that is part of a commitment (body.commit present, §8.6). */
export const AUTHORITY = {
  player: ['intent'], model: ['intent', 'act', 'effect', 'fact', 'rule', 'cancel'],
  creator: ['effect', 'fact', 'rule', 'cancel'], engine: KINDS,
};
export const TTL = { now: { def: 8, max: 60 }, scene: { def: null, max: 3600 }, story: null };

export const BUDGET = {
  things_max: 8,            // engine: OBJETS_MOTEUR
  shapes_max: 64,           // engine: FORMES_MOTEUR
  shapes_per_thing: 12,     // engine: OBJET_FORMES_MAX
  size_max_m: 3,            // a thing's span without an explicit request
  size_hard_max_m: 8,       // the most a player request can ask
  line_max: 300,            // characters per language
  rules_scene_max: 12, rules_story_max: 24,
  then_max: 4, if_max: 4, rule_depth_max: 3,
  facts_max: 400,
};

/* ---------------------------------------------------------------- schema helpers */
const f = (t, o = {}) => Object.assign({ t }, o);
export const T = {
  num: (min, max, o) => f('num', Object.assign({ min, max }, o)),
  int: (min, max, o) => f('num', Object.assign({ min, max, int: true }, o)),
  enum: (values, o) => f('enum', Object.assign({ values }, o)),
  id: o => f('id', o),
  ref: (classes, o) => f('ref', Object.assign({ classes }, o)),
  text: (max, o) => f('text', Object.assign({ max }, o)),
  line: o => f('line', o),
  bool: o => f('bool', o),
  vec: (n, min, max, o) => f('vec', Object.assign({ n, min, max }, o)),
  color: o => f('color', o),
  material: o => f('material', o),
  cue: o => f('cue', o),
  lineRef: o => f('lineref', o),
  atom: o => f('atom', o),
  obj: (fields, o) => f('obj', Object.assign({ fields }, o)),
  list: (item, max, o) => f('list', Object.assign({ item, max }, o)),
  shapes: o => f('shapes', o),
  match: o => f('match', o),
  conds: o => f('conds', o),
  templates: o => f('templates', o),
  commit: o => f('commit', o),
};
export const ID_RE = /^[a-z][a-z0-9_.-]{0,59}$/;
export const REF_RE = /^(body|(thing|station|dir):[a-z][a-z0-9_.-]{0,59})$/;
export const DIRS = ['sun', 'north', 'south', 'east', 'west', 'back', 'left', 'right', 'up', 'down'];
export const TONES = ['flat', 'dry', 'warm', 'low', 'tense', 'amused', 'whisper'];
export const SHAPE_KINDS = ['box', 'ball', 'cylinder', 'cone', 'capsule', 'roof'];

/* ---------------------------------------------------------------- bodies
   `$one`: at least one of these fields. `primary`: the field a bare positional argument fills (source calls, §2.4).
   `intent`: where a missing required field is completed from the player's intent (§8.2). */
export const ACT = {
  go: { primary: 'to', fields: { to: T.ref(['station'], { req: true, intent: 'target' }), via: T.id() } },
  look: { primary: 'target', $one: ['target', 'pitch', 'yaw'], fields: { target: T.ref(['thing', 'dir', 'station'], { intent: 'target' }), pitch: T.num(-60, 75), yaw: T.num(-180, 180) } },
  turn: { primary: 'degrees', fields: { degrees: T.num(-180, 180, { req: true, dec: 0, intent: 'params.degrees' }) } },
  posture: { primary: 'height', fields: { height: T.num(0.35, 1, { req: true, dec: 2, intent: 'params.height' }) } },
  touch: { primary: 'target', fields: { target: T.ref(['thing'], { req: true, intent: 'target', reach: true }) } },
  take: { primary: 'target', fields: { target: T.ref(['thing'], { req: true, intent: 'target', reach: true }) } },
  shape: { primary: 'target', fields: { target: T.ref(['thing'], { req: true, intent: 'target', reach: true }) } },
  wait: { primary: 'seconds', fields: { seconds: T.num(0, 5, { def: 1, intent: 'params.seconds' }) } },
  stop: { fields: {} },
  say: { primary: 'ref', $one: ['line', 'ref'], fields: { line: T.line(), ref: T.lineRef(), tone: T.enum(TONES, { def: 'flat' }) } },
};
/* Engine actions that exist today but are free movement: reserved for v2 (docs/scope.md), rejected in v1. */
export const RESERVED_ACT = ['move', 'approach', 'frame', 'climb', 'descend', 'search'];

export const EFFECT = {
  'thing.place': { primary: 'name', fields: {
    id: T.id({ req: true }), name: T.text(60, { req: true }), shapes: T.shapes({ req: true }),
    mass_kg: T.num(0.001, 500, { intent: 'params.mass_kg' }), at: T.ref(['thing', 'body'], { def: 'body' }),
    offset: T.vec(2, -8, 8, { def: [0, 1], reach: true }) } },
  'thing.change': { primary: 'target', $one: ['scale', 'offset', 'glow', 'wobble'], fields: {
    target: T.ref(['thing'], { req: true }), scale: T.num(0.2, 4), offset: T.vec(2, -6, 6), glow: T.bool(), wobble: T.num(0, 1) } },
  'thing.remove': { primary: 'target', fields: { target: T.ref(['thing'], { req: true }) } },
  'sound.play': { primary: 'cue', fields: { cue: T.cue({ req: true }), at: T.ref(['thing', 'body', 'station'], { def: 'body' }), gain: T.num(0, 0.9, { def: 0.5 }) } },
  'place.set': { primary: 'fog', $one: ['fog', 'lamp', 'sun_height', 'weather'], fields: {
    fog: T.num(0, 0.06, { dec: 4 }), lamp: T.bool(), sun_height: T.num(-20, 90, { dec: 1 }), weather: T.enum(['clear', 'veil']) } },
  'camera.set': { primary: 'degrade', $one: ['battery', 'degrade', 'shake', 'off'], fields: { battery: T.num(0, 1), degrade: T.num(0, 1), shake: T.num(0, 1), off: T.bool() } },
  'light.raise': { primary: 'degrees', fields: { degrees: T.num(-30, 30, { req: true, dec: 1 }) } },
  'speech.set': { primary: 'volume', $one: ['volume', 'shorten'], fields: { volume: T.enum(['whisper', 'low', 'normal']), shorten: T.num(0, 1) } },
  'scene.start': { primary: 'id', fields: { id: T.id({ req: true }) } },
  'beat.set': { primary: 'id', fields: { id: T.id({ req: true }) } },
  'story.end': { primary: 'id', fields: { id: T.id({ req: true }) } },
};

export const SHAPE = {
  shape: T.enum(SHAPE_KINDS, { req: true }), p: T.vec(3, -6, 6, { def: [0, 0, 0] }), size: T.vec(3, 0.01, 8, { req: true }),
  color: T.color({ def: '#777777' }), material: T.material(), yaw: T.num(-360, 360, { dec: 0 }), tilt: T.vec(2, -90, 90),
  round: T.num(0, 0.3), smooth: T.num(0, 0.5),
};

export const COMMIT = { id: T.id({ req: true }), party: T.id({ req: true }), status: T.enum(['accepted', 'amended', 'refused', 'kept', 'broken'], { req: true }), strength: T.enum(['hard', 'tendency'], { def: 'hard' }) };

export const FACT = { fields: {
  subject: T.id({ req: true }), predicate: T.id({ req: true }), value: T.atom({ req: true }),
  certainty: T.num(0, 1, { dec: 2 }), source: T.text(120), commit: T.commit() } };

export const INTENT_VERBS = ['look', 'turn', 'posture', 'touch', 'take', 'shape', 'make', 'wait', 'stop', 'say', 'go', 'commit', 'ask', 'other'];
export const INTENT = { fields: {
  text: T.text(300, { req: true }), lang: T.id({ req: true }), verb: T.enum(INTENT_VERBS, { req: true }),
  target: T.ref(['thing', 'dir', 'station', 'body']),
  params: T.obj({ degrees: T.num(-180, 180), height: T.num(0.35, 1), seconds: T.num(0, 60), size_m: T.num(0.01, 50), mass_kg: T.num(0.001, 5000), what: T.text(60) }),
  class: T.id(), loud: T.bool(), condition: T.text(200), behaviour: T.text(200), commit: T.id() } };

export const RULE = { fields: {
  id: T.id({ req: true }),
  when: T.obj({ event: T.enum(null, { req: true, events: true }), match: T.match() }, { req: true }),
  if: T.conds(), then: T.templates({ req: true }),
  limits: T.obj({ max_fires: T.int(1, 20, { def: 1 }), cooldown_s: T.num(0, 3600, { def: 0 }) }, { def: {} }),
  strength: T.enum(['hard', 'tendency'], { def: 'hard' }), commit: T.id(), principle: T.id() } };

export const CANCEL = { fields: { target: T.text(80, { req: true }), reason: T.text(120) } };

/* ---------------------------------------------------------------- events (§7.1): name → fields a `match` may test */
export const EVENTS = {
  'session.started': [],
  'intent.heard': ['verb', 'target', 'text', 'class', 'loud'],
  'look.at': ['target', 's'],
  'act.done': ['op', 'target', 'to'],
  'said': ['text', 'lang', 'ref'],
  'sound.played': ['cue', 'at'],
  'thing.placed': ['id', 'name'], 'thing.changed': ['id'], 'thing.removed': ['id', 'reason'],
  'fact.added': ['subject', 'predicate', 'value', 'certainty'],
  'camera.changed': ['battery', 'degrade', 'shake'],
  'place.changed': ['fog', 'lamp', 'sun_height', 'weather'],
  'station.entered': ['id'], 'station.left': ['id'],
  'scene.started': ['id'],
  'clock.tick': ['t', 'scene_t', 'station', 'dwell_s', 'silent_s'],
  'beat.entered': ['id'], 'story.ended': ['id'], 'speech.changed': ['volume', 'shorten'],
  'commitment.due': ['commit', 'rule'],
  'gauge.changed': ['id', 'value', 'word'],
};
export const MATCH_OPS = ['eq', 'ne', 'lt', 'le', 'gt', 'ge', 'in', 'contains'];
/* Readable state paths (conditions, source shorthand) and the event that announces their change. */
export const STATE_PATHS = {
  'camera.battery': 'camera.changed', 'camera.degrade': 'camera.changed', 'camera.shake': 'camera.changed',
  'place.fog': 'place.changed', 'place.lamp': 'place.changed', 'place.sun_height': 'place.changed',
  'clock.t': 'clock.tick', 'clock.scene_t': 'clock.tick', 'body.station': 'station.entered', 'body.height': 'act.done',
};
export const CONDS = {
  near: { a: T.ref(['body', 'thing', 'station'], { req: true }), b: T.ref(['body', 'thing', 'station'], { req: true }), within_m: T.num(0, 500, { req: true }) },
  fact: { subject: T.id({ req: true }), predicate: T.id({ req: true }), value: T.atom(), min_certainty: T.num(0, 1) },
  state: { path: T.enum(Object.keys(STATE_PATHS), { req: true }), eq: T.atom(), ne: T.atom(), lt: T.num(-1e6, 1e6), le: T.num(-1e6, 1e6), gt: T.num(-1e6, 1e6), ge: T.num(-1e6, 1e6) },
  scene: { id: T.id({ req: true }) },
  station: { id: T.id({ req: true }) },
  beat: { id: T.id({ req: true }) },
  reach: { target: T.ref(['thing'], { req: true }) },
  ending: { id: T.id() },
  promised: { class: T.id({ req: true }) },
  gauge: { id: T.id({ req: true }), word: T.enum(['low', 'medium', 'high']), gt: T.num(0, 1), lt: T.num(0, 1) },
};
export const GAUGE_WORDS = ['low', 'medium', 'high'];

/* What a template emits when executed: used to forbid a rule from triggering itself (§7.4). */
export function emitsOf(kind, body) {
  if (kind === 'fact') return [['fact.added', { subject: body.subject, predicate: body.predicate }]];
  if (kind === 'act') {
    const out = [['act.done', { op: body.op }]];
    if (body.op === 'say') out.push(['said', { ref: body.ref }]);
    if (body.op === 'go') out.push(['station.left', {}], ['station.entered', { id: refId(body.to) }]);
    if (body.op === 'look') out.push(['look.at', { target: body.target }]);
    return out;
  }
  if (kind === 'effect') {
    const m = { 'thing.place': ['thing.placed', { id: body.id }], 'thing.change': ['thing.changed', {}], 'thing.remove': ['thing.removed', {}],
      'sound.play': ['sound.played', { cue: body.cue }], 'place.set': ['place.changed', {}], 'camera.set': ['camera.changed', {}], 'scene.start': ['scene.started', { id: body.id }],
      'light.raise': ['place.changed', {}], 'speech.set': ['speech.changed', {}], 'beat.set': ['beat.entered', { id: body.id }], 'story.end': ['story.ended', { id: body.id }] }[body.op];
    return m ? [m] : [];
  }
  return [];
}
export const refId = r => typeof r === 'string' && r.includes(':') ? r.slice(r.indexOf(':') + 1) : r;
export const refClass = r => r === 'body' ? 'body' : typeof r === 'string' ? r.split(':')[0] : null;
