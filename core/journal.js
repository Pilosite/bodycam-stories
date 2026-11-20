/* The journal (docs/pdl-spec.md §9.2): append-only JSON lines with English keys.
   Every transaction (accepted, repaired or rejected), event, rule firing, model call, principle load and audit verdict.
   replay(journal, executor, seed) re-runs the inputs in a fresh session; diff(a, b) compares two journals. */
import { canonicalJSON } from './world.js';
import { createSession } from './session.js';

export function createJournal(entries = []) {
  const E = entries.slice();
  return {
    entries: E,
    nextSeq: () => E.length,
    append(e) { const x = Object.assign({ seq: E.length }, e); for (const k of Object.keys(x)) if (x[k] === undefined) delete x[k]; E.push(x); return x; },
    toJSONL: () => E.map(e => JSON.stringify(e)).join('\n') + '\n',
  };
}
export const toJSONL = j => (Array.isArray(j) ? j : j.entries).map(e => JSON.stringify(e)).join('\n') + '\n';
export const fromJSONL = text => String(text).split('\n').filter(l => l.trim()).map(l => JSON.parse(l));
const entriesOf = j => Array.isArray(j) ? j : typeof j === 'string' ? fromJSONL(j) : j.entries;

/* Re-runs a journal's inputs against `executor` with `seed` (default: the journal's). `edit(entry)` may return a
   replacement input (what-if: an edited rule or principle). Returns { session, hash, journal }. */
export function replay(journal, executor, seed, { edit } = {}) {
  const E = entriesOf(journal), head = E[0];
  if (!head || head.type !== 'session') throw new Error('journal: no session header');
  const S = createSession({ scene: head.scene, seed: seed ?? head.seed, budget: head.budget, executor });
  for (const e0 of E.slice(1)) {
    if (!e0.input) continue;
    const e = edit ? edit(e0) || e0 : e0;
    if (e.type === 'tx') S.submit(e.proposed, { timings: e.timings, loop: e.loop, latency_ms: e.latency_ms });
    else if (e.type === 'advance') S.advance(e.dt);
    else if (e.type === 'start') S.start();
    else if (e.type === 'observe') S.observe({ event: e.event, data: e.data });
    else if (e.type === 'principles') S.loadPrinciples(e.records);
    else if (e.type === 'model_call') S.modelCall({ tier: e.tier, purpose: e.purpose, character: e.character, timings: e.timings, loop: e.loop, status: e.status, ref_seq: e.ref_seq, latency_ms: e.latency_ms });
    else if (e.type === 'audit') { const a = Object.assign({}, e); for (const k of ['seq', 't', 'type', 'input']) delete a[k]; S.audit([a]); }
    else if (e.type === 'hash') S.checkpoint();
  }
  return { session: S, hash: S.hash(), journal: S.journal };
}

/* Differences between two journals, entry by entry (timings ignored). */
export function diff(a, b, { max = 50 } = {}) {
  const A = entriesOf(a), B = entriesOf(b), changes = [];
  const norm = e => { if (!e) return null; const x = Object.assign({}, e); delete x.timings; return canonicalJSON(x); };
  for (let i = 0; i < Math.max(A.length, B.length); i++) {
    if (norm(A[i]) === norm(B[i])) continue;
    changes.push({ seq: i, a: A[i] || null, b: B[i] || null });
    if (changes.length >= max) break;
  }
  const fired = E => E.filter(e => e.type === 'rule' && e.status === 'fired').map(e => e.rule);
  return { equal: changes.length === 0, first: changes.length ? changes[0].seq : null, changes,
    rules: { a: fired(A), b: fired(B) }, hashes: { a: A.filter(e => e.type === 'hash').map(e => e.hash), b: B.filter(e => e.type === 'hash').map(e => e.hash) } };
}
