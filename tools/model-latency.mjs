// Model latencies of a session journal (M3): p50 and p95 per adapter and instrument, first and full reactions, the summary.
//   node tools/model-latency.mjs <journal.jsonl>      (a journal copied from the page: « Story journal » → « Copy journal »)
import { readFileSync } from 'node:fs';
import { fromJSONL, modelSummary } from '../core/journal.js';

const f = process.argv[2];
if (!f) { console.error('usage: node tools/model-latency.mjs <journal.jsonl>'); process.exit(2); }
const E = fromJSONL(readFileSync(f, 'utf8'));
const q = (xs, k) => { const s = xs.filter(x => typeof x === 'number').sort((a, b) => a - b); return s.length ? Math.round(s[Math.min(s.length - 1, Math.floor(k * (s.length - 1) + 0.5))]) : null; };
const rows = {};
for (const e of E.filter(e => e.type === 'model_call' && (e.status === 'done' || e.status === 'landed'))) {
  const k = `${e.adapter || e.tier}/${e.instrument || '?'}/${e.purpose}`;
  (rows[k] = rows[k] || { model: [], since_utterance: [] }).model.push(e.timings && e.timings.model_ms !== undefined ? e.timings.model_ms : e.latency_ms);
  rows[k].since_utterance.push(e.latency_ms);
}
console.log('call'.padEnd(34), 'n'.padStart(4), 'model p50'.padStart(10), 'p95'.padStart(7), 'since words p50'.padStart(16), 'p95'.padStart(7));
for (const [k, r] of Object.entries(rows)) console.log(k.padEnd(34), String(r.model.length).padStart(4), String(q(r.model, 0.5)).padStart(10), String(q(r.model, 0.95)).padStart(7), String(q(r.since_utterance, 0.5)).padStart(16), String(q(r.since_utterance, 0.95)).padStart(7));
const first = [], full = E.filter(e => e.type === 'model_call' && e.status === 'landed' && e.instrument === 'invention' && !e.stale).map(e => e.latency_ms);
for (const i of E.filter(e => e.type === 'tx' && e.kind === 'intent' && e.loop === 'now')) {
  const a = E.find(e => e.seq > i.seq && e.type === 'tx' && e.kind === 'act' && e.loop === 'now' && e.cause && e.cause.tx === i.seq);
  if (a) first.push(a.latency_ms);
}
console.log(`first reaction p50 ${q(first, 0.5)} ms p95 ${q(first, 0.95)} ms (n ${first.length}) · full reaction p50 ${q(full, 0.5)} ms p95 ${q(full, 0.95)} ms (n ${full.length})`);
console.log(JSON.stringify(modelSummary(E)));
