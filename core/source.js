/* PDL source (docs/pdl-spec.md §2): plain-text files of statements with a strength, from tendency to absolute.
   The grammar is the one the story pack is written in (stories/, patterns/): a `# id — title` header, `@key value` metadata,
   `## section`s, one statement per line with its `{id}` at the end.
     parseSource(text, { file })      → { id, title, meta, statements, errors }       one file, pure
     serializeSource(doc)             → text                                           round trip (comments dropped)
     compilePack(pack, library)       → { principles, scene, errors, warnings }        layers merged with provenance,
                                        patterns instantiated, explicit rules and absolutes compiled to canonical JSON
   Prose `!` and `!!` become stubs "to_compile" (a model fills them at pack build, a creator approves: attachCompiled,
   approve). `~`, `?`, `>` and `x` stay principles: fed to the model tiers, audited (auditSummary).
   No I/O here (P21): the store adapter (tools/pack-check.mjs loadPack / loadLibrary) reads the files. */
import { ACT, EFFECT, KIND_HORIZONS } from './vocab.js';
import { validate } from './pdl.js';

const MARKS = { '!!': 'absolute', '!': 'hard', '~': 'tendency', '?': 'open', '>': 'example', x: 'counter', when: 'hard' };
const PATTERN_WORDS = ['role', 'param', 'need', 'bind', 'set', 'hint', 'variation'];
const ID_END = /\s*\{([A-Za-z0-9_.\-]+)\}\s*$/;
const EXAMPLE = /^(?:\[([^\]]*)\]\s*)?(.*)$/;

/* ---------------------------------------------------------------- one file */
export function parseSource(text, { file = 'inline.pdl' } = {}) {
  const doc = { file, id: null, title: '', meta: {}, statements: [], errors: [] };
  let section = '', n = {};
  const err = (line, why) => doc.errors.push({ file, line, why });
  String(text).split(/\r?\n/).forEach((raw, i) => {
    const line = i + 1; let s = raw.trim();
    if (!s || s.startsWith('//')) return;
    if (/^#\s/.test(s)) {
      if (doc.id) return err(line, 'second_header');
      const h = /^#\s+([A-Za-z0-9_.\-]+)\s*(?:[—–-]\s*(.*))?$/.exec(s);
      if (!h) return err(line, 'bad_header');
      doc.id = h[1]; doc.title = (h[2] || '').trim(); return;
    }
    if (!doc.id) return err(line, 'missing_header');
    if (s.startsWith('@')) { for (const m of s.matchAll(/@([\w-]+)\s+([^@]*)/g)) doc.meta[m[1]] = m[2].trim(); return; }
    if (s.startsWith('## ')) { section = s.slice(3).trim(); return; }
    let id = null; const idm = ID_END.exec(s);
    if (idm) { id = idm[1]; s = s.slice(0, idm.index).trim(); }
    const st = { id, section, source: { file, line } };
    let m;
    if (s.startsWith('!! ')) Object.assign(st, { mark: '!!', text: s.slice(3).trim() });
    else if (s.startsWith('! ')) Object.assign(st, { mark: '!', text: s.slice(2).trim() });
    else if ((m = /^~(\d*\.?\d+)?\s+(.*)$/.exec(s))) {
      Object.assign(st, { mark: '~', text: m[2].trim() });
      if (m[1] !== undefined) { st.weight = +m[1]; if (!(st.weight >= 0 && st.weight <= 1)) err(line, 'weight_out_of_range'); }
    } else if (s.startsWith('? ')) {
      const b = s.slice(2), k = b.indexOf(' -- ');
      Object.assign(st, { mark: '?', text: (k < 0 ? b : b.slice(0, k)).trim() });
      if (k >= 0) st.note = b.slice(k + 4).trim(); else err(line, 'open_question_without_note');
    } else if (s.startsWith('> ') || s.startsWith('x ')) {
      const mark = s[0], e = EXAMPLE.exec(s.slice(2).trim());
      const lines = {}; let why;
      for (const p of e[2].split(/\s*\|\s*/)) { const q = /^([a-z]{2}|why):\s*(.*)$/.exec(p); if (!q) continue; if (q[1] === 'why') why = q[2]; else lines[q[1]] = q[2]; }
      if (!Object.keys(lines).length) { err(line, 'example_without_lines'); return; }
      Object.assign(st, { mark, context: e[1] || '', lines }); if (why) st.why = why;
      if (mark === 'x' && !why) err(line, 'counter_example_without_why');
      if (mark === '>' && why) err(line, 'example_with_why');
    } else if (s.startsWith('when ')) Object.assign(st, { mark: 'when', text: s });
    else if ((m = /^gauge\s+(.*)$/.exec(s))) Object.assign(st, { mark: 'gauge', text: m[1].trim() });
    else if ((m = /^(role|param|need|bind|set|hint|variation)\s+(.*)$/.exec(s))) Object.assign(st, { mark: m[1], text: m[2].trim() });
    else { err(line, 'unknown_line'); return; }
    if (!st.id) { n[section] = (n[section] || 0) + 1; st.id = `${doc.id}.${section || 'top'}.${n[section]}`; st.auto_id = true; }
    doc.statements.push(st);
  });
  if (!doc.id) doc.errors.push({ file, line: 0, why: 'empty_or_headerless' });
  return doc;
}

