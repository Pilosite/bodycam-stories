/* Conception before play, in the page (ADR 0011, briefs/conception.md). After a world is described and its place is built,
   the large tier writes a story sketch (core/sketch.js) while the creator sees it come: the questions first, with their
   suggested answers and « Surprise me », then who is here, what is at stake, what will be played as absence. « Play » can be
   pressed at any time; the story then runs on the narrative core (src/story.js) with the generated pack.
   The model call goes through the page's sampler (the `sample` capability: streaming with onText, tier "complex"); with no
   sampler, or when the answer cannot be used even after one repair, the code fallback of core/sketch.js stands, and the
   panel says so (P19: nothing staged).
   No import: the build embeds it as CONCEPTION. D: { doc, win, CORE, library, base, sample(), forgetSample(), play(pk), free() }.
   English in code and keys; labels in the play language of the sketch (en or fr). */

export const LABELS = {
  en: { title: 'Conception', writing: 'The story is being written…', questions: 'Before you play', surprise: 'Surprise me', own: 'or in your words',
    who: 'Who is here', stake: 'At stake', absence: 'Played as absence', cannot: 'The camera will not show', play: 'Play', free: 'Free walk',
    model: 'Written by the model', repaired: 'Written by the model, repaired once', fallback: 'No model answered: a sketch built by code from the place',
    early: 'Not finished: a sketch built by code from the place stands in', none: 'No question: the sketch stands as written.' },
  fr: { title: 'Conception', writing: 'L\'histoire s\'écrit…', questions: 'Avant de jouer', surprise: 'Surprends-moi', own: 'ou en tes mots',
    who: 'Qui est là', stake: 'L\'enjeu', absence: 'Joué comme absence', cannot: 'La caméra ne montrera pas', play: 'Jouer', free: 'Promenade libre',
    model: 'Écrite par le modèle', repaired: 'Écrite par le modèle, réparée une fois', fallback: 'Aucun modèle n\'a répondu : une esquisse écrite par le code à partir du lieu',
    early: 'Pas finie : une esquisse écrite par le code à partir du lieu la remplace', none: 'Aucune question : l\'esquisse reste telle qu\'elle est écrite.' },
};
const STYLE = `#conception{position:fixed;inset:auto 0 0 0;z-index:32;max-height:78vh;overflow:auto;padding:14px 16px calc(14px + env(safe-area-inset-bottom));
background:rgba(10,12,9,.9);border-top:1px solid var(--line,rgba(243,240,232,.24));color:var(--ink,#f3f0e8);font:400 14px/1.45 var(--f-ui,system-ui,sans-serif);display:flex;flex-direction:column;gap:12px}
@media (min-width:760px){#conception{inset:auto auto 16px 16px;width:420px;border:1px solid var(--line,rgba(243,240,232,.24));border-radius:14px}}
#conception .cc-head{display:flex;align-items:center;gap:8px;font:500 11px/1 var(--f-mono,ui-monospace,monospace);letter-spacing:.12em;text-transform:uppercase;color:var(--ink-dim,rgba(243,240,232,.72))}
#conception .cc-dot{width:8px;height:8px;border-radius:50%;background:var(--rec,#ff4b3e);animation:ccPulse 1.2s ease-in-out infinite}
#conception.cc-done .cc-dot{animation:none;opacity:.5}
@keyframes ccPulse{50%{opacity:.25}}
#conception .cc-sentence{font-size:15px;color:var(--ink,#f3f0e8)}
#conception .cc-q{display:flex;flex-direction:column;gap:6px;border:1px solid var(--line,rgba(243,240,232,.24));border-radius:12px;padding:10px}
#conception .cc-chips{display:flex;flex-wrap:wrap;gap:6px}
#conception .cc-chips button{padding:8px 12px;min-height:36px;font-size:13px;border-radius:999px}
#conception .cc-chips button[aria-pressed=true]{background:var(--ink,#f3f0e8);color:#000}
#conception .cc-chips input{flex:1 1 140px;min-width:0;padding:8px 10px;border-radius:999px;border:1px solid var(--line,rgba(243,240,232,.24));background:transparent;color:inherit;font:inherit;font-size:13px}
#conception dl{margin:0;display:grid;grid-template-columns:1fr;gap:2px}
#conception dt{font:500 11px/1.6 var(--f-mono,ui-monospace,monospace);text-transform:uppercase;letter-spacing:.08em;color:var(--ink-dim,rgba(243,240,232,.72))}
#conception dd{margin:0 0 6px}
#conception .cc-src{font:400 11px/1.4 var(--f-mono,ui-monospace,monospace);color:var(--ink-dim,rgba(243,240,232,.72))}
#conception .cc-row{display:flex;gap:8px;flex-wrap:wrap;position:sticky;bottom:-14px;margin:0 -16px -14px;padding:10px 16px 14px;background:rgba(10,12,9,.96)}
#conception .cc-play{background:var(--ink,#f3f0e8);color:#000;padding:12px 26px;min-height:46px}`;

