#!/usr/bin/env node
// Story pack checker: parses PDL source (.pdl), merges layers with provenance, instantiates patterns,
// and checks every reference (facts, lines, stations, things, beats, endings, cues, clocks).
// Pure functions, no DOM. The I/O lives in loadPack / loadLibrary and the CLI at the bottom.
//
//   node tools/pack-check.mjs stories/louis-round          report, exit 1 on errors
//   node tools/pack-check.mjs stories/louis-round --json   print the compiled form (merged statements + rules)
//
// The PDL source grammar used here is the one sketched in docs/architecture.md ("The authoring format");
// docs/pdl-spec.md is the reference once written. Line forms:
//   # <id> — <title>                 header (first line)
//   @key value  @key value           metadata (file level before the first section)
//   ## <section>                     section
//   !! text {id}                     absolute
//   ! text {id}                      hard (prose, compiled later into a rule)
//   ~[w] text {id}                   tendency, optional weight 0..1
//   ? question -- note {id}          open question with a guiding note
//   > [context] fr: … | en: …        example
//   x [context] fr: … | en: … | why: …   counter-example
//   when ev(args) [once] [max N] [cooldown Ns] [if c(args) and not c(args)] -> act(args), act(args) {id}
//   role name[*] : type : description    (pattern)   param name = value : description   need name : type : description
//   bind role = value [k=v …]            (instance)  set param = value
//   hint text   variation id : text
//   // comment

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';

export const STRENGTHS = ['!!', '!', '~', '?', '>', 'x', 'when'];
const KEYWORDS = ['role', 'param', 'need', 'bind', 'set', 'hint', 'variation'];

// Closed vocabulary of rule events, conditions and actions, with argument types.
// '?' prefix: optional argument. Types are checked against the pack.
export const EVENTS = {
  'session.start': [], 'station.entered': ['station'], 'station.left': ['station'], 'station.dwell': ['station', 'num'],
  'clock.below': ['clock', 'num'], 'clock.every': ['num'], 'time.elapsed': ['num'],
  'look.at': ['thing', '?num'], 'said.matches': ['intent'], 'said.loud': [], 'voice.silent': ['num'],
  'beat.enter': ['beat'], 'fact.established': ['fact'],
};
export const CONDITIONS = {
  fact: ['fact'], beat: ['beat'], at: ['station'], within_reach: ['thing'], 'ending.any': [],
  'clock.below': ['clock', 'num'], promised: ['commit'],
};
export const ACTIONS = {
  say: ['line'], reveal: ['fact'], beat: ['beat'], ending: ['ending'], go: ['station'],
  'light.raise': ['num'], sound: ['cue'], 'image.degrade': ['num'], 'speech.volume': ['level'],
  'speech.shorten': ['num'], 'body.posture': ['num'], 'body.stop': [], 'camera.off': [],
};
const LEVELS = ['whisper', 'low', 'normal'];
const ROLE_TYPES = ['character', 'thing', 'station', 'fact', 'line', 'cue', 'clock', 'ending', 'beat'];

export const BENCH_TAGS = ['movement', 'look', 'touch', 'make', 'talk', 'louis', 'emotional', 'refusal-worthy',
  'out-of-world', 'impossible-by-engine', 'commit', 'v2'];
export const BENCH_EXPECT = ['does-it', 'partly-says-so', 'argues', 'refuses-in-character', 'deflects'];
export const CARRIER_MIN = { '!!': 3, '!': 6, '~w': 12, '?': 6, '>': 20, 'x': 8 };
const STRONG_SECTIONS = ['voice', 'knows', 'does-not-know', 'limits', 'secrets', 'arc', 'body'];
const ABSENT_SECTIONS = ['identity', 'traces'];

// ---------- parsing ----------

const ID_RE = /\s*\{([A-Za-z0-9_.\-]+)\}\s*$/;
const EXAMPLE_RE = /^(?:\[([^\]]*)\]\s*)?fr:\s*(.*?)\s*\|\s*en:\s*(.*?)(?:\s*\|\s*why:\s*(.*))?$/;

function splitTop(s, sep = ',') {
  const out = []; let depth = 0, cur = '';
  for (const ch of s) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === sep && depth === 0) { out.push(cur); cur = ''; } else cur += ch;
  }
  if (cur.trim()) out.push(cur);
  return out.map(x => x.trim()).filter(Boolean);
}

