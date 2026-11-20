/* The trailer mode (briefs/trailer.md): a real session of a story, driven through the real input port, the real core and
   the real executor, with captions on top that explain the project's principles. Nothing is staged (P19): the script
   (stories/<id>/trailer.json) only says what the player says, how much world time passes, where the player looks and
   which caption shows; everything the read-outs show comes from the session's journal (story.on).
   - loadTrailer(json): the script loader and validator (pure).
   - createReadout({ patterns }): journal entries → read-out signals (pure): clock pulses, live decisions (model or reflex
     code, said honestly), authors' rules and absolutes that fired with their own text, promise statuses, patterns.
   - createTrailer(T): the player in the page (DOM), wired by src/main.js.
   No import: the build embeds it as TRAILER. English in code, keys and logs. */

export const STEP_KINDS = ['prompt', 'say', 'time', 'camera', 'caption', 'tag', 'show', 'end'];
export const PANELS = ['strip', 'tally', 'promises'];
export const CLOCKS = ['now', 'scene', 'story'];
const CAMERA = ['look', 'around', 'hold'];
const num = (x, lo, hi) => typeof x === 'number' && isFinite(x) && x >= lo && x <= hi;
const textMap = x => x && typeof x === 'object' && typeof x.en === 'string' && Object.values(x).every(v => typeof v === 'string');

/* The script: { story, seed?, transitions: 'cut'|'walk', pace?, labels: {en,fr}, patterns: {id: {en,fr}}, steps: [...] }.
   A step has exactly one kind key, and `hold` (seconds after it starts, before the next step; times the pace):
     { prompt: {en, fr}, note?: {en, fr} }     the sentence a story is prompted from, typed over black (not sent to the
                                               story: it is the idea the pack was written from; `note` says so)
     { say: {en, fr} }                         the player's words, typed then sent through the input port
     { time: seconds, speed: 1..16 }           world time passes, `speed` times faster than real time (the ×N mark shows)
     { camera: 'look', at: thingId } | { camera: 'look', yaw: degrees } | { camera: 'around' } | { camera: 'hold' }
                                               where the player looks, for the step's hold (then the look stays where it is);
                                               yaw is relative to where she faces, negative to the left; keep: true holds
                                               the wish over the next steps, until the next camera step
     { caption: { kicker?: {en,fr}, text: {en,fr}, text_reflex?: {en,fr}, style?: 'title' } }   `*word*` is highlighted;
                                               text_reflex replaces text while no model has decided anything yet
     { tag: {en, fr}, text?: {en, fr} }        one word naming what is seen or heard now (IMAGES, SOUNDS…), a few seconds
     { show: ['strip'|'tally'|'promises'] }    reveals live read-outs (they stay)
     { end: true }                             the end card
   → { script, errors: [{ step, why }] } ; script.steps are normalized { kind, hold, ... }. */
export function loadTrailer(json) {
  const errors = [], src = json && typeof json === 'object' ? json : {}, steps = [];
  if (typeof src.story !== 'string' || !src.story) errors.push({ step: null, why: 'no story id' });
  if (src.transitions !== undefined && !['cut', 'walk'].includes(src.transitions)) errors.push({ step: null, why: 'transitions must be cut or walk' });
  if (src.pace !== undefined && !num(src.pace, 0.25, 4)) errors.push({ step: null, why: 'pace must be within 0.25..4' });
  (Array.isArray(src.steps) ? src.steps : []).forEach((s0, i) => {
    const s = s0 && typeof s0 === 'object' ? s0 : {}, kinds = STEP_KINDS.filter(k => k in s);
    const bad = why => errors.push({ step: i, why });
    if (kinds.length !== 1) return bad('a step needs exactly one of ' + STEP_KINDS.join(', '));
    const kind = kinds[0], hold = s.hold === undefined ? (kind === 'caption' || kind === 'show' || kind === 'tag' ? 0 : kind === 'time' ? null : 2) : s.hold;
    if (hold !== null && !num(hold, 0, 60)) return bad('hold must be within 0..60 s');
    const out = { kind, hold };
    if (kind === 'say') { if (!textMap(s.say) || !s.say.en.trim()) return bad('say needs { en, fr? } text'); out.text = s.say; }
    else if (kind === 'prompt') {
      if (!textMap(s.prompt) || !s.prompt.en.trim()) return bad('prompt needs { en, fr? } text');
      if (s.note !== undefined && !textMap(s.note)) return bad('prompt note must be { en, fr? }');
      out.text = s.prompt; out.note = s.note || null;
    } else if (kind === 'tag') {
      if (!textMap(s.tag)) return bad('tag needs { en, fr? }');
      if (s.text !== undefined && !textMap(s.text)) return bad('tag text must be { en, fr? }');
      out.tag = s.tag; out.text = s.text || null;
    }
    else if (kind === 'time') {
      if (!num(s.time, 0.5, 600)) return bad('time must be within 0.5..600 world seconds');
      const speed = s.speed === undefined ? 1 : s.speed;
      if (!num(speed, 1, 16)) return bad('speed must be within 1..16');
      out.seconds = s.time; out.speed = speed; if (out.hold === null) out.hold = s.time / speed;
    } else if (kind === 'camera') {
      if (!CAMERA.includes(s.camera)) return bad('camera must be ' + CAMERA.join(', '));
      if (s.camera === 'look' && (typeof s.at !== 'string' || !s.at) && !num(s.yaw, -180, 180)) return bad('camera look needs at: a thing id, or yaw: degrees');
      out.camera = s.camera; if (s.at) out.at = s.at; else if (s.camera === 'look') out.yaw = s.yaw;
      if (s.keep) out.keep = true;
    } else if (kind === 'caption') {
      const c = s.caption || {};
      if (!textMap(c.text)) return bad('caption needs text { en, fr? }');
      if (c.kicker !== undefined && !textMap(c.kicker)) return bad('caption kicker must be { en, fr? }');
      if (c.text_reflex !== undefined && !textMap(c.text_reflex)) return bad('caption text_reflex must be { en, fr? }');
      out.caption = { kicker: c.kicker || null, text: c.text, text_reflex: c.text_reflex || null, style: c.style === 'title' ? 'title' : 'line' };
    } else if (kind === 'show') {
      const p = [].concat(s.show);
      if (!p.length || p.some(x => !PANELS.includes(x))) return bad('show takes ' + PANELS.join(', '));
      out.panels = p;
    } else if (kind === 'end') out.hold = 0;
    steps.push(out);
  });
  if (!steps.length) errors.push({ step: null, why: 'no steps' });
  const script = { story: src.story, seed: src.seed, transitions: src.transitions || 'cut', pace: src.pace || 1, labels: src.labels || {}, patterns: src.patterns || {}, steps };
  return { script, errors };
}
/* How long the script runs, in real seconds, at a pace. */
export const scriptSeconds = (script, pace = 1) => script.steps.reduce((a, s) => a + s.hold * (s.kind === 'time' ? 1 : pace), 0);
/* A text of the play language (else English). `*x*` marks become highlights in the page. */
export const pick = (m, lang) => !m ? '' : m[lang] || m.en || '';

