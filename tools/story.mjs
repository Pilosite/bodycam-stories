#!/usr/bin/env node
// The creator kit's command line (docs/creator-kit.md): one tool over the real narrative core, no dependency.
// Readable output by default, `--json` on every command.
//
//   node tools/story.mjs check   <pack>                         parse (core/source.js), merge, check every reference
//   node tools/story.mjs build   <pack>                         write <pack>/build/compiled.json
//   node tools/story.mjs explain <pack> <id>                    a statement: strength, layer, author, compiled form, who enforces it, what refers to it
//   node tools/story.mjs play    <pack> --script <file> [--seed n] [--out file] [--verbose]
//                                                               a session in the paper world, heuristic model, journal written
//   node tools/story.mjs replay  <journal>                      re-run a journal: same entries, same hash?
//   node tools/story.mjs whatif  <journal> --pack <pack>        replay against the pack as edited now, and the difference
//   node tools/story.mjs audit   <journal>                      what was asked, repaired, rejected, which rules fired, commitments, gauges
//   node tools/story.mjs journal <journal> [--all]              a journal, readable
//   node tools/story.mjs new     <pack-id> [--author id]        a new pack from stories/_template/
//
// The pure functions are exported (tests/story.test.mjs); the I/O is in the loaders and in main() at the bottom.
// tools/pack-check.mjs is an alias of `check`.

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync, cpSync } from 'node:fs';
import { join, basename, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseSource, readPattern, instantiate, parseRuleText, parseCall, compilePack, compileRule, auditSummary } from '../core/source.js';
import { createSession } from '../core/session.js';
import { createPaperWorld } from '../core/paper-world.js';
import { createClocks } from '../core/clocks.js';
import { replay, diff, fromJSONL, toJSONL } from '../core/journal.js';
import { serializeTokens, DIRS, refId } from '../core/pdl.js';
import { canonicalJSON, hashString } from '../core/world.js';

export const ROOT = fileURLToPath(new URL('..', import.meta.url));
const clone = o => o === undefined ? undefined : JSON.parse(JSON.stringify(o));

/* ================================================================ loading (I/O: the store adapter) */

export function loadLibrary(dir = join(ROOT, 'patterns')) {
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
  const build = existsSync(join(dir, 'build/compiled.json')) ? j('build/compiled.json') : null;
  return { dir, manifest, texts, place: opt(manifest.place), stations: opt(manifest.stations), beats: opt(manifest.beats), lines, bench: opt(manifest.bench), build };
}

/* What the pack's sources hash to: a build records it, check says when the build is stale. */
export function sourceHash(pack, library = {}) {
  const { manifest, texts, place, stations, beats, lines } = pack;
  return hashString(canonicalJSON({ manifest, texts, place, stations, beats, lines, library }));
}

/* ================================================================ check (one parser: core/source.js) */

// The source vocabulary of rules (docs/pdl-spec.md §2.4) with the pack name space each argument must exist in.
// Names are compiled by core/source.js (an unknown name is a compile error there); this table only types arguments.
// '?' marks an optional argument.
export const EVENTS = {
  'session.start': [], 'station.entered': ['station'], 'station.left': ['station'], 'station.dwell': ['station', 'num'],
  'clock.below': ['clock', 'num'], 'clock.every': ['num'], 'time.elapsed': ['num'],
  'look.at': ['thing', '?num'], 'said.matches': ['intent'], 'said.loud': [], 'voice.silent': ['num'],
  'beat.enter': ['beat'], 'fact.established': ['fact'], sound: ['?cue'], gauge: ['gauge', '?word'],
};
export const CONDITIONS = {
  fact: ['fact'], beat: ['beat'], at: ['station'], within_reach: ['thing'], 'ending.any': [], ending: ['ending'],
  'clock.below': ['clock', 'num'], promised: ['commit'], gauge: ['gauge', '?word'], near: ['ref', 'ref', 'num'], scene: ['any'],
};
export const ACTIONS = {
  say: ['line'], reveal: ['fact'], beat: ['beat'], ending: ['ending'], go: ['station'],
  'light.raise': ['num'], sound: ['cue', '?ref'], 'image.degrade': ['num'], 'speech.volume': ['level'],
  'speech.shorten': ['num'], 'body.posture': ['num'], 'body.stop': [], 'camera.off': [], fact: ['any', 'any', '?any'],
};
const LEVELS = ['whisper', 'low', 'normal'];
const ROLE_TYPES = ['character', 'thing', 'station', 'fact', 'line', 'cue', 'clock', 'ending', 'beat'];
export const BENCH_TAGS = ['movement', 'look', 'touch', 'make', 'talk', 'louis', 'emotional', 'refusal-worthy',
  'out-of-world', 'impossible-by-engine', 'commit', 'v2'];
export const BENCH_EXPECT = ['does-it', 'partly-says-so', 'argues', 'refuses-in-character', 'deflects'];
export const CARRIER_MIN = { '!!': 3, '!': 6, '~w': 12, '?': 6, '>': 20, 'x': 8 };
const STRONG_SECTIONS = ['voice', 'knows', 'does-not-know', 'limits', 'secrets', 'arc', 'body'];
const ABSENT_SECTIONS = ['identity', 'traces'];

/* The mark a creator wrote, from a principle record. */
export const markOf = p => ({ absolute: '!!', tendency: '~', open: '?', example: '>', counter: 'x', gauge: 'gauge' })[p.strength] || (p.form === 'explicit' ? 'when' : '!');
export const isRule = p => p.strength === 'hard' && p.form === 'explicit';

/* core/source.js errors → one readable line each. */
const WHY = {
  missing_header: 'missing header "# <id> — <title>" before content', bad_header: 'malformed header', second_header: 'second header',
  unknown_line: 'unknown line (not a statement, rule, gauge, metadata or comment)', weight_out_of_range: 'weight out of 0..1',
  open_question_without_note: 'open question without a guiding note ("-- note")', example_without_lines: 'example needs "<lang>: …" lines',
  counter_example_without_why: 'counter-example without "| why: …"', example_with_why: 'example with a "why" (only counter-examples have one)',
  empty_or_headerless: 'empty or headerless file', missing_file: 'listed in pack.json, file not found', bad_role: 'role needs "name : type : description"',
  bad_param: 'param needs "name = value"', unknown_param: 'unknown param',
};
export function formatError(e, docs = {}) {
  if (typeof e === 'string') return e;
  const at = `${e.file}${e.line ? ':' + e.line : ''}`;
  switch (e.why) {
    case 'compile_error': return `${at} (${e.id}): ${e.message}`;
    case 'duplicate_id': return `${at}: duplicate id ${e.value} in the same layer`;
    case 'unknown_pattern': return `${at}: unknown pattern ${e.value}`;
    case 'unknown_role': return `${at}: pattern ${(docs[e.file] && docs[e.file].meta.pattern) || '?'} has no role ${e.value}`;
    case 'unbound_role': { const d = docs[e.file]; return `${d ? d.id : e.file}: role ${e.value} of ${d ? d.meta.pattern : '?'} is not bound`; }
    case 'unbound_variable': return `${at}: a statement keeps an unbound $variable: ${e.value}`;
  }
  return `${at}: ${WHY[e.why] || e.why}${e.value !== undefined ? ' ' + e.value : ''}`;
}

/* Check a loaded pack against a pattern library (id → text). Returns { errors, warnings, stats, compiled }.
   Parsing, pattern instantiation, layer merging and compilation are core/source.js (compilePack); this adds the checks
   across the pack's files: every reference exists, speech in every language, the shape of characters, places, stations,
   beats and the bench. */
