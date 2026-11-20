/* The interactive guide (briefs/guide.md). Every live panel calls the real core/ (inlined above as CORE) on the real pack
   stories/louis-round (inlined as data, with the golden journal p8). No network, no model: where a model would answer, a
   fixed answer written in advance is used and marked "canned answer". Copy: guide/copy.js. */
(function () {
'use strict';
var D = JSON.parse(document.getElementById('guide-data').textContent);
var C = CORE;
var lang = 'en';

/* ---------------------------------------------------------------- small helpers */
function t(k) {
  var s = (COPY[lang] && COPY[lang][k]) !== undefined ? COPY[lang][k] : COPY.en[k];
  if (s === undefined) return k;
  for (var i = 1; i < arguments.length; i++) s = s.replace('%s', arguments[i]);
  return s;
}
function h(tag, attrs) {
  var e = document.createElement(tag), a = attrs || {};
  Object.keys(a).forEach(function (k) {
    var v = a[k];
    if (v === null || v === undefined || v === false) return;
    if (k === 'class') e.className = v; else if (k === 'html') e.innerHTML = v; else if (k === 'text') e.textContent = v;
    else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), v); else e.setAttribute(k, v === true ? '' : v);
  });
  for (var i = 2; i < arguments.length; i++) [].concat(arguments[i]).forEach(function (c) { if (c !== null && c !== undefined && c !== false) e.append(c.nodeType ? c : String(c)); });
  return e;
}
var $ = function (id) { return document.getElementById(id); };
function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function json(o) { return JSON.stringify(o, null, 2); }
function pre(text, cls) { return h('pre', { class: 'code' + (cls ? ' ' + cls : '') }, text); }
function chip(text, cls) { return h('span', { class: 'chip' + (cls ? ' ' + cls : '') }, text); }
function canned() { return chip(t('canned'), 'canned'); }
function clear(el) { while (el.firstChild) el.removeChild(el.firstChild); return el; }
function store(k, v) { try { if (v === undefined) return localStorage.getItem(k); localStorage.setItem(k, v); } catch (e) { return null; } return null; }
function debounce(f, ms) { var id; return function () { clearTimeout(id); id = setTimeout(f, ms); }; }
function opt(sel, value, label, selected) { sel.append(h('option', { value: value, selected: selected }, label)); }
function tokens(tx) {
  try { return C.tokens.serializeTokens({ author: tx.author, horizon: tx.horizon, kind: tx.kind, body: tx.body, cause: tx.cause, ttl: tx.ttl }); }
  catch (e) { return JSON.stringify({ author: tx.author, horizon: tx.horizon, kind: tx.kind, body: tx.body }); }
}
var GLYPH = { intent: '◈', act: '⇢', effect: '∿', fact: '∴', rule: '↯', cancel: '⊘' };
function who(a) { return a ? a.kind + ':' + a.id + (a.tier ? '/' + a.tier : '') + (a.layer ? '+' + a.layer : '') : 'engine'; }

