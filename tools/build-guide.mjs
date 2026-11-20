// Builds the interactive guide (briefs/guide.md) from guide/ into two self-contained pages:
//   dist/guide.html            a complete document (GitHub Pages)
//   dist/guide-artefact.html   the same without doctype, html, head or body (claude.ai wraps it at publication)
// core/ is inlined as classic-script modules (no bundler, no dependency); the real pack stories/louis-round, the pattern
// library, the golden journal p8 and a few tables of docs/ are inlined as data, read here at build time. Deterministic:
// same sources, same bytes (CI checks `git diff --exit-code -- dist`).
//   node tools/build-guide.mjs
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPack, loadLibrary } from './pack-check.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = p => readFileSync(join(root, p), 'utf8');
const noClose = (s, what) => { if (/<\/script/i.test(s)) throw new Error(what + ': contains </script'); return s; };
const jsonData = o => JSON.stringify(o).replace(/</g, '\\u003c');

/* ---------------------------------------------------------------- core/ as one classic script
   Each module becomes a function scope returning its exports, evaluated in dependency order. An import from a module not
   yet evaluated (an import cycle: pdl ⇄ tokens, session ⇄ journal) is bound after every module has run; the core only uses
   such imports inside functions, so this is the ES module semantics for this code. Result: `var CORE = { <module>: {…} }`. */
export function inlineCore(dir = 'core') {
  const files = readdirSync(join(root, dir)).filter(f => f.endsWith('.js')).sort();
  const key = f => f.replace(/\.js$/, '').replace(/-(\w)/g, (_, c) => c.toUpperCase());
  const mods = {};
  for (const f of files) {
    const src = noClose(read(dir + '/' + f), f);
    const imports = [], reexports = [];
    let body = src.replace(/^import\s*\{([^}]*)\}\s*from\s*'\.\/([\w-]+)\.js';?[^\n]*$/gm, (_, names, from) => {
      imports.push({ from: from + '.js', names: names.split(',').map(s => s.trim()).filter(Boolean).map(s => { const m = /^(\w+)(?:\s+as\s+(\w+))?$/.exec(s); if (!m) throw new Error(f + ': import ' + s); return [m[1], m[2] || m[1]]; }) });
      return '';
    });
    body = body.replace(/^export\s*\*\s*from\s*'\.\/([\w-]+)\.js';?[^\n]*$/gm, (_, from) => { reexports.push({ from: from + '.js', all: true }); return ''; });
    body = body.replace(/^export\s*\{([^}]*)\}\s*from\s*'\.\/([\w-]+)\.js';?[^\n]*$/gm, (_, names, from) => { reexports.push({ from: from + '.js', names: names.split(',').map(s => s.trim()).filter(Boolean) }); return ''; });
    if (/^\s*(import|export)\s*[{*]/m.test(body) || /\bimport\s*\(/.test(body)) throw new Error(f + ': an import or export form the inliner does not know');
    const exports = [...body.matchAll(/^export\s+(?:async\s+)?(?:function\*?|const|let|var|class)\s+([A-Za-z_$][\w$]*)/gm)].map(m => m[1]);
    body = body.replace(/^export\s+/gm, '');
    mods[f] = { f, key: key(f), imports, reexports, exports, body };
  }
  const order = [], state = {};
  const visit = f => {
    if (state[f]) return; state[f] = 'open';
    if (!mods[f]) throw new Error('core: no module ' + f);
    for (const d of [...mods[f].imports, ...mods[f].reexports]) visit(d.from);
    state[f] = 'done'; order.push(f);
  };
  for (const f of files) visit(f);
  const done = new Set(), out = ['var CORE = (function () {', '"use strict";', 'var M = {}, late = [];'];
  for (const f of order) {
    const m = mods[f], head = [];
    for (const imp of m.imports) {
      const pat = '{ ' + imp.names.map(([a, b]) => a === b ? a : a + ': ' + b).join(', ') + ' }', dep = JSON.stringify(mods[imp.from].key);
      if (done.has(imp.from)) head.push(`const ${pat} = M[${dep}];`);
      else head.push(`let ${imp.names.map(n => n[1]).join(', ')};`, `late.push(function () { (${pat} = M[${dep}]); });`);
    }
    out.push(`/* ---- core/${f} */`, `M[${JSON.stringify(m.key)}] = (function () {`, ...head, m.body.trim(), `return { ${m.exports.join(', ')} };`, '})();');
    for (const r of m.reexports) {                       // re-exports right away, so later importers see them
      if (!done.has(r.from)) throw new Error(f + ': re-export from a module not yet evaluated: ' + r.from);
      const a = JSON.stringify(m.key), b = JSON.stringify(mods[r.from].key);
      out.push(r.all ? `for (var k in M[${b}]) if (!(k in M[${a}])) M[${a}][k] = M[${b}][k];` : r.names.map(n => `M[${a}].${n} = M[${b}].${n};`).join(' '));
    }
    done.add(f);
  }
  out.push('late.forEach(function (f) { f(); });', 'return M;', '})();');
  return out.join('\n');
}

