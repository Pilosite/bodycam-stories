/* The three clocks (P20): now, scene, story loops around one session. They talk only through transactions and events.
   The now loop answers what the player just said with the fastest means (reflex code, then the leanest model) and never
   awaits a slower loop; the scene loop's answer lands later and adds to, amends (cause.amends) or cancels what now did;
   the story loop prepares ahead. Every transaction records its loop and its latency against the budget (session LOOPS).
   Models are reached only through the model port (core/ports.js); `clock()` and `sleep(ms)` are injected, so the core stays pure.

   What one utterance does (M3, docs/pdl-spec.md §9.3):
   1. now: `decide({ question: 'intent' })`, the port's fastest answer (reflex code in the page). judge() plays its confidence.
   2. now: if it is below `act_from` and the port can judge (`available('judge')`), D1 to D3 are asked in one call
      (`decide({ question: 'understand', questions })`). If the answer lands within `judgeWaitMs`, the now loop uses it.
      Otherwise she holds (a bank line: she thinks) and the judgement lands in the scene loop, which submits the judged intent
      (cause.amends: the reflex intent) and its reaction. If it fails, the reflex answer is played (ask back, or act with doubt).
   3. now: the reaction, `decide({ question: 'reaction' })`, from the bank; a middle confidence shows the doubt first.
   4. scene: if the port can invent (`available('invent')`, or a generate() without available()), `generate()` with the
      stage prompt (core/prompt.js); its lines are read tolerantly, a story.end that is not open and an invented line that a
      D4 judgement (both orders) finds against an absolute are vetoed, and everything goes through submit like any
      transaction. The first `say` amends the now loop's last `say`. An answer to an older utterance is stale: journaled, dropped.
   A port served by code alone answers decide() with `tier: 'reflex'` and has no generate(): nothing is staged (P19). */
import { parseTokens, serializeTokens, INTENT_VERBS } from './pdl.js';
import { judge, readAnswers, understandQuestions, readUnderstanding, absoluteQuestions, readAbsolutes } from './judge.js';
import { stagePrompt, understandContext, parseModelTokens, openEndings } from './prompt.js';

