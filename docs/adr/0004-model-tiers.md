# ADR 0004: Model tiers and how they are reached

- **Status:** proposed
- **Date:** 2026-11-20
- **Evidence:** `docs/research/models.md` (sources, dates, what is usable versus paper versus pitch)

## Context

PDL is spoken by four tiers (`docs/architecture.md`, pillar 4):

- **reflex**: code, < 100 ms;
- **translation**: 0.2 to 0.8 s. It turns the player's sentence into an intent, the intent into Sam's line, and decides admissibility;
- **staging**: 2 to 8 s, the full reaction;
- **background**: continuous. It keeps the story, the branches and the frontier of likely next intents.

`docs/sdlc.md` §7 says that which model serves which tier is configuration, recorded here, and that one adapter serves two modes: the claude.ai artifact and a local proxy holding the keys.

Toine asked us to look again at "models like JEV", meaning models that structure events into data without generating text. The research found that the name most probably refers to **Jev**, a hosted "decision model" from TypeSafe AI launched on 15 September 2026. It returns typed answers with probabilities and never writes text. Cloudflare (Clef, open weights), OpenAI (Decisions API) and others followed within weeks. The **JEPA** line (V-JEPA 2, VL-JEPA) was also checked. It offers nothing usable for us now; its useful idea, matching in embedding space and generating only when needed, is available through ordinary sentence encoders.

Three facts shape the decision:

1. **Everything the translation tier must decide is enumerable**, because PDL is closed: the intents, the prepared frontier entries and the things within reach of a station. Picking among enumerated candidates is a matching problem, not a generation problem.
2. **Hosted small LLMs are not fast with thinking on.** Haiku 5.5 takes about 6 s to the first answer token at low effort with thinking on (Artificial Analysis); the Mercury diffusion models measure 2 to 7 s to first answer. Only a model with thinking *off* has a chance at 0.8 s, and that still has to be measured from France.
3. **In the artifact, the page has three model tiers but no system prompt, no schema enforcement, no prompt-cache control and no network.** Its `default` tier takes 5 to 60 s to first text, and a couple of concurrent calls per viewer at most. It can show the architecture and the frontier hit rate. It cannot show tier latencies.

## Decision

### 1. One port, three implementations

`core/` defines a `ModelPort` with `embed`, `decide` and `generate` (shape in `docs/research/models.md` §5.3), implemented by:

- `cannedPort`: tests and replay; replay never calls a model;
- `artifactPort`: the `sample` capability;
- `proxyPort`: a Node process on localhost with the keys; Claude Messages API, optional decision endpoint, local embeddings.

Each tier has **one fixed JSON schema and one fixed effort**, so that prompt caches and compiled grammars stay warm. Every call is journaled with tier, port, model, timings (queued, TTFT, total), cache reads and writes, usage and status. **The PDL validator has the last word on every output, whatever the port.** A refusal or a timeout is a miss, never a crash: the chain falls through to the next tier or to the fallback lines.

### 2. Tier assignments

| Tier | POC v1 (runnable by us this month) | v2 (to try) | Target |
|---|---|---|---|
| **Reflex** | code: alias and exact match on the closed vocabulary, rules firing, validator | add a cache of recent translations (sentence embedding → intent) | unchanged: code |
| **Translation** | **non-generative first** (§3): a local sentence encoder (multilingual-e5-small or EmbeddingGemma-300M q8, transformers.js, in the page; the same model in Node for the bench), nearest match against intent anchors, frontier anchors and things within reach, with thresholds. **Fallback:** Claude Haiku 5.5, thinking off, effort `low`, structured output = PDL intent schema plus one short line, 1.5 s deadline. Sam's line comes from the frontier entry or the pack's fallback lines in the common case | a **decision model** (Jev 1.14 via OpenRouter or TypeSafe; Clef-flash if open weights matter) for the medium-confidence band, and for admissibility as a `noul`. Compare with an on-device fallback (Chrome Prompt API with `responseConstraint`, or a fine-tuned FunctionGemma) | a small classifier or decision model **fine-tuned on our own journals** (labels for free: what was matched, what staging ended up doing), on-device; generation only for misses |
| **Staging** | Claude Sonnet 5.5, effort `low`, strict tool use emitting PDL transactions, streamed so that execution starts on the first complete transaction; character and pack context cached (automatic `cache_control`, 5 min TTL, kept warm) | per request class, Haiku 5.5 at `medium` against Sonnet 5.5 at `low`; one comparison run of a diffusion LLM (Mercury) for speed | the cheapest model that holds the principle-audit score |
| **Background** | Claude Opus 5.5, effort `medium`: keeps the story state and **writes the frontier** (per station, about 10 entries, each with 2 to 5 paraphrase anchors, a pre-written line and its PDL), in a loop with a budget, 1 h cache on the pack. The pack **compiler** and the **audit** go through the Batch API (50 % off), not the live loop | Sonnet 5.5 for frontier refresh and Opus only for arcs; invalidation driven by what was played | continuous world growth (`docs/scope.md` target row) |

