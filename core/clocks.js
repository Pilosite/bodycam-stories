/* The three clocks (P20): now, scene, story loops around one session. They talk only through transactions and events.
   The now loop answers what the player just said with the fastest means (reflex code, then the leanest model) and never
   awaits a slower loop; the scene loop's answer lands later and adds to, amends (cause.amends) or cancels what now did;
   the story loop prepares ahead. Every transaction records its loop and its latency against the budget (session LOOPS).
   Models are reached only through the model port (core/ports.js); `clock()` is injected (ms), so the core stays pure. */
import { parseTokens, INTENT_VERBS } from './pdl.js';

export function createClocks({ session, model, character = null, clock = () => 0 }) {
  const translator = { kind: 'model', id: 'translator', tier: 'translate' };
  const C = {
    /* An utterance → { intent, now: [results], scene: Promise<[results]> }. Resolves when the now loop is done. */
    async hear({ text, lang, loud }) {
      const t0 = clock(), w = session.world;
      const d = await model.decide({ tier: 'translate', question: 'intent', options: INTENT_VERBS, state: { station: w.body.station }, text, lang });
      const intent = session.submit({ author: translator, horizon: 'now', kind: 'intent', body: Object.assign({ text, lang }, loud ? { loud: true } : {}, d.answer) }, { loop: 'now', latency_ms: clock() - t0 });
      session.modelCall({ tier: 'translate', purpose: 'intent', character, loop: 'now', status: 'done', latency_ms: clock() - t0 });
      const r = await model.decide({ tier: 'translate', question: 'reaction', state: { intent: intent.tx.body, station: w.body.station } });
      const now = parseTokens(r.answer).map(tx => session.submit(Object.assign({ cause: { tx: intent.seq } }, tx), { loop: 'now', latency_ms: clock() - t0 }));
      // the scene loop: started, never awaited here
      const call = session.modelCall({ tier: 'stage', purpose: 'react', character, loop: 'scene', status: 'pending' });
      const scene = model.generate({ tier: 'stage', purpose: 'react', context: { intent: intent.seq, call: call.seq, now: now.map(x => x.seq) } }).then(ans => {
        session.modelCall({ tier: 'stage', purpose: 'react', character, loop: 'scene', status: 'landed', ref_seq: call.seq, latency_ms: clock() - t0 });
        return parseTokens(ans.tokens).map(tx => session.submit(Object.assign({ cause: { tx: call.seq } }, tx), { loop: 'scene', latency_ms: clock() - t0 }));
      });
      return { intent, now, scene };
    },
    /* Wire an input port. */
    attach(input) { return input.subscribe(ev => ev.kind === 'speech' ? C.hear(ev) : ev.kind === 'look' ? session.observe({ event: 'look.at', data: { target: ev.target, s: ev.s || 0 } }) : null); },
  };
  return C;
}
