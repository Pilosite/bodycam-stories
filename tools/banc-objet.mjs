// Banc d'images d'un modèle de la bibliothèque (src/modeles.json) : l'objet seul, posé sur le sol d'une fiche, à plusieurs
// tailles (formesModele, comme en partie), cadré de près et vu entier, en qualité mobile et complète, moteur v3.
// Une page par (fiche, qualité) ; l'objet est remplacé sur place (objetMeneur « remplacer ») entre deux tailles.
//
// Usage : node tools/banc-objet.mjs <modèle> [dossier] [variante]
// Variables : FICHES='8,0' (indices des fiches : 09 aube, 01 plein jour), TAILLES='0.12,0.5,0.9', QUAL='mobile,pc',
//   CADRES='pres,entier', PASSES (images accumulées, 5), W, H (portrait 240 × 426 ; pc : 560 × 350), GRAINE (graine du
//   modèle, pour ses variantes), MODELES (une autre bibliothèque), PAGE (une autre page que dist/index.html), PLANCHE=0 (pas de planche).
// Sortie : <dossier>/<fiche>-<qualité>-<taille>-<cadre>.png et <dossier>/planche.png (python3 + PIL).
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { formesModele } from '../src/meneur.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const [,, nomModele, dir = 'out/banc', variante = ''] = process.argv;
const BIB = JSON.parse(readFileSync(process.env.MODELES || join(root, 'src/modeles.json'), 'utf8'));
const M = BIB.modeles[nomModele];
if (!M) { console.error('modèle inconnu :', nomModele, Object.keys(BIB.modeles).join(' ')); process.exit(1); }
const out = join(root, dir); mkdirSync(out, { recursive: true });
const FICHES = (process.env.FICHES || '8,0').split(',').map(Number);
const TAILLES = (process.env.TAILLES || '0.12,0.5,0.9').split(',').map(Number);
const QUAL = (process.env.QUAL || 'mobile,pc').split(',');
const CADRES = (process.env.CADRES || 'pres,entier').split(',');
const PASSES = +(process.env.PASSES || 5);
const fichiers = readdirSync(join(root, 'scenes')).filter(f => f.endsWith('.json')).sort();
const ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'];

function formesA(taille) {                                          // le modèle à l'envergure demandée, par le même chemin qu'en partie
  const r = formesModele(Object.assign({}, M, { echelle: Object.assign({}, M.echelle, { min_m: 0.005, max_m: 30 }) }),
    `une ${M.nom} de ${Math.round(taille * 100)} cm`, process.env.GRAINE !== undefined ? +process.env.GRAINE : undefined);
  return r;
}

async function lire(page) {
  return page.evaluate(() => new Promise(ok => requestAnimationFrame(() => {
    const cv = document.querySelector('canvas'), c = document.createElement('canvas'); c.width = cv.width; c.height = cv.height;
    c.getContext('2d').drawImage(cv, 0, 0); ok(c.toDataURL('image/png')); })));
}

