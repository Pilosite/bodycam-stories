// Échelle de l'ombrage v3 (docs/moteur-v3.md, « Échelle de l'ombrage ») : essais en rendu logiciel, fiche 09, moteur v3.
// Usage : node tools/ombrage-essai.mjs dossier [plein|socle|montee|echec|recharge …]   (sans nom : tous)
//   plein    : la variante complète attendue avant la première image (comportement d'avant, celui des captures) ;
//   socle    : CFG.ombrage = "socle", on reste au socle ;
//   montee   : CFG.ombrage = "echelle" (comme la page sans outil) : première image au socle, montée de la complète, image
//              après (montee-apres.png) et journal des étapes ;
//   echec    : la variante complète n'est jamais prête (CFG.ombrageJamais), délai court : on doit rester au socle, sans
//              écran d'attente, et la mémoire doit noter l'échec (délai) ;
//   recharge : la page est rechargée pendant la compilation de la complète (« en cours » en mémoire) : au chargement suivant,
//              échec (interrompu), pas de nouvel essai, socle, bouton « Image complète : réessayer » visible.
// Images : dossier/<nom>.png (le canevas, lu dans la page), et pour echec et recharge une capture de la page avec l'interface.
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const [,, dir = 'out/ombrage', ...quoi] = process.argv;
mkdirSync(join(root, dir), { recursive: true });
const ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'];
const fiche = JSON.parse(readFileSync(join(root, 'scenes/09-champcueil-aube.json'), 'utf8'));
const PASSES = +(process.env.PASSES || 6), VW = 640, VH = 400;
const base = { still: true, nowalk: true, v3: true, full: true, bureau: false, z: 22, scene: fiche, w: VW, h: VH };
const veut = n => !quoi.length || quoi.includes(n);

async function ouvrir(cfg, ctx) {
  const p = await ctx.newPage({ viewport: { width: VW, height: VH }, deviceScaleFactor: 1 });
  p.journal = []; p.on('pageerror', e => p.journal.push(e.message));
  await p.addInitScript(c => { window.__CFG = c; }, cfg);
  await p.goto('file://' + join(root, 'dist/index.html'), { timeout: 600000 });
  return p;
}
const etat = p => p.evaluate(() => ({ s: window.__state && window.__state.v3, n: window.__state && window.__state.n,
  om: window.balade.ombrage(), pensee: document.getElementById('pensee').textContent, err: document.getElementById('err').textContent,
  raz: !document.getElementById('ombrage-raz').hidden }));
async function attendre(p, cond, max = 900) {
  const t0 = Date.now(); let e = null;
  while ((Date.now() - t0) / 1000 < max) { await p.waitForTimeout(1000); e = await etat(p); if (cond(e)) break; }
  return { e, s: (Date.now() - t0) / 1000 };
}
async function image(p, nom) {
  const url = await p.evaluate(() => new Promise(ok => requestAnimationFrame(() => {
    const c = document.createElement('canvas'); c.width = canvas.width; c.height = canvas.height;
    c.getContext('2d').drawImage(canvas, 0, 0); ok(c.toDataURL('image/png')); })), { timeout: 600000 });
  writeFileSync(join(root, dir, nom + '.png'), Buffer.from(url.split(',')[1], 'base64'));
}
const court = e => JSON.stringify({ ombrage: e.s && e.s.ombrage, n: e.n, voulu: e.om.voulu, memoire: e.om.memoire, pensee: e.pensee.slice(0, 80), err: e.err.slice(0, 80), raz: e.raz });

async function essai(nom, f) {
  if (!veut(nom)) return;
  const b = await chromium.launch({ headless: true, args: ARGS });
  try { await f(await b.newContext()); } catch (e) { console.log(nom, 'ÉCHEC', String(e.message || e).split('\n')[0]); }
  await b.close().catch(() => {});
}
await essai('plein', async ctx => {
  const p = await ouvrir({ ...base, nohud: true }, ctx);
  const r = await attendre(p, e => e.n >= PASSES); await p.waitForTimeout(2500); await image(p, 'plein');
  console.log('plein', r.s + ' s', court(r.e));
});
await essai('socle', async ctx => {
  const p = await ouvrir({ ...base, nohud: true, ombrage: 'socle' }, ctx);
  const r = await attendre(p, e => e.n >= PASSES); await p.waitForTimeout(2500); await image(p, 'socle');
  console.log('socle', r.s + ' s', court(r.e));
});
await essai('montee', async ctx => {
  const p = await ouvrir({ ...base, nohud: true, ombrage: 'echelle' }, ctx);
  const a = await attendre(p, e => e.s && (e.s.ombrage === 'socle' && e.n >= 1 || e.s.ombrage === 'plein'));
  console.log('montée : première image', a.s + ' s', court(a.e));
  const r = await attendre(p, e => e.s && e.s.ombrage === 'plein');
  console.log('montée : complète en service après', r.s + ' s de plus', court(r.e));
  const r2 = await attendre(p, e => e.n >= PASSES); await p.waitForTimeout(2500); await image(p, 'montee-apres');
  console.log('montée : après', court(r2.e));
  console.log((await p.evaluate(() => diag())).split('\n').filter(l => /ombrage|socle|v3|image 0/.test(l)).join('\n'));   // journal des étapes : socle, première image, puis montée
});
await essai('echec', async ctx => {
  const p = await ouvrir({ ...base, ombrage: 'echelle', ombrageJamais: true, ombrageDelai: 20000 }, ctx);
  const r = await attendre(p, e => e.om.memoire && Object.values(e.om.memoire).some(v => v.etat === 'echec'));
  console.log('échec simulé', r.s + ' s', court(r.e));
  const r2 = await attendre(p, e => e.n >= PASSES, 300); await image(p, 'echec');
  await p.screenshot({ path: join(root, dir, 'echec-page.png'), timeout: 600000 });
  console.log('échec simulé, ensuite', court(r2.e));
});
await essai('recharge', async ctx => {
  const p = await ouvrir({ ...base, ombrage: 'echelle', ombrageJamais: true, ombrageDelai: 3600000 }, ctx);
  const r = await attendre(p, e => e.om.memoire && Object.values(e.om.memoire).some(v => v.etat === 'en cours'));
  console.log('recharge : avant', r.s + ' s', court(r.e));
  await p.reload({ timeout: 600000 });                        // comme un plantage du navigateur pendant la compilation
  const r2 = await attendre(p, e => e.n >= PASSES); await p.waitForTimeout(20000);
  const e3 = await etat(p); await image(p, 'recharge');
  await p.screenshot({ path: join(root, dir, 'recharge-page.png'), timeout: 600000 });
  console.log('recharge : après', court(e3), p.journal.slice(0, 2).join(' | '));
});
