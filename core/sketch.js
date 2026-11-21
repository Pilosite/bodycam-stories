/* Conception before play (ADR 0011, briefs/conception.md): from the creator's sentence and the place built from it, a first
   story sketch in the authoring source, written by the large tier, plus up to three questions for the creator.
     sketchPrompt({ sentence, place, library, lang })      → text     what the large tier is asked (the answer format below)
     repairPrompt({ …, answer, errors })                   → text     the same, with the errors of the first answer
     readQuestions(text)                                   → [q]      the questions already complete in a partial answer
     parseSketch(text)                                     → { about, questions, lines, files, errors }
     sketchPack(sketch, { sentence, place, base, id })     → pack     a pack (core/source.js shape) with two layers:
                                                                        base (author: the model) and creator (the answers)
     answersText(questions, answers, o)                    → text     the creator's answers as statements of their own layer
     checkSketch(pack, library)                            → { errors, compiled }   compilePack + the references a sketch uses
     fallbackSketch({ sentence, place, base, lang })       → sketch   built by code from the place, so play always starts
     conceive({ sentence, place, library, base, ask, … })  → Promise  ask, check, repair once, else fall back
     playable(pack, library)                               → the pack as the page's story mode takes it (STORY_PACKS shape)
   Pure: no I/O, no model. `ask(prompt, { onText })` is given (the page's sampler, the tool's file, a test's canned answer).
   The sketch is data and statements, never a feature: the engine learns no name from it (P9, P13). */
import { parseSource, compilePack, readPattern } from './source.js';

export const SKETCH_FORMAT = 0;
export const MODEL_AUTHOR = 'sketcher';             // the pack's author id for what the large tier wrote (role "model")
export const CREATOR_AUTHOR = 'creator';
export const STATION = 'here';                      // the single station built from the place when there are no stations
export const LINE_KEYS = ['greet', 'ask.back', 'doubt.check', 'hold.think', 'engine.cant'];   // the bank a sketch must write
const FILE = /^(characters|facts|patterns|rules)\/[a-z][a-z0-9-]{0,40}\.pdl$/;
const ROLE_TYPES_OK = ['character', 'thing', 'fact', 'line', 'station'];
const slug = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32) || 'story';
const clone = o => o === undefined ? undefined : JSON.parse(JSON.stringify(o));

/* ---------------------------------------------------------------- what the model reads */
export function placeDigest(place = {}) {
  const A = place.ambiance || {}, sun = A.soleil && typeof A.soleil.hauteur === 'number' ? A.soleil.hauteur : null;
  return { title: place.titre || place.id || '', inspiration: place.inspiration || '', night: sun !== null && sun < 0, lamp: !!A.lampe,
    things: (place.objets || []).filter(o => o && o.id).map(o => ({ id: o.id, name: o.nom || o.id })) };
}
/* Patterns a single-station sketch can bind: every role a character, a thing, a fact, a line, or one station. */
export function usablePatterns(library = {}) {
  const out = [];
  for (const [id, text] of Object.entries(library)) {
    const d = parseSource(text, { file: `patterns/${id}.pdl` }), p = readPattern(d);
    if (!Object.values(p.roles).every(r => ROLE_TYPES_OK.includes(r.type) && !(r.type === 'station' && r.many))) continue;
    const summary = (d.statements.find(s => s.section === 'summary') || {}).text || '';
    const roles = d.statements.filter(s => s.mark === 'role' || s.mark === 'need').map(s => `${s.mark} ${s.text}`);
    const rules = d.statements.filter(s => s.mark === 'when').map(s => s.text);
    out.push({ id: p.id, summary, roles, rules });
  }
  return out;
}
export function guessLang(sentence) {
  const t = ' ' + String(sentence || '').toLowerCase() + ' ';
  return /[éèêàùçœ]| (le|la|les|une|des|du|au|aux|et|avec|dans|sur|autour|un) /.test(t) ? 'fr' : 'en';
}

