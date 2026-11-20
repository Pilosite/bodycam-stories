/* PDL v0: canonical form and validation with repair (docs/pdl-spec.md §3, §8).
   validate(tx, world, budget) → { status: accepted | repaired | rejected, tx, repair, reasons }.
   Closed vocabulary: an unknown kind, op, field, event or cue is rejected. Bounds are repaired (clamped, shrunk, truncated),
   a missing field is completed from the player's intent when it can be, a forbidden target is replaced by the intent's.
   Every change is listed in `repair` ({ path, action, from, to, why }); every refusal in `reasons`. */
import { HORIZONS, KINDS, AUTHOR_KINDS, TIERS, KIND_HORIZONS, AUTHORITY, TTL, BUDGET, ACT, EFFECT, RESERVED_ACT, SHAPE, FACT, INTENT, RULE,
  CANCEL, COMMIT, EVENTS, MATCH_OPS, CONDS, DIRS, ID_RE, REF_RE, emitsOf, refClass, refId } from './vocab.js';
import { live, inReach, stepToward, adjacent, evalCond, spanOf, station, liveThings } from './world.js';

export * from './vocab.js';
export { parseTokens, serializeTokens, display } from './tokens.js';

const isObj = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const clone = o => o === undefined ? undefined : JSON.parse(JSON.stringify(o));
const round = (x, d = 4) => { const k = 10 ** d; return Math.round(x * k) / k; };
const ENVELOPE = ['v', 'id', 't', 'author', 'horizon', 'kind', 'body', 'cause', 'ttl', 'status', 'repair', 'reasons'];

/* The schema of a body, by kind and op. */
export function bodySchema(kind, op) {
  if (kind === 'act') return ACT[op] || null;
  if (kind === 'effect') return EFFECT[op] || null;
  return { intent: INTENT, fact: FACT, rule: RULE, cancel: CANCEL }[kind] || null;
}

/* ---------------------------------------------------------------- canonical form (§3.3)
   Key order: envelope order, then `op`, then schema order; unknown keys last, sorted. Numbers rounded to 4 decimals.
   canonical() does not validate: it is what both encodings are compared on. */
