/* The session (docs/pdl-spec.md §9): the only way into the world.
   submit(tx) → validate → journal → execute (core state + executor call) → events → rules fire → their transactions take
   the same path, tagged with `cause` { tx, rule, commit }. Processing is breadth-first and deterministic.
   Inputs (journaled with `input: true`, re-run by replay): submit, advance, observe, loadPrinciples, modelCall, audit, checkpoint. */
import { validate, BUDGET, EVENTS, refId } from './pdl.js';
import { createWorld, applyEffect, observe as observeBody, expire, stateHash, rngFor, inReach, evalCond, gaugeWord } from './world.js';
import { registerRule, candidates, guard, markFired, instantiate, matches } from './rules.js';
import { createJournal } from './journal.js';
import { inScope } from './source.js';

/* The three clocks (P20): latency budgets in ms. A transaction records its loop and its latency against the budget;
   a slower loop adds to, amends or cancels what a faster one did (cause.amends), it never makes it wait. */
export const LOOPS = { now: 500, scene: 8000, story: 120000 };

const clone = o => o === undefined ? undefined : JSON.parse(JSON.stringify(o));
const r4 = x => Math.round(x * 1e4) / 1e4;
const TRANSITIONS = { proposed: ['accepted', 'amended', 'refused'], accepted: ['kept', 'broken'], amended: ['kept', 'broken'], due: ['kept', 'broken'] };

