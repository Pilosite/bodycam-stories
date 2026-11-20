/* The harvest (ADR 0011, P17, P23): one collectable record per session, and what a set of records proposes.
   Pure: no DOM, no I/O. Used by the page (src/harvest.js, as CORE.harvestRecord…) and by tools/harvest.mjs.

     harvestRecord(journal, { gaps, meta, strip, now, journalBytes })   → record (docs/creator-kit.md, "The harvest")
       journal: the core's (entries, JSONL text) or the legacy free mode's French text journal ("JOURNAL · …", src/main.js).
       gaps:    the engine executor's gaps of a story session (src/adaptateur-core.js), journaled nowhere else.
       meta:    what only the page knows: { mode, id, device, lang, pack: { id, version }, versions: {…} }.
       strip:   the player's sentences are replaced by their class ("[player: go]"), in the lists and in the journal.
     parseLegacyJournal(text)                                            → { head, items } (each item keeps its seq)
     mergeRecords(records)                                               → the merged report: requests not served, grouped
                                                                           by what was missing; everything improvised; latency
                                                                           rows; and the proposals, one list per layer (P23)

   The three lists (ADR 0011 §2), every item with the journal `seq` it comes from:
     asked_not_doable   executor gaps, rejections for want of vocabulary (unknown op, field, cue…, reserved v2), dropped
                        values the vocabulary lacks, intents heard as `other` or below confidence; legacy: things refused
                        or failed, refusals of the sas.
     improvised         facts, things and rules a model established in play, with the sentence that prompted them.
     slow_or_doubtful   calls over their loop's budget, held, failed or stale calls, low-confidence judgements, repairs and
                        rejections with their reason, dropped model lines; legacy: turns with no first reaction within the
                        now budget, late, invalid or dropped answers, the page's corrections.
   Nothing here applies anything: proposals are text for a person to accept or drop (P23). */
import { PDL_VERSION, BUDGET, ACT, EFFECT, RESERVED_ACT, INTENT_VERBS, SHAPE_KINDS, TONES } from './vocab.js';
import { LOOPS } from './session.js';
import { modelSummary, fromJSONL } from './journal.js';
import { canonicalJSON, hashString } from './world.js';

export const HARVEST_VERSION = 1;
export const HARVEST_CAPS = { items: 80, text: 300, journal_bytes: 150000 };
export const THRESHOLDS = { act_from: 0.8, ask_below: 0.5 };
/* Validator reasons that say the vocabulary lacks something (asked and not doable), not that a principle forbade it. */
export const MISSING_WHY = ['unknown_op', 'reserved_v2', 'unknown_field', 'unknown_value', 'unknown_cue', 'unknown_line', 'unknown_target', 'unknown_kind', 'unknown_type', 'unknown_condition', 'unknown_language', 'unreachable_station', 'not_a_shape'];
/* Legacy events (src/meneur.js log) that say a request could not be served, and those that are the page's corrections. */
const LEGACY_MISSING = ['objet_refuse', 'objet_rate', 'modif_ratee', 'modif_refusee', 'modifie_sans_cible', 'monter_sans_support', 'faconnage_abandonne', 'temps_refuse', 'fin_refusee', 'suite_refusee', 'defaire_inconnu', 'atelier_occupe'];
const LEGACY_REPAIRS = ['apercu_jete', 'pensee_jetee', 'exploit_corrige', 'pose_corrigee', 'cible_corrigee', 'stop_filtre', 'objet_recycle'];
const LEGACY_FIRST = ['geste_immediat', 'anticipe', 'stop'];       // a visible reaction that does not wait for the model