export function serializeSource(doc) {
  const out = [`# ${doc.id}${doc.title ? ' — ' + doc.title : ''}`];
  const meta = Object.entries(doc.meta).map(([k, v]) => `@${k} ${v}`).join('  ');
  if (meta) out.push(meta);
  let section = '';
  for (const s of doc.statements) {
    if (s.section !== section) { out.push('', `## ${s.section}`); section = s.section; }
    const id = s.auto_id ? '' : ` {${s.id}}`;
    if (s.mark === '>' || s.mark === 'x') {
      const parts = Object.entries(s.lines).map(([l, t]) => `${l}: ${t}`); if (s.why) parts.push(`why: ${s.why}`);
      out.push(`${s.mark} ${s.context ? `[${s.context}] ` : ''}${parts.join(' | ')}${id}`);
    } else if (s.mark === '~') out.push(`~${s.weight !== undefined ? s.weight : ''} ${s.text}${id}`);
    else if (s.mark === '?') out.push(`? ${s.text}${s.note !== undefined ? ' -- ' + s.note : ''}${id}`);
    else if (s.mark === 'when') out.push(`${s.text}${id}`);
    else out.push(`${s.mark} ${s.text}${id}`);
  }
  return out.join('\n') + '\n';
}

/* ---------------------------------------------------------------- call grammar shared by rules, absolutes and gauges
   when <event-call> [once] [max N] [cooldown Ns] [if <cond> (and <cond>)*] -> <action-call> (, <action-call>)*
   call := [not] name [ '(' arg (, arg)* ')' ]                                                           */
