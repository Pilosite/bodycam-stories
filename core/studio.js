/* The conception studio (briefs/conception-v2.md, ADR 0011, docs/creation-pipeline.md §7): a prompted world is conceived by
   a chain of agents before it is played, as the demo's opening shows it. Each stage is one agent with a role, a tier and an
   instrument (src/studio.json: the stages, their order, their prompts, as data, P23); it reads what the earlier stages wrote
   and writes its part of the pack in the authoring source:
     understand → research (several small calls in parallel) → environment (the world builder, fed by the findings) and
     people → interactions, arc (only when the brief calls for a story) and questions → check and compile.
   Stages that do not depend on each other run in parallel; any stage may fail soft and leave its part to the fallback.
   Every stage emits creation events in one schema (STUDIO_EVENT below, work item W1) into a creation journal kept with the
   pack and added to the harvest record; the opening (src/ouverture.js) draws its scroll, its agent network and its language
   panel from the same events.
     runStudio({ sentence, place?, library, base, data, ask?, search?, build?, … })  → Promise<result>   the whole chain
     studioPrompt(stage, ctx, data)                                                 → text              what an agent is asked
     readStudioAnswer(text)                                                         → parts             what it answered
     creationSummary(journal, { strip })                                            → the harvest's view of a creation journal
   Pure: no I/O, no model. `ask(prompt, { stage, agent, tier, onText, signal })` → text is given (the page's model port, the
   tool's answer files, a test's canned answers); `search({ query, lang })` → [{ title, url, text }] when a search capability
   exists (the home node, later), else absent; `build({ description, sentence, brief, findings, onStep })` → place file is
   the existing world builder (src/constructeur.js construire) in the page, absent in the tool and the tests (the place is
   given). The sketch of the first lot (core/sketch.js conceive) is the one-call fallback when only one call is affordable. */
import { sketchPack, checkSketch, fallbackSketch, conceive, guessLang, placeDigest, usablePatterns, readQuestions } from './sketch.js';
import { parseSource } from './source.js';

export const STUDIO_FORMAT = 0;
/* One creation event (W1). seq (null for a transient event: streamed lines, not journaled), t_ms since the start, stage,
   agent (the stage id, or <stage>.<topic> for a research worker, <stage>.repair for a repair), role, tier (fast | mid |
   large | code), instrument (invention | search | builder | code), kind, status, latency_ms (on a call's end), text (one
   line for people), wrote (the source lines the agent wrote), source (a finding's), adapter (who answered, when known). */
export const STUDIO_EVENT = {
  kinds: ['query', 'finding', 'draft', 'check', 'build', 'question'],
  status: ['pending', 'writing', 'step', 'done', 'failed', 'repaired', 'skipped', 'fallback'],
};
const FILE = /^(characters|facts|patterns|rules)\/[a-z][a-z0-9-]{0,40}\.pdl$/;
const WROTE_MAX = 80;

/* ---------------------------------------------------------------- prompts */
const fillText = (lines, slots) => (Array.isArray(lines) ? lines.join('\n') : String(lines || ''))
  .replace(/\{\{(\w+)\}\}/g, (_, k) => slots[k] === undefined || slots[k] === null ? '' : Array.isArray(slots[k]) ? slots[k].join('\n') : String(slots[k]));
export function stageOf(data, id) { return (data.stages || []).find(s => s.id === id) || null; }

