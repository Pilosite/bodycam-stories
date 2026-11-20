/* PDL source (docs/pdl-spec.md §2): plain-text statements with a strength, from tendency to absolute.
   parseSource(text) → { pack, statements: [principle], errors }. Explicit `when … -> …` rules and `!! never …` absolutes
   compile here, deterministically; prose `!` and `!!` become stubs "to_compile" (a model fills them at pack build, a creator
   approves); `~`, `?` and examples stay principles. Also: serializeSource, inScope, attachCompiled, approve, auditSummary. */
import { ACT, EFFECT, EVENTS, STATE_PATHS, KIND_HORIZONS } from './vocab.js';
import { hashString } from './world.js';
import { validate } from './pdl.js';

const STRENGTH = { '!!': 'absolute', '!': 'hard', '~': 'tendency', '?': 'open', when: 'hard' };
const OPS = { '<': 'lt', '<=': 'le', '>': 'gt', '>=': 'ge', '!=': 'ne', contains: 'contains' };
const PATH_ALIAS = { 'clock.battery': 'camera.battery' };
const CALL_ALIAS = { 'image.degrade': ['camera.set', 'degrade'], 'image.shake': ['camera.set', 'shake'] };
const STMT = /^(?:([a-z][a-z0-9_.-]{0,59}):\s+)?(!!|!|~(?:[01](?:\.\d+)?)?|\?|when(?=\s))\s*(.*)$/;
const META = /\s+\{((?:[a-z_]+=[^\s{}]+)(?:\s+[a-z_]+=[^\s{}]+)*)\}\s*$/;

export function parseSource(text, { file = 'inline.pdl' } = {}) {
  const dir = { pack: file.replace(/^.*\//, '').replace(/\.pdl$/, ''), author: 'creator:unknown', layer: 'base', scope: 'story', horizon: null, lang: 'en' };
  const statements = [], errors = [];
  let last = null;
  String(text).split(/\r?\n/).forEach((raw, i) => {
    const n = i + 1, line = raw.replace(/\s+$/, ''), tr = line.trim();
    if (!tr || tr.startsWith('#')) return;
    const att = /^(>|x)\s+(.*)$/.exec(tr);
    if (att && (/^\s/.test(line) || last)) {
      if (!last) { errors.push({ line: n, why: 'example_without_statement' }); return; }
      last.examples.push({ text: att[2], counter: att[1] === 'x' }); return;
    }
    if (/^\s{2,}/.test(line)) {
      if (!last) { errors.push({ line: n, why: 'continuation_without_statement' }); return; }
      last.text += ' ' + tr; if (last.form === 'explicit') recompile(last, errors, n); return;
    }
    if (tr.startsWith('@')) {
      const m = /^@([a-z]+)\s+(\S+)$/.exec(tr);
      if (!m || !(m[1] in dir)) { errors.push({ line: n, why: 'bad_directive' }); return; }
      dir[m[1]] = m[2]; return;
    }
    let body = tr, meta = {};
    const mm = META.exec(body);
    if (mm) { body = body.slice(0, mm.index); for (const kv of mm[1].split(/\s+/)) { const k = kv.indexOf('='); meta[kv.slice(0, k)] = kv.slice(k + 1); } }
    const gm = /^(?:([a-z][a-z0-9_.-]{0,59}):\s+)?gauge\s+([a-z][a-z0-9_.-]{0,59})\s+"([^"]*)"\s*:\s*(.*)$/.exec(body);
    if (gm) {
      const [ak, aid] = (meta.author || dir.author).split(':'), scope = meta.scope || dir.scope;
      const st = { id: gm[2], strength: 'gauge', form: 'explicit', scope, horizon: meta.horizon || dir.horizon || (scope.startsWith('scene:') ? 'scene' : 'story'),
        text: `gauge ${gm[2]} "${gm[3]}": ${gm[4]}`, lang: meta.lang || dir.lang, examples: [], author: { kind: ak, id: aid }, layer: meta.layer || dir.layer, pack: dir.pack, source: { file, line: n } };
      try { st.compiled = { kind: 'gauge', status: 'compiled', body: compileGauge(gm[3], gm[4]), by: 'code' }; }
      catch (e) { st.compiled = { kind: 'gauge', status: 'error', error: e.message }; errors.push({ line: n, why: 'compile_error', message: e.message }); }
      statements.push(st); last = st; return;
    }
    const m = STMT.exec(body);
    if (!m) { errors.push({ line: n, why: 'not_a_statement' }); return; }
    const mark = m[2].startsWith('~') ? '~' : m[2];
    const scope = meta.scope || dir.scope;
    const [ak, aid] = (meta.author || dir.author).split(':');
    const st = {
      id: meta.id || m[1] || null, strength: STRENGTH[mark],
      form: mark === 'when' || (mark === '!!' && /^never\s/.test(m[3])) ? 'explicit' : 'prose',
      weight: mark === '~' ? +(meta.weight || m[2].slice(1) || 0.5) : undefined,
      scope, horizon: meta.horizon || dir.horizon || (scope.startsWith('scene:') ? 'scene' : 'story'),
      text: mark === 'when' ? 'when ' + m[3] : m[3], lang: meta.lang || dir.lang, examples: [],
      author: { kind: ak, id: aid }, layer: meta.layer || dir.layer, pack: dir.pack, source: { file, line: n },
    };
    if (st.weight === undefined) delete st.weight;
    if (!st.id) st.id = 'p-' + hashString(scope + '|' + st.text.replace(/\s+/g, ' ').toLowerCase()).slice(0, 8);
    if (st.strength === 'hard' || st.strength === 'absolute') st.compiled = { kind: st.strength === 'hard' ? 'rule' : 'constraint', status: 'to_compile' };
    if (st.form === 'explicit') recompile(st, errors, n);
    statements.push(st); last = st;
  });
  const ids = new Set();
  for (const s of statements) { if (ids.has(s.id)) errors.push({ line: s.source.line, why: 'duplicate_id', id: s.id }); ids.add(s.id); }
  return { pack: dir.pack, statements, errors };
}

