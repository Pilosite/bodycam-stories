/* The model port served by code (M2, docs/milestones.md): no model at all. ModelPort.decide answers with `tier: 'reflex'`
   (core/clocks.js records it so); there is no generate(), so no scene loop is opened (nothing staged, P19).
   - decide({ question: 'intent', text, lang }): the nearest match of the sentence, plain lexical, against the engine's verb
     anchors (src/reflexes.json) and the pack's anchors (stories/<id>/anchors.json: things, intent classes, talk lines,
     commit classes). → { answer: intent fields, p, tier }.
   - decide({ question: 'reaction', state: { intent } }): the immediate reaction as PDL tokens: fallback lines of the pack's
     bank, acts in place, a transition, or a commitment (her answer, the player's fact and rule, §8.6). Below the
     `ask_below` confidence she asks back.
   - arrival(): what she says when the story starts (the start station's arrive_line).
   Pure: no DOM, no import. `world()` returns the session's world (read only); `serialize` is core's serializeTokens. */

export function normalize(s) {
  return ' ' + String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim() + ' ';
}
/* The longest anchor of `list` (strings) found in the normalized text, as a word count; 0 when none. */
export function anchorScore(text, list) {
  let best = 0, hit = null;
  for (const a of list || []) { const n = normalize(a); if (n.trim() && text.includes(n)) { const k = n.trim().split(' ').length; if (k > best) { best = k; hit = a; } } }
  return { score: best, hit };
}
const both = o => [].concat((o && o.en) || [], (o && o.fr) || []);

