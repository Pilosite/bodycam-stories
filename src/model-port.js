/* The page's model port (M3 first part, ADR 0004, ADR 0008): a chain of adapters resolved per call.
   - judgement (decide with `questions`, P22) and invention (generate): the home node when one is configured and healthy,
     else the host's model when the page runs where one is offered (a claude.ai artifact: window.claude.use("sample"), the
     mechanism src/main.js already uses), else nothing: the reflex answers alone and nothing is staged.
   - the fast answers of the now loop (decide 'intent' and 'reaction') are always the reflex adapter's (src/reflex-model.js).
   Every answer says which adapter gave it (`adapter`) and how long it took (`model_ms`, `first_ms`); the core journals it.
   A slow or failing adapter is cut at its time limit and the next one is tried; the last resort is a clean failure the
   core plays as "no answer" (P20: a slow layer never blocks the present).
   - creation (the conception studio, core/studio.js; briefs/conception-v2.md): `create` writes free text for one agent at
     its tier (fast, mid, large), streamed when the adapter streams; `search` finds pages for a research worker. The home
     node serves both when its /health says so (`capabilities.create`, `capabilities.search`); the host's model serves
     `create` through the sampler (tiers `quick`, `default`, `complex`) and has no search (no web in an artifact).
   No key and no model name here: the home node's address and token live in the browser's storage only (never in the repo
   or the page), and the host's model is named by role (`quick`, `default`), as src/main.js does.
   Pure: no DOM, no import. Every capability of the browser (fetch, storage, timers, AbortController, the sampler) is given. */

export const HOME_KEY = 'bodycam-home-node';
export const LIMITS = { health_ms: 1500, health_every_ms: 30000, judge_ms: 6000, invent_ms: 20000, create_ms: 150000, search_ms: 15000 };
export const HOST_TIERS = { translate: 'quick', stage: 'quick', background: 'default' };
export const HOST_CREATE_TIERS = { fast: 'quick', mid: 'default', large: 'complex' };   // the studio's tiers (src/studio.json host_tiers)
const GEN_TIER = { translate: 'fast', stage: 'mid', background: 'large' };