export function parseCall(s) {
  const m = /^(not\s+)?([A-Za-z_][\w.]*)\s*(?:\((.*)\))?$/.exec(s.trim());
  if (!m) return null;
  return { not: !!m[1], name: m[2], args: m[3] !== undefined ? splitTop(m[3]) : [] };
}

export function parseRule(text) {
  const arrow = text.indexOf('->');
  if (!text.startsWith('when ') || arrow < 0) return { error: 'rule needs "when … -> …"' };
  let left = text.slice(5, arrow).trim();
  const right = text.slice(arrow + 2).trim();
  const ev = /^([A-Za-z_][\w.]*)(\([^)]*\))?/.exec(left);
  if (!ev) return { error: 'rule has no event' };
  const event = parseCall(ev[0]);
  left = left.slice(ev[0].length).trim();
  let condStr = '';
  const ifAt = left.search(/(^|\s)if\s/);
  if (ifAt >= 0) { condStr = left.slice(ifAt).replace(/^\s*if\s+/, ''); left = left.slice(0, ifAt); }
  const limits = {};
  if (/\bonce\b/.test(left)) { limits.max_fires = 1; left = left.replace(/\bonce\b/, ''); }
  let m = /\bmax\s+(\S+)/.exec(left); if (m) { limits.max_fires = m[1]; left = left.replace(m[0], ''); }
  m = /\bcooldown\s+(\d+)s\b/.exec(left); if (m) { limits.cooldown_s = Number(m[1]); left = left.replace(m[0], ''); }
  if (left.trim()) return { error: `unexpected "${left.trim()}" before if/->` };
  const conditions = condStr ? condStr.split(/\s+and\s+/).map(parseCall) : [];
  const actions = splitTop(right).map(parseCall);
  if (conditions.some(c => !c) || actions.some(a => !a) || !actions.length) return { error: 'malformed condition or action' };
  return { event, conditions, actions, limits };
}

/** Parse one PDL source text. Returns { id, title, meta, statements, errors }. Pure. */
export function parsePdl(text, file = '<text>') {
  const doc = { file, id: null, title: '', meta: {}, statements: [], errors: [] };
  let section = '', sectionMeta = {}, n = {};
  const err = (line, msg) => doc.errors.push(`${file}:${line}: ${msg}`);
  const lines = text.split(/\r?\n/);
  lines.forEach((raw, i) => {
    const ln = i + 1; let s = raw.trim();
    if (!s || s.startsWith('//')) return;
    if (s.startsWith('# ')) {
      if (doc.id) return err(ln, 'second header');
      const h = /^#\s+([A-Za-z0-9_.\-]+)\s*(?:[—–-]\s*(.*))?$/.exec(s);
      if (!h) return err(ln, 'malformed header');
      doc.id = h[1]; doc.title = h[2] || ''; return;
    }
    if (!doc.id) return err(ln, 'missing header "# <id> — <title>" before content');
    if (s.startsWith('@')) {
      const target = section ? sectionMeta : doc.meta;
      for (const m of s.matchAll(/@([\w-]+)\s+([^@]*)/g)) target[m[1]] = m[2].trim();
      return;
    }
    if (s.startsWith('## ')) { section = s.slice(3).trim(); sectionMeta = {}; return; }
    let id = null;
    const idm = ID_RE.exec(s);
    if (idm) { id = idm[1]; s = s.slice(0, idm.index).trim(); }
    const st = { id, file, line: ln, section, sectionMeta: { ...sectionMeta } };
    let m;
    if (s.startsWith('!! ')) Object.assign(st, { mark: '!!', text: s.slice(3).trim() });
    else if (s.startsWith('! ')) Object.assign(st, { mark: '!', text: s.slice(2).trim() });
    else if ((m = /^~(\d*\.?\d+)?\s+(.*)$/.exec(s))) {
      Object.assign(st, { mark: '~', text: m[2].trim() });
      if (m[1] !== undefined) { st.weight = Number(m[1]); if (!(st.weight >= 0 && st.weight <= 1)) err(ln, `weight ${m[1]} out of 0..1`); }
    } else if (s.startsWith('? ')) {
      const body = s.slice(2); const k = body.indexOf(' -- ');
      Object.assign(st, { mark: '?', text: (k < 0 ? body : body.slice(0, k)).trim(), note: k < 0 ? '' : body.slice(k + 4).trim() });
      if (!st.note) err(ln, 'open question without a guiding note ("-- note")');
    } else if (s.startsWith('> ') || s.startsWith('x ')) {
      const mark = s[0]; const e = EXAMPLE_RE.exec(s.slice(2).trim());
      if (!e || !e[2] || !e[3]) { err(ln, `${mark === '>' ? 'example' : 'counter-example'} needs "fr: … | en: …"`); return; }
      Object.assign(st, { mark, context: e[1] || '', fr: e[2], en: e[3], why: e[4] || '' });
      if (mark === 'x' && !st.why) err(ln, 'counter-example without "| why: …"');
      if (mark === '>' && e[4]) err(ln, 'example with a "why" (only counter-examples have one)');
    } else if (s.startsWith('when ')) {
      const r = parseRule(s);
      if (r.error) { err(ln, r.error); return; }
      Object.assign(st, { mark: 'when', text: s, rule: r });
    } else if ((m = /^(role|param|need|bind|set|hint|variation)\s+(.*)$/.exec(s))) {
      Object.assign(st, { mark: m[1], text: m[2].trim() });
    } else { err(ln, `unknown line: "${s.slice(0, 40)}"`); return; }
    if (!st.id) { n[section] = (n[section] || 0) + 1; st.id = `${doc.id}.${section || 'top'}.${n[section]}`; st.auto_id = true; }
    doc.statements.push(st);
  });
  if (!doc.id) doc.errors.push(`${file}: empty or headerless file`);
  return doc;
}

