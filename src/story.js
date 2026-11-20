/* Story mode (M2): the narrative core (CORE, core/) drives the page through the executor (src/adaptateur-core.js).
   Sam stands at stations and goes from one to the next by transitions; the player looks around and speaks or types; the
   answer comes from reflex code, compiled rules and the pack's line banks (src/reflex-model.js, no model at all).
   This file is the page glue: it owns the session, the world's clock (it runs whether or not the player speaks; it holds
   while the player is talking, when the world freezes), the input port (speech, gaze dwell), the voices, the subtitles,
   the debug panel and the journal. Everything the engine itself does goes through `P`, hooks given by src/main.js.
   No import: the build embeds it as STORY. English in code, keys and labels; what a character says is in the play language. */

export const LABELS = {
  en: { talk: 'Talk to her', resume: 'Resume', say: 'Say', placeholder: 'Tell her…', replay: 'Play again', leave: 'Leave the story', end: 'End',
    lang: 'Language: English', panel: 'Story journal', copy: 'Copy journal', close: 'Close', copied: 'Copied' },
  fr: { talk: 'Lui parler', resume: 'Reprendre', say: 'Dire', placeholder: 'Dis-lui…', replay: 'Rejouer', leave: 'Quitter l\'histoire', end: 'Fin',
    lang: 'Langue : français', panel: 'Story journal', copy: 'Copy journal', close: 'Close', copied: 'Copied' },
};
const GAZE_DEG = 11, GAZE_M = 40, GAZE_AT = [1.5, 3];          // a thing looked at: within 11° of the view centre, 40 m, for 1.5 s then 3 s