export function canonical(tx) {
  if (!isObj(tx)) return tx;
  const out = {};
  for (const k of ['v', 'id', 't', 'author', 'horizon', 'kind', 'body', 'cause', 'ttl', 'status', 'repair', 'reasons']) {
    if (tx[k] === undefined) continue;
    if (k === 'author') out.author = orderKeys(tx.author, ['kind', 'id', 'tier', 'layer']);
    else if (k === 'cause') out.cause = orderKeys(tx.cause, ['tx', 'rule', 'commit', 'amends']);
    else if (k === 'body') out.body = canonicalBody(tx.kind, tx.body);
    else out[k] = canonValue(tx[k]);
  }
  for (const k of Object.keys(tx).filter(k => !ENVELOPE.includes(k)).sort()) out[k] = canonValue(tx[k]);
  return out;
}
export function canonicalBody(kind, body) {
  if (!isObj(body)) return canonValue(body);
  const s = bodySchema(kind, body.op);
  return orderBySchema(body, s ? s.fields : null, kind === 'act' || kind === 'effect');
}
function orderBySchema(o, fields, withOp) {
  const out = {};
  if (withOp && o.op !== undefined) out.op = o.op;
  const known = fields ? Object.keys(fields) : [];
  for (const k of known) if (o[k] !== undefined) out[k] = canonField(fields[k], o[k]);
  for (const k of Object.keys(o).filter(k => !known.includes(k) && !(withOp && k === 'op')).sort()) out[k] = canonValue(o[k]);
  return out;
}
function canonField(spec, v) {
  if (spec.t === 'obj' && isObj(v)) return orderBySchema(v, spec.fields);
  if (spec.t === 'shapes' && Array.isArray(v)) return v.map(x => isObj(x) ? orderBySchema(x, SHAPE) : canonValue(x));
  if (spec.t === 'commit' && isObj(v)) return orderBySchema(v, COMMIT);
  if (spec.t === 'templates' && Array.isArray(v)) return v.map(x => {
    if (!isObj(x)) return x;
    const o = {}; for (const k of ['horizon', 'kind']) if (x[k] !== undefined) o[k] = x[k];
    if (x.body !== undefined) o.body = canonicalBody(x.kind, x.body);
    if (x.ttl !== undefined) o.ttl = canonValue(x.ttl);
    for (const k of Object.keys(x).filter(k => !['horizon', 'kind', 'body', 'ttl'].includes(k)).sort()) o[k] = canonValue(x[k]);
    return o;
  });
  if (spec.t === 'conds' && Array.isArray(v)) return v.map(canonCond);
  if (spec.t === 'num' && typeof v === 'number') return spec.int ? Math.round(v) : round(v, spec.dec ?? 4);
  return canonValue(v);
}
function canonCond(c) {
  if (!isObj(c)) return c;
  const k = Object.keys(c)[0];
  if (k === 'not') return { not: canonCond(c.not) };
  return { [k]: CONDS[k] ? orderBySchema(c[k], CONDS[k]) : canonValue(c[k]) };
}
function orderKeys(o, order) {
  if (!isObj(o)) return o;
  const out = {};
  for (const k of order) if (o[k] !== undefined) out[k] = canonValue(o[k]);
  for (const k of Object.keys(o).filter(k => !order.includes(k)).sort()) if (o[k] !== undefined) out[k] = canonValue(o[k]);
  return out;
}
function canonValue(v) {
  if (typeof v === 'number') return round(v);
  if (Array.isArray(v)) return v.map(canonValue);
  if (isObj(v)) { const o = {}; for (const k of Object.keys(v).sort()) if (v[k] !== undefined) o[k] = canonValue(v[k]); return o; }
  if (typeof v === 'string') return v.normalize('NFC');
  return v;
}

/* ---------------------------------------------------------------- validation */
export function validate(tx0, world, budget = BUDGET, opts = {}) {
  const B = Object.assign({}, BUDGET, budget || {});
  const c = { world, B, repairs: [], reasons: [], template: !!opts.template, intent: null, pendingThings: opts.pendingThings || [] };
  const done = tx => {
    const status = c.reasons.length ? 'rejected' : c.repairs.length ? 'repaired' : 'accepted';
    return Object.assign({ status, tx: tx ? canonical(tx) : null, repair: c.repairs, reasons: c.reasons }, c.evict && status !== 'rejected' ? { evict: c.evict } : {});
  };
  if (!isObj(tx0)) { c.reasons.push({ path: '', why: 'not_an_object' }); return done(null); }
  const tx = clone(tx0);
  for (const k of Object.keys(tx)) if (!ENVELOPE.includes(k)) c.reasons.push({ path: k, why: 'unknown_field' });
  delete tx.status; delete tx.repair; delete tx.reasons;
  if (tx.v !== undefined && tx.v !== 0) c.reasons.push({ path: 'v', why: 'unknown_version' });
  tx.v = 0;
  if (!KINDS.includes(tx.kind)) { c.reasons.push({ path: 'kind', why: 'unknown_kind', value: tx.kind }); return done(tx); }
  // author
  const a = tx.author;
  if (!isObj(a) || !AUTHOR_KINDS.includes(a.kind) || typeof a.id !== 'string' || !a.id) c.reasons.push({ path: 'author', why: 'bad_author' });
  else {
    for (const k of Object.keys(a)) if (!['kind', 'id', 'tier', 'layer'].includes(k)) c.reasons.push({ path: 'author.' + k, why: 'unknown_field' });
    if (a.tier !== undefined && !TIERS.includes(a.tier)) c.reasons.push({ path: 'author.tier', why: 'unknown_value', value: a.tier });
    const commitOk = a.kind === 'player' && isObj(tx.body) && (tx.kind === 'fact' ? isObj(tx.body.commit) : tx.kind === 'rule' && typeof tx.body.commit === 'string');
    if (!AUTHORITY[a.kind].includes(tx.kind) && !commitOk) c.reasons.push({ path: 'author', why: 'not_allowed', value: a.kind + ' cannot submit ' + tx.kind });
  }
  if (c.reasons.length) return done(tx);
  // horizon and ttl
  const H = KIND_HORIZONS[tx.kind];
  if (!H.includes(tx.horizon)) { rep(c, 'horizon', 'horizon', tx.horizon, H[0], HORIZONS.includes(tx.horizon) ? tx.kind + ' lives at ' + H.join('/') : 'unknown horizon'); tx.horizon = H[0]; }
  if (tx.ttl !== undefined) {
    const lim = TTL[tx.horizon];
    if (!lim) { rep(c, 'ttl', 'drop', tx.ttl, undefined, 'story has no ttl'); delete tx.ttl; }
    else if (typeof tx.ttl !== 'number' || !(tx.ttl > 0)) { rep(c, 'ttl', 'drop', tx.ttl, undefined, 'ttl must be a positive number'); delete tx.ttl; }
    else if (tx.ttl > lim.max) { rep(c, 'ttl', 'clamp', tx.ttl, lim.max, 'bound'); tx.ttl = lim.max; }
  } else if (tx.horizon === 'now' && (tx.kind === 'effect')) tx.ttl = TTL.now.def;
  // the player's intent, the reference for repairs
  c.intent = opts.intent !== undefined ? opts.intent : intentFor(world, tx);
  if (!isObj(tx.body)) { c.reasons.push({ path: 'body', why: 'missing' }); return done(tx); }
  c.horizon = tx.horizon;
  tx.body = checkBody(tx.kind, tx.body, 'body', c, a);
  if (!c.reasons.length && !c.template) checkConstraints(tx, world, c);
  return done(tx);
}

