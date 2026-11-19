// Gros plans du moteur v3 : voit-on à travers une surface pleine quand la caméra s'approche ? (docs/moteur-v3.md, « Plus de transparence de près »)
// Usage : node tools/v3gros.mjs [dossier] [vues…]     vues : tronc05 rocher1 mur2 petit15 facade2 village2 muret2 noix06 noix16 dedans (toutes par défaut)
// PAGE=autre.html : une autre page que dist/index.html (par exemple celle de main, pour comparer).
// Pour chaque vue, quatre images v3 (270 × 480, rendu logiciel) :
//   -arret  : 8 images accumulées à l'arrêt ;
//   -seule  : une image neuve, sans accumulation (le pire cas : ce que la marche montre avant que le temps ne lisse) ;
//   -marche : pendant un recul de 60 cm (image prise en mouvement, reprojection et image neuve mêlées) ;
//   -rayons : le lanceur de rayons, 6 passes, même pose (option RAYONS=1 ; long).
// Qualité mobile par défaut (300 000 grains, tapis, damier), comme sur le téléphone ; COMPLETE=1 pour la qualité complète.
// Les poses sont calculées dans la page, à partir des objets eux-mêmes (distance à la surface, pas à l'axe).
import { chromium } from 'playwright';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const [,, dir = 'out/v3gros', ...noms] = process.argv;
mkdirSync(join(root, dir), { recursive: true });
const ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'];
const f0 = JSON.parse(readFileSync(join(root, 'scenes/01-grands-avaux.json'), 'utf8'));
// un objet de 20 cm posé sur le sentier (fiche 01 + un objet), vu à 1,5 m
const petit = { ...f0, id: 'petit-objet', objets: [{ id: 'figurine', devant: 24, cote: 0, formes: [
  { f: 'boite', p: [0, .05, 0], taille: [.2, .1, .14], couleur: '#7a5a3a', matiere: 'bois' },
  { f: 'boule', p: [0, .15, 0], taille: [.1, .1, .1], couleur: '#c8b89a', matiere: 'pierre' },
  { f: 'cylindre', p: [.06, .12, .05], taille: [.03, .14, .03], couleur: '#303030', matiere: 'metal' }] }] };
// une pièce fermée (quatre murs, un plafond) autour de la caméra : voit-on le dehors à travers les murs ?
const dedans = { ...f0, id: 'piece', foret: { ...f0.foret }, objets: [{ id: 'piece', devant: 24, cote: 0, cap: 0, formes: [
  { f: 'boite', p: [0, 1.4, 2], taille: [4, 2.8, .2], couleur: '#d8d0c0', matiere: 'mat' },
  { f: 'boite', p: [0, 1.4, -2], taille: [4, 2.8, .2], couleur: '#d8d0c0', matiere: 'mat' },
  { f: 'boite', p: [2, 1.4, 0], taille: [.2, 2.8, 4], couleur: '#c8c0b0', matiere: 'mat' },
  { f: 'boite', p: [-2, 1.4, 0], taille: [.2, 2.8, 4], couleur: '#c8c0b0', matiere: 'mat' },
  { f: 'boite', p: [0, 2.85, 0], taille: [4.2, .1, 4.2], couleur: '#e0dcd0', matiere: 'mat' }] }] };

// Pose : fonction évaluée dans la page (accès aux globales du script : cam, shapesData, arbreA… côté JS n'existe pas,
// donc pour les arbres et les blocs on cherche la surface par la sonde de distance du lanceur de rayons, exposée par balade).
const VUES = {
  tronc05: { cfg: { z: 34.96, dx: 1.05, cap: 1.5708 }, cible: .5, quoi: 'tronc' },
  rocher1: { cfg: { z: 22.77, dx: -.65, cap: 1.5708 }, cible: 1, quoi: 'bloc de grès' },
  mur2: { cfg: { scene: 4, z: 14 }, mur: 2, quoi: 'mur de la maison' },
  petit15: { cfg: { scene: petit, z: 24 - 0.62, pitch: -.95 }, quoi: 'objet de 20 cm' },
  facade2: { cfg: { scene: 5, z: 10, dx: 4, cap: 1.5708 }, quoi: 'façade de San Francisco (semis)' },
  village2: { cfg: { scene: 6, z: 6, dx: 1.9, cap: 1.5708 }, quoi: 'maison du village la nuit, à la lampe (semis)' },
  muret2: { cfg: { scene: 7, z: 20, dx: 11.7, cap: 1.5708, pitch: -.35 }, quoi: 'mur du cimetière (semis)' },
  // objet fabriqué en cours de partie (comme objetMeneur après une demande au porteur) : 3 formes de 3 à 10 cm, posé sur le
  // sentier, créé APRÈS le début de la scène ; vu accroupi (œil à 0,6 m) puis debout (1,6 m)
  noix06: { cfg: { z: 22 }, fab: { distance: .4, haut: .45 }, quoi: 'objet fabriqué de 3 à 10 cm, accroupi à 0,6 m' },
  noix16: { cfg: { z: 22 }, fab: { distance: .85, haut: 1 }, quoi: 'objet fabriqué de 3 à 10 cm, debout à 1,6 m' },
  dedans: { cfg: { scene: dedans, z: 24, dx: 0, cap: .6, pitch: .15 }, quoi: 'pièce fermée' },
};
const liste = noms.length ? noms : Object.keys(VUES);
const base = { still: true, nohud: true, nowalk: true, full: !!process.env.COMPLETE };   // qualité mobile par défaut (celle du téléphone) ; COMPLETE=1 : qualité complète

