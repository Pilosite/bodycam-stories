# Models for the four tiers: research notes

Research done on 20 November 2026 for ADR 0004 (`docs/adr/0004-model-tiers.md`). Every claim carries a link and, where it matters, a date. Three labels are used throughout:

- **usable**: published, with weights or a public API, that a small team can call or run today;
- **paper**: described in a paper, with no official weights or API (community re-implementations are named as such);
- **pitch**: a vendor claim not checked independently.

"Not verified" means I looked and could not confirm it.

The tiers in question (`docs/architecture.md`, pillar 4; `docs/poc-principes.md` §2.4): **reflex** (code, < 100 ms), **translation** (0.2 to 0.8 s: player sentence → intent; intent → character line; admissibility), **staging** (2 to 8 s: the full reaction), **background** (continuous: story, branches, the frontier of likely next intents). All speak PDL.

---

## 0. What "JEV" most probably is

**Most probably Jev, from TypeSafe AI**: a hosted "decision model" launched on 15 September 2026. It reads a state (text or JSON) and a set of typed questions, and returns typed answers with probabilities. It never writes text. That matches Toine's words closely: "LLMs that translate things instantly", "structuring events into structured data, in an 'AI' way, versus LLMs, even light ones".

- Launch on 15 Sep 2026 with a $40M seed; described as "a model that doesn't generate text at all" ([The Register via search](https://www.theregister.com/a/5296711); [DataCamp, 16 Sep 2026](https://www.datacamp.com/blog/system-one-models-jev)).
- Named after the economist Jevons; "System One" after Kahneman's fast thinking ([flaviocopes, deep dive](https://flaviocopes.com/jev.md)).
- The press covered it widely and competitors followed within weeks: Cloudflare Clef (1 Oct), OpenAI Decisions API (beta 6 Oct, GA 22 Oct), Inception Mercury Decide, Liquid D1 (§1.4). The term is current and visible, so the owner could easily have heard it.

**How sure: high (about 85 %).** The name matches exactly, the timing fits (two months before the satirical demo) and so does the description: instant, structured, "not an LLM". Two other readings exist:

- **JEPA** (Meta and LeCun's joint-embedding predictive architectures, §1.1): it also "predicts structure instead of generating text", but it is a vision research line. Nothing in it translates a sentence into a decision a game could use today.
- **dLLM** (diffusion language models such as Inception's Mercury): this is how `docs/pdl.md` explains the « JEV » label of the demo. It was a guess written for the staging of the demo, and it describes fast *generative* models, the opposite of what Toine now stresses.

The owner should confirm (open question in the ADR). If he meant JEPA, §1.1 still answers him.

---

## 1. Non-generative structuring

### 1.1 The JEPA family

| Model | What it is | Status | Licence | Runs where |
|---|---|---|---|---|
| I-JEPA (2023) | image encoder trained by predicting masked regions in embedding space | usable | Meta research licence (not checked) | community ONNX ports for transformers.js exist ([onnx-community/ijepa_vith14_1k](https://huggingface.co/onnx-community/ijepa_vith14_1k)) |
| V-JEPA 2 (June 2025) | self-supervised video encoder, 300M to 1B parameters; V-JEPA 2-AC is an action-conditioned predictor used for robot-arm planning | usable | MIT (most of the repo) | Python/PyTorch, GPU; a Qualcomm export exists ([qualcomm/V-JEPA-2](https://huggingface.co/qualcomm/V-JEPA-2)); no browser build found |
| V-JEPA 2.1 (16 Mar 2026) | new encoder family (80M to 2B) with "temporally consistent dense features" | usable | MIT | same as above |
| VL-JEPA (arXiv 11 Dec 2025, v2 2 Feb 2026, ICLR 2026) | vision-language model that **predicts the embedding of the answer text** instead of generating tokens; a light decoder runs only when the embedding stream changes ("selective decoding", 2.85× fewer decodes) | **paper**: no official code or weights found | — | — |
| LLM-JEPA (arXiv Sep 2025, ICLR 2026) | adds a JEPA loss to LLM fine-tuning (e.g. predict the embedding of the code from the embedding of the text) | usable as a training recipe ([galilai-group/llm-jepa](https://iclr.cc/virtual/2026/poster/10010475)) | — | training only |

Sources: V-JEPA 2 repo and releases ([github.com/facebookresearch/vjepa2](https://github.com/facebookresearch/vjepa2)); Meta announcement ([ai.meta.com/vjepa](https://ai.meta.com/vjepa/)); VL-JEPA paper ([arXiv 2512.10942](https://arxiv.org/abs/2512.10942), [HTML v2](https://arxiv.org/html/2512.10942v2)); LLM-JEPA ([arXiv 2509.14252](https://www.arxiv.org/abs/2509.14252)). Context: LeCun left Meta in November 2025 to found AMI Labs (Paris), whose seed round was reported at $1.03B in March 2026 ([StartupHub, secondary](https://www.startuphub.ai/news/figure-yann-lecun-jepa-release-cadence-2026-08-20)). I found no model release from AMI Labs that a team could use; only theory preprints are reported (not verified on arXiv).

**What VL-JEPA really offers.** It is a 1.6B model made of a frozen V-JEPA 2 ViT-L video encoder, a predictor built from the last 8 layers of Llama-3.2-1B, and a text-side encoder built from **EmbeddingGemma-300M**, all projected into a shared 1,536-dimensional space ([paper HTML](https://arxiv.org/html/2512.10942v2)). "Real time" means one forward pass per sliding window, not a measured latency: the paper gives no milliseconds or frames per second. The authors say plainly that it is not a general alternative to VLMs for reasoning or tool use. The only checkpoint available is an unofficial re-implementation trained on one workstation for MSRVTT retrieval only ([cun-bjy/open-vljepa](https://huggingface.co/cun-bjy/open-vljepa), Llama 3.2 + Gemma terms).

**What it could do for us, honestly.**

- *Perceiving the rendered frame*: **not needed.** Our world is drawn from the PDL state, so the engine already knows what is in front of the camera (scene graph, station, visibility). Perceiving our own image would recover what we already hold. The one honest use is an *audit*: "does the frame show what was asked?", for the free-request bench. A plain image-text encoder (SigLIP, available for transformers.js: [Xenova/siglip-base-patch16-224](https://huggingface.co/Xenova/siglip-base-patch16-224)) does that today. JEPA is not required.
- *Intent embedding and nearest match against the frontier*: **this is the useful idea, and it does not need JEPA weights.** VL-JEPA's recipe is "encode the input, predict the answer's embedding, match it against candidate embeddings, decode only when needed". Our translation tier can do the text-only version of it today with an off-the-shelf sentence encoder (§2), and VL-JEPA's own text side *is* EmbeddingGemma.
- *World-state prediction* ("what will the player do next", "what does this action do to the scene"): **for now this is fantasy.** V-JEPA 2-AC predicts the next video-frame embedding for robot arms from 62 hours of robot video ([V-JEPA 2 paper](https://arxiv.org/html/2506.09985v1)). Nothing like it exists for narrative state. As a *target*, a small predictor trained on our own journals (state embedding + intent → next state embedding) is a legitimate research direction once we have journals; not before.

**Verdict:** nothing from the JEPA line belongs in POC v1. Its central idea, matching in embedding space and generating only when needed, *does*, through ordinary embedding models.

### 1.2 Embedding models + nearest neighbour or a small head

This is the natural way to hit the anticipation frontier fast: the frontier entries are prepared in advance and their embeddings computed once, so matching a sentence costs one encoder pass plus a few hundred dot products.

| Model | Size | Languages | Licence | Browser | Notes |
|---|---|---|---|---|---|
| EmbeddingGemma-300M (Sep 2025) | 300M; 768 dims, Matryoshka to 512/256/128 | 100+ | Gemma terms | yes: [onnx-community/embeddinggemma-300m-ONNX](https://huggingface.co/onnx-community/embeddinggemma-300m-ONNX), fp32/q8/q4 (**no fp16**) | 8th on MTEB multilingual v2, best under 500M ([paper](https://arxiv.org/html/2509.20354v3)); task prefixes (`task: … \| query: …`) |
| multilingual-e5-small | ~118M (estimate from the base model) | ~100 | MIT for the base model, from memory (not stated on the ONNX card, not re-checked) | yes: [Xenova/multilingual-e5-small](https://huggingface.co/Xenova/multilingual-e5-small) | the classic small multilingual baseline; `query:`/`passage:` prefixes |
| potion-multilingual-128M (Model2Vec) | static embeddings: a lookup table, no transformer pass | 101 | MIT | no JS port found | ~91 % of LaBSE quality, "orders of magnitude faster" ([card](https://huggingface.co/minishlab/potion-multilingual-128m)); file too large for an artifact (0.1B params in F32) |

Runtime: **transformers.js v4** (preview 9 Feb 2026, stable by March 2026 per release notes) has a new C++ WebGPU runtime built with the ONNX Runtime team and reports "~4× speedup for BERT-based embedding models"; it runs the same models in Node, Bun and Deno ([HF blog](https://huggingface.co/blog/transformersjs-v4), [releases](https://github.com/huggingface/transformers.js/releases)). **I found no published browser latency for EmbeddingGemma or e5-small**; we must measure. From model size alone, one short sentence through a 100 to 300M encoder should take tens of milliseconds on a desktop GPU and somewhat more on CPU. That is an expectation, not a measurement.

A small classifier head (logistic regression over embeddings, or a fine-tuned DeBERTa) beats zero-shot approaches once labels exist. The one independent benchmark of decision models found that a fine-tuned DeBERTa-v3-large was the most accurate on every labelled benchmark but one ([arXiv 2610.00346, 29 Sep 2026](https://arxiv.org/abs/2610.00346)). For us, labels come later, from journals; v1 uses nearest neighbour over a few paraphrase anchors per intent.

### 1.3 Zero-shot and schema-guided extractors

- **GLiNER2** (EMNLP 2025 demo): one encoder for entities, classification and nested structured extraction from a schema; 205M (base) and 340M (large); CPU-oriented; Python, pip ([paper](https://arxiv.org/abs/2507.18546v1), [card](https://huggingface.co/fastino/gliner2-large-v1)). **usable**, but there is no browser build and it is English-centred (not verified for French). For us it would fill slots ("the mark on *that pine*"). Our slots are mostly *things within reach of the station*, which form a short enumerated list, so a nearest-match over their names does the same job with the encoder we already load.
- **NuExtract 2.0** (2B MIT, 4B Qwen research licence, 8B MIT): a generative extractor driven by a JSON template ([2B card](https://huggingface.co/numind/NuExtract-2.0-2B)). It is a 2B generative model, so it falls in §3, not §1. Too heavy for the browser tier.

### 1.4 Decision models ("System One"): Jev and its followers

This is the category Toine means (§0), and it is new: all of it dates from September to October 2026.

| Model | Maker, date | What | Latency | Price | Weights |
|---|---|---|---|---|---|
| **Jev** 1.13 / 1.14 | TypeSafe AI, 15 Sep 2026; 1.14 on 14 Oct | state + typed questions → `noul` (probability true), `choice` (≤ 255 options, with probabilities), `score` (2 to 10 levels); `box` on images in 1.14 (experimental) | vendor: 70 to 500 ms end to end, most around 100 ms, measured from the US West Coast | $0.042 / M input tokens, output free | **none**, hosted only |
| **Clef**, **Clef-flash** | Cloudflare, 1 Oct 2026 | Jev-compatible API; frozen Qwen3.8-27B / Qwen3.5-9B + adapters + a schema head; one prefill pass, then all allowed options scored | vendor: median 209 ms (Clef), 39 ms (Clef-flash), Jev 524 ms on their test | $0.24 / $0.09 per M input on Workers AI | **Apache 2.0** on Hugging Face (needs a datacenter GPU for Clef) |
| **Laya** | Convai Innovations | open non-autoregressive decision encoder | ~33 ms per question on a T4 | — | Apache 2.0; base model weak zero-shot (0.36 vs 0.32 random) |
| OpenAI Decisions API | OpenAI, beta 6 Oct, GA 22 Oct 2026 | typed answers from `gpt-6-luna`, text and images, up to 400 questions | "10× faster than the Responses API" | not in the changelog | none |
| Mercury Decide, Liquid D1.2 | Inception, Liquid | decision endpoints listed by OpenRouter | not verified | not verified | not verified |

Sources: Jev on Cloudflare ([docs](https://developers.cloudflare.com/ai/models/typesafe/jev/)); InfoQ ([Oct 2026](https://infoq.com/news/2026/10/typesafe-ai-jev-released)); deep dive with limits, jaggedness and SDKs ([flaviocopes](https://flaviocopes.com/jev.md)); Clef ([Cloudflare blog, 1 Oct 2026](https://blog.cloudflare.com/clef-decision-models/), [flaviocopes on Clef](https://flaviocopes.com/clef/)); Laya ([dev.to, secondary](https://dev.to/techaiwire/layas-typed-decisions-explained-2h7g)); OpenAI ([changelog](https://developers.openai.com/changelog/)); one key for all of them ([OpenRouter Decisions guide](https://openrouter.ai/docs/guides/features/decisions.md), endpoint `POST /api/alpha/decisions`, alpha).

**Measured, not pitched.**

- OpenRouter's small benchmark (19 Sep 2026, 60 tickets): Jev 1.13 reached 98.3 % intent accuracy at p50 0.19 s / p95 0.63 s for $0.025 per thousand. Claude Opus scored 100 % at p50 1.96 s for $2.88 per thousand ([OpenRouter](https://openrouter.ai/blog/tutorials/jev-vs-llm-when-to-use-each/)).
- The independent paper ([arXiv 2610.00346](https://arxiv.org/abs/2610.00346)) is sobering. Swapping the order of yes and no **flips 50.5 answers per hundred for Jev** (at most 6.5 for fine-tuned open decision checkpoints). An in-scope threshold still accepts 31 % of out-of-scope requests. A cascade of a trained first stage and an escalation to a generative model reaches the generative model's accuracy at Jev's price.
- TypeSafe's own "jaggedness" list: Jev reads questions literally; it is unreliable at arithmetic, counting and dates; score levels are weakly calibrated; its accuracy falls with bloated or indirect state; text inside the state can steer answers; it cannot generate text ([flaviocopes](https://flaviocopes.com/jev.md)).
- Access: TypeSafe paused new sign-ups on 22 Sep 2026. The SDK refuses to run in a browser because the key would be exposed. Vercel AI Gateway and OpenRouter are alternative routes (same source).

**Fit for us.** Unusually good on paper, because PDL is a *closed* vocabulary: everything the translation tier must decide is enumerable.

- Which intent? A `choice` over the station's intents.
- Which frontier entry? A `choice` over at most 255 prepared entries, plus "none".
- Which thing? A `choice` over the things within reach.
- Is it admissible? A `noul`.

All of these go in one request, as parallel questions, with calibrated probabilities to threshold. What Jev cannot do is write Sam's line, invent a new thing, or emit numbers reliably. Those stay with generative tiers or code. Its risks are the label-order sensitivity, the transatlantic round trip (it is measured from the US West Coast and we are in France), a hosted-only key, and French quality (not verified; 1.14 announces multilingual gains). **It is a strong v2 candidate for the middle of the translation cascade, and the way to give Toine the "AI way of structuring" he asks for. It is not the v1 first stage**, because local embeddings are free, faster, run without a network, and give the same kind of answer (a nearest candidate with a score).

---

## 2. Constrained decoding: small LLMs that can only emit valid PDL

- **Claude structured outputs** (`output_config.format` with a JSON schema, and `strict: true` on tools) is stable on all current models including Haiku 5.5. The grammar is compiled on the first use of a schema and **cached for 24 h**: the first call is slower, so warm it. Changing `output_config.format` **invalidates the prompt cache** for the thread. Not supported: recursive schemas, `oneOf`, numeric `minimum`/`maximum`, string lengths, array bounds beyond `minItems` 0/1 ([docs](https://platform.claude.com/docs/en/build-with-claude/structured-outputs)). Consequence: the PDL JSON schema handed to models must be flat (no recursion), and **bounds stay in our validator**, which is the design anyway (`docs/architecture.md`, validator).
- **Browser / local:** WebLLM uses XGrammar (JSON Schema and EBNF), compiled to WebAssembly, with "close to zero overhead" reported in its paper ([XGrammar](https://arxiv.org/pdf/2411.15100), [WebLLM](https://arxiv.org/html/2412.15803v1)). llama.cpp offers GBNF grammars and llguidance (about 50 µs per token mask) ([llama.cpp docs mirror](https://sources.debian.org/src/llama.cpp/8461%2Bdfsg-1/docs/llguidance.md)). Chrome's built-in **Prompt API** takes a JSON Schema as `responseConstraint` ([Chrome docs](https://developer.chrome.com/docs/ai/structured-output-for-prompt-api)). It is stable on the web from Chrome 148, with French input and output from Chrome 149, but needs more than 4 GB of VRAM (or 16 GB RAM on CPU) and 22 GB free disk ([status](https://developer.chrome.com/docs/ai/built-in-apis), [requirements](https://developer.chrome.com/docs/ai/get-started); those pages were last updated in 2025, so the versions should be checked).
- **Hosted fast models:** Groq's strict mode exists only on selected models, and structured outputs there do not support streaming or tools ([Groq docs](https://console.groq.com/docs/structured-outputs)). Cerebras has strict structured outputs on some models ([changelog](https://inference-docs.cerebras.ai/support/change-log)).

A compact token form of PDL (`docs/pdl-spec.md`, being written in the `poc-core` lot) can be enforced with an EBNF grammar locally. Hosted Claude only takes JSON Schema, so **the JSON form is what hosted models emit**, and the compact form is for display or for local grammar-constrained models.

---

## 3. Small and fast generative models

| Model | Size | Where | Structured output | Notes |
|---|---|---|---|---|
| **FunctionGemma** (late 2025; InfoQ coverage Jan 2026) | 270M | browser via transformers.js (Google demo), phones via LiteRT | function calls | meant to be **fine-tuned**: 58 % → 85 % on Google's task after fine-tuning; on a phone CPU, 0.3 s to first token and ~126 tok/s ([model card](https://gemma.ai/models/functiongemma/model-card/), [blog](https://blog.google/technology/developers/functiongemma/)); English-evaluated |
| Gemini Nano (Chrome Prompt API) | — | desktop Chrome, local | `responseConstraint` JSON Schema | see §2; hardware gate; not every player's machine qualifies |
| WebLLM models (SmolLM2, Qwen, Llama…) | 0.1 to 8B | browser, WebGPU | XGrammar | heavy first download; quality at 1B is weak for character lines |
| **Claude Haiku 5.5** (7 Oct 2026) | — | API | structured outputs, strict tools | §4; thinking can be turned **off** |
| **Mercury 2 / 2.5 / 3** (Inception, diffusion LLM) | — | API (OpenAI-compatible) | JSON schema (documented on Mercury 3), tools | `reasoning_effort` includes `instant` ([docs](https://docs.inceptionlabs.ai/capabilities/reasoning-efforts.md), [structured outputs](https://docs.inceptionlabs.ai/capabilities/structured-outputs.md)); "over 1,000 tok/s" is a vendor claim; Artificial Analysis measured **2.2 to 7 s** to the first answer token on Mercury 2/2.5 with default reasoning ([AA, Mercury 2.5](https://artificialanalysis.ai/models/mercury-2-5/providers), [AA, Mercury 2](https://artificialanalysis.ai/models/mercury-2)); a DataCamp test of Mercury 3 measured 2.9 s median end to end at low effort ([DataCamp](https://www.datacamp.com/tutorial/mercury-3)); OpenRouter listed Mercury 2 as going away on 8 Nov 2026 ([OpenRouter](https://openrouter.ai/inception/mercury-2)) |
| **DiffusionGemma** (10 Jun 2026) | 26B MoE, ~3.8B active | local GPU (18 GB VRAM quantized), Apache 2.0 | not documented | "up to 4× faster" on one GPU, 700+ tok/s on an RTX 5090; lower quality than Gemma 4; little gain on Apple Silicon ([Google blog](https://blog.google/innovation-and-ai/technology/developers-tools/diffusion-gemma-faster-text-generation/)) |
| Gemini Diffusion | — | waitlisted demo since May 2025 | — | not usable ([DeepMind](https://deepmind.google/models/gemini-diffusion/)) |

**Diffusion LLMs in one sentence:** they generate fast *once they start*, but to us, at 0.2 to 0.8 s, what matters is time to the first useful token and the network round trip, and the measured figures do not show them beating a fast autoregressive model with thinking off. They are worth one comparison run in v2, not a place in v1.

---

## 4. The larger tiers: current Claude models (official docs, read 20 Nov 2026)

From the [models overview](https://platform.claude.com/docs/en/about-claude/models/overview):

| Model | ID | $/M in / out | Latency class | Thinking | Default effort |
|---|---|---|---|---|---|
| Claude Haiku 5.5 | `claude-haiku-5-5` | 0.10 / 0.50 (prompts ≤ 100k; 0.50 / 2.50 above) | fastest | adaptive; **can be disabled** at low/medium/high effort | medium |
| Claude Sonnet 5.5 | `claude-sonnet-5-5` | 2 / 10 | fast | adaptive (`disabled` not accepted; `between_tools` accepted) | high |
| Claude Opus 5.5 | `claude-opus-5-5` | 4 / 20 | moderate | adaptive, always on | medium |
| Claude Fable 5.2 | `claude-fable-5-2` | 8 / 40 | moderate | adaptive, always on | high |

All have a 1M context window and 128K max output, and all support structured outputs and tool use.

Features that matter to us:

- **Structured outputs / strict tool use** to emit PDL (§2).
- **Streaming**, so a staging reaction can begin executing before it is finished (PDL property 3, "partial and incremental").
- **Prompt caching** for the long character and pack context: a minimum of **512 tokens** on the 5.x models; a 5 min TTL (writes at 1.25×) or 1 h (writes at 2×); reads at 0.1× of input (0.05× on Opus 5.5 and Sonnet 5.5); automatic caching with one top-level `cache_control`; pre-warming with `max_tokens: 0` ([prompt caching](https://platform.claude.com/docs/en/build-with-claude/prompt-caching)). Pitfalls: changing `effort` or the `output_config.format` between requests invalidates the cache, and fast and standard speeds do not share caches. **One fixed schema and one fixed effort per tier.**
- **Effort** is the main speed control. Haiku 5.5 at `low` is "the cheapest and fastest", and thinking can be turned off with `thinking: {"type": "disabled"}` ([prompting Haiku 5.5](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-haiku-5-5)). Artificial Analysis measures Haiku 5.5 at ~217 tok/s and **6.0 s to the first answer token at low effort with thinking on** (9.2 s at medium) ([AA](https://artificialanalysis.ai/models/claude-haiku-5-5)). It does not measure thinking off. So **the translation fallback must run with thinking disabled**, and its latency must be measured by us.
- **Fast mode** (`speed: "fast"`): up to 2.5× output tok/s on Opus 5.5 and Fable 5.2 at 2× price. It does not improve time to first token ([fast mode](https://platform.claude.com/docs/en/build-with-claude/fast-mode)). Of marginal use for staging.
- **Batch API**: 50 % off, "most batches finish in less than 1 hour" ([batch](https://platform.claude.com/docs/en/build-with-claude/batch-processing)). It suits the pack **compiler** and the post-session **audit**, not the live frontier.
- **Refusals**: Haiku 5.5 runs safety classifiers and can return `stop_reason: "refusal"` with no server-side fallback ([same Haiku page](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/prompting-claude-haiku-5-5)). A missing-brother story with a dark turn could trip `general_harms`. The adapter must treat a refusal like a miss and fall back to the fallback line bank.

Other providers are not needed for v1. A decision-model key (OpenRouter or Vercel AI Gateway) is the only non-Claude account worth opening, for experiment 2.

---

## 5. How the page reaches models

### 5.1 As a claude.ai artifact (`sample` capability, runtime contract 0.2.96)

Read from the platform's type definitions (`sample.d.ts`, shipped with the artifact-capabilities skill). Our page already uses it: `src/main.js`, `src/meneur.js`, `src/constructeur.js`.

- **More choice than `docs/poc-principes.md` §5.2 assumed.** `modelTier: "quick" | "default" | "complex"`, an optional named `model` (Claude API id; it silently falls back to the tier if unavailable) and `effort: low | medium | high`.
- Timing per the contract: `quick` does not think and answers a short prompt "in a second or two". `default`/`complex` think first: **first text usually 5 to 60 s**.
- **No system prompt and no schema-constrained output.** `sample.json` parses tolerantly and rejects `invalid_json`. Nor is there any way to set prompt caching (only a 5 min answer replay for identical inputs). Page functions can be offered as `tools` (about a second per round on `quick`).
- **Shared limits.** "A couple of calls run at once for a viewer"; a flood is rejected with `rate_limited`. The background tier would compete with the foreground for those slots. Each call spends the viewer's own usage and the first call asks consent.
- **The page's network is blocked** except for the CDN script hosts. Jev or any external API is unreachable, and fetching embedding weights from Hugging Face would very likely fail (not tested). Bundling an encoder as artifact files is bounded at 15 MB per binary file and 16 MB for the page: multilingual-e5-small or EmbeddingGemma at int8 are an order of magnitude too large. Only a lexical matcher, or a much smaller model, fits.

**What can honestly be measured there:** the architecture (PDL only, journal, replay), the frontier hit rate with a lexical matcher, and the *share* of requests answered without a generative call. Tier latencies cannot be measured there: they include consent, the platform's queue, its framing and its tier substitutions.

### 5.2 Outside the artifact: a small local proxy holding the keys

A Node process on `localhost`, started by `npm run proxy`, that:

1. forwards `generate` calls to the Claude Messages API with `output_config.format`, `cache_control`, `effort`, `thinking` and streaming (SSE relayed to the page);
2. optionally forwards `decide` calls to a decision endpoint (OpenRouter `/api/alpha/decisions` or TypeSafe);
3. can run the embedding model itself in Node with transformers.js. The page runs it in the browser by default; the Node copy serves the bench, which `docs/sdlc.md` asks to run without a browser.

**What can honestly be measured there:** real per-tier latency (queue, TTFT, total) from a French desktop, cache hit rates, schema-valid rate, cost per session.

### 5.3 Adapter shape

One port, three operations, three implementations, all journaled:

```
ModelPort {
  embed(texts, {model})                         -> { vectors, timings }
  decide({state, questions, tier})              -> { answers: {key: {type, value, p, confidence}}, timings, model }
  generate({tier, schemaId, parts, stream?, deadlineMs}) -> { json | text, timings, model, usage, stop }
}
implementations: cannedPort (tests, replay)   artifactPort (sample)   proxyPort (localhost)
```

- `parts` are ordered prompt blocks marked `stable` (character, pack, vocabulary: cacheable) or `volatile` (the last seconds). `proxyPort` turns them into a system prompt with `cache_control`. `artifactPort` concatenates them into a leading user turn, because `sample` has no system role.
- `schemaId` names a fixed JSON schema per tier. `proxyPort` sends it as `output_config.format`; `artifactPort` appends it in prose and uses `sample.json`. **Either way the PDL validator has the last word.**
- `decide` in `artifactPort` is emulated with `generate` on `quick` (or absent). In `proxyPort` it calls a decision endpoint when configured, else emulates with Haiku.
- Every call writes `{tier, port, model, timings: {queued, ttft, total}, cache: {read, write}, usage, status}` to the journal (`docs/sdlc.md` §6). A `cannedPort` replays journaled outputs, so replay never calls a model.

---

## 6. Proposal: a translation tier that is not generative in the common case

```
player sentence (text, after dictation)
  │
  ├─ reflex (code, <5 ms): exact/alias match on the closed vocabulary ("stop", "look left")
  │
  ├─ 1. embed the sentence once (local encoder, page-side; target < 50 ms)
  ├─ 2. nearest match against
  │      (a) intent anchors: 3–8 paraphrases per PDL intent (FR + EN), embedded at pack build
  │      (b) frontier anchors: each prepared frontier entry carries 2–5 paraphrases written by
  │          the background tier; embedded when the entry is added
  │      (c) slots: names/descriptions of the things within reach of the station
  ├─ 3. decide by margin:   s1 = best score, m = s1 − s2 (second-best of a different entry)
  │      frontier hit   if s1 ≥ θ_hit and m ≥ μ   → execute the prepared PDL (+ its pre-written line)
  │      intent hit     if intent s1 ≥ θ_int        → emit intent tx; staging writes the reaction
  │      weak           otherwise                   → fallback
  └─ 4. fallback: Haiku 5.5, thinking off, effort low, structured output = PDL intent schema
         (+ one short line for Sam), deadline 1.5 s; on timeout/refusal → fallback line bank
         and hand to staging.
  (v2: a decision model between 3 and 4, for the medium-confidence band)
```

Two cases always take the fallback: `commit` intents (a conditional request, `docs/architecture.md`), whose condition and behaviour must be extracted in the player's words, and anything the validator rejects after a match. This keeps P7 (`docs/principles.md`): the fast path only *selects* what deeper tiers prepared, it never improvises.

The character line in the common case comes **from the frontier entry** (pre-written by the background tier) or from the pack's fallback lines, so no generation happens on the hot path. Admissibility (hard part) is the validator's job, in code; the soft part ("would Sam agree?") is carried by the prepared entry or by staging.

**What must be measured to validate it.**

1. **Hit rate**: the share of player sentences served by (a) the frontier, (b) an intent match, (c) the fallback. This is the pillar-5 number.
2. **Error cost**, which is asymmetric:
   - a *false accept* executes the wrong prepared reaction. That is visible and costly, though Sam's character can absorb a near miss ("you mean the blue mark?");
   - a *false reject* costs only the fallback's latency.
   
   So report a **risk-coverage curve** (error rate among accepted versus share accepted) and pick θ for a false-accept rate of at most ~3 % on in-scope sentences. Measure separately the **out-of-scope false accept rate**: sentences that match nothing prepared must not be grabbed. The decision-model paper found 31 % with a naive in-scope threshold ([arXiv 2610.00346](https://arxiv.org/abs/2610.00346)), so the margin test `m ≥ μ` and a "none" anchor set are needed.
3. **Latency**: p50/p95 for embed+match (target < 50 ms on desktop), fallback TTFT and total (target < 0.8 s, to be checked), and end to end from the end of speech to the first visible reaction (`docs/poc-principes.md` §4.1 target: < 0.5 s).
4. **Language**: the same numbers for French and English sentences, and for mixed ones.

## 7. Experiments worth running first (one day each)

**E1: intent and frontier matching, offline, no browser.**
- Write about 150 player sentences for two stations of « Louis's Round »: half French, half English, a third deliberately out of scope. Label each with its gold answer: a frontier entry, an intent + slot, or none.
- Write 10 frontier entries per station with 3 paraphrases each, and 5 anchors per intent.
- In Node with transformers.js, compare: BM25 lexical (no model), multilingual-e5-small, and EmbeddingGemma-300M at q8.
- Output: top-1 accuracy, risk-coverage curves, out-of-scope false accepts, the θ and μ chosen, and p50/p95 latency on CPU.
- About 300 lines of tooling under `tools/`, no model key needed.
- *Decides:* whether embedding beats lexical enough to justify loading a model, which encoder to use, and the thresholds.

**E2: the fallback and a decision model, against the same set.**
- Through the local proxy, run the sentences E1 left in the "weak" band through:
  - (a) Haiku 5.5 with thinking off and effort low, structured output = PDL intent schema;
  - (b) if a key can be had, Jev 1.14 via OpenRouter as one `choice` over the frontier + intents + "none", plus a `noul` for admissibility. Swap the option order once, to measure the order sensitivity.
- Measure TTFT, total time, schema-valid rate (should be 100 % for Haiku), accuracy and cost.
- *Decides:* whether the fallback fits 0.8 s from France, and whether a decision model earns a place in v2's cascade.