function splitTop(s, sep = ',') {
  const out = []; let d = 0, q = false, cur = '';
  for (const ch of s) { if (ch === '"') q = !q; if (!q && ch === '(') d++; if (!q && ch === ')') d--; if (!q && ch === sep && !d) { out.push(cur); cur = ''; } else cur += ch; }
  if (cur.trim()) out.push(cur);
  return out.map(x => x.trim()).filter(Boolean);
}
export function parseCall(s) {
  const m = /^(not\s+)?([A-Za-z_][\w.]*)\s*(?:\((.*)\))?$/.exec(String(s).trim());
  if (!m) return null;
  return { not: !!m[1], name: m[2], args: m[3] !== undefined ? splitTop(m[3]) : [] };
}
export function parseRuleText(text) {
  const arrow = text.indexOf('->');
  if (!text.startsWith('when ') || arrow < 0) return { error: 'rule needs "when … -> …"' };
  let left = text.slice(5, arrow).trim(); const right = text.slice(arrow + 2).trim();
  const ev = /^([A-Za-z_][\w.]*)(\([^)]*\))?/.exec(left);
  if (!ev) return { error: 'rule has no event' };
  const event = parseCall(ev[0]); left = left.slice(ev[0].length).trim();
  let condStr = ''; const ifAt = left.search(/(^|\s)if\s/);
  if (ifAt >= 0) { condStr = left.slice(ifAt).replace(/^\s*if\s+/, ''); left = left.slice(0, ifAt); }
  const limits = {}; let m;
  if (/\bonce\b/.test(left)) { limits.max_fires = 1; left = left.replace(/\bonce\b/, ''); }
  if ((m = /\bmax\s+(\S+)/.exec(left))) { limits.max_fires = Number(m[1]); left = left.replace(m[0], ''); }
  if ((m = /\bcooldown\s+(\d+(?:\.\d+)?)s\b/.exec(left))) { limits.cooldown_s = Number(m[1]); left = left.replace(m[0], ''); }
  if (left.trim()) return { error: `unexpected "${left.trim()}" before if/->` };
  const conditions = condStr ? condStr.split(/\s+and\s+/).map(parseCall) : [];
  const actions = splitTop(right).map(parseCall);
  if (conditions.some(c => !c) || actions.some(a => !a) || !actions.length) return { error: 'malformed condition or action' };
  return { event, conditions, actions, limits };
}

/* The pack's names → canonical JSON (§2.4 table). ctx: { things: Set, clocks: { name: state path } }. */
const num = (v, w) => { const x = Number(v); if (v === '' || v === undefined || Number.isNaN(x)) throw new Error(`${w}: "${v}" is not a number`); return x; };
const refOf = (v, ctx) => v === 'body' || /^(thing|station|dir):/.test(v) ? v : ctx.things && ctx.things.has(v) ? 'thing:' + v : 'station:' + v;
const clockPath = (c, ctx) => { const p = (ctx.clocks || {})[c]; if (!p) throw new Error(`unknown clock "${c}"`); return p; };
const below = x => x > 0 ? { lt: x } : { le: x };