export function sketchPrompt({ sentence, place, library = {}, lang = null }) {
  const P = placeDigest(place), pats = usablePatterns(library);
  return [
    'You conceive a story before it is played. A creator wrote one sentence; a place was built from it. Write a first story sketch in the authoring language below, and ask the creator up to three questions whose answers would change the story.',
    'The game: the player is a voice in the ear of the one who carries a body camera in this place. The player never acts; they talk with the carrier, who is a person with a will. The camera films only what is really there.',
    `The creator's sentence: ${JSON.stringify(String(sentence || ''))}`,
    `The place built from it: ${JSON.stringify(P.title)}${P.inspiration ? ' — ' + P.inspiration : ''}${P.night ? ' (night' + (P.lamp ? ', a lamp' : '') + ')' : ''}`,
    `Things in the place (ids you may use; the carrier can reach every one): ${P.things.map(t => `${t.id} (${t.name})`).join(', ') || 'none'}`,
    `There is a single station, id "${STATION}". There are no other stations.`,
    `Play language: ${lang || 'the language of the sentence'} (two letters, en or fr). Lines and examples are in it; statements may be in English or in it.`,
    '',
    'What the engine cannot show: people (and animals that move). Nobody but the carrier is ever seen: other people are played as they are, voices, sounds, an empty chair, something they left. Never hide it: list it under cannot_show and write the story so that the absence plays.',
    'The carrier is whoever the sentence makes them (a father, a nurse, a child…); give them a name that fits. Never "Sam".',
    '',
    '## The authoring language (one statement per line, its {id} at the end)',
    '!! absolute, never broken   ! true (in a facts file: a fact, revealable)   ~0.8 a tendency with its weight   ? an open question -- a note that guides the model (required)',
    '> [context] <lang>: an example line in the carrier\'s voice   x [context] <lang>: a line never said | why: the reason (required)',
    'A file starts with "# <id> — <title>" then one line of metadata: @id <id>  @kind character|facts|rules|pattern-instance  @lang <lang>  @scope character|story  @horizon story; characters add @strength strong|light, @name <Name>, and @presence absent|unseen when they are not here, or here but cannot be filmed.',
    'Rules (code, optional): when look.at(<thing>) once -> reveal(<fact>), say(<line key>) {r.<id>}',
    '',
    '## Patterns you may instantiate (one or two; bind every role; a role with * may be bound several times)',
    ...pats.map(p => `- ${p.id}: ${p.summary}\n    ${p.roles.join('\n    ')}\n    rules: ${p.rules.join(' ; ')}`),
    'An instance file: "# <instance-id> — pattern instance", "@id <instance-id>  @kind pattern-instance  @pattern <pattern-id>", "## bind", then "bind <role> = <value> [attr=value …]". Every fact, line and thing a binding names must exist in your files.',
    '',
    '## Answer format (plain text, sections in this order, nothing else)',
    '=== questions',
    'q <fact id> | <question for the creator, in the play language> | <suggested answer> | <suggested answer> [| <suggested answer>]',
    '   (up to three; each fact id is a statement of your facts file holding your own guess, which stands if the creator says "surprise me")',
    '=== about',
    'title: <a short title>   lang: <en|fr>   carrier: <character id>   pronoun: <she|he|they>',
    'who: <one line: who is here>   stake: <one line: what is at stake>   absence: <one line: what will be played as absence>   cannot_show: <comma list>',
    '   (one key per line)',
    '=== lines',
    `<key>: <a line in the play language>   (one per line; a key may repeat for variants; at least: ${LINE_KEYS.join(', ')}; plus any key your rules or patterns say)`,
    '   greet: what the carrier says when the voice arrives; ask.back: asking back; doubt.check: doubt; hold.think: holding while thinking; engine.cant: a refusal',
    '=== file characters/<carrier id>.pdl',
    '   the carrier, @strength strong, sections ## identity, ## voice, ## knows, ## does-not-know, ## limits, ## secrets, ## arc, ## body, ## examples (2 to 4 >), ## counter-examples (1 or 2 x); a few statements each',
    '=== file characters/<id>.pdl',
    '   each other person, @strength light, @name, @presence when absent or unseen, exactly one to three statements and no section',
    '=== file facts/sketch.pdl',
    '   @kind facts: what is true (!), canon (!!), what the carrier knows and does not know, three open questions (?) for play, and your guesses for the creator\'s questions (! with the fact id of each question)',
    '=== file patterns/<instance id>.pdl',
    '   one per pattern instance',
  ].join('\n');
}
export function repairPrompt(o) {
  return [sketchPrompt(o), '', '## Your previous answer did not compile. Errors:', ...(o.errors || []).slice(0, 20).map(e => '- ' + e),
    '', '## Your previous answer', String(o.answer || '').slice(0, 12000), '', 'Write the whole answer again, corrected, in the same format.'].join('\n');
}