/* Journal entries → signals for the read-outs. Only what is journaled is shown:
   { kind: 'pulse', clock }                          a transaction (or a rule firing) of that clock
   { kind: 'decision', by: 'model'|'reflex', tier, label }   a decision taken live (a model call that answered)
   { kind: 'rule', id, by: 'author'|'player', author, text, pattern, clock }   a written rule that fired
   { kind: 'absolute', id, text }                    an absolute (`!!`) held: the validator rejected a transaction for it
   { kind: 'promise', id, status, text }             a commitment's real status (accepted, amended, refused, due, kept, broken)
   `patterns` maps a pattern id to its display names ({ en, fr }); the pattern of a rule comes from its source file. */
export function createReadout({ patterns = {} } = {}) {
  const S = { principles: {}, rules: {}, promises: {}, decisions: { model: 0, reflex: 0 }, fired: 0, absolutes: 0, models: [] };
  const patternOf = rec => {
    if (!rec || rec.doc_kind !== 'pattern-instance' || !rec.source || !rec.source.file) return null;
    const id = String(rec.source.file).replace(/^.*\//, '').replace(/\.pdl$/, '');
    return { id, name: patterns[id] || { en: id.replace(/-/g, ' ') } };
  };
  const promise = (id, status, text) => {
    const p = S.promises[id] = S.promises[id] || { id, status: null, text: '' };
    if (text) p.text = text; if (status) p.status = status;
    return { kind: 'promise', id, status: p.status, text: p.text };
  };
  function feed(e) {
    const out = [];
    if (!e || typeof e !== 'object') return out;
    if (e.type === 'session') { S.rules = {}; S.promises = {}; S.decisions = { model: 0, reflex: 0 }; S.fired = 0; S.absolutes = 0; S.models = []; return out; }
    if (e.type === 'principles') { for (const r of e.records || []) if (r && r.id) S.principles[r.id] = r; return out; }
    if (e.type === 'model_call') {
      if (e.status !== 'done' && e.status !== 'landed') return out;          // pending or failed: not a decision (yet)
      const reflex = e.tier === 'reflex' || e.adapter === 'reflex', by = reflex ? 'reflex' : 'model';
      S.decisions[by]++;
      const name = e.model || e.adapter || null;
      if (!reflex && name && !S.models.includes(name)) S.models.push(name);
      out.push({ kind: 'decision', by, tier: e.tier || null, instrument: e.instrument || null,
        label: reflex ? 'reflex (code)' : 'model' + (e.instrument ? ' · ' + e.instrument : e.tier ? ' · ' + e.tier : '') + (name ? ' · ' + name : '') });
      out.push({ kind: 'pulse', clock: CLOCKS.includes(e.loop) ? e.loop : 'now' });
      return out;
    }
    if (e.type === 'tx') {
      const b = e.body || {};
      if (e.kind === 'rule' && b.id && e.status !== 'rejected') S.rules[b.id] = { horizon: e.horizon, author: e.author || {}, commit: b.commit || null };
      if (e.status === 'rejected') for (const r of e.reasons || []) {
        const p = r && r.why === 'constraint' && S.principles[r.value];
        if (r && r.why === 'constraint') { S.absolutes++; out.push({ kind: 'absolute', id: r.value, text: p ? p.text : r.value }); }
      }
      if (e.status !== 'rejected' && b.commit && b.commit.id) out.push(promise(b.commit.id, b.commit.status, e.kind === 'fact' && b.predicate === 'promised' ? String(b.value || '').replace(/^refused: /, '') : ''));
      if (CLOCKS.includes(e.horizon)) out.push({ kind: 'pulse', clock: e.horizon });
      return out;
    }
    if (e.type === 'event' && e.event === 'commitment.due' && e.data && e.data.commit) { out.push(promise(e.data.commit, 'due')); return out; }
    if (e.type === 'rule' && e.status === 'fired') {
      const reg = S.rules[e.rule] || {}, rec = S.principles[e.rule], a = e.author || reg.author || {};
      const player = a.kind === 'player', cm = (e.cause && e.cause.commit) || reg.commit;
      S.fired++;
      out.push({ kind: 'rule', id: e.rule, by: player ? 'player' : 'author', author: a.id || null, layer: e.layer || null,
        text: rec ? rec.text : player && cm && S.promises[cm] ? S.promises[cm].text : '', pattern: patternOf(rec), clock: reg.horizon || (rec && rec.horizon) || 'scene' });
      out.push({ kind: 'pulse', clock: CLOCKS.includes(reg.horizon) ? reg.horizon : 'scene' });
    }
    return out;
  }
  return { feed, state: () => JSON.parse(JSON.stringify({ decisions: S.decisions, fired: S.fired, absolutes: S.absolutes, promises: S.promises, models: S.models })) };
}

/* ------------------------------------------------------------------ the player in the page
   T: { doc, win, story (window.story: start, hear, advance, on, state, stop), look, cam, thingPos(id) → {x, z} | null,
        showSaid(text), script (loaded), lang, clean, loop, pace, gameUi(on), playStory(lang), exit() } */
const CSS = `
.trailer-on #story-models,.trailer-on #commandes,.trailer-on #outils,.trailer-on #taire,.trailer-on #dire,.trailer-on #hint,.trailer-on #chantier-puce{display:none!important}
.trailer-on .dit{top:auto;bottom:calc(env(safe-area-inset-bottom,0px) + 19%);font-size:clamp(15px,2.2vw,24px)}
#tr{position:fixed;inset:0;z-index:12;pointer-events:none;color:#f3f0e8;font-family:"DM Sans",system-ui,sans-serif}
#tr .tr-m{font-family:"DM Mono",ui-monospace,monospace;font-weight:500;text-transform:uppercase;letter-spacing:.16em}
#tr .tr-corners{position:absolute;inset:10px;opacity:.7;background:
 linear-gradient(#f3f0e8,#f3f0e8) 0 0/26px 2px no-repeat,linear-gradient(#f3f0e8,#f3f0e8) 0 0/2px 26px no-repeat,linear-gradient(#f3f0e8,#f3f0e8) 100% 0/26px 2px no-repeat,linear-gradient(#f3f0e8,#f3f0e8) 100% 0/2px 26px no-repeat,
 linear-gradient(#f3f0e8,#f3f0e8) 0 100%/26px 2px no-repeat,linear-gradient(#f3f0e8,#f3f0e8) 0 100%/2px 26px no-repeat,linear-gradient(#f3f0e8,#f3f0e8) 100% 100%/26px 2px no-repeat,linear-gradient(#f3f0e8,#f3f0e8) 100% 100%/2px 26px no-repeat}
#tr .tr-scrim{position:absolute;inset:0;opacity:0;transition:opacity .8s;background:linear-gradient(90deg,rgba(0,0,0,.72) 0%,rgba(0,0,0,.38) 45%,rgba(0,0,0,0) 75%),linear-gradient(0deg,rgba(0,0,0,.55) 0%,rgba(0,0,0,0) 45%)}
#tr .tr-scrim.on{opacity:1}#tr .tr-scrim.title{opacity:1;background:linear-gradient(90deg,rgba(0,0,0,.85) 0%,rgba(0,0,0,.55) 55%,rgba(0,0,0,.25) 100%)}
#tr .tr-cap{position:absolute;left:max(18px,5vw);right:max(18px,5vw);bottom:calc(env(safe-area-inset-bottom,0px) + 28%);opacity:0}
#tr .tr-cap.on{opacity:1;animation:trCap .6s ease-out}
@keyframes trCap{from{opacity:0;transform:translateY(10px)}}
#tr .tr-kick{font-size:clamp(10px,1.25vw,15px);color:#ff4a3d;margin:0 0 .8em;text-shadow:0 1px 8px rgba(0,0,0,.8)}
#tr .tr-text{margin:0;font-weight:600;font-size:clamp(23px,4.3vw,60px);line-height:1.1;letter-spacing:-.02em;max-width:14em;text-wrap:balance;text-shadow:0 2px 24px rgba(0,0,0,.65)}
#tr .tr-text b,#tr .tr-card .tr-big b{background:#ff3b30;color:#fff;padding:0 .22em .06em;border-radius:4px;font-weight:600;box-decoration-break:clone;-webkit-box-decoration-break:clone}
#tr .tr-cap.title{bottom:auto;top:calc(env(safe-area-inset-top,0px) + 24%)}
#tr .tr-h1{margin:0 0 .35em;font-weight:700;font-size:clamp(44px,11vw,150px);line-height:.86;letter-spacing:-.04em;text-transform:uppercase;text-shadow:0 0 60px rgba(255,70,50,.28),0 6px 30px rgba(0,0,0,.6)}
#tr .tr-h1 span{display:block;color:transparent;-webkit-text-stroke:2px #f3f0e8}
#tr .tr-cap.title .tr-text{font-size:clamp(17px,2.6vw,32px);font-weight:500;max-width:22em}
#tr .tr-strip{position:absolute;left:max(16px,4vw);top:calc(env(safe-area-inset-top,0px) + 58px);display:flex;gap:14px;align-items:center;font-size:clamp(9.5px,1vw,12px);opacity:0;transition:opacity .6s}
#tr .tr-strip span{display:flex;align-items:center;gap:7px;opacity:.72;transition:opacity .3s}
#tr .tr-strip i{width:8px;height:8px;border-radius:50%;background:rgba(243,240,232,.45);transition:background .25s,box-shadow .25s}
#tr .tr-strip span.hot{opacity:1}#tr .tr-strip span.hot i{background:#ff3b30;box-shadow:0 0 12px #ff3b30}
#tr .tr-strip .tr-fast{color:#ff4a3d;opacity:0;transition:opacity .3s}#tr .tr-strip .tr-fast.on{opacity:1}
#tr .tr-side{position:absolute;left:max(16px,4vw);top:calc(env(safe-area-inset-top,0px) + 84px);display:flex;flex-direction:column;gap:7px;align-items:flex-start;max-width:min(calc(100vw - 32px),620px)}
#tr .tr-tally,#tr .tr-prom{opacity:0;transition:opacity .6s}
#tr .on-panel{opacity:1!important}
#tr .tr-row{display:flex;align-items:center;gap:8px;font-size:clamp(9.5px,1vw,12px);text-shadow:0 1px 6px rgba(0,0,0,.9)}
#tr .tr-row b{font-weight:500;color:#f3f0e8;min-width:1.6em;text-align:right}
#tr .tr-row em{font-style:normal;color:rgba(243,240,232,.62);letter-spacing:.1em}
#tr .tr-o{width:9px;height:9px;border-radius:50%;background:#ff3b30;box-shadow:0 0 8px rgba(255,59,48,.7);flex:none}
#tr .tr-d{width:8px;height:8px;background:#f3f0e8;transform:rotate(45deg);flex:none}
#tr .tr-icons{display:flex;flex-wrap:wrap;gap:6px;max-width:260px;margin:2px 0 0 1px}
#tr .tr-icons i{animation:trIn .5s ease-out}
@keyframes trIn{from{transform:scale(2.4);opacity:0}}
#tr .tr-icons .tr-d{animation:trInD .5s ease-out}
@keyframes trInD{from{transform:rotate(45deg) scale(2.4);opacity:0}}
#tr .tr-prom{display:flex;flex-direction:column;gap:5px;margin-top:4px}
#tr .tr-p{display:flex;gap:8px;align-items:baseline;padding:5px 9px;background:rgba(8,8,8,.72);border:1px solid rgba(243,240,232,.22);border-radius:4px;font-size:clamp(9.5px,1vw,12px)}
#tr .tr-p em{font-family:"DM Sans",sans-serif;font-style:italic;text-transform:none;letter-spacing:0;font-size:1.12em;color:rgba(243,240,232,.86)}
#tr .tr-p u{text-decoration:none;color:#ff4a3d}#tr .tr-p.kept u{color:#f3f0e8}
#tr .tr-flash{display:flex;margin-top:4px;flex-direction:column;align-items:flex-start;gap:6px;opacity:0;transform:translateX(-8px);transition:opacity .35s,transform .35s}
#tr .tr-flash{max-height:0;overflow:hidden}#tr .tr-flash.on{opacity:1;transform:none;max-height:16em}
#tr .tr-flash .tr-fk{display:flex;align-items:center;gap:8px;font-size:clamp(9.5px,1vw,12px);text-shadow:0 1px 6px #000}
#tr .tr-flash code{display:block;max-width:min(92vw,760px);padding:7px 11px;background:rgba(8,8,8,.8);border-left:2px solid #f3f0e8;font:400 clamp(10.5px,1.15vw,14.5px)/1.45 "DM Mono",ui-monospace,monospace;color:#f3f0e8;white-space:pre-wrap;word-break:break-word}
#tr .tr-flash .tr-pat{color:#ff4a3d}
#tr .tr-card{position:absolute;inset:0;pointer-events:auto;display:flex;flex-direction:column;justify-content:center;align-items:flex-start;gap:14px;padding:0 max(22px,7vw);
  background:linear-gradient(90deg,rgba(5,5,5,.94) 0%,rgba(5,5,5,.8) 60%,rgba(5,5,5,.6) 100%);opacity:0;transition:opacity .9s}
#tr .tr-card.on{opacity:1}#tr .tr-card[hidden]{display:none}
#tr .tr-card .tr-h1{margin:0}
#tr .tr-card p{margin:0;max-width:30em;font-size:clamp(14px,1.6vw,19px);line-height:1.4;color:rgba(243,240,232,.8)}
#tr .tr-card .tr-kick{margin:0}
#tr .tr-btns{display:flex;flex-wrap:wrap;gap:12px;margin-top:8px}
#tr button.tr-b{pointer-events:auto;display:inline-flex;align-items:center;gap:12px;padding:14px 26px;min-height:48px;border-radius:0;border:1.5px solid #f3f0e8;background:#f3f0e8;color:#000;
  font:600 clamp(12px,1.3vw,15px)/1 "DM Mono",ui-monospace,monospace;letter-spacing:.24em;text-transform:uppercase;cursor:pointer}
#tr button.tr-b.ghost{background:transparent;color:#f3f0e8}
#tr button.tr-b:hover,#tr button.tr-b:focus-visible{background:#ff3b30;border-color:#ff3b30;color:#fff;outline:none}
#tr .tr-pt{width:9px;height:9px;border-radius:50%;background:#ff3b30;box-shadow:0 0 10px #ff3b30;display:inline-block}
#tr .tr-card .tr-big{margin:0;font-weight:600;font-size:clamp(26px,4.6vw,64px);line-height:1.06;letter-spacing:-.02em;color:#f3f0e8;max-width:none}
#tr .tr-card .tr-small{font-size:clamp(11px,1.15vw,14px);color:rgba(243,240,232,.6);max-width:34em}
#tr .tr-prompt{position:absolute;inset:0;display:flex;flex-direction:column;justify-content:center;gap:14px;padding:0 max(22px,7vw);background:#050505;opacity:0;transition:opacity 1.2s;pointer-events:none}
#tr .tr-prompt.on{opacity:1;transition:opacity .2s}
#tr .tr-prompt .tr-box{display:flex;gap:14px;align-items:baseline;padding:16px 18px;border:1.5px solid rgba(243,240,232,.45);border-radius:8px;background:rgba(12,12,12,.9);max-width:980px}
#tr .tr-prompt .tr-box u{text-decoration:none;color:#ff4a3d;font-size:clamp(10px,1.1vw,13px);flex:none}
#tr .tr-prompt .tr-box span{font-style:italic;font-weight:500;font-size:clamp(18px,2.6vw,32px);line-height:1.3}
#tr .tr-prompt .tr-box span::after{content:"";display:inline-block;width:.5em;height:1em;margin-left:3px;vertical-align:-.12em;background:#ff3b30;animation:blink 1s steps(1) infinite}
#tr .tr-prompt .tr-note{margin:0;font-size:clamp(11px,1.2vw,14px);line-height:1.45;color:rgba(243,240,232,.62);max-width:44em;opacity:0;transition:opacity .8s}
#tr .tr-prompt .tr-note.on{opacity:1}
#tr .tr-tag{position:absolute;right:max(16px,5vw);top:52%;padding:10px 14px;background:rgba(10,10,10,.82);border:1px solid rgba(243,240,232,.3);border-radius:6px;max-width:min(64vw,360px);opacity:0;transform:translateX(8px);transition:opacity .4s,transform .4s}
#tr .tr-tag.on{opacity:1;transform:none}
#tr .tr-tag b{display:block;font-weight:500;color:#ff4a3d;font-size:clamp(11px,1.25vw,15px)}
#tr .tr-tag span{display:block;margin-top:5px;font-size:clamp(13px,1.4vw,17px);line-height:1.3}
#tr .tr-tag i{position:absolute;left:-7px;top:50%;width:11px;height:11px;margin-top:-5px;border-radius:50%;background:#ff3b30;box-shadow:0 0 10px #ff3b30}
#tr .tr-talk{position:absolute;left:50%;bottom:calc(env(safe-area-inset-bottom,0px) + 25%);transform:translateX(-50%);display:flex;align-items:center;gap:10px;opacity:0;transition:opacity .25s}
#tr .tr-talk.on{opacity:1}
#tr .tr-talk .tr-mic{width:34px;height:34px;border-radius:50%;border:2px solid #f3f0e8;display:flex;align-items:center;justify-content:center;animation:trPulse 1s ease-out infinite}
#tr .tr-talk .tr-mic::after{content:"";width:12px;height:12px;border-radius:50%;background:#ff3b30}
@keyframes trPulse{0%{box-shadow:0 0 0 0 rgba(255,59,48,.6)}100%{box-shadow:0 0 0 16px rgba(255,59,48,0)}}
#tr .tr-wave{display:flex;align-items:center;gap:3px;height:28px}
#tr .tr-wave i{width:3px;border-radius:2px;background:#f3f0e8;animation:trWave .9s ease-in-out infinite}
@keyframes trWave{0%,100%{height:4px}50%{height:26px}}
#tr .tr-talk em{font-style:normal;font-size:clamp(9.5px,1vw,12px);color:rgba(243,240,232,.75)}
#tr .tr-exit{position:absolute;right:max(16px,4vw);top:calc(env(safe-area-inset-top,0px) + 80px);pointer-events:auto;padding:8px 13px;min-height:0;font:500 11px/1 "DM Mono",monospace;letter-spacing:.16em;text-transform:uppercase;
  background:rgba(8,8,8,.6);color:rgba(243,240,232,.8);border:1px solid rgba(243,240,232,.3);border-radius:0;cursor:pointer}
#tr.clean button,#tr.carded .tr-exit{display:none!important}
#tr.ending .tr-side,#tr.ending .tr-strip,#tr.ending .tr-exit,#tr.ending .tr-cap,#tr.ending .tr-tag{opacity:0!important;transition:opacity .6s}
@media (prefers-reduced-motion:reduce){#tr *{transition:none!important;animation:none!important}}
`;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const marks = s => esc(s).replace(/\*([^*]+)\*/g, '<b>$1</b>');

export function createTrailer(T) {
  const d = T.doc, w = T.win, script = T.script, L = () => Object.assign({}, script.labels.en || {}, script.labels[T.lang] || {});
  const st = { on: false, i: -1, timers: [], unsub: null, flashes: [], flashing: false, tagN: 0, fast: 0, wish: null, raf: 0, t0: 0, readout: null, real: 0, decided: { model: 0, reflex: 0 }, card: null };
  let root = null, el = {};

  function build() {
    if (root) return;
    if (!d.getElementById('tr-css')) { const s = d.createElement('style'); s.id = 'tr-css'; s.textContent = CSS; d.head.appendChild(s); }
    root = d.createElement('div'); root.id = 'tr'; if (T.clean) root.classList.add('clean');
    const l = L();
    root.innerHTML = `<div class="tr-scrim"></div><div class="tr-corners"></div>
<div class="tr-strip tr-m">${CLOCKS.map(c => `<span data-c="${c}"><i></i>${esc(l['clock_' + c] || c)}</span>`).join('')}<span class="tr-fast"></span></div>
<div class="tr-side"><div class="tr-tally"><div class="tr-row tr-m"><i class="tr-o"></i><b data-n="dec">0</b><em data-n="declabel"></em></div>
<div class="tr-row tr-m"><i class="tr-d"></i><b data-n="rules">0</b><em>${esc(l.rules || 'written rules')}</em></div><div class="tr-icons"></div></div>
<div class="tr-flash"><div class="tr-fk tr-m"></div><code></code><div class="tr-fk tr-m tr-pat"></div></div>
<div class="tr-prom tr-m"></div></div>
<div class="tr-cap"></div><div class="tr-tag"><i></i><b class="tr-m"></b><span></span></div>
<div class="tr-talk"><span class="tr-mic"></span><span class="tr-wave">${Array.from({ length: 14 }, (_, k) => `<i style="animation-delay:${(k * 0.11 % 0.9).toFixed(2)}s"></i>`).join('')}</span><em class="tr-m">${esc(l.hold_to_talk || 'hold to talk')}</em></div>
<div class="tr-prompt"><p class="tr-kick tr-m">${esc(l.prompt_kicker || 'From prompt to story')}</p><div class="tr-box"><u class="tr-m">${esc(l.prompt || 'Prompt')} ›</u><span></span></div><p class="tr-note"></p></div>
<button type="button" class="tr-exit">${esc(l.exit || 'Exit')}</button>
<div class="tr-card" hidden></div>`;
    d.body.appendChild(root);
    const q = s => root.querySelector(s);
    el = { scrim: q('.tr-scrim'), strip: q('.tr-strip'), fast: q('.tr-fast'), tally: q('.tr-tally'), dec: q('[data-n=dec]'), declabel: q('[data-n=declabel]'), rules: q('[data-n=rules]'),
      icons: q('.tr-icons'), prom: q('.tr-prom'), flash: q('.tr-flash'), cap: q('.tr-cap'), card: q('.tr-card'), exit: q('.tr-exit'),
      tag: q('.tr-tag'), talk: q('.tr-talk'), prompt: q('.tr-prompt'), ptext: q('.tr-prompt .tr-box span'), pnote: q('.tr-prompt .tr-note') };
    el.exit.onclick = () => exit();
    decLabel();
  }
  const later = (f, s) => { const id = w.setTimeout(() => { st.timers = st.timers.filter(x => x !== id); f(); }, Math.max(0, s * 1000)); st.timers.push(id); return id; };

  /* ------------------------------------------------------------ read-outs, fed only by the journal */
  function decLabel() { const l = L(), n = st.decided; el.declabel.textContent = (l.decisions || 'live decisions') + ' · ' + (n.model ? (l.by_model || 'model') + (n.reflex ? ' + ' + (l.by_reflex || 'reflex (code)') : '') : (l.by_reflex || 'reflex (code)')); }
  const pulse = c => { const s = el.strip.querySelector('[data-c="' + c + '"]'); if (!s) return; s.classList.add('hot'); w.clearTimeout(s._t); s._t = w.setTimeout(() => s.classList.remove('hot'), 900); };
  function icon(cls) { const i = d.createElement('i'); i.className = cls; el.icons.appendChild(i); while (el.icons.children.length > 28) el.icons.firstChild.remove(); }
  /* Rules that fire together are shown one after the other, each long enough to be read. */
  function flash(sig) { st.flashes.push(sig); if (!st.flashing) nextFlash(); }
  function nextFlash() {
    const sig = st.flashes.shift();
    if (!sig) { st.flashing = false; el.flash.classList.remove('on'); return; }
    st.flashing = true; showFlash(sig); later(nextFlash, st.flashes.length ? 2.8 : 4.2);
  }
  function showFlash(sig) {
    const l = L(), k = el.flash.children;
    k[0].innerHTML = '<i class="tr-d"></i>' + esc(sig.kind === 'absolute' ? (l.absolute || 'absolute held') : sig.by === 'player' ? (l.your_promise || 'your promise, as a rule') : (l.rule || 'rule') + (sig.author ? ' · ' + sig.author : ''));
    k[1].textContent = sig.text || sig.id;
    k[2].textContent = sig.pattern ? (l.pattern || 'pattern') + ' · ' + pick(sig.pattern.name, T.lang) : '';
    k[2].style.display = sig.pattern ? '' : 'none';
    el.flash.classList.add('on');
  }
  function promise(sig) {
    const l = L(); let p = el.prom.querySelector('[data-id="' + CSS_ID(sig.id) + '"]');
    if (!p) { p = d.createElement('div'); p.className = 'tr-p'; p.dataset.id = CSS_ID(sig.id); el.prom.appendChild(p); }
    p.className = 'tr-p ' + (sig.status || '');
    p.innerHTML = esc(l.promise || 'promise') + ' <em>' + esc(sig.text || sig.id) + '</em> <u>' + esc((l.status || {})[sig.status] || sig.status || '') + '</u>';
  }
  const CSS_ID = s => String(s).replace(/[^\w.-]/g, '_');
  function onEntry(e) {
    if (!st.on) return;
    for (const sig of st.readout.feed(e)) {
      if (sig.kind === 'pulse') pulse(sig.clock);
      else if (sig.kind === 'decision') { st.decided[sig.by]++; el.dec.textContent = st.decided.model + st.decided.reflex; decLabel(); icon('tr-o'); }
      else if (sig.kind === 'rule' || sig.kind === 'absolute') { el.rules.textContent = String(+el.rules.textContent + 1); icon('tr-d'); flash(sig); }
      else if (sig.kind === 'promise') promise(sig);
    }
  }

  /* ------------------------------------------------------------ the camera wish: where the player looks (rAF) */
  function camTick() {
    st.raf = w.requestAnimationFrame(camTick);
    const now = w.performance.now(), dt = Math.min(0.5, (now - (st.real || now)) / 1000); st.real = now;
    const wish = st.wish; if (!wish || !T.look) return;
    const lk = T.look, wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
    if (wish.camera === 'look') {
      const p = wish.at ? T.thingPos(wish.at) : null; if (wish.at && !p) return;
      const want = p ? wrap(Math.atan2(p.x - T.cam.x, p.z - T.cam.z) - T.cam.yaw) : wish.yaw * Math.PI / 180;
      lk.yaw += wrap(want - lk.yaw) * Math.min(1, dt * 2.2);
      lk.pitch += (-0.1 - lk.pitch) * Math.min(1, dt * 1.5);
    } else if (wish.camera === 'around') {
      const u = (now - wish.t0) / 1000, want = wish.y0 + 0.9 * Math.sin(u * 0.9);
      lk.yaw += (want - lk.yaw) * Math.min(1, dt * 3);
    }
  }

  /* ------------------------------------------------------------ the steps */
  const pace = () => T.pace || script.pace || 1;
  function caption(c) {
    const l = c.style === 'title', modelSeen = st.decided.model > 0;
    const text = pick(!modelSeen && c.text_reflex ? c.text_reflex : c.text, T.lang);
    el.cap.className = 'tr-cap' + (l ? ' title' : '');                  // swapped at once (one idea at a time), faded in by CSS
    el.cap.innerHTML = (l ? `<h1 class="tr-h1">${esc(L().title_1 || 'Bodycam')}<span>${esc(L().title_2 || 'Stories')}</span></h1>` : '') +
      (c.kicker ? `<p class="tr-kick tr-m">${esc(pick(c.kicker, T.lang))}</p>` : '') + `<p class="tr-text">${marks(text)}</p>`;
    el.scrim.className = 'tr-scrim ' + (l ? 'title' : 'on');
    void el.cap.offsetWidth; el.cap.classList.add('on');
  }
  /* The player's line: held to talk (the pulse and the waveform show it is spoken), shown as the game shows the player's
     words, then sent through the story's input port exactly as if typed. */
  function typeThenSay(text) {
    const n = text.length, per = Math.min(0.05, 1.1 / Math.max(1, n));
    el.talk.classList.add('on');
    for (let k = 1; k <= n; k++) later(() => T.showSaid(text.slice(0, k)), k * per);
    later(() => { el.talk.classList.remove('on'); Promise.resolve(T.story.hear(text)).catch(e => console.warn('trailer: hear', e && e.message)); }, n * per + 0.25);
  }
  function prompt(s) {
    const text = pick(s.text, T.lang), n = text.length, per = Math.min(0.045, 2.2 / Math.max(1, n));
    el.ptext.textContent = ''; el.pnote.textContent = s.note ? pick(s.note, T.lang) : ''; el.pnote.classList.remove('on');
    el.prompt.classList.add('on');
    for (let k = 1; k <= n; k++) later(() => { el.ptext.textContent = text.slice(0, k); }, 0.4 + k * per);
    later(() => el.pnote.classList.add('on'), 0.6 + n * per);
  }
  function tag(s) {
    el.tag.children[1].textContent = pick(s.tag, T.lang); el.tag.children[2].textContent = s.text ? pick(s.text, T.lang) : '';
    el.tag.children[2].style.display = s.text ? '' : 'none';
    el.tag.classList.remove('on'); void el.tag.offsetWidth; el.tag.classList.add('on');
    const me = ++st.tagN; later(() => { if (st.tagN === me) el.tag.classList.remove('on'); }, Math.max(3.2, s.hold * pace() + 0.4));
  }
  /* World time: the page's own clock gives one second a second; the rest is added, then topped up at the end so that
     `seconds` of world time have passed whatever the frame rate (a slow machine delays the page's clock). */
  function fast(seconds, speed) {
    const t0 = (T.story.state() || {}).t || 0, real = seconds / speed;
    if (speed > 1) {
      el.fast.textContent = '×' + speed + ' ▸▸'; el.fast.classList.add('on');
      const every = 1 / (speed - 1);
      for (let t = every; t < real - 1e-6; t += every) later(() => { if (st.on) T.story.advance(1); }, t);
    }
    later(() => { el.fast.classList.remove('on'); const t = (T.story.state() || {}).t || 0; if (st.on && t - t0 < seconds) T.story.advance(Math.round(seconds - (t - t0))); }, real);
  }
  function run(i) {
    if (!st.on) return;
    st.i = i;
    const s = script.steps[i];
    if (!(st.wish && st.wish.keep && s && s.kind !== 'camera')) st.wish = null;   // a camera wish lasts its own step (or, kept, until the next camera step)
    if (!s) return endCard();
    if (s.kind !== 'prompt') el.prompt.classList.remove('on');
    if (s.kind === 'say') typeThenSay(pick(s.text, T.lang));
    else if (s.kind === 'prompt') prompt(s);
    else if (s.kind === 'tag') tag(s);
    else if (s.kind === 'time') fast(s.seconds, s.speed);
    else if (s.kind === 'camera') st.wish = { camera: s.camera, at: s.at, yaw: s.yaw, keep: !!s.keep, t0: w.performance.now(), y0: T.look ? T.look.yaw : 0 };
    else if (s.kind === 'caption') caption(s.caption);
    else if (s.kind === 'show') for (const p of s.panels) (p === 'strip' ? el.strip : p === 'tally' ? el.tally : el.prom).classList.add('on-panel');
    else if (s.kind === 'end') return endCard();
    later(() => run(i + 1), s.hold * (s.kind === 'time' ? 1 : pace()));
  }

  /* ------------------------------------------------------------ cards */
  function card(html, buttons) {
    el.card.innerHTML = html + (buttons.length ? '<div class="tr-btns">' + buttons.map((b, k) => `<button type="button" class="tr-b${b.ghost ? ' ghost' : ''}" data-k="${k}">${b.dot ? '<span class="tr-pt"></span>' : ''}${esc(b.label)}</button>`).join('') + '</div>' : '');
    el.card.querySelectorAll('button').forEach(b => { b.onclick = ev => { ev.stopPropagation(); buttons[+b.dataset.k].go(); }; });
    el.card.hidden = false; root.classList.add('carded'); w.requestAnimationFrame(() => el.card.classList.add('on'));
  }
  const hideCard = () => { el.card.classList.remove('on'); el.card.hidden = true; el.card.onclick = null; root.classList.remove('carded'); };
  const head = () => `<h1 class="tr-h1">${esc(L().title_1 || 'Bodycam')}<span>${esc(L().title_2 || 'Stories')}</span></h1>`;
  /* The start card: one press (it also opens audio and speech, which need a gesture). In clean mode, a press anywhere. */
  function ready() {
    build(); T.gameUi(false);
    const l = L();
    card(head() + `<p class="tr-kick tr-m">${esc(l.start_kicker || 'Trailer')}</p><p>${esc(l.start_text || '')}</p>` + (T.clean ? `<p class="tr-m" style="font-size:12px">${esc(l.start_clean || 'Click to start')}</p>` : ''),
      [{ label: l.play || 'Play', dot: true, go: () => start() }]);
    if (T.clean) el.card.onclick = () => start();
  }
  function endCard() {
    st.wish = null; root.classList.add('ending'); el.cap.classList.remove('on'); el.scrim.className = 'tr-scrim';
    const l = L(), n = st.decided, how = n.model ? (l.end_model || '') : (l.end_reflex || '');
    card(head() + `<p class="tr-kick tr-m">${esc(l.end_kicker || '')}</p><p class="tr-big">${marks(l.end_text || '')}</p><p class="tr-small">${esc(how)}</p>`,
      [{ label: l.play_story || 'Play the story', dot: true, go: () => { stop(); T.playStory(T.lang); } }, { label: l.again || 'Watch again', ghost: true, go: () => start() }]);
    if (T.loop) later(() => start(), 8);
  }

  function start() {
    build(); stop(true);
    hideCard(); T.gameUi(false); root.classList.remove('ending');
    st.on = true; st.decided = { model: 0, reflex: 0 }; st.flashes = []; st.flashing = false; el.flash.classList.remove('on'); st.readout = createReadout({ patterns: script.patterns });
    el.tag.classList.remove('on'); el.talk.classList.remove('on'); el.prompt.classList.remove('on');
    el.dec.textContent = '0'; el.rules.textContent = '0'; el.icons.innerHTML = ''; el.prom.innerHTML = ''; el.cap.innerHTML = ''; el.cap.className = 'tr-cap'; decLabel();
    for (const k of ['strip', 'tally', 'prom']) el[k].classList.remove('on-panel');
    st.unsub = T.story.on('entry', onEntry);
    T.story.start(script.story, { seed: script.seed, cut: script.transitions !== 'walk', lang: T.lang });
    st.t0 = w.performance.now(); st.real = 0; st.raf = w.requestAnimationFrame(camTick);
    run(0);
  }
  function stop(keepUi) {
    for (const id of st.timers) w.clearTimeout(id); st.timers = [];
    if (st.unsub) { st.unsub(); st.unsub = null; }
    w.cancelAnimationFrame(st.raf); st.wish = null; st.on = false;
    if (!keepUi && root) { root.remove(); root = null; T.gameUi(true); }
  }
  function exit() { stop(); T.exit(); }
  return { ready, start, stop, exit, on: () => st.on, step: () => st.i, readout: () => st.readout ? st.readout.state() : null, seconds: () => scriptSeconds(script, pace()) };
}