export function createStoryMode(P) {
  const st = { on: false, id: null, pk: null, session: null, clocks: null, model: null, ex: null, lang: 'en', timer: 0, gazeTimer: 0, manual: false, cut: false,
    ended: false, speech: { volume: 'normal', shorten: 0 }, gaze: { target: null, s: 0, fired: new Set() }, commands: [], handlers: [], place: null, voices: null, ui: null, errors: [] };
  const L = () => LABELS[st.lang] || LABELS.en;

  /* ------------------------------------------------------------ the input port (core/ports.js): speech and gaze */
  const input = { subscribe(h) { st.handlers.push(h); return () => { st.handlers = st.handlers.filter(x => x !== h); }; } };
  const emit = ev => Promise.all(st.handlers.map(h => h(ev)));

  /* ------------------------------------------------------------ voices: one per speaker, in the play language */
  function browserVoice(lang, pitch) {
    const S = P.win.speechSynthesis, U = P.win.SpeechSynthesisUtterance;
    if (!S || !U) return null;
    const pick = () => { let vs = []; try { vs = S.getVoices() || []; } catch (_) {} return vs.find(v => (v.lang || '').toLowerCase().startsWith(lang) && v.localService) || vs.find(v => (v.lang || '').toLowerCase().startsWith(lang)) || null; };
    return {
      speak(text, o, cb) {
        const v = pick(); if (!v) { cb.fin(); return; }
        const u = new U(text); u.voice = v; u.lang = v.lang; u.rate = o.debit || 1; u.pitch = pitch; u.volume = st.speech.volume === 'whisper' ? 0.35 : st.speech.volume === 'low' ? 0.6 : 1;
        u.onstart = () => cb.debut(); u.onend = () => cb.fin(); u.onerror = e => (e && (e.error === 'interrupted' || e.error === 'canceled')) ? cb.fin() : cb.erreur(e && e.error || 'error');
        S.speak(u);
      },
      cancel() { S.cancel(); },
    };
  }
  function makeVoices() {
    if (st.voices) for (const v of Object.values(st.voices)) try { v.taire(); } catch (_) {}
    const mk = (voix, pitch) => { const v = P.VOIX.creerVoix({ tts: P.tts, locale: browserVoice(st.lang, pitch), reglages: { langue: st.lang, voix } }); v.actif(P.voiceOn()); return v; };
    st.voices = { carrier: mk('airy', 1), other: mk('rounded', 0.8) };
  }

  /* ------------------------------------------------------------ what the engine does for each executor command */
  const toWorld = pos => P.posObjet({ devant: pos[1], cote: pos[0] });
  const gap = (call, why, seq) => { if (st.ex && !st.ex.gaps.some(g => g.call === call && g.why === why)) st.ex.gaps.push({ call, why, seq }); };
  function run(cmd) {
    st.commands.push(cmd); if (st.commands.length > 60) st.commands.shift();
    switch (cmd.do) {
      case 'go': return transition(cmd);
      case 'look':
        if (cmd.thing) P.enqueue([{ type: 'viser', objet: cmd.thing }]);
        else if (typeof cmd.yaw === 'number') P.enqueue([{ type: 'tourner', degres: Math.round(P.wrapDeg(P.pathYawDeg(P.cam.z) + cmd.yaw - P.cam.yaw * 180 / Math.PI)) }]);
        if (typeof cmd.pitch === 'number') P.enqueue([{ type: 'regarder', degres: cmd.pitch }]);
        return;
      case 'turn': return P.enqueue([{ type: 'tourner', degres: cmd.degrees }]);
      case 'posture': return P.enqueue([{ type: 'posture', hauteur: cmd.height }]);
      case 'reach': return P.enqueue([{ type: 'viser', objet: cmd.thing }, { type: 'posture', hauteur: 0.6 }, { type: 'attendre', secondes: 1.5 }, { type: 'posture', hauteur: 1 }]);
      case 'wait': return P.enqueue([{ type: 'attendre', secondes: Math.min(5, cmd.seconds || 1) }]);
      case 'stop': return P.stop();
      case 'say': return speak(cmd);
      case 'thing.place': return P.placeThing({ id: cmd.id, nom: cmd.name, formes: P.ADAPTER.toFormes(cmd.shapes) }, toWorld(cmd.pos));
      case 'thing.change': return P.objetMeneur(Object.assign({ op: 'modifier', id: cmd.id }, cmd.scale !== undefined ? { echelle: cmd.scale } : {}, cmd.offset ? { decale: cmd.offset } : {}, cmd.wobble !== undefined ? { vacille: cmd.wobble } : {}));
      case 'thing.remove': return P.objetMeneur({ op: 'retirer', id: cmd.id });
      case 'sound': return sound(cmd);
      case 'place': {
        const was = st.place || {}, patch = {};
        if (cmd.sun_height !== was.sun_height) patch.soleil = { azimut: P.sunAzimuth(), hauteur: cmd.sun_height };
        if (cmd.fog !== was.fog) patch.brume = cmd.fog;
        if (cmd.lamp !== was.lamp) patch.lampe = !!cmd.lamp;
        st.place = { fog: cmd.fog, lamp: cmd.lamp, sun_height: cmd.sun_height, weather: cmd.weather };
        if (Object.keys(patch).length) P.patchScene(patch);
        return;
      }
      case 'camera': P.camera({ degrade: cmd.degrade || 0, shake: cmd.shake || 0, off: !!cmd.off }); P.battery(cmd.battery); return;
      case 'speech': st.speech = { volume: cmd.volume || 'normal', shorten: cmd.shorten || 0 }; return;
      case 'end': return end(cmd.id);
    }
  }
  function speak(cmd) {
    const line = cmd.line || {}, who = line.speaker || st.pk.carrier, whisper = cmd.tone === 'whisper' || st.speech.volume === 'whisper';
    const text = P.ADAPTER.lineText(line, st.lang, st.speech.shorten);
    if (!text) return;
    const name = who !== st.pk.carrier ? (st.pk.speakers[who] || who) : null;
    P.subtitle(text, { speaker: name, whisper });
    if (!line[st.lang]) gap('say', 'line without the play language (' + st.lang + ')', cmd.seq);
    try { (who === st.pk.carrier ? st.voices.carrier : st.voices.other).dire(text); } catch (_) {}
  }
  function sound(cmd) {
    const plans = (P.bruitages.indices || {})[cmd.cue];
    if (!Array.isArray(plans) || !plans.length) { gap('playSound', 'no recipe for the cue ' + cmd.cue, cmd.seq); return; }
    plans.forEach((p, i) => setTimeout(() => { if (st.on) P.playPlan(Object.assign({ rang: 0, principal: false, rates: 0, fin: null, vibrato: 1, rebonds: 0, graine: cmd.seed || 1, cle: cmd.cue + ':' + cmd.key + ':' + i },
      p, { gain: Math.min(0.9, (p.gain ?? 0.5) * (cmd.gain ?? 0.5) / 0.5) })); }, Math.round((p.t || 0) * 1000)));
  }
  /* A transition (ADR 0003): she walks along the path to the next station (no free roaming, no obstacle logic: a leg that
     would cross a known trunk or rock, or the `cut` option, makes it a cut instead), then faces the station's heading. */
  function transition(cmd) {
    if (!cmd.to_pos) return;
    const a = { along: cmd.from_pos ? cmd.from_pos[1] : P.cam.z, side: cmd.from_pos ? cmd.from_pos[0] : 0 }, b = { along: cmd.to_pos[1], side: cmd.to_pos[0] };
    const end = toWorld(cmd.to_pos), cap = P.pathYaw(end.z) + (cmd.heading || 0) * Math.PI / 180, pts = [];
    const n = Math.max(1, Math.ceil(Math.abs(b.along - a.along) / 3));
    for (let i = 1; i <= n; i++) { const u = i / n, al = a.along + (b.along - a.along) * u, sd = Math.abs(a.side) < 3 && Math.abs(b.side) < 3 ? a.side + (b.side - a.side) * u : (Math.abs(a.side) < 3 ? a.side : 0); pts.push(P.posObjet({ devant: al, cote: sd })); }
    pts.push(end);
    let prev = { x: P.cam.x, z: P.cam.z }, clear = true;
    const obs = P.obstacles();
    for (const q of pts) { for (const o of obs) if (segDist(prev, q, o) < o.r + 0.35) { clear = false; break; } if (!clear) break; prev = q; }
    if (st.cut || !clear) P.cut(end.x, end.z, cap);
    else P.walk(pts, cap);
    if (cmd.posture !== undefined) P.enqueue([{ type: 'posture', hauteur: cmd.posture }]);
    st.gaze = { target: null, s: 0, fired: st.gaze.fired };
  }
  const segDist = (a, b, o) => { const dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz || 1e-9, u = Math.max(0, Math.min(1, ((o.x - a.x) * dx + (o.z - a.z) * dz) / l2)); return Math.hypot(a.x + u * dx - o.x, a.z + u * dz - o.z); };
  function end(id) {
    st.ended = true;
    const e = (st.pk.endings || []).find(x => x.id === id) || { id };
    const title = e.family ? e.family[st.lang] || e.family.en : id, ln = e.line && st.session.world.vocab.lines[e.line];
    P.end(title, ln ? P.ADAPTER.lineText(Object.fromEntries(Object.entries(ln).map(([k, v]) => [k, [].concat(v)[0]])), st.lang) : '', { replay: () => start(st.id, st.opts), leave: () => stop() }, L());
  }

  /* ------------------------------------------------------------ the world's clock and the gaze */
  function tick() { if (!st.on || st.ended || st.manual || P.frozen()) return; st.session.advance(1); panel(); }
  function gazeTick(dt) {
    if (!st.on || st.ended || st.manual || P.frozen()) return;          // manual clock (scripted runs): only explicit look() observations
    const yaw = P.cam.yaw + P.look.yaw, w = st.session.world;
    let best = null;
    for (const o of st.pk.place.objets || []) {
      if (!o || !o.id || !w.things[o.id]) continue;
      const p = P.posObjet(o), dx = p.x - P.cam.x, dz = p.z - P.cam.z, m = Math.hypot(dx, dz);
      const d = Math.abs(P.wrapDeg((Math.atan2(dx, dz) - yaw) * 180 / Math.PI));
      if (m <= GAZE_M && d <= GAZE_DEG && (!best || d < best.d)) best = { id: o.id, d };
    }
    const id = best ? best.id : null;
    if (id !== st.gaze.target) { st.gaze.target = id; st.gaze.s = 0; return; }
    if (!id) return;
    const s0 = st.gaze.s; st.gaze.s += dt;
    for (const s of GAZE_AT) {
      const k = w.body.station + '|' + id + '|' + s;
      if (s0 < s && st.gaze.s >= s && !st.gaze.fired.has(k)) { st.gaze.fired.add(k); emit({ kind: 'look', target: 'thing:' + id, s }); }
    }
  }

  /* ------------------------------------------------------------ start, stop, the player's words */
  function start(id, opts = {}) {
    const pk = P.packs[id]; if (!pk) throw new Error('unknown story ' + id);
    stop(true);
    st.on = true; st.id = id; st.pk = pk; st.opts = opts; st.ended = false; st.manual = opts.clock === 'manual'; st.cut = !!opts.cut;
    st.lang = opts.lang || P.storedLang() || 'en'; st.speech = { volume: 'normal', shorten: 0 }; st.gaze = { target: null, s: 0, fired: new Set() }; st.commands = []; st.handlers = [];
    P.enter(L());
    P.applyPlace(pk.place);
    const s0 = pk.scene.stations.find(s => s.id === pk.scene.start) || pk.scene.stations[0], p0 = toWorld(s0.pos);
    P.cut(p0.x, p0.z, P.pathYaw(p0.z) + (s0.heading || 0) * Math.PI / 180, true);
    st.ex = P.ADAPTER.createEngineExecutor({ apply: run });
    const seed = opts.seed || ((Date.now() % 1e9) + 1);
    st.session = P.CORE.createSession({ scene: pk.scene, seed, executor: st.ex });
    st.place = Object.assign({}, st.session.world.place);
    st.model = P.REFLEX.createReflexModel({ verbs: P.reflexes, anchors: pk.anchors, stations: pk.stations, carrier: pk.carrier, world: () => st.session.world, serialize: P.CORE.serializeTokens });
    st.clocks = P.CORE.createClocks({ session: st.session, model: st.model, character: pk.carrier, clock: () => P.now() });
    st.clocks.attach(input);
    makeVoices();
    st.session.loadPrinciples(pk.principles);
    st.session.start();
    for (const tx of st.model.arrival()) st.session.submit(tx, { loop: 'now', latency_ms: 0 });
    P.battery(st.session.world.camera.battery);
    st.timer = setInterval(tick, 1000);
    let g0 = P.now(); st.gazeTimer = setInterval(() => { const t = P.now(); gazeTick(Math.min(0.5, (t - g0) / 1000)); g0 = t; }, 250);
    buildUi();
    panel();
    return api.state();
  }
  function stop(restarting) {
    if (!st.on) return;
    clearInterval(st.timer); clearInterval(st.gazeTimer);
    if (st.voices) for (const v of Object.values(st.voices)) try { v.taire(); } catch (_) {}
    st.on = false;
    if (st.ui) { for (const el of st.ui.els) el.remove(); st.ui = null; }
    if (!restarting) P.leave();
  }
  async function hear(text0, opts = {}) {
    const text = String(text0 || '').trim().slice(0, 300);
    if (!st.on || !text || st.ended) return null;
    const letters = text.replace(/[^\p{L}]/gu, ''), loud = opts.loud ?? ((/!{2,}/.test(text)) || (letters.length >= 4 && letters === letters.toUpperCase()));
    P.showSaid(text);
    const r = await emit({ kind: 'speech', text, lang: st.lang, loud: loud || undefined });
    panel();
    return r && r[0] ? { intent: r[0].intent.seq, status: r[0].intent.status, now: r[0].now.map(x => x.status) } : null;
  }

  /* ------------------------------------------------------------ debug panel (hidden by default) and story controls */
  function buildUi() {
    const d = P.doc, els = [];
    const mk = (tag, props, parent) => { const e = d.createElement(tag); Object.assign(e, props); (parent || d.body).appendChild(e); els.push(e); return e; };
    const box = mk('div', { id: 'story-debug', hidden: true });
    box.setAttribute('style', 'position:fixed;inset:auto 12px 12px 12px;max-height:60vh;z-index:31;background:rgba(10,12,9,.92);border:1px solid rgba(243,240,232,.24);border-radius:12px;padding:10px;flex-direction:column;gap:8px;font:400 11px/1.45 ui-monospace,monospace;color:#f3f0e8;user-select:text;-webkit-user-select:text');
    const show = on => { box.hidden = !on; box.style.display = on ? 'flex' : 'none'; };
    show(false);
    const pre = mk('pre', {}, box); pre.setAttribute('style', 'margin:0;overflow:auto;white-space:pre-wrap;flex:1');
    const row = mk('div', {}, box); row.setAttribute('style', 'display:flex;gap:8px');
    const copy = mk('button', { type: 'button', textContent: L().copy }, row), close = mk('button', { type: 'button', className: 'ghost', textContent: L().close }, row);
    copy.onclick = async () => { try { await P.win.navigator.clipboard.writeText(api.journal()); copy.textContent = L().copied; } catch (_) { pre.textContent = api.journal(); } setTimeout(() => { copy.textContent = L().copy; }, 1500); };
    close.onclick = () => show(false);
    const tools = P.doc.getElementById('outils');
    const tog = mk('button', { type: 'button', className: 'ghost', id: 'story-journal', textContent: L().panel }, tools);
    tog.onclick = () => { show(box.hidden); panel(); };
    const lang = mk('button', { type: 'button', className: 'ghost', id: 'story-lang', textContent: L().lang }, tools);
    lang.onclick = () => { st.lang = st.lang === 'en' ? 'fr' : 'en'; P.storeLang(st.lang); lang.textContent = L().lang; makeVoices(); P.labels(L()); panel(); };
    st.ui = { els, box, pre };
  }
  function panel() {
    if (!st.ui || st.ui.box.hidden || !st.session) return;
    const w = st.session.world, E = st.session.journal.entries;
    const last = E.slice(-14).map(e => e.seq + ' ' + e.type + (e.type === 'tx' ? ' ' + e.status + ' ' + e.kind + (e.body && e.body.op ? '.' + e.body.op : '') + (e.body && (e.body.ref || e.body.verb) ? ' ' + (e.body.ref || e.body.verb) : '') : e.type === 'rule' ? ' ' + e.rule + ' ' + e.status : e.type === 'event' ? ' ' + e.event : ''));
    st.ui.pre.textContent = [
      'story ' + st.id + ' · lang ' + st.lang + ' · t ' + w.clock.t + ' s · seed ' + w.seed + (st.manual ? ' · manual clock' : ''),
      'station ' + w.body.station + ' · beat ' + w.story.beat + ' · battery ' + Math.round(w.camera.battery * 100) + ' % · sun ' + w.place.sun_height + '°' + (w.story.ending ? ' · ending ' + w.story.ending : ''),
      'commitments: ' + (Object.values(w.commitments).map(c => c.id + ' ' + c.status).join(', ') || 'none'),
      'engine gaps: ' + (st.ex.gaps.map(g => g.call + ' (' + g.why + ')').join('; ') || 'none'),
      'journal: ' + E.length + ' entries · hash ' + st.session.hash(), '', ...last,
    ].join('\n');
  }

  const api = {
    start, stop, hear,
    on: () => st.on,
    lang: () => st.lang,
    labels: () => L(),
    checkpoint() { return st.session ? st.session.checkpoint().hash : null; },
    advance(n = 1) { if (st.on && !st.ended) { st.session.advance(n); panel(); } return api.state(); },
    look(target, s = 1.5) { return emit({ kind: 'look', target, s }); },
    journal: () => st.session ? P.CORE.toJSONL(st.session.journal) : '',
    gaps: () => st.ex ? st.ex.gaps.slice() : [],
    commands: () => st.commands.slice(),
    state() {
      if (!st.session) return null;
      const w = st.session.world;
      return { story: st.id, lang: st.lang, t: w.clock.t, station: w.body.station, beat: w.story.beat, battery: w.camera.battery, sun_height: w.place.sun_height, ending: w.story.ending,
        commitments: Object.fromEntries(Object.values(w.commitments).map(c => [c.id, c.status])), entries: st.session.journal.entries.length, hash: st.session.hash(), gaps: st.ex.gaps.length };
    },
    session: () => st.session,
  };

  /* ---- journal subscription (trailer lot): keep this block last ----------------------------------------------------
     api.on(event, handler) → unsubscribe. `handler(entry)` is called for every journal entry appended after the call
     (event 'entry'), or only for entries of one type (event 'tx', 'rule', 'model_call', 'event'…), including the entries
     of sessions started later (a new session begins with its 'session' header). The journal is read every 100 ms, and
     only while someone listens: nothing runs otherwise. Read-only: a handler cannot change the session.
     api.on() with no argument keeps its old meaning: whether the story mode is on. */
  const subs = { list: [], timer: 0, session: null, seen: 0 }, isOn = api.on;
  function flushSubs() {
    const s = st.session; if (!s) return;
    if (s !== subs.session) { subs.session = s; subs.seen = 0; }
    const E = s.journal.entries;
    while (subs.seen < E.length) {
      const e = E[subs.seen++];
      for (const x of subs.list.slice()) if (x.event === 'entry' || x.event === e.type) try { x.handler(e); } catch (err) { console.warn('story.on:', err && err.message); }
    }
  }
  api.on = (event, handler) => {
    if (event === undefined) return isOn();
    flushSubs();
    if (!subs.list.length && st.session) { subs.session = st.session; subs.seen = st.session.journal.entries.length; }
    const x = { event, handler }; subs.list.push(x);
    if (!subs.timer) subs.timer = setInterval(flushSubs, 100);
    return () => { subs.list = subs.list.filter(y => y !== x); if (!subs.list.length) { clearInterval(subs.timer); subs.timer = 0; } };
  };
  /* ---- end of the journal subscription block ---- */
  return api;
}
