// Coût des trois moments lourds de la démo (vue PC, 16/10, qualité complète, moteur v3, fiche 09) : la petite crotte cadrée
// (zoom), le ramassage (la main au sol), le façonnage (objet mou et deux mains, plusieurs instants du geste). Pour chacun :
// les éléments proches comptés (balade.prochesCompte : pixels couverts, fragments par pixel couvert, formes évaluées par pixel
// couvert et par fragment) et la durée de chaque passe en rendu logiciel (option v3detail : attente de la puce après chaque
// passe ; relatif seulement). Le corps est figé à chaque mesure (balade.pause, balade.pauseQuand).
// Usage : node tools/geste-cout.mjs [sortie.json] [pixels internes]   Variables : GRAINS (300000), IMAGES (3 par mesure)
import { chromium } from 'playwright';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const sortie = join(root, process.argv[2] || 'out/geste-cout.json'), px = +(process.argv[3] || 150000);
const GRAINS = +(process.env.GRAINS || 300000), IMAGES = +(process.env.IMAGES || 3);
mkdirSync(dirname(sortie), { recursive: true });
const t0 = Date.now(), sec = () => String(Math.round((Date.now() - t0) / 1000)).padStart(5);
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 960, height: 600 }, deviceScaleFactor: 1 });
const erreurs = [];
page.on('pageerror', e => { erreurs.push(e.message); console.log('  [erreur]', e.stack); });
page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_/.test(m.text())) { erreurs.push(m.text()); console.log('  [console]', m.text().slice(0, 300)); } });
await page.addInitScript(c => { window.__CFG = c; }, { maxPx: 30000, mobile: false, full: true, still: true, graine: 4821, v3: true, grains: 40000, dtMax: 0.4, scene: 8, regulateur: false, nohud: true, v3detail: true });
await page.goto('file://' + join(root, 'dist/index.html'), { timeout: 240000 });
await page.waitForFunction(() => window.__state && window.__state.n >= 2, null, { timeout: 600000 });
console.log(sec(), 'page prête');
const R = [];
async function mesurer(nom) {
  await page.evaluate(([p, g]) => { balade.pause(true); balade.grains(g); balade.resolution(p); }, [px, GRAINS]);
  const n0 = await page.evaluate(() => window.__state.n);
  await page.waitForFunction(n => window.__state.n >= n, n0 + 1, { timeout: 900000 }).catch(() => {});
  const passes = [];
  for (let i = 0; i < IMAGES; i++) {                               // chaque image recalculée comme en marche
    const k = await page.evaluate(() => { window.__v3.n = 0; return window.__v3.nImg; });
    await page.waitForFunction(k => window.__v3.nImg > k, k, { timeout: 900000 }).catch(() => {});
    passes.push(await page.evaluate(() => balade.passes()));
  }
  const compte = await page.evaluate(() => balade.prochesCompte());
  const moy = {}; for (const P of passes) for (const [k, v] of Object.entries(P)) moy[k] = (moy[k] || 0) + v / passes.length;
  for (const k in moy) moy[k] = Math.round(moy[k]);
  const c = await page.evaluate(() => balade.corps()), f = await page.evaluate(() => balade.faconnage());
  const r = { moment: nom, compte, passes_ms: moy, mains: f.mains, zoom: +c.zoom.toFixed(2), haut: c.haut };
  R.push(r); console.log(sec(), nom, JSON.stringify(r));
  await page.evaluate(() => { balade.grains(40000); balade.resolution(30000); balade.pause(false); });
}
const quand = (fn, arg, max = 900000) => page.waitForFunction(fn, arg, { timeout: max, polling: 250 }).then(() => true, () => { console.log(sec(), '(délai dépassé)'); return false; });
const auRepos = () => quand(() => balade.corps().file.length === 0);

// 1. la petite crotte, cadrée de près (le zoom du téléphone)
await page.evaluate(() => balade.dire('fais une petite crotte'));
await quand(() => balade.objets().some(o => /^fab-/.test(o.id)));
await auRepos();
await mesurer('crotte cadrée (zoom)');

// 2. le ramassage : la main au sol
await page.evaluate(() => balade.dire('va chercher des bâtons et des cailloux'));
await quand(() => balade.corps().file.includes('ramasser') || balade.corps().file.includes('marcher'));
await page.evaluate(() => balade.pauseQuand('ramasser', 0.5));
await quand(() => balade.enPause());
await mesurer('ramassage (main au sol)');
await auRepos();

// 3. le façonnage : une énorme crotte, un tas, « faconner » ; plusieurs instants du geste
await page.evaluate(() => {
  for (const o of balade.objets()) balade.objet({ type: 'objet', op: 'retirer', id: o.id });
  const c = balade.corps(); balade.placer(c.x, c.z, c.yaw + Math.PI);
  const B = MODELES, md = MENEUR.modeleDe(B, 'une énorme crotte'), fm = MENEUR.formesModele(md.modele, 'une énorme crotte');
  balade.objet({ type: 'objet', op: 'creer', ou: 'devant', distance: 0.9, objet: { id: 'f-1', nom: md.modele.nom, formes: fm.formes, degage: 0 } });
  const tas = MENEUR.ramassage(B, 'des bâtons et des cailloux');
  balade.objet({ type: 'objet', op: 'creer', differe: 'f-1', objet: { id: 'f-2', nom: tas.nom, formes: tas.formes, degage: 0 } });
  const mt = MENEUR.modeleDe(B, 'bonhomme de neige', { transforme: true }), ap = MENEUR.formesTransformees(mt.modele, fm.formes);
  balade.agir([{ type: 'rejoindre', objet: 'f-1' }, { type: 'posture', hauteur: 0.5 }, { type: 'faconner', objet: 'f-1' }, { type: 'posture', hauteur: 1 }]);
  balade.objet({ type: 'objet', op: 'faconner', id: 'f-1', etapes: [MENEUR.saillants ? MENEUR.saillants(ap.formes) : ap.formes], nom: mt.modele.nom, consomme: ['f-2'] });
});
await quand(() => balade.faconnage().file.some(f => f.total > 0));
const geste = await page.evaluate(() => balade.faconnage().file[0]);
for (const part of [0.05, 0.2, 0.32, 0.55, 0.8, 0.95]) {
  await page.evaluate(t => balade.pauseQuand('faconner', t), geste.total * part);
  await quand(() => balade.enPause() || !balade.faconnage().file.length);
  const g = await page.evaluate(() => balade.faconnage().file[0]);
  if (!g) break;
  await mesurer(`façonnage ${g.t} s (${g.geste})`);
}
writeFileSync(sortie, JSON.stringify({ px, grains: GRAINS, mesures: R }, null, 1));
console.log(sec(), 'écrit', sortie, erreurs.length ? 'ERREURS ' + erreurs.length : 'sans erreur');
await browser.close();
process.exit(erreurs.length ? 1 : 0);