export function compileEvent(call, ctx = {}) {
  const a = call.args, w = call.name;
  switch (w) {
    case 'session.start': return { when: { event: 'session.started' } };
    case 'station.entered': case 'station.left': return { when: { event: w, match: { id: a[0] } } };
    case 'station.dwell': return { when: { event: 'clock.tick', match: { station: a[0], dwell_s: { ge: num(a[1], w) } } } };
    case 'clock.below': { const p = clockPath(a[0], ctx), f = p.split('.')[1]; return { when: { event: p.split('.')[0] + '.changed', match: { [f]: below(num(a[1], w)) } } }; }
    case 'clock.every': return { when: { event: 'clock.tick', match: { t: { ge: num(a[0], w) } } }, limits: { cooldown_s: num(a[0], w), max_fires: 20 } };
    case 'time.elapsed': return { when: { event: 'clock.tick', match: { t: { ge: num(a[0], w) } } } };
    case 'look.at': return { when: { event: 'look.at', match: Object.assign({ target: refOf(a[0], ctx) }, a[1] !== undefined ? { s: { ge: num(a[1], w) } } : {}) } };
    case 'said.matches': return { when: { event: 'intent.heard', match: { class: a[0] } } };
    case 'said.loud': return { when: { event: 'intent.heard', match: { loud: true } } };
    case 'voice.silent': return { when: { event: 'clock.tick', match: { silent_s: { ge: num(a[0], w) } } } };
    case 'beat.enter': return { when: { event: 'beat.entered', match: { id: a[0] } } };
    case 'fact.established': return { when: { event: 'fact.added', match: { subject: a[0], predicate: 'established' } } };
    case 'sound': return { when: { event: 'sound.played', match: a[0] ? { cue: a[0] } : {} } };
    case 'gauge': return { when: { event: 'gauge.changed', match: Object.assign({ id: a[0] }, a[1] ? { word: a[1] } : {}) } };
  }
  throw new Error(`unknown event "${w}"`);
}
export function compileCond(call, ctx = {}) {
  const a = call.args, w = call.name; let c;
  switch (w) {
    case 'fact': c = { fact: { subject: a[0], predicate: 'established' } }; break;
    case 'beat': c = { beat: { id: a[0] } }; break;
    case 'at': c = { station: { id: a[0] } }; break;
    case 'within_reach': c = { reach: { target: refOf(a[0], ctx) } }; break;
    case 'ending.any': c = { ending: {} }; break;
    case 'ending': c = { ending: { id: a[0] } }; break;
    case 'clock.below': c = { state: Object.assign({ path: clockPath(a[0], ctx) }, below(num(a[1], w))) }; break;
    case 'promised': c = { promised: { class: a[0] } }; break;
    case 'gauge': c = { gauge: Object.assign({ id: a[0] }, a[1] ? { word: a[1] } : {}) }; break;
    case 'near': c = { near: { a: refOf(a[0], ctx), b: refOf(a[1], ctx), within_m: num(a[2], w) } }; break;
    case 'scene': c = { scene: { id: a[0] } }; break;
    default: throw new Error(`unknown condition "${w}"`);
  }
  return call.not ? { not: c } : c;
}
export function compileAction(call, ctx = {}) {
  const a = call.args, w = call.name;
  const T = (horizon, kind, body) => ({ horizon, kind, body });
  switch (w) {
    case 'say': return T('now', 'act', { op: 'say', ref: a[0] });
    case 'reveal': return T('story', 'fact', { subject: a[0], predicate: 'established', value: true });
    case 'beat': return T('story', 'effect', { op: 'beat.set', id: a[0] });
    case 'ending': return T('story', 'effect', { op: 'story.end', id: a[0] });
    case 'go': return T('now', 'act', { op: 'go', to: 'station:' + a[0] });
    case 'light.raise': return T('story', 'effect', { op: 'light.raise', degrees: num(a[0], w) });
    case 'sound': return T('now', 'effect', Object.assign({ op: 'sound.play', cue: a[0] }, a[1] ? { at: refOf(a[1], ctx) } : {}));
    case 'image.degrade': return T('story', 'effect', { op: 'camera.set', degrade: num(a[0], w) });
    case 'speech.volume': return T('scene', 'effect', { op: 'speech.set', volume: a[0] });
    case 'speech.shorten': return T('story', 'effect', { op: 'speech.set', shorten: num(a[0], w) });
    case 'body.posture': return T('now', 'act', { op: 'posture', height: num(a[0], w) });
    case 'body.stop': return T('now', 'act', { op: 'stop' });
    case 'camera.off': return T('story', 'effect', { op: 'camera.set', off: true });
    case 'fact': return T('story', 'fact', { subject: a[0], predicate: a[1], value: a[2] === undefined ? true : a[2] });
  }
  // any act or effect op of the vocabulary, with its primary field (stop(), posture(0.5), sound.play(cue))
  const kind = ACT[w] ? 'act' : EFFECT[w] ? 'effect' : null;
  if (!kind) throw new Error(`unknown action "${w}"`);
  const sch = (kind === 'act' ? ACT : EFFECT)[w], body = { op: w };
  if (a[0] !== undefined) { const x = Number(a[0]); body[sch.primary] = a[0] !== '' && !Number.isNaN(x) ? x : a[0]; }
  return T('now', kind, body);
}
/* A `when … -> …` statement → a canonical rule body. Default limits: max_fires 1 (rules must ask to fire again). */
export function compileRule(id, text, ctx = {}) {
  const r = parseRuleText(text);
  if (r.error) throw new Error(r.error);
  const ev = compileEvent(r.event, ctx);
  const body = { id, when: ev.when };
  const ifs = r.conditions.map(c => compileCond(c, ctx)); if (ifs.length) body.if = ifs;
  body.then = r.actions.map(c => compileAction(c, ctx));
  body.limits = Object.assign({ max_fires: 1, cooldown_s: 0 }, ev.limits || {}, r.limits);
  return body;
}
/* `!! never <action-call> [if <cond> and …]` → constraint { forbid { kind, op, fields }, if } */
export function compileNever(text, ctx = {}) {
  const s = text.replace(/^never\s+/, ''), k = s.search(/\sif\s/);
  const t = compileAction(parseCall(k < 0 ? s : s.slice(0, k)), ctx);
  const fields = Object.assign({}, t.body); delete fields.op;
  const out = { forbid: Object.assign({ kind: t.kind }, t.body.op ? { op: t.body.op } : {}, Object.keys(fields).length ? { fields } : {}) };
  if (k >= 0) out.if = s.slice(k).replace(/^\s*if\s+/, '').split(/\s+and\s+/).map(c => compileCond(parseCall(c), ctx));
  return out;
}
/* `gauge <id> "<label>": rises <event-call> by n [if …]; fades n/min; words medium high` */
export function compileGauge(text, ctx = {}) {
  const m = /^([a-z][a-z0-9_.-]*)\s+"([^"]*)"\s*:\s*(.*)$/.exec(text);
  if (!m) throw new Error('gauge needs: id "label": clauses');
  const g = { id: m[1], label: m[2], rises: [], fades: { per_minute: 0 }, words: { medium: 0.34, high: 0.67 } };
  for (const cl of m[3].split(/\s*;\s*/).filter(Boolean)) {
    let q;
    if ((q = /^rises\s+(.+?)\s+by\s+(\d+(?:\.\d+)?)(?:\s+if\s+(.+))?$/.exec(cl))) {
      const r = { on: compileEvent(parseCall(q[1]), ctx).when, by: +q[2] };
      if (q[3]) r.if = q[3].split(/\s+and\s+/).map(c => compileCond(parseCall(c), ctx));
      g.rises.push(r);
    } else if ((q = /^fades\s+(\d+(?:\.\d+)?)\/min$/.exec(cl))) g.fades.per_minute = +q[1];
    else if ((q = /^words\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)$/.exec(cl))) g.words = { medium: +q[1], high: +q[2] };
    else throw new Error(`bad gauge clause "${cl}"`);
  }
  return g;
}