/* The intent a transaction answers: its cause, else the newest intent of the last 15 s. */
function intentFor(w, tx) {
  if (!w || !w.intents) return null;
  if (tx.cause && w.intents[tx.cause.tx]) return w.intents[tx.cause.tx];
  const ks = Object.keys(w.intents).map(Number).sort((x, y) => y - x);
  for (const k of ks) { const i = w.intents[k]; if (w.clock.t - i.t <= 15) return i; }
  return null;
}
const rep = (c, path, action, from, to, why) => c.repairs.push(Object.assign({ path, action }, from !== undefined ? { from: clone(from) } : {}, to !== undefined ? { to: clone(to) } : {}, { why }));
const no = (c, path, why, value) => c.reasons.push(Object.assign({ path, why }, value !== undefined ? { value } : {}));
const isTpl = (c, v) => c.template && typeof v === 'string' && /^\$event\.[a-z_]+$/.test(v);
const pick = (o, path) => path.split('.').reduce((x, k) => isObj(x) ? x[k] : undefined, o);

function checkBody(kind, body, path, c, author) {
  let schema = bodySchema(kind, body.op);
  if (kind === 'rule') c._event = isObj(body.when) ? body.when.event : undefined;
  if (kind === 'act' || kind === 'effect') {
    if (typeof body.op !== 'string') { no(c, path + '.op', 'missing'); return body; }
    if (kind === 'act' && RESERVED_ACT.includes(body.op)) { no(c, path + '.op', 'reserved_v2', body.op); return body; }
    if (!schema) { no(c, path + '.op', 'unknown_op', body.op); return body; }
  }
  const out = checkFields(schema, body, path, c, kind === 'act' || kind === 'effect');
  if (c.reasons.length) return out;
  if (schema.$one && !schema.$one.some(k => out[k] !== undefined)) {
    const k = schema.$one[0], spec = schema.fields[k], v = spec.intent && pick(c.intent, spec.intent);
    if (v !== undefined) { const x = checkValue(spec, v, path + '.' + k, c); if (x !== undefined) { out[k] = x; rep(c, path + '.' + k, 'complete', undefined, x, 'from the intent'); } }
    if (!schema.$one.some(k => out[k] !== undefined)) no(c, path, 'missing_one_of', schema.$one.join('|'));
  }
  if (c.reasons.length) return out;
  if (kind === 'act') postAct(out, path, c);
  if (kind === 'effect') postEffect(out, path, c);
  if (kind === 'fact') postFact(out, path, c, author);
  if (kind === 'rule') postRule(out, path, c, author);
  if (kind === 'cancel') postCancel(out, path, c, author);
  if (kind === 'intent') postIntent(out, path, c);
  return out;
}