function recompile(st, errors, n) {
  try {
    st.compiled = st.strength === 'absolute'
      ? { kind: 'constraint', status: 'compiled', body: compileNever(st.text, st), by: 'code' }
      : { kind: 'rule', status: 'compiled', body: compileWhen(st.text, st), by: 'code' };
  } catch (e) { st.compiled = { kind: st.strength === 'absolute' ? 'constraint' : 'rule', status: 'error', error: e.message }; errors.push({ line: n, why: 'compile_error', message: e.message }); }
}

/* ---------------------------------------------------------------- explicit rules */
export function compileWhen(text, st = {}) {
  const k = topIndex(text, ' -> ');
  if (k < 0) throw new Error('missing "->"');
  let left = text.slice(0, k).replace(/^when\s+/, '').trim(), right = text.slice(k + 4).trim();
  const limits = { max_fires: 1, cooldown_s: 0 };
  const eat = s => { let m; let again = true;
    while (again) { again = false;
      if ((m = /\s*\bonce$/.exec(s))) { limits.max_fires = 1; s = s.slice(0, m.index); again = true; }
      else if ((m = /\s*\bmax\s+(\d+)$/.exec(s))) { limits.max_fires = +m[1]; s = s.slice(0, m.index); again = true; }
      else if ((m = /\s*\bcooldown\s+(\d+(?:\.\d+)?)s$/.exec(s))) { limits.cooldown_s = +m[1]; s = s.slice(0, m.index); again = true; } }
    return s.trim(); };
  left = eat(left); right = eat(right);
  const ki = topIndex(left, ' if ');
  const evPart = ki < 0 ? left : left.slice(0, ki), condPart = ki < 0 ? '' : left.slice(ki + 4);
  const when = compileEvent(evPart.trim());
  const ifs = condPart ? splitTop(condPart, ' and ').map(compileCond) : [];
  const then = parseCalls(right, st.lang || 'en').map(c => toTemplate(c, st.lang || 'en'));
  const body = { id: st.id, when }; if (ifs.length) body.if = ifs; body.then = then; body.limits = limits;
  return body;
}
function compileEvent(s) {
  const toks = s.split(/\s+/);
  const head = PATH_ALIAS[toks[0]] || toks[0];
  if (head.startsWith('gauge.')) {
    const id = head.slice(6), rest = toks.slice(1).join(' ');
    const m = /^is\s+(low|medium|high)$/.exec(rest);
    if (m) return { event: 'gauge.changed', match: { id, word: m[1] } };
    const [, op, v] = test('x ' + rest);
    return { event: 'gauge.changed', match: { id, value: op === 'eq' ? v : { [op]: v } } };
  }
  if (EVENTS[head]) {
    const match = {};
    for (const t of splitTop(toks.slice(1).join(' '), ' and ').filter(Boolean)) { const [f, op, v] = test(t); match[f] = op === 'eq' ? v : { [op]: v }; }
    return Object.keys(match).length ? { event: head, match } : { event: head };
  }
  if (STATE_PATHS[head]) {
    const [, op, v] = test(['x'].concat(toks.slice(1)).join(' '));
    const field = head.split('.')[1];
    return { event: STATE_PATHS[head], match: { [field]: op === 'eq' ? v : { [op]: v } } };
  }
  throw new Error('unknown event ' + toks[0]);
}
function test(t) {
  const m = /^(\S+)\s+(<=|>=|!=|<|>|=|contains)\s+(.+)$/.exec(t.trim());
  if (!m) throw new Error('bad test "' + t + '"');
  return [m[1], m[2] === '=' ? 'eq' : OPS[m[2]], value(m[3])];
}
function compileCond(s) {
  s = s.trim(); let m;
  if (s.startsWith('not ')) return { not: compileCond(s.slice(4)) };
  if ((m = /^(\S+)\s+within\s+(\d+(?:\.\d+)?)m\s+of\s+(\S+)$/.exec(s))) return { near: { a: m[1], b: m[3], within_m: +m[2] } };
  if ((m = /^fact\s+(\S+)\s+(\S+)(?:\s+=\s+(.+))?$/.exec(s))) return { fact: Object.assign({ subject: m[1], predicate: m[2] }, m[3] !== undefined ? { value: value(m[3]) } : {}) };
  if ((m = /^gauge\.(\S+)\s+is\s+(low|medium|high)$/.exec(s))) return { gauge: { id: m[1], word: m[2] } };
  if ((m = /^gauge\.(\S+)\s+(<|>)\s+(\S+)$/.exec(s))) return { gauge: { id: m[1], [m[2] === '<' ? 'lt' : 'gt']: value(m[3]) } };
  if ((m = /^(scene|station)\s+=\s+(\S+)$/.exec(s))) return { [m[1]]: { id: m[2] } };
  const [path, op, v] = test(s), p = PATH_ALIAS[path] || path;
  if (!STATE_PATHS[p]) throw new Error('unknown condition "' + s + '"');
  return { state: { path: p, [op]: v } };
}
/* `name(args), name(args)` → [{ name, args: [positional | [key, value]] }] */
function parseCalls(s, lang) {
  const out = []; let i = 0;
  while (i < s.length) {
    while (s[i] === ',' || s[i] === ' ') i++;
    if (i >= s.length) break;
    const p = s.indexOf('(', i); if (p < 0) throw new Error('bad call "' + s.slice(i) + '"');
    const name = s.slice(i, p).trim(); let d = 0, j = p, str = false;
    for (; j < s.length; j++) { const ch = s[j]; if (str) { if (ch === '\\') j++; else if (ch === '"') str = false; continue; } if (ch === '"') str = true; else if (ch === '(') d++; else if (ch === ')' && --d === 0) break; }
    if (j >= s.length) throw new Error('unclosed call ' + name);
    const inner = s.slice(p + 1, j).trim();
    out.push({ name, args: inner ? splitTop(inner, ',').map(a => { a = a.trim(); const k = /^([a-z_]+)=(.+)$/.exec(a); return k ? [k[1], value(k[2])] : value(a, true); }) : [] });
    i = j + 1;
  }
  return out;
}
function toTemplate(c, lang) {
  let name = c.name, preset = null;
  if (CALL_ALIAS[name]) { preset = CALL_ALIAS[name][1]; name = CALL_ALIAS[name][0]; }
  if (name === 'fact') {
    const [s, p, v] = c.args.filter(a => !Array.isArray(a));
    const t = { horizon: 'story', kind: 'fact', body: { subject: s, predicate: p, value: v } };
    for (const a of c.args.filter(Array.isArray)) kw(t, a);
    return t;
  }
  const kind = ACT[name] ? 'act' : EFFECT[name] ? 'effect' : null;
  if (!kind) throw new Error('unknown op ' + name);
  const sch = kind === 'act' ? ACT[name] : EFFECT[name];
  const t = { horizon: 'now', kind, body: { op: name } };
  for (const a of c.args) {
    if (Array.isArray(a)) { kw(t, a); continue; }
    const f = preset || sch.primary;
    if (name === 'say' && a && a.quoted) t.body.line = { [lang]: a.v };
    else t.body[f] = a && a.quoted ? a.v : a;
  }
  return t;
}
function kw(t, [k, v]) { const x = v && v.quoted ? v.v : v; if (k === 'horizon') t.horizon = x; else if (k === 'ttl') t.ttl = x; else t.body[k] = x; }
function value(s, keepQuote) {
  s = s.trim(); let m;
  if (s[0] === '"') { const v = JSON.parse(s); return keepQuote ? { quoted: true, v } : v; }
  if ((m = /^(-?\d+(?:\.\d+)?)(%|m|s)?$/.exec(s))) return m[2] === '%' ? Math.round(+m[1] * 1e4 / 100) / 1e4 : +m[1];
  if (s === 'true') return true; if (s === 'false') return false;
  return s;
}
function topIndex(s, sep) { let str = false, d = 0; for (let i = 0; i < s.length; i++) { const ch = s[i]; if (str) { if (ch === '\\') i++; else if (ch === '"') str = false; continue; } if (ch === '"') str = true; else if (ch === '(') d++; else if (ch === ')') d--; else if (!d && s.startsWith(sep, i)) return i; } return -1; }
function splitTop(s, sep) { const out = []; let k; while ((k = topIndex(s, sep)) >= 0) { out.push(s.slice(0, k)); s = s.slice(k + sep.length); } out.push(s); return out.map(x => x.trim()).filter(x => x); }