// ---------- layers ----------

/** Merge the layers of a pack in order. Same id in a later layer replaces the earlier one and records it. */
export function mergeLayers(manifest, docs) {
  const errors = [], merged = new Map();
  for (const layer of manifest.layers || []) {
    const seen = new Set();
    for (const f of layer.files || []) {
      const doc = docs[f];
      if (!doc) { errors.push(`layer ${layer.id}: file ${f} not found`); continue; }
      if (doc.meta.layer !== layer.id) errors.push(`${f}: @layer "${doc.meta.layer}" but listed in layer "${layer.id}"`);
      const author = doc.meta.author || layer.author;
      for (const st of doc.statements) {
        if (seen.has(st.id)) { errors.push(`${f}:${st.line}: duplicate id ${st.id} in layer ${layer.id}`); continue; }
        seen.add(st.id);
        const prov = { layer: layer.id, author, file: f, doc: doc.id, kind: doc.meta.kind || '' };
        const prev = merged.get(st.id);
        const entry = { ...st, provenance: prov, overrides: prev ? [...prev.overrides, prev.provenance] : [] };
        merged.set(st.id, entry);           // a replaced entry keeps its first position: order is stable
      }
    }
  }
  return { statements: [...merged.values()], errors };
}

// ---------- patterns ----------

export function readPattern(doc) {
  const p = { id: doc.id, roles: {}, params: {}, rules: [], principles: [], errors: [...doc.errors] };
  for (const st of doc.statements) {
    if (st.mark === 'role' || st.mark === 'need') {
      const m = /^([\w-]+)(\*?)\s*:\s*([\w-]+)\s*:\s*(.*)$/.exec(st.text);
      if (!m) { p.errors.push(`${doc.file}:${st.line}: ${st.mark} needs "name : type : description"`); continue; }
      if (!ROLE_TYPES.includes(m[3])) p.errors.push(`${doc.file}:${st.line}: unknown role type ${m[3]}`);
      p.roles[m[1]] = { many: !!m[2], type: m[3], need: st.mark === 'need', description: m[4] };
    } else if (st.mark === 'param') {
      const m = /^([\w-]+)\s*=\s*(\S+)/.exec(st.text);
      if (m) p.params[m[1]] = m[2]; else p.errors.push(`${doc.file}:${st.line}: param needs "name = value"`);
    } else if (st.mark === 'when') p.rules.push(st);
    else if (['!!', '!', '~', '?'].includes(st.mark)) p.principles.push(st);
  }
  return p;
}

function substitute(text, bind, params) {
  return text.replace(/\$([\w-]+)(?:\.([\w-]+))?/g, (all, name, attr) => {
    if (name in params && !attr) return params[name];
    const b = bind[name]; if (!b) return all;
    return attr ? (b.attrs[attr] ?? all) : b.value;
  });
}