function checkFields(schema, o, path, c, withOp) {
  const fields = schema.fields || schema, out = {};
  if (withOp) out.op = o.op;
  for (const k of Object.keys(o)) if (!(k in fields) && !(withOp && k === 'op')) no(c, path + '.' + k, 'unknown_field');
  if (c.reasons.length) return out;
  for (const [k, spec] of Object.entries(fields)) {
    let v = o[k];
    if (v === undefined || v === null || v === '') {
      const iv = spec.intent && pick(c.intent, spec.intent);
      if (spec.req && iv !== undefined) { const x = checkValue(spec, iv, path + '.' + k, c); if (x !== undefined) { out[k] = x; rep(c, path + '.' + k, 'complete', undefined, x, 'from the intent'); } continue; }
      if (spec.def !== undefined) { const d = clone(spec.def); out[k] = spec.t === 'obj' ? checkFields(spec, d, path + '.' + k, c) : d; continue; }
      if (spec.req) no(c, path + '.' + k, 'missing');
      continue;
    }
    const x = checkValue(spec, v, path + '.' + k, c);
    if (x !== undefined) out[k] = x;
  }
  return out;
}

function checkValue(spec, v, path, c) {
  if (isTpl(c, v) && ['ref', 'id', 'text', 'atom', 'cue', 'lineref'].includes(spec.t)) return v;
  const B = c.B;
  switch (spec.t) {
    case 'num': {
      if (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v.trim())) { rep(c, path, 'coerce', v, +v, 'number written as text'); v = +v; }
      if (typeof v !== 'number' || !isFinite(v)) { no(c, path, 'not_a_number', v); return undefined; }
      let x = Math.min(spec.max, Math.max(spec.min, v));
      if (x !== v) rep(c, path, 'clamp', v, x, `bound ${spec.min}..${spec.max}`);
      return spec.int ? Math.round(x) : round(x, spec.dec ?? 4);
    }
    case 'enum': {
      const vals = spec.events ? Object.keys(EVENTS) : spec.values;
      if (vals.includes(v)) return v;
      if (spec.def !== undefined) { rep(c, path, 'replace', v, spec.def, 'unknown value'); return spec.def; }
      no(c, path, spec.events ? 'unknown_event' : 'unknown_value', v); return undefined;
    }
    case 'id': {
      if (typeof v !== 'string') { no(c, path, 'not_an_id', v); return undefined; }
      if (ID_RE.test(v)) return v;
      const s = v.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9_.-]+/g, '-').replace(/^[^a-z]+/, '').slice(0, 60);
      if (ID_RE.test(s)) { rep(c, path, 'replace', v, s, 'id normalised'); return s; }
      no(c, path, 'not_an_id', v); return undefined;
    }
    case 'ref': return checkRef(spec, v, path, c);
    case 'text': {
      if (typeof v !== 'string') { no(c, path, 'not_text', v); return undefined; }
      const s = v.trim().normalize('NFC');
      if (s.length > spec.max) { const x = cut(s, spec.max); rep(c, path, 'truncate', s.length, x.length, `max ${spec.max} characters`); return x; }
      return s;
    }
    case 'line': {
      if (!isObj(v)) { no(c, path, 'not_a_line', v); return undefined; }
      const langs = c.world ? c.world.langs : ['en'], out = {};
      const bad = Object.keys(v).filter(k => !langs.includes(k));
      if (bad.length) { for (const k of bad) no(c, path + '.' + k, 'unknown_language'); return undefined; }
      for (const k of langs) if (typeof v[k] === 'string' && v[k].trim()) {
        const s = v[k].trim();
        if (s.length > B.line_max) { out[k] = cut(s, B.line_max); rep(c, path + '.' + k, 'truncate', s.length, out[k].length, `max ${B.line_max} characters`); } else out[k] = s;
      }
      if (!Object.keys(out).length) { no(c, path, 'empty_line'); return undefined; }
      return out;
    }
    case 'lineref': {
      if (typeof v !== 'string' || !ID_RE.test(v)) { no(c, path, 'not_an_id', v); return undefined; }
      if (c.world && !c.world.vocab.lines[v]) { no(c, path, 'unknown_line', v); return undefined; }
      return v;
    }
    case 'bool': if (typeof v === 'boolean') return v; no(c, path, 'not_a_boolean', v); return undefined;
    case 'vec': {
      if (!Array.isArray(v) || v.length !== spec.n || !v.every(x => typeof x === 'number' && isFinite(x))) { no(c, path, 'not_a_vector', v); return undefined; }
      const x = v.map(n => round(Math.min(spec.max, Math.max(spec.min, n))));
      if (x.some((n, i) => n !== round(v[i]))) rep(c, path, 'clamp', v, x, `bound ${spec.min}..${spec.max}`);
      return x;
    }
    case 'color': if (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v)) return v.toLowerCase(); rep(c, path, 'replace', v, spec.def, 'not a #rrggbb colour'); return spec.def;
    case 'material':
      if (typeof v === 'string' && (!c.world || c.world.vocab.materials.includes(v))) return v;
      rep(c, path, 'drop', v, undefined, 'unknown material: the engine default is used'); return undefined;
    case 'cue':
      if (typeof v === 'string' && c.world && c.world.vocab.cues[v]) return v;
      no(c, path, 'unknown_cue', v); return undefined;
    case 'atom':
      if (typeof v === 'number' && isFinite(v)) return round(v);
      if (typeof v === 'boolean') return v;
      if (typeof v === 'string') { const s = v.trim(); if (s.length > 120) { rep(c, path, 'truncate', s.length, 120, 'max 120 characters'); return cut(s, 120); } return s; }
      no(c, path, 'not_an_atom', v); return undefined;
    case 'obj': if (!isObj(v)) { no(c, path, 'not_an_object', v); return undefined; } return checkFields(spec, v, path, c);
    case 'commit': if (!isObj(v)) { no(c, path, 'not_an_object', v); return undefined; } return checkFields(COMMIT, v, path, c);
    case 'shapes': {
      if (!Array.isArray(v) || !v.length) { no(c, path, 'no_shapes'); return undefined; }
      let L = v;
      if (L.length > B.shapes_per_thing) { rep(c, path, 'truncate', L.length, B.shapes_per_thing, 'shapes per thing'); L = L.slice(0, B.shapes_per_thing); }
      return L.map((s, i) => isObj(s) ? checkFields(SHAPE, s, `${path}.${i}`, c) : (no(c, `${path}.${i}`, 'not_a_shape'), undefined));
    }
    case 'match': return checkMatch(v, path, c);
    case 'conds': {
      if (!Array.isArray(v)) { no(c, path, 'not_a_list'); return undefined; }
      let L = v;
      if (L.length > B.if_max) { rep(c, path, 'truncate', L.length, B.if_max, 'conditions per rule'); L = L.slice(0, B.if_max); }
      return L.map((x, i) => checkCond(x, `${path}.${i}`, c));
    }
    case 'templates': {
      if (!Array.isArray(v) || !v.length) { no(c, path, 'no_effects'); return undefined; }
      let L = v;
      if (L.length > B.then_max) { rep(c, path, 'truncate', L.length, B.then_max, 'effects per rule'); L = L.slice(0, B.then_max); }
      return L.map((x, i) => checkTemplate(x, `${path}.${i}`, c));
    }
  }
  no(c, path, 'unknown_type'); return undefined;
}
const cut = (s, n) => { const x = s.slice(0, n); const k = Math.max(x.lastIndexOf('. '), x.lastIndexOf('! '), x.lastIndexOf('? ')); return (k > n * 0.5 ? x.slice(0, k + 1) : x).trim(); };

