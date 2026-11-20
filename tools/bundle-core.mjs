// Bundles core/ (ES modules) into one classic-script expression for the single-file page: `const CORE = (function(){...})()`.
// Each module becomes a factory; its imports are `let` locals re-linked once every module exists, so import cycles
// (journal <-> session, pdl <-> tokens) work as long as no module calls an import while it is being created (true of core/).
// CORE exposes every module's exports flattened (later modules do not override earlier names) and CORE.modules by name.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const CORE_ORDER = ['vocab', 'world', 'rules', 'tokens', 'pdl', 'source', 'journal', 'session', 'judge', 'prompt', 'sketch', 'clocks', 'ports', 'paper-world', 'canned-model', 'harvest'];

export function bundleCore(root, order = CORE_ORDER) {
  const parts = [];
  for (const name of order) {
    let src = readFileSync(join(root, 'core', name + '.js'), 'utf8');
    if (/<\/script/i.test(src) || /import\.meta|require\(/.test(src)) throw new Error('core/' + name + '.js: cannot be bundled');
    const links = [], locals = [], reexports = [];
    src = src.replace(/^import\s*\{([^}]*)\}\s*from\s*'\.\/([\w-]+)\.js';?[ \t]*$/gm, (_, list, from) => {
      const pairs = list.split(',').map(s => s.trim()).filter(Boolean).map(s => { const m = s.split(/\s+as\s+/); return [m[0], m[1] || m[0]]; });
      for (const [, local] of pairs) locals.push(local);
      links.push(`({ ${pairs.map(([a, b]) => a === b ? a : a + ': ' + b).join(', ')} } = R[${JSON.stringify(from)}] || {});`);
      return '';
    });
    src = src.replace(/^export\s*\*\s*from\s*'\.\/([\w-]+)\.js';?[ \t]*$/gm, (_, from) => { reexports.push({ from, all: true }); return ''; });
    src = src.replace(/^export\s*\{([^}]*)\}\s*from\s*'\.\/([\w-]+)\.js';?[ \t]*$/gm, (_, list, from) => { reexports.push({ from, names: list.split(',').map(s => s.trim()).filter(Boolean) }); return ''; });
    if (/^\s*(import|export\s*\{|export\s+default)/m.test(src)) throw new Error('core/' + name + '.js: an import or export form the bundler does not know');
    const names = [...src.matchAll(/^export\s+(?:async\s+)?(?:function\*?|const|let|class)\s+([A-Za-z_$][\w$]*)/gm)].map(m => m[1]);
    src = src.replace(/^export\s+/gm, '');
    parts.push(`M[${JSON.stringify(name)}] = function (R) {
${locals.length ? 'let ' + [...new Set(locals)].join(', ') + ';' : ''}
const __link = () => { ${links.join(' ')} };
__link();
${src}
return { exports: { ${names.join(', ')} }, link: __link, reexports: ${JSON.stringify(reexports)} };
};`);
  }
  return `const CORE = (function () { "use strict";
const M = {}, R = {}, L = [];
${parts.join('\n')}
for (const name of ${JSON.stringify(order)}) {
  const m = M[name](R); R[name] = m.exports; L.push(m.link);
  for (const x of m.reexports) { const from = R[x.from] || {}; for (const k of x.all ? Object.keys(from) : x.names) if (!(k in m.exports)) m.exports[k] = from[k]; }
}
for (const f of L) f();
const out = { modules: R };
for (const name of ${JSON.stringify(order)}) for (const [k, v] of Object.entries(R[name])) if (!(k in out)) out[k] = v;
return out;
})();`;
}