export function briefLine(b) {
  b = b || {};
  return ['title', 'lang', 'where', 'when', 'who', 'kind', 'story', 'player', 'powers'].filter(k => b[k] && (!Array.isArray(b[k]) || b[k].length))
    .map(k => `${k}: ${Array.isArray(b[k]) ? b[k].join(', ') : b[k]}`).join(' · ');
}
export function findingsText(findings = [], { max = 14, prefer = null } = {}) {
  const L = prefer ? [...findings.filter(f => prefer.includes(f.supports)), ...findings.filter(f => !prefer.includes(f.supports))] : findings;
  return L.slice(0, max).map(f => `- ${f.text} (${f.source})`).join('\n') || '- (nothing found)';
}
function peopleText(parts) {
  const P = parts.people; if (!P) return 'none written';
  const out = [];
  for (const [path, text] of Object.entries(P.files || {})) {
    if (!path.startsWith('characters/')) continue;
    const d = parseSource(text, { file: path });
    out.push(`${d.id}${d.meta.name ? ' (' + d.meta.name + ')' : ''}${d.id === (P.about || {}).carrier ? ' carries the camera' : ''}${d.meta.presence ? ', ' + d.meta.presence : ''}`);
  }
  const facts = Object.entries(P.files || {}).filter(([p]) => p.startsWith('facts/')).map(([p, t]) => parseSource(t, { file: p }))
    .flatMap(d => d.statements.filter(s => s.id && (s.mark === '!' || s.mark === '!!')).map(s => `${s.id}: ${s.text}`));
  const lines = Object.keys(P.lines || {});
  return out.join('; ') + (facts.length ? '\nTheir facts (ids you may use): ' + facts.join(' · ') : '') + (lines.length ? '\nTheir line keys: ' + lines.join(', ') : '');
}
function placeLine(place) {
  const P = placeDigest(place || {});
  return `${JSON.stringify(P.title)}${P.inspiration ? ' — ' + P.inspiration : ''}${P.night ? ' (night' + (P.lamp ? ', a lamp' : '') + ')' : ''}`;
}
function pathText(place) {
  const L = ((place || {}).objets || []).filter(o => o && o.id).map(o => ({ id: o.id, name: o.nom || o.id, along: Math.round(+o.devant || 0), side: Math.round((+o.cote || 0) * 10) / 10 }));
  return { text: L.map(o => `${o.id} (${o.name}, ${o.along} m, ${o.side} m)`).join(', ') || 'none', length: Math.max(40, ...L.map(o => o.along + 10)) };
}
function patternsText(library) {
  return usablePatterns(library).filter(p => !p.roles.some(r => / : station\b/.test(r)))
    .map(p => `- ${p.id}: ${p.summary}\n    ${p.roles.join('\n    ')}\n    rules: ${p.rules.join(' ; ')}`).join('\n') || 'none';
}
/* What one agent is asked. ctx: { sentence, brief, findings, place, parts, library, lang, topic, results } */
export function studioPrompt(stage, ctx, data) {
  const P = pathText(ctx.place);
  const slots = {
    game: data.game, language: data.language, knowledge: data.knowledge_source,
    sentence: JSON.stringify(String(ctx.sentence || '')), brief: briefLine(ctx.brief), findings: findingsText(ctx.findings || []),
    place: placeLine(ctx.place), things: placeDigest(ctx.place || {}).things.map(t => `${t.id} (${t.name})`).join(', ') || 'none',
    people: peopleText(ctx.parts || {}), patterns: patternsText(ctx.library || {}), lang: ctx.lang || 'the language of the sentence',
    topic: ctx.topic ? `${ctx.topic.id}: ${ctx.topic.q}` : '', powers: (ctx.brief && ctx.brief.powers && ctx.brief.powers.length) ? ctx.brief.powers.join(', ') : 'none',
    results: ctx.results && ctx.results.length ? 'Search results (cite their title and address as the source):\n' + ctx.results.map(r => `- ${r.title} — ${r.url}: ${String(r.text || '').slice(0, 400)}`).join('\n') : '',
    path: P.text, length: P.length,
  };
  return fillText(stage.prompt, slots).replace(/\n{3,}/g, '\n\n');
}
export function repairText(prompt, answer, errors, data) {
  return prompt + '\n' + fillText(data.repair, { errors: errors.slice(0, 20).map(e => '- ' + e), answer: String(answer || '').slice(0, 12000) });
}
export function environmentDescription(sentence, findings, data) {
  const st = stageOf(data, 'environment');
  if (!findings || !findings.length) return String(sentence || '');
  return fillText(st && st.description || ['{{sentence}}', '', '{{findings}}'], { sentence: String(sentence || ''), findings: findingsText(findings, { max: 10, prefer: ['place', 'light', 'sound'] }) });
}