/** Instantiate one pattern from an instance doc. Returns { rules, principles, bindings, errors }. */
export function instantiate(instance, pattern) {
  const errors = [], bindings = {}, params = { ...pattern.params };
  for (const st of instance.statements) {
    if (st.mark === 'bind') {
      const m = /^([\w-]+)\s*=\s*(\S+)(.*)$/.exec(st.text);
      if (!m) { errors.push(`${instance.file}:${st.line}: bind needs "role = value"`); continue; }
      const role = pattern.roles[m[1]];
      if (!role) { errors.push(`${instance.file}:${st.line}: pattern ${pattern.id} has no role ${m[1]}`); continue; }
      const attrs = Object.fromEntries([...m[3].matchAll(/([\w-]+)=(\S+)/g)].map(x => [x[1], x[2]]));
      (bindings[m[1]] ||= []).push({ value: m[2], attrs, type: role.type });
    } else if (st.mark === 'set') {
      const m = /^([\w-]+)\s*=\s*(\S+)/.exec(st.text);
      if (!m || !(m[1] in pattern.params)) errors.push(`${instance.file}:${st.line}: unknown param ${m ? m[1] : st.text}`);
      else params[m[1]] = m[2];
    }
  }
  for (const [name, role] of Object.entries(pattern.roles)) {
    const b = bindings[name] || [];
    if (!b.length) errors.push(`${instance.id}: role ${name} of ${pattern.id} is not bound`);
    else if (!role.many && b.length > 1) errors.push(`${instance.id}: role ${name} bound ${b.length} times (single role)`);
  }
  // Expand: a statement that mentions a many-role is repeated once per binding.
  const expand = (st) => {
    const manyUsed = Object.keys(pattern.roles).filter(r => pattern.roles[r].many && new RegExp(`\\$${r}\\b`).test(st.text));
    const combos = manyUsed.length ? (bindings[manyUsed[0]] || []).map((b, i) => ({ [manyUsed[0]]: b, i })) : [{ i: -1 }];
    return combos.map(c => {
      const single = Object.fromEntries(Object.entries(bindings).map(([k, v]) => [k, v[0]]));
      const text = substitute(st.text, { ...single, ...c }, params);
      const base = st.auto_id ? st.id.split('.').slice(1).join('.') : st.id;
      const id = `${instance.id}.${base}${c.i >= 0 ? '.' + (c.i + 1) : ''}`;
      return { ...st, id, text, pattern: pattern.id, instance: instance.id, unbound: /\$[\w-]/.test(text) };
    });
  };
  const rules = pattern.rules.flatMap(expand).map(st => {
    const r = parseRule(st.text);
    if (r.error) errors.push(`${instance.id}: expanded rule ${st.id}: ${r.error}`);
    if (st.unbound) errors.push(`${instance.id}: rule ${st.id} keeps an unbound $variable: ${st.text}`);
    return { ...st, rule: r.error ? null : r };
  });
  const principles = pattern.principles.flatMap(expand);
  return { rules, principles, bindings, params, errors };
}

// ---------- loading (I/O) ----------

export function loadLibrary(dir) {
  const lib = {};
  if (!existsSync(dir)) return lib;
  for (const f of readdirSync(dir).filter(f => f.endsWith('.pdl')).sort()) lib[basename(f, '.pdl')] = readFileSync(join(dir, f), 'utf8');
  return lib;
}

export function loadPack(dir) {
  const j = p => JSON.parse(readFileSync(join(dir, p), 'utf8'));
  const manifest = j('pack.json');
  const texts = {};
  for (const layer of manifest.layers || []) for (const f of layer.files || []) {
    const p = join(dir, f); if (existsSync(p)) texts[f] = readFileSync(p, 'utf8');
  }
  const opt = p => (p && existsSync(join(dir, p)) ? j(p) : null);
  const lines = {};
  for (const [lang, p] of Object.entries(manifest.lines || {})) lines[lang] = opt(p);
  return { dir, manifest, texts, place: opt(manifest.place), stations: opt(manifest.stations), beats: opt(manifest.beats), lines, bench: opt(manifest.bench) };
}

// ---------- checking (pure) ----------