/* A ref: well formed, of an allowed class, existing, not forbidden, within reach when the field asks. Otherwise the
   intent's target replaces it when that one is valid (the player's request is the reference), else the tx is rejected. */
function checkRef(spec, v, path, c) {
  const why = refProblem(spec, v, c);
  if (!why) return v;
  const alt = spec.intent && c.intent && pick(c.intent, spec.intent);
  if (alt && alt !== v && !refProblem(spec, alt, c)) { rep(c, path, 'replace', v, alt, why + '; the intent names ' + alt); return alt; }
  no(c, path, why, v); return undefined;
}
function refProblem(spec, v, c) {
  if (typeof v !== 'string' || !REF_RE.test(v)) return 'bad_ref';
  const cl = refClass(v), id = refId(v), w = c.world;
  if (!spec.classes.includes(cl)) return 'wrong_target_class';
  if (!w) return null;
  if (cl === 'dir' && !DIRS.includes(id)) return 'unknown_target';
  if (c.template) return null;                                     // rule templates: checked again when the rule fires
  if (cl === 'dir' && !DIRS.includes(id)) return 'unknown_target';
  if (cl === 'station' && !w.stations[id]) return 'unknown_target';
  if (cl === 'thing' && !(w.things[id] && live(w.things[id], w.clock.t)) && !c.pendingThings.includes(id)) return 'unknown_target';
  if (w.forbidden.includes(v)) return 'forbidden_target';
  if (spec.reach && cl === 'thing' && w.things[id] && !inReach(w, id)) return 'out_of_reach';
  return null;
}

