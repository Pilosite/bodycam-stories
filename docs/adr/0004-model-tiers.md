# 0004. Model tiers and how they are reached

- Status: proposed
- Date: 2026-11-20
- Evidence: `docs/research/models.md` (sources, dates, and what is usable versus paper versus pitch)

## Context
`docs/architecture.md` (pillar 4) defines four tiers that all speak PDL:

- **reflex**: code, < 100 ms;
- **translation**: 0.2 to 0.8 s. It turns the sentence into an intent (including `commit` intents), the intent into Sam's line, and decides admissibility;
- **staging**: 2 to 8 s, the full reaction;
- **background**: continuous. It keeps the story and the frontier of likely next intents.

`docs/sdlc.md` §7 calls for one adapter with two implementations: the artifact host capability, and a local proxy with the key. Toine asked to look again at "models like JEV" that structure events into data "the AI way, versus LLMs". The research found that this is most probably **Jev**, TypeSafe AI's hosted decision model (15 Sep 2026): it returns typed answers with probabilities and never writes text. Cloudflare Clef (open weights) and OpenAI's Decisions API followed in October. The **JEPA** line (V-JEPA 2, VL-JEPA) has nothing usable for us now. Its useful idea, matching in embedding space and generating only when needed, is available through ordinary sentence encoders.

Four facts shape the decision:

1. PDL is closed, so **what translation decides is enumerable**: intents, prepared frontier entries, things within reach. That is matching, not generation.
2. **Hosted small LLMs are slow with thinking on.** Haiku 5.5 takes about 6 s to the first answer token at low effort; Mercury diffusion models take 2 to 7 s. Only thinking *off* can approach 0.8 s, and that must be measured from France.
3. **The artifact's `sample` capability** offers the `quick`/`default`/`complex` tiers, a named model and effort, but no system prompt, no schema enforcement, no prompt-cache control, no network, and a couple of concurrent calls per viewer. Its `default` tier takes 5 to 60 s to first text.
4. **P7 (richness before reactivity).** Speed must not be bought with depth. Here the fast path only *selects* what deeper tiers prepared; it never improvises.

## Decision
**One port, three implementations.** `core/` defines `ModelPort { embed, decide, generate }`, implemented by:

- `cannedPort`: tests and replay;
- `artifactPort`: `sample`;
- `proxyPort`: a localhost Node process with the keys.

Each tier has one fixed JSON schema and one fixed effort, so caches and compiled grammars stay warm. Every call is journaled: tier, port, model, queued/TTFT/total, cache reads and writes, usage, status. The PDL validator has the last word on every output. A refusal or timeout counts as a miss and falls through. Model names live in configuration, never in code.

**Tier assignments.**

| Tier | POC v1 (this month) | v2 (to try) | Target |
|---|---|---|---|
| Reflex | code: alias match on the closed vocabulary, rules, validator | cache of recent sentence → intent translations | code |
| Translation | **non-generative first**: a local sentence encoder (multilingual-e5-small or EmbeddingGemma-300M q8, transformers.js in the page, the same in Node for the bench), nearest match with thresholds. **Fallback:** Claude Haiku 5.5, thinking off, effort `low`, structured output = PDL intent schema plus one short line, 1.5 s deadline. `commit` intents always take the fallback, which extracts the condition and the behaviour. Lines come from the frontier entry or the pack's fallback lines | a **decision model** (Jev via OpenRouter/TypeSafe, or Clef-flash) for the medium-confidence band and admissibility; an on-device fallback (Chrome Prompt API with `responseConstraint`, or a fine-tuned FunctionGemma) | a classifier or decision model fine-tuned on our journals, on-device |
| Staging | Claude Sonnet 5.5, effort `low`, strict tool use emitting PDL transactions, streamed (execution starts at the first complete transaction), pack and character context cached | Haiku 5.5 at `medium` against Sonnet; one Mercury speed comparison | cheapest model that holds the audit score |
| Background | Claude Opus 5.5, effort `medium`, in a budgeted loop: story state plus **frontier entries**, about 10 per station, each with 2 to 5 paraphrase anchors (FR and EN), a pre-written line and its PDL. Compiler and audit via the Batch API | Sonnet 5.5 for refresh, Opus for arcs | continuous growth |

**Translation without generation.**

1. Embed the sentence once.
2. Match it against intent anchors (embedded at pack build), frontier anchors (embedded when the entry is added) and the things within reach.
3. Accept a frontier hit only if the score is ≥ θ and beats the best *other* entry by a margin μ; accept an intent hit at its own threshold. Anything else goes to the fallback.
4. Calibrate θ and μ for a false-accept rate of at most about 3 %, and measure out-of-scope false accepts on their own.

**Modes.**

- **Proxy mode** is the measuring mode: encoder in the page, Haiku/Sonnet/Opus as above. It may claim real per-tier latency from a French desktop, cache rates, cost per session and schema-valid rate.
- **Artifact mode** is a showcase:
  - translation uses a lexical matcher, plus `quick` via `sample.json` (an encoder is too large to bundle, and the network is closed);
  - staging uses `quick`, or a named `claude-sonnet-5-5` at `effort: low`;
  - background uses `default`, throttled so the foreground keeps its slot.
  
  It may claim PDL-only, replay, hit rate and the share answered without generation. It must **not** claim tier latencies (P19).

**First experiments (one day each, `docs/research/models.md` §7).**

- **E1:** an offline matching bench on about 150 labelled FR/EN sentences, a third of them out of scope. Compare BM25, e5-small and EmbeddingGemma. Report accuracy, risk-coverage curves, the thresholds and CPU latency. No key needed.
- **E2:** run E1's weak band through Haiku 5.5 with thinking off and, if a key is available, through Jev with the option order swapped once. Report latency from France, valid rate, accuracy and cost.

## Consequences
- Translation becomes mostly retrieval, so its speed depends on the encoder and the anchors, not on a provider. **Anchors join the frontier entry and the pack format**: that is a contract change to `docs/architecture.md`, to be written before M4.
- The background tier gets a measurable job: anchors, lines and PDL; the hit rate scores it.
- The PDL schema handed to hosted models must be flat, because Claude structured outputs reject recursion and numeric bounds. Bounds stay in the validator.
- v1 needs one Anthropic key and an encoder download. A decision-model key is needed only for E2 and v2.
- Haiku 5.5 can refuse on safety grounds with no server-side fallback: the darker beats of the story must be tested, and the fallback lines must cover refusals.
- `docs/pdl.md` explains « JEV » as "dLLM", which was a guess. Correct it when the sandbox text is next touched, once Toine confirms.
- No scope row moves. This ADR makes the v2 row "on-device small model for translation" and the target row "specialised non-generative models" concrete.

## Open questions
1. Is "JEV" Jev (TypeSafe AI)? If JEPA was meant: not usable yet, and its idea already sits in the translation tier.
2. May we open an OpenRouter (or TypeSafe) account for E2? One key reaches Jev, Clef-flash and others.
3. Is proxy mode accepted as the measuring mode, with the artifact a showcase that cannot prove the latency targets?
4. Should there be a per-session cost ceiling for the continuous Opus background tier?
5. Is French the primary play language? It weighs on the encoder choice and on Jev, whose French quality is not verified.