/* ------------------------------------------------------------ the home node's address and token, per browser */
export function readHomeNode(storage) {
  try {
    const v = JSON.parse((storage && storage.getItem(HOME_KEY)) || 'null');
    return v && typeof v.url === 'string' && /^https?:\/\/\S+$/.test(v.url) ? { url: v.url.replace(/\/+$/, ''), token: String(v.token || '') } : null;
  } catch (_) { return null; }
}
export function writeHomeNode(storage, cfg) {
  try { if (!cfg || !cfg.url) storage.removeItem(HOME_KEY); else storage.setItem(HOME_KEY, JSON.stringify({ url: String(cfg.url), token: String(cfg.token || '') })); return true; } catch (_) { return false; }
}
/* A link the node prints at start-up: …#home-node=<url>&token=<token> (read once, then stored; the caller clears the hash). */
export function homeNodeFromHash(hash) {
  const m = /[#&]home-node=([^&]+)/.exec(hash || ''), t = /[#&]token=([^&]+)/.exec(hash || '');
  return m ? { url: decodeURIComponent(m[1]), token: t ? decodeURIComponent(t[1]) : '' } : null;
}

/* ------------------------------------------------------------ a call cut at its time limit */
function limited(run, ms, env) {
  const ac = env.AbortController ? new env.AbortController() : null;
  return new Promise((ok, ko) => {
    const timer = env.setTimeout(() => { if (ac) try { ac.abort(); } catch (_) {} ko(new Error('timeout ' + ms + ' ms')); }, ms);
    Promise.resolve().then(() => run(ac ? ac.signal : undefined)).then(v => { env.clearTimeout(timer); ok(v); }, e => { env.clearTimeout(timer); ko(e); });
  });
}

/* ------------------------------------------------------------ the home node (client side only; the server is a later lot)
   GET /health (1.5 s limit) on start, every 30 s, and again at once after a failed call; per-capability state. */
export function createHomeNode({ fetch, storage, env, limits = LIMITS }) {
  const S = { name: 'home', configured: false, up: false, node: null, caps: { embed: false, decide: false, generate: { fast: false, mid: false, large: false }, create: false, search: false }, checked: null, error: null };
  let timer = null, cfg = null;
  const auth = () => cfg && cfg.token ? { Authorization: 'Bearer ' + cfg.token } : {};
  async function health() {
    cfg = readHomeNode(storage); S.configured = !!cfg;
    if (!cfg || !fetch) { S.up = false; return S; }
    try {
      const r = await limited(signal => fetch(cfg.url + '/health', { headers: auth(), signal }), limits.health_ms, env);
      const j = r && r.ok ? await r.json() : null;
      const c = (j && j.capabilities) || {}, g = c.generate || {};
      S.up = !!(j && j.ok); S.node = j && j.node || null; S.error = S.up ? null : 'health ' + (r ? r.status : '?');
      S.caps = { embed: !!c.embed, decide: !!c.decide, generate: { fast: !!g.fast, mid: !!g.mid, large: !!g.large }, create: !!c.create, search: !!c.search };
    } catch (e) { S.up = false; S.error = String(e && e.message || e); }
    S.checked = env.now();
    return S;
  }
  async function call(route, body, signal) {
    try {
      const r = await fetch(cfg.url + route, { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, auth()), body: JSON.stringify(body), signal });
      if (!r.ok) throw new Error(route + ' ' + r.status);
      return await r.json();
    } catch (e) { S.up = false; health(); throw e; }
  }
  return {
    name: 'home', state: S, health,
    start() { health(); if (!timer && env.setInterval) timer = env.setInterval(health, limits.health_every_ms); return S; },
    stop() { if (timer) env.clearInterval(timer); timer = null; },
    can(cap, tier) { return S.up && (cap === 'decide' ? S.caps.decide : cap === 'generate' ? !!S.caps.generate[GEN_TIER[tier] || 'mid'] : !!S.caps[cap]); },
    async create(req, signal) {
      const r = await call('/v1/create', { tier: req.tier, purpose: req.purpose, prompt: req.prompt, lang: req.lang }, signal);
      return { text: String(r.text || r.tokens || ''), first_ms: r.first_ms, node_ms: r.latency_ms };
    },
    async search(req, signal) {
      const r = await call('/v1/search', { query: req.query, lang: req.lang }, signal);
      return { results: (Array.isArray(r.results) ? r.results : []).map(x => ({ title: String(x.title || ''), url: String(x.url || ''), text: String(x.text || '') })) };
    },
    async decide(req, signal) {
      const r = await call('/v1/decide', { tier: req.tier, question: req.question, questions: req.questions, state: req.state, text: req.text, lang: req.lang }, signal);
      return { answers: r.answers, answer: r.answer, p: r.p, node_ms: r.latency_ms };
    },
    async generate(req, signal) {
      const r = await call('/v1/generate', { tier: GEN_TIER[req.tier] || 'mid', purpose: req.purpose, prompt: req.prompt, lang: req.lang }, signal);
      return { tokens: String(r.tokens || ''), first_ms: r.first_ms, node_ms: r.latency_ms };
    },
  };
}

/* ------------------------------------------------------------ the host's model (a claude.ai artifact: the `sample` capability)
   The same mechanism as src/main.js: sampler.json(prompt, { modelTier, cache: false, signal }) → a parsed JSON object; a
   `not_granted` error forgets the sampler. JSON is the wire form here (ADR 0009 §5): the PDL token lines travel inside it. */
