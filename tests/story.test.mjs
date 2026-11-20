// The creator kit's command line (tools/story.mjs): its pure functions, on the golden journals and the template.
// Level A (docs/sdlc.md §3): no browser, no model; the golden p8 journal is reused, no new end-to-end run.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fromJSONL } from '../core/journal.js';
import { parseScript, auditJournal, whatif, checkPack, compileForPlay, loadPack, loadLibrary, play, explain, ROOT } from '../tools/story.mjs';

const library = loadLibrary();
const P8 = fromJSONL(readFileSync(new URL('./golden/p8-louis-pack.jsonl', import.meta.url), 'utf8'));
const louis = () => loadPack(ROOT + 'stories/louis-round');

test('script parsing: lines said, time, gaze, pinned intents and the promised rule', () => {
  const { steps, errors } = parseScript(`# comment
lang fr
wait 15
look marque-1 3
say! ARRÊTE
say regarde ce trait orange => look marque-1
say si le geai crie, arrête-toi => commit jay amend
  when sound(jay.alarm) -> body.stop, say(commit.keeping)
say descends => go approach via=tape
  when said.loud -> body.stop
fly away`);
  assert.deepEqual(steps.map(s => s.kind), ['wait', 'look', 'say', 'say', 'say', 'say']);
  assert.deepEqual(steps[1], { kind: 'look', target: 'marque-1', seconds: 3, line: 4 });
  assert.equal(steps[2].loud, true);
  assert.equal(steps[2].lang, 'fr');
  assert.deepEqual(steps[3].pin, { verb: 'look', target: 'marque-1' });
  assert.deepEqual(steps[4].pin, { verb: 'commit', class: 'jay', answer: 'amend' });
  assert.equal(steps[4].rule, 'when sound(jay.alarm) -> body.stop, say(commit.keeping)');
  assert.deepEqual(steps[5].pin, { verb: 'go', target: 'approach', via: 'tape' });
  assert.deepEqual(errors.map(e => e.line), [10, 11], 'a rule under a non-promise, an unknown line');
  assert.deepEqual(parseScript('[{"say":"hello","lang":"en"},{"wait":5}]').steps.map(s => s.kind), ['say', 'wait']);
});

test('audit of the golden p8 journal: asks, rejections by principle, rules fired and never fired, the promise kept', () => {
  const a = auditJournal(P8);
  assert.deepEqual(a.asked.map(x => x.verb), ['look', 'commit']);
  assert.deepEqual(a.rejected.flatMap(x => x.principles), ['sam.never.harm']);
  for (const r of ['louis-marks.sign-read.1', 'r.jay-first', 'c.jay', 'battery-clock.half']) assert.ok(a.rules.fired[r], r);
  assert.ok(a.rules.never.includes('r.rustle') && !a.rules.never.includes('c.jay'));
  assert.deepEqual(a.commitments.map(c => [c.id, c.history.map(h => h.status)]), [['c.jay', ['proposed', 'amended', 'due', 'kept']]]);
  assert.deepEqual(a.judged['sam.word.keeps'], { relevant: 1, respected: 1, broken: 0, rate: 1, breaks: [] });
  assert.deepEqual(a.late.map(x => x.loop), ['now']);
  assert.deepEqual(a.beats, ['platiere', 'hide']);
});

test('whatif: the golden p8 against the pack as it is changes nothing; with one rule edited, the promise is never tested', () => {
  const same = whatif(P8, compileForPlay(louis(), library).compiled);
  assert.ok(same.equal, 'the pack compiled by the tool is the pack of the golden journal');
  assert.deepEqual(same.carried, ['sam.never.harm'], 'the approved absolute is carried from the journal');
  const p = louis();
  p.texts['rules/hide.pdl'] = p.texts['rules/hide.pdl'].replace('when station.entered(approach) once -> sound(jay.alarm)', 'when said.loud once if at(approach) -> sound(jay.alarm)');
  const w = whatif(P8, compileForPlay(p, library).compiled);
  assert.ok(!w.equal);
  assert.deepEqual(w.pack.changed.map(c => [c.id, c.what]), [['r.jay-first', ['text']]]);
  assert.deepEqual(w.rules.only_before.sort(), ['c.jay', 'r.jay-first']);
  assert.deepEqual([w.before.commitments['c.jay'], w.now.commitments['c.jay']], ['kept', 'amended']);
  assert.ok(w.first_in_play > w.first, 'setup differs first (the rule as registered), play later');
  assert.equal(w.before.rejected, w.now.rejected, 'the absolute still rejects');
  assert.notEqual(w.hashes.before, w.hashes.now);
});

test('the template passes check and plays: a promise made at the first station is kept at the second', async () => {
  const pack = loadPack(ROOT + 'stories/_template');
  const r = checkPack(pack, library);
  assert.deepEqual(r.errors, []);
  for (const l of pack.manifest.languages) assert.ok(pack.lines[l].lines['clearing.arrive'], 'lines in ' + l);
  const { steps } = parseScript(readFileSync(ROOT + 'stories/_template/scripts/first.txt', 'utf8'));
  const s = await play(pack, library, steps);
  const a = auditJournal(s.session.journal.entries);
  assert.deepEqual(a.commitments.map(c => c.status), ['kept']);
  assert.ok(a.rules.fired['r.clearing']);
  assert.equal(s.session.world.body.station, 'clearing');
});

test('explain names who enforces a statement and what refers to it', () => {
  const x = explain(louis(), library, 'r.jay-first');
  assert.match(x.enforced_by, /^code/);
  assert.ok(x.refs.some(r => r.where === 'beats.json' && /c\.jay/.test(r.text)));
  const f = explain(louis(), library, 'f.jay-heard');
  assert.deepEqual(f.refs.filter(r => r.mark === 'when').map(r => r.id).sort(), ['r.jay-first', 'r.jay-loud']);
  assert.match(explain(louis(), library, 'sam.never.harm').enforced_by, /^nobody yet/);
});