const faites = [];
for (const fi of FICHES) for (const q of QUAL) {
  const pc = q === 'pc', W = +(process.env.W || (pc ? 560 : 240)), H = +(process.env.H || (pc ? 350 : 426));
  const fiche = JSON.parse(readFileSync(join(root, 'scenes', fichiers[fi]), 'utf8'));
  const f0 = formesA(TAILLES[0]);
  // l'objet, hors du sentier, là où aucun élément de semis ne le touche (cherché dans la page)
  fiche.objets = [{ id: 'banc', nom: M.nom, devant: 30, cote: 3, degage: 0, formes: f0.formes }];
  const b = await chromium.launch({ headless: true, args: ARGS });
  const page = await b.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const logs = []; page.on('pageerror', e => logs.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/Failed to load|ERR_/.test(m.text())) logs.push(m.text()); });
  await page.addInitScript(c => { window.__CFG = c; },
    { still: true, nohud: true, nowalk: true, v3: true, full: pc, mobile: !pc, bureau: false, scene: fiche, z: 26, regulateur: false, grains: pc ? 1200000 : 300000 });
  const t0 = Date.now();
  await page.goto('file://' + join(root, process.env.PAGE || 'dist/index.html'), { timeout: 600000 });
  await page.waitForFunction(() => window.__state && window.__state.n >= 2, null, { timeout: 900000, polling: 1000 });
  // une place libre : ni semis, ni tronc, ni rocher à 1 m autour
  const place = await page.evaluate(() => {
    const libre = (x, z) => !semisSous(x, z, 1.0, 1.2) && !obstaclesConnus().some(o => Math.hypot(o.x - x, o.z - z) < (o.r || o.rayon || .3) + 1.2);
    for (let dv = 30; dv < 120; dv += 1.5) for (const ct of [3, -3, 4.5, -4.5, 6, -6]) { const x = pathX(dv) + ct; if (libre(x, dv) && libre(x + 1.5, dv)) return { devant: dv, cote: ct }; }
    return { devant: 30, cote: 3 };
  });
  await page.evaluate(p => { const o = fiche.objets.find(x => x.id === 'banc'); o.devant = p.devant; o.cote = p.cote; sceneDirty = true; buildShapes(fiche); }, place);
  console.log(fichiers[fi], q, 'page prête en', ((Date.now() - t0) / 1000).toFixed(0), 's, place', JSON.stringify(place));
  for (const T of TAILLES) {
    const fm = formesA(T);
    await page.evaluate(F => { objetMeneur({ type: 'objet', op: 'remplacer', id: 'banc', formes: F }); }, fm.formes);
    for (const cadre of CADRES) {
      // la caméra : soleil de côté (lumière rasante), à une distance de téléphone tenu (accroupi pour une petite chose)
      const r = await page.evaluate(([T, cadre, ratio]) => {
        const o = fiche.objets.find(x => x.id === 'banc'), q = posObjet(o);
        const sx = S.sunDir[0], sz = S.sunDir[2], az = Math.atan2(sx, sz) + Math.PI / 2;   // regard perpendiculaire au soleil
        const d = cadre === 'pres' ? Math.max(.35, T * 1.4) : Math.max(.6, T * 2.6), haut = T < .3 ? .45 : T < .7 ? .7 : 1;
        cam.x = q.x - Math.sin(az) * d; cam.z = q.z - Math.cos(az) * d; cam.yaw = az; cam.haut = haut; cam.elev = 0;
        const v = viserObjet('banc', true); cam.yaw += v.yaw; cam.pitch = v.pitch;
        const eye = S.eye * haut, dist = Math.hypot(d, eye - T * .3);
        const frac = cadre === 'pres' ? .5 : .28;                   // part de la hauteur d'image (portrait) que prend l'envergure
        const demi = 1.09 * (ratio > 1 ? 1 / ratio : 1);             // demi-angle vertical sans zoom (rad)
        const z = Math.max(1, Math.min(8, frac * 2 * demi * dist / T));
        cam.zoom = cam.zoomCible = z; look.yaw = 0; look.pitch = 0; sceneDirty = true;
        return { d: +d.toFixed(2), zoom: +z.toFixed(2), haut };
      }, [T, cadre, W / H]);
      await page.waitForTimeout(1200);
      await page.waitForFunction(n => window.__state.n >= n, PASSES, { timeout: 900000, polling: 500 }).catch(() => console.log('  (passes incomplètes)'));
      const nom = `${fichiers[fi].slice(0, 2)}-${q}-${String(Math.round(T * 100)).padStart(3, '0')}-${cadre}.png`;
      writeFileSync(join(out, nom), Buffer.from((await lire(page)).split(',')[1], 'base64'));
      faites.push(nom); console.log(' ', nom, JSON.stringify(r), 'formes', fm.formes.length, 'envergure', fm.envergure, ((Date.now() - t0) / 1000).toFixed(0) + ' s');
    }
  }
  if (logs.length) console.log('  erreurs :', logs.slice(0, 4).join(' | '));
  await b.close();
}
if (process.env.PLANCHE !== '0') {
  const py = `
import sys, os
from PIL import Image, ImageDraw
d = sys.argv[1]; noms = sys.argv[2:]
ims = [Image.open(os.path.join(d, n)).convert('RGB') for n in noms]
h = 300
ims = [im.resize((int(im.width * h / im.height), h)) for im in ims]
rangs = {}
for n, im in zip(noms, ims): rangs.setdefault(n.split('-')[0] + '-' + n.split('-')[1], []).append((n, im))
W = max(sum(im.width + 4 for _, im in r) for r in rangs.values()); Ht = len(rangs) * (h + 18)
P = Image.new('RGB', (W, Ht), (20, 20, 20)); dr = ImageDraw.Draw(P); y = 0
for k, r in rangs.items():
  x = 0
  for n, im in r: P.paste(im, (x, y + 16)); dr.text((x + 2, y + 2), n[:-4], fill=(230, 230, 230)); x += im.width + 4
  y += h + 18
P.save(os.path.join(d, 'planche.png'))
`;
  execFileSync('python3', ['-c', py, out, ...faites]);
  console.log('planche :', join(dir, 'planche.png'));
}