export function createClocks({ session, model, character = null, name = null, clock = () => 0, sleep = ms => new Promise(ok => setTimeout(ok, ms)),
  lines = {}, thresholds = {}, classes = {}, endings = [], judgeWaitMs = 350, absolutes = true } = {}) {
  const translator = { kind: 'model', id: 'translator', tier: 'translate' }, stager = { kind: 'model', id: 'stager', tier: 'stage' };
  const TH = Object.assign({ act_from: 0.8, ask_below: 0.5 }, thresholds);
  const can = what => model.available ? !!model.available(what) : what === 'invent' ? typeof model.generate === 'function' : false;
  const w = session.world, hasLine = id => !!(id && w.vocab.lines[id]);
  let heard = 0;
  const say = (ref, author) => ({ author, horizon: 'now', kind: 'act', body: { op: 'say', ref } });
  const meta = r => r ? { adapter: r.adapter, timings: r.model_ms !== undefined || r.first_ms !== undefined ? { model_ms: r.model_ms, first_ms: r.first_ms } : undefined } : {};
  const callNote = (o, r) => session.modelCall(Object.assign({ character }, o, meta(r)));
  function commitId(cls) { const base = 'c.' + (cls || 'free'); let id = base, n = 1; while (w.commitments[id]) id = base + '.' + (++n); return id; }

  /* The reaction to an intent: the port's (the bank's, in the page), told the play (act, doubt, ask: the reflex asks back on
     'ask'), preceded by the doubt line in the middle band when the bank has one. */
  async function reaction(intent, play, { p, stance, loop, t0, author }) {
    const r = await model.decide({ tier: 'translate', question: 'reaction', state: { intent: intent.tx.body, station: w.body.station, p, play, stance } });
    const txs = parseTokens(r.answer || '');
    if (play === 'doubt' && hasLine(lines.doubt) && !txs.some(t => t.body && t.body.ref === (lines.ask || 'ask.back'))) txs.unshift(say(lines.doubt, txs[0] ? txs[0].author : author));
    return txs.map(tx => session.submit(Object.assign({ cause: { tx: intent.seq } }, tx), { loop, latency_ms: clock() - t0 }));
  }

  /* The scene loop's invention: Sam's reaction written by a model, validated like anything else. */
  function invent({ intent, now, text, lang, t0, n }) {
    const call = callNote({ tier: 'stage', purpose: 'react', loop: 'scene', status: 'pending', instrument: 'invention' });
    const lastSay = [...now].reverse().find(x => x.status !== 'rejected' && x.tx && x.tx.kind === 'act' && x.tx.body.op === 'say');
    const prompt = stagePrompt(w, { character, name: name || character, lang, endings, intent: intent.tx.body, heard: text,
      now: now.filter(x => x.status !== 'rejected').map(x => serializeLine(x.tx)) });
    const done = Promise.resolve().then(() => model.generate({ tier: 'stage', purpose: 'react', context: { intent: intent.seq, call: call.seq, now: now.map(x => x.seq) }, prompt, lang }))
      .then(ans => ans || { failed: 'empty' }, e => ({ failed: String(e && e.message || e) }));
    return done.then(async ans => {
      if (ans.failed) { callNote({ tier: 'stage', purpose: 'react', loop: 'scene', status: 'failed', ref_seq: call.seq, instrument: 'invention', latency_ms: clock() - t0, error: ans.failed }, ans); return []; }
      if (n !== heard) { callNote({ tier: 'stage', purpose: 'react', loop: 'scene', status: 'landed', ref_seq: call.seq, instrument: 'invention', latency_ms: clock() - t0, stale: true }, ans); return []; }
      const { txs, dropped } = parseModelTokens(ans.tokens, { author: stager });
      callNote({ tier: 'stage', purpose: 'react', loop: 'scene', status: 'landed', ref_seq: call.seq, instrument: 'invention', latency_ms: clock() - t0, dropped: dropped.length || undefined }, ans);
      const veto = txs.map(() => null), open = openEndings(w, endings).map(e => e.id);
      txs.forEach((tx, i) => { if (tx.kind === 'effect' && tx.body.op === 'story.end' && !open.includes(tx.body.id)) veto[i] = [{ path: 'body.id', why: 'ending_not_open', value: tx.body.id }]; });
      await checkAbsolutes(txs, veto, t0);
      let amended = false;
      return txs.map((tx, i) => {
        const cause = { tx: call.seq };
        if (!amended && lastSay && tx.kind === 'act' && tx.body.op === 'say') { cause.amends = lastSay.seq; amended = true; }
        return session.submit(Object.assign({}, tx, { cause }), { loop: 'scene', latency_ms: clock() - t0, veto: veto[i] || undefined });
      });
    });
  }
  /* D4 on the invented lines, both orders, one call: a line judged against an absolute (or uncertain) is vetoed with it. */
  async function checkAbsolutes(txs, veto, t0) {
    const L = txs.map((tx, i) => [i, tx]).filter(([i, tx]) => !veto[i] && tx.kind === 'act' && tx.body.op === 'say' && tx.body.line);
    const A = Object.values(w.principles).filter(p => p.strength === 'absolute' && p.form === 'prose' && !(p.compiled && ['compiled', 'approved'].includes(p.compiled.status))
      && (p.scope === 'character:' + character || ['place', 'story', 'scene'].includes(p.scope)) && p.doc_kind !== 'facts');
    if (!absolutes || !L.length || !A.length || !can('judge')) return;
    const texts = L.map(([, tx]) => Object.values(tx.body.line)[0]), qs = absoluteQuestions(texts, A);
    const call = callNote({ tier: 'translate', purpose: 'absolutes', loop: 'scene', status: 'pending', instrument: 'judgement' });
    let r;
    try { r = await model.decide({ tier: 'translate', question: 'absolutes', questions: qs, state: { absolutes: A.map(p => ({ id: p.id, text: p.text })) } }); } catch (e) { r = { failed: String(e && e.message || e) }; }
    if (!r || r.failed) { callNote({ tier: 'translate', purpose: 'absolutes', loop: 'scene', status: 'failed', ref_seq: call.seq, instrument: 'judgement', latency_ms: clock() - t0, error: (r && r.failed) || 'empty' }, r); return; }
    const hits = readAbsolutes(qs, r, L.length);
    callNote({ tier: 'translate', purpose: 'absolutes', loop: 'scene', status: 'landed', ref_seq: call.seq, instrument: 'judgement', latency_ms: clock() - t0 }, r);
    hits.forEach((h, k) => { if (h) veto[L[k][0]] = [{ path: 'body.line', why: 'constraint', value: h, by: 'judgement' }]; });
  }

  /* D1 to D3 in one call → the judged understanding, or null when the call failed. */
  async function understand(text, lang, t0, loop) {
    const qs = understandQuestions(w, { classes });
    const call = callNote({ tier: 'translate', purpose: 'understand', loop, status: 'pending', instrument: 'judgement' });
    const ask = Promise.resolve().then(() => model.decide({ tier: 'translate', question: 'understand', questions: qs, text, lang, state: { context: understandContext(w, { character, heard: text }) } }))
      .then(r => r && !r.failed ? r : { failed: (r && r.failed) || 'empty' }, e => ({ failed: String(e && e.message || e) }));
    const land = r => {
      if (r.failed) { callNote({ tier: 'translate', purpose: 'understand', loop: r.loop, status: 'failed', ref_seq: call.seq, instrument: 'judgement', latency_ms: clock() - t0, error: r.failed }, r); return null; }
      const u = readUnderstanding(readAnswers(qs, r, TH), { text, classes, commitId });
      callNote({ tier: 'translate', purpose: 'understand', loop: r.loop, status: 'landed', ref_seq: call.seq, instrument: 'judgement', latency_ms: clock() - t0, p: u.p, play: u.play }, r);
      return u;
    };
    return { ask, land, call };
  }

  const C = {
    /* An utterance → { intent, now: [results], scene: Promise<[results]> }. Resolves when the now loop is done. */
    async hear({ text, lang, loud }) {
      const t0 = clock(), n = ++heard;
      const d = await model.decide({ tier: 'translate', question: 'intent', options: INTENT_VERBS, state: { station: w.body.station }, text, lang });
      const tier = d.tier === 'reflex' ? 'reflex' : 'translate', author = tier === 'reflex' ? { kind: 'model', id: 'reflex', tier } : translator;
      const j = judge(d, TH);
      const intentTx = (fields, by) => ({ author: by, horizon: 'now', kind: 'intent', body: Object.assign({ text, lang }, loud ? { loud: true } : {}, fields) });
      let U = null, pending = null;
      if (j.play !== 'act' && can('judge')) {                // the reflex is unsure and a model can judge: D1 to D3, raced against the now budget
        const u = await understand(text, lang, t0, 'now');
        const first = await Promise.race([u.ask, sleep(judgeWaitMs).then(() => null)]);
        if (first) U = u.land(Object.assign({ loop: 'now' }, first)); else pending = u;
      }
      const useU = U && U.play !== undefined;
      const intent = session.submit(intentTx(useU && U.intent ? U.intent : d.answer, useU ? translator : author), { loop: 'now', latency_ms: clock() - t0 });
      session.modelCall(Object.assign({ tier, purpose: 'intent', character, loop: 'now', status: 'done', latency_ms: clock() - t0, adapter: d.adapter || (tier === 'reflex' ? 'reflex' : undefined),
        instrument: 'judgement', p: j.p, play: j.play }, d.model_ms !== undefined ? { timings: { model_ms: d.model_ms } } : {}));
      let now;
      if (pending) now = hasLine(lines.hold) ? [session.submit(Object.assign({ cause: { tx: intent.seq } }, say(lines.hold, author)), { loop: 'now', latency_ms: clock() - t0 })] : [];
      else if (useU) now = await reaction(intent, U.play, { p: U.p, stance: U.stance, loop: 'now', t0, author: translator });
      else now = await reaction(intent, j.play, { p: j.p, loop: 'now', t0, author });
      if (!pending) return { intent, now, scene: can('invent') ? invent({ intent, now, text, lang, t0, n }) : Promise.resolve([]) };
      // the judgement lands later, in the scene loop: the judged intent amends the reflex one, then its reaction, then the invention
      const scene = pending.ask.then(async r => {
        const u = pending.land(Object.assign({ loop: 'scene' }, r));
        if (n !== heard) return [];
        let i2 = intent, react;
        if (u && u.play !== 'ask') {
          i2 = session.submit(Object.assign(intentTx(u.intent, translator), { cause: { tx: pending.call.seq, amends: intent.seq } }), { loop: 'scene', latency_ms: clock() - t0 });
          react = i2.status === 'rejected' ? [] : await reaction(i2, u.play, { p: u.p, stance: u.stance, loop: 'scene', t0, author: translator });
        } else react = await reaction(intent, u ? 'ask' : j.play, { p: j.p, loop: 'scene', t0, author });
        const more = can('invent') && i2.status !== 'rejected' ? await invent({ intent: i2, now: [...now, ...react], text, lang, t0, n }) : [];
        return [...(i2 !== intent ? [i2] : []), ...react, ...more];
      });
      return { intent, now, scene };
    },
    /* Wire an input port. */
    attach(input) { return input.subscribe(ev => ev.kind === 'speech' ? C.hear(ev) : ev.kind === 'look' ? session.observe({ event: 'look.at', data: { target: ev.target, s: ev.s || 0 } }) : null); },
  };
  return C;
}
/* One transaction as the token line the model reads back (the now reaction in the delta). */
const serializeLine = tx => serializeTokens({ author: tx.author, horizon: tx.horizon, kind: tx.kind, body: tx.body }).split('\n')[0];
