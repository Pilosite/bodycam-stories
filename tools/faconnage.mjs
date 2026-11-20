// Le façonnage seul, joué dans dist/index.html (moteur v3), sans passer par toute la démo : une chose posée devant lui
// (le modèle nommé par CHOSE, « une énorme crotte » par défaut), un tas ramassé (RAMASSE), puis « faconner » vers le modèle
// qui transforme (VERS, « bonhomme de neige »). Le corps est figé à NP instants du geste (balade.pauseQuand) ; chaque image
// s'accumule PP passes ; planche assemblée dans <sortie>/planche.png. Vue PC 16/10 (960 × 600, qualité complète) par défaut,
// VUE=tel pour le portrait 390 × 780.
// Usage : node tools/faconnage.mjs [sortie] [pixels internes des captures]   Variables : NP (16), PP (6), GRAINS (600000)
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, process.argv[2] || 'out/faconnage'), px = +(process.argv[3] || 180000);
const TEL = process.env.VUE === 'tel', VW = TEL ? 390 : 960, VH = TEL ? 780 : 600;
const NP = +(process.env.NP || 16), PP = +(process.env.PP || 6), GRAINS = +(process.env.GRAINS || 600000);
const CHOSE = process.env.CHOSE || 'une énorme crotte', VERS = process.env.VERS || 'bonhomme de neige', RAMASSE = process.env.RAMASSE || 'des bâtons et des cailloux';
mkdirSync(out, { recursive: true });
const t0 = Date.now(), sec = () => String(Math.round((Date.now() - t0) / 1000)).padStart(4);
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: VW, height: VH }, deviceScaleFactor: 1 });
const erreurs = [];
page.on('pageerror', e => { erreurs.push(e.message); console.log('  [erreur]', e.stack); });
page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_/.test(m.text())) { erreurs.push(m.text()); console.log('  [console]', m.text().slice(0, 300)); } });
await page.addInitScript(c => { window.__CFG = c; }, { maxPx: 30000, mobile: TEL, full: !TEL, still: true, graine: 4821, v3: true, grains: 40000, dtMax: 0.4, scene: 8, regulateur: false, nohud: true });
await page.goto('file://' + join(root, 'dist/index.html'));
await page.waitForFunction(() => window.__state && window.__state.n >= 2, null, { timeout: 600000 });
console.log(sec(), 'page prête');
const ids = await page.evaluate(([chose, vers, ram]) => {
  { const c = balade.corps(); balade.placer(c.x, c.z, c.yaw + Math.PI); }   // dos au soleil levant : l'ouvrage éclairé
  const B = MODELES, md = MENEUR.modeleDe(B, chose), fm = MENEUR.formesModele(md.modele, chose);
  balade.objet({ type: 'objet', op: 'creer', ou: 'devant', distance: 0.9, objet: { id: 'f-1', nom: md.modele.nom, formes: fm.formes, degage: 0 } });
  const tas = MENEUR.ramassage(B, ram);
  balade.objet({ type: 'objet', op: 'creer', differe: 'f-1', objet: { id: 'f-2', nom: tas.nom, formes: tas.formes, degage: 0 } });
  const mt = MENEUR.modeleDe(B, vers, { transforme: true }), ap = MENEUR.formesTransformees(mt.modele, fm.formes);
  balade.agir([{ type: 'rejoindre', objet: 'f-1' }, { type: 'posture', hauteur: 0.5 }, { type: 'faconner', objet: 'f-1' }, { type: 'posture', hauteur: 1 }]);
  balade.objet({ type: 'objet', op: 'faconner', id: 'f-1', etapes: [ap.formes], nom: mt.modele.nom, consomme: ['f-2'] });
  return { avant: fm.formes.length, apres: ap.formes.length };
}, [CHOSE, VERS, RAMASSE]);
console.log(sec(), 'chose et façonnage lancés', JSON.stringify(ids));
await page.waitForFunction(() => balade.faconnage().file.some(f => f.total > 0), null, { timeout: 600000 });
const geste = await page.evaluate(() => balade.faconnage().file[0]);
console.log(sec(), `geste : ${geste.total} s, ${geste.n} transitions`);
const planche = [];
const lire = () => page.evaluate(() => new Promise(ok => requestAnimationFrame(() => {   // dans la même image que le rendu
  const cv = document.querySelector('canvas'), c = document.createElement('canvas'); c.width = cv.width; c.height = cv.height;
  c.getContext('2d').drawImage(cv, 0, 0); ok(c.toDataURL('image/jpeg', 0.92)); })));
for (let k = 0; k < NP; k++) {
  const tc = geste.total * (k + 0.5) / NP;
  await page.evaluate(t => balade.pauseQuand('faconner', t), tc);
  await page.waitForFunction(() => balade.enPause() || !balade.faconnage().file.length, null, { timeout: 600000 });
  const f = await page.evaluate(() => balade.faconnage());
  if (!f.file.length) break;
  await page.evaluate(([p, g]) => { balade.grains(g); balade.resolution(p); }, [px, GRAINS]);
  const n0 = await page.evaluate(() => window.__state.n);
  await page.waitForFunction(n => window.__state.n >= n, Math.min(PP, n0 + PP), { timeout: 600000 }).catch(() => {});
  await page.waitForFunction(n => window.__state.n >= n, PP, { timeout: 600000 }).catch(() => {});
  const url = await lire(), nom = `g-${String(k + 1).padStart(2, '0')}`;
  writeFileSync(join(out, nom + '.jpg'), Buffer.from(url.split(',')[1], 'base64'));
  planche.push({ nom, t: f.file[0].t, geste: f.file[0].geste, mains: f.mains });
  console.log(sec(), nom, `t ${f.file[0].t} s`, f.file[0].geste, 'mains', f.mains, JSON.stringify(f.file[0].dbg), 'proches', await page.evaluate(() => window.__v3 && window.__v3.gp && window.__v3.gp.prochesM ? 'PATE' : 'sans fondu'));
  await page.evaluate(() => { balade.grains(40000); balade.resolution(30000); balade.pause(false); });
}
writeFileSync(join(out, 'planche.html'), `<!doctype html><meta charset=utf-8><style>body{margin:0;background:#111;color:#ddd;font:12px sans-serif;display:grid;grid-template-columns:repeat(${TEL ? 8 : 4},1fr);gap:4px;padding:4px}img{width:100%;display:block}</style>`
  + planche.map(p => `<figure style="margin:0"><img src="${p.nom}.jpg"><figcaption>${p.t.toFixed(1)} s · ${p.geste}</figcaption></figure>`).join(''));
{ const b2 = await browser.newPage({ viewport: { width: 1600, height: 600 } }); await b2.goto('file://' + join(out, 'planche.html'));
  await b2.waitForTimeout(500); await b2.screenshot({ path: join(out, 'planche.png'), fullPage: true }); await b2.close(); }
console.log(sec(), 'planche', join(out, 'planche.png'), erreurs.length ? 'ERREURS ' + erreurs.length : 'sans erreur');
await browser.close();
process.exit(erreurs.length ? 1 : 0);