function checkMatch(v, path, c) {
  if (!isObj(v)) { no(c, path, 'not_an_object'); return undefined; }
  const ev = c._event, allowed = EVENTS[ev] || [], out = {};
  for (const [k, x] of Object.entries(v)) {
    if (!allowed.includes(k)) { no(c, path + '.' + k, 'unknown_field'); continue; }
    if (isObj(x)) {
      for (const op of Object.keys(x)) if (!MATCH_OPS.includes(op)) no(c, `${path}.${k}.${op}`, 'unknown_operator');
      out[k] = canonValue(x);
    } else if (['string', 'number', 'boolean'].includes(typeof x)) out[k] = canonValue(x);
    else no(c, path + '.' + k, 'not_an_atom');
  }
  return out;
}
function checkCond(x, path, c) {
  if (!isObj(x) || Object.keys(x).length !== 1) { no(c, path, 'bad_condition'); return undefined; }
  const k = Object.keys(x)[0];
  if (k === 'not') return { not: checkCond(x.not, path + '.not', c) };
  if (!CONDS[k]) { no(c, path + '.' + k, 'unknown_condition'); return undefined; }
  if (!isObj(x[k])) { no(c, path + '.' + k, 'not_an_object'); return undefined; }
  const saved = c.template; c.template = true;                      // conditions may name things that do not exist yet
  const o = checkFields(CONDS[k], x[k], path + '.' + k, c);
  c.template = saved;
  return { [k]: o };
}
function checkTemplate(x, path, c) {
  if (!isObj(x)) { no(c, path, 'not_an_object'); return undefined; }
  for (const k of Object.keys(x)) if (!['horizon', 'kind', 'body', 'ttl'].includes(k)) no(c, path + '.' + k, 'unknown_field');
  if (!['act', 'effect', 'fact'].includes(x.kind)) { no(c, path + '.kind', 'not_allowed_in_rule', x.kind); return undefined; }
  const H = KIND_HORIZONS[x.kind];
  const out = { horizon: H.includes(x.horizon) ? x.horizon : (x.horizon !== undefined && rep(c, path + '.horizon', 'horizon', x.horizon, H[0], x.kind + ' lives at ' + H.join('/')), H[0]), kind: x.kind };
  if (!isObj(x.body)) { no(c, path + '.body', 'missing'); return out; }
  const saved = { t: c.template, i: c.intent }; c.template = true; c.intent = null;
  out.body = checkBody(x.kind, x.body, path + '.body', c, { kind: 'engine', id: 'rules' });
  c.template = saved.t; c.intent = saved.i;
  if (x.ttl !== undefined) { const lim = TTL[out.horizon]; if (lim && typeof x.ttl === 'number' && x.ttl > 0) out.ttl = Math.min(lim.max, x.ttl); }
  return out;
}

