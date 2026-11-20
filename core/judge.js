/* Judgement (P22, docs/architecture.md "Where judgement happens"): the pure rules the core applies to a typed answer.
   A judgement is a typed answer with a probability; the confidence is played, never hidden:
     p >= act_from: act · ask_below <= p < act_from: act with the doubt showing · p < ask_below: she asks back.
   On an absolute (`!!`) a question is asked twice, in both orders of its options, and a disagreement counts as uncertain
   (ADR 0004: answers can flip when the option order changes). Thresholds are configuration; the defaults are 0.8 and 0.5.
   This module also states the questions of D1 to D3 (one call) and D4 (absolutes, both orders), and reads their answers
   back into typed values: a model's answer outside the options is no answer. No model, no I/O. */
import { INTENT_VERBS } from './vocab.js';

export const THRESHOLDS = { act_from: 0.8, ask_below: 0.5 };
const num = (x, d) => typeof x === 'number' && isFinite(x) ? Math.max(0, Math.min(1, x)) : d;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const r2 = x => Math.round(x * 100) / 100;

/* judge(a, { act_from, ask_below, absolute }) with a = { answer, p?, uncertain?, reverse?: { answer, p? } }
   → { answer, p, uncertain, play: 'act' | 'doubt' | 'ask', orders }. `reverse` is the answer to the same question with its
   options in the other order. A port that gives no probability is taken at its word (p 1), unless it says it is uncertain.
   On an absolute, one order alone is not enough: uncertain. */
export function judge(a, o = {}) {
  const hi = o.act_from ?? THRESHOLDS.act_from, lo = o.ask_below ?? THRESHOLDS.ask_below;
  if (!a || a.answer === undefined || a.answer === null) return { answer: null, p: 0, uncertain: true, play: 'ask', orders: 0 };
  let p = num(a.p, a.uncertain ? lo : 1), uncertain = !!a.uncertain, orders = 1;
  if (a.reverse) {
    orders = 2;
    if (a.reverse.answer === undefined || a.reverse.answer === null || !same(a.answer, a.reverse.answer)) uncertain = true;
    p = Math.min(p, num(a.reverse.p, 1));
  } else if (o.absolute) uncertain = true;
  const play = uncertain || p < lo ? 'ask' : p >= hi ? 'act' : 'doubt';
  return { answer: a.answer, p: r2(p), uncertain, play, orders };
}
/* The worse of two plays (ask < doubt < act). */
export const worse = (a, b) => ['ask', 'doubt', 'act'].find(x => x === a || x === b) || 'ask';

/* A question in the other order: same id with "~r", options reversed (slots too). */
export function reversed(q) {
  const r = Object.assign({}, q, { id: q.id + '~r' });
  if (q.options) r.options = q.options.slice().reverse();
  if (q.slots) r.slots = Object.fromEntries(Object.entries(q.slots).map(([k, v]) => [k, v.slice().reverse()]));
  return r;
}
/* A typed answer checked against its question: an option, a slot set, a bool, a score; anything else is null. */
export function checkAnswer(q, a) {
  if (!a || typeof a !== 'object') return null;
  let v = a.answer;
  if (q.type === 'bool') { if (v === 'yes' || v === 'true') v = true; if (v === 'no' || v === 'false') v = false; if (typeof v !== 'boolean') return null; }
  else if (q.type === 'choice' && q.slots) {
    if (!v || typeof v !== 'object') return null;
    const out = {};
    for (const [k, opts] of Object.entries(q.slots)) { const x = v[k]; if (x === undefined || x === null || x === 'none') continue; if (!opts.includes(x)) { if (k === q.required) return null; continue; } out[k] = x; }
    if (q.required && out[q.required] === undefined) return null;
    v = out;
  } else if (q.type === 'choice') { if (!q.options.includes(v)) return null; }
  else if (q.type === 'score') { v = num(v, null); if (v === null) return null; }
  return { answer: v, p: num(a.p, undefined) };
}
/* The answers of a call ({ answers: { id: { answer, p } } }) for its questions, both orders paired: { id: judged }. */
export function readAnswers(questions, res, o = {}) {
  const A = (res && res.answers) || {}, out = {};
  for (const q of questions) {
    if (q.id.endsWith('~r')) continue;
    const a = checkAnswer(q, A[q.id]);
    const rq = questions.find(x => x.id === q.id + '~r');
    const r = rq ? checkAnswer(rq, A[rq.id]) : null;
    out[q.id] = judge(a && Object.assign({}, a, rq ? { reverse: r || { answer: null } } : {}), Object.assign({}, o, { absolute: !!q.absolute }));
  }
  return out;
}