/* ---------------------------------------------------------------- the pack, compiled once */
var STATIONS = D.pack.stations.stations, PATH = STATIONS.map(function (s) { return s.id; });
function stName(id) { var s = STATIONS.find(function (x) { return x.id === id; }); return s ? (s.name[lang] || s.name.en) : id; }
var THINGS = new Set((D.pack.place.objets || []).map(function (o) { return o.id; }));
var CTX = { things: THINGS, clocks: { battery: 'camera.battery' } };
// Pack build: the one prose absolute the golden journal needs, compiled by a model and approved by the creator
// (the same canned answer as tests/core-fixture.mjs).
var HARM = { forbid: { kind: 'effect', op: 'sound.play', fields: { at: 'thing:terrier' } } };
var PACK = C.source.compilePack(D.pack, D.library);
(function () { var p = PACK.principles.find(function (x) { return x.id === 'sam.never.harm'; }); C.source.attachCompiled(p, HARM, { by: 'model:compiler' }); C.source.approve(p, 'creator:toine'); })();
var PRINC = {}; PACK.principles.forEach(function (p) { PRINC[p.id] = p; });
var LINES = PACK.scene.vocab.lines;
var ENGINE = { kind: 'engine', id: 'page' }, TRANSLATE = { kind: 'model', id: 'translator', tier: 'translate' }, STAGE = { kind: 'model', id: 'stager', tier: 'stage' }, PLAYER = { kind: 'player', id: 'player' };
function newSession(opts) { return C.session.createSession({ scene: PACK.scene, seed: 7, executor: C.paperWorld.createPaperWorld(), onDue: opts && opts.onDue }); }
function walk(s, to) {
  for (var k = PATH.indexOf(s.world.body.station) + 1; k <= PATH.indexOf(to); k++)
    s.submit({ author: ENGINE, horizon: 'now', kind: 'act', body: Object.assign({ op: 'go', to: 'station:' + PATH[k] }, PATH[k] === 'approach' ? { via: 'tape' } : {}) });
}
function sessionAt(station, opts) {
  var s = newSession(opts); s.loadPrinciples(PACK.principles);
  if (opts && opts.extra) s.loadPrinciples(opts.extra);
  s.start(); walk(s, station); return s;
}
function lineText(ref) { var L = LINES[ref]; if (!L) return null; var v = [].concat(L[lang] || L.en)[0]; return typeof v === 'string' ? v : v && v.text; }
// The source text of every statement of the pack, by id: { file, line, raw, header }
var SRC = {};
Object.keys(D.pack.texts).forEach(function (f) {
  var text = D.pack.texts[f], lines = text.split('\n'), doc = C.source.parseSource(text, { file: f });
  var header = lines.slice(0, lines.findIndex(function (l) { return /^##\s/.test(l); })).filter(function (l) { return l.trim(); }).join('\n');
  doc.statements.forEach(function (st) { SRC[st.id] = { file: f, line: st.source.line, raw: lines[st.source.line - 1].trim(), header: header, mark: st.mark }; });
});
function statementCard(id) {
  var p = PRINC[id], s = SRC[id];
  if (!p && !s) return null;
  var text = s ? s.raw : (p.mark || '') + ' ' + p.text;
  return h('div', { class: 'stmt' }, h('div', { class: 'stmt-h' }, chip(p ? p.strength : s.mark, 'k-' + (p ? p.strength : 'x')), h('code', {}, id),
    h('span', { class: 'dim' }, s ? s.file + ':' + s.line : p.instance ? 'pattern ' + p.pattern + ' → ' + p.instance : '')), pre(text, 'wrap'));
}

/* ---------------------------------------------------------------- 0. the replay check */
var P8 = C.journal.fromJSONL(D.golden['p8-louis-pack']);
var P8R = C.journal.replay(P8, C.paperWorld.createPaperWorld());
var P8HASH = P8.filter(function (e) { return e.type === 'hash'; }).pop().hash;
function renderCheck() {
  var ok = P8R.hash === P8HASH && C.journal.diff(P8, P8R.journal).equal;
  clear($('replay-check')).append(h('span', { class: ok ? 'ok' : 'bad' }, ok ? '✓ ' : '✗ '), t('hero.replay'), ': ', h('code', {}, String(P8R.hash)), ok ? ' = ' : ' ≠ ', h('code', {}, String(P8HASH)), '.');
}

/* ---------------------------------------------------------------- 1. what it is */
var BENCH = D.pack.bench.requests;
function s1Stations() {
  var sel = clear($('s1-station')), cur = sel.dataset.v || 'approach';
  PATH.concat(['any']).forEach(function (id) { opt(sel, id, id === 'any' ? 'any' : stName(id), id === cur); });
}
function s1Requests() {
  var st = $('s1-station').value, sel = clear($('s1-request')), cur = sel.dataset.v;
  var list = BENCH.filter(function (r) { return r.station === st; });
  list.forEach(function (r, i) { opt(sel, r.id, r.id + ' · ' + (r[lang] || r.en), cur ? r.id === cur : i === (st === 'approach' ? 1 : 0)); });
}
function s1() {
  var r = BENCH.find(function (x) { return x.id === $('s1-request').value; }), out = clear($('s1-out'));
  if (!r) return;
  var write = $('s1-side-write').checked;
  out.append(h('blockquote', { class: 'say' }, h('span', { class: 'voice' }, '« ' + (r[lang] || r.en) + ' »'), h('small', { class: 'dim' }, lang === 'en' ? r.fr : r.en)));
  if (!write) {
    out.append(h('div', { class: 'kv' }, h('span', { class: 'k' }, t('s1.expect')), chip(t('expect.' + r.expect), 'strong')),
      h('p', { class: 'note-data' }, r.note), r.tags ? h('p', { class: 'tags' }, r.tags.map(function (x) { return chip(x, 'tag'); })) : null);
    if (r.commit) out.append(pre(json(r.commit)));
    return;
  }
  var ids = (r.note.match(/[a-z][\w-]*(?:\.[\w-]+)+/g) || []).concat(r.commit && r.commit.tested_by ? [r.commit.tested_by] : []);
  var seen = {}, cards = [];
  ids.forEach(function (id) {
    if (seen[id]) return; seen[id] = 1;
    var c = statementCard(id);
    if (c) cards.push(c);
    else if (LINES[id]) cards.push(h('div', { class: 'stmt' }, h('div', { class: 'stmt-h' }, chip('line', 'k-line'), h('code', {}, id), h('span', { class: 'dim' }, 'lines/' + lang + '.json')), pre(lineText(id), 'wrap')));
  });
  out.append(h('h3', { class: 'sub' }, t('s1.governs')));
  out.append(cards.length ? cards : h('p', { class: 'dim' }, t('s1.none')));
}

/* ---------------------------------------------------------------- 2. from soft to hard */
var S2_PRESETS = ['sam.never.harm', 'sam.no-shout', 'r.jay-first', 'r.no-shout', 'p.one-sound', 'p.walker-when'];
(function () {
  var ex = Object.keys(SRC).find(function (id) { return SRC[id].mark === '>' && SRC[id].file === 'characters/sam.pdl'; });
  var cx = Object.keys(SRC).find(function (id) { return SRC[id].mark === 'x' && SRC[id].file === 'characters/sam.pdl'; });
  if (ex) S2_PRESETS.push(ex); if (cx) S2_PRESETS.push(cx);
})();
var S2_EXTRA = [
  { id: 'try.never', raw: '!! never go(hide) if not beat(hide) {try.hide-early}', header: '# guide — written here, not in the pack\n@kind rules  @layer base  @author you  @lang en  @scope story  @horizon story' },
  { id: 'try.gauge', raw: 'gauge unease "how uneasy Sam is": rises sound(bracken.rustle) by 0.4; fades 0.1/min {unease}', header: '# guide — written here, not in the pack\n@kind rules  @layer base  @author you  @lang en  @scope story  @horizon story' },
];
var s2Header = '';
function s2Presets() {
  var sel = clear($('s2-preset')), cur = sel.value || S2_PRESETS[0];
  S2_PRESETS.forEach(function (id) { if (SRC[id]) opt(sel, id, SRC[id].raw.slice(0, 2).trim() + '  ' + id + '  (' + SRC[id].file + ':' + SRC[id].line + ')', id === cur); });
  S2_EXTRA.forEach(function (x) { opt(sel, x.id, x.raw.slice(0, 2).trim() + '  ' + x.id + '  (' + (lang === 'fr' ? 'pas dans l’histoire : à essayer' : 'not in the pack: try it') + ')', x.id === cur); });
}
function s2Load() {
  var id = $('s2-preset').value, x = SRC[id] || S2_EXTRA.find(function (e) { return e.id === id; });
  s2Header = x.header; $('s2-header').textContent = x.header; $('s2-line').value = x.raw; s2();
}
var WORLD0 = null;
function s2() {
  var out = clear($('s2-out')), line = $('s2-line').value.replace(/\n/g, ' ').trim();
  var doc = C.source.parseSource(s2Header + '\n## edit\n' + line, { file: 'edit.pdl' });
  var errs = doc.errors.slice();
  var r = doc.statements.length ? C.source.principlesOf(doc, { layer: doc.meta.layer, author: doc.meta.author, pack: D.pack.manifest.id, ctx: CTX }) : { principles: [], errors: [] };
  errs = errs.concat(r.errors);
  var p = r.principles[0];
  if (!p) { out.append(h('div', { class: 'kv' }, h('span', { class: 'k' }, t('s2.errors')), chip(errs.map(function (e) { return e.why; }).join(', ') || 'empty', 'bad'))); return; }
  out.append(h('div', { class: 'kv' }, h('span', { class: 'k' }, t('s2.strength')), chip(p.strength + (p.weight !== undefined ? ' ' + p.weight : ''), 'k-' + p.strength), h('span', { class: 'k' }, t('s2.form')), chip(p.form)));
  out.append(h('div', { class: 'kv' }, h('span', { class: 'k' }, t('s2.who')), h('span', { html: t('who.' + p.strength) })));
  var c = p.compiled;
  if (errs.length) out.append(h('div', { class: 'kv' }, h('span', { class: 'k' }, t('s2.errors')), h('span', { class: 'bad' }, errs.map(function (e) { return e.why + (e.message ? ': ' + e.message : ''); }).join(' · '))));
  if (c && (c.status === 'compiled')) {
    out.append(h('h3', { class: 'sub' }, t('s2.compiled'), ' · ', h('code', {}, c.kind), ' · by ', h('code', {}, c.by)));
    if (c.kind === 'rule') {
      var tx = { author: { kind: 'creator', id: doc.meta.author || 'you', layer: doc.meta.layer }, horizon: p.horizon, kind: 'rule', body: c.body };
      out.append(pre(tokens(tx)));
      WORLD0 = WORLD0 || sessionAt('trailhead').world;
      var v = C.pdl.validate(tx, WORLD0);
      out.append(h('div', { class: 'kv' }, h('span', { class: 'k' }, t('s2.check')), statusChip(v.status)), reasonsList(v.repair, v.reasons));
    }
    out.append(h('details', {}, h('summary', {}, 'JSON'), pre(json(c.body))));
  } else if (c && c.status === 'to_compile') {
    out.append(h('h3', { class: 'sub' }, t('s2.compiled'), ' · ', h('code', {}, c.kind + ' · to_compile')), h('p', { html: t('compile.to_compile') }));
    if (p.id === 'sam.never.harm' && line === SRC['sam.never.harm'].raw) {
      var q = PRINC['sam.never.harm'].compiled;
      out.append(h('p', { html: t('compile.harm') }), h('div', { class: 'kv' }, canned(), chip('status: ' + q.status), chip('approved_by: ' + q.approved_by)), pre(json(q.body)));
    }
  } else if (!c) {
    out.append(h('p', { html: t('compile.soft', esc(p.scope)) }));
    if (p.lines) out.append(pre(Object.keys(p.lines).map(function (l) { return l + ': ' + p.lines[l]; }).join('\n') + (p.why ? '\nwhy: ' + p.why : ''), 'wrap'));
  }
  var rec = Object.assign({}, p); delete rec.compiled;
  out.append(h('details', {}, h('summary', {}, t('s2.record')), pre(json(rec))));
}
function statusChip(s) { return chip(t('s3.' + s) + (lang === 'fr' ? '' : ''), 'st-' + s); }
function reasonsList(repair, reasons) {
  var items = [];
  (repair || []).forEach(function (r) { items.push(h('li', { class: 'rep' }, h('code', {}, r.action), ' ', h('code', { class: 'dim' }, r.path), r.from !== undefined ? [' ', h('code', {}, JSON.stringify(r.from)), ' → '] : ' → ', r.to !== undefined ? h('code', {}, JSON.stringify(r.to)) : '', h('span', { class: 'why' }, ' · ' + r.why))); });
  (reasons || []).forEach(function (r) {
    var pr = r.why === 'constraint' && PRINC[r.value];
    items.push(h('li', { class: 'rej' }, h('code', {}, r.why), ' ', h('code', { class: 'dim' }, r.path), r.value !== undefined ? [' · ', h('code', {}, String(r.value))] : '', pr ? h('div', { class: 'quote' }, (SRC[r.value] ? SRC[r.value].raw : pr.text)) : null));
  });
  return items.length ? h('ul', { class: 'reasons' }, items) : null;
}

/* ---------------------------------------------------------------- 3. one channel */
var S3_PRESETS = [
  { k: 'complete', st: 'first-mark', tok: 'm:translator/translate now intent text="look at the trunk with the mark" lang=en verb=look tg=thing:marque-1\nm:stager/stage now act.look' },
  { k: 'replace', st: 'first-mark', tok: 'm:translator/translate now intent text="touch the paint" lang=en verb=touch tg=thing:marque-1\nm:stager/stage now act.touch tg=thing:affut' },
  { k: 'step', st: 'first-mark', tok: 'm:stager/stage now act.go to=station:hide' },
  { k: 'shrink', st: 'platiere', tok: 'm:translator/translate now intent text="add a fourth stone, knee high" lang=en verb=make params.size_m=0.5\nm:stager/stage scene effect.thing.place id=stone name="fourth stone" shapes=[{"shape":"ball","p":[0,0.7,0],"size":[1.4,1.4,1.2],"color":"#8f8a80"}] mass_kg=12' },
  { k: 'absolute', st: 'hide', tok: 'm:stager/stage now effect.sound.play cue=bracken.rustle at=thing:terrier' },
  { k: 'clamp', st: 'trailhead', tok: 'm:stager/stage now act.turn degrees=400' },
  { k: 'v2', st: 'first-mark', tok: 'm:stager/stage now act.approach tg=thing:marque-1' },
  { k: 'unknown', st: 'trailhead', tok: 'm:stager/stage now act.fly height=3' },
  { k: 'player', st: 'trailhead', tok: 'p:player now act.stop' },
];
function s3Presets() {
  var sel = clear($('s3-preset')), cur = sel.value || 'complete';
  S3_PRESETS.forEach(function (p) { opt(sel, p.k, t('s3.p.' + p.k), p.k === cur); });
  var st = clear($('s3-station')), cs = st.dataset.v || 'first-mark';
  PATH.forEach(function (id) { opt(st, id, stName(id), id === cs); });
}
function s3Load() { var p = S3_PRESETS.find(function (x) { return x.k === $('s3-preset').value; }); $('s3-tokens').value = p.tok; $('s3-station').value = p.st; $('s3-station').dataset.v = p.st; s3(); }
function s3() {
  var out = clear($('s3-out')), txs;
  try { txs = C.tokens.parseTokens($('s3-tokens').value); } catch (e) { out.append(h('p', { class: 'bad' }, t('s3.parseerr') + ': ' + e.message)); return; }
  var s = sessionAt($('s3-station').value), E = s.journal.entries;
  txs.forEach(function (tx) {
    var r = s.submit(tx), after = E.slice(r.seq + 1).filter(function (e) { return e.type === 'rule' && e.status === 'fired' || (e.type === 'tx' && e.author && e.author.id === 'rules'); });
    out.append(h('div', { class: 'txr st-' + r.status },
      h('div', { class: 'txr-h' }, statusChip(r.status), h('code', { class: 'dim' }, '#' + r.seq)),
      pre(GLYPH[r.tx.kind] + ' ' + tokens(r.tx)),
      reasonsList(r.repair, r.reasons),
      after.length ? h('div', { class: 'then' }, after.map(function (e) { return h('div', {}, e.type === 'rule' ? '↳ rule ' + e.rule + ' fired, in code' : '   ' + (GLYPH[e.kind] || '') + ' ' + tokens(e).split('\n')[0] + '  [' + e.status + ']'); })) : null));
  });
}

/* ---------------------------------------------------------------- 4. three clocks */
// Canned answers: the translation tier's intent and first reaction, the staging tier's full reaction (it may amend the
// first one), the background tier's preparation. Written for this guide; no model produced them.
var S4 = [
  { id: 'q07', intent: { verb: 'look', target: 'thing:marque-1' }, now: 'now act.look tg=thing:marque-1\nnow act.say ref=look.ok', amend: 1,
    scene: function (a) { return 'm:stager/stage now act.say ^' + a.call + '=' + a.now[1] + ' line.en="The paint is still sharp. He came by this autumn." line.fr="La peinture est encore nette. Il est passé cet automne." tone=dry\nm:stager/stage story fact ^' + a.call + ' subj=louis pred=marked_recently val=true cert=0.7'; },
    story: 'm:keeper/background story rule id=prep.chablis on.ev=station.entered on.m.id=fallen-pine then now act.look tg=thing:chablis' },
  { id: 'q22', intent: { verb: 'look', target: 'thing:platiere' }, now: 'now act.look tg=thing:platiere\nnow act.say ref=look.ok', amend: 1,
    scene: function (a) { return 'm:stager/stage now act.say ^' + a.call + '=' + a.now[1] + ' line.en="Three flat stones. Someone put them there." line.fr="Trois pierres plates. Quelqu’un les a posées là." tone=low'; },
    story: 'm:keeper/background story rule id=prep.fork on.ev=clock.tick on.m.station=platiere on.m.dwell_s.ge=40 then now act.say ref=fork.tape' },
  { id: 'q36', intent: { verb: 'say', class: 'shout', loud: true }, now: 'now act.stop', amend: null,
    scene: function (a) { return 'm:stager/stage now act.say ^' + a.call + ' line.en="His name? Here? No. Not out loud." line.fr="Son nom ? Ici ? Non. Pas à voix haute." tone=whisper'; },
    story: 'm:keeper/background story fact subj=voice pred=asked_to_shout val=true cert=0.9' },
  { id: 'q01', intent: { verb: 'go', target: 'station:first-mark' }, now: 'now act.say ref=move.ok\nnow act.go to=station:first-mark', amend: 0,
    scene: function (a) { return 'm:stager/stage now act.say ^' + a.call + '=' + a.now[0] + ' line.en="Going. It’s colder under the trees." line.fr="J’y vais. Il fait plus froid sous les arbres." tone=dry'; },
    story: 'm:keeper/background scene rule id=prep.quiet on.ev=clock.tick on.m.silent_s.ge=60 then now act.say ref=silence.long' },
  { id: 'q44', intent: { verb: 'wait' }, now: 'now act.wait seconds=5', amend: null,
    scene: function (a) { return 'm:stager/stage now act.say ^' + a.call + ' line.en="Okay. I’m filming. I’m not talking." line.fr="D’accord. Je filme. Je ne parle pas." tone=low'; },
    story: 'm:keeper/background story fact subj=sam pred=keeps_silence_at val=hide cert=0.8' },
];
var s4Gen = 0;
function s4Sentences() {
  var sel = clear($('s4-sentence')), cur = sel.value || 'q36';
  S4.forEach(function (p) { var r = BENCH.find(function (x) { return x.id === p.id; }); opt(sel, p.id, stName(r.station) + ' · « ' + (r[lang] || r.en) + ' »', p.id === cur); });
}
function s4Out() { ['now', 'scene', 'story'].forEach(function (k) { var v = +$('s4-' + k).value; $('s4-' + k + '-v').textContent = v >= 1000 ? (v / 1000).toFixed(1) + ' s' : v + ' ms'; }); }
function wait(ms) { return new Promise(function (ok) { setTimeout(ok, ms); }); }
function s4Say() {
  var gen = ++s4Gen, p = S4.find(function (x) { return x.id === $('s4-sentence').value; }), r = BENCH.find(function (x) { return x.id === p.id; });
  var delay = { now: +$('s4-now').value, scene: +$('s4-scene').value, story: +$('s4-story').value };
  var s = sessionAt(r.station), E = s.journal.entries, first = E.length;
  var t0 = performance.now(), clock = function () { return Math.round(performance.now() - t0); };
  var base = C.cannedModel.createCannedModel({
    intent: { answer: p.intent }, reaction: { answer: p.now.split('\n').map(function (l) { return 'm:translator/translate ' + l; }).join('\n') },
    react: function (req) { return { tokens: p.scene(req.context) }; }, prepare: { tokens: p.story },
  });
  // the model port, with the delays of the sliders: the two now judgements share the now delay
  var model = { embed: base.embed, decide: function (q) { return wait(delay.now / 2).then(function () { return base.decide(q); }); },
    generate: function (q) { return wait(q.tier === 'background' ? delay.story : delay.scene).then(function () { return base.generate(q); }); } };
  var seen = {}, state = { scene: 'pending', story: 'pending' };
  function draw() {
    if (gen !== s4Gen) return;
    var lanes = { now: [], scene: [], story: [] };
    E.slice(first).forEach(function (e) {
      if (seen[e.seq] === undefined) seen[e.seq] = clock();
      var loop = e.loop || (e.type === 'rule' && e.cause && E[e.cause.tx] && E[e.cause.tx].loop) || null;
      if (!loop || (e.type !== 'tx' && e.type !== 'rule' && e.type !== 'model_call')) return;
      var item;
      if (e.type === 'tx') item = h('li', { class: 'it st-' + e.status + (e.late ? ' late' : '') }, h('span', { class: 'ms' }, (e.latency_ms !== undefined ? e.latency_ms : seen[e.seq]) + ' ms'),
        h('code', {}, GLYPH[e.kind] + ' ' + tokens(e).split('\n')[0].replace(/^(m|e|p|c):[^ ]+ /, '')),
        e.cause && e.cause.amends !== undefined ? chip(t('s4.amends', e.cause.amends), 'strong') : null, e.late ? chip(t('s4.late'), 'bad') : null, e.author && e.author.kind === 'model' ? canned() : null);
      else if (e.type === 'rule') item = h('li', { class: 'it rule' }, h('span', { class: 'ms' }, seen[e.seq] + ' ms'), h('code', {}, '↯ ' + e.rule + ' ' + e.status + (e.reason ? ' (' + e.reason + ')' : '') + ' · code'));
      else item = h('li', { class: 'it call' }, h('span', { class: 'ms' }, (e.latency_ms !== undefined ? e.latency_ms : seen[e.seq]) + ' ms'), h('code', {}, 'model_call ' + e.tier + ' · ' + e.purpose + ' · ' + e.status));
      lanes[loop].push(item);
    });
    var box = clear($('s4-lanes'));
    ['now', 'scene', 'story'].forEach(function (k) {
      var budget = C.session.LOOPS[k];
      box.append(h('div', { class: 'lane lane-' + k }, h('div', { class: 'lane-h' }, h('b', {}, k), h('span', { class: 'dim' }, t('s4.budget') + ' ' + (budget >= 1000 ? budget / 1000 + ' s' : budget + ' ms'))),
        h('ol', {}, lanes[k], k !== 'now' && state[k] === 'pending' ? h('li', { class: 'it pending' }, h('span', { class: 'ms' }, '…'), h('span', {}, t('s4.pending') + ' · ' + (delay[k] / 1000).toFixed(1) + ' s')) : null)));
    });
  }
  var clocks = C.clocks.createClocks({ session: s, model: model, character: 'sam', clock: clock });
  draw();
  clocks.hear({ text: r[lang] || r.en, lang: lang, loud: !!p.intent.loud }).then(function (res) {
    draw();
    res.scene.then(function () { state.scene = 'landed'; draw(); });
    // the story loop: not in core/clocks.js yet; opened here through the same port, answer submitted to the same session
    var call = s.modelCall({ tier: 'background', purpose: 'prepare', character: 'sam', loop: 'story', status: 'pending' });
    draw();
    model.generate({ tier: 'background', purpose: 'prepare', context: { intent: res.intent.seq } }).then(function (ans) {
      if (gen !== s4Gen) return;
      s.modelCall({ tier: 'background', purpose: 'prepare', character: 'sam', loop: 'story', status: 'landed', ref_seq: call.seq, latency_ms: clock() });
      C.tokens.parseTokens(ans.tokens).forEach(function (tx) { s.submit(Object.assign({ cause: { tx: call.seq } }, tx), { loop: 'story', latency_ms: clock() }); });
      state.story = 'landed'; draw();
    });
  });
}

/* ---------------------------------------------------------------- 5. invention and judgement */
function s5Questions() { var sel = clear($('s5-q')), cur = sel.value || 'D3'; D.docs.decisions.forEach(function (d) { opt(sel, d.id, d.id + ' · ' + d.clock + ' · ' + d.question.replace(/<[^>]+>/g, ''), d.id === cur); }); }
// The rule of docs/architecture.md "Rules of use", applied: thresholds, both orders on an absolute, one fallback chain.
function judge(o) {
  var by = o.dm ? 'dm' : o.fg ? 'fg' : 'code';
  var uncertain = false, p = o.p;
  if (o.both) { uncertain = (o.p >= 0.5) !== (o.p2 >= 0.5); p = Math.min(o.p, o.p2 >= 0.5 === o.p >= 0.5 ? o.p2 : o.p); }
  var outcome = uncertain || p < o.lo ? 'ask' : p >= o.hi ? 'act' : 'doubt';
  return { answered_by: by, p: Math.round(p * 100) / 100, uncertain: uncertain, outcome: outcome };
}
function s5() {
  var d = D.docs.decisions.find(function (x) { return x.id === $('s5-q').value; });
  var bin = /bool/.test(d.type); $('s5-abs').disabled = !bin; if (!bin) $('s5-abs').checked = false;
  $('s5-p2-wrap').hidden = !$('s5-abs').checked;
  $('s5-p-v').textContent = (+$('s5-p').value).toFixed(2); $('s5-p2-v').textContent = (+$('s5-p2').value).toFixed(2);
  clear($('s5-qinfo')).append(h('div', { class: 'kv' }, chip(d.id, 'strong'), chip(d.clock), chip(d.type)), h('p', { html: d.question }), h('p', { class: 'dim', html: '→ ' + d.code }));
  var j = judge({ p: +$('s5-p').value, p2: +$('s5-p2').value, both: $('s5-abs').checked, hi: +$('s5-hi').value, lo: +$('s5-lo').value, dm: $('s5-dm').checked, fg: $('s5-fg').checked });
  clear($('s5-out')).append(h('div', { class: 'verdict v-' + j.outcome }, h('span', { class: 'k' }, t('s5.out')), h('strong', {}, j.uncertain ? t('s5.unc') + ' ' + t('s5.ask') : t('s5.' + j.outcome))),
    h('div', { class: 'kv' }, h('span', { class: 'k' }, t('s5.by')), chip(t('by.' + j.answered_by)), j.answered_by === 'code' ? null : canned()),
    pre(json({ decision: d.id, clock: d.clock, type: d.type, answered_by: j.answered_by, p: j.p, uncertain: j.uncertain, play: j.outcome })));
}

/* ---------------------------------------------------------------- 6. promises */
function s6Run(step, ans, str, ver) {
  var due = null, marks = [];
  var s = sessionAt('fallen-pine', { onDue: function (x) { due = x; } }), E = s.journal.entries;
  var r = BENCH.find(function (x) { return x.id === 'c01'; });
  var cause = function (x) { return { tx: x, commit: 'c.jay' }; };
  marks.push(E.length);
  var i = s.submit({ author: TRANSLATE, horizon: 'now', kind: 'intent', body: { text: r[lang] || r.en, lang: lang, verb: 'commit', class: 'jay', condition: 'the jay calls', behaviour: 'stop and get down', commit: 'c.jay' } });
  if (step >= 1) {
    marks.push(E.length);
    s.submit({ author: STAGE, horizon: 'now', kind: 'act', cause: { tx: i.seq }, body: { op: 'say', ref: ans === 'accepted' ? 'commit.accept' : ans === 'amended' ? 'commit.amend' : 'commit.refuse' } });
    var value = ans === 'amended' ? 'stop and crouch if the jay calls (not lie down)' : ans === 'accepted' ? 'stop and get down if the jay calls' : 'will not promise to get down';
    s.submit({ author: PLAYER, horizon: 'story', kind: 'fact', cause: cause(i.seq), body: { subject: 'sam', predicate: 'promised', value: value, commit: { id: 'c.jay', party: 'sam', status: ans, strength: str } } });
    if (ans !== 'refused') s.submit({ author: PLAYER, horizon: 'story', kind: 'rule', cause: cause(i.seq), body: { id: 'c.jay', commit: 'c.jay', strength: str, when: { event: 'sound.played', match: { cue: 'jay.alarm' } },
      then: [{ horizon: 'now', kind: 'act', body: { op: 'stop' } }, { horizon: 'now', kind: 'act', body: { op: 'posture', height: ans === 'amended' ? 0.55 : 0.5 } }, { horizon: 'now', kind: 'act', body: { op: 'say', ref: 'commit.keeping' } }] } });
  }
  if (step >= 2) { marks.push(E.length); walk(s, 'platiere'); }
  if (step >= 3) { marks.push(E.length); walk(s, 'approach'); }
  if (step >= 4) {
    marks.push(E.length);
    if (due) {   // a tendency fell due: the model's judgement (D7), canned, then what she does, through the same channel
      var M = { author: STAGE, horizon: 'now', kind: 'act', cause: cause(due.seq) };
      if (ver === 'kept') { s.submit(Object.assign({}, M, { body: { op: 'stop' } })); s.submit(Object.assign({}, M, { body: { op: 'posture', height: 0.55 } })); s.submit(Object.assign({}, M, { body: { op: 'say', ref: 'commit.keeping' } })); }
      else s.submit(Object.assign({}, M, { body: { op: 'say', ref: 'commit.broken' } }));
      s.submit({ author: STAGE, horizon: 'story', kind: 'fact', cause: cause(due.seq), body: { subject: 'sam', predicate: ver === 'kept' ? 'kept' : 'broke', value: 'c.jay', commit: { id: 'c.jay', party: 'sam', status: ver, strength: 'tendency' } } });
    }
  }
  return { s: s, E: E, marks: marks, due: due };
}
function s6() {
  var step = +$('s6-step').value, ans = document.querySelector('input[name="s6-ans"]:checked').value, str = document.querySelector('input[name="s6-str"]:checked').value, ver = document.querySelector('input[name="s6-ver"]:checked').value;
  $('s6-ver-wrap').hidden = str !== 'tendency' || ans === 'refused';
  var r = BENCH.find(function (x) { return x.id === 'c01'; });
  clear($('s6-said')).append(h('span', { class: 'voice' }, '« ' + (r[lang] || r.en) + ' »'), ' ', h('small', { class: 'dim' }, 'bench c01 · ' + stName('fallen-pine')));
  $('s6-step-v').textContent = t('step.' + step);
  var steps = clear($('s6-steps'));
  for (var k = 0; k <= 4; k++) steps.append(h('li', { class: k === step ? 'on' : k < step ? 'past' : '' }, t('step.' + k)));
  var R = s6Run(step, ans, str, ver), E = R.E, cm = R.s.world.commitments['c.jay'], out = clear($('s6-out'));
  if (cm) {
    out.append(h('h3', { class: 'sub' }, t('s6.state'), ' ', h('code', {}, 'c.jay')), h('div', { class: 'kv' }, chip(cm.status, 'strong st-c-' + cm.status), cm.strength ? chip(cm.strength) : null, cm.rule ? chip('rule ' + cm.rule) : null, chip('class ' + cm.class)),
      h('p', { class: 'dim' }, t('s6.history') + ': ', cm.history.map(function (x) { return x.status + ' #' + x.seq; }).join(' → ')));
    var why = ans === 'refused' ? 's6.why.refused' : cm.status === 'kept' ? (cm.strength === 'hard' ? 's6.why.kept' : null) : cm.status === 'broken' ? (cm.strength === 'hard' ? 's6.why.broke' : null) : cm.status === 'due' ? 's6.why.due' : 's6.why.notyet';
    if (why) out.append(h('p', { html: t(why) }));
    if (cm.strength === 'tendency' && (cm.status === 'kept' || cm.status === 'broken')) out.append(h('p', {}, canned(), ' D7 → ', h('code', {}, cm.status)));
  }
  var from = R.marks[R.marks.length - 1];
  out.append(h('h3', { class: 'sub' }, t('s6.journal')));
  var lines = E.slice(from).filter(function (e) { return e.type === 'tx' || (e.type === 'rule') || (e.type === 'event' && /commitment\.due|sound\.played|station\.entered/.test(e.event)); }).map(function (e) {
    var linked = (e.cause && e.cause.commit === 'c.jay') || (e.body && (e.body.commit === 'c.jay' || (e.body.commit && e.body.commit.id === 'c.jay')));
    var txt = e.type === 'tx' ? (GLYPH[e.kind] || '·') + ' ' + tokens(e).split('\n').join('\n     ') + (e.status !== 'accepted' ? '   [' + e.status + ']' : '')
      : e.type === 'rule' ? '↯ rule ' + e.rule + ' ' + e.status : '· event ' + e.event + ' ' + JSON.stringify(e.data);
    return h('div', { class: 'jl' + (linked ? ' linked' : '') }, h('span', { class: 'seq' }, '#' + e.seq), h('code', {}, txt), e.author && e.author.kind === 'model' ? canned() : null);
  });
  out.append(h('div', { class: 'jbox' }, lines));
}

/* ---------------------------------------------------------------- 7. gauges */
var S7_DEFAULT = 'gauge disturbance "how much the animals near the sett have been disturbed": rises said.loud by 0.35; rises sound(bracken.rustle) by 0.3; fades 0.15/min; words 0.3 0.6 {disturbance}\nwhen gauge(disturbance, high) -> speech.volume(whisper), say(hide.no_shout) {g.hush}\n~0.8 When the disturbance is high, Sam whispers and stops moving. {g.hush-soft}';
var s7Timeline = ['loud', 'wait', 'loud', 'rustle', 'wait', 'wait', 'wait'];
function s7() {
  var out = clear($('s7-out')), text = $('s7-src').value;
  var doc = C.source.parseSource('# guide-gauge — written in the guide\n@kind rules  @layer guide  @author you  @lang en  @scope story  @horizon story\n## gauge\n' + text, { file: 'guide.pdl' });
  var r = C.source.principlesOf(doc, { layer: 'guide', author: 'you', pack: D.pack.manifest.id, ctx: CTX }), errs = doc.errors.concat(r.errors);
  if (errs.length) out.append(h('p', { class: 'bad' }, errs.map(function (e) { return 'line ' + (e.line - 3) + ': ' + e.why + (e.message ? ' (' + e.message + ')' : ''); }).join(' · ')));
  var s = sessionAt('hide', { extra: r.principles }), E = s.journal.entries, first = E.length, w = s.world;
  var g = Object.values(w.gauges)[0], pts = [], marks = [], t0 = w.clock.t;
  var sample = function () { if (g) pts.push([w.clock.t - t0, g.value]); };
  var step = function (n) { for (var k = 0; k < n; k++) { s.advance(5); sample(); } };
  sample();
  s7Timeline.forEach(function (a) {
    if (a === 'wait') { step(12); return; }
    step(2); marks.push([w.clock.t - t0, a]);
    if (a === 'loud') s.submit({ author: TRANSLATE, horizon: 'now', kind: 'intent', body: { text: lang === 'fr' ? 'LOUIS ! TU M’ENTENDS ?' : 'LOUIS! CAN YOU HEAR ME?', lang: lang, verb: 'say', loud: true } });
    else s.submit({ author: ENGINE, horizon: 'now', kind: 'effect', body: { op: 'sound.play', cue: 'bracken.rustle' } });
    sample();
  });
  step(4);
  var call = s.modelCall({ tier: 'stage', purpose: 'answer the player', character: 'sam' });
  drawChart(g, pts, marks, E.slice(first).filter(function (e) { return e.type === 'rule' && e.status === 'fired'; }).map(function (e) { return [e.t - t0, e.rule]; }));
  var fired = E.slice(first).filter(function (e) { return e.type === 'rule' && e.status === 'fired'; });
  out.append(h('div', { class: 'kv' }, h('span', { class: 'k' }, t('s7.fired')), fired.length ? fired.map(function (e) { return chip(e.rule + ' @' + Math.round(e.t - t0) + 's', e.rule.indexOf('g.') === 0 ? 'strong' : ''); }) : t('s7.none')));
  out.append(h('h3', { class: 'sub' }, t('s7.call')), pre(json({ type: call.type, tier: call.tier, purpose: call.purpose, character: call.character, gauges: call.gauges, principles: (call.principles || []).filter(function (id) { return /^g\./.test(id); }).concat(['… ' + call.principles.length + ' in scope']) })));
}
function drawChart(g, pts, marks, fired) {
  var box = clear($('s7-chart'));
  if (!g || !pts.length) return;
  var W = 640, H = 200, L = 34, R = 64, T = 12, B = 26, tmax = Math.max(60, pts[pts.length - 1][0]);
  var x = function (v) { return L + (W - L - R) * v / tmax; }, y = function (v) { return T + (H - T - B) * (1 - v); };
  var ns = 'http://www.w3.org/2000/svg', svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H); svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', g.id + ': ' + pts.map(function (p) { return Math.round(p[0]) + 's ' + p[1].toFixed(2); }).filter(function (_, i) { return i % 6 === 0; }).join(', '));
  var add = function (tag, a, text) { var e = document.createElementNS(ns, tag); Object.keys(a).forEach(function (k) { e.setAttribute(k, a[k]); }); if (text !== undefined) e.textContent = text; svg.append(e); return e; };
  add('rect', { x: L, y: y(1), width: W - L - R, height: y(g.words.high) - y(1), class: 'band-high' });
  add('rect', { x: L, y: y(g.words.high), width: W - L - R, height: y(g.words.medium) - y(g.words.high), class: 'band-med' });
  [['high', g.words.high, 1], ['medium', g.words.medium, g.words.high], ['low', 0, g.words.medium]].forEach(function (b) { add('text', { x: W - R + 8, y: (y(b[1]) + y(b[2])) / 2 + 4, class: 'lbl' }, b[0]); });
  [g.words.medium, g.words.high].forEach(function (v) { add('line', { x1: L, x2: W - R, y1: y(v), y2: y(v), class: 'thr' }); });
  add('line', { x1: L, x2: L, y1: y(0), y2: y(1), class: 'axis' }); add('line', { x1: L, x2: W - R, y1: y(0), y2: y(0), class: 'axis' });
  ['0', '1'].forEach(function (v) { add('text', { x: L - 8, y: y(+v) + 4, class: 'lbl end' }, v); });
  for (var s = 0; s <= tmax; s += 60) add('text', { x: x(s), y: H - 8, class: 'lbl mid' }, s / 60 + ' min');
  marks.forEach(function (m) { add('line', { x1: x(m[0]), x2: x(m[0]), y1: y(0), y2: y(1), class: 'mark' }); add('text', { x: x(m[0]) + 3, y: y(1) + 10, class: 'lbl' }, m[1] === 'loud' ? '“!”' : '~'); });
  fired.forEach(function (f) { add('circle', { cx: x(f[0]), cy: y(0) - 6, r: 4, class: 'fire' }); });
  add('polyline', { points: pts.map(function (p) { return x(p[0]).toFixed(1) + ',' + y(p[1]).toFixed(1); }).join(' '), class: 'curve' });
  box.append(svg, h('p', { class: 'legend dim' }, h('span', { class: 'sw curve' }), g.id + ' — “' + g.label + '”  ', h('span', { class: 'sw fire' }), ' ', lang === 'fr' ? 'règle déclenchée' : 'rule fired'));
}

/* ---------------------------------------------------------------- 8. what happened, and what if */
var J8 = P8R.journal.entries, s8Sel = (J8.find(function (e) { return e.type === 'tx' && e.body && e.body.predicate === 'kept'; }) || J8[0]).seq;
function summary(e) {
  switch (e.type) {
    case 'session': return 'session · seed ' + e.seed + ' · ' + e.scene.id;
    case 'tx': return (GLYPH[e.kind] || '·') + ' ' + tokens(e).split('\n')[0].replace(/ (text|line\.\w+)="[^"]{24,}"/g, function (m, k) { return ' ' + k + '="…"'; }) + (e.status !== 'accepted' ? '  [' + e.status + ']' : '');
    case 'event': return '· ' + e.event + ' ' + JSON.stringify(e.data).slice(0, 60);
    case 'rule': return '↯ ' + e.rule + ' ' + e.status + (e.reason ? ' (' + e.reason + ')' : '');
    case 'model_call': return '◎ model_call ' + e.tier + ' · ' + e.purpose + (e.status ? ' · ' + e.status : '');
    case 'principles': return '§ principles · ' + e.records.length + ' records';
    case 'advance': return '⏱ advance ' + e.dt + ' s';
    case 'audit': return '✓ audit ' + e.principle + ' · respected ' + e.respected;
    case 'hash': return '# hash ' + e.hash;
    default: return e.type;
  }
}
function s8Filter(e) {
  var f = $('s8-filter').value;
  return f === 'all' || (f === 'input' ? e.input : e.type === f);
}
function s8List() {
  var list = clear($('s8-list')), items = J8.filter(s8Filter);
  if (!items.some(function (e) { return e.seq === s8Sel; }) && items.length) s8Sel = items[0].seq;
  items.forEach(function (e) {
    list.append(h('button', { type: 'button', class: 'jrow' + (e.seq === s8Sel ? ' on' : '') + (e.input ? ' input' : ''), 'data-seq': e.seq, 'aria-pressed': e.seq === s8Sel ? 'true' : 'false', onclick: function () { s8Sel = e.seq; s8Show(true); } },
      h('span', { class: 'seq' }, '#' + e.seq), h('span', { class: 'typ' }, e.loop || ''), h('code', {}, summary(e))));
  });
  var sl = $('s8-seq'); sl.max = Math.max(0, items.length - 1); sl.value = Math.max(0, items.findIndex(function (e) { return e.seq === s8Sel; }));
}
function causeOf(e) {
  if (e.type === 'event') return e.cause;
  if (e.type === 'tx' || e.type === 'rule') return e.cause && e.cause.tx;
  if (e.type === 'model_call') return e.ref_seq;
  return undefined;
}
function s8Show(scroll) {
  var e = J8[s8Sel], out = clear($('s8-entry'));
  Array.prototype.forEach.call($('s8-list').children, function (b) { var on = +b.dataset.seq === s8Sel; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); if (on && scroll) { var L = $('s8-list'); if (b.offsetTop < L.scrollTop || b.offsetTop + b.offsetHeight > L.scrollTop + L.clientHeight) L.scrollTop = b.offsetTop - L.clientHeight / 2; } });
  var items = J8.filter(s8Filter); $('s8-seq').value = Math.max(0, items.findIndex(function (x) { return x.seq === s8Sel; }));
  $('s8-seq-v').textContent = '#' + e.seq + ' · ' + e.type;
  var kv = function (k, v) { return h('div', { class: 'kv' }, h('span', { class: 'k' }, k), v); };
  out.append(kv(t('s8.who'), h('code', {}, e.type === 'tx' ? who(e.author) : e.type === 'rule' ? (e.author ? who(e.author) + ' · ' : '') + 'run by code' : e.type === 'model_call' ? 'model · ' + e.tier : e.input ? 'input' : 'core')));
  if (e.loop) out.append(kv(t('s8.clock'), [chip(e.loop, 'strong'), e.latency_ms !== undefined ? chip(e.latency_ms + ' / ' + e.budget_ms + ' ms') : null, e.late ? chip(t('s4.late'), 'bad') : null]));
  var what = e.type === 'tx' ? GLYPH[e.kind] + ' ' + tokens(e) : e.type === 'principles' ? e.records.length + ' principle records' : json(Object.assign({}, e, { scene: undefined, records: undefined, proposed: undefined }));
  out.append(kv(t('s8.what'), pre(what)));
  if (e.type === 'tx') out.append(reasonsList(e.repair, e.reasons));
  var chain = [], cur = causeOf(e), guard = 0;
  while (cur !== undefined && cur !== null && J8[cur] && guard++ < 20) { chain.push(J8[cur]); cur = causeOf(J8[cur]); }
  out.append(kv(t('s8.why'), chain.length ? h('ol', { class: 'chain' }, chain.map(function (c) { return h('li', {}, h('button', { type: 'button', class: 'linkish', onclick: function () { s8Sel = c.seq; $('s8-filter').value = 'all'; s8List(); s8Show(true); } }, '#' + c.seq), ' ', h('code', {}, summary(c))); })) : h('span', { class: 'dim' }, e.input ? 'an input' : '—')));
}
var S8_RULES = (J8.find(function (e) { return e.type === 'principles'; }).records || []).filter(function (p) { return p.compiled && p.compiled.kind === 'rule' && p.form === 'explicit'; });
var S8_SUGGEST = { 'r.jay-first': 'when said.loud once if at(approach) -> sound(jay.alarm), reveal(f.jay-heard), say(jay.alarm)' };
function s8Rules() { var sel = clear($('s8-rule')), cur = sel.value || 'r.jay-first'; S8_RULES.forEach(function (p) { opt(sel, p.id, p.id + (p.instance ? ' (pattern ' + p.pattern + ')' : ''), p.id === cur); }); }
function s8Load(suggest) { var id = $('s8-rule').value, p = S8_RULES.find(function (x) { return x.id === id; }); $('s8-text').value = suggest && S8_SUGGEST[id] ? S8_SUGGEST[id] : p.text; s8Replay(suggest && S8_SUGGEST[id]); }
function s8Replay(suggested) {
  var out = clear($('s8-out')), id = $('s8-rule').value, text = $('s8-text').value.replace(/\n/g, ' ').trim(), body;
  try { body = C.source.compileRule(id, text, CTX); } catch (e) { out.append(h('p', { class: 'bad' }, e.message)); return; }
  var edit = function (e) { return e.type === 'principles' ? Object.assign({}, e, { records: e.records.map(function (p) { return p.id === id ? Object.assign({}, p, { text: text, compiled: Object.assign({}, p.compiled, { body: body }) }) : p; }) }) : e; };
  var r2 = C.journal.replay(P8, C.paperWorld.createPaperWorld(), undefined, { edit: edit }), d = C.journal.diff(P8, r2.journal, { max: 400 });
  if (suggested) out.append(h('p', { class: 'dim' }, t('s8.suggest')));
  out.append(h('div', { class: 'kv' }, h('span', { class: 'k' }, t('s8.hash')), h('code', {}, String(P8HASH)), d.equal ? ' = ' : ' → ', h('code', { class: d.equal ? '' : 'strong-t' }, String(r2.hash))));
  if (d.equal) { out.append(h('p', {}, t('s8.same'))); return; }
  out.append(h('p', {}, t('s8.diff', d.changes.length + (d.changes.length >= 400 ? '+' : ''), d.first)));
  var A = d.rules.a.slice(), B = d.rules.b.slice(), onlyA = A.filter(function (x) { var i = B.indexOf(x); if (i >= 0) { B.splice(i, 1); return false; } return true; });
  out.append(h('div', { class: 'kv' }, h('span', { class: 'k' }, t('s8.only.a')), onlyA.length ? onlyA.map(function (x) { return chip(x, 'bad'); }) : '—'),
    h('div', { class: 'kv' }, h('span', { class: 'k' }, t('s8.only.b')), B.length ? B.map(function (x) { return chip(x, 'strong'); }) : '—'));
  var cmA = P8R.session.world.commitments['c.jay'], cmB = r2.session.world.commitments['c.jay'];
  if (cmA && cmB && cmA.status !== cmB.status) out.append(h('div', { class: 'kv' }, h('span', { class: 'k' }, 'c.jay'), chip(cmA.status), ' → ', chip(cmB.status, 'strong')));
  out.append(h('div', { class: 'jbox diff' }, d.changes.slice(0, 8).map(function (c) {
    return h('div', { class: 'dl' }, h('span', { class: 'seq' }, '#' + c.seq), h('div', {}, h('code', { class: 'a' }, '− ' + (c.a ? summary(c.a) : '∅')), h('code', { class: 'b' }, '+ ' + (c.b ? summary(c.b) : '∅'))));
  })));
}

/* ---------------------------------------------------------------- 9. a story is a folder */
var s9Sel = 'facts/ranger-notes.pdl';
function s9Files() {
  var M = D.pack.manifest, layerOf = {};
  M.layers.forEach(function (l) { l.files.forEach(function (f) { layerOf[f] = l; }); });
  var files = ['pack.json', M.place, M.stations, M.beats].concat(Object.keys(M.lines).map(function (k) { return M.lines[k]; }), [M.bench]).concat(M.layers.reduce(function (a, l) { return a.concat(l.files); }, []));
  return { files: files, layerOf: layerOf };
}
function s9() {
  var F = s9Files(), tree = clear($('s9-tree')), dirs = {};
  F.files.forEach(function (f) { var d = f.indexOf('/') > 0 ? f.slice(0, f.lastIndexOf('/')) : ''; (dirs[d] = dirs[d] || []).push(f); });
  tree.append(h('div', { class: 'tdir root' }, 'stories/louis-round/'));
  Object.keys(dirs).forEach(function (d) {
    if (d) tree.append(h('div', { class: 'tdir' }, d + '/'));
    dirs[d].forEach(function (f) {
      var l = F.layerOf[f];
      tree.append(h('button', { type: 'button', class: 'tfile' + (f === s9Sel ? ' on' : ''), 'aria-pressed': f === s9Sel ? 'true' : 'false', onclick: function () { s9Sel = f; s9(); } },
        h('span', {}, f.slice(d ? d.length + 1 : 0)), l ? chip(l.id, l.id === 'base' ? '' : 'strong') : null));
    });
  });
  var file = clear($('s9-file')), f = s9Sel, l = F.layerOf[f];
  var text = D.pack.texts[f] !== undefined ? D.pack.texts[f] : f === 'pack.json' ? json(D.pack.manifest) : f === D.pack.manifest.place ? json(D.pack.place) : f === D.pack.manifest.stations ? json(D.pack.stations) : f === D.pack.manifest.beats ? json(D.pack.beats) : f === D.pack.manifest.bench ? json(D.pack.bench) : json(D.pack.lines[Object.keys(D.pack.manifest.lines).find(function (k) { return D.pack.manifest.lines[k] === f; })]);
  file.append(h('div', { class: 'file-h' }, h('code', {}, f), l ? [chip(t('s9.layer') + ' ' + l.id, l.id === 'base' ? '' : 'strong'), chip(t('s9.by') + ' ' + l.author)] : null));
  if (/\.pdl$/.test(f)) {
    var over = PACK.principles.filter(function (p) { return p.source && p.source.file === f && p.overrides; });
    over.forEach(function (p) { p.overrides.forEach(function (o) { file.append(h('p', { class: 'prov' }, h('code', {}, p.id), ' · ' + t('s9.layer') + ' ' + p.layer + ' (' + p.author.id + ') ' + t('s9.over') + ' ', h('code', {}, o.layer), ' (' + o.author.id + ', ' + o.source.file + ':' + o.source.line + ')')); }); });
    var box = h('div', { class: 'src' });
    text.split('\n').forEach(function (ln, i) {
      var m = /^(!!|!|~[\d.]*|\?|>|x|when|gauge|bind|set|#|@|##)(\s|$)/.exec(ln.trim()), k = m ? m[1].replace(/[\d.]+$/, '') : '';
      var cls = { '!!': 'absolute', '!': 'hard', '~': 'tendency', '?': 'open', '>': 'example', x: 'counter', when: 'hard', gauge: 'gauge', '#': 'meta', '@': 'meta', '##': 'meta', bind: 'meta', set: 'meta' }[k] || '';
      box.append(h('div', { class: 'sl-' + (cls || 'plain') }, h('span', { class: 'ln' }, String(i + 1)), h('code', {}, ln || ' ')));
    });
    file.append(box);
  } else file.append(pre(text.length > 12000 ? text.slice(0, 12000) + '\n…' : text, 'tall'));
}

/* ---------------------------------------------------------------- 10. where the models live */
function s10() {
  var node = $('s10-node').checked, host = $('s10-host').checked;
  var caps = [['embed', 'now'], ['decide', 'now'], ['fast', 'now'], ['mid', 'scene'], ['large', 'story']];
  var serve = function (c) {
    if (c === 'embed') return node ? 'node' : 'code';
    if (c === 'decide') return node ? 'node' : host ? 'host' : 'code';
    return host ? 'host' : 'none';          // ADR 0008: the node serves embed and decide; generative tiers only if Q2 is answered
  };
  clear($('s10-out')).append(h('table', {}, h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'capability'), h('th', { scope: 'col' }, 'loop'), h('th', { scope: 'col' }, t('s4.budget')), h('th', { scope: 'col' }, t('s10.serves')))),
    h('tbody', {}, caps.map(function (c) { var b = C.session.LOOPS[c[1]], s = serve(c[0]); return h('tr', {}, h('th', { scope: 'row' }, t('cap.' + c[0])), h('td', {}, c[1]), h('td', {}, b >= 1000 ? b / 1000 + ' s' : b + ' ms'), h('td', {}, chip(t('srv.' + s), s === 'node' ? 'strong' : s === 'none' ? 'dim' : ''))); }))));
  clear($('s10-adr')).append(t('s10.adr') + ' ', chip(D.docs.adr8.status), ' · ', h('span', { html: D.docs.adr8.routes }));
}

