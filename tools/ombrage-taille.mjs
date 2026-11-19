// Taille des variantes de l'ombrage v3 (v3_ombrage.frag) : socle et variantes complètes.
// Usage : node tools/ombrage-taille.mjs [révision git]   (sans révision : src/shaders/ tel quel ; avec : l'ombrage de cette révision)
// Pour chaque variante :
//   source   caractères du source après inclusions (le texte que reçoit le navigateur, toutes variantes confondues) ;
//   actif    caractères (sans espaces ni commentaires) après le préprocesseur : ce que la variante garde ;
//   déplié   la même mesure, fonctions recopiées à chaque appel et boucles à borne fixe recopiées autant de fois :
//            une estimation de ce que fait le compilateur de Direct3D (FXC), qui déplie tout ;
//   SPIR-V   taille du shader traduit par ANGLE dans Chrome en rendu logiciel (WEBGL_debug_shaders), si Chrome est là.
// Ce n'est pas Direct3D : des mesures relatives, pour comparer les variantes entre elles.
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const rev = process.argv[2];
const read = f => rev ? execFileSync('git', ['show', rev + ':src/shaders/' + f], { cwd: root, encoding: 'utf8' }) : readFileSync(join(root, 'src/shaders', f), 'utf8');
function inclure(src, vus = new Set()) {
  return src.replace(/^#include "([\w.-]+)"\s*$/gm, (_, f) => { if (vus.has(f)) return ''; vus.add(f); return inclure(read(f).trimEnd(), vus); });
}
const FS = inclure(read('v3_ombrage.frag').trimEnd()), VS = read('fullscreen.vert');
const avec = d => FS.replace('\n', '\n' + Object.entries(d).map(([k, v]) => '#define ' + k + ' ' + v).join('\n') + '\n');

// Préprocesseur réduit : #define objet, #undef, #if/#ifdef/#ifndef/#elif/#else/#endif. Les macros numériques sont substituées.
function pretraiter(src) {
  const M = {}, out = [], pile = [];
  const actif = () => pile.every(x => x.on);
  const evalue = e => {
    e = e.replace(/defined\s*\(\s*(\w+)\s*\)|defined\s+(\w+)/g, (_, a, b) => (a || b) in M ? '1' : '0')
      .replace(/\b[A-Za-z_]\w*\b/g, k => k in M ? '(' + M[k] + ')' : '0');
    try { return !!Function('return (' + e + ')')(); } catch { return false; }
  };
  for (const l of src.replace(/\/\*[\s\S]*?\*\//g, ' ').split('\n')) {
    const m = l.match(/^\s*#\s*(\w+)\s*(.*)$/);
    if (m) {
      const [, d, r0] = m, r = r0.replace(/\/\/.*$/, '').trim();
      if (d === 'ifdef' || d === 'ifndef') { const v = (r in M) === (d === 'ifdef'); pile.push({ on: v, fait: v }); }
      else if (d === 'if') { const v = actif() && evalue(r); pile.push({ on: v, fait: v }); }
      else if (d === 'elif') { const t = pile[pile.length - 1]; t.on = !t.fait && evalue(r); t.fait = t.fait || t.on; }
      else if (d === 'else') { const t = pile[pile.length - 1]; t.on = !t.fait; t.fait = true; }
      else if (d === 'endif') pile.pop();
      else if (!actif()) continue;
      else if (d === 'define') { const [, k, v = ''] = r.match(/^(\w+)\s*(.*)$/); M[k] = v.trim(); }
      else if (d === 'undef') delete M[r];
      continue;
    }
    if (!actif()) continue;
    out.push(l.replace(/\/\/.*$/, '').replace(/\b[A-Z_][A-Z0-9_]*\b/g, k => /^-?[\d.]+$/.test(M[k] || '') ? M[k] : k));
  }
  return out.join('\n');
}
const fermant = (t, i, o, c) => { let n = 0; for (let j = i; j < t.length; j++) { if (t[j] === o) n++; else if (t[j] === c && --n === 0) return j; } return t.length - 1; };
function deplie(src) {
  const F = {}, re = /^[ \t]*(?:highp\s+|mediump\s+)?(\w+)\s+(\w+)\s*\(([^()]*)\)\s*\{/gm; let m;
  while ((m = re.exec(src))) { if (['if', 'for', 'while', 'return', 'else'].includes(m[1])) continue; const a = m.index + m[0].length - 1, b = fermant(src, a, '{', '}'); F[m[2]] = src.slice(a + 1, b); re.lastIndex = b; }
  const memo = {};
  const coutF = n => memo[n] ?? (memo[n] = (memo[n] = 0, cout(F[n])));
  function cout(t) {
    let total = 0, i = 0;
    const re2 = /\bfor\s*\(|\b([A-Za-z_]\w*)\s*\(/g; let x;
    while ((x = re2.exec(t))) {
      total += t.slice(i, x.index).replace(/\s+/g, '').length;
      if (!x[1]) {                                            // boucle : en-tête, puis corps recopié autant de fois que la borne fixe le dit
        const p = x.index + x[0].length - 1, q = fermant(t, p, '(', ')'), h = t.slice(p + 1, q);
        const b = h.match(/(\w+)\s*=\s*(-?\d+)\s*;\s*\w+\s*(<=|<)\s*(\d+)\s*;/); const k = b ? Math.max(1, +b[4] - +b[2] + (b[3] === '<=' ? 1 : 0)) : 1;
        let s = q + 1; while (/\s/.test(t[s])) s++;
        let e = t[s] === '{' ? fermant(t, s, '{', '}') : t.indexOf(';', s); if (e < s) e = t.length - 1;
        total += cout(h) + k * cout(t.slice(s, e + 1)); i = Math.max(e + 1, x.index + 1); re2.lastIndex = i;
      } else { total += x[0].replace(/\s+/g, '').length + (F[x[1]] !== undefined ? coutF(x[1]) : 0); i = x.index + x[0].length; }
    }
    return total + t.slice(i).replace(/\s+/g, '').length;
  }
  return F.main !== undefined ? coutF('main') : -1;
}

const VARIANTES = rev ? { [rev]: {} } : {
  'socle': { SOCLE: 1, TAPIS: 0, SEMO: 0, ATMO: 0, RAIS: 0 },
  'complet, forêt (T0 S0 A0)': { TAPIS: 0, SEMO: 0, ATMO: 0, RAIS: 0 },
  'complet, fiche 09 PC (S1 A1 R10)': { TAPIS: 0, SEMO: 1, ATMO: 1, RAIS: 10 },
  'complet, fiche 09 mobile (T1 S1 A1)': { TAPIS: 1, SEMO: 1, ATMO: 1, RAIS: 0 },
};
let page = null, nav = null;
try {
  const { chromium } = await import('playwright');
  nav = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
  page = await nav.newPage(); await page.setContent('<canvas id=c></canvas>');
} catch (e) { console.log('(sans Chrome : pas de mesure SPIR-V)'); }
for (const [nom, d] of Object.entries(VARIANTES)) {
  const src = avec(d), pp = pretraiter(src);
  let spirv = '';
  if (page) {
    const r = await page.evaluate(([vs, fs]) => {
      const gl = document.getElementById('c').getContext('webgl2'), dbg = gl.getExtension('WEBGL_debug_shaders');
      const v = gl.createShader(gl.VERTEX_SHADER), f = gl.createShader(gl.FRAGMENT_SHADER), pr = gl.createProgram();
      gl.shaderSource(v, vs); gl.compileShader(v); gl.shaderSource(f, fs); gl.compileShader(f);
      gl.attachShader(pr, v); gl.attachShader(pr, f); gl.linkProgram(pr);
      const ok = gl.getProgramParameter(pr, gl.LINK_STATUS);
      return { ok, n: dbg ? dbg.getTranslatedShaderSource(f).length : -1, log: ok ? '' : gl.getShaderInfoLog(f).slice(0, 300) };
    }, [VS, src]);
    spirv = '  SPIR-V ' + String(r.n).padStart(7) + (r.ok ? '' : '  ÉCHEC ' + r.log);
  }
  console.log(nom.padEnd(36), 'source', String(src.length).padStart(6), '  actif', String(pp.replace(/\s+/g, '').length).padStart(6), '  déplié', String(deplie(pp)).padStart(8) + spirv);
}
if (nav) await nav.close();