/* `gauge id "label": rises <event> by n [if …]; fades n/min; words medium high` (§6.5) */
export function compileGauge(label, s) {
  const g = { label, rises: [], fades: { per_minute: 0 }, words: { medium: 0.34, high: 0.67 } };
  for (const cl of splitTop(s, ';')) {
    let m;
    if ((m = /^rises\s+(.+?)\s+by\s+(\d+(?:\.\d+)?)(?:\s+if\s+(.+))?$/.exec(cl))) {
      const r = { on: compileEvent(m[1]), by: +m[2] };
      if (m[3]) r.if = splitTop(m[3], ' and ').map(compileCond);
      g.rises.push(r);
    } else if ((m = /^fades\s+(\d+(?:\.\d+)?)\/min$/.exec(cl))) g.fades.per_minute = +m[1];
    else if ((m = /^words\s+(\d+(?:\.\d+)?)\s+(\d+(?:\.\d+)?)$/.exec(cl))) g.words = { medium: +m[1], high: +m[2] };
    else throw new Error('bad gauge clause "' + cl + '"');
  }
  return g;
}

/* `!! never call [if cond and …]` → constraint { forbid: { kind, op, fields }, if } */
export function compileNever(text, st = {}) {
  const s = text.replace(/^never\s+/, '');
  const k = topIndex(s, ' if ');
  const call = parseCalls(k < 0 ? s : s.slice(0, k), st.lang || 'en');
  if (call.length !== 1) throw new Error('never takes one call');
  const t = toTemplate(call[0], st.lang || 'en'), fields = Object.assign({}, t.body); delete fields.op;
  const out = { forbid: Object.assign({ kind: t.kind, op: t.body.op }, Object.keys(fields).length ? { fields } : {}) };
  if (k >= 0) out.if = splitTop(s.slice(k + 4), ' and ').map(compileCond);
  return out;
}

