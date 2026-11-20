# 0008. The home node: models reached through Toine's desktop

Status: **proposed** (20 November 2026). Becomes accepted once the open points at the end are answered.

## Context

- No paid account is added for the POC: "we make do with what we have" (Toine, 20 Nov). No OpenRouter, no hosted decision model.
- Toine has a desktop at home that can stay on, and is ready to expose it with ngrok or similar. He plays from his phone or his laptop, anywhere.
- A page published as a claude.ai artifact cannot reach it: its network is closed. The artifact stays the showcase, on the host's single model (ADR 0004). The home node serves the page hosted on GitHub Pages (or opened locally).
- Keys never go in the repository or in the page (`docs/sdlc.md` §7).

## Decision

One small server, `tools/home-node.mjs`, runs on the desktop and implements the **model port** of the core (`embed`, `decide`, `generate`) over HTTPS, behind a tunnel with a stable address.

**Routes.** `GET /health` · `POST /v1/embed` · `POST /v1/decide` · `POST /v1/generate`. Bodies are the port's arguments as JSON; answers are the port's results plus `{ backend, model, latency_ms }`.

**`/health` is the detection.** It answers in a few milliseconds, without calling a model:

```json
{ "ok": true, "node": "toine-desktop", "version": 1,
  "capabilities": { "embed": {"model": "…", "warm": true},
                    "decide": {"model": "…", "warm": true, "p50_ms": 60},
                    "generate": {"fast": null, "mid": null, "large": null} } }
```

**How the page knows the node is up, from any device.**

1. The node's address and its access token are entered once per device (typed, or opened from a link the node prints at start-up; the pair lives in that browser's storage only, never in the repo).
2. On load, the page calls `/health` with a 1.5 s limit. Then every 30 s while it is in use, and again at once after any failed call.
3. The page keeps a per-capability state (`embed`, `decide`, each generative tier) and resolves every model call through the fallback chain of `docs/architecture.md`: home node, else the host's model when there is one, else the code heuristic. A node that goes down mid-session degrades the next call; it never blocks (P20).
4. A small indicator shows what is serving each tier right now, and every model call in the journal records it. A session played without the node is therefore visible as such afterwards.

**Access.** A bearer token checked on every route but `/health`'s `ok` field; CORS limited to the page's origin; a request-rate cap. The token gives access to Toine's machine and quota: it is his alone and is never committed.

**Backends are configuration** (`home-node.config.json`, not committed): for each capability, which local runtime or which provider answers. The server is the same whether a tier is served by a local open-weights model or by a provider's API with a key kept on the desktop.

**The decision model on the node** is our own, built from open parts, in the manner of Cloudflare's Clef: a local open-weights model does one pass over the state and the question, then each allowed option is scored and the scores are normalised into probabilities. Translation of the player's words tries the embeddings first (nearest match against the intent anchors and the frontier), and falls back on this.

## Consequences

- The core does not change: the home node is one more adapter of the model port (P21).
- Real tier latencies become measurable (M3), which the artifact cannot do.
- When the desktop is off, the game still runs, on fallbacks, and says so.
- A tunnel's free plan sets the address. The choice of tunnel is deferred to set-up; the page only needs a stable HTTPS address.

## Open points (for Toine)

1. **What the desktop is**: operating system, graphics card and its memory, RAM. This decides which open-weights model can serve `decide` under 300 ms, and whether a local generative model for the fast tier is realistic.
2. **What "what we have" covers for the generative tiers** outside the artifact: an Anthropic API key, a Google AI Studio key, only the Claude subscription, or nothing. With nothing, the mid and large tiers exist only inside the artifact, and the home node serves `embed` and `decide` alone.
3. **The tunnel**: a stable address needs a free account with one provider (ngrok, Tailscale, or Cloudflare with a domain). Which one he already has.
