// Taille des programmes « proches » du moteur v3 (v3_proches.vert/.frag) : une famille par programme (PF), et la variante
// PATE (objets mous : formes fondues, creux, bourrelets ; compilée seulement quand un objet mou existe).
// Usage : node tools/proches-taille.mjs [révision git]   (sans révision : src/shaders/ tel quel)
// Pour chaque variante : déplié (tools/deplie.mjs, l'estimation de ce que fait FXC sous Direct3D) du nuanceur de sommets et de
// pixels, et compilation réelle dans Chrome (SwiftShader) si Playwright est là. Des mesures relatives, pas Direct3D.
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pretraiter, deplie } from './deplie.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const rev = process.argv[2];
const read = f => { try { return rev ? execFileSync('git', ['show', rev + ':src/shaders/' + f], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }) : readFileSync(join(root, 'src/shaders', f), 'utf8'); } catch { return ''; } };
function inclure(src, vus = new Set()) {
  return src.replace(/^#include "([\w.-]+)"\s*$/gm, (_, f) => { if (vus.has(f)) return ''; vus.add(f); return inclure(read(f).trimEnd(), vus); });
}
const FS = inclure(read('v3_proches.frag').trimEnd()), VS = inclure(read('v3_proches.vert').trimEnd());
const avec = (s, d) => s.replace('\n', '\n' + Object.entries(d).map(([k, v]) => '#define ' + k + ' ' + v).join('\n') + '\n');
const VARIANTES = {
  'O formes (PF 1)': { PF: 1 },
  'O formes, fiche 09 (HOUPPIER RELIEF)': { PF: 1, HOUPPIER: 1, RELIEF: 1 },
  'B blocs (PF 2)': { PF: 2 },
  'T troncs (PF 3)': { PF: 3 },
  'M mous (PF 1, PATE)': { PF: 1, PATE: 1 },
  'M mous, fiche 09 (HOUPPIER RELIEF PATE)': { PF: 1, PATE: 1, HOUPPIER: 1, RELIEF: 1 },
};
let page = null, nav = null;
try {
  const { chromium } = await import('playwright');
  nav = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
  page = await nav.newPage(); await page.setContent('<canvas id=c></canvas>');
} catch (e) { console.log('(sans Chrome : pas de compilation)'); }
for (const [nom, d] of Object.entries(VARIANTES)) {
  const fs = avec(FS, d), vs = avec(VS, d);
  let ok = '';
  if (page) {
    const r = await page.evaluate(([vs, fs]) => {
      const gl = document.getElementById('c').getContext('webgl2');
      const v = gl.createShader(gl.VERTEX_SHADER), f = gl.createShader(gl.FRAGMENT_SHADER), pr = gl.createProgram();
      gl.shaderSource(v, vs); gl.compileShader(v); gl.shaderSource(f, fs); gl.compileShader(f);
      gl.attachShader(pr, v); gl.attachShader(pr, f); gl.linkProgram(pr);
      const ok = gl.getProgramParameter(pr, gl.LINK_STATUS);
      return { ok, log: ok ? '' : (gl.getShaderInfoLog(v) + gl.getShaderInfoLog(f) + gl.getProgramInfoLog(pr)).slice(0, 400) };
    }, [vs, fs]);
    ok = r.ok ? '  compile' : '  ÉCHEC ' + r.log;
  }
  const dv = deplie(pretraiter(vs)), df = deplie(pretraiter(fs));
  console.log(nom.padEnd(42), 'sommets', String(dv).padStart(7), '  pixels', String(df).padStart(7), '  total', String(dv + df).padStart(7) + ok);
}
if (nav) await nav.close();