/* ---------------------------------------------------------------- statements → principle records */
function scopeOf(doc) {
  const s = doc.meta.scope || 'story';
  return s === 'character' ? 'character:' + doc.id : s;
}
/* One parsed file → principle records (provenance from the file and its layer). */
export function principlesOf(doc, { layer, author, pack, ctx = {} } = {}) {
  const out = [], errors = [];
  const scope = scopeOf(doc), horizon = doc.meta.horizon || (scope.startsWith('scene') ? 'scene' : 'story');
  for (const st of doc.statements) {
    if (PATTERN_WORDS.includes(st.mark)) continue;
    const p = { id: st.id, strength: st.mark === 'gauge' ? 'gauge' : MARKS[st.mark],
      form: st.mark === 'when' || st.mark === 'gauge' || (st.mark === '!!' && /^never\s/.test(st.text)) ? 'explicit' : 'prose',
      scope, horizon, section: st.section, lang: doc.meta.lang || 'en', author: { kind: 'creator', id: doc.meta.author || author || 'unknown' },
      layer: doc.meta.layer || layer || 'base', pack: pack || null, doc: doc.id, doc_kind: doc.meta.kind || null, source: st.source };
    for (const k of ['text', 'weight', 'note', 'context', 'lines', 'why', 'auto_id']) if (st[k] !== undefined) p[k] = st[k];
    if (p.strength === 'hard' || p.strength === 'absolute' || p.strength === 'gauge') {
      const kind = p.strength === 'hard' ? 'rule' : p.strength === 'absolute' ? 'constraint' : 'gauge';
      p.compiled = { kind, status: 'to_compile' };
      if (p.form === 'explicit') {
        try {
          const body = kind === 'rule' ? compileRule(st.id, st.text, ctx) : kind === 'constraint' ? compileNever(st.text, ctx) : compileGauge(st.text, ctx);
          p.compiled = { kind, status: 'compiled', body, by: 'code' };
          if (kind === 'gauge' && st.auto_id) p.id = body.id;
        } catch (e) { p.compiled = { kind, status: 'error', error: e.message }; errors.push({ file: st.source.file, line: st.source.line, why: 'compile_error', message: e.message, id: st.id }); }
      }
    }
    out.push(p);
  }
  return { principles: out, errors };
}