/** Check a loaded pack against a pattern library (id -> text). Returns { errors, warnings, stats, compiled }. */
export function checkPack(pack, libraryTexts) {
  const errors = [], warnings = [];
  const M = pack.manifest || {};
  for (const k of ['id', 'title', 'languages', 'authors', 'layers', 'patterns'])
    if (M[k] === undefined) errors.push(`pack.json: missing ${k}`);
  for (const lang of M.languages || []) if (!M.title?.[lang]) errors.push(`pack.json: title has no ${lang}`);
  if (!(M.layers || []).some(l => l.id === 'base')) errors.push('pack.json: no base layer');
  const authorIds = new Set((M.authors || []).map(a => a.id));

  // parse
  const docs = {};
  for (const [f, t] of Object.entries(pack.texts)) { docs[f] = parsePdl(t, f); errors.push(...docs[f].errors); }
  for (const l of M.layers || []) {
    if (!authorIds.has(l.author)) errors.push(`layer ${l.id}: author ${l.author} not in pack authors`);
    for (const f of l.files || []) if (docs[f] && docs[f].meta.author && !authorIds.has(docs[f].meta.author)) errors.push(`${f}: author ${docs[f].meta.author} not in pack authors`);
  }
  const merged = mergeLayers(M, docs);
  errors.push(...merged.errors);
  const S = merged.statements;

  // name spaces
  const things = new Set((pack.place?.objets || []).map(o => o.id));
  const stations = new Set((pack.stations?.stations || []).map(s => s.id));
  const beats = new Set((pack.beats?.beats || []).map(b => b.id));
  const endings = new Set((pack.beats?.endings || []).map(e => e.id));
  const facts = new Set(S.filter(s => s.provenance.kind === 'facts' && !s.auto_id).map(s => s.id));
  const characters = new Set(Object.values(docs).filter(d => d.meta.kind === 'character').map(d => d.id));
  const langs = M.languages || [];
  const lineKeys = {};
  for (const lang of langs) {
    const L = pack.lines?.[lang]?.lines;
    if (!L) { errors.push(`lines: no ${lang} file`); lineKeys[lang] = new Set(); continue; }
    lineKeys[lang] = new Set(Object.keys(L));
    for (const [k, v] of Object.entries(L)) {
      if (!Array.isArray(v) || !v.length) errors.push(`lines/${lang}: ${k} is empty`);
      else for (const x of v) {
        if (typeof x === 'string') { if (!x.trim()) errors.push(`lines/${lang}: ${k} has an empty line`); }
        else if (!x || typeof x.text !== 'string' || !characters.has(x.speaker)) errors.push(`lines/${lang}: ${k} has a line with no text or an unknown speaker`);
      }
    }
  }
  const allKeys = new Set(langs.flatMap(l => [...lineKeys[l]]));
  for (const k of allKeys) for (const l of langs) if (!lineKeys[l].has(k)) errors.push(`lines: key ${k} missing in ${l}`);
  const hasLine = k => langs.every(l => lineKeys[l].has(k));
  const types = {
    station: v => stations.has(v), thing: v => things.has(v), fact: v => facts.has(v), line: hasLine,
    beat: v => beats.has(v), ending: v => endings.has(v), cue: v => !!M.cues?.[v], clock: v => !!M.clocks?.[v],
    intent: v => (M.intent_classes || []).includes(v), commit: v => (M.commit_classes || []).includes(v),
    num: v => v !== '' && !isNaN(Number(v)), level: v => LEVELS.includes(v), character: v => characters.has(v),
  };
  const checkCall = (where, call, table, kind) => {
    const sig = table[call.name];
    if (!sig) return errors.push(`${where}: unknown ${kind} ${call.name}`);
    const req = sig.filter(t => !t.startsWith('?')).length;
    if (call.args.length < req || call.args.length > sig.length) return errors.push(`${where}: ${call.name} takes ${sig.length === req ? req : `${req}..${sig.length}`} argument(s), got ${call.args.length}`);
    call.args.forEach((a, i) => {
      const t = sig[i].replace('?', '');
      if (!types[t](a)) errors.push(`${where}: ${call.name}(${call.args.join(', ')}): unknown ${t} "${a}"`);
    });
  };
  const checkRule = (st) => {
    const where = `${st.provenance?.file || st.instance}:${st.line} (${st.id})`;
    if (!st.rule) return;
    checkCall(where, st.rule.event, EVENTS, 'event');
    for (const c of st.rule.conditions) checkCall(where, c, CONDITIONS, 'condition');
    for (const a of st.rule.actions) checkCall(where, a, ACTIONS, 'action');
    if (st.rule.limits.max_fires !== undefined && !(Number(st.rule.limits.max_fires) >= 1)) errors.push(`${where}: max must be >= 1`);
  };

  // patterns
  const library = {};
  for (const [id, t] of Object.entries(libraryTexts || {})) {
    const d = parsePdl(t, `patterns/${id}.pdl`);
    const p = readPattern(d); library[p.id] = p; errors.push(...p.errors);
    if (d.meta.kind !== 'pattern') errors.push(`patterns/${id}.pdl: @kind must be pattern`);
    for (const sec of ['summary', 'roles', 'rules', 'beats_hint', 'variations'])
      if (!d.statements.some(s => s.section === sec)) errors.push(`patterns/${id}.pdl: missing section ${sec}`);
  }
  const instances = [];
  for (const [f, d] of Object.entries(docs)) {
    if (d.meta.kind !== 'pattern-instance') continue;
    const p = library[d.meta.pattern];
    if (!p) { errors.push(`${f}: unknown pattern ${d.meta.pattern}`); continue; }
    const layer = (M.layers || []).find(l => (l.files || []).includes(f));
    const inst = instantiate(d, p);
    errors.push(...inst.errors);
    for (const [role, bs] of Object.entries(inst.bindings)) for (const b of bs)
      if (types[b.type] && !types[b.type](b.value)) errors.push(`${f}: role ${role} bound to unknown ${b.type} "${b.value}"`);
    const prov = { layer: layer?.id, author: d.meta.author || layer?.author, file: f, doc: d.id, kind: 'pattern-instance', pattern: p.id };
    inst.rules.forEach(r => (r.provenance = prov)); inst.principles.forEach(r => (r.provenance = prov));
    instances.push({ id: d.id, pattern: p.id, ...inst });
  }
  const instIds = instances.map(i => i.id).sort();
  if (JSON.stringify(instIds) !== JSON.stringify([...(M.patterns || [])].sort()))
    errors.push(`pack.json patterns [${(M.patterns || []).join(', ')}] do not match instances [${instIds.join(', ')}]`);

  // rules
  const creatorRules = S.filter(s => s.mark === 'when');
  const patternRules = instances.flatMap(i => i.rules);
  const rules = [...creatorRules, ...patternRules];
  const ruleIds = new Set();
  for (const r of rules) { if (ruleIds.has(r.id)) errors.push(`duplicate rule id ${r.id}`); ruleIds.add(r.id); checkRule(r); }

  // characters
  const carrier = M.carrier;
  for (const [f, d] of Object.entries(docs)) {
    if (d.meta.kind !== 'character') continue;
    const st = S.filter(s => s.provenance.doc === d.id && s.provenance.kind === 'character');
    const secs = new Set(d.statements.map(s => s.section));
    if (d.meta.strength === 'strong') {
      const need = d.meta.presence === 'absent' ? ABSENT_SECTIONS : STRONG_SECTIONS;
      for (const s of need) if (!secs.has(s)) errors.push(`${f}: strong character without section ${s}`);
    } else if (d.meta.strength === 'light') {
      if (!d.meta.name) errors.push(`${f}: light character without @name`);
      if (d.statements.length < 1 || d.statements.length > 3) errors.push(`${f}: light character must have 1 to 3 statements`);
      if (secs.size > 1 || [...secs][0]) errors.push(`${f}: light character has no sections`);
    } else if (d.meta.strength !== 'role') errors.push(`${f}: @strength must be strong, light or role`);
    if (d.id === carrier) {
      const c = { '!!': 0, '!': 0, '~w': 0, '?': 0, '>': 0, 'x': 0 };
      for (const s of st) { if (s.mark === '~') { if (s.weight !== undefined) c['~w']++; } else if (s.mark in c) c[s.mark]++; }
      for (const [k, min] of Object.entries(CARRIER_MIN)) if (c[k] < min) errors.push(`${f}: carrier has ${c[k]} "${k}" statements, needs ${min}`);
    }
  }
  if (carrier && !characters.has(carrier)) errors.push(`pack.json: carrier ${carrier} has no character file`);

  // place, stations, beats
  const P = pack.place;
  if (!P) errors.push('place.json missing');
  else {
    const objs = P.objets || [];
    const shapes = objs.reduce((a, o) => a + (o.formes || []).length, 0);
    if (objs.length > 8) errors.push(`place.json: ${objs.length} objects, engine limit 8`);
    if (shapes > 64) errors.push(`place.json: ${shapes} shapes, engine limit 64`);
    for (const o of objs) if ((o.formes || []).length > 24) errors.push(`place.json: object ${o.id} has more than 24 shapes`);
    if (things.size !== objs.length) errors.push('place.json: duplicate object ids');
  }
  const ST = pack.stations?.stations || [];
  if (!ST.length) errors.push('stations.json: no stations');
  if (ST.length && (ST.length < 4 || ST.length > 6)) warnings.push(`stations.json: ${ST.length} stations (v1 frame: 4 to 6)`);
  if (pack.stations && !stations.has(pack.stations.start)) errors.push(`stations.json: start ${pack.stations.start} unknown`);
  for (const s of ST) {
    if (!beats.has(s.beat)) errors.push(`station ${s.id}: unknown beat ${s.beat}`);
    for (const t of [...(s.within_reach || []), ...(s.visible || [])]) if (!things.has(t)) errors.push(`station ${s.id}: unknown thing ${t}`);
    for (const c of s.connects || []) {
      if (!stations.has(c.to)) errors.push(`station ${s.id}: connects to unknown ${c.to}`);
      else if (!ST.find(x => x.id === c.to).connects.some(b => b.to === s.id)) warnings.push(`station ${s.id} -> ${c.to} has no way back`);
      if (c.establishes && !facts.has(c.establishes)) errors.push(`station ${s.id}: establishes unknown fact ${c.establishes}`);
    }
    for (const lang of langs) if (!s.name?.[lang]) errors.push(`station ${s.id}: no ${lang} name`);
    if (s.arrive_line && !hasLine(s.arrive_line)) errors.push(`station ${s.id}: arrive_line ${s.arrive_line} missing`);
  }
  const B = pack.beats;
  if (!B) errors.push('beats.json missing');
  else {
    for (const b of B.beats || []) {
      for (const s of b.stations || []) if (!stations.has(s)) errors.push(`beat ${b.id}: unknown station ${s}`);
      if (b.enter?.station && !stations.has(b.enter.station)) errors.push(`beat ${b.id}: enter at unknown station`);
      for (const f of [...(b.establish || []), ...(b.may_establish || [])]) if (!facts.has(f)) errors.push(`beat ${b.id}: unknown fact ${f}`);
      if (!(b.establish || []).length) errors.push(`beat ${b.id}: establishes no fact`);
      for (const o of b.fork?.options || []) {
        if (!stations.has(o.to)) errors.push(`beat ${b.id}: fork to unknown station ${o.to}`);
        if (!hasLine(o.argue_line)) errors.push(`beat ${b.id}: fork line ${o.argue_line} missing`);
        if (o.establishes && !facts.has(o.establishes)) errors.push(`beat ${b.id}: fork fact ${o.establishes} unknown`);
      }
      const ci = b.commit_invite;
      if (ci) {
        if (!stations.has(ci.where) || !stations.has(ci.tested_at)) errors.push(`beat ${b.id}: commit invite at unknown station`);
        if (!ruleIds.has(ci.tested_by)) errors.push(`beat ${b.id}: commit invite tested by unknown rule ${ci.tested_by}`);
      }
    }
    for (const e of B.endings || []) {
      for (const f of e.requires || []) if (!facts.has(f)) errors.push(`ending ${e.id}: requires unknown fact ${f}`);
      if (e.establishes && !facts.has(e.establishes)) errors.push(`ending ${e.id}: establishes unknown fact ${e.establishes}`);
      if (!hasLine(e.line)) errors.push(`ending ${e.id}: line ${e.line} missing`);
      const triggered = rules.some(r => r.rule?.actions.some(a => a.name === 'ending' && a.args[0] === e.id));
      if (e.trigger === 'rule' && !triggered) warnings.push(`ending ${e.id} is triggered by a rule, and no rule triggers it`);
    }
    if ((B.beats || []).filter(b => b.commit_invite).length < 2) warnings.push('beats: fewer than two moments invite a commitment');
    for (const s of ST) if (!(B.beats || []).some(b => (b.stations || []).includes(s.id))) errors.push(`station ${s.id} belongs to no beat`);
  }

  // bench
  const R = pack.bench?.requests || [];
  const benchTags = {}, benchExpect = {};
  if (pack.bench) {
    if (R.filter(r => !r.tags?.includes('commit')).length < 50) errors.push(`bench: ${R.length} requests, need 50 plus the commitments`);
    const ids = new Set();
    for (const r of R) {
      const w = `bench ${r.id}`;
      if (ids.has(r.id)) errors.push(`${w}: duplicate id`); ids.add(r.id);
      if (!r.fr || !r.en) errors.push(`${w}: needs fr and en`);
      if (!r.tags?.length) errors.push(`${w}: no tags`);
      for (const t of r.tags || []) { if (!BENCH_TAGS.includes(t)) errors.push(`${w}: unknown tag ${t}`); benchTags[t] = (benchTags[t] || 0) + 1; }
      if (!BENCH_EXPECT.includes(r.expect)) errors.push(`${w}: unknown expect ${r.expect}`);
      benchExpect[r.expect] = (benchExpect[r.expect] || 0) + 1;
      if (r.station !== 'any' && !stations.has(r.station)) errors.push(`${w}: unknown station ${r.station}`);
      if (r.tags?.includes('impossible-by-engine') && !r.missing) errors.push(`${w}: impossible-by-engine without "missing"`);
      if (r.tags?.includes('commit') && !['accept', 'amend', 'refuse'].includes(r.commit?.answer)) errors.push(`${w}: commit without commit.answer accept|amend|refuse`);
    }
    if ((benchTags['impossible-by-engine'] || 0) < 8) errors.push('bench: fewer than 8 impossible-by-engine requests');
    if ((benchTags.commit || 0) < 8) errors.push('bench: fewer than 8 commit requests');
  }

  // stats and compiled form
  const marks = {};
  for (const s of [...S, ...instances.flatMap(i => i.principles)]) marks[s.mark] = (marks[s.mark] || 0) + 1;
  const stats = {
    files: Object.keys(docs).length, statements: S.length, marks,
    facts: facts.size, overrides: S.filter(s => s.overrides.length).map(s => `${s.id} (${s.provenance.layer} over ${s.overrides.map(o => o.layer).join(', ')})`),
    rules: { creator: creatorRules.filter(r => r.provenance.layer === 'base').length, contributor: creatorRules.filter(r => r.provenance.layer !== 'base').length, from_patterns: patternRules.length },
    patterns: instances.map(i => `${i.id} <- ${i.pattern}`), stations: ST.length, things: things.size,
    lines: Object.fromEntries(langs.map(l => [l, lineKeys[l].size])), bench: { total: R.length, tags: benchTags, expect: benchExpect },
  };
  const compiled = {
    pack: M.id,
    statements: S.map(({ sectionMeta, ...s }) => s),
    rules: rules.map(r => ({ id: r.id, source: r.text, ...r.rule, provenance: r.provenance })),
    patterns: instances.map(i => ({ id: i.id, pattern: i.pattern, params: i.params, bindings: i.bindings, principles: i.principles.map(p => ({ id: p.id, mark: p.mark, text: p.text })) })),
  };
  return { errors, warnings, stats, compiled };
}