export function checkPack(pack, library = {}) {
  const errors = [], warnings = [];
  const M = pack.manifest || {};
  for (const k of ['id', 'title', 'languages', 'authors', 'layers', 'patterns'])
    if (M[k] === undefined) errors.push(`pack.json: missing ${k}`);
  for (const lang of M.languages || []) if (!M.title?.[lang]) errors.push(`pack.json: title has no ${lang}`);
  if (!(M.layers || []).some(l => l.id === 'base')) errors.push('pack.json: no base layer');
  const authorIds = new Set((M.authors || []).map(a => a.id));

  const c = compilePack(pack, library);
  const docs = {};
  for (const [f, t] of Object.entries(pack.texts)) docs[f] = parseSource(t, { file: f });
  errors.push(...c.errors.map(e => formatError(e, docs)));
  for (const l of M.layers || []) {
    if (!authorIds.has(l.author)) errors.push(`layer ${l.id}: author ${l.author} not in pack authors`);
    for (const f of l.files || []) {
      const d = docs[f]; if (!d) continue;
      if (d.meta.author && !authorIds.has(d.meta.author)) errors.push(`${f}: author ${d.meta.author} not in pack authors`);
      if (d.meta.layer !== l.id) errors.push(`${f}: @layer "${d.meta.layer}" but listed in layer "${l.id}"`);
    }
  }
  const P = c.principles;

  // name spaces
  const things = new Set((pack.place?.objets || []).map(o => o.id));
  const stations = new Set((pack.stations?.stations || []).map(s => s.id));
  const beats = new Set((pack.beats?.beats || []).map(b => b.id));
  const endings = new Set((pack.beats?.endings || []).map(e => e.id));
  const facts = new Set(P.filter(p => p.doc_kind === 'facts' && !p.auto_id).map(p => p.id));
  const gauges = new Set(P.filter(p => p.strength === 'gauge').map(p => p.id));
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
    gauge: v => gauges.has(v), word: v => ['low', 'medium', 'high'].includes(v), any: () => true,
    ref: v => v === 'body' || /^(thing|station|dir):/.test(v) || things.has(v) || stations.has(v),
  };
  const checkCall = (where, call, table, kind) => {
    if (!call) return;
    const sig = table[call.name];
    if (!sig) return;                         // not a source name: compiled by core as a vocabulary op, or a compile error there
    const req = sig.filter(t => !t.startsWith('?')).length;
    if (call.args.length < req || call.args.length > sig.length) return errors.push(`${where}: ${call.name} takes ${sig.length === req ? req : `${req}..${sig.length}`} argument(s), got ${call.args.length}`);
    call.args.forEach((a, i) => {
      const t = sig[i].replace('?', '');
      if (!types[t](a)) errors.push(`${where}: ${call.name}(${call.args.join(', ')}): unknown ${t} "${a}"`);
    });
  };
  const whereOf = p => `${p.source.file}:${p.source.line} (${p.id})`;

  // pattern library
  const lib = {};
  for (const [id, t] of Object.entries(library)) {
    const d = parseSource(t, { file: `patterns/${id}.pdl` });
    const p = readPattern(d); lib[p.id] = p;
    for (const [name, r] of Object.entries(p.roles)) if (!ROLE_TYPES.includes(r.type)) errors.push(`patterns/${id}.pdl: role ${name} has unknown type ${r.type}`);
    if (d.meta.kind !== 'pattern') errors.push(`patterns/${id}.pdl: @kind must be pattern`);
    for (const sec of ['summary', 'roles', 'rules', 'beats_hint', 'variations'])
      if (!d.statements.some(s => s.section === sec)) errors.push(`patterns/${id}.pdl: missing section ${sec}`);
  }
  const instances = [];
  for (const [f, d] of Object.entries(docs)) {
    if (d.meta.kind !== 'pattern-instance' || !lib[d.meta.pattern]) continue;
    const p = lib[d.meta.pattern], inst = instantiate(d, p);
    for (const [role, bs] of Object.entries(inst.bindings)) {
      if (!p.roles[role].many && bs.length > 1) errors.push(`${d.id}: role ${role} bound ${bs.length} times (single role)`);
      const t = p.roles[role].type;
      for (const b of bs) if (types[t] && !types[t](b.value)) errors.push(`${f}: role ${role} bound to unknown ${t} "${b.value}"`);
    }
    instances.push({ id: d.id, pattern: p.id, file: f, params: inst.params, bindings: inst.bindings });
  }
  const instIds = instances.map(i => i.id).sort();
  if (JSON.stringify(instIds) !== JSON.stringify([...(M.patterns || [])].sort()))
    errors.push(`pack.json patterns [${(M.patterns || []).join(', ')}] do not match instances [${instIds.join(', ')}]`);

  // rules, absolutes and gauges written explicitly: every argument names something of the pack
  const rules = P.filter(isRule);
  const parsed = new Map();
  for (const p of rules) {
    const r = parseRuleText(p.text);
    if (r.error) continue;                    // reported by core as a compile error
    parsed.set(p.id, r);
    checkCall(whereOf(p), r.event, EVENTS, 'event');
    for (const x of r.conditions) checkCall(whereOf(p), x, CONDITIONS, 'condition');
    for (const x of r.actions) checkCall(whereOf(p), x, ACTIONS, 'action');
  }
  for (const p of P.filter(p => p.strength === 'absolute' && p.form === 'explicit')) {
    const s = p.text.replace(/^never\s+/, ''), k = s.search(/\sif\s/);
    checkCall(whereOf(p), parseCall(k < 0 ? s : s.slice(0, k)), ACTIONS, 'action');
    if (k >= 0) for (const x of s.slice(k).replace(/^\s*if\s+/, '').split(/\s+and\s+/)) checkCall(whereOf(p), parseCall(x), CONDITIONS, 'condition');
  }
  for (const p of P.filter(p => p.strength === 'gauge')) for (const m of p.text.matchAll(/rises\s+(.+?)\s+by\s+[\d.]+(?:\s+if\s+([^;]+))?/g)) {
    checkCall(whereOf(p), parseCall(m[1]), EVENTS, 'event');
    for (const x of (m[2] || '').split(/\s+and\s+/).filter(Boolean)) checkCall(whereOf(p), parseCall(x.trim()), CONDITIONS, 'condition');
  }
  const ruleIds = new Set(rules.map(r => r.id));

  // speech in every language of the pack
  for (const p of P.filter(p => p.strength === 'example' || p.strength === 'counter'))
    for (const l of langs) if (!p.lines?.[l]) errors.push(`${p.source.file}:${p.source.line}: ${p.strength === 'example' ? 'example' : 'counter-example'} has no "${l}:" line`);

  // characters
  const carrier = M.carrier;
  for (const [f, d] of Object.entries(docs)) {
    if (d.meta.kind !== 'character') continue;
    const st = P.filter(p => p.doc === d.id && p.doc_kind === 'character');
    const secs = new Set(d.statements.map(s => s.section));
    if (d.meta.strength === 'strong') {
      const need = d.meta.presence === 'absent' ? ABSENT_SECTIONS : STRONG_SECTIONS;
      for (const s of need) if (!secs.has(s)) errors.push(`${f}: strong character without section ${s}`);
    } else if (d.meta.strength === 'light') {
      if (!d.meta.name) errors.push(`${f}: light character without @name`);
      if (d.statements.length < 1 || d.statements.length > 3) errors.push(`${f}: light character must have 1 to 3 statements`);
      if (secs.size > 1 || [...secs][0]) errors.push(`${f}: light character has no sections`);
    } else if (d.meta.strength !== 'role') errors.push(`${f}: @strength must be strong, light or role`);
    if (d.id === carrier && d.meta.strength === 'strong') {
      const n = { '!!': 0, '!': 0, '~w': 0, '?': 0, '>': 0, 'x': 0 };
      for (const p of st) { const m = markOf(p); if (m === '~') { if (p.weight !== undefined) n['~w']++; } else if (m in n) n[m]++; }
      for (const [k, min] of Object.entries(CARRIER_MIN)) if (n[k] < min) errors.push(`${f}: carrier has ${n[k]} "${k}" statements, needs ${min}`);
    }
  }
  if (carrier && !characters.has(carrier)) errors.push(`pack.json: carrier ${carrier} has no character file`);

  // place, stations, beats
  const PL = pack.place;
  if (!PL) errors.push('place.json missing');
  else {
    const objs = PL.objets || [];
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
    for (const k of s.connects || []) {
      if (!stations.has(k.to)) errors.push(`station ${s.id}: connects to unknown ${k.to}`);
      else if (!(ST.find(x => x.id === k.to).connects || []).some(b => b.to === s.id)) warnings.push(`station ${s.id} -> ${k.to} has no way back`);
      if (k.establishes && !facts.has(k.establishes)) errors.push(`station ${s.id}: establishes unknown fact ${k.establishes}`);
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
      const triggered = [...parsed.values()].some(r => r.actions.some(a => a.name === 'ending' && a.args[0] === e.id));
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
      for (const l of langs) if (!r[l]) errors.push(`${w}: needs ${l}`);
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

  // what is not enforced yet, and a stale build
  const toCompile = P.filter(p => p.compiled && p.compiled.status === 'to_compile' && p.doc_kind !== 'facts').map(p => p.id);
  const hash = sourceHash(pack, library);
  if (pack.build && pack.build.source_hash !== hash) warnings.push('build/compiled.json is older than the sources: run `story build`');

  // stats and compiled form
  const marks = {};
  for (const p of P) { const m = markOf(p); marks[m] = (marks[m] || 0) + 1; }
  for (const d of Object.values(docs)) for (const s of d.statements) if (s.mark === 'bind' || s.mark === 'set') marks[s.mark] = (marks[s.mark] || 0) + 1;
  const prov = p => Object.assign({ layer: p.layer, author: p.author.id, file: p.source.file, doc: p.doc }, p.pattern ? { pattern: p.pattern, instance: p.instance } : {});
  const stats = {
    files: Object.keys(docs).length, statements: P.length, marks,
    facts: facts.size, overrides: P.filter(p => p.overrides).map(p => `${p.id} (${p.layer} over ${p.overrides.map(o => o.layer).join(', ')})`),
    rules: { creator: rules.filter(r => !r.pattern && r.layer === 'base').length, contributor: rules.filter(r => !r.pattern && r.layer !== 'base').length, from_patterns: rules.filter(r => r.pattern).length },
    patterns: instances.map(i => `${i.id} <- ${i.pattern}`), stations: ST.length, things: things.size,
    lines: Object.fromEntries(langs.map(l => [l, lineKeys[l].size])), bench: { total: R.length, tags: benchTags, expect: benchExpect },
    to_compile: toCompile.length,
  };
  const compiled = {
    format: 0, pack: M.id, source_hash: hash,
    principles: P, scene: c.scene,
    rules: rules.map(r => ({ id: r.id, source: r.text, status: r.compiled.status, body: r.compiled.body, provenance: prov(r) })),
    patterns: instances.map(i => ({ id: i.id, pattern: i.pattern, params: i.params, bindings: i.bindings })),
    to_compile: toCompile,
  };
  return { errors, warnings, stats, compiled };
}

/* Compiled forms a model proposed or a creator approved are kept while the statement's text is unchanged (the build
   cache, docs/architecture.md "Compilation"). Returns the ids carried over. */
export function carryCompiled(previous = [], principles = []) {
  const old = new Map(previous.map(p => [p.id, p])), carried = [];
  for (const p of principles) {
    const o = old.get(p.id);
    if (!p.compiled || p.compiled.status !== 'to_compile' || !o || !o.compiled) continue;
    if (!['proposed', 'approved'].includes(o.compiled.status) || o.text !== p.text || o.strength !== p.strength) continue;
    p.compiled = clone(o.compiled); carried.push(p.id);
  }
  return carried;
}

/* The pack as the session sees it: compiled from source, with the build's approved forms carried over. */
export function compileForPlay(pack, library) {
  const r = checkPack(pack, library);
  const carried = carryCompiled(pack.build ? pack.build.principles : [], r.compiled.principles);
  return Object.assign(r, { carried });
}

/* ================================================================ explain */

const esc = s => s.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&');
const mentionsId = (text, id) => new RegExp(`(^|[^A-Za-z0-9_.-])${esc(id)}($|[^A-Za-z0-9_-]|\\.(?![A-Za-z0-9]))`).test(text || '');

export function enforcedBy(p) {
  const st = p.compiled && p.compiled.status;
  const live = st === 'compiled' || st === 'approved';
  if (p.doc_kind === 'facts' && !live) return p.strength === 'absolute' ? 'canon: nothing in the story may contradict it; no constraint compiled yet, so nothing checks it in code'
    : p.strength === 'hard' ? 'a fact of the story, true and revealable: it becomes a world fact when a rule, a station or a model reveals it'
      : p.strength === 'open' ? 'left open on purpose: the models decide in play, guided by the note' : enforcedByStrength(p, st, live);
  return enforcedByStrength(p, st, live);
}
function enforcedByStrength(p, st, live) {
  switch (p.strength) {
    case 'absolute': return live ? `the validator: a transaction matching the constraint is rejected, whoever wrote it (${st}${p.compiled.by ? ' by ' + p.compiled.by : ''})`
      : st === 'proposed' ? 'nobody yet: a model proposed a constraint, it waits for a creator to approve it'
        : 'nobody yet: prose absolute, waits for a model to compile it at pack build and a creator to approve it (not enforced, not sent to the models)';
    case 'hard': return live ? `code: a rule, registered at session start, fires without any model (${st}${p.compiled.by ? ' by ' + p.compiled.by : ''})`
      : st === 'error' ? `nobody: the rule does not compile (${p.compiled.error})`
        : st === 'proposed' ? 'nobody yet: a model proposed a rule, it waits for a creator to approve it'
          : 'nobody yet: prose hard statement, waits for a model to compile it into a rule and a creator to approve it (not enforced)';
    case 'tendency': return `the models, in context, on every call where it is in scope (${p.scope}); weighed${p.weight !== undefined ? ' at ' + p.weight : ''}, audited afterwards`;
    case 'open': return `the models decide, guided by the note, on every call where it is in scope (${p.scope})`;
    case 'example': case 'counter': return `calibrates the soft statements of ${p.doc}; doubles as an audit probe`;
    case 'gauge': return 'code: the gauge rises on its events and fades with time; rules test its word, models see its value when a principle mentions it';
  }
  return '?';
}

/* Everything the pack says about one id: a principle (statement, rule, fact, gauge), a line key, a station, a thing,
   a beat, an ending or a cue; and what refers to it. */
export function explain(pack, library, id) {
  const r = compileForPlay(pack, library), P = r.compiled.principles;
  const p = P.find(x => x.id === id);
  const refs = [];
  for (const q of P) if (q.id !== id && mentionsId([q.text, q.note].join(' '), id)) refs.push({ where: `${q.source.file}:${q.source.line}`, id: q.id, mark: markOf(q), text: q.text });
  const B = pack.beats || {}, S = pack.stations?.stations || [];
  for (const b of B.beats || []) {
    if ((b.establish || []).includes(id)) refs.push({ where: 'beats.json', id: b.id, text: `beat ${b.id} establishes it` });
    if ((b.may_establish || []).includes(id)) refs.push({ where: 'beats.json', id: b.id, text: `beat ${b.id} may establish it` });
    if (b.commit_invite?.tested_by === id) refs.push({ where: 'beats.json', id: b.id, text: `tests the commitment invited at ${b.commit_invite.where} (${b.commit_invite.id}), at ${b.commit_invite.tested_at}` });
    if (b.stations?.includes(id)) refs.push({ where: 'beats.json', id: b.id, text: `station of beat ${b.id}` });
    for (const o of b.fork?.options || []) if (o.establishes === id || o.argue_line === id || o.to === id) refs.push({ where: 'beats.json', id: b.id, text: `fork option via ${o.via} (${o.argue_line})` });
  }
  for (const e of B.endings || []) if ((e.requires || []).includes(id) || e.establishes === id || e.line === id) refs.push({ where: 'beats.json', id: e.id, text: `ending ${e.id}${(e.requires || []).includes(id) ? ' requires it' : e.line === id ? ' says it' : ' establishes it'}` });
  for (const s of S) {
    for (const k of s.connects || []) if (k.establishes === id || k.to === id) refs.push({ where: 'stations.json', id: s.id, text: `${s.id} -> ${k.to}${k.via ? ' by ' + k.via : ''}${k.establishes === id ? ' establishes it' : ''}` });
    if (s.arrive_line === id) refs.push({ where: 'stations.json', id: s.id, text: `said on arrival at ${s.id}` });
    if ((s.within_reach || []).includes(id) || (s.visible || []).includes(id)) refs.push({ where: 'stations.json', id: s.id, text: `${(s.within_reach || []).includes(id) ? 'within reach' : 'visible'} at ${s.id}` });
  }
  for (const i of r.compiled.patterns) for (const [role, bs] of Object.entries(i.bindings)) for (const b of bs)
    if (b.value === id || Object.values(b.attrs || {}).includes(id)) refs.push({ where: i.id, id: i.id, text: `bound in pattern ${i.pattern} as ${role}${b.value === id ? '' : ' (' + Object.entries(b.attrs).filter(([, v]) => v === id).map(([k]) => k).join(', ') + ')'}` });
  const out = { id, refs };
  if (p) {
    Object.assign(out, { found: 'statement', mark: markOf(p), strength: p.strength, form: p.form, weight: p.weight, text: p.text, note: p.note, lines: p.lines, why: p.why,
      scope: p.scope, horizon: p.horizon, layer: p.layer, author: p.author.id, source: `${p.source.file}:${p.source.line}`, overrides: p.overrides,
      pattern: p.pattern, instance: p.instance, doc_kind: p.doc_kind, compiled: p.compiled, enforced_by: enforcedBy(p), carried: r.carried.includes(id) });
    return out;
  }
  const L = Object.fromEntries(Object.entries(pack.lines || {}).map(([l, f]) => [l, f?.lines?.[id]]).filter(([, v]) => v));
  if (Object.keys(L).length) return Object.assign(out, { found: 'line', lines: L });
  const st = S.find(s => s.id === id); if (st) return Object.assign(out, { found: 'station', station: st });
  const th = (pack.place?.objets || []).find(o => o.id === id); if (th) return Object.assign(out, { found: 'thing', thing: { id: th.id, nom: th.nom, shapes: (th.formes || []).length } });
  const bt = (B.beats || []).find(b => b.id === id); if (bt) return Object.assign(out, { found: 'beat', beat: bt });
  const en = (B.endings || []).find(e => e.id === id); if (en) return Object.assign(out, { found: 'ending', ending: en });
  if (pack.manifest.cues?.[id]) return Object.assign(out, { found: 'cue', cue: pack.manifest.cues[id] });
  return Object.assign(out, { found: null, near: P.map(q => q.id).filter(x => x.includes(id) || id.includes(x)).slice(0, 10) });
}

/* ================================================================ play: scripts, the heuristic model, exchanges */

/* A play script: things said and time passing (docs/creator-kit.md "Play scripts").
     # comment                  lang fr                  wait 30                  look marque-1 3
     say regarde ce trait orange                        the heuristic model guesses the intent
     say! ARRÊTE                                        said loudly
     say regarde ce trait orange => look marque-1       the intent pinned, as the translation tier would answer
     say si le geai crie, arrête-toi => commit jay amend
       when sound(jay.alarm) -> body.stop, say(commit.keeping)     the promised rule, in source grammar (indented)
   A JSON array of { say, lang?, loud?, pin?: { verb, target?, class?, answer?, ... }, rule? } | { wait } | { look, s? } is
   accepted too. Returns { steps, errors }. */
export function parseScript(text) {
  const steps = [], errors = [];
  const src = String(text);
  if (src.trim().startsWith('[')) {
    for (const [i, x] of JSON.parse(src).entries()) {
      if (x.say !== undefined) steps.push({ kind: 'say', text: String(x.say), lang: x.lang || null, loud: !!x.loud, pin: x.pin || null, rule: x.rule || null, line: i + 1 });
      else if (x.wait !== undefined) steps.push({ kind: 'wait', seconds: Number(x.wait), line: i + 1 });
      else if (x.look !== undefined) steps.push({ kind: 'look', target: String(x.look), seconds: Number(x.s || 0), line: i + 1 });
      else errors.push({ line: i + 1, why: 'unknown step' });
    }
    return { steps, errors };
  }
  let lang = null;
  src.split(/\r?\n/).forEach((raw, i) => {
    const line = i + 1, s = raw.trim();
    if (!s || s.startsWith('#') || s.startsWith('//')) return;
    let m;
    if (/^\s/.test(raw) && s.startsWith('when ')) {
      const prev = steps[steps.length - 1];
      if (!prev || prev.kind !== 'say' || !prev.pin || prev.pin.verb !== 'commit') errors.push({ line, why: 'a rule line must follow a "say … => commit …" line' });
      else prev.rule = s;
    } else if ((m = /^lang\s+([a-z]{2})$/.exec(s))) lang = m[1];
    else if ((m = /^wait\s+(\d+(?:\.\d+)?)\s*s?$/.exec(s))) steps.push({ kind: 'wait', seconds: +m[1], line });
    else if ((m = /^look\s+(\S+)(?:\s+(\d+(?:\.\d+)?)\s*s?)?$/.exec(s))) steps.push({ kind: 'look', target: m[1], seconds: m[2] ? +m[2] : 0, line });
    else if ((m = /^say(!?)\s+(.+)$/.exec(s))) {
      const k = m[2].indexOf(' => ');
      const step = { kind: 'say', text: (k < 0 ? m[2] : m[2].slice(0, k)).trim(), lang, loud: m[1] === '!', pin: null, rule: null, line };
      if (k >= 0) step.pin = parsePin(m[2].slice(k + 4).trim());
      if (step.pin && step.pin.error) { errors.push({ line, why: step.pin.error }); step.pin = null; }
      steps.push(step);
    } else errors.push({ line, why: `unknown line "${s.slice(0, 40)}"` });
  });
  return { steps, errors };
}
const VERBS = ['look', 'turn', 'posture', 'touch', 'take', 'shape', 'make', 'wait', 'stop', 'say', 'go', 'commit', 'ask', 'other'];
export function parsePin(s) {
  const [verb, ...rest] = s.split(/\s+/);
  if (!VERBS.includes(verb)) return { error: `unknown verb "${verb}" (one of ${VERBS.join(' ')})` };
  const pin = { verb };
  for (const w of rest) {
    const kv = /^([a-z_]+)=(.+)$/.exec(w);
    if (kv) pin[kv[1]] = /^-?\d+(\.\d+)?$/.test(kv[2]) ? +kv[2] : kv[2];
    else if (['accept', 'amend', 'refuse'].includes(w)) pin.answer = w;
    else if (['hard', 'tendency'].includes(w)) pin.strength = w;
    else if (w === 'loud') pin.loud = true;
    else if (verb === 'commit' && !pin.class) pin.class = w;
    else if (!pin.target) pin.target = w;
    else return { error: `unexpected "${w}"` };
  }
  return pin;
}

/* A bare id → a reference of the scene: thing, station or direction. */
export function refFor(scene, v) {
  if (!v || v === 'body' || /^(thing|station|dir):/.test(v)) return v;
  if ((scene.things || []).some(t => t.id === v)) return 'thing:' + v;
  if ((scene.stations || []).some(t => t.id === v)) return 'station:' + v;
  if (DIRS.includes(v)) return 'dir:' + v;
  return 'thing:' + v;                         // unknown: the validator will say so
}

/* The heuristic model: the last link of the fallback chain (docs/architecture.md, decision points), a lexicon and the
   pack's names, no model at all. It implements the model port (embed, decide, generate). A pinned intent from the script
   is the canned answer (docs/sdlc.md §3). It is crude on purpose: what it guesses is marked `m:heuristic` in the journal. */
const LEX = [
  ['commit', /^(si|s'il|s’il|quand|dès que|des que|if|when|whenever|as soon as)\b/i],
  ['stop', /\b(arr[êe]te|stop|halt|bouge plus|freeze)\b/i],
  ['wait', /\b(attends|patiente|wait|hold on)\b/i],
  ['go', /\b(vas-y|avance|continue|on y va|allons|descends|monte|go|move on|keep going|walk|let's go|follow)\b/i],
  ['look', /\b(regarde|montre|vois|filme|look|show|see|film)\b/i],
  ['touch', /\b(touche|tâte|tate|touch|feel)\b/i],
  ['take', /\b(prends|ramasse|take|pick)\b/i],
  ['posture', /\b(baisse|accroupis|assieds|lève-toi|crouch|get down|sit|stand up)\b/i],
  ['make', /\b(fais|construis|empile|make|build|stack)\b/i],
];
const words = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9]+/).filter(w => w.length >= 4);
export function guessIntent(text, { scene, manifest = {}, station } = {}) {
  const t = String(text), low = t.toLowerCase();
  const verb = (LEX.find(([, re]) => re.test(t)) || [])[0] || (/\?\s*$/.test(t) ? 'ask' : 'other');
  const out = { verb };
  const has = id => new RegExp(`\\b${esc(id)}\\b`, 'i').test(low);
  const cls = verb === 'commit' ? manifest.commit_classes : manifest.intent_classes;
  const c = (cls || []).find(has); if (c) out.class = c;
  if (t.length > 3 && t === t.toUpperCase() && /[A-Z]/.test(t)) out.loud = true;
  if (['look', 'touch', 'take'].includes(verb)) {
    const w = new Set(words(t));
    const hit = (scene.things || []).map(th => ({ th, n: words(th.name + ' ' + th.id).filter(x => w.has(x)).length })).filter(x => x.n).sort((a, b) => b.n - a.n)[0];
    if (hit) out.target = 'thing:' + hit.th.id;
  }
  if (verb === 'go') out.target = 'station:' + nextStation(scene, station);
  if (verb === 'commit') {
    const k = t.indexOf(',');
    out.condition = (k > 0 ? t.slice(0, k) : t).replace(LEX[0][1], '').trim().slice(0, 200) || t.slice(0, 200);
    out.behaviour = (k > 0 ? t.slice(k + 1) : t).trim().slice(0, 200);
  }
  return out;
}
/* Forward along the path: the first adjacent station that comes later in stations.json, else the first adjacent one. */
export function nextStation(scene, from) {
  const S = scene.stations || [], i = S.findIndex(s => s.id === from), here = S[i];
  if (!here) return from;
  const next = [...new Set((here.edges || []).map(e => e.to).concat(here.next || []))];
  return next.find(id => S.findIndex(s => s.id === id) > i) || next[0] || from;
}

export function heuristicModel({ session, manifest = {}, scene }) {
  const H = { kind: 'model', id: 'heuristic', tier: 'translate' }, P = { kind: 'player', id: 'player' };
  const carrier = manifest.carrier || 'character';
  let commits = 0;
  const m = {
    step: null, notes: [],
    embed: async texts => texts.map(() => []),
    async decide(req) {
      const w = session.world, step = m.step || {};
      if (req.question === 'intent') {
        const pin = step.pin;
        const a = pin ? Object.assign({ verb: pin.verb }, pin.target ? { target: refFor(scene, pin.target) } : {}, pin.class ? { class: String(pin.class) } : {}) : guessIntent(req.text, { scene, manifest, station: w.body.station });
        if (pin && pin.verb === 'go' && !a.target) a.target = 'station:' + nextStation(scene, w.body.station);
        if (pin && pin.verb === 'commit') {
          const g = guessIntent(req.text, { scene, manifest });
          a.condition = String(pin.condition || g.condition || req.text).slice(0, 200); a.behaviour = String(pin.behaviour || g.behaviour || req.text).slice(0, 200);
        }
        if (step.loud || (pin && pin.loud)) a.loud = true;
        if (a.verb === 'commit') a.commit = 'c.' + (a.class || ++commits);
        return { answer: a, p: pin ? 1 : 0.4 };
      }
      if (req.question === 'reaction') return { answer: serializeTokens(m.reaction(req.state.intent, step)) };
      throw new Error('heuristic model: no answer for ' + req.question);
    },
    generate: async () => ({ tokens: '' }),       // no staging tier: the scene loop lands with nothing to add
    /* What she does at once: the act the intent asks for, a line of the pack's bank when it has one. */
    reaction(intent, step) {
      const w = session.world, lines = w.vocab.lines || {}, pin = step.pin || {};
      const act = (op, f = {}) => ({ author: H, horizon: 'now', kind: 'act', body: Object.assign({ op }, f) });
      const say = ref => lines[ref] ? [act('say', { ref })] : [];
      const v = intent.verb, out = [];
      if (v === 'go') out.push(act('go', Object.assign({ to: intent.target }, pin.via ? { via: String(pin.via) } : {})), ...say('move.ok'));
      else if (v === 'look' && intent.target) out.push(act('look', { target: intent.target }), ...say('look.ok'));
      else if ((v === 'touch' || v === 'take') && intent.target) out.push(act(v, { target: intent.target }), ...say(v + '.ok'));
      else if (v === 'stop') out.push(act('stop'));
      else if (v === 'wait') out.push(act('wait', { seconds: 3 }));
      else if (v === 'posture') out.push(act('posture', { height: Number(pin.height) || 0.55 }));
      else if (v === 'commit') {
        const answer = pin.answer || 'accept', status = { accept: 'accepted', amend: 'amended', refuse: 'refused' }[answer];
        const id = intent.commit, strength = pin.strength || 'hard';
        out.push(...say('commit.' + answer));
        out.push({ author: P, horizon: 'story', kind: 'fact', body: { subject: carrier, predicate: 'promised', value: String(intent.behaviour).slice(0, 120), commit: { id, party: carrier, status, strength } } });
        if (status !== 'refused') {
          if (step.rule) {
            const ctx = { things: new Set((scene.things || []).map(t => t.id)), clocks: { battery: 'camera.battery' } };
            out.push({ author: P, horizon: 'story', kind: 'rule', body: Object.assign(compileRule(id, step.rule, ctx), { commit: id }, strength === 'tendency' ? { strength } : {}) });
          } else m.notes.push(`${id}: no rule for this promise (the heuristic writes none); pin one under the say line: "  when … -> …"`);
        }
      }
      return out;
    },
  };
  return m;
}

/* Runs a script in the paper world: the real session, the real three clocks, the heuristic model.
   Returns { session, compiled, exchanges: [{ step, from, to }], notes }. Latencies are not measured (clock fixed at 0). */
export async function play(pack, library, steps, { seed = 1 } = {}) {
  const r = compileForPlay(pack, library);
  if (r.errors.length) throw new Error(`the pack does not check: ${r.errors.length} error(s), first: ${r.errors[0]}`);
  const scene = r.compiled.scene, M = pack.manifest;
  const S = createSession({ scene, seed, executor: createPaperWorld() });
  const model = heuristicModel({ session: S, manifest: M, scene });
  const clocks = createClocks({ session: S, model, character: M.carrier || null, clock: () => 0 });
  const J = S.journal.entries, exchanges = [];
  let from = J.length;
  S.loadPrinciples(r.compiled.principles);
  S.start();
  exchanges.push({ step: { kind: 'start' }, from, to: J.length });
  for (const step of steps) {
    from = J.length;
    if (step.kind === 'say') {
      model.step = step;
      const lang = step.lang || (M.languages || ['en'])[0];
      const h = await clocks.hear({ text: step.text, lang, loud: step.loud || undefined });
      await h.scene;
      model.step = null;
    } else if (step.kind === 'wait') {
      for (let left = step.seconds; left > 1e-9; left -= 5) S.advance(Math.min(5, left));
    } else if (step.kind === 'look') S.observe({ event: 'look.at', data: { target: refFor(scene, step.target), s: step.seconds || 0 } });
    exchanges.push({ step, from, to: J.length });
  }
  S.checkpoint();
  return { session: S, compiled: r.compiled, carried: r.carried, exchanges, notes: model.notes };
}

/* ================================================================ reading journals */

/* What a journal knows about its rules and principles, to say "why" next to a firing. */
export function contextOf(entries) {
  const principles = {}, rules = {};
  for (const e of entries) {
    if (e.type === 'principles') for (const p of e.records) principles[p.id] = p;
    if (e.type === 'tx' && e.kind === 'rule' && e.status !== 'rejected') rules[e.body.id] = { author: e.author, principle: e.body.principle, when: e.body.when, commit: e.body.commit, seq: e.seq };
  }
  const head = entries[0] && entries[0].type === 'session' ? entries[0] : {};
  return { principles, rules, langs: (head.scene && head.scene.langs) || ['en'], lines: (head.scene && head.scene.vocab && head.scene.vocab.lines) || {} };
}
const who = a => !a ? '?' : a.kind === 'player' ? 'player' : a.kind === 'engine' ? (a.id === 'rules' ? 'rules' : 'engine:' + a.id) : `${a.kind}:${a.id}${a.tier ? '/' + a.tier : ''}${a.layer ? '+' + a.layer : ''}`;
const val = v => typeof v === 'string' ? (/\s/.test(v) ? JSON.stringify(v) : v) : JSON.stringify(v);
const fields = (b, skip = []) => Object.entries(b || {}).filter(([k]) => !skip.includes(k)).map(([k, v]) => `${k}=${val(v)}`).join(' ');
const short = (s, n = 90) => !s ? '' : s.length > n ? s.slice(0, n - 1) + '…' : s;

export function describeTx(e) {
  const b = e.body || {};
  switch (e.kind) {
    case 'intent': return b.verb === 'commit' ? `asks for a promise${b.class ? ' (' + b.class + ')' : ''}: if "${b.condition}" then "${b.behaviour}"` : `heard as ${b.verb}${b.target ? ' ' + b.target : ''}${b.class ? ' class=' + b.class : ''}${b.loud ? ' (loud)' : ''}  « ${short(b.text, 70)} »`;
    case 'act': return b.op === 'say' ? `say ${b.ref || ''}${b.tone ? ' (' + b.tone + ')' : ''}` : b.op === 'go' ? `go to ${refId(b.to)}${b.via ? ' by ' + b.via : ''}` : b.op === 'look' && b.target ? `look at ${refId(b.target)}` : `${b.op} ${fields(b, ['op'])}`.trim();
    case 'effect': return `${b.op} ${fields(b, ['op', 'shapes'])}`.trim();
    case 'fact': return b.commit ? `promise ${b.commit.id} ${b.commit.status} (${b.commit.strength || 'hard'}): ${b.subject} ${b.predicate} ${val(b.value)}` : `fact ${b.subject} ${b.predicate} = ${val(b.value)}`;
    case 'rule': return `rule ${b.id} registered${b.commit ? ' for promise ' + b.commit : ''}${b.principle ? '' : ': when ' + b.when.event + (b.when.match ? ' ' + JSON.stringify(b.when.match) : '')}`;
    case 'cancel': return `cancel ${b.target}${b.reason ? ' (' + b.reason + ')' : ''}`;
  }
  return e.kind;
}
const reasonText = (r, ctx) => r.why === 'constraint' ? `breaks ${r.value}${ctx.principles[r.value] ? ': "' + short(ctx.principles[r.value].text, 80) + '"' : ''}` : `${r.why}${r.path ? ' at ' + r.path : ''}${r.value !== undefined ? ' (' + val(r.value) + ')' : ''}`;

/* One journal entry → one readable line, or null for bookkeeping (unless all). */
const QUIET_EVENTS = ['session.started', 'clock.tick', 'act.done', 'said', 'body.pose', 'rule.registered', 'camera.changed', 'place.changed', 'intent.heard', 'look.at', 'station.left'];
export function describeEntry(e, ctx, { all = false } = {}) {
  switch (e.type) {
    case 'session': return `session seed ${e.seed}, ${(e.scene.stations || []).length} stations, languages ${(e.scene.langs || []).join(' ')}`;
    case 'principles': return `principles loaded: ${e.records.length}`;
    case 'start': return 'start';
    case 'advance': return all ? `+${e.dt} s` : null;
    case 'hash': return `checkpoint hash ${e.hash}`;
    case 'observe': return `observed ${e.event} ${fields(e.data)}`;
    case 'audit': return `judged ${e.principle} on #${e.ref_seq}: ${e.relevant ? (e.respected ? 'respected' : e.respected === false ? 'broken' : 'relevant') : 'not relevant'}${e.note ? ' — ' + e.note : ''}`;
    case 'model_call': {
      if (e.status === 'pending' && !all) return null;
      const g = (e.gauges || []).map(x => `${x.id} ${x.word}`).join(', ');
      return `model call ${e.tier}/${e.purpose}${e.status ? ' (' + e.status + ')' : ''}: ${(e.principles || []).length} principles in scope${g ? '; gauges ' + g : ''}`;
    }
    case 'rule': {
      const r = ctx.rules[e.rule] || {}, p = r.principle && ctx.principles[r.principle];
      const src = p ? `${p.layer}/${p.author.id}${p.pattern ? ', pattern ' + p.pattern : ''}: ${short(p.text, 100)}` : r.author ? `${who(r.author)}${r.commit ? ', promise ' + r.commit : ''}` : '';
      return e.status === 'fired' ? `rule ${e.rule} fired on ${e.event}${src ? ' — ' + src : ''}` : `rule ${e.rule} blocked (${e.reason})`;
    }
    case 'event': {
      if (!all && QUIET_EVENTS.includes(e.event)) return null;
      return `· ${e.event} ${fields(e.data)}`;
    }
    case 'tx': {
      const st = e.status === 'accepted' ? '' : e.status === 'repaired' ? ` [repaired: ${(e.repair || []).map(r => `${r.action} ${r.path || ''}${r.why ? ' (' + r.why + ')' : ''}`).join('; ')}]` : e.status === 'rejected' ? ` [REJECTED: ${(e.reasons || []).map(r => reasonText(r, ctx)).join('; ')}]` : '';
      if (!all && e.kind === 'rule' && e.body.principle && e.status !== 'rejected') return null;
      return `${who(e.author)} ${e.loop || ''} ${describeTx(e)}${st}${e.late ? ' [LATE ' + e.latency_ms + ' ms > ' + e.budget_ms + ']' : ''}`.replace(/\s+/g, ' ');
    }
  }
  return all ? `${e.type}` : null;
}

/* A journal, readable: "#seq t=…s line", with the lines she said in the given language. */
export function renderJournal(entries, { all = false, lang } = {}) {
  const ctx = contextOf(entries), out = [];
  for (const e of entries) {
    let d = describeEntry(e, ctx, { all });
    if (d === null) continue;
    if (e.type === 'tx' && e.kind === 'act' && e.body.op === 'say') d += '  « ' + sayText(e, entries, ctx, lang) + ' »';
    out.push(`#${String(e.seq).padStart(4)} t=${String(e.t ?? '').padStart(6)}  ${d}`);
  }
  return out.join('\n');
}
function sayText(e, entries, ctx, lang) {
  const b = e.body;
  if (b.line) return b.line[lang] || Object.values(b.line)[0];
  const said = entries.slice(e.seq + 1, e.seq + 12).find(x => x.type === 'event' && x.event === 'said' && x.cause === e.seq);
  const L = ctx.lines[b.ref];
  if (lang && L && L[lang] && said && L[said.data.lang]) {          // the same variant, in the asked language
    const vs = [].concat(L[said.data.lang]), i = vs.findIndex(v => (typeof v === 'string' ? v : v.text) === said.data.text), x = [].concat(L[lang])[i];
    if (x) return typeof x === 'string' ? x : x.text;
  }
  return said ? said.data.text : b.ref;
}

/* One exchange of a play, as a creator wants to read it. */
export function renderExchange(x, entries, { lang, verbose = false } = {}) {
  const ctx = contextOf(entries), E = entries.slice(x.from, x.to), s = x.step, out = [];
  const head = E[0] || {}, t = head.t ?? '';
  if (s.kind === 'start') out.push(`── start (${E.filter(e => e.type === 'tx' && e.kind === 'rule').length} rules registered)`);
  else if (s.kind === 'say') out.push(`── t=${t}s  you${s.loud ? ' (loud)' : ''}: « ${s.text} »${s.pin ? '   [intent pinned: ' + s.pin.verb + (s.pin.target ? ' ' + s.pin.target : '') + (s.pin.class ? ' ' + s.pin.class : '') + ']' : ''}`);
  else if (s.kind === 'wait') out.push(`── t=${t}s  ${s.seconds} s pass`);
  else if (s.kind === 'look') out.push(`── t=${t}s  you look at ${s.target}${s.seconds ? ' for ' + s.seconds + ' s' : ''}`);
  let scopeShown = false;
  for (const e of E) {
    if (e.type === 'model_call' && !verbose) {
      if (scopeShown || !(e.principles || []).length) continue;
      scopeShown = true;
      const byDoc = {};
      for (const id of e.principles) { const d = ctx.principles[id] ? ctx.principles[id].doc : '?'; byDoc[d] = (byDoc[d] || 0) + 1; }
      const g = (e.gauges || []).map(x => `${x.id} ${x.word} (${x.value})`).join(', ');
      out.push(`   in scope (${e.character || 'story'}): ${e.principles.length} principles — ${Object.entries(byDoc).map(([d, n]) => `${d} ${n}`).join(' · ')}${g ? '; gauges: ' + g : ''}`);
      continue;
    }
    let d = describeEntry(e, ctx, { all: false });
    if (d === null || e.type === 'advance') continue;
    if (e.type === 'tx' && e.kind === 'act' && e.body.op === 'say') d += '  « ' + sayText(e, entries, ctx, lang) + ' »';
    out.push('   ' + d);
  }
  if (verbose) for (const e of E.filter(e => e.type === 'model_call' && e.principles)) out.push(`   ${e.tier}/${e.purpose}: ${e.principles.join(', ')}`);
  return out.join('\n');
}

/* ================================================================ replay, what-if, audit */

const strip = E => E.map(e => { const x = Object.assign({}, e); if (x.type === 'session') delete x.scene; if (x.type === 'principles') delete x.records; return x; });
const finalHash = E => (E.filter(e => e.type === 'hash').pop() || {}).hash ?? null;

export function replayJournal(entries) {
  const r = replay(entries, createPaperWorld()), d = diff(entries, r.journal);
  return { equal: d.equal, entries: entries.length, first: d.first, recorded_hash: finalHash(entries), hash: r.hash, same_hash: finalHash(entries) === null || finalHash(entries) === r.hash, change: d.changes[0] || null };
}

/* What the pack's principles say differently: added, removed, changed (text, strength, weight, compiled form). */
export function principleChanges(a = [], b = []) {
  const A = new Map(a.map(p => [p.id, p])), B = new Map(b.map(p => [p.id, p])), out = { added: [], removed: [], changed: [] };
  for (const [id, p] of B) if (!A.has(id)) out.added.push({ id, mark: markOf(p), text: p.text });
  for (const [id, p] of A) if (!B.has(id)) out.removed.push({ id, mark: markOf(p), text: p.text });
  for (const [id, p] of B) {
    const o = A.get(id); if (!o) continue;
    const what = ['text', 'strength', 'weight', 'note', 'scope', 'layer'].filter(k => canonicalJSON(o[k] ?? null) !== canonicalJSON(p[k] ?? null));
    if (canonicalJSON(o.compiled ?? null) !== canonicalJSON(p.compiled ?? null) && !what.includes('text')) what.push('compiled');
    if (what.length) out.changed.push({ id, what, from: o.text, to: p.text });
  }
  return out;
}
const count = xs => xs.reduce((m, x) => (m[x] = (m[x] || 0) + 1, m), {});
function outcome(E) {
  const a = auditJournal(E);
  return { commitments: Object.fromEntries(a.commitments.map(c => [c.id, c.status])), ending: a.ending, beat: a.beat, rejected: a.rejected.length };
}

/* Replays a journal against another compiled pack (principles and scene): the same player and the same model answers,
   the pack as edited now. Returns the difference. */
export function whatif(entries, compiled) {
  const head = entries[0];
  if (!head || head.type !== 'session') throw new Error('journal: no session header');
  const recorded = entries.filter(e => e.type === 'principles').flatMap(e => e.records);
  const principles = clone(compiled.principles), carried = carryCompiled(recorded, principles);
  const edited = [Object.assign({}, head, { scene: compiled.scene }), ...entries.slice(1)];
  const r = replay(edited, createPaperWorld(), undefined, { edit: e => e.type === 'principles' ? Object.assign({}, e, { records: principles }) : e });
  const B = r.journal.entries, d = diff(strip(entries), strip(B));
  const isSetup = e => e && ((e.type === 'tx' && e.kind === 'rule' && e.body && e.body.principle) || (e.type === 'event' && e.event === 'rule.registered'));
  const play = d.changes.find(c => !isSetup(c.a) && !isSetup(c.b));
  const fa = count(entries.filter(e => e.type === 'rule' && e.status === 'fired').map(e => e.rule)), fb = count(B.filter(e => e.type === 'rule' && e.status === 'fired').map(e => e.rule));
  const rules = { only_before: [], only_now: [], more: [], fewer: [], moved: [] };
  const firstT = (E, id) => (E.find(e => e.type === 'rule' && e.status === 'fired' && e.rule === id) || {}).t;
  for (const id of new Set([...Object.keys(fa), ...Object.keys(fb)])) {
    const x = fa[id] || 0, y = fb[id] || 0;
    if (!y) rules.only_before.push(id); else if (!x) rules.only_now.push(id); else if (y > x) rules.more.push(`${id} ${x}→${y}`); else if (y < x) rules.fewer.push(`${id} ${x}→${y}`);
    if (x && y && firstT(entries, id) !== firstT(B, id)) rules.moved.push(`${id} t=${firstT(entries, id)}→${firstT(B, id)}`);
  }
  const sceneChanged = Object.keys(Object.assign({}, head.scene, compiled.scene)).filter(k => canonicalJSON(head.scene[k] ?? null) !== canonicalJSON(compiled.scene[k] ?? null));
  return {
    equal: d.equal, carried, pack: principleChanges(recorded, principles), scene: sceneChanged,
    first: d.first, first_in_play: play ? play.seq : null, at: play || d.changes[0] || null, rules,
    before: outcome(entries), now: outcome(B),
    hashes: { before: finalHash(entries), now: finalHash(B), before_checkpoints: d.hashes.a, now_checkpoints: d.hashes.b },
    journal: B,
  };
}

/* What happened in a session, for a creator (P17). */
export function auditJournal(entries) {
  const E = entries, T = E.filter(e => e.type === 'tx');
  const asked = T.filter(e => e.kind === 'intent').map(e => ({ seq: e.seq, t: e.t, text: e.body.text, lang: e.body.lang, verb: e.body.verb, target: e.body.target, class: e.body.class, loud: e.body.loud || undefined, status: e.status }));
  const repaired = T.filter(e => e.status === 'repaired').map(e => ({ seq: e.seq, t: e.t, by: who(e.author), what: describeTx(e), repair: e.repair }));
  const rejected = T.filter(e => e.status === 'rejected').map(e => ({ seq: e.seq, t: e.t, by: who(e.author), what: describeTx(e), reasons: e.reasons,
    principles: (e.reasons || []).filter(r => r.why === 'constraint').map(r => r.value) }));
  const registered = T.filter(e => e.kind === 'rule' && e.status !== 'rejected').map(e => e.body.id);
  const fired = count(E.filter(e => e.type === 'rule' && e.status === 'fired').map(e => e.rule));
  const blocked = {};
  for (const e of E.filter(e => e.type === 'rule' && e.status === 'blocked')) (blocked[e.rule] = blocked[e.rule] || {})[e.reason] = ((blocked[e.rule] || {})[e.reason] || 0) + 1;
  const commitments = {};
  for (const e of T) {
    if (e.kind === 'intent' && e.body.verb === 'commit' && e.status !== 'rejected') {
      const id = e.body.commit || 'c' + e.seq;
      commitments[id] = { id, class: e.body.class, condition: e.body.condition, behaviour: e.body.behaviour, made_at: e.seq, history: [{ status: 'proposed', seq: e.seq }] };
    }
    if (e.kind === 'fact' && e.body.commit && e.status !== 'rejected' && commitments[e.body.commit.id]) commitments[e.body.commit.id].history.push({ status: e.body.commit.status, seq: e.seq, by: who(e.author) });
    if (e.kind === 'cancel' && e.status !== 'rejected' && /^commit:/.test(e.body.target) && commitments[e.body.target.slice(7)]) commitments[e.body.target.slice(7)].history.push({ status: 'broken', seq: e.seq, by: who(e.author) });
  }
  for (const e of E.filter(e => e.type === 'rule' && e.status === 'fired' && e.cause && e.cause.commit)) if (commitments[e.cause.commit]) commitments[e.cause.commit].history.push({ status: 'due', seq: e.seq });
  const C = Object.values(commitments).map(c => { c.history.sort((a, b) => a.seq - b.seq); c.status = c.history[c.history.length - 1].status; return c; });
  const gauges = {};
  for (const e of E.filter(e => e.type === 'event' && e.event === 'gauge.changed')) (gauges[e.data.id] = gauges[e.data.id] || []).push({ t: e.t, value: e.data.value, word: e.data.word });
  const beats = E.filter(e => e.type === 'event' && e.event === 'beat.entered').map(e => e.data.id);
  const end = E.filter(e => e.type === 'event' && e.event === 'story.ended').map(e => e.data.id);
  const calls = count(E.filter(e => e.type === 'model_call' && e.status !== 'pending').map(e => e.tier));
  const t = E.reduce((m, e) => Math.max(m, e.t || 0), 0);
  return {
    session: { seed: E[0] && E[0].seed, entries: E.length, duration_s: t, hash: finalHash(E) },
    asked, repaired, rejected,
    rules: { fired, never: [...new Set(registered)].filter(id => !fired[id]), blocked },
    commitments: C, gauges, beat: beats[beats.length - 1] || null, beats, ending: end[end.length - 1] || null,
    late: T.filter(e => e.late).map(e => ({ seq: e.seq, loop: e.loop, latency_ms: e.latency_ms, budget_ms: e.budget_ms, what: describeTx(e) })),
    model_calls: calls, judged: auditSummary(E),
  };
}

export function renderAudit(a, ctx = { principles: {} }) {
  const L = [];
  L.push(`session: ${a.session.entries} entries, ${a.session.duration_s} s, seed ${a.session.seed}, hash ${a.session.hash}`);
  L.push(`beats: ${a.beats.join(' → ') || '—'}${a.ending ? ' · ending ' + a.ending : ' · no ending'}`);
  L.push(`\nthe player asked (${a.asked.length}):`);
  for (const x of a.asked) L.push(`  #${x.seq} t=${x.t} ${x.verb}${x.target ? ' ' + x.target : ''}${x.class ? ' [' + x.class + ']' : ''}${x.loud ? ' (loud)' : ''}  « ${short(x.text, 70)} »${x.status !== 'accepted' ? ' ' + x.status : ''}`);
  L.push(`\nrepaired (${a.repaired.length}):`);
  for (const x of a.repaired) L.push(`  #${x.seq} ${x.by} ${x.what}: ${x.repair.map(r => `${r.action} ${r.path || ''}${r.why ? ' (' + r.why + ')' : ''}`).join('; ')}`);
  L.push(`\nrejected (${a.rejected.length}):`);
  for (const x of a.rejected) L.push(`  #${x.seq} ${x.by} ${x.what}: ${(x.reasons || []).map(r => reasonText(r, ctx)).join('; ')}`);
  const f = Object.entries(a.rules.fired);
  L.push(`\nrules fired (${f.length}): ${f.map(([k, n]) => n > 1 ? `${k} ×${n}` : k).join(', ') || '—'}`);
  L.push(`rules never fired (${a.rules.never.length}): ${a.rules.never.join(', ') || '—'}`);
  const bl = Object.entries(a.rules.blocked);
  if (bl.length) L.push(`rules blocked: ${bl.map(([k, r]) => `${k} (${Object.entries(r).map(([w, n]) => `${w} ${n}`).join(', ')})`).join('; ')}`);
  L.push(`\ncommitments (${a.commitments.length}):`);
  for (const c of a.commitments) L.push(`  ${c.id}${c.class ? ' [' + c.class + ']' : ''}: if "${c.condition}" then "${c.behaviour}" — ${c.history.map(h => h.status + ' #' + h.seq).join(' → ')}`);
  const g = Object.entries(a.gauges);
  L.push(`\ngauges (${g.length}):`);
  for (const [id, xs] of g) L.push(`  ${id}: ${xs.map(x => `t=${x.t} ${x.value} ${x.word}`).join(' → ')}`);
  const j = Object.entries(a.judged);
  L.push(`\njudged principles (${j.length}):`);
  for (const [id, s] of j) L.push(`  ${id}: relevant ${s.relevant}, respected ${s.respected}, broken ${s.broken}${s.breaks.length ? ' at #' + s.breaks.join(', #') : ''}`);
  L.push(`\nmodel calls: ${Object.entries(a.model_calls).map(([k, n]) => `${k} ${n}`).join(' · ') || '—'}; late answers: ${a.late.length ? a.late.map(x => `#${x.seq} ${x.loop} ${x.latency_ms} ms`).join(', ') : 'none'}`);
  return L.join('\n');
}

export function renderWhatif(w, entries) {
  const L = [], ctx = contextOf(entries), ctxB = contextOf(w.journal);
  const pc = w.pack;
  L.push(`pack changes: ${pc.added.length} added, ${pc.removed.length} removed, ${pc.changed.length} changed${w.scene.length ? '; scene: ' + w.scene.join(', ') : ''}${w.carried.length ? `; compiled forms carried from the journal: ${w.carried.join(', ')}` : ''}`);
  for (const x of pc.changed) L.push(`  ~ ${x.id} (${x.what.join(', ')})${x.what.includes('text') ? `\n      was: ${x.from}\n      now: ${x.to}` : ''}`);
  for (const x of pc.added) L.push(`  + ${x.id} ${x.mark} ${short(x.text, 90)}`);
  for (const x of pc.removed) L.push(`  - ${x.id} ${x.mark} ${short(x.text, 90)}`);
  if (w.equal) { L.push('\nsame session: every entry and the hash are unchanged'); return L.join('\n'); }
  L.push(`\nfirst difference: #${w.first}${w.first_in_play !== null && w.first_in_play !== w.first ? ` (the pack's rules as registered); first difference in play: #${w.first_in_play}` : ''}`);
  if (w.at) {
    L.push(`  before: ${w.at.a ? describeEntry(w.at.a, ctx, { all: true }) : '(nothing)'}`);
    L.push(`  now:    ${w.at.b ? describeEntry(w.at.b, ctxB, { all: true }) : '(nothing)'}`);
  }
  const r = w.rules;
  L.push(`\nrules that fired before and no longer: ${r.only_before.join(', ') || '—'}`);
  L.push(`rules that fire now and did not: ${r.only_now.join(', ') || '—'}`);
  if (r.more.length || r.fewer.length) L.push(`fire more: ${r.more.join(', ') || '—'} · fewer: ${r.fewer.join(', ') || '—'}`);
  if (r.moved.length) L.push(`fire at another moment (first firing): ${r.moved.join(', ')}`);
  const c = new Set([...Object.keys(w.before.commitments), ...Object.keys(w.now.commitments)]);
  for (const id of c) L.push(`promise ${id}: ${w.before.commitments[id] || '—'} → ${w.now.commitments[id] || '—'}`);
  L.push(`beat: ${w.before.beat || '—'} → ${w.now.beat || '—'} · ending: ${w.before.ending || '—'} → ${w.now.ending || '—'} · rejected transactions: ${w.before.rejected} → ${w.now.rejected}`);
  L.push(`final hash: ${w.hashes.before} → ${w.hashes.now}`);
  return L.join('\n');
}

/* ================================================================ new */

export function newPack(id, { root = ROOT, author } = {}) {
  if (!/^[a-z][a-z0-9-]{1,40}$/.test(id)) throw new Error(`pack id "${id}": lowercase letters, digits and hyphens, starting with a letter`);
  const dir = join(root, 'stories', id), tpl = join(root, 'stories', '_template');
  if (existsSync(dir)) throw new Error(`stories/${id} exists`);
  cpSync(tpl, dir, { recursive: true, filter: s => !/[/\\]build([/\\]|$)/.test(relative(tpl, s)) && basename(s) !== 'build' });
  const mf = join(dir, 'pack.json'), M = JSON.parse(readFileSync(mf, 'utf8'));
  M.id = id;
  if (author && author !== 'you') {
    M.authors = M.authors.map(a => a.id === 'you' ? Object.assign({}, a, { id: author }) : a);
    M.layers = M.layers.map(l => l.author === 'you' ? Object.assign({}, l, { author }) : l);
    for (const l of M.layers) for (const f of l.files) { const p = join(dir, f); writeFileSync(p, readFileSync(p, 'utf8').replace(/@author you\b/g, '@author ' + author)); }
  }
  writeFileSync(mf, JSON.stringify(M, null, 2) + '\n');
  return { dir, files: listFiles(dir).map(f => relative(root, f)) };
}
function listFiles(d) { return readdirSync(d, { withFileTypes: true }).flatMap(x => x.isDirectory() ? listFiles(join(d, x.name)) : [join(d, x.name)]).sort(); }

/* ================================================================ CLI */

function renderCheck(dir, res) {
  const s = res.stats, L = [];
  L.push(`pack ${dir}: ${s.files} files, ${s.statements} statements, ${s.facts} facts, ${s.stations} stations, ${s.things} things`);
  L.push(`  marks: ${Object.entries(s.marks).map(([k, v]) => `${k} ${v}`).join(' · ')}`);
  L.push(`  rules: ${s.rules.creator} creator (base) + ${s.rules.contributor} contributor + ${s.rules.from_patterns} from patterns`);
  L.push(`  patterns: ${s.patterns.join(' · ') || 'none'}`);
  L.push(`  overrides: ${s.overrides.join(' · ') || 'none'}`);
  L.push(`  lines: ${Object.entries(s.lines).map(([k, v]) => `${k} ${v}`).join(' · ')}`);
  if (s.bench.total) {
    L.push(`  bench: ${s.bench.total} requests · ${Object.entries(s.bench.tags).map(([k, v]) => `${k} ${v}`).join(' · ')}`);
    L.push(`  expected: ${Object.entries(s.bench.expect).map(([k, v]) => `${k} ${v}`).join(' · ')}`);
  }
  L.push(`  not enforced yet (prose ! and !!, wait for a model to compile them): ${s.to_compile}`);
  for (const w of res.warnings) L.push(`warning: ${w}`);
  for (const e of res.errors) L.push(`error: ${e}`);
  L.push(res.errors.length ? `${res.errors.length} error(s)` : 'ok');
  return L.join('\n');
}
function renderExplain(x) {
  const L = [];
  if (!x.found) return `nothing called "${x.id}" in this pack${x.near.length ? '; near: ' + x.near.join(', ') : ''}${x.refs.length ? '\nmentioned by:\n' + x.refs.map(r => `  ${r.where} ${r.id}: ${short(r.text, 100)}`).join('\n') : ''}`;
  if (x.found === 'statement') {
    L.push(`${x.id}  ${x.mark}  ${x.strength}${x.weight !== undefined ? ' ' + x.weight : ''} (${x.form})  scope ${x.scope}, horizon ${x.horizon}`);
    if (x.text) L.push(`  "${x.text}"`);
    if (x.note) L.push(`  note: ${x.note}`);
    if (x.lines) L.push(...Object.entries(x.lines).map(([l, t]) => `  ${l}: ${t}`));
    if (x.why) L.push(`  why: ${x.why}`);
    L.push(`  from ${x.source}, layer ${x.layer}, author ${x.author}${x.pattern ? `, pattern ${x.pattern} (instance ${x.instance})` : ''}`);
    if (x.overrides) L.push(`  overrides: ${x.overrides.map(o => `${o.layer} by ${o.author.id} (${o.source.file}:${o.source.line})`).join(', ')}`);
    L.push(`  enforced by: ${x.enforced_by}`);
    if (x.compiled && !(x.doc_kind === 'facts' && x.compiled.status === 'to_compile')) L.push(`  compiled: ${x.compiled.kind}, ${x.compiled.status}${x.carried ? ' (carried from build/compiled.json)' : ''}${x.compiled.body ? '\n    ' + JSON.stringify(x.compiled.body) : ''}`);
  } else L.push(`${x.id}: ${x.found}\n  ${JSON.stringify(x[x.found] || x.lines)}`);
  L.push(`referred to by (${x.refs.length}):`);
  for (const r of x.refs) L.push(`  ${r.where}  ${r.id}${r.mark ? ' ' + r.mark : ''}: ${short(r.text, 110)}`);
  return L.join('\n');
}

function opt(args, name, def) { const i = args.indexOf(name); if (i < 0) return def; const v = args[i + 1]; args.splice(i, 2); return v; }
function flag(args, name) { const i = args.indexOf(name); if (i < 0) return false; args.splice(i, 1); return true; }
const readJournal = f => fromJSONL(readFileSync(f, 'utf8'));
const USAGE = readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\n').filter(l => l.startsWith('//   node')).map(l => l.slice(3)).join('\n');

export async function main(argv, { print = console.log } = {}) {
  const args = argv.slice(), json = flag(args, '--json'), cmd = args.shift();
  const out = (obj, text) => print(json ? JSON.stringify(obj, null, 2) : text);
  const lib = () => loadLibrary(join(ROOT, 'patterns'));
  switch (cmd) {
    case 'check': {
      const dir = args[0] || 'stories/louis-round', res = checkPack(loadPack(dir), lib());
      out(json ? res.compiled : null, renderCheck(dir, res));
      return res.errors.length ? 1 : 0;
    }
    case 'build': {
      const dir = args[0]; if (!dir) break;
      const pack = loadPack(dir), res = compileForPlay(pack, lib());
      if (res.errors.length) { print(renderCheck(dir, res)); return 1; }
      mkdirSync(join(dir, 'build'), { recursive: true });
      writeFileSync(join(dir, 'build/compiled.json'), JSON.stringify(res.compiled, null, 1) + '\n');
      out({ file: join(dir, 'build/compiled.json'), principles: res.compiled.principles.length, rules: res.compiled.rules.length, to_compile: res.compiled.to_compile, carried: res.carried },
        `wrote ${join(dir, 'build/compiled.json')}: ${res.compiled.principles.length} principles, ${res.compiled.rules.length} explicit rules, ${res.carried.length} compiled forms carried, ${res.compiled.to_compile.length} prose statements not enforced yet`);
      return 0;
    }
    case 'explain': {
      const [dir, id] = args; if (!dir || !id) break;
      const x = explain(loadPack(dir), lib(), id);
      out(x, renderExplain(x));
      return x.found ? 0 : 1;
    }
    case 'play': {
      const script = opt(args, '--script'), seed = +opt(args, '--seed', 1), file = opt(args, '--out'), lang = opt(args, '--lang'), verbose = flag(args, '--verbose');
      const dir = args[0]; if (!dir || !script) break;
      const sc = parseScript(readFileSync(script, 'utf8'));
      if (sc.errors.length) { print(sc.errors.map(e => `${script}:${e.line}: ${e.why}`).join('\n')); return 1; }
      const pack = loadPack(dir), r = await play(pack, lib(), sc.steps, { seed });
      const E = r.session.journal.entries;
      const target = file || join(ROOT, 'out', 'journals', pack.manifest.id, basename(script).replace(/\.[^.]*$/, '') + '.jsonl');
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, toJSONL(E));
      const showLang = lang || (sc.steps.find(s => s.lang) || {}).lang || (pack.manifest.languages || [])[0];
      out({ journal: target, entries: E.length, hash: r.session.hash(), notes: r.notes, carried: r.carried, audit: auditJournal(E) },
        r.exchanges.map(x => renderExchange(x, E, { lang: showLang, verbose })).join('\n\n') +
        (r.notes.length ? '\n\nnotes:\n' + r.notes.map(n => '  ' + n).join('\n') : '') +
        `\n\njournal: ${relative(process.cwd(), target)} (${E.length} entries, hash ${r.session.hash()})`);
      return 0;
    }
    case 'replay': {
      const f = args[0]; if (!f) break;
      const r = replayJournal(readJournal(f));
      out(r, r.equal && r.same_hash ? `replays identically: ${r.entries} entries, hash ${r.hash}${r.recorded_hash !== null ? ' (as recorded)' : ''}`
        : `DIFFERS from #${r.first}: ${JSON.stringify(r.change)}\nhash ${r.recorded_hash} recorded, ${r.hash} replayed`);
      return r.equal && r.same_hash ? 0 : 1;
    }
    case 'whatif': {
      const dir = opt(args, '--pack'), f = args[0], write = opt(args, '--out'); if (!f || !dir) break;
      const E = readJournal(f), res = compileForPlay(loadPack(dir), lib());
      if (res.errors.length) { print(renderCheck(dir, res)); return 1; }
      const w = whatif(E, res.compiled);
      if (write) writeFileSync(write, toJSONL(w.journal));
      const { journal, ...rest } = w;
      out(rest, renderWhatif(w, E) + (write ? `\nreplayed journal: ${write}` : ''));
      return 0;
    }
    case 'audit': {
      const f = args[0]; if (!f) break;
      const E = readJournal(f), a = auditJournal(E);
      out(a, renderAudit(a, contextOf(E)));
      return 0;
    }
    case 'journal': {
      const all = flag(args, '--all'), lang = opt(args, '--lang'), f = args[0]; if (!f) break;
      const E = readJournal(f);
      out(E, renderJournal(E, { all, lang }));
      return 0;
    }
    case 'new': {
      const author = opt(args, '--author'), id = args[0]; if (!id) break;
      const r = newPack(id, { author });
      out(r, `created ${relative(process.cwd(), r.dir)}:\n${r.files.map(f => '  ' + f).join('\n')}\nnext: node tools/story.mjs check ${relative(process.cwd(), r.dir)}`);
      return 0;
    }
  }
  print(USAGE);
  return cmd && cmd !== 'help' && cmd !== '--help' ? 2 : 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).then(code => { process.exitCode = code; }, e => { console.error('error: ' + e.message); process.exitCode = 1; });
}