/* ---------------------------------------------------------------- 11. scope and milestones (docs, read at build time) */
function s11() {
  var feel = clear($('s11-feel')); D.docs.scope.feel.forEach(function (x) { feel.append(h('li', { html: x })); });
  $('s11-ledger').innerHTML = D.docs.scope.table; $('s11-ms').innerHTML = D.docs.milestones; $('s9-kit').innerHTML = D.docs.kit;
  s11Col();
}
function s11Col() {
  var v = document.querySelector('input[name="s11-col"]:checked').value;
  Array.prototype.forEach.call($('s11-ledger').querySelectorAll('tr'), function (tr) { Array.prototype.forEach.call(tr.children, function (c, i) { c.hidden = v !== 'all' && i !== 0 && i !== +v; }); });
}

/* ---------------------------------------------------------------- language, theme, wiring */
function applyCopy() {
  document.documentElement.lang = lang;
  Array.prototype.forEach.call(document.querySelectorAll('[data-t]'), function (e) { e.innerHTML = t(e.getAttribute('data-t')); });
  var toc = clear($('toc'));
  for (var i = 1; i <= 11; i++) toc.append(h('li', {}, h('a', { href: '#s' + i }, h('span', { class: 'n' }, (i < 10 ? '0' : '') + i), t('s' + i + '.title'))));
}
function renderAll() {
  applyCopy(); renderCheck();
  $('s1-station').dataset.v = $('s1-station').value || 'approach'; $('s1-request').dataset.v = $('s1-request').value || ''; s1Stations(); s1Requests(); s1();
  var keep = $('s2-line').value, keepH = s2Header; s2Presets(); if (keep) { s2Header = keepH; s2(); } else s2Load();
  var k3 = $('s3-tokens').value; s3Presets(); if (k3) s3(); else s3Load();
  s4Sentences(); s4Out();
  s5Questions(); s5(); s6(); if (!$('s7-src').value) $('s7-src').value = S7_DEFAULT; s7();
  s8List(); s8Show(false); s8Rules(); s9(); s10(); s11();
}
function setTheme(v) { if (v === 'auto') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', v); }
function wire() {
  var on = function (id, ev, f) { $(id).addEventListener(ev, f); };
  on('lang', 'change', function () { lang = $('lang').value; store('bcs-guide-lang', lang); renderAll(); s4Say(); });
  on('theme', 'change', function () { setTheme($('theme').value); store('bcs-guide-theme', $('theme').value); });
  on('s1-station', 'change', function () { $('s1-request').dataset.v = ''; s1Requests(); s1(); });
  on('s1-request', 'change', function () { $('s1-request').dataset.v = $('s1-request').value; s1(); });
  on('s1-side-live', 'change', s1); on('s1-side-write', 'change', s1);
  on('s2-preset', 'change', s2Load); on('s2-line', 'input', debounce(s2, 120));
  on('s3-preset', 'change', s3Load); on('s3-station', 'change', function () { $('s3-station').dataset.v = $('s3-station').value; s3(); }); on('s3-tokens', 'input', debounce(s3, 200));
  on('s4-say', 'click', s4Say); on('s4-sentence', 'change', s4Say);
  ['now', 'scene', 'story'].forEach(function (k) { on('s4-' + k, 'input', s4Out); on('s4-' + k, 'change', s4Say); });
  ['s5-q', 's5-p', 's5-p2', 's5-abs', 's5-hi', 's5-lo', 's5-dm', 's5-fg'].forEach(function (id) { on(id, 'input', s5); on(id, 'change', s5); });
  on('s6-step', 'input', s6);
  Array.prototype.forEach.call(document.querySelectorAll('input[name="s6-ans"],input[name="s6-str"],input[name="s6-ver"]'), function (e) { e.addEventListener('change', s6); });
  on('s7-src', 'input', debounce(s7, 250));
  on('s7-loud', 'click', function () { s7Timeline.push('loud'); s7(); }); on('s7-rustle', 'click', function () { s7Timeline.push('rustle'); s7(); });
  on('s7-wait', 'click', function () { s7Timeline.push('wait'); s7(); }); on('s7-reset', 'click', function () { s7Timeline = []; $('s7-src').value = S7_DEFAULT; s7(); });
  on('s8-filter', 'change', function () { s8List(); s8Show(true); });
  on('s8-seq', 'input', function () { var items = J8.filter(s8Filter); if (items[+$('s8-seq').value]) { s8Sel = items[+$('s8-seq').value].seq; s8Show(true); } });
  on('s8-rule', 'change', function () { s8Load(false); }); on('s8-replay', 'click', function () { s8Replay(false); }); on('s8-reset', 'click', function () { s8Load(false); });
  on('s10-node', 'change', s10); on('s10-host', 'change', s10);
  Array.prototype.forEach.call(document.querySelectorAll('input[name="s11-col"]'), function (e) { e.addEventListener('change', s11Col); });
}
function timecode() {
  var el = $('timecode'), t0 = Date.now(), still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var f = function () { var ms = Date.now() - t0, s = Math.floor(ms / 1000), p = function (n) { return (n < 10 ? '0' : '') + n; }; el.textContent = p(Math.floor(s / 3600)) + ':' + p(Math.floor(s / 60) % 60) + ':' + p(s % 60) + ':' + p(Math.floor(ms / 40) % 25); };
  f(); setInterval(f, still ? 1000 : 120);
}

var l0 = store('bcs-guide-lang'), th0 = store('bcs-guide-theme');
if (l0 === 'fr' || l0 === 'en') lang = l0;   // English first; French only by choice
$('lang').value = lang;
if (th0 === 'dark' || th0 === 'light') { $('theme').value = th0; setTheme(th0); }
wire(); renderAll(); s8Load(true); s4Say(); timecode();
})();
