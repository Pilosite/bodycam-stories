// Tous les programmes que la page compile au lancement, mesurés et classés, et le journal des appels qui forcent l'attente.
// Usage : node tools/programmes.mjs [dossier de sortie] [secondes d'observation]   (dist/index.html, à construire avant)
//   QUAL=pc|mobile|les2 (défaut les2), FICHE=9 (numéro de la fiche, 1 à 9), DEMO=1 : la page démarre sur l'ouverture
//   (« Quel monde veux-tu filmer ? ») ; REJEU=1 avec DEMO : envoie la suggestion et suit le rejeu jusqu'au fondu.
// Pour chaque programme : moment du lancement (s), nom deviné, source (caractères reçus), déplié (tools/deplie.mjs : fonctions
// recopiées à chaque appel, boucles à borne fixe déroulées, comme FXC sous Direct3D), et SPIR-V (traduction d'ANGLE en rendu
// logiciel). Le journal liste aussi les lectures synchrones (getProgramParameter, getShaderParameter, getError, readPixels,
// finish) faites avant que le programme soit prêt (COMPLETION_STATUS_KHR). Ce n'est pas Direct3D : des mesures relatives.
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pretraiter, deplie } from './deplie.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = process.argv[2] || 'out/programmes', duree = +(process.argv[3] || 40);
const fiche = +(process.env.FICHE || 9) - 1, demo = !!process.env.DEMO, rejeu = !!process.env.REJEU;
mkdirSync(out, { recursive: true });

function espion() {                                            // injecté dans la page avant tout script
  const P = WebGL2RenderingContext.prototype, t0 = performance.now(), J = window.__gl = { progs: [], shaders: new Map(), appels: [], img: [] };
  const now = () => +((performance.now() - t0) / 1000).toFixed(3);
  const o = {}; for (const k of ['shaderSource', 'attachShader', 'linkProgram', 'getProgramParameter', 'getShaderParameter', 'getError', 'readPixels', 'finish', 'getUniformLocation', 'getActiveUniform', 'deleteProgram']) o[k] = P[k];
  P.shaderSource = function (s, src) { J.shaders.set(s, { src, type: null }); return o.shaderSource.call(this, s, src); };
  P.attachShader = function (p, s) { (p.__sh = p.__sh || []).push(s); return o.attachShader.call(this, p, s); };
  P.linkProgram = function (p) { const e = { i: J.progs.length, t: now(), sh: p.__sh.map(s => J.shaders.get(s).src), obj: p, pret: null, attente: [] }; p.__e = e; J.progs.push(e); return o.linkProgram.call(this, p); };
  const ext = () => window.__ext;
  P.getProgramParameter = function (p, k) {
    const x = ext(); const r = o.getProgramParameter.call(this, p, k);
    if (x && k === x.COMPLETION_STATUS_KHR) { if (r && p.__e && p.__e.pret === null) p.__e.pret = now(); return r; }
    if (p.__e && p.__e.pret === null && x && !o.getProgramParameter.call(this, p, x.COMPLETION_STATUS_KHR)) J.appels.push({ t: now(), quoi: 'getProgramParameter avant prêt', prog: p.__e.i });
    if (p.__e && p.__e.pret === null) p.__e.pret = now();
    return r;
  };
  P.readPixels = function (...a) { const b = a[6]; if (typeof b !== 'number') J.appels.push({ t: now(), quoi: 'readPixels synchrone' }); return o.readPixels.apply(this, a); };
  P.finish = function () { J.appels.push({ t: now(), quoi: 'finish' }); return o.finish.call(this); };
  P.getError = function () { J.appels.push({ t: now(), quoi: 'getError' }); return o.getError.call(this); };
  const ge = P.getExtension; P.getExtension = function (n) { const r = ge.call(this, n); if (n === 'KHR_parallel_shader_compile' && r) window.__ext = r; return r; };
  let last = performance.now(); const raf = () => { const t = performance.now(); J.img.push([now(), +(t - last).toFixed(1)]); last = t; requestAnimationFrame(raf); }; requestAnimationFrame(raf);
}

