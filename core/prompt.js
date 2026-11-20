/* What the core tells a model, and how it reads back what a model wrote (ADR 0009, P22). Pure: no model, no I/O.
   - stagePrompt(world, o) → { prefix, delta }: the invention of the scene loop (Sam's reaction, PDL token form). The prefix is
     stable while the story state it describes does not change (the character's principles, examples and counter-examples,
     the place's principles, the vocabulary, the station, the facts she knows, her promises): it can be cached. The delta is
     only what changed since: the battery, what was just said, what she already did in the now loop, the endings now open.
     Optional (conception, core/sketch.js): `story`, the sketch conceived before play (who is here, the stake, the people the
     camera cannot show), and `pronoun` when the carrier is not "she"; both go in the prefix, which stays stable.
   - understandContext(world, o) → text: the state a judgement of D1 to D3 reads (her tendencies in scope, where she is).
   - parseModelTokens(text, o) → { txs, dropped }: a tolerant reading of a model's token lines. The model writes no envelope:
     author, horizon and cause are added here; a line that cannot be read is dropped and recorded, never guessed. Repairs of
     the content (bounds, enums, references) are the validator's (P8), as for any transaction.
   The wire format around this text (JSON for the host's model, the home node's routes) is each adapter's choice. */
import { parseTokens, TONES } from './pdl.js';
import { inScope } from './source.js';
import { factOf } from './world.js';

const MARK = { absolute: '!!', hard: '!', tendency: '~', open: '?' };
const KIND_HORIZON = { act: 'now', effect: 'now', fact: 'story', rule: 'scene', cancel: 'now' };

/* The statements that make the character and her world, for her prompt: all prose statements of her sheet, of the voice's
   role and of the place, scene and story (the story's facts only once established, the canon `!!` always). Explicit rules
   (`when …`) are code and stay out: she does not need to know them, the engine runs them. */
export function characterStatements(w, { character, voice = 'voice' } = {}) {
  const P = Object.values(w.principles || {}), est = id => !!factOf(w, id, 'established');
  const mine = p => p.scope === 'character:' + character || p.scope === 'character:' + voice;
  const world = p => ['place', 'scene', 'story'].includes(p.scope) || /^scene:/.test(p.scope || '');
  return P.filter(p => p.form === 'prose' && MARK[p.strength] && (mine(p) || (world(p) && (p.doc_kind !== 'facts' || p.strength === 'absolute' || est(p.id)))));
}
export function examplesOf(w, { character }) {
  return Object.values(w.principles || {}).filter(p => (p.strength === 'example' || p.strength === 'counter') && p.scope === 'character:' + character);
}
/* The decision endings open now: trigger "decision", every required fact established. */
export function openEndings(w, endings = []) {
  return endings.filter(e => e.trigger === 'decision' && (e.requires || []).every(f => !!factOf(w, f, 'established')));
}
const line = (p, lang) => { const l = p.lines || {}; return l[lang] || l.en || Object.values(l)[0] || ''; };
const stmt = p => `${MARK[p.strength]}${p.weight !== undefined && p.strength === 'tendency' ? p.weight : ''} ${p.text}${p.note ? ' -- ' + p.note : ''} {${p.id}}`;

export function stagePrompt(w, o = {}) {
  const { character = 'sam', name = character, lang = 'en', endings = [], intent = null, now = [], heard = '', author = 'm:stager/stage', story = '', pronoun = null } = o;
  const st = w.stations[w.body.station] || {}, S = characterStatements(w, o), X = examplesOf(w, o);
  const est = (w.facts || []).filter(f => f.predicate === 'established' && f.value === true).map(f => f.subject);
  const facts = [...new Set(est)].map(id => (w.principles[id] && w.principles[id].text) ? `${id}: ${w.principles[id].text}` : id);
  const promises = Object.values(w.commitments || {}).filter(c => c.status !== 'proposed').map(c => `${c.id} ${c.status}${c.class ? ' (' + c.class + ')' : ''}: ${(w.facts.find(f => f.tx === c.fact) || {}).value || c.behaviour || ''}`);
  const lines = Object.keys(w.vocab.lines || {}).sort();
  const things = Object.values(w.things || {}).map(t => t.id + (t.name ? ' (' + t.name + ')' : ''));
  const prefix = [
    `You write what ${name} does next in a live story, seen through the bodycam on her chest. A voice (the player) talks to her in her earpiece; she is a person, not an assistant. Write in the PDL token form below, nothing else.`,
    `Play language: ${lang}. Everything she says is in ${lang}.`,
    ...(pronoun && pronoun !== 'she' ? [`${name} is "${pronoun}": read every she and her below as ${pronoun === 'he' ? 'he, him and his' : 'they, them and their'}.`] : []),
    ...(story ? ['', '## The story, conceived before play (a sketch: build on it, never contradict it)', String(story)] : []),
    '',
    `## Who ${name} is (!! never broken, ! always true, ~ a tendency with its weight, ? open: decide in the moment, guided by the note)`,
    ...S.filter(p => p.scope !== 'place' && p.scope !== 'story' && !/^scene/.test(p.scope)).map(stmt),
    '',
    '## The world (place, story, scene)',
    ...S.filter(p => p.scope === 'place' || p.scope === 'story' || /^scene/.test(p.scope)).map(stmt),
    '',
    `## How ${name} sounds (> she would say it like this, x never like this)`,
    ...X.map(p => `${p.strength === 'example' ? '>' : 'x'} [${p.context || ''}] ${line(p, lang)}${p.why ? ' -- why: ' + p.why : ''}`),
    '',
    '## How to write (one transaction per line; the first line is what she does first; at most four lines)',
    `act.say line.${lang}="…" tone=${TONES.join('|')}     her own words, short, at most 300 characters`,
    'act.say ref=<id>                       a line of the bank, by id (ids below)',
    'act.look tg=thing:<id>   act.turn degrees=-180..180   act.posture height=0.35..1   act.wait seconds=0..5   act.stop',
    'story fact subj=<id> pred=<id> val=<word or number>   what became true',
    'story effect.story.end id=<ending>     only an ending listed as open, after she says goodbye in her own way',
    'Write no author, no time, no id. Never move her to another station: that is not yours to decide.',
    `Bank line ids: ${lines.join(' ')}`,
    '',
    `## Where she is: station ${w.body.station}${st.beat ? ' (beat ' + st.beat + ')' : ''}; within reach: ${(st.within || []).join(', ') || 'nothing named'}`,
    `Things here: ${things.join(', ') || 'none'}`,
    `## What she knows has happened: ${facts.length ? '' : 'nothing yet'}`, ...facts,
    `## What she has promised the voice: ${promises.length ? '' : 'nothing'}`, ...promises,
  ].join('\n');
  const said = (w.said || []).slice(-3).map(s => (s.line && (s.line[lang] || s.line.en)) || s.ref).filter(Boolean);
  const open = openEndings(w, endings);
  const delta = [
    `## Now: t ${w.clock.t} s, battery ${Math.round(w.camera.battery * 100)} %, light ${w.place.sun_height}°${w.body.speech && w.body.speech.volume !== 'normal' ? ', she speaks ' + w.body.speech.volume : ''}`,
    said.length ? 'She said last: ' + said.map(s => JSON.stringify(s)).join(' / ') : '',
    `The voice says: ${JSON.stringify(heard)}`,
    intent ? `Understood as: ${JSON.stringify(intent)}` : '',
    now.length ? 'She already reacted, at once:\n' + now.join('\n') : 'She has not reacted yet.',
    open.length ? 'Endings she may decide now (her decision, never an order): ' + open.map(e => `${e.id}: ${e.when}${e.line ? ' (her last line: ref=' + e.line + ')' : ''}`).join(' | ') : '',
    'Write her reaction: it adds to, or amends, what she already did.',
  ].filter(Boolean).join('\n');
  return { prefix, delta, author };
}