/* ---------------------------------------------------------------- patterns */
export function readPattern(doc) {
  const p = { id: doc.id, roles: {}, params: {}, statements: [], errors: [] };
  for (const st of doc.statements) {
    if (st.mark === 'role' || st.mark === 'need') {
      const m = /^([\w-]+)(\*?)\s*:\s*([\w-]+)\s*:\s*(.*)$/.exec(st.text);
      if (!m) { p.errors.push({ file: doc.file, line: st.source.line, why: 'bad_role' }); continue; }
      p.roles[m[1]] = { many: !!m[2], type: m[3], need: st.mark === 'need', description: m[4] };
    } else if (st.mark === 'param') {
      const m = /^([\w-]+)\s*=\s*(\S+)/.exec(st.text);
      if (m) p.params[m[1]] = m[2]; else p.errors.push({ file: doc.file, line: st.source.line, why: 'bad_param' });
    } else if (['when', '!!', '!', '~', '?'].includes(st.mark) && st.section !== 'summary') p.statements.push(st);
  }
  return p;
}
const subst = (text, bind, params) => text.replace(/\$([\w-]+)(?:\.([\w-]+))?/g, (all, name, attr) => {
  if (name in params && !attr) return params[name];
  const b = bind[name]; if (!b) return all;
  return attr ? (b.attrs[attr] ?? all) : b.value;
});
/* An instance doc bound to a pattern → its statements, expanded once per binding of a many-role. */
export function instantiate(instance, pattern) {
  const errors = [], bindings = {}, params = Object.assign({}, pattern.params);
  for (const st of instance.statements) {
    if (st.mark === 'bind') {
      const m = /^([\w-]+)\s*=\s*(\S+)(.*)$/.exec(st.text);
      if (!m || !pattern.roles[m[1]]) { errors.push({ file: instance.file, line: st.source.line, why: 'unknown_role', value: m && m[1] }); continue; }
      (bindings[m[1]] = bindings[m[1]] || []).push({ value: m[2], attrs: Object.fromEntries([...m[3].matchAll(/([\w-]+)=(\S+)/g)].map(x => [x[1], x[2]])) });
    } else if (st.mark === 'set') {
      const m = /^([\w-]+)\s*=\s*(\S+)/.exec(st.text);
      if (!m || !(m[1] in pattern.params)) errors.push({ file: instance.file, line: st.source.line, why: 'unknown_param' }); else params[m[1]] = m[2];
    }
  }
  for (const name of Object.keys(pattern.roles)) if (!(bindings[name] || []).length) errors.push({ file: instance.file, line: 0, why: 'unbound_role', value: name });
  const statements = pattern.statements.flatMap(st => {
    const many = Object.keys(pattern.roles).filter(r => pattern.roles[r].many && new RegExp(`\\$${r}\\b`).test(st.text));
    const combos = many.length ? (bindings[many[0]] || []).map((b, i) => ({ [many[0]]: b, i })) : [{ i: -1 }];
    return combos.map(c => {
      const single = Object.fromEntries(Object.entries(bindings).map(([k, v]) => [k, v[0]]));
      const text = subst(st.text, Object.assign({}, single, c), params);
      const base = st.auto_id ? st.id.split('.').slice(1).join('.') : st.id;
      if (/\$[\w-]/.test(text)) errors.push({ file: instance.file, line: st.source.line, why: 'unbound_variable', value: text });
      const out = Object.assign({}, st, { id: `${instance.id}.${base}${c.i >= 0 ? '.' + (c.i + 1) : ''}`, text, pattern: pattern.id, instance: instance.id });
      delete out.auto_id;
      return out;
    });
  });
  return { statements, bindings, params, errors };
}

