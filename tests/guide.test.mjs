// The interactive guide (briefs/guide.md): the core inlined in the built page is the real core, and the build is deterministic.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildGuide } from '../tools/build-guide.mjs';

const ROOT = new URL('../', import.meta.url);
const between = (html, open) => { const i = html.indexOf(open); assert.ok(i >= 0, open); return html.slice(i + open.length, html.indexOf('</script>', i)); };

test('the core inlined in dist/guide.html replays the golden journal p8 to the committed hash', () => {
  const html = readFileSync(new URL('dist/guide.html', ROOT), 'utf8');
  const CORE = new Function(between(html, '<script id="core">') + '\nreturn CORE;')();
  const data = JSON.parse(between(html, '<script type="application/json" id="guide-data">'));
  const golden = readFileSync(new URL('tests/golden/p8-louis-pack.jsonl', ROOT), 'utf8');
  assert.equal(data.golden['p8-louis-pack'], golden, 'the page carries the committed journal');
  const E = CORE.journal.fromJSONL(golden), r = CORE.journal.replay(E, CORE.paperWorld.createPaperWorld());
  assert.equal(r.hash, E.filter(e => e.type === 'hash').pop().hash);
  assert.ok(CORE.journal.diff(E, r.journal).equal);
  // and the pack inlined as data compiles to the scene the journal was recorded on
  assert.deepEqual(CORE.source.compilePack(data.pack, data.library).scene, E[0].scene);
});

test('the guide build is deterministic', () => {
  const a = buildGuide(), b = buildGuide();
  assert.equal(a.full, b.full);
  assert.equal(a.artefact, b.artefact);
  assert.ok(a.artefact.startsWith('<title>Bodycam Stories Field Guide</title>') && !/<(!doctype|html|head|body)[\s>]/i.test(a.artefact));
  assert.ok(Buffer.byteLength(a.artefact) < 2e6, 'artifact under 2 MB');
});
