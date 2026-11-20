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
import { pretraiter, deplie } from './deplie.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const rev = process.argv[2];
const read = f => rev ? execFileSync('git', ['show', rev + ':src/shaders/' + f], { cwd: root, encoding: 'utf8' }) : readFileSync(join(root, 'src/shaders', f), 'utf8');
function inclure(src, vus = new Set()) {
  return src.replace(/^#include "([\w.-]+)"\s*$/gm, (_, f) => { if (vus.has(f)) return ''; vus.add(f); return inclure(read(f).trimEnd(), vus); });
}
const FS = inclure(read('v3_ombrage.frag').trimEnd()), VS = read('fullscreen.vert');
const avec = d => FS.replace('\n', '\n' + Object.entries(d).map(([k, v]) => '#define ' + k + ' ' + v).join('\n') + '\n');

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