export function createSession({ scene, seed = 1, executor, budget, journal, onDue } = {}) {
  const B = Object.assign({}, BUDGET, budget || {});
  const w = createWorld(scene, { seed });
  const J = journal || createJournal();
  const ex = executor;
  J.append({ t: 0, type: 'session', v: 0, seed, scene: clone(scene), budget: clone(budget || {}) });
  const queue = [];

  const ctxFor = seq => ({ world: w, seq, seed, rng: rngFor(seed, seq) });
  const call = (name, args, seq) => { const f = ex && ex[name]; if (!f) return []; const r = f(clone(args), ctxFor(seq)); return Array.isArray(r) ? r : []; };

  /* ------------------------------------------------------------ events and rules */
  function emit(ev, src) {
    const e = Object.assign({ event: ev.event, data: ev.data || {} }, { depth: src.depth || 0, chain: src.chain || [] });
    J.append({ t: w.clock.t, type: 'event', event: e.event, data: clone(e.data), cause: src.seq });
    observeBody(w, e);
    if (!EVENTS[e.event]) return;
    if (e.event === 'station.entered') {                       // a station belongs to a beat: entering it may enter the beat
      const b = w.stations[e.data.id] && w.stations[e.data.id].beat;
      if (b && b !== w.story.beat) { w.story.beat = b; emit({ event: 'beat.entered', data: { id: b } }, src); }
    }
    for (const g of Object.values(w.gauges)) {                 // gauges rise on the events that feed them (§6.5)
      if (e.event === 'gauge.changed' && e.data.id === g.id) continue;
      let by = 0;
      for (const r of g.rises) if (matches({ when: r.on }, e) && (r.if || []).every(c => evalCond(w, c))) by += r.by;
      if (by) setGauge(g, g.value + by, src, e);
    }
    for (const rule of candidates(w, e)) {
      const g = guard(w, rule, e, B);
      if (!g.ok) { if (g.reason !== 'condition') J.append({ t: w.clock.t, type: 'rule', rule: rule.id, status: 'blocked', reason: g.reason, cause: { tx: src.seq } }); continue; }
      markFired(w, rule);
      const fire = J.append({ t: w.clock.t, type: 'rule', rule: rule.id, status: 'fired', event: e.event, cause: Object.assign({ tx: src.seq }, rule.commit ? { commit: rule.commit } : {}), author: rule.author, layer: rule.layer });
      const cause = Object.assign({ tx: fire.seq, rule: rule.id }, rule.commit ? { commit: rule.commit } : {});
      const next = { depth: (src.depth || 0) + 1, chain: [...(src.chain || []), rule.id] };
      const cm = rule.commit && w.commitments[rule.commit];
      if (cm) setCommit(cm, 'due', fire.seq);
      if (rule.strength === 'tendency') {                     // weighed by a model at firing time (§8.6)
        emit({ event: 'commitment.due', data: { commit: rule.commit || null, rule: rule.id } }, { seq: fire.seq, depth: next.depth, chain: next.chain });
        if (onDue) onDue({ commit: rule.commit, rule: rule.id, seq: fire.seq, proposals: instantiate(rule, e) });
        continue;
      }
      const txs = instantiate(rule, e);
      const group = { left: txs.length, ok: true, commit: cm, cause, next };
      for (const tx of txs) queue.push({ tx: Object.assign(tx, { author: { kind: 'engine', id: 'rules' }, cause }), meta: Object.assign({ loop: src.loop || 'now' }, next), group });
    }
  }
  function setGauge(g, v, src) {
    const before = gaugeWord(g), x = r4(Math.min(1, Math.max(0, v)));
    if (x === g.value) return;
    g.value = x;
    emit({ event: 'gauge.changed', data: { id: g.id, value: g.value, word: gaugeWord(g), was: before } }, src);
  }
  /* A line of the pack's bank: variants per language (strings or { speaker, text }), one drawn by the seeded generator. */
  function pickLine(L, seq) {
    if (!L) return {};
    const out = {}, r = rngFor(seed, seq)();
    for (const [lang, v] of Object.entries(L)) {
      const vs = [].concat(v); const x = vs[Math.floor(r * vs.length) % vs.length];
      out[lang] = typeof x === 'string' ? x : x && x.text;
      if (x && x.speaker) out.speaker = x.speaker;
    }
    return out;
  }
  function mentions(p, g) {
    const t = ((p.text || '') + ' ' + (p.note || '')).toLowerCase();
    return new RegExp(`\\b${g.id.replace(/[.-]/g, m => '\\' + m)}\\b`).test(t) || (g.label && t.includes(g.label.toLowerCase()));
  }
  function setCommit(cm, status, seq) { cm.status = status; cm.history.push({ status, seq }); }

  /* ------------------------------------------------------------ one transaction */
  function process(tx0, meta = {}, input = null) {
    const seq = J.nextSeq();
    const tx = Object.assign(clone(tx0), { id: seq, t: w.clock.t });
    if (meta.cause && !tx.cause) tx.cause = meta.cause;
    const res = validate(tx, w, B);
    if (res.status !== 'rejected' && res.tx.kind === 'fact' && res.tx.body.commit) checkCommit(res);
    const t = res.tx || tx;
    const loop = (input && input.loop) || meta.loop || (t.author && t.author.tier === 'background' ? 'story' : t.author && t.author.tier === 'stage' ? 'scene' : 'now');
    const lat = input && typeof input.latency_ms === 'number' ? input.latency_ms : undefined;
    const entry = { t: w.clock.t, type: 'tx', loop, latency_ms: lat, budget_ms: lat !== undefined ? LOOPS[loop] : undefined, late: lat !== undefined ? lat > LOOPS[loop] : undefined,
      author: t.author, tier: t.author && t.author.tier, horizon: t.horizon, kind: t.kind, status: res.status,
      repair: res.repair.length ? res.repair : undefined, reasons: res.reasons.length ? res.reasons : undefined, cause: t.cause, depth: meta.depth || 0,
      body: res.status === 'rejected' ? clone(tx0.body) : t.body, ttl: t.ttl, timings: input ? input.timings : undefined, input: !!input, proposed: input ? clone(tx0) : undefined };
    J.append(entry);
    if (res.status === 'rejected') return { seq, status: res.status, reasons: res.reasons, repair: res.repair, tx: t };
    const src = { seq, depth: meta.depth || 0, chain: meta.chain || [], loop };
    if (t.cause && t.cause.amends !== undefined) {               // a slower loop amends a faster one: the link is kept both ways
      const said = w.said.find(x => x.tx === t.cause.amends); if (said) said.amended_by = seq;
    }
    for (const ev of apply(t, seq, res)) emit(ev, src);
    return { seq, status: res.status, repair: res.repair, reasons: [], tx: t };
  }
  function checkCommit(res) {
    const c = res.tx.body.commit, cm = w.commitments[c.id];
    const bad = why => { res.status = 'rejected'; res.reasons.push({ path: 'body.commit', why }); };
    if (!cm) return bad('unknown_commitment');
    if (!(TRANSITIONS[cm.status] || []).includes(c.status)) bad('bad_transition');
  }

  /* What a valid transaction does to the core state, and the executor call it makes. Returns events. */
  function apply(tx, seq, res) {
    const b = tx.body, meta = { seq, horizon: tx.horizon, ttl: tx.ttl, author: tx.author, evict: res.evict };
    switch (tx.kind) {
      case 'intent': {
        w.intents[seq] = Object.assign(clone(b), { t: w.clock.t });
        const keys = Object.keys(w.intents).map(Number).sort((a, c) => a - c); while (keys.length > 8) delete w.intents[keys.shift()];
        w.clock.voice_t = w.clock.t;
        const ev = [{ event: 'intent.heard', data: { verb: b.verb, target: b.target, text: b.text, class: b.class, loud: b.loud === true } }];
        if (b.verb === 'commit') {
          const id = b.commit || 'c' + seq;
          w.commitments[id] = { id, intent: seq, class: b.class || null, condition: b.condition, behaviour: b.behaviour, status: 'proposed', author: { kind: 'player', id: 'player' }, party: null, strength: null, rule: null, history: [{ status: 'proposed', seq }] };
        }
        return ev;
      }
      case 'act': {
        const ev = [];
        const args = clone(b); delete args.op;
        let edge = null;
        if (b.op === 'go') {
          args.from = w.body.station; args.station = refId(b.to);
          const E = (w.stations[args.from].edges || []).filter(e => e.to === args.station);
          edge = E.find(e => b.via && e.via === b.via) || E[0] || null;
          if (edge && edge.via) args.via = edge.via;
          if (w.stations[args.station].posture !== undefined) args.posture = w.stations[args.station].posture;
        }
        if (b.target && b.target.startsWith('thing:')) args.thing = refId(b.target);
        if (b.op === 'say') {
          const line = b.line || pickLine(w.vocab.lines[b.ref], seq);
          args.line = line; args.lang = w.langs.find(l => line[l]) || w.langs[0];
          w.said.push({ t: w.clock.t, line, tone: b.tone, ref: b.ref, tx: seq });
          ev.push({ event: 'said', data: { text: line[args.lang] || '', lang: args.lang, ref: b.ref } });
        }
        ev.unshift(...call(b.op, args, seq).filter(e => e && typeof e.event === 'string'));
        if (b.op === 'look' && b.target) ev.push({ event: 'look.at', data: { target: b.target, s: 0 } });
        if (b.op === 'go') {                                     // the transition: its battery cost, what it establishes, the beat
          const st = w.stations[args.station];
          if (edge && edge.cost_s && w.camera.drain_per_s) {
            w.camera.battery = r4(Math.max(0, w.camera.battery - edge.cost_s * w.camera.drain_per_s));
            ev.push({ event: 'camera.changed', data: { battery: w.camera.battery, degrade: w.camera.degrade, shake: w.camera.shake } });
          }
          if (edge && edge.establishes) queue.push({ tx: { author: { kind: 'engine', id: 'stations' }, horizon: 'story', kind: 'fact', cause: { tx: seq },
            body: { subject: edge.establishes, predicate: 'established', value: true, source: `went ${args.from} -> ${args.station}${edge.via ? ' by ' + edge.via : ''}` } }, meta: {}, group: null });
        }
        ev.push({ event: 'act.done', data: { op: b.op, target: b.target, to: b.to } });
        return ev;
      }
      case 'effect': {
        const r = applyEffect(w, b, meta);
        const extra = r.call ? call(r.call[0], r.call[1], seq) : [];
        return [...r.events, ...extra];
      }
      case 'fact': {
        const f = Object.assign(clone(b), { tx: seq, t: w.clock.t, author: tx.author, horizon: tx.horizon, scene: tx.horizon === 'scene' ? w.clock.scene : null, expires: null });
        w.facts.push(f);
        if (w.facts.length > B.facts_max) w.facts.shift();
        if (b.commit) {
          const cm = w.commitments[b.commit.id];
          cm.party = b.commit.party; cm.strength = b.commit.strength; cm.fact = cm.fact || seq;
          setCommit(cm, b.commit.status, seq);
        }
        return [{ event: 'fact.added', data: { subject: b.subject, predicate: b.predicate, value: b.value, certainty: b.certainty } }];
      }
      case 'rule': {
        const r = registerRule(w, b, meta);
        if (b.commit && w.commitments[b.commit]) w.commitments[b.commit].rule = r.id;
        return [{ event: 'rule.registered', data: { id: r.id, horizon: r.horizon, author: r.author } }];
      }
      case 'cancel': {
        const [k, id] = [b.target.slice(0, b.target.indexOf(':')), b.target.slice(b.target.indexOf(':') + 1)];
        if (k === 'rule') delete w.rules[id];
        if (k === 'commit') { const cm = w.commitments[id]; if (cm.rule) delete w.rules[cm.rule]; setCommit(cm, 'broken', seq); }
        if (k === 'tx') { for (const th of Object.values(w.things)) if (String(th.tx) === id) { delete w.things[th.id]; call('removeThing', { id: th.id, reason: 'cancelled' }, seq); } w.facts = w.facts.filter(f => String(f.tx) !== id); }
        return [{ event: 'cancelled', data: { target: b.target } }];
      }
    }
    return [];
  }

  /* Rule-fired transactions, breadth-first. A commitment whose rule fired is kept if all its effects went through. */
  function drain() {
    while (queue.length) {
      const { tx, meta, group } = queue.shift();
      const r = process(tx, meta);
      if (!group) continue;
      if (r.status === 'rejected') group.ok = false;
      if (--group.left === 0 && group.commit) {
        const cm = group.commit;
        queue.push({ tx: { author: { kind: 'engine', id: 'rules' }, horizon: 'story', kind: 'fact', cause: group.cause,
          body: { subject: cm.party || 'character', predicate: group.ok ? 'kept' : 'broke', value: cm.id, commit: { id: cm.id, party: cm.party || 'character', status: group.ok ? 'kept' : 'broken', strength: cm.strength || 'hard' } } }, meta: group.next, group: null });
      }
    }
  }

  /* ------------------------------------------------------------ public inputs */
  const S = {
    world: w, journal: J, budget: B,
    submit(tx, { timings, loop, latency_ms } = {}) { const r = process(tx, {}, { timings, loop, latency_ms }); drain(); return r; },
    submitAll(txs, opts) { return [].concat(txs).map(t => S.submit(t, opts)); },
    advance(dt) {
      const e = J.append({ t: w.clock.t, type: 'advance', dt, input: true });
      w.clock.t = r4(w.clock.t + dt);
      const evs = [];
      if (w.camera.drain_per_s > 0 && w.camera.battery > 0) {
        w.camera.battery = r4(Math.max(0, w.camera.battery - w.camera.drain_per_s * dt));
        evs.push({ event: 'camera.changed', data: { battery: w.camera.battery, degrade: w.camera.degrade, shake: w.camera.shake } });
      }
      evs.push(...expire(w));
      for (const g of Object.values(w.gauges)) {
        if (!g.value || !g.fades) continue;
        const before = gaugeWord(g); g.value = r4(Math.max(0, g.value - g.fades.per_minute * dt / 60));
        if (gaugeWord(g) !== before) evs.push({ event: 'gauge.changed', data: { id: g.id, value: g.value, word: gaugeWord(g), was: before } });
      }
      evs.push({ event: 'clock.tick', data: { t: w.clock.t, scene_t: r4(w.clock.t - w.clock.scene_t0), station: w.body.station,
        dwell_s: r4(w.clock.t - w.clock.station_t0), silent_s: r4(w.clock.t - w.clock.voice_t) } });
      for (const ev of evs) emit(ev, { seq: e.seq });
      drain();
    },
    start() { const e = J.append({ t: w.clock.t, type: 'start', input: true }); emit({ event: 'session.started', data: {} }, { seq: e.seq }); drain(); },
    observe(ev) { const e = J.append({ t: w.clock.t, type: 'observe', event: ev.event, data: clone(ev.data || {}), input: true }); emit(ev, { seq: e.seq }); drain(); },
    /* Principles from PDL source (core/source.js). Compiled `!!` become constraints; compiled rules go through submit. */
    loadPrinciples(records) {
      const e = J.append({ t: w.clock.t, type: 'principles', records: clone(records), input: true });
      const out = [];
      for (const p of records) {
        const rec = clone(p); w.principles[p.id] = rec;
        const ok = p.compiled && ['compiled', 'approved'].includes(p.compiled.status);
        if (ok && p.compiled.kind === 'gauge') w.gauges[p.id] = Object.assign({ value: 0 }, clone(p.compiled.body), { id: p.id, author: p.author, layer: p.layer });
        if (ok && p.compiled.kind === 'constraint') w.constraints[p.id] = Object.assign({ id: p.id }, clone(p.compiled.body), { author: p.author, layer: p.layer });
        if (ok && p.compiled.kind === 'rule') out.push(process({ author: Object.assign({}, p.author, { layer: p.layer }), horizon: p.horizon, kind: 'rule', body: Object.assign({}, p.compiled.body, { principle: p.id }), cause: { tx: e.seq } }));
      }
      drain();
      return out;
    },
    /* A model call happened: record its tier, timings and the soft principles in scope (§2.7, §9.2). */
    /* Soft principles that mention a gauge carry its value and word (P10). status: done | pending | landed (ref_seq: the
       pending call it answers). */
    modelCall({ tier, purpose, character, timings, loop, status, ref_seq, latency_ms } = {}) {
      const P = inScope(Object.values(w.principles), { character, scene: w.clock.scene });
      const gauges = Object.values(w.gauges).map(g => {
        const by = P.filter(p => mentions(p, g)).map(p => p.id);
        return by.length ? { id: g.id, value: g.value, word: gaugeWord(g), mentioned_by: by } : null;
      }).filter(Boolean);
      return J.append({ t: w.clock.t, type: 'model_call', loop, status, ref_seq, tier, purpose, character, principles: P.map(p => p.id), gauges: gauges.length ? gauges : undefined, latency_ms, timings, input: true });
    },
    audit(records) { for (const a of records) J.append(Object.assign({ t: w.clock.t }, clone(a), { type: 'audit', input: true })); },
    inReach: id => inReach(w, id),
    hash: () => stateHash(w),
    checkpoint() { return J.append({ t: w.clock.t, type: 'hash', hash: stateHash(w), input: true }); },
  };
  return S;
}