/* ---------------------------------------------------------------- D1 to D3: what is asked, now or later, does she go along
   One call (docs/architecture.md: they share one call when the model allows several questions per call).
   `classes`: { intent: [...], commit: [...] } from the pack's anchors; the targets are the things alive and the stations next. */
export function understandQuestions(w, { classes = {} } = {}) {
  const things = Object.values(w.things || {}).map(t => 'thing:' + t.id);
  const st = w.stations && w.stations[w.body.station], next = st ? (st.next || []).map(s => 'station:' + s) : [];
  const verbs = INTENT_VERBS.filter(v => v !== 'commit');
  return [
    { id: 'D1', type: 'choice', required: 'verb', text: 'What is the voice asking her? The verb, and the target and story class when there is one.',
      slots: { verb: verbs, target: ['none', ...things, ...next], class: ['none', ...(classes.intent || []), ...(classes.commit || [])] } },
    { id: 'D2', type: 'bool', text: 'Is it for later, under a condition ("if…", "when…", "whatever you hear…"), rather than for now?' },
    { id: 'D3', type: 'choice', text: 'Given who she is and what she has promised, does she go along?', options: ['accept', 'amend', 'refuse', 'argue'] },
  ];
}
/* The judged understanding → { play, p, intent fields, stance }. A commitment is D2 = later with a commit class, or with none
   (then she answers, and the invention may write the rule). `commitId(cls)` gives a free commitment id. */
export function readUnderstanding(J, { text, classes = {}, commitId }) {
  const d1 = J.D1 || judge(null), d2 = J.D2 || judge(null), d3 = J.D3 || judge(null);
  if (d1.play === 'ask' && !(d2.play !== 'ask' && d2.answer === true)) return { play: 'ask', p: d1.p };
  const later = d2.answer === true && d2.play !== 'ask';
  const a = d1.answer || {}, out = { verb: later ? 'commit' : a.verb || 'other' };
  if (later) {
    const cls = (classes.commit || []).includes(a.class) ? a.class : null;
    Object.assign(out, cls ? { class: cls } : {}, { condition: String(text).slice(0, 200), behaviour: String(text).slice(0, 200), commit: commitId(cls) });
  } else {
    if (a.target) out.target = a.target;
    if (a.class && (classes.intent || []).includes(a.class)) out.class = a.class;
  }
  const p = later ? Math.min(d2.p, d1.answer ? d1.p : d2.p) : d1.p;
  const play = later ? worse(d2.play, d1.answer ? d1.play : d2.play) : d1.play;
  return { play, p, intent: out, stance: d3.play === 'ask' ? null : d3.answer, stance_p: d3.p };
}

/* ---------------------------------------------------------------- D4 on absolutes: does this invented line break one?
   One question per line, each in both orders, all in one call. Options: "none" and the ids of the absolutes in scope. */
export function absoluteQuestions(lines, absolutes) {
  const ids = absolutes.map(p => p.id), out = [];
  lines.forEach((l, i) => {
    const q = { id: 'D4.' + i, type: 'choice', absolute: true, text: 'Does this line break one of the absolutes? Line: ' + JSON.stringify(l), options: ['none', ...ids] };
    out.push(q, reversed(q));
  });
  return out;
}
/* → per line: null (it passes) or the id of the absolute it breaks ('uncertain' when the two orders disagree on none). */
export function readAbsolutes(questions, res, n) {
  const A = (res && res.answers) || {}, out = [];
  for (let i = 0; i < n; i++) {
    const q = questions.find(x => x.id === 'D4.' + i), rq = questions.find(x => x.id === 'D4.' + i + '~r');
    const a = checkAnswer(q, A[q.id]), r = checkAnswer(rq, A[rq.id]);
    const j = judge(a && Object.assign({}, a, { reverse: r || { answer: null } }), { absolute: true });
    const hit = [a && a.answer, r && r.answer].find(x => x && x !== 'none');
    out.push(!j.uncertain && j.answer === 'none' ? null : hit || 'uncertain');
  }
  return out;
}