const clone = o => o === undefined ? undefined : JSON.parse(JSON.stringify(o));
const short = (s, n = HARVEST_CAPS.text) => { s = String(s ?? ''); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
const med = xs => { const s = xs.filter(x => typeof x === 'number').sort((a, b) => a - b); return s.length ? s[Math.floor((s.length - 1) / 2)] : null; };
const q95 = xs => { const s = xs.filter(x => typeof x === 'number').sort((a, b) => a - b); return s.length ? s[Math.min(s.length - 1, Math.floor(0.95 * (s.length - 1) + 0.5))] : null; };
const round = x => typeof x === 'number' ? Math.round(x) : x;
export const slug = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'x';

/* The data that steers the core's behaviour, as versions (ADR 0011 §4): a behaviour can be traced to what produced it. */
export function coreVersions() {
  return { pdl: PDL_VERSION, vocab: hashString(canonicalJSON({ ACT, EFFECT, RESERVED_ACT, INTENT_VERBS, SHAPE_KINDS, TONES })),
    budgets: { loops_ms: clone(LOOPS), tx: hashString(canonicalJSON(BUDGET)) }, harvest: HARVEST_VERSION };
}

/* ================================================================ the legacy free mode's text journal */

export const isLegacyText = x => typeof x === 'string' && /(^|\n)JOURNAL · /.test(x);
const num = s => Number(String(s).replace(',', '.'));
function legacyValue(v) { v = v.trim(); if (/^[[{"]|^(null|true|false|-?\d+(\.\d+)?)$/.test(v)) try { return JSON.parse(v); } catch (_) {} return v; }

/* The French journal printed by src/main.js journal(): a header, one block per call or event ("[0,3 min] …", continuation
   lines indented), a final "ÉTAT" line. Each block gets a seq: its order in the journal (0 is the header). */
export function parseLegacyJournal(text) {
  const lines = String(text).split(/\r?\n/), items = [];
  let head = null, cur = null, seq = 0;
  for (const raw of lines) {
    if (!head) {
      const h = /^JOURNAL · (.*)$/.exec(raw.trim()); if (!h) continue;
      const parts = h[1].split(' · ');
      head = { seq: 0, histoire: parts[0], graine: null, with_model: null, debug: false, device: '', at: '' };
      for (const p of parts.slice(1)) {
        if (/^graine \d+/.test(p)) head.graine = +p.slice(7);
        else if (/^avec Claude/.test(p)) head.with_model = true;
        else if (/^SANS Claude/.test(p)) head.with_model = false;
        else if (/^MODE DEBUG/.test(p)) head.debug = true;
        else if (/^\d{4}-\d\d-\d\dT/.test(p)) head.at = p;
        else if (p) head.device = p;
      }
      continue;
    }
    if (/^ÉTAT · /.test(raw)) {
      const m = /ÉTAT · ([\d,.]+) min · tours (\d+)/.exec(raw);
      items.push(cur = { seq: ++seq, kind: 'state', min: m ? num(m[1]) : null, turns: m ? +m[2] : null, text: raw.slice(7) }); cur = null; continue;
    }
    const b = /^\[([\d,.]+) min\] (.*)$/.exec(raw);
    if (b) {
      const min = num(b[1]), body = b[2], parts = body.split(' · ');
      if (/^[A-ZÉ_]+$/.test(parts[0])) {                         // a call to the model: VOIX, EVENEMENT, RELANCE, FIN, OBJET…
        cur = { seq: ++seq, kind: 'call', min, type: parts[0].toLowerCase(), said: null, statut: null, ms: null, fields: {} };
        for (const p of parts.slice(1)) {
          const s = /^joueur : "(.*)"$/.exec(p);
          if (s) { cur.said = s[1]; continue; }
          const st = /^([a-z_]+)(?: en ([\d,.]+) s)?$/.exec(p);
          if (st) { cur.statut = st[1]; if (st[2]) cur.ms = Math.round(num(st[2]) * 1000); }
        }
      } else {                                                    // an event: "type · k v · k v", or "pensee · source · « text »"
        cur = { seq: ++seq, kind: 'event', min, type: parts[0], data: {} };
        if (parts[0] === 'pensee') { cur.data.source = parts[1]; cur.data.texte = parts.slice(2).join(' · ').replace(/^« /, '').replace(/ »$/, ''); }
        else for (const p of parts.slice(1)) { const i = p.indexOf(' '); if (i < 0) cur.data[p] = true; else cur.data[p.slice(0, i)] = legacyValue(p.slice(i + 1)); }
      }
      items.push(cur); continue;
    }
    if (cur && cur.kind === 'call' && /^ {2,}\S/.test(raw)) {      // continuation of a call: sas, the thought, actions, faits…
      const l = raw.trim();
      const th = /^(?:\(([a-z]+)\) )?« ([\s\S]*) »$/.exec(l);
      if (th) { cur.fields.pensee = th[2]; if (th[1]) cur.fields.attitude = th[1]; continue; }
      const k = /^([a-z_]+) : (.*)$/.exec(l);
      if (!k) continue;
      if (k[1] === 'sas') { const [verdict, ...rest] = k[2].split(' · '); cur.fields.sas = { verdict, motif: rest.pop() || '', regle: rest[0] || null }; }
      else cur.fields[k[1]] = legacyValue(k[2]);
    }
  }
  return { head, items };
}

/* ================================================================ one record */

const entriesOf = j => Array.isArray(j) ? j : typeof j === 'string' ? fromJSONL(j) : j && j.entries ? j.entries : [];

export function harvestRecord(journal, { gaps = [], meta = {}, strip = false, now = null, journalBytes = HARVEST_CAPS.journal_bytes } = {}) {
  const legacy = isLegacyText(journal);
  const r = legacy ? fromLegacy(parseLegacyJournal(journal), meta) : fromCore(entriesOf(journal), gaps, meta);
  const cap = l => l.length > HARVEST_CAPS.items ? l.slice(0, HARVEST_CAPS.items).concat([{ seq: null, kind: 'cut', what: `${l.length - HARVEST_CAPS.items} more items not kept` }]) : l;
  const rec = {
    type: 'harvest', v: HARVEST_VERSION, id: meta.id || r.id, created: now || r.at || null, source: legacy ? 'legacy' : 'core',
    mode: meta.mode || r.mode, pack: meta.pack || r.pack, device: short(meta.device || r.device || '', 120) || null, lang: meta.lang || r.lang || null,
    seed: r.seed ?? null, with_model: r.with_model, duration_s: r.duration_s, turns: r.turns,
    versions: Object.assign({}, legacy ? { harvest: HARVEST_VERSION } : coreVersions(), r.versions || {}, meta.versions || {}),
    summary: r.summary,
    asked_not_doable: cap(r.asked), improvised: cap(r.improvised), slow_or_doubtful: cap(r.slow),
    stripped: !!strip,
    journal: { format: legacy ? 'legacy-text' : 'jsonl', text: null, cut: null },
  };
  let text = legacy ? String(journal) : entriesOf(journal).map(e => JSON.stringify(e)).join('\n') + '\n';
  if (strip) {
    const said = r.said;                                         // every player sentence → its class, wherever it appears
    const swap = s => { let x = s; for (const [t, cls] of said) if (t && x.includes(t)) x = x.split(t).join(`[player: ${cls}]`); return x; };
    const walk = o => Array.isArray(o) ? o.map(walk) : o && typeof o === 'object' ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k, walk(v)])) : typeof o === 'string' ? swap(o) : o;
    for (const k of ['asked_not_doable', 'improvised', 'slow_or_doubtful']) rec[k] = walk(rec[k]);
    if (legacy) text = swap(text);
    else text = entriesOf(journal).map(e => JSON.stringify(walk(e))).join('\n') + '\n';
  }
  if (text.length <= journalBytes) rec.journal.text = text;
  else if (!legacy) {                                            // the replay needs inputs, not derived events nor the principles in scope
    const lean = text.trim().split('\n').map(l => JSON.parse(l)).filter(e => e.type !== 'event').map(e => { if (e.type === 'model_call') delete e.principles; return e; });
    const t2 = lean.map(e => JSON.stringify(e)).join('\n') + '\n';
    if (t2.length <= journalBytes) { rec.journal.text = t2; rec.journal.cut = `events and principles in scope left out (${text.length} bytes in full)`; }
    else rec.journal.cut = `journal not kept: ${text.length} bytes over ${journalBytes}`;
  } else rec.journal.cut = `journal not kept: ${text.length} bytes over ${journalBytes}`;
  return rec;
}

/* ------------------------------------------------ the core's journal */
function fromCore(E, gaps, meta) {
  const head = E.find(e => e.type === 'session') || {};
  const asked = [], improvised = [], slow = [], said = new Map();
  const intents = E.filter(e => e.type === 'tx' && e.kind === 'intent');
  const intentBefore = seq => { let x = null; for (const i of intents) if (i.seq <= seq) x = i; else break; return x; };
  const sentence = seq => { const i = intentBefore(seq); return i && i.body ? short(i.body.text) : null; };
  const classOf = b => b ? (b.class || b.verb || 'other') : 'other';
  for (const i of intents) if (i.body && i.body.text) said.set(i.body.text, classOf(i.body));
  const intentCall = new Map();                                  // the now loop's intent call follows its intent
  for (const e of E) if (e.type === 'model_call' && e.purpose === 'intent') { const i = intentBefore(e.seq); if (i) intentCall.set(i.seq, e); }
  const TH = Object.assign({}, THRESHOLDS, (meta.versions && meta.versions.thresholds) || {});

  for (const g of gaps || []) asked.push({ seq: g.seq ?? null, kind: 'engine_gap', what: `${g.call}: ${g.why}`, missing: g.call, said: g.seq != null ? sentence(g.seq) : null });
  for (const i of intents) {
    if (i.cause && i.cause.amends !== undefined) continue;        // a judged intent amending the reflex one is counted once
    const c = intentCall.get(i.seq), p = c && typeof c.p === 'number' ? c.p : null, verb = i.body && i.body.verb;
    if (verb === 'other' || (p !== null && p < TH.act_from)) asked.push({ seq: i.seq, kind: 'not_understood', what: verb === 'other' ? 'heard as other' : `heard as ${verb} at p ${p}`, missing: 'intent', class: classOf(i.body), p, play: c && c.play, said: short(i.body.text) });
  }
  for (const e of E) {
    if (e.type === 'tx') {
      const who = e.author ? e.author.kind + (e.author.id ? ':' + e.author.id : '') : '?';
      const op = e.body && e.body.op ? e.body.op : e.kind;
      if (e.status === 'rejected') {
        const miss = (e.reasons || []).filter(x => MISSING_WHY.includes(x.why)), other = (e.reasons || []).filter(x => !MISSING_WHY.includes(x.why));
        if (miss.length) asked.push({ seq: e.seq, kind: 'rejected_missing', what: miss.map(x => `${x.why} ${x.value ?? x.path}`).join('; '), missing: miss.map(x => x.why === 'reserved_v2' || x.why === 'unknown_op' ? 'op:' + x.value : x.why + ':' + (x.value ?? x.path)).join(','), op, by: who, said: sentence(e.seq) });
        if (other.length) slow.push({ seq: e.seq, kind: 'rejected', what: `${e.kind} ${op} rejected: ` + other.map(x => x.why === 'constraint' ? 'principle ' + x.value + (x.by ? ' (' + x.by + ')' : '') : x.why + (x.value !== undefined ? ' ' + short(JSON.stringify(x.value), 60) : '')).join('; '), why: other.map(x => x.why === 'constraint' ? 'constraint:' + x.value : x.why), op, by: who, line: e.body && e.body.line ? short(Object.values(e.body.line).find(v => typeof v === 'string')) : undefined, said: sentence(e.seq) });
      }
      if (e.status === 'repaired') {
        const drops = (e.repair || []).filter(x => x.action === 'drop' && /unknown/.test(x.why || ''));
        if (drops.length) asked.push({ seq: e.seq, kind: 'dropped_missing', what: drops.map(x => `${x.path} ${x.from}: ${x.why}`).join('; '), missing: drops.map(x => (x.path.split('.').pop()) + ':' + x.from).join(','), op, by: who, said: sentence(e.seq) });
        slow.push({ seq: e.seq, kind: 'repaired', what: `${e.kind} ${op} repaired: ` + (e.repair || []).map(x => `${x.path} ${x.action}${x.why ? ' (' + x.why + ')' : ''}`).join('; '), why: (e.repair || []).map(x => x.action + ':' + x.path.split('.').slice(-1)[0]), op, by: who, said: sentence(e.seq) });
      }
      if (e.late) slow.push({ seq: e.seq, kind: 'late', what: `${e.kind} ${op} landed after ${round(e.latency_ms)} ms, over the ${e.loop} budget ${e.budget_ms} ms`, loop: e.loop, ms: round(e.latency_ms), said: sentence(e.seq) });
      if (e.status !== 'rejected' && e.author && e.author.kind === 'model') {
        const b = e.body || {};
        if (e.kind === 'fact' && !b.commit) improvised.push({ seq: e.seq, kind: 'fact', subject: b.subject, predicate: b.predicate, value: b.value, certainty: b.certainty, horizon: e.horizon, text: factText(b), source: b.source, by: who, said: sentence(e.seq) });
        if (e.kind === 'effect' && b.op === 'thing.place') improvised.push({ seq: e.seq, kind: 'thing', id: b.id, name: b.name || b.id, shapes: (b.shapes || []).length, text: `${b.name || b.id} (${(b.shapes || []).length} shapes)`, by: who, said: sentence(e.seq) });
        if (e.kind === 'rule') improvised.push({ seq: e.seq, kind: 'rule', id: b.id, text: `when ${b.when && b.when.event}${b.when && b.when.match ? ' ' + JSON.stringify(b.when.match) : ''} -> ${(b.then || []).map(t => t.body && (t.body.op || t.body.ref || t.kind)).join(', ')}`, by: who, said: sentence(e.seq) });
        if (e.kind === 'act' && b.op === 'say' && b.line && e.loop !== 'now') improvised.push({ seq: e.seq, kind: 'line', text: short(Object.entries(b.line).filter(([k]) => k !== 'speaker').map(([k, v]) => k + ': ' + v).join(' | ')), tone: b.tone, by: who, said: sentence(e.seq) });
      }
    }
    if (e.type === 'model_call' && e.status !== 'pending') {
      const name = `${e.adapter || e.tier || '?'}/${e.instrument || '?'}/${e.purpose || '?'}`;
      const budget = LOOPS[e.loop] || null;
      if (e.status === 'failed') slow.push({ seq: e.seq, kind: 'failed', what: `${name} failed: ${short(e.error || '?', 120)}`, call: name, loop: e.loop, ms: round(e.latency_ms), said: sentence(e.seq) });
      else if (e.stale) slow.push({ seq: e.seq, kind: 'stale', what: `${name} landed after a newer utterance (${round(e.latency_ms)} ms): dropped`, call: name, loop: e.loop, ms: round(e.latency_ms), said: sentence(e.seq) });
      else if (budget && typeof e.latency_ms === 'number' && e.latency_ms > budget) slow.push({ seq: e.seq, kind: 'over_budget', what: `${name} took ${round(e.latency_ms)} ms, over the ${e.loop} budget ${budget} ms`, call: name, loop: e.loop, ms: round(e.latency_ms), said: sentence(e.seq) });
      if (e.status === 'landed' && e.loop === 'scene' && e.ref_seq !== undefined) {
        const p0 = E.find(x => x.seq === e.ref_seq);
        if (p0 && p0.loop === 'now') slow.push({ seq: e.seq, kind: 'held', what: `${name} asked in the now loop, landed in the scene loop after ${round(e.latency_ms)} ms: she held`, call: name, ms: round(e.latency_ms), said: sentence(e.seq) });
      }
      if (e.instrument === 'judgement' && e.purpose !== 'intent' && typeof e.p === 'number' && e.p < TH.act_from) slow.push({ seq: e.seq, kind: 'unsure', what: `${name} answered at p ${e.p}${e.play ? ' (' + e.play + ')' : ''}`, call: name, p: e.p, said: sentence(e.seq) });
      if (e.dropped) slow.push({ seq: e.seq, kind: 'dropped_lines', what: `${name}: ${e.dropped} model line(s) unreadable, dropped`, call: name, said: sentence(e.seq) });
    }
  }
  const sum = E.find(e => e.type === 'summary');
  const summary = sum ? Object.fromEntries(Object.entries(sum).filter(([k]) => !['seq', 't', 'type'].includes(k))) : (({ type, ...x }) => x)(modelSummary(E));
  summary.latency = latencyRows(E);
  const last = E.length ? E[E.length - 1] : {};
  const lang = (intents.find(i => i.body && i.body.lang) || {}).body;
  return { id: `${(head.scene && head.scene.id) || 'session'}-${head.seed ?? 0}`, mode: 'story', pack: head.scene && head.scene.id ? { id: head.scene.id } : null,
    seed: head.seed, with_model: E.some(e => e.type === 'model_call' && e.adapter && !['reflex', 'none'].includes(e.adapter)),
    duration_s: typeof last.t === 'number' ? last.t : 0, turns: intents.filter(i => !(i.cause && i.cause.amends !== undefined) && i.input).length,
    lang: lang ? lang.lang : null, versions: { journal: head.v ?? null }, summary, asked, improvised, slow, said };
}
const factText = b => `${b.subject} ${String(b.predicate || '').replace(/_/g, ' ')} ${typeof b.value === 'string' ? b.value : JSON.stringify(b.value)}`.trim();

/* Latency rows per adapter, instrument and purpose (as tools/model-latency.mjs): n, p50, p95, budget. */
function latencyRows(E) {
  const rows = {};
  for (const e of E.filter(e => e.type === 'model_call' && (e.status === 'done' || e.status === 'landed'))) {
    const k = `${e.adapter || e.tier || '?'}/${e.instrument || '?'}/${e.purpose || '?'}`;
    (rows[k] = rows[k] || { loop: e.loop, ms: [] }).ms.push(e.latency_ms);
  }
  return Object.fromEntries(Object.entries(rows).map(([k, r]) => [k, { n: r.ms.length, p50: round(med(r.ms)), p95: round(q95(r.ms)), budget: LOOPS[r.loop] || null, ms: r.ms.map(round) }]));
}

/* ------------------------------------------------ the legacy journal */
function fromLegacy({ head, items }, meta) {
  head = head || { histoire: '?', graine: null, device: '', at: '' };
  const asked = [], improvised = [], slow = [], said = new Map();
  const voices = items.filter(i => i.kind === 'call' && i.type === 'voix');
  const callBefore = seq => { let x = null; for (const v of voices) if (v.seq <= seq) x = v; else break; return x; };
  const sentence = seq => { const v = callBefore(seq); return v && v.said ? short(v.said) : null; };
  for (const v of voices) if (v.said) said.set(v.said, 'voice');
  const nextVoice = v => voices.find(x => x.seq > v.seq);
  for (const it of items) {
    if (it.kind === 'call') {
      const f = it.fields, name = 'host/invention/' + it.type;
      if (f.sas && f.sas.verdict === 'refuse') asked.push({ seq: it.seq, kind: 'refused', what: `refused by the sas${f.sas.regle ? ' (' + f.sas.regle + ')' : ''}: ${f.sas.motif}`, missing: 'sas:' + (f.sas.regle || 'refuse'), said: it.said ? short(it.said) : null });
      if (f.sas && f.sas.verdict === 'adapte') slow.push({ seq: it.seq, kind: 'adapted', what: `adapted by the sas: ${f.sas.motif}`, why: ['sas:adapte'], said: it.said ? short(it.said) : null });
      if (['delai', 'invalide', 'tardive', 'jetee'].includes(it.statut)) slow.push({ seq: it.seq, kind: it.statut === 'delai' ? 'failed' : it.statut === 'tardive' ? 'stale' : it.statut === 'jetee' ? 'stale' : 'invalid', what: `${it.type} call ${it.statut}${it.ms ? ' after ' + it.ms + ' ms' : ''}`, call: name, ms: it.ms, said: it.said ? short(it.said) : null });
      if (typeof it.ms === 'number' && it.ms > LOOPS.scene) slow.push({ seq: it.seq, kind: 'over_budget', what: `${name} took ${it.ms} ms, over the scene budget ${LOOPS.scene} ms`, call: name, loop: 'scene', ms: it.ms, said: it.said ? short(it.said) : null });
      if (it.type === 'voix') {                                   // the first visible reaction: an immediate gesture, else the answer itself
        const nv = nextVoice(it), first = items.find(x => x.kind === 'event' && LEGACY_FIRST.includes(x.type) && x.seq !== it.seq && Math.abs(x.min - it.min) < 0.05 && (!nv || x.seq < nv.seq));
        if (!first) slow.push({ seq: it.seq, kind: 'no_first_reaction', what: `nothing visible before the model's answer${it.ms ? ' (' + it.ms + ' ms)' : ''}, over the now budget ${LOOPS.now} ms`, call: name, loop: 'now', ms: it.ms, said: it.said ? short(it.said) : null });
      }
      for (const t of [].concat(f.faits || [])) if (typeof t === 'string' && t) improvised.push({ seq: it.seq, kind: 'fact', text: short(t), by: 'model:' + (head.with_model ? 'host' : 'lexicon'), said: it.said ? short(it.said) : null });
      if (it.type === 'voix' && f.pensee) improvised.push({ seq: it.seq, kind: 'line', text: short(f.pensee), attitude: f.attitude, by: 'model:' + (head.with_model ? 'host' : 'lexicon'), said: it.said ? short(it.said) : null });
    } else if (it.kind === 'event') {
      const d = it.data;
      if (LEGACY_MISSING.includes(it.type)) {
        const thing = d.nom || d.id || d.objet || d.sur || '';
        asked.push({ seq: it.seq, kind: 'legacy_' + it.type, what: `${it.type}${thing ? ' ' + thing : ''}${d.raison ? ' (' + d.raison + ')' : ''}`, missing: (/objet|modif|faconnage|atelier/.test(it.type) ? 'thing:' : it.type + ':') + slug(thing || it.type), thing: thing || undefined, said: sentence(it.seq) });
      }
      if (LEGACY_REPAIRS.includes(it.type)) slow.push({ seq: it.seq, kind: 'repaired', what: `${it.type} ${short(JSON.stringify(d), 160)}`, why: [it.type], said: sentence(it.seq), line: it.type === 'pensee_jetee' || it.type === 'apercu_jete' ? short(d.texte) : undefined });
      if (it.type === 'objet_cree' && d.source !== 'fiche') improvised.push({ seq: it.seq, kind: 'thing', id: d.id, name: d.nom || d.id, shapes: d.formes, text: `${d.nom || d.id} (${d.formes ?? '?'} shapes${d.source ? ', ' + d.source : ''})`, by: 'model:' + (d.source || '?'), said: sentence(it.seq) });
    }
  }
  const st = items.find(i => i.kind === 'state');
  const calls = {}, lat = {};
  for (const c of items.filter(i => i.kind === 'call')) { const k = 'host/invention/' + c.type; calls[k + '/' + (c.statut || '?')] = (calls[k + '/' + (c.statut || '?')] || 0) + 1; if (typeof c.ms === 'number') (lat[k] = lat[k] || []).push(c.ms); }
  const latency = Object.fromEntries(Object.entries(lat).map(([k, ms]) => [k, { n: ms.length, p50: med(ms), p95: q95(ms), budget: LOOPS.scene, ms }]));
  const vr = voices.filter(v => typeof v.ms === 'number').map(v => v.ms);
  const firsts = slow.filter(x => x.kind === 'no_first_reaction').length;
  const lastMin = items.length ? Math.max(...items.map(i => i.min || 0)) : 0;
  return { id: `${head.histoire === 'libre' ? 'free' : 'legacy-' + slug(head.histoire)}-${head.graine ?? 0}`, at: head.at || null, mode: head.histoire === 'libre' ? 'free' : 'story', pack: { id: head.histoire, legacy: true },
    seed: head.graine, with_model: head.with_model, device: head.device, lang: meta.lang || 'fr',
    duration_s: Math.round(((st && st.min) || lastMin) * 60), turns: st && st.turns != null ? st.turns : voices.length,
    versions: head.debug ? { debug_mode: true } : {},
    summary: { calls, full_reaction_ms: med(vr), first_reaction_ms: null, turns_without_first_reaction: firsts, latency },
    asked, improvised, slow, said };
}

/* ================================================================ several records: the merged report and the proposals */

/* Records (or raw journals) → { records, requests, improvised, latency, proposals: { engine, story, character, framework } }.
   Every proposal: { layer, owner, key, title, text (ready to paste), seen (occurrences), sessions, from: [{ record, seq }] }.
   Nothing is applied: a person accepts or drops each one (P23). */
export function mergeRecords(list, { packs = {} } = {}) {
  const records = list.map(x => x && x.type === 'harvest' ? x : harvestRecord(x));
  const P = { engine: new Map(), story: new Map(), character: new Map(), framework: new Map() };
  const add = (layer, key, make, rec, item) => {
    const m = P[layer]; let p = m.get(key);
    if (!p) { p = Object.assign({ layer, key, seen: 0, sessions: [], from: [] }, make()); m.set(key, p); }
    p.seen++; if (!p.sessions.includes(rec.id)) p.sessions.push(rec.id);
    if (p.from.length < 12) p.from.push({ record: rec.id, seq: item.seq, said: item.said || undefined });
    return p;
  };
  const OWN = { engine: "the engine's owner", story: "the story's author" };
  const requests = new Map(), latency = {};
  for (const rec of records) {
    const date = String(rec.created || '').slice(0, 10) || 'undated';
    for (const it of rec.asked_not_doable || []) {
      if (it.kind === 'cut') continue;
      const key = it.missing || it.what;
      const g = requests.get(key) || { missing: key, kinds: new Set(), n: 0, examples: [], from: [] };
      g.n++; g.kinds.add(it.kind); if (it.said && g.examples.length < 5 && !g.examples.includes(it.said)) g.examples.push(it.said); if (g.from.length < 8) g.from.push(rec.id + '#' + it.seq); requests.set(key, g);
      // (1) engine and vocabulary: a sound recipe, a model of the library, else a line of the wishlist
      const cue = /no recipe for the cue (\S+)/.exec(it.what || '') || (/unknown_cue (\S+)/.exec(it.what || ''));
      if (cue) add('engine', 'sound:' + cue[1], () => ({ owner: OWN.engine, kind: 'sound', title: `sound cue "${cue[1]}" has no recipe`, target: 'src/bruitages.json',
        text: JSON.stringify({ indices: { [cue[1]]: [{ recette: '<a recipe of src/bruitages.json recettes>', t: 0, gain: 0.5, _doc: 'draft from the harvest: write the plan, then remove this note' }] } }, null, 1) }), rec, it);
      else if (it.kind === 'not_understood') add('framework', 'intent:' + (it.said || it.class), () => ({ owner: rec.pack && rec.pack.id && !rec.pack.legacy ? `${OWN.story} (stories/${rec.pack.id}/anchors.json)` : `${OWN.engine} (src/reflexes.json)`, kind: 'prepared_option',
        title: `a sentence the reflex could not place (${it.what})`, text: `intent class or anchor for: « ${it.said || '[player: ' + it.class + ']'} » → <verb> <target>` }), rec, it);
      else if (/^(thing|material):/.test(key)) {
        const name = it.thing || key.split(',')[0].split(':').pop();
        if (/^material:/.test(key)) add('engine', 'material:' + slug(name), () => ({ owner: OWN.engine, kind: 'wishlist', title: `material "${name}" is not in the vocabulary`, target: 'src/matieres.json', text: `- [ ] material recipe "${name}" (src/matieres.json) — asked by a model; the default was used` }), rec, it);
        else add('engine', 'model:' + slug(name), () => ({ owner: OWN.engine, kind: 'model', title: `thing "${name}" asked and not made (${it.kind.replace('legacy_', '')})`, target: 'src/modeles.json',
          text: JSON.stringify({ modeles: { [slug(name)]: { nom: name, mots: [slug(name).replace(/-/g, ' ')], quoi: '<what it looks like, in shapes and materials>', envergure_m: null, formes: [], _doc: 'draft from the harvest: describe and shape it, then remove this note' } } }, null, 1) }), rec, it);
      } else if (it.kind === 'refused') add('character', 'refusal:' + key, () => ({ owner: OWN.story, kind: 'decision', title: `the voice was refused (${it.what})`, text: `? When the voice asks « ${it.said || '…'} », does the carrier answer or refuse? -- refused in play (${it.what}) {imp.ask.${slug(it.said || key)}}` }), rec, it);
      else add('engine', 'wish:' + key, () => ({ owner: OWN.engine, kind: 'wishlist', title: it.what, text: `- [ ] ${it.what}${it.op ? ' (op ' + it.op + ')' : ''} — asked in play, not in the vocabulary` }), rec, it);
    }
    // (2) the story: facts, things, rules improvised → PDL source lines with the session as their source
    for (const it of rec.improvised || []) {
      if (it.kind === 'cut') continue;
      const prov = `// improvised by ${it.by || 'a model'} in ${rec.id} #${it.seq} (${rec.mode}, ${date})${it.said ? ', after « ' + it.said + ' »' : ''}`;
      if (it.kind === 'fact') add('story', 'fact:' + slug(it.text), () => ({ owner: OWN.story, kind: 'fact', title: it.text,
        text: prov + '\n' + (typeof it.certainty === 'number' && it.certainty >= 0.5 ? `~${it.certainty} ${sentenceOf(it.text)} {imp.${slug(it.text)}}` : `? ${sentenceOf(it.text)} -- improvised in play; promote to ! to make it canon, or leave open {imp.${slug(it.text)}}`) }), rec, it);
      else if (it.kind === 'thing') add('story', 'thing:' + slug(it.name), () => ({ owner: OWN.story, kind: 'thing', title: `${it.name} placed by a model`,
        text: prov + '\n' + `? There is ${it.name} here. -- placed by a model in play (${it.shapes ?? '?'} shapes); give it to the place, or leave it to chance {imp.thing.${slug(it.name)}}` }), rec, it);
      else if (it.kind === 'rule') add('story', 'rule:' + slug(it.text), () => ({ owner: OWN.story, kind: 'rule', title: `rule written by a model: ${it.text}`,
        text: prov + '\n' + `? ${it.text} -- a rule a model wrote in play; rewrite it as a when line to keep it {imp.rule.${slug(it.id || it.text)}}` }), rec, it);
      else if (it.kind === 'line') add('character', 'line:' + slug(it.text), () => ({ owner: OWN.story, kind: 'example', title: `a line the carrier invented${it.said ? ' after « ' + it.said + ' »' : ''}`,
        text: prov + '\n' + `> [${it.said ? 'asked: ' + it.said.replace(/[\[\]|]/g, ' ') : 'in play'}] ${/^[a-z]{2}: /.test(it.text) ? it.text : (rec.lang || 'fr') + ': ' + it.text.replace(/\|/g, '/')}` }), rec, it);
    }
    // (3) ways of speaking that grated, (4) the framework: unsure, slow, held, repaired
    for (const it of rec.slow_or_doubtful || []) {
      if (it.kind === 'cut') continue;
      if (it.line && (it.kind === 'rejected' || it.kind === 'repaired')) add('character', 'counter:' + slug(it.line), () => ({ owner: OWN.story, kind: 'counter', title: `a line that was turned down (${it.what})`,
        text: `// from ${rec.id} #${it.seq}\nx [${it.said ? 'asked: ' + it.said.replace(/[\[\]|]/g, ' ') : 'in play'}] ${(rec.lang || 'en')}: ${it.line.replace(/\|/g, '/')} | why: ${(it.why || [it.kind]).join(', ')}` }), rec, it);
      else if (['over_budget', 'held', 'failed', 'stale', 'late', 'no_first_reaction'].includes(it.kind)) add('framework', it.kind + ':' + (it.call || it.loop), () => ({ owner: OWN.engine, kind: it.kind === 'no_first_reaction' ? 'prepared_option' : 'budget',
        title: it.kind === 'no_first_reaction' ? `no visible reaction before the model answered (${it.call})` : `${it.call || it.loop}: ${it.kind.replace('_', ' ')}`,
        text: it.kind === 'no_first_reaction' ? `prepared option: a reflex gesture or hold line for these sentences, played at once while ${it.call} answers (now budget ${LOOPS.now} ms)`
          : it.kind === 'held' ? `prepared option: precompute this judgement (frontier) or raise judgeWaitMs (core/clocks.js) for ${it.call}`
            : `budget: ${it.call} — measured times are in the latency table; tune LIMITS (src/model-port.js) or the ${it.loop || 'scene'} loop budget (core/session.js LOOPS), or move it to a faster adapter` }), rec, it);
      else if (it.kind === 'unsure') add('framework', 'unsure:' + it.call, () => ({ owner: OWN.engine, kind: 'threshold', title: `${it.call} often below act_from`, text: `threshold: ${it.call} answers under act_from ${THRESHOLDS.act_from}; prepare an option, or tune act_from/ask_below (src/reflexes.json)` }), rec, it);
      else if (it.kind === 'repaired' || it.kind === 'rejected' || it.kind === 'adapted') { const w = (it.why || [it.kind]).join(','); add('framework', 'fix:' + w, () => ({ owner: OWN.engine, kind: 'rule', title: `models often need: ${w}`, text: `rule or prompt note: models are repeatedly ${it.kind} for ${w}; compile the principle, or say it in the stage prompt (core/prompt.js)` }), rec, it); }
    }
    for (const [k, r] of Object.entries((rec.summary && rec.summary.latency) || {})) { const L = latency[k] = latency[k] || { ms: [], budget: r.budget, sessions: 0 }; L.ms.push(...(r.ms || [])); L.sessions++; }
  }
  const sorted = m => [...m.values()].sort((a, b) => b.seen - a.seen || b.sessions.length - a.sessions.length || a.key.localeCompare(b.key));
  return {
    records: records.map(r => ({ id: r.id, mode: r.mode, source: r.source, pack: r.pack && r.pack.id, created: r.created, device: r.device, with_model: r.with_model, turns: r.turns, duration_s: r.duration_s, stripped: r.stripped, versions: r.versions })),
    requests: [...requests.values()].map(g => Object.assign(g, { kinds: [...g.kinds] })).sort((a, b) => b.n - a.n),
    improvised: records.flatMap(r => (r.improvised || []).filter(i => i.kind !== 'cut').map(i => Object.assign({ record: r.id }, i))),
    latency: Object.fromEntries(Object.entries(latency).map(([k, L]) => [k, { n: L.ms.length, p50: round(med(L.ms)), p95: round(q95(L.ms)), budget: L.budget, over: L.budget ? L.ms.filter(x => x > L.budget).length : null, sessions: L.sessions }])),
    proposals: { engine: sorted(P.engine), story: sorted(P.story), character: sorted(P.character), framework: sorted(P.framework) },
  };
}
const sentenceOf = t => { t = String(t).trim(); t = t.charAt(0).toUpperCase() + t.slice(1); return /[.!?…»"]$/.test(t) ? t : t + '.'; };
