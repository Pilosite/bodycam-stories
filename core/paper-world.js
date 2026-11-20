/* The paper world: an in-memory executor (docs/pdl-spec.md §9.1) used by tests and golden replays.
   It plays the engine: it receives the calls, keeps a log of them, and reports what the body did, deterministically. */
import { EXECUTOR_METHODS, posOf } from './world.js';

export function createPaperWorld() {
  const calls = [];
  const ex = { calls };
  for (const m of EXECUTOR_METHODS) ex[m] = (args) => { calls.push([m, args]); return []; };
  const r2 = x => Math.round(x * 100) / 100;
  ex.go = (a) => { calls.push(['go', a]); return [{ event: 'station.left', data: { id: a.from } }, { event: 'station.entered', data: { id: a.station } }, ...(a.posture !== undefined ? [{ event: 'body.pose', data: { height: a.posture } }] : [])]; };
  ex.look = (a, ctx) => {
    calls.push(['look', a]);
    const w = ctx.world, pose = {};
    if (a.target && !a.target.startsWith('dir:')) {
      const p = posOf(w, a.target), s = posOf(w, 'body');
      if (p && s) pose.yaw = r2(Math.atan2(p[0] - s[0], p[1] - s[1]) * 180 / Math.PI);
    }
    if (a.yaw !== undefined) pose.yaw = a.yaw;
    if (a.pitch !== undefined) pose.pitch = a.pitch;
    return Object.keys(pose).length ? [{ event: 'body.pose', data: pose }] : [];
  };
  ex.turn = (a, ctx) => { calls.push(['turn', a]); return [{ event: 'body.pose', data: { yaw: r2(((ctx.world.body.yaw + a.degrees + 540) % 360) - 180) } }]; };
  ex.posture = (a) => { calls.push(['posture', a]); return [{ event: 'body.pose', data: { height: a.height } }]; };
  ex.take = (a) => { calls.push(['take', a]); return [{ event: 'body.held', data: { id: a.thing } }]; };
  return ex;
}