/* ---------------------------------------------------------------- a whole pack
   pack: { manifest, texts: { file: text }, place, stations, beats, lines: { lang: { lines } } } (tools/pack-check.mjs loadPack)
   library: { pattern-id: text } (loadLibrary). Returns principles (merged, in order, with provenance and overrides),
   the scene for createWorld, and errors. Same id in a later layer replaces the earlier one and records it. */
export function compilePack(pack, library = {}) {
  const M = pack.manifest || {}, errors = [], warnings = [];
  const things = new Set((pack.place && pack.place.objets || []).map(o => o.id));
  const ctx = { things, clocks: Object.fromEntries(Object.keys(M.clocks || {}).filter(k => k === 'battery').map(k => [k, 'camera.battery'])) };
  const lib = {};
  for (const [id, t] of Object.entries(library)) { const d = parseSource(t, { file: `patterns/${id}.pdl` }); errors.push(...d.errors); const p = readPattern(d); errors.push(...p.errors); lib[p.id] = p; }
  const merged = new Map();
  for (const layer of M.layers || []) for (const f of layer.files || []) {
    if (pack.texts[f] === undefined) { errors.push({ file: f, line: 0, why: 'missing_file' }); continue; }
    const doc = parseSource(pack.texts[f], { file: f }); errors.push(...doc.errors);
    const opts = { layer: layer.id, author: layer.author, pack: M.id, ctx };
    let recs;
    if (doc.meta.kind === 'pattern-instance') {
      const pat = lib[doc.meta.pattern];
      if (!pat) { errors.push({ file: f, line: 0, why: 'unknown_pattern', value: doc.meta.pattern }); continue; }
      const inst = instantiate(doc, pat); errors.push(...inst.errors);
      const r = principlesOf(Object.assign({}, doc, { statements: inst.statements }), opts); errors.push(...r.errors);
      recs = r.principles.map(p => Object.assign(p, { pattern: pat.id, instance: doc.id }));
    } else { const r = principlesOf(doc, opts); errors.push(...r.errors); recs = r.principles; }
    for (const p of recs) {
      const prev = merged.get(p.id);
      if (prev && prev.layer === p.layer) { errors.push({ file: f, line: p.source.line, why: 'duplicate_id', value: p.id }); continue; }
      if (prev) p.overrides = [...(prev.overrides || []), { layer: prev.layer, author: prev.author, source: prev.source }];
      merged.set(p.id, p);
    }
  }
  return { pack: M.id, principles: [...merged.values()], scene: sceneOf(pack), errors, warnings };
}