/* ---------------------------------------------------------------- reading the answer */
function sections(text) {
  const out = []; let cur = null;
  for (const raw of String(text || '').replace(/```[a-z]*\n?/gi, '').split(/\r?\n/)) {
    const m = /^\s*===\s*(questions|about|lines|file\s+(\S+))\s*$/i.exec(raw);
    if (m) { cur = { name: m[2] ? 'file' : m[1].toLowerCase(), path: m[2] || null, lines: [] }; out.push(cur); continue; }
    if (cur) cur.lines.push(raw);
  }
  return out;
}
function questionOf(line) {
  const m = /^\s*q\s+([A-Za-z0-9_.-]+)\s*\|(.*)$/.exec(line);
  if (!m) return null;
  const parts = m[2].split('|').map(s => s.trim()).filter(Boolean);
  if (parts.length < 3) return null;
  return { id: 'q' + m[1].replace(/^f\./, '.'), target: m[1], text: parts[0], options: parts.slice(1, 4) };
}
/* The questions complete so far in a partial answer (a line counts once it is followed by a newline or a new section). */
export function readQuestions(text) {
  const t = String(text || ''), out = [];
  const s = sections(t).find(x => x.name === 'questions');
  if (!s) return out;
  const rest = t.slice(t.search(/===\s*questions/i));
  const closed = /\n\s*===\s*(about|lines|file)/i.test(rest);
  const L = closed ? s.lines : s.lines.slice(0, -1);       // the last line of an open section may still be being written
  for (const l of L) { const q = questionOf(l); if (q && out.length < 3 && !out.some(x => x.target === q.target)) out.push(q); }
  return out;
}
export function parseSketch(text) {
  const S = sections(text), errors = [], files = {}, lines = {}, about = {};
  if (!S.length) errors.push('the answer has no "=== …" section');
  const questions = [];
  for (const s of S) {
    if (s.name === 'questions') for (const l of s.lines) { const q = questionOf(l); if (q && questions.length < 3 && !questions.some(x => x.target === q.target)) questions.push(q); }
    else if (s.name === 'about') for (const l of s.lines) { const m = /^\s*([a-z_]+)\s*:\s*(.*)$/.exec(l); if (m) about[m[1]] = m[2].trim(); }
    else if (s.name === 'lines') for (const l of s.lines) { const m = /^\s*([a-z][\w.-]*)\s*:\s*(.+)$/.exec(l); if (m) (lines[m[1]] = lines[m[1]] || []).push(m[2].trim()); }
    else if (s.name === 'file') {
      if (!FILE.test(s.path)) { errors.push(`file ${s.path}: not a characters/, facts/, patterns/ or rules/ .pdl file`); continue; }
      files[s.path] = s.lines.join('\n').trim() + '\n';
    }
  }
  if (about.cannot_show !== undefined) about.cannot_show = about.cannot_show.split(/\s*,\s*/).filter(Boolean);
  if (about.lang) about.lang = about.lang.slice(0, 2).toLowerCase();
  return { about, questions, lines, files, errors };
}

/* ---------------------------------------------------------------- a pack from a sketch */
/* Metadata a file must carry in a pack: its layer and author (the model's own words are kept; the provenance is ours). */
export function withMeta(text, meta) {
  const L = String(text).split(/\r?\n/), i = L.findIndex(l => l.trim().startsWith('@'));
  const extra = Object.entries(meta).map(([k, v]) => `@${k} ${v}`).join('  ');
  const strip = l => Object.keys(meta).reduce((s, k) => s.replace(new RegExp(`@${k}\\s+[^@]*`, 'g'), ''), l).trim();
  if (i < 0) { const h = L.findIndex(l => /^#\s/.test(l.trim())); L.splice(h + 1, 0, extra); return L.join('\n'); }
  L[i] = (strip(L[i]) + '  ' + extra).trim();
  for (let k = i + 1; k < L.length && L[k].trim().startsWith('@'); k++) L[k] = strip(L[k]);
  return L.join('\n');
}
const docOf = (path, text) => parseSource(text, { file: path });

/* The creator's answers: one statement each, in the creator's layer, under the id of the model's guess (same id in a later
   layer replaces it, and the merge records what it replaced). "surprise" (or nothing) writes nothing: the guess stands. */
export function answersText(questions = [], answers = {}, { lang = 'en', author = CREATOR_AUTHOR } = {}) {
  const L = ['# answers — the creator\'s answers to the sketch\'s questions', `@id answers  @kind facts  @layer creator  @author ${author}  @lang ${lang}  @scope story  @horizon story`, ''];
  for (const q of questions) {
    const a = answers[q.id] !== undefined ? answers[q.id] : answers[q.target];
    if (a === undefined || a === null || a === 'surprise' || !String(a).trim()) continue;
    L.push(`! ${q.text.replace(/[{}]/g, '')} ${String(a).replace(/[{}\n]/g, ' ').trim()} {${q.target}}`);
  }
  return L.join('\n') + '\n';
}

/* Anchors for the reflex (src/reflex-model.js): a thing is named by the words of its name, in the play language. */
function anchorsOf(place, lang) {
  const things = {};
  for (const o of place.objets || []) if (o && o.id) {
    const words = String(o.nom || '').toLowerCase().split(/[^\p{L}0-9]+/u).filter(w => w.length >= 4).slice(0, 4);
    things[o.id] = { [lang]: [...new Set([o.id.replace(/-/g, ' '), ...words])] };
  }
  return { version: 0, note: 'Generated from the place by core/sketch.js: each thing is named by the words of its name.', things };
}

export function sketchPack(sketch, { sentence = '', place = {}, base = {}, id = null, answers = null } = {}) {
  const A = sketch.about || {}, lang = A.lang === 'fr' || A.lang === 'en' ? A.lang : guessLang(sentence);
  const carrier = A.carrier && /^[a-z][a-z0-9-]*$/.test(A.carrier) ? A.carrier : null;
  const files = {}, order = [];
  for (const [path, text] of Object.entries(sketch.files || {})) {
    const kind = (docOf(path, text).meta || {}).kind;
    files[path] = withMeta(text, Object.assign({ layer: 'base', author: MODEL_AUTHOR }, kind ? {} : { kind: path.split('/')[0] === 'characters' ? 'character' : path.split('/')[0] === 'facts' ? 'facts' : 'rules' }));
    order.push(path);
  }
  // what the engine cannot show, said once to every model call, from the model's own list (P19: stated, never hidden)
  const cannot = (A.cannot_show && A.cannot_show.length ? A.cannot_show : ['people']).slice(0, 6);
  files['rules/engine.pdl'] = ['# engine — what the camera cannot show in this story', `@id engine  @kind principles  @layer base  @author ${MODEL_AUTHOR}  @lang en  @scope story  @horizon story`, '',
    `~0.95 The camera cannot show: ${cannot.join(', ')}. They are played as they are (voices, sounds, an empty place, what they left), never described as seen. {engine.cannot-show}`].join('\n') + '\n';
  order.push('rules/engine.pdl');
  const P = placeDigest(place);
  files['facts/place.pdl'] = ['# place — the place built from the sentence', `@id place-facts  @kind facts  @layer base  @author ${MODEL_AUTHOR}  @lang ${lang}  @scope story  @horizon story`, '',
    `! ${(P.title + (P.inspiration ? ': ' + P.inspiration : '')).replace(/[{}\n]/g, ' ')} {f.place}`].join('\n') + '\n';
  order.unshift('facts/place.pdl');
  const ordered = [...order.filter(f => f.startsWith('characters/')), ...order.filter(f => f.startsWith('facts/')), ...order.filter(f => f.startsWith('rules/')), ...order.filter(f => f.startsWith('patterns/'))];
  const texts = Object.assign({}, files);
  texts['answers.pdl'] = answersText(sketch.questions, answers || {}, { lang });
  const bank = Object.assign({}, ((base.lines || {})[lang]) || {});
  for (const [k, v] of Object.entries(sketch.lines || {})) bank[k] = v.slice(0, 4);
  const instances = ordered.filter(f => f.startsWith('patterns/')).map(f => docOf(f, files[f])).filter(d => d.meta.kind === 'pattern-instance').map(d => d.id);
  const intentClasses = instances.length && ordered.some(f => /@pattern\s+reluctant-carrier/.test(files[f])) ? ['bare_order'] : [];
  const title = A.title || P.title || String(sentence).slice(0, 40);
  const packId = id || 'sketch-' + slug(title);
  const manifest = {
    format: 0, id: packId, title: { [lang]: title }, summary: { [lang]: [A.who, A.stake].filter(Boolean).join(' ') || String(sentence) },
    languages: [lang], story_language: lang, stage: 'sketch',
    authors: [{ id: MODEL_AUTHOR, role: 'model' }, { id: CREATOR_AUTHOR, role: 'creator' }],
    place: 'place.json', stations: 'stations.json', beats: 'beats.json', lines: { [lang]: `lines/${lang}.json` }, anchors: 'anchors.json',
    carrier,
    layers: [{ id: 'base', author: MODEL_AUTHOR, files: ordered }, { id: 'creator', author: CREATOR_AUTHOR, files: ['answers.pdl'] }],
    patterns: instances, clocks: {}, cues: {}, intent_classes: intentClasses, commit_classes: [],
    sketch: { format: SKETCH_FORMAT, sentence: String(sentence), source: sketch.source || 'model', about: A, cannot_show: cannot,
      questions: (sketch.questions || []).map(q => ({ id: q.id, target: q.target, text: q.text, options: q.options })) },
  };
  const arc = sketch.arc && Array.isArray(sketch.arc.stations) && sketch.arc.stations.length >= 2 ? arcOf(sketch.arc, { place, lang, title, bank }) : null;
  const stations = arc ? arc.stations : { version: 0, note: 'One station built from the place (core/sketch.js): every thing of the place is within reach.', start: STATION,
    stations: [{ id: STATION, name: { [lang]: P.title || STATION }, beat: 'open', along_m: 0, side_m: 0, heading: 'path', within_reach: P.things.map(t => t.id), visible: P.things.map(t => t.id), connects: [], arrive_line: 'greet' }] };
  const beats = arc ? arc.beats : { version: 0, question: { [lang]: A.stake || '' }, beats: [{ id: 'open', name: { [lang]: title }, stations: [STATION], enter: { on: 'session.start' }, establish: ['f.place'] }], endings: [] };
  if (arc) { manifest.sketch.arc = { stations: stations.stations.map(s => s.id), beats: beats.beats.map(b => b.id), endings: beats.endings.map(e => e.id) }; if (!beats.question[lang]) beats.question[lang] = A.stake || ''; }
  return { manifest, texts, place: clone(place), stations, beats, lines: { [lang]: { lang, lines: bank } }, anchors: anchorsOf(place, lang) };
}

/* An arc (written by the studio's arc stage, core/studio.js): stations in order along the place's path, the things within
   reach at each (a thing no station names goes to the nearest one: nothing is out of reach), beats of consecutive stations,
   endings. The stations connect in a line, both ways; a transition costs battery time by its length (ADR 0003). */
function arcOf(arc, { place = {}, lang, title, bank }) {
  const things = (place.objets || []).filter(o => o && o.id), ids = new Set(things.map(o => o.id));
  const num = (v, d) => Number.isFinite(+v) ? +v : d;
  const seen = new Set(), list = [];
  for (const s of arc.stations) { if (!s || !/^[a-z][a-z0-9-]{0,40}$/.test(s.id || '') || seen.has(s.id)) continue; seen.add(s.id); list.push(s); }
  list.sort((a, b) => num(a.along, 0) - num(b.along, 0));
  const st = list.map(s => ({ id: s.id, name: { [lang]: s.name || s.id }, beat: null, along_m: Math.round(Math.max(0, num(s.along, 0)) * 10) / 10, side_m: Math.round(Math.max(-6, Math.min(6, num(s.side, 0))) * 10) / 10,
    heading: 'path', within_reach: (s.reach || []).filter(x => ids.has(x)), finds: (s.finds || []).slice(0, 6), visible: things.map(o => o.id), connects: [],
    arrive_line: s.line || null }));
  for (const o of things) if (!st.some(s => s.within_reach.includes(o.id))) {
    let k = 0; st.forEach((s, i) => { if (Math.abs(s.along_m - num(o.devant, 0)) < Math.abs(st[k].along_m - num(o.devant, 0))) k = i; });
    st[k].within_reach.push(o.id);
  }
  st.forEach((s, i) => { for (const j of [i - 1, i + 1]) if (st[j]) s.connects.push({ to: st[j].id, cost_s: Math.round(Math.abs(st[j].along_m - s.along_m) / 1.1) + 5 }); });
  const order = st.map(s => s.id), bs = [];
  for (const b of arc.beats || []) {
    if (!b || !/^[a-z][a-z0-9-]{0,40}$/.test(b.id || '') || bs.some(x => x.id === b.id)) continue;
    const mine = (b.stations || []).filter(x => order.includes(x) && !bs.some(y => y.stations.includes(x)));
    if (mine.length) bs.push({ id: b.id, name: { [lang]: b.name || b.id }, stations: mine, establish: (b.establish || []).slice(0, 8) });
  }
  if (!bs.length) bs.push({ id: 'open', name: { [lang]: title }, stations: [], establish: [] });
  for (const id of order) if (!bs.some(b => b.stations.includes(id))) {          // a station no beat holds joins the beat before it
    const i = order.indexOf(id), prev = bs.find(b => b.stations.includes(order[i - 1])) || bs[0]; prev.stations.push(id);
  }
  for (const b of bs) b.stations.sort((x, y) => order.indexOf(x) - order.indexOf(y));
  bs.sort((a, b) => order.indexOf(a.stations[0]) - order.indexOf(b.stations[0]));
  bs.forEach((b, i) => { b.enter = i === 0 ? { on: 'session.start' } : { on: 'station.entered', station: b.stations[0] }; for (const s of b.stations) st.find(x => x.id === s).beat = b.id; });
  if (bs[0].establish.indexOf('f.place') < 0) bs[0].establish.unshift('f.place');
  const endings = (arc.endings || []).filter(e => e && /^[a-z][a-z0-9-]{0,40}$/.test(e.id || '')).slice(0, 3)
    .map(e => ({ id: e.id, family: { [lang]: e.name || e.id }, requires: (e.requires || []).slice(0, 6), when: e.when || '', line: e.line || null, trigger: 'decision' }));
  for (const s of st) if (!s.arrive_line || !bank[s.arrive_line]) s.arrive_line = s === st[0] ? 'greet' : s.arrive_line;
  return { stations: { version: 0, note: 'Stations laid by the arc stage of the studio (core/studio.js) along the place\'s path; things no station named go to the nearest one.', start: st[0].id, stations: st },
    beats: { version: 0, question: { [lang]: arc.question || '' }, beats: bs, endings } };
}

/* ---------------------------------------------------------------- checking: compilePack and the references a sketch uses */
export function checkSketch(pack, library = {}) {
  const c = compilePack(pack, library), M = pack.manifest, errors = c.errors.map(e => `${e.file}${e.line ? ':' + e.line : ''}: ${e.why}${e.message ? ' ' + e.message : ''}${e.value !== undefined ? ' ' + e.value : ''}`);
  const docs = Object.fromEntries(Object.entries(pack.texts).map(([f, t]) => [f, docOf(f, t)]));
  const chars = new Set(Object.values(docs).filter(d => d.meta.kind === 'character').map(d => d.id));
  const things = new Set((pack.place.objets || []).map(o => o.id)), stations = new Set(pack.stations.stations.map(s => s.id));
  const facts = new Set(c.principles.filter(p => p.doc_kind === 'facts' && !p.auto_id).map(p => p.id));
  const lang = M.languages[0], bank = (pack.lines[lang] || {}).lines || {};
  const has = { character: v => chars.has(v), thing: v => things.has(v), fact: v => facts.has(v), line: v => !!bank[v], station: v => stations.has(v) };
  if (!M.carrier) errors.push('about: no carrier');
  else if (!chars.has(M.carrier)) errors.push(`carrier ${M.carrier} has no character file`);
  else if (/^sam$/i.test(M.carrier)) errors.push('the carrier is "Sam" by default; name them from the sentence');
  for (const k of LINE_KEYS) if (!bank[k]) errors.push(`lines: no ${k}`);
  for (const [f, d] of Object.entries(docs)) {
    if (d.meta.kind !== 'character') continue;
    if (d.meta.strength === 'light' && (!d.meta.name || d.statements.length > 3 || d.statements.some(s => s.section))) errors.push(`${f}: a light character has @name and one to three statements, no section`);
    if (d.id === M.carrier && d.meta.strength === 'strong') for (const s of ['identity', 'voice', 'knows', 'does-not-know'])
      if (!d.statements.some(x => x.section === s)) errors.push(`${f}: the carrier has no section ${s}`);
    for (const x of d.statements) if ((x.mark === '>' || x.mark === 'x') && !x.lines[lang]) errors.push(`${f}:${x.source.line}: example without a "${lang}:" line`);
  }
  const lib = Object.fromEntries(Object.entries(library).map(([id, t]) => [id, readPattern(docOf(`patterns/${id}.pdl`, t))]));
  for (const [f, d] of Object.entries(docs)) {
    if (d.meta.kind !== 'pattern-instance' || !lib[d.meta.pattern]) continue;
    const roles = lib[d.meta.pattern].roles;
    for (const st of d.statements.filter(s => s.mark === 'bind')) {
      const m = /^([\w-]+)\s*=\s*(\S+)(.*)$/.exec(st.text); if (!m || !roles[m[1]]) continue;
      const t = roles[m[1]].type;
      if (has[t] && !has[t](m[2])) errors.push(`${f}: ${m[1]} bound to unknown ${t} "${m[2]}"`);
      else if (!has[t]) errors.push(`${f}: pattern ${d.meta.pattern} needs a ${t}, which a sketch cannot bind`);
      for (const [, k, v] of m[3].matchAll(/([\w-]+)=(\S+)/g)) if (k === 'fact' && !facts.has(v)) errors.push(`${f}: unknown fact ${v}`); else if (k === 'line' && !bank[v]) errors.push(`${f}: no line ${v}`);
    }
  }
  for (const p of c.principles) {
    const b = p.compiled && p.compiled.status === 'compiled' && p.compiled.kind === 'rule' ? p.compiled.body : null; if (!b) continue;
    for (const t of b.then || []) {
      if (t.kind === 'act' && t.body.op === 'say' && t.body.ref && !bank[t.body.ref]) errors.push(`rule ${p.id}: no line ${t.body.ref}`);
      if (t.kind === 'fact' && t.body.predicate === 'established' && !facts.has(t.body.subject)) errors.push(`rule ${p.id}: unknown fact ${t.body.subject}`);
    }
    const tg = b.when.match && b.when.match.target;
    if (tg && /^thing:/.test(tg) && !things.has(tg.slice(6))) errors.push(`rule ${p.id}: unknown thing ${tg.slice(6)}`);
    if (tg && /^station:/.test(tg)) errors.push(`rule ${p.id}: unknown thing ${tg.slice(8)}`);
  }
  for (const q of M.sketch.questions) if (!facts.has(q.target)) errors.push(`question ${q.target}: no fact with this id holds the model's guess`);
  if (M.sketch.arc) {                                              // an arc: every station, beat and ending names what exists
    for (const s of pack.stations.stations) {
      for (const f of s.finds || []) if (!facts.has(f)) errors.push(`arc: station ${s.id} finds unknown fact ${f}`);
      if (s.arrive_line && !bank[s.arrive_line]) errors.push(`arc: station ${s.id}: no line ${s.arrive_line}`);
    }
    for (const b of pack.beats.beats) for (const f of b.establish || []) if (!facts.has(f) && f !== 'f.place') errors.push(`arc: beat ${b.id} establishes unknown fact ${f}`);
    for (const e of pack.beats.endings) {
      for (const f of e.requires || []) if (!facts.has(f)) errors.push(`arc: ending ${e.id} requires unknown fact ${f}`);
      if (e.line && !bank[e.line]) errors.push(`arc: ending ${e.id}: no line ${e.line}`);
    }
  }
  return { errors: [...new Set(errors)], compiled: c };
}

/* ---------------------------------------------------------------- the code fallback: one carrier, the place's things, two open questions */
export function fallbackSketch({ sentence = '', place = {}, base = {}, lang = null } = {}) {
  const L = lang || guessLang(sentence), B = (base.fallback || {})[L] || (base.fallback || {}).en || {};
  const P = placeDigest(place), name = B.carrier_name || 'Carrier', q = B.questions || [];
  const s = t => String(t || '').replace(/[{}\n]/g, ' ');
  const files = {
    'characters/carrier.pdl': [`# carrier — the one who carries the camera (written by code: no model answered)`,
      `@id carrier  @kind character  @strength light  @name ${s(name)}  @lang ${L}  @scope character  @horizon story`,
      `~0.8 ${s(B.carrier_who || 'The one who carries the camera here, in the situation the creator wrote')}: ${s(sentence)} {carrier.who}`,
      `~0.6 ${s(B.carrier_voice || 'Speaks little, in short sentences; says what they see before what they feel.')} {carrier.voice}`,
      `? ${s(B.carrier_why || 'Why are they here, now?')} -- ${s(B.carrier_why_note || 'not said at first; let it come from what the voice asks and from the things of the place.')} {carrier.why}`].join('\n') + '\n',
    'facts/sketch.pdl': [`# sketch-facts — what is true (written by code)`, `@id sketch-facts  @kind facts  @lang ${L}  @scope story  @horizon story`, '',
      ...P.things.slice(0, 8).map(t => `! ${s(t.name)} {f.thing.${t.id}}`),
      ...q.slice(0, 2).map((x, i) => `? ${s(x.text)} -- ${s(x.note)} {f.open.${i + 1}}`)].join('\n') + '\n',
  };
  return { source: 'fallback', about: { title: P.title, lang: L, carrier: 'carrier', who: s(sentence), stake: '', absence: '', cannot_show: ['people'] }, questions: [], lines: {}, files, errors: [] };
}

/* ---------------------------------------------------------------- ask, check, repair once, fall back */
export async function conceive({ sentence, place, library = {}, base = {}, ask = null, lang = null, onQuestion = () => {}, onText = () => {} } = {}) {
  const attempts = [], seen = new Set();
  const stream = text => { onText(text); for (const q of readQuestions(text)) if (!seen.has(q.target)) { seen.add(q.target); onQuestion(q); } };
  const tryAnswer = async (prompt, kind) => {
    let text = '';
    try { text = String(await ask(prompt, { onText: stream, purpose: kind }) || ''); } catch (e) { attempts.push({ kind, error: String(e && e.message || e) }); return null; }
    stream(text);
    const sk = parseSketch(text); sk.source = kind === 'repair' ? 'repaired' : 'model';
    const pack = sketchPack(sk, { sentence, place, base });
    const r = sk.errors.length ? { errors: sk.errors } : checkSketch(pack, library);
    attempts.push({ kind, errors: r.errors.length ? r.errors : undefined });
    return { text, sketch: sk, pack, errors: r.errors };
  };
  if (ask) {
    const first = await tryAnswer(sketchPrompt({ sentence, place, library, lang }), 'sketch');
    if (first && !first.errors.length) return done(first.sketch, first.pack);
    if (first && first.text.trim()) {
      const second = await tryAnswer(repairPrompt({ sentence, place, library, lang, answer: first.text, errors: first.errors }), 'repair');
      if (second && !second.errors.length) return done(second.sketch, second.pack);
    }
  }
  const fb = fallbackSketch({ sentence, place, base, lang });
  return done(fb, sketchPack(fb, { sentence, place, base }));
  function done(sketch, pack) { return { source: sketch.source, sketch, pack, questions: sketch.questions, about: sketch.about, attempts }; }
}
/* The creator answered (or not): the same sketch, the answers in their own layer on top. */
export function withAnswers(pack, answers = {}) {
  const p = clone(pack), lang = p.manifest.languages[0];
  p.texts['answers.pdl'] = answersText(p.manifest.sketch.questions, answers, { lang });
  p.manifest.sketch.answers = clone(answers);
  return p;
}

/* ---------------------------------------------------------------- the pack as the page's story mode takes it */
export function playable(pack, library = {}) {
  const c = compilePack(pack, library), M = pack.manifest, lang = M.languages[0], speakers = {}, people = [];
  let name = M.carrier;
  for (const [f, t] of Object.entries(pack.texts)) {
    if (!f.startsWith('characters/')) continue;
    const d = docOf(f, t); if (d.meta.name) speakers[d.id] = d.meta.name;
    if (d.id === M.carrier) { name = d.meta.name || (String(M.carrier).charAt(0).toUpperCase() + String(M.carrier).slice(1)); continue; }
    const st = c.principles.filter(p => p.doc === d.id && (p.strength === 'tendency' || p.strength === 'hard' || p.strength === 'open'));
    people.push(`${d.meta.name || d.id} (${d.id}${d.meta.presence ? ', ' + d.meta.presence : ''}): ${st.map(p => p.text).join(' ')}`);
  }
  const S = M.sketch || {}, A = S.about || {};
  const story = [A.who ? 'Who is here: ' + A.who : '', A.stake ? 'At stake: ' + A.stake : '', A.absence ? 'Played as absence: ' + A.absence : '',
    people.length ? 'The other people (the camera cannot show them):\n' + people.join('\n') : '', 'Never shown: ' + (S.cannot_show || ['people']).join(', ') + '.'].filter(Boolean).join('\n');
  return { id: M.id, title: M.title, langs: M.languages, carrier: M.carrier, name, scene: c.scene, principles: c.principles, place: pack.place, stations: pack.stations.stations,
    anchors: pack.anchors || {}, endings: (pack.beats && pack.beats.endings) || [], speakers, stage: { story, pronoun: A.pronoun || null }, lang, sketch: S, errors: c.errors };
}
