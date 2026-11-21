/* The four ports of the narrative core (P21, docs/architecture.md "Shape: a hexagon and three clocks", ADR 0004).
   The core imports nothing from the engine, the DOM, the models, the input device or storage: each is an adapter that
   implements one of these plain interfaces. Test adapters: core/paper-world.js (engine), core/canned-model.js (model). */
import { EXECUTOR_METHODS } from './world.js';

export const PORTS = {
  /* engine: the executor (§9.1). Each call (args, ctx) → events. */
  engine: EXECUTOR_METHODS,
  /* model (ADR 0004): three entry points, provider-agnostic; tiers are roles (fast, mid, large), chosen in configuration.
       embed(texts: string[])                                   → Promise<number[][]>
       decide({ tier, question, options?, state? })             → Promise<{ answer, p?, uncertain? }>   a typed judgement
       generate({ tier, purpose, context })                     → Promise<{ tokens }>   PDL token text (§10), validated after
     Additive (M3, docs/pdl-spec.md §9.1.1):
       decide({ tier, question, questions: [{ id, type, text, options? | slots?, absolute? }], state?, text?, lang? })
                                                                → Promise<{ answers: { id: { answer, p } } }>   typed questions in one call;
                                                                  `<id>~r` is the same question with its options reversed (both orders)
       generate({ …, prompt: { prefix, delta }, lang })        the stage prompt assembled by the core (core/prompt.js)
       any answer may carry adapter, model_ms, first_ms (who answered, how fast), or { failed: reason } instead of throwing
       available('judge' | 'invent') → bool (optional): whether a model can judge or invent right now
     Streaming is not part of this change (the host's model answers whole); see §9.1.1.
     Additive (conception studio, core/studio.js, briefs/conception-v2.md), optional, used before play only:
       create({ tier: fast|mid|large, purpose, prompt, lang?, onText? })   → Promise<{ text }>   free text for one agent, streamed
                                                                              through onText(textSoFar) when the adapter can
       search({ query, lang? })                                        → Promise<{ results: [{ title, url, text }] }>
       available('create' | 'search')                                  the home node declares both in /health; the host has no search */
  model: ['embed', 'decide', 'generate'],
  /* input: what the player does, pushed to the clocks.
       subscribe(handler) with handler({ kind: 'speech', text, lang, loud? } | { kind: 'look', target, s }) → unsubscribe() */
  input: ['subscribe'],
  /* store: packs and journals (Git files in v1).
       readPack(id) → { manifest, texts, place, stations, beats, lines }; readLibrary() → { id: text };
       appendJournal(sessionId, entries); readJournal(sessionId) → entries */
  store: ['readPack', 'readLibrary', 'appendJournal', 'readJournal'],
};

/* The methods an adapter is missing for a port ([] when it implements it). */
export function missing(port, impl) { return (PORTS[port] || []).filter(m => !impl || typeof impl[m] !== 'function'); }
