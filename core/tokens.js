/* PDL token form (docs/pdl-spec.md §10): a short, line-oriented notation for models. Round-trips to the canonical JSON.
     #14 @62.5 m:stager/stage now act.look ^12 tg=thing:pine-3
     m:keeper/background scene rule id=jay.stop on.ev=sound.played on.m.cue=jay_alarm lim.max=1
       if near a=body b=thing:hide within=20
       then now act.stop
   Head: [#id] [@t] author horizon kind[.op] [^cause] [~ttl], then key=value fields (dotted keys build nested objects;
   arrays and objects inside arrays are JSON literals). A rule's `if` and `then` items are continuation lines.
   display() renders the optional glyph view in the style of src/pdl.js; it is never parsed. */
import { canonical } from './pdl.js';

const ALIAS = { target: 'tg', certainty: 'cert', subject: 'subj', predicate: 'pred', value: 'val', when: 'on', event: 'ev', match: 'm',
  limits: 'lim', max_fires: 'max', cooldown_s: 'cd', within_m: 'within' };
const UNALIAS = Object.fromEntries(Object.entries(ALIAS).map(([k, v]) => [v, k]));
const AUTH = { player: 'p', creator: 'c', model: 'm', engine: 'e' };
const UNAUTH = Object.fromEntries(Object.entries(AUTH).map(([k, v]) => [v, k]));
const BARE = /^[A-Za-z_$][A-Za-z0-9_:.\-\/$]*$/;
const isObj = x => x !== null && typeof x === 'object' && !Array.isArray(x);

/* ---------------------------------------------------------------- serialize */
export function serializeTokens(txs) {
  return [].concat(txs).map(serializeOne).join('\n');
}
function atom(v) {
  if (typeof v === 'string') return BARE.test(v) && !['true', 'false', 'null'].includes(v) ? v : JSON.stringify(v);
  if (typeof v === 'number' || typeof v === 'boolean' || v === null) return String(v);
  return JSON.stringify(v);
}
function flatten(o, prefix, out, skip = []) {
  for (const [k, v] of Object.entries(o)) {
    if (skip.includes(k) || v === undefined) continue;
    const key = prefix + (ALIAS[k] || k);
    if (isObj(v) && Object.keys(v).length) flatten(v, key + '.', out);
    else out.push(key + '=' + atom(v));
  }
  return out;
}
function head(tx) {
  const h = [];
  if (tx.id !== undefined) h.push('#' + tx.id);
  if (tx.t !== undefined) h.push('@' + tx.t);
  const a = tx.author || {};
  h.push(AUTH[a.kind] + ':' + a.id + (a.tier ? '/' + a.tier : '') + (a.layer ? '+' + a.layer : ''));
  h.push(tx.horizon, tx.kind + (tx.body && typeof tx.body.op === 'string' && (tx.kind === 'act' || tx.kind === 'effect') ? '.' + tx.body.op : ''));
  if (tx.cause) h.push('^' + (tx.cause.tx ?? '') + (tx.cause.rule ? '/' + tx.cause.rule : '') + (tx.cause.commit ? '!' + tx.cause.commit : '') + (tx.cause.amends !== undefined ? '=' + tx.cause.amends : ''));
  if (tx.ttl !== undefined) h.push('~' + tx.ttl);
  return h;
}
function serializeOne(tx0) {
  const tx = canonical(tx0), b = tx.body || {};
  const skip = ['op'].concat(tx.kind === 'rule' ? ['if', 'then'] : []);
  const line = head(tx).concat(flatten(b, '', [], skip)).join(' ');
  const more = [];
  if (tx.kind === 'rule') {
    for (const c of b.if || []) more.push('  if ' + condTokens(c));
    for (const t of b.then || []) more.push('  then ' + [t.horizon, t.kind + (t.body.op ? '.' + t.body.op : '')].concat(t.ttl !== undefined ? ['~' + t.ttl] : [], flatten(t.body, '', [], ['op'])).join(' '));
  }
  return [line, ...more].join('\n');
}
function condTokens(c) {
  const k = Object.keys(c)[0];
  if (k === 'not') return 'not ' + condTokens(c.not);
  return [k].concat(flatten(c[k], '', [])).join(' ');
}

