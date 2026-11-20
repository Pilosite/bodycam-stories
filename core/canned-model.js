/* A canned model (ModelPort test adapter, docs/sdlc.md §3: "no mocking beyond a fixed canned answer").
   answers: { <question or purpose>: value | (request) => value }. hold: purposes whose answer waits for release(purpose),
   to stand for a slow tier. Every call is recorded in `calls`. */
export function createCannedModel(answers = {}, { hold = [] } = {}) {
  const calls = [], waiting = new Map();
  const answer = (key, req) => { const a = answers[key]; if (a === undefined) throw new Error('canned model: no answer for ' + key); return typeof a === 'function' ? a(req) : a; };
  const m = {
    calls,
    embed: async texts => { calls.push(['embed', texts]); return texts.map(t => [...t].slice(0, 8).map(c => c.charCodeAt(0) / 255)); },
    decide: async req => { calls.push(['decide', req]); return answer(req.question, req); },
    generate: req => {
      calls.push(['generate', req]);
      if (!hold.includes(req.purpose)) return Promise.resolve(answer(req.purpose, req));
      return new Promise(ok => waiting.set(req.purpose, () => ok(answer(req.purpose, req))));
    },
    release(purpose) { const f = waiting.get(purpose); if (!f) return false; waiting.delete(purpose); f(); return true; },
    pending: () => [...waiting.keys()],
  };
  return m;
}