export function createConception(D) {
  const C = D.CORE;
  let st = null;
  const el = (tag, cls, txt, parent) => { const e = D.doc.createElement(tag); if (cls) e.className = cls; if (txt !== undefined) e.textContent = txt; if (parent) parent.appendChild(e); return e; };

  function close() { if (!st) return; if (st.ctl) try { st.ctl.abort(); } catch (_) {} if (st.root) st.root.remove(); st = null; }
  /* The sampler as core/sketch.js asks it: one call, streamed when the sampler streams, the large tier ("complex"). */
  function asker(ctl) {
    const s = D.sample(); if (!s) return null;
    return async (prompt, o = {}) => {
      try {
        const r = await s(prompt, { modelTier: 'complex', cache: false, signal: ctl.signal, onText: x => { if (x && typeof x.text === 'string') o.onText && o.onText(x.text); } });
        return r && typeof r === 'object' ? r.text : r;
      } catch (e) { if (e && e.code === 'not_granted') D.forgetSample(); throw e; }
    };
  }
  function open({ sentence, place }) {
    close();
    const lang = C.guessLang(sentence), ctl = D.win.AbortController ? new D.win.AbortController() : { signal: undefined, abort() {} };
    st = { sentence, place, lang, ctl, answers: {}, questions: [], result: null, t0: Date.now(), firstQuestionMs: null, doneMs: null };
    const L = () => LABELS[st.lang] || LABELS.en;
    if (!D.doc.getElementById('conception-style')) { const s = el('style', '', STYLE, D.doc.head); s.id = 'conception-style'; }
    const root = st.root = el('section', '', undefined, D.doc.body); root.id = 'conception'; root.setAttribute('aria-label', 'Conception');
    const head = el('div', 'cc-head', undefined, root); el('span', 'cc-dot', undefined, head); const headTxt = el('span', '', L().title + ' · ' + L().writing, head);
    el('div', 'cc-sentence', '« ' + sentence + ' »', root);
    const summary = el('dl', '', undefined, root);
    const src = el('div', 'cc-src', '', root);
    const qTitle = el('div', 'cc-head', L().questions, root);
    const qBox = el('div', '', undefined, root); qBox.style.cssText = 'display:flex;flex-direction:column;gap:8px';
    const row = el('div', 'cc-row', undefined, root);
    const play = el('button', 'cc-play', L().play, row); play.type = 'button'; play.id = 'conception-play';
    const free = el('button', 'ghost', L().free, row); free.type = 'button';
    play.onclick = () => start();
    free.onclick = () => { close(); D.free && D.free(); };

    function addQuestion(q) {
      if (!st || st.questions.some(x => x.target === q.target)) return;
      st.questions.push(q);
      if (st.firstQuestionMs === null) st.firstQuestionMs = Date.now() - st.t0;
      const box = el('div', 'cc-q', undefined, qBox); box.dataset.q = q.id;
      el('div', '', q.text, box);
      const chips = el('div', 'cc-chips', undefined, box), btns = [];
      const pick = (v, b) => { st.answers[q.id] = v; for (const x of btns) x.setAttribute('aria-pressed', String(x === b)); };
      for (const o of [...q.options, null]) {
        const b = el('button', 'ghost', o === null ? L().surprise : o, chips); b.type = 'button'; b.setAttribute('aria-pressed', 'false'); btns.push(b);
        b.onclick = () => pick(o === null ? 'surprise' : o, b);
      }
      const own = el('input', '', undefined, chips); own.type = 'text'; own.placeholder = L().own; own.maxLength = 160; own.setAttribute('aria-label', q.text);
      own.oninput = () => { const v = own.value.trim(); if (v) pick(v, null); else delete st.answers[q.id]; };
    }
    function showSummary(r) {
      if (r.about && (r.about.lang === 'fr' || r.about.lang === 'en') && r.about.lang !== st.lang) st.lang = r.about.lang;
      summary.replaceChildren();
      const A = r.about || {}, M = r.pack.manifest;
      for (const [k, v] of [['who', A.who], ['stake', A.stake], ['absence', A.absence], ['cannot', (M.sketch.cannot_show || []).join(', ')]]) if (v) { el('dt', '', L()[k], summary); el('dd', '', v, summary); }
      src.textContent = L()[r.early ? 'early' : r.source] || r.source;
      if (!st.questions.length) qTitle.textContent = L().questions + ' · ' + L().none;
      headTxt.textContent = L().title + ' · ' + (M.title[M.languages[0]] || '');
      root.classList.add('cc-done');
      play.textContent = L().play; free.textContent = L().free;
    }
    const mine = st;
    C.conceive({ sentence, place, library: D.library, base: D.base, ask: asker(ctl), onQuestion: q => { if (st === mine) addQuestion(q); } })
      .then(r => { if (st !== mine || st.result) return; st.result = r; st.doneMs = Date.now() - st.t0; for (const q of r.questions) addQuestion(q); showSummary(r); },
        e => { console.warn('conception:', e && e.message); });
    function start() {
      if (!st) return;
      let r = st.result;
      if (!r) {                                                        // « Play » before the sketch is written: the code sketch stands in, said so
        try { st.ctl.abort(); } catch (_) {}
        const fb = C.fallbackSketch({ sentence, place, base: D.base, lang: st.lang });
        r = { source: 'fallback', early: true, sketch: fb, pack: C.sketchPack(fb, { sentence, place, base: D.base }), questions: [], about: fb.about };
      }
      const pk = C.playable(C.withAnswers(r.pack, st.answers), D.library);
      pk.conception = { source: r.early ? 'early' : r.source, attempts: r.attempts || [], first_question_ms: st.firstQuestionMs, done_ms: st.doneMs, answers: Object.assign({}, st.answers) };
      close();
      D.play(pk);
    }
    return api;
  }
  const api = { open, close, on: () => !!st, state: () => st ? { lang: st.lang, questions: st.questions.map(q => q.id), answers: Object.assign({}, st.answers), done: !!st.result, source: st.result && st.result.source, first_question_ms: st.firstQuestionMs, done_ms: st.doneMs } : null };
  return api;
}
