# 0005. Language policy

- Status: accepted
- Date: 2026-11-20

## Context
The existing code, data keys and docs are mostly French (`CLAUDE.md`: field keys in French without accents). The POC must be readable by contributors and by models, while the experience is in the player's language (`docs/architecture.md`, "Language policy"; `docs/scope.md`, Languages row).

## Decision
Backend, code, data keys, logs, journals and tool UI are in English. What a character says is in the story's language, shown as subtitles. A player setting can force everything into one language. In v1: French and English speech with subtitles. Existing engine code stays in French until touched; anything new is English. Source docs for the POC (`docs/architecture.md`, `docs/scope.md`, `docs/sdlc.md`, ADRs, specs) are English; legacy French docs are kept as they are.

## Consequences
- New modules (`core/`, `stories/`, `patterns/`) use English keys; adapters translate between English POC keys and French engine keys.
- Line banks exist per language (`lines/<lang>.json`).
- A mixed-language repository for a while; touching a French file is the moment to translate it.
- CLAUDE.md and the French docs are not rewritten as part of this decision.

## Open questions
- Which override values the player setting offers beyond fr and en: open (more languages are v2).
- Whether to translate existing French keys in bulk or only when touched: open, current rule is when touched.