async function un(qual) {
  const nav = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
  const page = await nav.newPage({ viewport: qual === 'pc' ? { width: 640, height: 400 } : { width: 270, height: 480 } });
  await page.addInitScript(espion);
  const cfg = { v3: true, scene: fiche, full: qual === 'pc', ombrage: 'echelle', bureau: true, nohud: false };
  if (qual !== 'pc') cfg.mobile = true;
  if (demo) cfg.demo = true;
  await page.addInitScript(c => { window.__CFG = c; }, cfg);
  await page.goto('file://' + resolve(root, 'dist/index.html'), { timeout: 600000 });
  const t0 = Date.now();
  if (demo && rejeu) {
    await page.waitForTimeout(4000);
    await page.evaluate(() => { const b = document.getElementById('ouv-sugg'); const t = document.getElementById('ouv-txt'); t.value = b.textContent; document.getElementById('ouv-form').requestSubmit(); });
  }
  while ((Date.now() - t0) / 1000 < duree) await page.waitForTimeout(1000);
  const r = await page.evaluate(() => {
    const gl = document.getElementById('view').getContext('webgl2'), dbg = gl.getExtension('WEBGL_debug_shaders'), J = window.__gl;
    const tr = new Map(); for (const [s, x] of J.shaders) { try { tr.set(x.src, dbg ? dbg.getTranslatedShaderSource(s).length : -1); } catch (_) { tr.set(x.src, -1); } }
    return { progs: J.progs.map(e => ({ i: e.i, t: e.t, pret: e.pret, sh: e.sh, spirv: e.sh.map(s => tr.get(s) ?? -1) })), appels: J.appels, img: J.img,
      etapes: (window.balade && window.balade.etapes) ? window.balade.etapes() : null, state: window.__state || null };
  });
  await nav.close();
  return r;
}

const mesure = src => { try { return deplie(pretraiter(src)); } catch { return -1; } };
const nommer = (sh) => {
  const [v, f] = sh, def = s => [...new Set((s.match(/#define (SOCLE|TAPIS|SEMO|ATMO|RAIS|FORMES|RELIEF|HOUPPIER|SEMIS|NU) \d+/g) || []).map(x => x.slice(8).replace(' ', '=')))].join(' ');
  const has = (s, t) => s.includes(t);
  if (has(f, 'le tapis du sol')) return 'tapis ' + def(f);
  if (has(f, 'Sonde de collision')) return 'sonde ' + def(f);
  if (has(f, 'la passe plein écran')) return 'ombrage ' + def(f);
  if (has(v, 'le semeur')) return (has(f, 'carte d\'ombres') ? 'ombre ' : 'grains ') + def(v + f);
  if (has(v, 'le sol, un maillage')) return 'sol ' + def(v);
  if (has(v, 'les éléments proches')) return 'proches ' + def(v + f);
  if (has(f, 'uOutRes')) return 'capteur';
  if (has(f, 'uDstRes')) return 'halo (réduction)';
  if (has(f, 'uDir')) return 'halo (flou)';
  if (has(f, 'Exposition automatique')) return 'exposition';
  if (has(f, 'shadeLeaf')) return 'lanceur de rayons ' + def(f);
  return 'autre';
};

const quals = (process.env.QUAL || 'les2') === 'les2' ? ['pc', 'mobile'] : [process.env.QUAL];
const rapport = {};
for (const q of quals) {
  const r = await un(q);
  const lignes = r.progs.map(e => {
    const [v, f] = e.sh, dv = mesure(v), df = mesure(f);
    return { i: e.i, t: e.t, pret: e.pret, nom: nommer(e.sh), srcV: v.length, srcF: f.length, depV: dv, depF: df, spV: e.spirv[0], spF: e.spirv[1] };
  });
  rapport[q] = { lignes, appels: r.appels, img: r.img, state: r.state };
  console.log('\n== qualité ' + q + ', fiche ' + (fiche + 1) + (demo ? ', ouverture' + (rejeu ? ' + rejeu' : '') : '') + ' : ' + lignes.length + ' programmes liés');
  console.log('  n°   lancé   prêt   programme                         source V+F     déplié V    déplié F   SPIR-V V+F');
  for (const l of lignes) console.log('  ' + String(l.i).padStart(2) + '  ' + l.t.toFixed(1).padStart(6) + ' ' + (l.pret === null ? '   —  ' : l.pret.toFixed(1).padStart(6)) + '   ' + l.nom.padEnd(32) + String(l.srcV + l.srcF).padStart(10) + String(l.depV).padStart(12) + String(l.depF).padStart(12) + String(l.spV + l.spF).padStart(12));
  const cl = [...lignes].sort((a, b) => Math.max(b.depV, b.depF) - Math.max(a.depV, a.depF));
  console.log('  classés par plus gros déplié : ' + cl.slice(0, 6).map(l => l.nom.trim() + ' ' + Math.max(l.depV, l.depF)).join(' ; '));
  const ap = {}; for (const a of r.appels) ap[a.quoi] = (ap[a.quoi] || 0) + 1;
  console.log('  appels synchrones : ' + (Object.entries(ap).map(([k, v]) => k + ' × ' + v).join(', ') || 'aucun'));
  const dix = r.img.filter(x => x[0] < 10).map(x => x[1]); dix.shift();
  console.log('  images : ' + r.img.length + ' en ' + duree + ' s ; plus longue image des 10 premières s : ' + (dix.length ? Math.max(...dix).toFixed(0) + ' ms' : '—'));
}
writeFileSync(join(out, 'programmes.json'), JSON.stringify(rapport, null, 1));
console.log('\n' + join(out, 'programmes.json'));