/* ---------------------------------------------------------------- per-kind checks */
function postAct(b, path, c) {
  const w = c.world; if (!w || c.template) return;
  if (b.op === 'go') {
    const to = refId(b.to), from = w.body.station;
    if (to === from) { no(c, path + '.to', 'already_there', b.to); return; }
    if (from && !adjacent(w, from, to)) {
      const s = stepToward(w, to);
      if (!s) { no(c, path + '.to', 'unreachable_station', b.to); return; }
      rep(c, path + '.to', 'step', b.to, 'station:' + s, 'not adjacent: first station on the way'); b.to = 'station:' + s;
    }
  }
}
function postEffect(b, path, c) {
  const w = c.world, B = c.B;
  if (b.op !== 'thing.place') return;
  // the size: the player's request is the reference, else the budget
  const span = spanOf(b.shapes), want = c.intent && c.intent.verb === 'make' && pick(c.intent, 'params.size_m');
  let target = null, why = '';
  if (want) { const t = Math.min(B.size_hard_max_m, want); if (span > t * 1.25 || span < t * 0.8) { target = t; why = `the player asked for ${want} m`; } }
  else if (span > B.size_max_m) { target = B.size_max_m; why = `span over ${B.size_max_m} m`; }
  if (target) {
    const k = target / span;
    b.shapes = b.shapes.map(s => Object.assign({}, s, { p: s.p.map(x => round(x * k)), size: s.size.map(x => round(Math.max(0.01, x * k))) }));
    rep(c, path + '.shapes', k < 1 ? 'shrink' : 'grow', span, spanOf(b.shapes), why);
  }
  const wantKg = c.intent && pick(c.intent, 'params.mass_kg');
  if (wantKg && b.mass_kg !== undefined && (b.mass_kg > wantKg * 2 || b.mass_kg < wantKg / 2)) { rep(c, path + '.mass_kg', 'replace', b.mass_kg, wantKg, `the player asked for ${wantKg} kg`); b.mass_kg = wantKg; }
  if (!w || c.template) return;
  // reach: a thing is placed within the current station's reach
  const s = station(w), d = Math.hypot(b.offset[0], b.offset[1]);
  if (s && b.at === 'body' && d > s.reach_m) { const k = s.reach_m / d, o = b.offset.map(x => round(x * k)); rep(c, path + '.offset', 'clamp', b.offset, o, `station reach ${s.reach_m} m`); b.offset = o; }
  // unique id
  if (w.things[b.id] || c.pendingThings.includes(b.id)) { let n = 2; while (w.things[b.id + '-' + n]) n++; rep(c, path + '.id', 'replace', b.id, b.id + '-' + n, 'id already used'); b.id = b.id + '-' + n; }
  // budget: things and shapes; the oldest expirable thing makes room (the engine's recycling), else refusal
  const L = liveThings(w).filter(t => !t.fixed);
  const evict = [];
  let n = L.length, shapes = liveThings(w).reduce((a, t) => a + t.shapes.length, 0);
  const cand = L.filter(t => t.horizon !== 'story').sort((x, y) => x.tx - y.tx);
  while ((n >= B.things_max || shapes + b.shapes.length > B.shapes_max) && cand.length) { const t = cand.shift(); evict.push(t.id); n--; shapes -= t.shapes.length; }
  if (n >= B.things_max || shapes + b.shapes.length > B.shapes_max) { no(c, path, 'over_budget'); return; }
  if (evict.length) { rep(c, path, 'evict', undefined, evict, 'budget: oldest scene things make room'); c.evict = evict; }
}
function postFact(b, path, c, author) {
  if (b.certainty === undefined) b.certainty = author.kind === 'model' ? 0.7 : author.kind === 'player' ? 0.9 : 1;
  if (author.kind === 'player' && !b.commit) no(c, path + '.commit', 'missing');
}
function postRule(b, path, c, author) {
  if (author.kind === 'player' && !b.commit) { no(c, path + '.commit', 'missing'); return; }
  // a rule never triggers itself (§7.4)
  for (const tp of b.then || []) {
    if (!tp || !tp.body) continue;
    for (const [ev, data] of emitsOf(tp.kind, tp.body)) {
      if (ev !== b.when.event) continue;
      const m = b.when.match || {};
      // statically certain only for equality tests; comparators are left to the runtime guard (cycle, max_fires)
      const clash = Object.entries(m).every(([k, x]) => !isObj(x) && (data[k] === undefined || data[k] === x));
      if (clash) { no(c, path + '.then', 'self_trigger', ev); return; }
    }
  }
  const w = c.world; if (!w || c.template) return;
  const ex = w.rules[b.id];
  if (ex && live(ex, w.clock.t) && !(ex.author.kind === author.kind && ex.author.id === author.id)) { no(c, path + '.id', 'id_taken', b.id); return; }
  const n = Object.values(w.rules).filter(r => r.horizon === c.horizon && live(r, w.clock.t)).length;
  if (!ex && n >= (c.horizon === 'story' ? c.B.rules_story_max : c.B.rules_scene_max)) no(c, path, 'over_budget');
}
function postCancel(b, path, c, author) {
  const w = c.world; if (!w) return;
  const m = /^(rule|tx|commit):(.+)$/.exec(b.target);
  if (!m) { no(c, path + '.target', 'bad_ref', b.target); return; }
  const owner = m[1] === 'rule' ? w.rules[m[2]] && w.rules[m[2]].author
    : m[1] === 'commit' ? w.commitments[m[2]] && w.commitments[m[2]].author
    : (Object.values(w.things).find(t => String(t.tx) === m[2]) || w.facts.find(f => String(f.tx) === m[2]) || {}).author;
  if (!owner) { no(c, path + '.target', 'unknown_target', b.target); return; }
  if (!['engine', 'creator'].includes(author.kind) && !(owner.kind === author.kind && owner.id === author.id)) no(c, path + '.target', 'not_owner', b.target);
}
function postIntent(b, path, c) {
  const w = c.world;
  if (w && !w.langs.includes(b.lang)) { rep(c, path + '.lang', 'replace', b.lang, w.langs[0], 'not a story language'); b.lang = w.langs[0]; }
  if (b.verb === 'commit' && (!b.condition || !b.behaviour)) no(c, path, 'commit_needs_condition_and_behaviour');
}

/* Absolute constraints (`!!`, §8.4): a matching transaction is rejected, whatever its author. */
function checkConstraints(tx, w, c) {
  if (!w) return;
  for (const k of Object.values(w.constraints || {})) {
    if (!constraintMatches(k, tx, w)) continue;
    no(c, 'body', 'constraint', k.id);
  }
}
export function constraintMatches(k, tx, w) {
  const f = k.forbid || {};
  if (f.kind && f.kind !== tx.kind) return false;
  if (f.op && f.op !== tx.body.op) return false;
  for (const [key, val] of Object.entries(f.fields || {})) if (tx.body[key] !== val) return false;
  return (k.if || []).every(cd => evalCond(w, cd));
}