/* The place part of a pack → the scene createWorld takes (stations, things, cues, lines, battery clock, beats). */
export function sceneOf(pack) {
  const M = pack.manifest || {}, P = pack.place || {}, S = pack.stations || {}, B = pack.beats || {};
  const span = fs => { const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9]; for (const s of fs || []) for (let i = 0; i < 3; i++) { const p = (s.p || [0, 0, 0])[i], t = (s.taille || [0, 0, 0])[i] / 2; lo[i] = Math.min(lo[i], p - t); hi[i] = Math.max(hi[i], p + t); } return (fs || []).length ? Math.round(Math.max(...hi.map((h, i) => h - lo[i])) * 100) / 100 : 0; };
  const lines = {};
  for (const [lang, file] of Object.entries(pack.lines || {})) for (const [k, v] of Object.entries((file && file.lines) || {})) (lines[k] = lines[k] || {})[lang] = v;
  const bat = M.clocks && M.clocks.battery;
  return {
    id: M.id, langs: M.languages || ['en'], author: (M.authors || [])[0] && M.authors[0].id, scene: (B.beats || [])[0] ? B.beats[0].id : 'start', start: S.start,
    stations: (S.stations || []).map(s => Object.assign({ id: s.id, pos: [s.side_m || 0, s.along_m || 0], heading: typeof s.heading === 'number' ? s.heading : 0, beat: s.beat,
      within: s.within_reach || [], edges: (s.connects || []).map(c => Object.assign({ to: c.to, cost_s: c.cost_s || 0 }, c.via ? { via: c.via } : {}, c.establishes ? { establishes: c.establishes } : {})) },
      s.posture !== undefined ? { posture: s.posture } : {})),
    things: (P.objets || []).map(o => ({ id: o.id, name: o.nom || o.id, pos: [o.cote || 0, o.devant || 0], size_m: span(o.formes) })),
    camera: bat ? { battery: bat.start ?? 1, drain_per_s: bat.runs_out_s ? Math.round(1e7 / bat.runs_out_s) / 1e7 : 0 } : {},
    vocab: { materials: [], cues: Object.fromEntries(Object.entries(M.cues || {}).map(([k]) => [k, { recipe: k }])), lines },
    story: { beat: (B.beats || [])[0] ? B.beats[0].id : null, beats: (B.beats || []).map(b => b.id), endings: (B.endings || []).map(e => e.id) },
  };
}

/* ---------------------------------------------------------------- scope, compilation by a model, audit */
/* Soft principles a model call must see (§2.7): tendencies and open questions of the story, the place, the scene and the
   speaking character. */
export function inScope(principles, { character, scene } = {}) {
  return principles.filter(p => (p.strength === 'tendency' || p.strength === 'open') &&
    (p.scope === 'story' || p.scope === 'place' || p.scope === 'scene' || (character && p.scope === 'character:' + character) || (scene && p.scope === 'scene:' + scene)));
}
/* A model's compiled form for a prose `!` or `!!` (pack build): validated, then proposed; a creator approves it. */
export function attachCompiled(p, body, { by = 'model', world = null } = {}) {
  const kind = p.strength === 'hard' ? 'rule' : 'constraint';
  if (kind === 'rule') {
    const r = validate({ author: p.author, horizon: p.horizon, kind: 'rule', body: Object.assign({ id: p.id }, body) }, world);
    if (r.status === 'rejected') return { ok: false, reasons: r.reasons };
    body = r.tx.body;
  } else if (!body || !body.forbid || !KIND_HORIZONS[body.forbid.kind]) return { ok: false, reasons: [{ why: 'bad_constraint' }] };
  p.compiled = { kind, status: 'proposed', body, by };
  return { ok: true };
}
export function approve(p, approver) { if (p.compiled && p.compiled.status === 'proposed') { p.compiled.status = 'approved'; p.compiled.approved_by = approver; return true; } return false; }

/* The judge is a model call made elsewhere (ModelPort.decide). Interface:
     judge({ principle, entries, examples }) → Promise<[{ type: 'audit', principle, ref_seq, relevant, respected, note?, judge }]>
   auditSummary aggregates the audit entries of a journal, per principle. */
export function auditSummary(journal) {
  const E = Array.isArray(journal) ? journal : journal.entries, out = {};
  for (const a of E.filter(e => e.type === 'audit')) {
    const s = out[a.principle] = out[a.principle] || { relevant: 0, respected: 0, broken: 0, rate: null, breaks: [] };
    if (!a.relevant) continue;
    s.relevant++;
    if (a.respected === true) s.respected++; else if (a.respected === false) { s.broken++; s.breaks.push(a.ref_seq); }
  }
  for (const s of Object.values(out)) s.rate = s.relevant ? Math.round(s.respected / s.relevant * 100) / 100 : null;
  return out;
}