export function createReflexModel({ verbs, anchors, stations = [], carrier = 'sam', world, serialize }) {
  const V = verbs || {}, A = anchors || {}, order = stations.map(s => s.id);
  const me = { kind: 'model', id: 'reflex', tier: 'reflex' }, player = { kind: 'player', id: 'player' };
  const say = (ref, tone) => ({ author: me, horizon: 'now', kind: 'act', body: Object.assign({ op: 'say', ref }, tone ? { tone } : {}) });
  const sayLine = line => ({ author: me, horizon: 'now', kind: 'act', body: { op: 'say', line } });
  const act = body => ({ author: me, horizon: 'now', kind: 'act', body });
  const hasLine = ref => !!(world().vocab.lines || {})[ref];
  const notes = new Map();                                 // text → what the analysis found beyond the intent fields

  function best(text, table) {                             // { key, score, hit } of the best-matching entry of { key: {en, fr} }
    let r = { key: null, score: 0 };
    for (const [k, v] of Object.entries(table || {})) { const s = anchorScore(text, both(v)); if (s.score > r.score) r = { key: k, score: s.score, hit: s.hit }; }
    return r;
  }
  function analyse(text0) {
    const text = normalize(text0), w = world(), at = w.body.station;
    const thing = best(text, A.things), cls = best(text, A.intent_classes), commit = best(text, A.commit_classes);
    const cond = anchorScore(text, both(A.conditional)).score > 0, please = anchorScore(text, both(A.please)).score > 0;
    let talk = { score: 0 }; for (const t of A.talk || []) { const s = anchorScore(text, both(t)); if (s.score > talk.score) talk = { score: s.score, line: t.line }; }
    const verb = best(text, V.verbs);
    if (cond && commit.key) {                              // "if the jay calls, stop and get down": a commitment (§8.6)
      const c = A.commit_classes[commit.key];
      return { p: 0.85, answer: { verb: 'commit', class: commit.key, condition: String(text0).slice(0, 200), behaviour: String(text0).slice(0, 200), commit: commitId(w, commit.key) },
        note: { amend: anchorScore(text, both(c.amend)).score > 0 } };
    }
    if (cond && !verb.key && !talk.score) return { p: 0.4, answer: { verb: 'other' } };   // a condition she cannot place: she asks back
    if (cls.key && cls.score >= Math.max(verb.score, talk.score)) {
      const c = A.intent_classes[cls.key];
      return { p: 0.85, answer: Object.assign({ verb: c.verb || 'other', class: cls.key }, c.target ? { target: c.target } : {}, c.loud ? { loud: true } : {}), note: { classLine: c.line, unless: c.line_unless_station } };
    }
    if (talk.score && talk.score >= verb.score) return { p: 0.85, answer: { verb: 'say' }, note: { line: talk.line } };
    if (verb.key) {
      const vk = verb.key, spec = V.verbs[vk];
      if (vk === 'go' || vk === 'back') {
        const to = goTarget(w, at, vk === 'back', text);
        if (!to) return { p: 0.8, answer: { verb: 'go' }, note: { line: 'move.v2' } };
        return { p: 0.9, answer: Object.assign({ verb: 'go', target: 'station:' + to.station }, please ? {} : { class: 'bare_order' }), note: { via: to.via, fork: to.fork, please } };
      }
      if (vk === 'posture') { const h = (spec.heights || {})[verb.hit] ?? (spec.heights || {})[normalize(verb.hit).trim()] ?? 0.55; return { p: 0.9, answer: { verb: 'posture', params: { height: h } } }; }
      if (vk === 'turn') { const d = (spec.degrees || {})[normalize(verb.hit).trim()] ?? 180; return { p: 0.9, answer: { verb: 'turn', params: { degrees: d } } }; }
      const target = thing.key ? 'thing:' + thing.key : undefined;
      if ((vk === 'look' || vk === 'touch' || vk === 'take') && !target) return { p: vk === 'look' ? 0.8 : 0.6, answer: { verb: vk } };
      return { p: 0.9, answer: Object.assign({ verb: vk === 'make' ? 'make' : vk }, target ? { target } : {}) };
    }
    if (thing.key) return { p: 0.6, answer: { verb: 'look', target: 'thing:' + thing.key } };   // a thing named alone: she looks at it
    return { p: 0.3, answer: { verb: 'other' } };
  }
  function commitId(w, cls) { let id = 'c.' + cls, n = 1; while (w.commitments[id]) id = 'c.' + cls + '.' + (++n); return id; }
  /* The station a "go" means: forward (later in the pack's order) or back; at a fork the via anchors choose the edge. */
  function goTarget(w, at, back, text) {
    const st = w.stations[at]; if (!st) return null;
    const i = order.indexOf(at), edges = (st.edges || st.next.map(to => ({ to })));
    const E = edges.filter(e => back ? order.indexOf(e.to) < i : order.indexOf(e.to) > i);
    if (!E.length) return null;
    if (E.length === 1) return { station: E[0].to, via: E[0].via };
    const via = best(text, A.via).key, e = E.find(x => x.via === via) || E[0];
    return { station: e.to, via: e.via, fork: true };
  }
  /* The arrival line of a station, if it has one and she has not said it yet. */
  function arriveLine(id) {
    const s = stations.find(x => x.id === id), ref = s && s.arrive_line;
    return ref && hasLine(ref) && !world().said.some(x => x.ref === ref) ? ref : null;
  }

  function reaction(intent) {
    const w = world(), n = notes.get(intent.text) || {}, out = [], p = n.p ?? 0.3;
    if (p < (V.ask_below ?? 0.5)) return [say(V.ask_line || 'ask.back')];
    if (intent.verb === 'commit') {
      const c = A.commit_classes[intent.class], id = intent.commit;
      const refuse = c.refuse || (c.refuse_in_beats || []).includes(w.story.beat);
      const status = refuse ? 'refused' : n.amend && c.amend ? 'amended' : 'accepted';
      out.push(status === 'amended' && c.amend.line ? sayLine(c.amend.line) : say(status === 'refused' ? 'commit.refuse' : 'commit.accept'));
      out.push({ author: player, horizon: 'story', kind: 'fact', body: { subject: carrier, predicate: 'promised', value: (refuse ? 'refused: ' : '') + String(c.promise || intent.behaviour).slice(0, 110), commit: { id, party: carrier, status, strength: 'hard' } } });
      if (!refuse && c.rule) out.push({ author: player, horizon: 'story', kind: 'rule', body: Object.assign({ id, commit: id }, JSON.parse(JSON.stringify(c.rule))) });
      return out;
    }
    if (n.classLine !== undefined) { if (n.classLine && n.unless !== w.body.station) out.push(say(n.classLine)); return out; }
    if (n.line) return [say(n.line)];
    const spec = (V.verbs || {})[intent.verb] || {};
    switch (intent.verb) {
      case 'go': {
        if (!intent.target) return [say('move.v2')];
        const to = intent.target.slice(8), fork = n.fork && n.via && hasLine('fork.' + n.via) ? 'fork.' + n.via : null;
        out.push(say(fork || (n.please === false && hasLine('move.please') && !w.said.some(x => x.ref === 'move.please') ? 'move.please' : 'move.ok')));
        out.push(act(Object.assign({ op: 'go', to: intent.target }, n.via ? { via: n.via } : {})));
        const a = arriveLine(to); if (a) out.push(say(a));
        return out;
      }
      case 'look': return intent.target ? [say('look.ok'), act({ op: 'look', target: intent.target })] : [say('look.ok')];
      case 'touch': case 'take': {
        const st = w.stations[w.body.station], id = intent.target ? intent.target.slice(6) : (st.within || [])[0];
        if (!id || !(st.within || []).includes(id)) return [say('engine.cant')];
        return [say(spec.line || 'touch.ok'), act({ op: intent.verb, target: 'thing:' + id })];
      }
      case 'posture': return [say('move.ok'), act({ op: 'posture', height: intent.params.height })];
      case 'turn': return [act({ op: 'turn', degrees: intent.params.degrees })];
      case 'wait': return [act({ op: 'wait', seconds: 3 })];
      case 'stop': return [act({ op: 'stop' })];
      case 'make': case 'shape': return [say('make.cant')];
    }
    return [say(V.ask_line || 'ask.back')];
  }

  return {
    async embed(texts) { return texts.map(t => [...normalize(t)].slice(0, 8).map(c => c.charCodeAt(0) / 255)); },
    async decide(req) {
      if (req.question === 'intent') {
        const r = analyse(req.text);
        notes.set(req.text, Object.assign({ p: r.p }, r.note || {}));
        if (notes.size > 32) notes.delete(notes.keys().next().value);
        return { answer: r.answer, p: r.p, uncertain: r.p < (V.act_from ?? 0.8), tier: 'reflex' };
      }
      if (req.question === 'reaction') return { answer: serialize(reaction(req.state.intent)), tier: 'reflex' };
      return { answer: null, p: 0, uncertain: true, tier: 'reflex' };
    },
    arrival() { const a = arriveLine(world().body.station); return a ? [say(a)] : []; },
    analyse,
  };
}
