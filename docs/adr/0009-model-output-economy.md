# 0009. Output economy: choose before you write, write compact before you write long

Status: **proposed** (20 November 2026). To be confirmed or corrected by the bench of M3. Nothing here is measured yet.

## Context

A model reads fast and writes slowly: its input is processed in one pass and can be cached, its output is produced one token at a time. In our loops the output is therefore what the player waits for. Toine's intuition (20 Nov): neither prose nor JSON is the most efficient thing to make a model produce for a procedural, non-deterministic narration; we need a denser semantic form to formalise events, and it should differ with the size of the model.

The core already gives PDL three faces: the **source** (text with strengths, for people), the **canonical** form (what the validator and the journal hold) and the **token** form (compact, exact round trip; `docs/pdl-spec.md` §10).

## Decision

**1. Three output regimes, one per clock.**

| Clock | The model… | Output | Why |
|---|---|---|---|
| now | **chooses** | the id of a prepared option (a frontier entry, a line of the bank, an intent class) and at most three typed slots; with a decision model, no generated text at all | choosing costs a token or a score; writing costs a sentence |
| scene | **writes compact** | PDL token form: one transaction per line, closed vocabulary, positional arguments, defaults left out, references by id | a few dozen tokens instead of a few hundred |
| story | **writes long** | PDL source, readable and reviewable by a person; frontier entries for the now loop | slow time is cheap; what it writes is compiled once by code |

The large model's real job is to turn tomorrow's writing into today's choosing: every frontier entry it prepares is a sentence the now loop will not have to write.

**2. Rules of the compact form.**
- The model writes only what code cannot know: no envelope, no ids, no timestamps, no default values.
- Its words are short, ordinary and stable (each one token for common tokenizers). Rare glyphs cost more tokens and more errors: the glyph display of the demo is a rendering for people, never what a model is asked to produce.
- Things already defined (lines, things, patterns, stations) are named, not restated.
- The first line is what the character does first. Lines are validated and executed as they arrive, so the reaction starts before the answer is complete.
- The parser is tolerant and the validator repairs (P8): a form the models were not trained on will be written imperfectly.

**3. The input pays for the output.** The vocabulary, the principles in scope and the examples sit in a stable prefix of the prompt, which can be cached; only what changed since the last call follows it.

**4. Creator mode.** The assistant produces changes to source lines, never whole files; compiling, merging layers and checking are code.

**5. The format is an adapter's choice, per model (P21), not a creed.** Some models are faster and more reliable with a schema-constrained JSON output than with any custom form. The port carries canonical transactions; each model adapter picks the wire form that measures best for its model.

## How it will be judged (M3)

On the same 60 requests of the bench, per tier and per model: output tokens, share of valid transactions before repair, time to the first executable line, total latency, for three wire forms (JSON with a schema, PDL token form, selection among prepared options). The table goes in `docs/milestones.md`. If the compact form does not win clearly for a model, that model keeps JSON.

## Consequences

- "Select" becomes a first-class answer of the now loop: frontier entries need stable ids and paraphrase anchors (already a contract change planned before M4).
- `generate` must be able to stream lines: a change of the model port, to be specified with M3.
- The share of requests served by choosing rather than writing becomes one of the POC's measurements.