async function attendre(p, n, max = 900) {
  const t0 = Date.now(); let s = null;
  while ((Date.now() - t0) / 1000 < max) { await p.waitForTimeout(700); s = await p.evaluate(() => window.__state || null); if (s && s.n >= n) break; }
  return s;
}
async function vue(nom) {
  const V = VUES[nom], b = await chromium.launch({ headless: true, args: ARGS });
  try {
    for (const moteur of process.env.RAYONS ? ['v3', 'rayons'] : ['v3']) {
      const p = await b.newPage({ viewport: { width: 270, height: 480 }, deviceScaleFactor: 1 });
      const logs = []; p.on('pageerror', e => logs.push(e.message)); p.on('console', m => { if (m.type() === 'error') logs.push(m.text()); });
      await p.addInitScript(c => { window.__CFG = c; }, { ...base, ...V.cfg, v3: moteur === 'v3', bureau: false });
      await p.goto('file://' + join(root, process.env.PAGE || 'dist/index.html'), { timeout: 600000 });
      if (V.mur) await p.evaluate(d => {                    // devant la face avant de la boîte principale du premier objet, à d mètres
        const r = 8 * 16, x = shapesData[r], z = shapesData[r + 2], tz = shapesData[r + 6], yaw = shapesData[r + 7], s = Math.sin(yaw), c = Math.cos(yaw);
        cam.x = x + s * (tz + d); cam.z = z + c * (tz + d); cam.yaw = Math.atan2(-s, -c); sceneDirty = true;
      }, V.mur);
      if (V.fab) {                                             // la scène tourne d'abord, puis l'objet apparaît (objetMeneur, comme en partie)
        await attendre(p, 2);
        const r = await p.evaluate(f => {
          objetMeneur({ type: 'objet', op: 'creer', ou: 'devant', distance: f.distance, objet: { id: 'fab-1', nom: 'crotte', formes: [
            { f: 'boule', p: [0, .025, 0], taille: [.1, .05, .07], couleur: '#4a3220', matiere: 'mat' },
            { f: 'boule', p: [.03, .055, .005], taille: [.06, .04, .05], couleur: '#3e2a1a', matiere: 'mat' },
            { f: 'capsule', p: [-.03, .02, .03], taille: [.03, .03, .03], couleur: '#55391f', matiere: 'mat' }] } });
          cam.haut = f.haut; const v = viserObjet('fab-1'); if (!v) return null;
          cam.yaw += v.yaw; cam.pitch = v.pitch; sceneDirty = true;
          const o = fiche.objets.find(x => x.id === 'fab-1'), q = posObjet(o);
          return { objN: S.objN, rangs: S.objRows, d: Math.hypot(q.x - cam.x, q.z - cam.z, terrainH(q.x, q.z) + .04 - (terrainH(cam.x, cam.z) + S.eye * cam.haut)) };
        }, V.fab);
        console.log(nom, 'objet fabriqué :', JSON.stringify(r));
      }
      const t0 = Date.now();
      if (moteur === 'rayons') { await attendre(p, 6); await p.screenshot({ path: join(root, dir, nom + '-rayons.png'), timeout: 300000 }); await p.close(); continue; }
      let s = await attendre(p, 8);
      await p.screenshot({ path: join(root, dir, nom + '-arret.png'), timeout: 300000 });
      await p.evaluate(() => { V3.max = 1; V3.hist = null; sceneDirty = true; });   // sans historique : ni mélange, ni damier
      await p.waitForTimeout(300); s = await attendre(p, 1);
      await p.waitForTimeout(1500);                            // laisser passer une image de plus (capteur)
      await p.screenshot({ path: join(root, dir, nom + '-seule.png'), timeout: 300000 });
      await p.evaluate(() => { V3.max = 64; window.balade.agir([{ type: 'marcher', metres: -.6 }]); });
      let k = 0; for (;;) { await p.waitForTimeout(400); s = await p.evaluate(() => window.__state); if (s.file === 0 || ++k > 6) break; }
      await p.screenshot({ path: join(root, dir, nom + '-marche.png'), timeout: 300000 });
      console.log(nom, V.quoi, ((Date.now() - t0) / 1000).toFixed(0) + ' s', s && s.v3 ? 'v3 ' + s.v3.msMoy + ' ms' : '', logs.slice(0, 3).join(' | '));
      await p.close();
    }
  } catch (e) { console.log(nom, 'ÉCHEC', String(e.message || e).split('\n')[0]); }
  await b.close().catch(() => {});
}
for (let i = 0; i < liste.length; i += 2) await Promise.all(liste.slice(i, i + 2).map(vue));