/* The state a D1–D3 judgement reads: where she is, her tendencies and open questions in scope, her promises. */
export function understandContext(w, { character = 'sam', heard = '' } = {}) {
  const P = inScope(Object.values(w.principles || {}), { character, scene: w.clock.scene });
  return [
    `Station ${w.body.station}, beat ${w.story.beat}, battery ${Math.round(w.camera.battery * 100)} %.`,
    'Her tendencies and open questions:', ...P.map(stmt),
    'Her promises: ' + (Object.values(w.commitments || {}).map(c => c.id + ' ' + c.status).join(', ') || 'none'),
    'The voice says: ' + JSON.stringify(heard),
  ].join('\n');
}

/* ---------------------------------------------------------------- reading a model's tokens */
const HEAD = /^[pcme]:\S+\s/, HORIZON = /^(now|scene|story)\s/, KIND = /^(act|effect|fact|rule|cancel)(\.[a-z.]+)?(\s|$)/;
const ALIAS_KIND = { say: 'act.say', look: 'act.look', turn: 'act.turn', posture: 'act.posture', wait: 'act.wait', stop: 'act.stop' };

/* Lines a model wrote → { txs, dropped: [{ line, why }] }. Every transaction gets `author` (the model's) and the horizon its
   kind lives at when none is written; an intent is never the model's to write (dropped). `cause` is set by the caller. */
export function parseModelTokens(text, { author = { kind: 'model', id: 'stager', tier: 'stage' } } = {}) {
  const A = 'm:' + author.id + (author.tier ? '/' + author.tier : '');
  const raw = String(text || '').replace(/```[a-z]*\n?/gi, '').split(/\r?\n/);
  const chunks = [];
  for (const r of raw) {
    if (!r.trim() || /^\s*\/\//.test(r)) continue;
    if (/^\s{2,}(if|then)\s/.test(r) && chunks.length) { chunks[chunks.length - 1].push(r); continue; }
    chunks.push([r.trim().replace(/^[-*•]\s+/, '').replace(/^\d+[.)]\s+/, '')]);
  }
  const txs = [], dropped = [];
  for (const c of chunks) {
    let h = c[0];
    if (HEAD.test(h)) h = h.replace(HEAD, '');                       // the model's own author is replaced by its real one
    const w0 = h.split(/\s/)[0];
    if (ALIAS_KIND[w0]) h = h.replace(w0, ALIAS_KIND[w0]);
    if (!HORIZON.test(h)) { const k = KIND.exec(h); if (!k) { dropped.push({ line: c[0], why: 'not_a_transaction' }); continue; } h = (k[1] === 'effect' && /^effect\.story\.end/.test(h) ? 'story' : KIND_HORIZON[k[1]]) + ' ' + h; }
    if (/^\S+\s+intent\b/.test(h)) { dropped.push({ line: c[0], why: 'intent_is_the_players' }); continue; }
    const src = [A + ' ' + h, ...c.slice(1)];
    let t = null;
    try { t = parseTokens(src.join('\n')); }
    catch (e) {
      try { if ((src[0].match(/"/g) || []).length % 2) t = parseTokens([src[0] + '"', ...src.slice(1)].join('\n')); } catch (_) { t = null; }  // an unclosed quote at the end of a line
      if (!t) { dropped.push({ line: c[0], why: 'syntax', message: String(e.message || e) }); continue; }
    }
    for (const tx of t) { delete tx.id; delete tx.t; delete tx.cause; tx.author = Object.assign({}, author); txs.push(tx); }
  }
  return { txs, dropped };
}