/* ---------------------------------------------------------------- answers */
function sectionsOf(text) {
  const out = []; let cur = null;
  for (const raw of String(text || '').replace(/```[a-z]*\n?/gi, '').split(/\r?\n/)) {
    const m = /^\s*===\s*([a-z]+)(?:\s+(\S+))?\s*$/i.exec(raw);
    if (m) { cur = { name: m[1].toLowerCase(), arg: m[2] || null, lines: [] }; out.push(cur); continue; }
    if (cur) cur.lines.push(raw);
  }
  return out;
}
const csv = s => String(s || '').split(/\s*,\s*/).map(x => x.trim()).filter(x => x && !/^(none|-)$/i.test(x));
function pipes(line, word) {
  const m = new RegExp(`^\\s*${word}\\s+([a-z][a-z0-9-]{0,40})\\s*\\|(.*)$`).exec(line); if (!m) return null;
  const parts = m[2].split('|').map(s => s.trim()), o = { id: m[1], name: parts[0] || m[1] };
  for (const p of parts.slice(1)) { const k = /^([a-z]+)\s+(.*)$/.exec(p); if (k) o[k[1]] = k[2].trim(); }
  return o;
}
/* Every part an agent may write, read from its answer. Unknown sections are ignored; a file outside the pack's folders is an error. */
export function readStudioAnswer(text) {
  const r = { brief: null, findings: [], about: null, lines: {}, files: {}, questions: [], arc: null, errors: [] };
  const S = sectionsOf(text);
  if (!S.length) r.errors.push('the answer has no "=== …" section');
  const kv = lines => { const o = {}; for (const l of lines) { const m = /^\s*([a-z_]+)\s*:\s*(.*)$/.exec(l); if (m) o[m[1]] = m[2].trim(); } return o; };
  for (const s of S) {
    if (s.name === 'brief') r.brief = kv(s.lines);
    else if (s.name === 'findings') for (const l of s.lines) { const m = /^\s*[-*]\s*(.+)$/.exec(l); if (!m) continue; const p = m[1].split('|').map(x => x.trim()); if (p[0]) r.findings.push({ text: p[0], source: p[1] || '', supports: (p[2] || '').toLowerCase().split(/[\s,]+/)[0] || '' }); }
    else if (s.name === 'about') r.about = kv(s.lines);
    else if (s.name === 'lines') for (const l of s.lines) { const m = /^\s*([a-z][\w.-]*)\s*:\s*(.+)$/.exec(l); if (m) (r.lines[m[1]] = r.lines[m[1]] || []).push(m[2].trim()); }
    else if (s.name === 'questions') r.questions = readQuestions('=== questions\n' + s.lines.join('\n') + '\n=== about');
    else if (s.name === 'arc') r.arc = Object.assign(r.arc || { stations: [], beats: [], endings: [] }, kv(s.lines));
    else if (s.name === 'stations' || s.name === 'beats' || s.name === 'endings') {
      r.arc = r.arc || { stations: [], beats: [], endings: [] };
      const word = s.name.slice(0, -1);
      for (const l of s.lines) {
        const o = pipes(l, word); if (!o) continue;
        if (word === 'station') r.arc.stations.push({ id: o.id, name: o.name, along: +o.along || 0, side: +o.side || 0, reach: csv(o.reach), finds: csv(o.finds), line: o.line || null });
        else if (word === 'beat') r.arc.beats.push({ id: o.id, name: o.name, stations: csv(o.stations), establish: csv(o.establish) });
        else r.arc.endings.push({ id: o.id, name: o.name, requires: csv(o.requires), when: o.when || '', line: o.line || null });
      }
    } else if (s.name === 'file') {
      if (!FILE.test(s.arg || '')) { r.errors.push(`file ${s.arg}: not a characters/, facts/, patterns/ or rules/ .pdl file`); continue; }
      r.files[s.arg] = s.lines.join('\n').trim() + '\n';
    }
  }
  if (r.about && r.about.cannot_show !== undefined) r.about.cannot_show = csv(r.about.cannot_show);
  return r;
}
/* The source lines an answer holds (what the language panel shows being written): every line but section heads and blanks. */
export function wroteLines(text) { return String(text || '').split(/\r?\n/).map(l => l.replace(/\s+$/, '')).filter(l => l.trim() && !/^\s*===/.test(l) && !/^\s*```/.test(l)); }

function normBrief(b, sentence, lang) {
  const x = Object.assign({}, b || {});
  x.lang = x.lang && /^(en|fr)/i.test(x.lang) ? x.lang.slice(0, 2).toLowerCase() : lang || guessLang(sentence);
  x.kind = /story/i.test(x.kind || '') ? 'story' : 'free';
  x.powers = csv(x.powers);
  x.topics = String(x.topics || '').split(';').map(t => { const m = /^\s*([a-z][a-z0-9-]*)\s*:\s*(.+)$/i.exec(t); return m ? { id: m[1].toLowerCase(), q: m[2].trim() } : null; }).filter(Boolean);
  if (!x.topics.length) x.topics = [{ id: 'place', q: String(sentence || '').slice(0, 200) }];
  if (!x.title) x.title = String(sentence || '').slice(0, 40);
  return x;
}

/* ---------------------------------------------------------------- assembling the parts into one sketch */
const PART_STAGES = ['people', 'interactions', 'arc', 'questions'];
function assemble(parts, brief, sentence) {
  const about = Object.assign({ title: brief.title, lang: brief.lang, stake: brief.story || '' }, (parts.people && parts.people.about) || {});
  about.lang = brief.lang;
  const lines = {}, files = {}, owners = {};
  for (const id of PART_STAGES) {
    const p = parts[id]; if (!p) continue;
    for (const [k, v] of Object.entries(p.lines || {})) lines[k] = (lines[k] || []).concat(v);
    for (const [path, text] of Object.entries(p.files || {})) {
      let f = path; if (files[f] !== undefined) f = path.replace(/\.pdl$/, '-' + id + '.pdl');
      files[f] = text; owners[f] = id;
    }
  }
  const arc = parts.arc && parts.arc.arc ? parts.arc.arc : null;
  return { sketch: { source: 'studio', about, questions: (parts.questions && parts.questions.questions) || [], lines, files, arc, errors: [] }, owners };
}
/* Which stage an error of checkSketch belongs to (null: no stage; the code fallback answers for it). */
function blame(err, owners, compiled, files) {
  const m = /^((?:characters|facts|patterns|rules)\/[\w.-]+\.pdl)/.exec(err); if (m) return owners[m[1]] || null;
  if (/^arc:/.test(err)) return 'arc';
  if (/^lines: no |^about: no carrier|^carrier |the carrier is "Sam"/.test(err)) return 'people';
  if (/^question /.test(err)) return 'questions';
  const r = /^rule ([\w.-]+):/.exec(err);
  if (r && compiled) {
    const p = compiled.principles.find(x => x.id === r[1]); if (!p) return null;
    if (p.instance) { const f = Object.keys(files).find(k => parseSource(files[k], { file: k }).id === p.instance); return f ? owners[f] || null : null; }
    return owners[p.source && p.source.file] || null;
  }
  return null;
}

/* ---------------------------------------------------------------- the chain */
export async function runStudio({ sentence = '', place = null, library = {}, base = {}, data = {}, ask = null, search = null, build = null, lang = null,
  onEvent = () => {}, onQuestion = () => {}, now = () => Date.now(), affordable = Infinity, signal = null } = {}) {
  const J = { format: STUDIO_FORMAT, sentence: String(sentence), events: [], stages: {}, source: null };
  const t0 = now(); let seq = 0;
  const emit = (e, transient = false) => {
    const ev = Object.assign({ seq: transient ? null : ++seq, t_ms: Math.max(0, Math.round(now() - t0)) }, e);
    if (ev.wrote && ev.wrote.length > WROTE_MAX) ev.wrote = ev.wrote.slice(0, WROTE_MAX).concat([`… ${ev.wrote.length - WROTE_MAX} more lines`]);
    if (!transient) J.events.push(ev);
    try { onEvent(ev); } catch (_) {}
    return ev;
  };
  const B = Object.assign({ research_calls: 3, repair_rounds: 1 }, data.budget || {});
  const ST = id => stageOf(data, id) || { id, role: id, tier: 'mid', instrument: 'invention', kind: 'draft', after: [] };
  const head = (st, agent = st.id) => ({ stage: st.id, agent, role: st.role, tier: st.tier, instrument: st.instrument });
  const mark = (id, status, extra = {}) => { J.stages[id] = Object.assign(J.stages[id] || { attempts: 0 }, { status }, extra); };
  const aborted = () => !!(signal && signal.aborted);
  const parts = {}, ctx = { sentence, library, lang: lang || guessLang(sentence), brief: null, findings: [], place, parts };

  /* One agent's call: pending, streamed lines (transient), done or failed with its latency. */
  async function call(st, agent, prompt, { kind = st.kind, tier = st.tier, onText = null } = {}) {
    if (!ask) throw new Error('no model');
    if (aborted()) throw new Error('cancelled');
    const t = now(); let shown = 0;
    emit(Object.assign(head(st, agent), { tier, kind, status: 'pending', text: st.role }));
    const stream = full => {
      const L = wroteLines(full), complete = /\n\s*$/.test(full) ? L.length : L.length - 1;
      if (complete > shown) { emit(Object.assign(head(st, agent), { tier, kind, status: 'writing', wrote: L.slice(shown, complete) }), true); shown = complete; }
      if (onText) onText(full);
    };
    try {
      const r = await ask(prompt, { stage: st.id, agent, tier, onText: stream, signal });
      const text = String(r && typeof r === 'object' ? r.text || '' : r || '');
      const ev = emit(Object.assign(head(st, agent), { tier, kind, status: 'done', latency_ms: Math.round(now() - t), wrote: wroteLines(text) }, r && r.adapter ? { adapter: r.adapter } : {}));
      return { text, ev };
    } catch (e) {
      emit(Object.assign(head(st, agent), { tier, kind, status: 'failed', latency_ms: Math.round(now() - t), text: String(e && e.message || e).slice(0, 200) }));
      throw e;
    }
  }

  /* The one-call fallback: the first lot's sketch, when only one call is affordable (or the page asks for it). */
  if (ask && affordable <= 1) {
    const st = { id: 'sketch', role: 'writes the whole sketch in one call', tier: 'large', instrument: 'invention', kind: 'draft' };
    let pl = place;
    if (!pl && build) pl = await buildPlace(String(sentence), []);
    const r = await conceive({ sentence, place: pl || {}, library, base, lang, onQuestion: q => { emit(Object.assign(head(st), { kind: 'question', status: 'done', text: q.text })); onQuestion(q); },
      ask: async (prompt, o) => (await call(st, o.purpose === 'repair' ? 'sketch.repair' : 'sketch', prompt, { onText: o.onText })).text });
    emit(Object.assign(head(ST('check')), { kind: 'check', status: r.source === 'fallback' ? 'fallback' : 'done', text: r.source }));
    J.source = r.source === 'fallback' ? 'fallback' : 'sketch';
    mark('sketch', r.source);
    return finish(Object.assign(r, { place: pl || {}, brief: null, findings: [] }));
  }

  /* -------------------------------------------- the stages */
  const settled = {};
  const run = id => settled[id] || (settled[id] = (async () => {
    const st = ST(id);
    await Promise.all((st.after || []).filter(a => stageOf(data, a)).map(run));
    if (aborted()) { mark(id, 'skipped'); return; }
    try { await STAGE[id](st); } catch (e) { mark(id, 'failed', { error: String(e && e.message || e).slice(0, 200) }); }
    if (!ctx.brief) ctx.brief = normBrief(null, sentence, lang);
  })());
  const invent = async (st, extra = {}) => {
    if (!ask) { emit(Object.assign(head(st), { kind: st.kind, status: 'skipped', text: 'no model answered' })); mark(st.id, 'skipped'); return null; }
    J.stages[st.id] = { attempts: 1, status: 'pending' };
    const prompt = studioPrompt(st, Object.assign({}, ctx, extra), data);
    try {
      const { text, ev } = await call(st, extra.agent || st.id, prompt, { onText: extra.onText });
      const p = readStudioAnswer(text); p.text = text; p.prompt = prompt;
      mark(st.id, 'done', { latency_ms: ev.latency_ms });
      return p;
    } catch (e) { mark(st.id, 'failed', { error: String(e && e.message || e).slice(0, 200) }); return null; }
  };
  async function buildPlace(description, findings) {
    const st = ST('environment'), t = now();
    emit(Object.assign(head(st, 'builder'), { kind: 'build', status: 'pending', text: st.role }));
    try {
      const pl = await build({ description, sentence, brief: ctx.brief, findings, signal,
        onStep: info => emit(Object.assign(head(st, 'builder'), { kind: 'build', status: 'step', step: info && (info.etape || info.step) || null, text: String(info && (info.texte || info.text) || '').slice(0, 240) })) });
      if (!pl || typeof pl !== 'object') throw new Error('the builder gave no place');
      const P = placeDigest(pl);
      emit(Object.assign(head(st, 'builder'), { kind: 'build', status: 'done', latency_ms: Math.round(now() - t), text: P.title, wrote: [`place ${P.title}`, ...P.things.map(x => `thing ${x.id} — ${x.name}`)] }));
      mark('environment', 'done', { latency_ms: Math.round(now() - t) });
      return pl;
    } catch (e) {
      emit(Object.assign(head(st, 'builder'), { kind: 'build', status: 'failed', latency_ms: Math.round(now() - t), text: String(e && e.message || e).slice(0, 200) }));
      mark('environment', 'failed', { error: String(e && e.message || e).slice(0, 200) });
      return null;
    }
  }
  const STAGE = {
    async understand(st) {
      const p = await invent(st);
      ctx.brief = normBrief(p && p.brief, sentence, lang);
      if (!p || !p.brief) emit(Object.assign(head(st), { kind: 'draft', status: 'fallback', text: 'the brief is the sentence itself (code)', wrote: [briefLine(ctx.brief)] }));
      ctx.lang = ctx.brief.lang;
    },
    async research(st) {
      if (!ask) { emit(Object.assign(head(st), { kind: 'finding', status: 'skipped', text: 'no model answered' })); mark(st.id, 'skipped'); return; }
      const topics = ctx.brief.topics.slice(0, Math.max(1, B.research_calls));
      J.stages[st.id] = { attempts: topics.length, status: 'pending', workers: topics.length };
      const one = async topic => {
        const agent = st.id + '.' + topic.id;
        let results = [];
        if (search) {
          const t = now();
          emit(Object.assign(head(st, agent), { instrument: 'search', kind: 'query', status: 'pending', text: topic.q }));
          try { results = (await search({ query: topic.q, lang: ctx.lang, signal }) || []).filter(x => x && x.title).slice(0, 6); emit(Object.assign(head(st, agent), { instrument: 'search', kind: 'query', status: 'done', latency_ms: Math.round(now() - t), text: `${results.length} results: ${topic.q}` })); }
          catch (e) { results = []; emit(Object.assign(head(st, agent), { instrument: 'search', kind: 'query', status: 'failed', latency_ms: Math.round(now() - t), text: String(e && e.message || e).slice(0, 200) })); }
        }
        emit(Object.assign(head(st, agent), { kind: 'query', status: 'done', text: topic.q }));
        let r;
        try { r = await call(st, agent, studioPrompt(st, Object.assign({}, ctx, { topic, results }), data), { kind: 'finding' }); } catch (_) { return []; }
        const known = new Set(results.map(x => x.title).concat(results.map(x => x.url)));
        return readStudioAnswer(r.text).findings.map(f => {
          const cited = results.length && [...known].some(k => k && f.source.includes(k));
          const g = { text: f.text.slice(0, 300), source: cited ? f.source.slice(0, 200) : data.knowledge_source || "the model's knowledge", supports: f.supports || topic.id, topic: topic.id, agent };
          emit(Object.assign(head(st, agent), { kind: 'finding', status: 'done', text: g.text, source: g.source, supports: g.supports }));
          return g;
        });
      };
      const all = await Promise.all(topics.map(one));
      ctx.findings = all.flat();
      mark(st.id, ctx.findings.length ? 'done' : 'failed', { findings: ctx.findings.length });
    },
    async environment(st) {
      if (!build) {
        emit(Object.assign(head(st, 'builder'), { instrument: 'code', kind: 'build', status: ctx.place ? 'done' : 'failed', text: ctx.place ? 'the place was built before the studio: kept as it is' : 'no place and no builder' }));
        mark(st.id, ctx.place ? 'given' : 'failed'); return;
      }
      const pl = await buildPlace(environmentDescription(sentence, ctx.findings, data), ctx.findings);
      if (pl) ctx.place = pl;
      else if (ctx.place) emit(Object.assign(head(st, 'builder'), { kind: 'build', status: 'fallback', text: 'the place given before the studio stands' }));
    },
    async people(st) { parts.people = await invent(st); },
    async interactions(st) { parts.interactions = await invent(st); },
    async arc(st) {
      if (ctx.brief.kind !== 'story') { emit(Object.assign(head(st), { kind: 'draft', status: 'skipped', text: 'a free place: no arc, no stations beyond the one where the carrier stands' })); mark(st.id, 'skipped'); return; }
      parts.arc = await invent(st);
    },
    async questions(st) {
      const seen = new Set();
      parts.questions = await invent(st, { onText: full => { for (const q of readQuestions(full)) if (!seen.has(q.target)) { seen.add(q.target); emit(Object.assign(head(st), { kind: 'question', status: 'done', text: q.text, wrote: [`q ${q.target} | ${q.text} | ${q.options.join(' | ')}`] })); onQuestion(q); } } });
      if (parts.questions) for (const q of parts.questions.questions) if (!seen.has(q.target)) { seen.add(q.target); emit(Object.assign(head(st), { kind: 'question', status: 'done', text: q.text })); onQuestion(q); }
    },
    async check(st) { await checkAndCompile(st); },
  };

  /* -------------------------------------------- check and compile: one repair round per failing stage, then drop, then the code */
  let result = null;
  async function checkAndCompile(st) {
    const pl = ctx.place || {};
    const evaluate = () => {
      const { sketch, owners } = assemble(parts, ctx.brief, sentence);
      const pack = sketchPack(sketch, { sentence, place: pl, base });
      const c = checkSketch(pack, library), byStage = {};
      for (const id of PART_STAGES) if (parts[id]) for (const e of parts[id].errors || []) (byStage[id] = byStage[id] || []).push(e);
      const loose = [];
      for (const e of c.errors) { const s = blame(e, owners, c.compiled, sketch.files); if (s && parts[s]) (byStage[s] = byStage[s] || []).push(e); else loose.push(e); }
      return { sketch, pack, byStage, loose, n: Object.values(byStage).flat().length + loose.length };
    };
    const t = now();
    if (!parts.people && ask) {                                   // no carrier written: the code writes one, the other parts stay
      parts.people = peopleFallback(); mark('people', 'fallback');
      emit(Object.assign(head(ST('people')), { kind: 'draft', status: 'fallback', text: 'the carrier is written by code from the sentence' }));
    }
    emit(Object.assign(head(st), { kind: 'check', status: 'pending', text: 'compilePack and the references every stage uses' }));
    let v = evaluate(), repaired = [], dropped = [];
    const report = (status, text) => emit(Object.assign(head(st), { kind: 'check', status, latency_ms: Math.round(now() - t), text, wrote: [...Object.entries(v.byStage).flatMap(([s, E]) => E.slice(0, 4).map(e => `${s}: ${e}`)), ...v.loose.slice(0, 4)] }));
    report(v.n ? 'failed' : 'done', v.n ? `${v.n} error(s) in ${Object.keys(v.byStage).join(', ') || 'the assembly'}` : 'compiles: no error');
    for (let round = 0; round < B.repair_rounds && Object.keys(v.byStage).length && ask; round++) {
      await Promise.all(Object.entries(v.byStage).map(async ([id, errors]) => {
        const sst = ST(id), prev = parts[id];
        J.stages[id].attempts = (J.stages[id].attempts || 1) + 1;
        try {
          const { text } = await call(sst, id + '.repair', repairText(prev.prompt, prev.text, errors, data));
          const p = readStudioAnswer(text); p.text = text; p.prompt = prev.prompt; parts[id] = p;
        } catch (_) {}
      }));
      const before = Object.keys(v.byStage);
      v = evaluate();
      for (const id of before) if (!v.byStage[id] && parts[id]) { repaired.push(id); mark(id, 'repaired'); emit(Object.assign(head(ST(id), id + '.repair'), { kind: ST(id).kind, status: 'repaired', text: 'compiles after one repair' })); }
      report(v.n ? 'failed' : 'done', v.n ? `after repair: ${v.n} error(s) in ${Object.keys(v.byStage).join(', ') || 'the assembly'}` : 'compiles after repair');
    }
    for (let k = 0; k < PART_STAGES.length && Object.keys(v.byStage).length; k++) {      // still failing: that stage's part goes, the others stay
      for (const id of Object.keys(v.byStage)) {
        parts[id] = id === 'people' ? peopleFallback() : null; dropped.push(id); mark(id, 'fallback');
        emit(Object.assign(head(ST(id)), { kind: ST(id).kind, status: 'fallback', text: id === 'people' ? 'the carrier is written by code from the sentence' : 'left out: its part did not compile' }));
      }
      v = evaluate();
    }
    let sketch = v.sketch, pack = v.pack, source = dropped.length ? 'partial' : repaired.length ? 'repaired' : 'model';
    if (v.loose.length || !ask || !PART_STAGES.some(id => parts[id] && !parts[id].code)) {
      sketch = fallbackSketch({ sentence, place: pl, base, lang: ctx.lang });
      if (ctx.brief && ctx.brief.title && ask) sketch.about.title = sketch.about.title || ctx.brief.title;
      pack = sketchPack(sketch, { sentence, place: pl, base }); source = 'fallback';
      emit(Object.assign(head(st), { kind: 'check', status: 'fallback', text: ask ? 'the parts do not hold together: a sketch built by code from the place' : 'no model answered: a sketch built by code from the place' }));
    }
    const M = pack.manifest, S = M.sketch;
    S.source = source; S.brief = ctx.brief; S.findings = ctx.findings.slice(0, 30);
    const pw = pack.texts['rules/powers.pdl'] ? parseSource(pack.texts['rules/powers.pdl'], { file: 'rules/powers.pdl' }).statements.filter(s => s.id) : [];
    S.powers = pw.map(s => ({ id: s.id, text: s.text || '', granted: s.mark === '!!' ? false : s.mark === '?' ? null : true }));
    S.studio = Object.fromEntries(Object.entries(J.stages).map(([k, x]) => [k, x.status]));
    emit(Object.assign(head(st), { kind: 'check', status: 'done', latency_ms: Math.round(now() - t), text: `${source}: ${Object.keys(pack.texts).length} files, ${pack.stations.stations.length} station(s)`, wrote: Object.keys(pack.texts) }));
    mark('check', 'done', { source });
    J.source = source;
    result = { source, sketch, pack, questions: sketch.questions || [], about: sketch.about, place: pl, brief: ctx.brief, findings: ctx.findings,
      attempts: Object.entries(J.stages).map(([k, x]) => ({ kind: k, status: x.status, attempts: x.attempts })) };
  }
  function peopleFallback() {
    const fb = fallbackSketch({ sentence, place: ctx.place || {}, base, lang: ctx.lang });
    return { code: true, about: fb.about, lines: {}, files: { 'characters/carrier.pdl': fb.files['characters/carrier.pdl'], 'facts/people.pdl': fb.files['facts/sketch.pdl'] }, errors: [] };
  }

  for (const st of data.stages || []) run(st.id);
  await Promise.all(Object.values(settled));
  if (!result) await checkAndCompile(ST('check'));
  return finish(result);

  function finish(r) {
    J.ms = Math.round(now() - t0);
    r.creation = J;
    r.pack.creation = J;
    r.pack.manifest.creation = 'creation.json';
    return r;
  }
}

/* ---------------------------------------------------------------- the harvest's view (ADR 0011): stages, events, nothing personal when stripped */
export function creationSummary(J, { strip = false, events = 200, wrote = 12 } = {}) {
  if (!J || !Array.isArray(J.events)) return null;
  return { format: J.format, source: J.source, ms: J.ms ?? null, sentence: strip ? null : J.sentence, stages: J.stages,
    events: J.events.slice(0, events).map(e => Object.assign({}, e, e.wrote ? { wrote: e.wrote.slice(0, wrote) } : {})), cut: J.events.length > events ? J.events.length - events : 0 };
}
