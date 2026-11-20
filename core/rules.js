/* Rules (docs/pdl-spec.md §7): registered by horizon with author and layer, matched against events, guarded, fired in code.
   A rule is data: when (event + match), if (conditions), then (bounded templates), limits (max_fires, cooldown_s).
   Loops are forbidden: a rule never fires twice in one causal chain (cycle), and a chain is at most rule_depth_max
   firings deep (depth). Self-triggering is refused at validation (pdl.js). */
import { live, evalCond, compare } from './world.js';

const clone = o => JSON.parse(JSON.stringify(o));

export function registerRule(w, body, meta) {
  const prev = w.rules[body.id];
  w.rules[body.id] = Object.assign(clone(body), {
    horizon: meta.horizon, author: meta.author, layer: meta.author.layer || meta.layer || null, tx: meta.seq,
    scene: meta.horizon === 'scene' ? w.clock.scene : null, expires: meta.ttl ? Math.round((w.clock.t + meta.ttl) * 1e4) / 1e4 : null,
    fires: 0, last_fire: null, supersedes: prev ? prev.tx : undefined,
  });
  if (w.rules[body.id].supersedes === undefined) delete w.rules[body.id].supersedes;
  return w.rules[body.id];
}

export function matches(rule, ev) {
  if (rule.when.event !== ev.event) return false;
  for (const [k, m] of Object.entries(rule.when.match || {})) if (!compare(ev.data ? ev.data[k] : undefined, m)) return false;
  return true;
}

/* Live rules that match an event, in registration order. */
export function candidates(w, ev) {
  const t = w.clock.t;
  return Object.values(w.rules).filter(r => live(r, t) && (r.horizon !== 'scene' || r.scene === w.clock.scene) && matches(r, ev)).sort((a, b) => a.tx - b.tx || (a.id < b.id ? -1 : 1));
}

/* Can this rule fire for this event? → { ok, reason } with reason in max_fires | cooldown | cycle | depth | condition. */
export function guard(w, rule, ev, budget) {
  const L = rule.limits || {};
  if (rule.fires >= (L.max_fires ?? 1)) return { ok: false, reason: 'max_fires' };
  if (rule.last_fire !== null && w.clock.t - rule.last_fire < (L.cooldown_s ?? 0)) return { ok: false, reason: 'cooldown' };
  if ((ev.chain || []).includes(rule.id)) return { ok: false, reason: 'cycle' };
  if ((ev.depth || 0) >= budget.rule_depth_max) return { ok: false, reason: 'depth' };
  if (!(rule.if || []).every(c => evalCond(w, c))) return { ok: false, reason: 'condition' };
  return { ok: true };
}

export function markFired(w, rule) { rule.fires++; rule.last_fire = w.clock.t; }

/* The transactions a firing proposes: the templates with "$event.<field>" replaced by the event's data. */
export function instantiate(rule, ev) {
  const sub = v => typeof v === 'string' && v.startsWith('$event.') ? (ev.data || {})[v.slice(7)] : Array.isArray(v) ? v.map(sub) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, sub(x)])) : v;
  return (rule.then || []).map(t => Object.assign({ horizon: t.horizon, kind: t.kind, body: sub(clone(t.body)) }, t.ttl !== undefined ? { ttl: t.ttl } : {}));
}