// ---------- CLI ----------

if (import.meta.url === `file://${process.argv[1]}`) {
  const dir = process.argv[2] || 'stories/louis-round';
  const root = new URL('..', import.meta.url).pathname;
  const res = checkPack(loadPack(dir), loadLibrary(join(root, 'patterns')));
  if (process.argv.includes('--json')) { console.log(JSON.stringify(res.compiled, null, 2)); process.exitCode = res.errors.length ? 1 : 0; }
  else {
  const s = res.stats;
  console.log(`pack ${dir}: ${s.files} files, ${s.statements} statements, ${s.facts} facts, ${s.stations} stations, ${s.things} things`);
  console.log(`  marks: ${Object.entries(s.marks).map(([k, v]) => `${k} ${v}`).join(' · ')}`);
  console.log(`  rules: ${s.rules.creator} creator (base) + ${s.rules.contributor} contributor + ${s.rules.from_patterns} from patterns`);
  console.log(`  patterns: ${s.patterns.join(' · ')}`);
  console.log(`  overrides: ${s.overrides.join(' · ') || 'none'}`);
  console.log(`  lines: ${Object.entries(s.lines).map(([k, v]) => `${k} ${v}`).join(' · ')}`);
  console.log(`  bench: ${s.bench.total} requests · ${Object.entries(s.bench.tags).map(([k, v]) => `${k} ${v}`).join(' · ')}`);
  console.log(`  expected: ${Object.entries(s.bench.expect).map(([k, v]) => `${k} ${v}`).join(' · ')}`);
  for (const w of res.warnings) console.log(`warning: ${w}`);
  for (const e of res.errors) console.log(`error: ${e}`);
  console.log(res.errors.length ? `${res.errors.length} error(s)` : 'ok');
  process.exitCode = res.errors.length ? 1 : 0;
  }
}