/* ---------------------------------------------------------------- parse */
export function parseTokens(text) {
  const out = [];
  String(text).split(/\r?\n/).forEach((raw, i) => {
    const n = i + 1;
    if (!raw.trim() || raw.trim().startsWith('//')) return;
    if (/^\s{2,}\S/.test(raw)) {
      const tx = out[out.length - 1];
      if (!tx || tx.kind !== 'rule') throw new SyntaxError(`line ${n}: continuation outside a rule`);
      const toks = split(raw.trim(), n), w = toks.shift();
      if (w === 'if') (tx.body.if = tx.body.if || []).push(parseCond(toks, n));
      else if (w === 'then') (tx.body.then = tx.body.then || []).push(parseThen(toks, n));
      else throw new SyntaxError(`line ${n}: expected "if" or "then"`);
      return;
    }
    out.push(parseHead(split(raw.trim(), n), n));
  });
  return out.map(canonical);
}
function split(s, n) {
  const toks = []; let cur = '', depth = 0, str = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (str) { cur += ch; if (ch === '\\') { cur += s[++i]; } else if (ch === '"') str = false; continue; }
    if (ch === '"') { str = true; cur += ch; continue; }
    if (ch === '[' || ch === '{') depth++;
    if (ch === ']' || ch === '}') depth--;
    if (ch === ' ' && depth === 0) { if (cur) toks.push(cur); cur = ''; continue; }
    cur += ch;
  }
  if (str || depth) throw new SyntaxError(`line ${n}: unclosed string or bracket`);
  if (cur) toks.push(cur);
  return toks;
}
function value(s, n) {
  if (s[0] === '"' || s[0] === '[' || s[0] === '{') { try { return JSON.parse(s); } catch { throw new SyntaxError(`line ${n}: bad literal ${s}`); } }
  if (s === 'true') return true; if (s === 'false') return false; if (s === 'null') return null;
  if (/^-?(\d|\.\d)/.test(s)) { const x = Number(s); if (Number.isNaN(x)) throw new SyntaxError(`line ${n}: bad number ${s}`); return x; }
  if (!BARE.test(s)) throw new SyntaxError(`line ${n}: bad value ${s}`);
  return s;
}
function setPath(o, key, v, n) {
  const segs = key.split('.').map(k => UNALIAS[k] || k);
  let x = o;
  for (const k of segs.slice(0, -1)) { if (!isObj(x[k])) { if (x[k] !== undefined) throw new SyntaxError(`line ${n}: ${key} conflicts`); x[k] = {}; } x = x[k]; }
  x[segs[segs.length - 1]] = v;
}
function fields(toks, n, o = {}) {
  for (const t of toks) {
    const k = t.indexOf('=');
    if (k <= 0) throw new SyntaxError(`line ${n}: expected key=value, got ${t}`);
    setPath(o, t.slice(0, k), value(t.slice(k + 1), n), n);
  }
  return o;
}
function kindOp(tok) { const k = tok.indexOf('.'); return k < 0 ? [tok, undefined] : [tok.slice(0, k), tok.slice(k + 1)]; }
function parseHead(toks, n) {
  const tx = {};
  if (toks[0] && toks[0][0] === '#') tx.id = Number(toks.shift().slice(1));
  if (toks[0] && toks[0][0] === '@') tx.t = Number(toks.shift().slice(1));
  const a = /^([pcme]):([^/+\s]+)(?:\/([a-z]+))?(?:\+([^\s]+))?$/.exec(toks.shift() || '');
  if (!a) throw new SyntaxError(`line ${n}: expected an author like m:id/tier`);
  tx.author = { kind: UNAUTH[a[1]], id: a[2] }; if (a[3]) tx.author.tier = a[3]; if (a[4]) tx.author.layer = a[4];
  tx.horizon = toks.shift();
  const [kind, op] = kindOp(toks.shift() || '');
  tx.kind = kind; tx.body = op ? { op } : {};
  while (toks[0] && (toks[0][0] === '^' || toks[0][0] === '~')) {
    const t = toks.shift();
    if (t[0] === '~') tx.ttl = Number(t.slice(1));
    else {
      const m = /^\^(\d*)(?:\/([^!=]+))?(?:!([^=]+))?(?:=(\d+))?$/.exec(t);
      if (!m) throw new SyntaxError(`line ${n}: bad cause ${t}`);
      tx.cause = {}; if (m[1]) tx.cause.tx = Number(m[1]); if (m[2]) tx.cause.rule = m[2]; if (m[3]) tx.cause.commit = m[3]; if (m[4]) tx.cause.amends = Number(m[4]);
    }
  }
  fields(toks, n, tx.body);
  return tx;
}
function parseCond(toks, n) {
  const k = toks.shift();
  if (k === 'not') return { not: parseCond(toks, n) };
  return { [k]: fields(toks, n) };
}
function parseThen(toks, n) {
  const horizon = toks.shift(), [kind, op] = kindOp(toks.shift() || '');
  const t = { horizon, kind, body: op ? { op } : {} };
  if (toks[0] && toks[0][0] === '~') t.ttl = Number(toks.shift().slice(1));
  fields(toks, n, t.body);
  return t;
}

/* ---------------------------------------------------------------- glyph display (optional, never parsed) */
const GLYPH = { intent: '◈', act: '⇢', effect: '∿', fact: '∴', rule: '↯', cancel: '⊘' };
export function display(tx) { return serializeTokens(tx).split('\n').map((l, i) => (i ? '   ' : (GLYPH[tx.kind] || '·') + ' ') + l).join('\n'); }