### 3. The translation tier without generation

1. Embed the sentence once.
2. Match it against three sets: (a) 3 to 8 anchors per intent in French and English, embedded when the pack is built; (b) the anchors of the frontier entries, embedded when the background tier adds them; (c) the names and descriptions of the things within reach.
3. Accept a **frontier hit** when the best score passes θ_hit *and* beats the best *other* entry by a margin μ. Accept an **intent hit** at θ_int. Anything else goes to the fallback.
4. Calibrate θ and μ on a labelled set so that the false-accept rate stays at or below about 3 %, and measure out-of-scope false accepts on their own.

Generation then happens only on misses and in staging.

### 4. Modes and what each may claim

| | Artifact (`artifactPort`) | Local proxy (`proxyPort`) |
|---|---|---|
| Translation | lexical matcher (an encoder is too large to bundle and the network is closed); fallback on `quick` via `sample.json` | encoder in the page; Haiku 5.5 fallback; optional decision model |
| Staging | `quick`, or a named `claude-sonnet-5-5` with `effort: low` (falls back silently to the tier) | Sonnet 5.5 |
| Background | `default`, throttled so it never takes the slot the foreground needs | Opus 5.5 |
| May claim | PDL only, replay, hit rate, share answered without generation | real per-tier latency from a French desktop, cache rates, cost per session, schema-valid rate |
| Must not claim | tier latencies (they include consent, queueing, tier substitution) | — |

### 5. First experiments (one day each)

The details are in `docs/research/models.md` §7.

- **E1, offline matching bench.** About 150 labelled sentences (FR and EN, a third out of scope) for two stations. Compare BM25, e5-small and EmbeddingGemma. Report accuracy, risk-coverage curves, the thresholds chosen, and CPU latency. No key needed.
- **E2, fallback and decision model.** Run the weak band from E1 through Haiku 5.5 (thinking off) and, if a key can be had, Jev with the option order swapped once. Report latency from France, valid rate, accuracy and cost.

## Consequences

- The translation tier is mostly **retrieval**, so its speed depends on the encoder and the anchors, not on a provider. Anchors become part of the pack format and of every frontier entry, which touches `docs/architecture.md` (frontier entry) and the pack format. A follow-up contract change is needed.
- The background tier's job is clearer and measurable: it writes frontier entries with anchors and lines; the hit rate scores it.
- The schema handed to hosted models must be **flat** (no recursion, no numeric bounds), because Claude structured outputs reject those features. Bounds stay in the validator.
- A second account (OpenRouter or TypeSafe) is needed only for E2 and v2; v1 depends on one Anthropic key plus a model download.
- Haiku 5.5 can refuse on safety grounds without a server-side fallback; the story's darker beats must be tested against it.
- `docs/pdl.md` explains « JEV » as "dLLM". That is now known to be a guess. It should be corrected when the demo text is next touched, after the owner confirms.
- Scope ledger: no row moves. The "on-device small model for translation" (v2) and "specialised non-generative models" (target) rows are made concrete by this ADR.

## Open questions for the owner

1. Is "JEV" Jev (TypeSafe AI's decision model)? If he meant JEPA, the answer is "not usable yet; its idea is in the translation tier".
2. Can we open an API account for a decision model (OpenRouter is the simplest: one key reaches Jev, Clef-flash and others) for E2?
3. Is the local proxy acceptable as the main mode for measurements, the artifact staying a showcase? The artifact cannot prove the latency targets.
4. Budget for the background tier: Opus 5.5 running continuously during a 10-minute session is the main cost; is a per-session ceiling wanted?
5. Is French the primary play language? It weighs on the encoder choice and on Jev, whose French quality is not verified.