/* ---------------------------------------------------------------- tables of docs/, read at build time (never retyped) */
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
export function mdInline(s) {
  const codes = [];
  let x = esc(s).replace(/`([^`]+)`/g, (_, c) => { codes.push(c); return `\u0000${codes.length - 1}\u0000`; });
  x = x.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>').replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?!\w)/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, t, u) => /^https:\/\//.test(u) ? `<a href="${u}" target="_blank" rel="noopener">${t}</a>` : t);
  return x.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[i]}</code>`);
}
/* The first markdown table after a heading (or at the start): { head: [cells], rows: [[cells]] }, cells as raw markdown. */
export function mdTable(text, afterHeading) {
  let lines = text.split('\n');
  if (afterHeading) { const i = lines.findIndex(l => /^#+\s/.test(l) && l.includes(afterHeading)); if (i < 0) throw new Error('docs: no heading ' + afterHeading); lines = lines.slice(i + 1); }
  const start = lines.findIndex(l => l.trim().startsWith('|'));
  if (start < 0) throw new Error('docs: no table after ' + afterHeading);
  const tbl = [];
  for (let i = start; i < lines.length && lines[i].trim().startsWith('|'); i++) tbl.push(lines[i]);
  const cells = l => l.trim().replace(/^\|/, '').replace(/\|$/, '').split(/(?<!\\)\|/).map(c => c.trim().replace(/\\\|/g, '|'));
  return { head: cells(tbl[0]), rows: tbl.slice(2).map(cells) };
}
const tableHTML = t => `<table><thead><tr>${t.head.map(c => `<th scope="col">${mdInline(c)}</th>`).join('')}</tr></thead><tbody>${t.rows.map(r => `<tr>${r.map((c, i) => i === 0 ? `<th scope="row">${mdInline(c)}</th>` : `<td>${mdInline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
function docsData() {
  const scope = read('docs/scope.md'), ms = read('docs/milestones.md'), arch = read('docs/architecture.md'), kit = read('docs/creator-kit.md'), adr8 = read('docs/adr/0008-home-node.md');
  const feel = /## What POC v1 must make a stranger feel\n+([\s\S]*?)\n## /.exec(scope)[1].trim().split('\n').filter(l => /^\d+\./.test(l)).map(l => mdInline(l.replace(/^\d+\.\s*/, '')));
  const decisions = mdTable(arch, 'Where judgement happens');
  const status = /Status:\s*\*\*(\w+)\*\*/.exec(adr8);
  return {
    scope: { feel, table: tableHTML(mdTable(scope, 'Ledger')) },
    milestones: tableHTML(mdTable(ms)),
    decisions: decisions.rows.map(r => ({ id: r[0], clock: r[1], question: mdInline(r[2]), type: r[3], code: mdInline(r[4]) })),
    kit: tableHTML(mdTable(kit, 'Commands')),
    adr8: { status: status ? status[1] : 'unknown', routes: mdInline(/\*\*Routes\.\*\*\s*([^\n]*)/.exec(adr8)[1]) },
  };
}

/* ---------------------------------------------------------------- data: the pack, the library, the golden journal */
function guideData() {
  const pack = loadPack(join(root, 'stories/louis-round')); delete pack.dir;            // no absolute path in the page
  const library = loadLibrary(join(root, 'patterns'));
  return { pack, library, golden: { 'p8-louis-pack': read('tests/golden/p8-louis-pack.jsonl') }, docs: docsData() };
}

/* ---------------------------------------------------------------- the page */
export function buildGuide() {
  const css = noClose(read('guide/guide.css'), 'guide.css'), body = read('guide/guide.html');
  const scripts = [
    `<script type="application/json" id="guide-data">${jsonData(guideData())}</script>`,
    `<script id="core">\n${inlineCore()}\n</script>`,
    `<script>\n${noClose(read('guide/copy.js'), 'copy.js')}\n</script>`,
    `<script>\n${noClose(read('guide/guide.js'), 'guide.js')}\n</script>`,
  ].join('\n');
  const title = '<title>Bodycam Stories Field Guide</title>';
  const head = `<meta name="claude:viewport-fit-sides" content="cover">
<meta name="description" content="An interactive field guide to Bodycam Stories: the real narrative core running in the page.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&display=swap" rel="stylesheet">
<style>\n${css}\n</style>`;
  const artefact = `${title}\n${head}\n${body}\n${scripts}\n`;
  const full = `<!DOCTYPE html>\n<html lang="en">\n<head>\n${title}\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n${head}\n</head>\n<body>\n${body}\n${scripts}\n</body>\n</html>\n`;
  return { full, artefact };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { full, artefact } = buildGuide();
  mkdirSync(join(root, 'dist'), { recursive: true });
  writeFileSync(join(root, 'dist/guide.html'), full);
  writeFileSync(join(root, 'dist/guide-artefact.html'), artefact);
  console.log(`dist/guide.html: ${(full.length / 1024).toFixed(1)} KB · dist/guide-artefact.html: ${(artefact.length / 1024).toFixed(1)} KB`);
}