/* ---------------------------------------------------------------- write back */
export function serializeSource(statements, { pack } = {}) {
  const out = [], cur = {};
  const set = (k, v) => { if (cur[k] !== v) { out.push(`@${k} ${v}`); cur[k] = v; } };
  if (pack || statements[0]) set('pack', pack || statements[0].pack);
  for (const s of statements) {
    set('author', s.author.kind + ':' + s.author.id); set('layer', s.layer); set('scope', s.scope); set('lang', s.lang);
    const defH = s.scope.startsWith('scene:') ? 'scene' : 'story';
    if (s.strength === 'gauge') { out.push(s.text + (s.horizon !== defH ? ` {horizon=${s.horizon}}` : '')); continue; }
    const mark = s.strength === 'tendency' ? '~' + s.weight : s.strength === 'open' ? '?' : s.form === 'explicit' && s.strength === 'hard' ? '' : s.strength === 'absolute' ? '!!' : '!';
    out.push(`${s.id}: ${mark ? mark + ' ' : ''}${s.text}${s.horizon !== defH ? ` {horizon=${s.horizon}}` : ''}`);
    for (const e of s.examples) out.push(`  ${e.counter ? 'x' : '>'} ${e.text}`);
  }
  return out.join('\n') + '\n';
}

/* Soft principles a model call must see (§2.7). */
export function inScope(principles, { character, scene } = {}) {
  return principles.filter(p => (p.strength === 'tendency' || p.strength === 'open') &&
    (p.scope === 'story' || p.scope === 'place' || (character && p.scope === 'character:' + character) || (scene && p.scope === 'scene:' + scene)));
}