export function judgementText(req) {
  const st = req.state || {};
  const q = (req.questions || []).map(x => x.type === 'bool' ? `${x.id} (true or false): ${x.text}`
    : x.slots ? `${x.id} (an object; each key one of its options): ${x.text}\n${Object.entries(x.slots).map(([k, v]) => `  ${k}: ${v.join(' | ')}`).join('\n')}`
      : x.type === 'score' ? `${x.id} (a number 0..1): ${x.text}` : `${x.id} (one of: ${x.options.join(' | ')}): ${x.text}`);
  return [
    'You judge; you do not write. Answer typed questions about a live story, each with your confidence.',
    'Answer only with JSON: {"answers": {"<question id>": {"answer": <value>, "p": <probability 0..1 that the answer is right>}}}',
    st.context || '', st.absolutes ? 'Absolutes (never broken):\n' + st.absolutes.map(a => `${a.id}: ${a.text}`).join('\n') : '',
    'Questions:', ...q,
  ].filter(Boolean).join('\n');
}
export function stageText(req) {
  const p = req.prompt || {};
  return [p.prefix || '', '', p.delta || '', '',
    'Answer only with JSON: {"tokens": "<the PDL lines, separated by \\n>"}'].join('\n');
}
export function createHostModel({ sample, lost = () => {}, tiers = HOST_TIERS }) {
  async function ask(text, tier, signal) {
    const s = sample(); if (!s) throw new Error('no host model');
    try { return await s.json(text, Object.assign({ modelTier: tiers[tier] || 'quick', cache: false }, signal ? { signal } : {})); }
    catch (e) { if (e && e.code === 'not_granted') lost(); throw e; }
  }
  return {
    name: 'host',
    can: cap => cap !== 'search' && !!sample(),
    /* Free text for one agent of the studio, streamed through onText when the sampler streams. */
    async create(req, signal) {
      const s = sample(); if (!s) throw new Error('no host model');
      try {
        const r = await s(req.prompt, Object.assign({ modelTier: HOST_CREATE_TIERS[req.tier] || 'default', cache: false }, signal ? { signal } : {},
          req.onText ? { onText: x => { if (x && typeof x.text === 'string') req.onText(x.text); } } : {}));
        return { text: String(r && typeof r === 'object' ? r.text || '' : r || '') };
      } catch (e) { if (e && e.code === 'not_granted') lost(); throw e; }
    },
    async decide(req, signal) { const r = await ask(judgementText(req), req.tier, signal); return { answers: r && typeof r === 'object' ? r.answers : null }; },
    async generate(req, signal) {
      const r = await ask(stageText(req), req.tier, signal), t = r && typeof r === 'object' ? (r.tokens ?? r.pdl ?? r.lines) : r;
      return { tokens: Array.isArray(t) ? t.join('\n') : String(t || '') };
    },
  };
}

/* ------------------------------------------------------------ the chain */
export function createModelPort({ reflex, adapters = [], env, limits = LIMITS }) {
  const L = Object.assign({}, LIMITS, limits || {});
  const first = (cap, tier) => adapters.find(a => a.can(cap, tier)) || null;
  async function chain(cap, req, ms) {
    const errors = [];
    for (const a of adapters) {
      if (!a.can(cap, req.tier)) continue;
      const t0 = env.now();
      try {
        const r = await limited(signal => a[cap](req, signal), ms, env);
        const model_ms = Math.round(env.now() - t0);
        return Object.assign({}, r, { adapter: a.name, model_ms, first_ms: r && r.first_ms !== undefined ? r.first_ms : model_ms });
      } catch (e) { errors.push(a.name + ': ' + String(e && e.message || e)); }
    }
    return { failed: errors.join('; ') || 'no model', adapter: errors.length ? 'none' : 'reflex' };
  }
  const port = {
    async embed(texts) { return reflex.embed(texts); },
    /* The now loop's own questions (intent, reaction) are the reflex's; typed questions go down the chain. */
    async decide(req) {
      if (!req.questions) { const t0 = env.now(), r = await reflex.decide(req); return Object.assign({ adapter: 'reflex', model_ms: Math.round(env.now() - t0) }, r); }
      return chain('decide', req, L.judge_ms);
    },
    generate(req) { return chain('generate', req, L.invent_ms); },
    /* The studio's two capabilities (additive): a failed chain is { failed } as everywhere. */
    create(req) { return chain('create', req, L.create_ms); },
    search(req) { return chain('search', req, L.search_ms); },
    available(what) { return what === 'judge' ? !!first('decide', 'translate') : what === 'invent' ? !!first('generate', 'stage') : what === 'create' ? !!first('create', 'mid') : what === 'search' ? !!first('search') : false; },
    /* What serves each instrument right now: the indicator's text. */
    status() { const j = first('decide', 'translate'), i = first('generate', 'stage'); return { judge: j ? j.name : 'code', invent: i ? i.name : 'none' }; },
    arrival: () => reflex.arrival(),
    adapters,
  };
  return port;
}