/* A model's compiled form for a prose `!` or `!!` (pack build): validated, then proposed; a creator approves it. */
export function attachCompiled(st, body, { by, world } = {}) {
  const kind = st.strength === 'hard' ? 'rule' : 'constraint';
  if (kind === 'rule') {
    const r = validate({ author: st.author, horizon: st.horizon, kind: 'rule', body: Object.assign({ id: st.id }, body) }, world || null);
    if (r.status === 'rejected') return { ok: false, reasons: r.reasons };
    body = r.tx.body;
  } else if (!body || !body.forbid || !KIND_HORIZONS[body.forbid.kind]) return { ok: false, reasons: [{ why: 'bad_constraint' }] };
  st.compiled = { kind, status: 'proposed', body, by: by || 'model' };
  return { ok: true };
}
export function approve(st, approver) { if (st.compiled && st.compiled.status === 'proposed') { st.compiled.status = 'approved'; st.compiled.approved_by = approver; return true; } return false; }

/* ---------------------------------------------------------------- audit (§2.8)
   The judge is a model call made elsewhere. Interface:
     judge({ principle, entries, examples }) → Promise<[{ type: 'audit', principle, ref_seq, relevant, respected, note?, judge }]>
   auditSummary aggregates the audit entries of a journal. */
export function auditSummary(journal) {
  const E = Array.isArray(journal) ? journal : journal.entries;
  const out = {};
  for (const a of E.filter(e => e.type === 'audit')) {
    const s = out[a.principle] = out[a.principle] || { relevant: 0, respected: 0, broken: 0, rate: null, breaks: [] };
    if (!a.relevant) continue;
    s.relevant++;
    if (a.respected === true) s.respected++;
    else if (a.respected === false) { s.broken++; s.breaks.push(a.ref_seq); }
  }
  for (const s of Object.values(out)) s.rate = s.relevant ? Math.round(s.respected / s.relevant * 100) / 100 : null;
  return out;
}
