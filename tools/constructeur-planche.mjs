// Planche des scènes d'essai du constructeur : pour chaque dossier rempli par tools/constructeur-scene.mjs, la fiche avant
// relecture (rep-1.json) et la fiche gardée (fiche-finale.json), rendues depuis le départ et depuis l'approche de l'objet
// principal. Images dans <dossier>/planche-*.png ; l'assemblage se fait ensuite (python, voir docs/constructeur-de-monde.md).
//
// Usage : node tools/constructeur-planche.mjs <passes> <largeur> <hauteur> <dossier>...
import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validerFiche, resoudreFiche, choisirVues, geoApprochee } from '../src/constructeur.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const [,, passes = '8', L = '270', H = '480', ...dossiers] = process.argv;
for (const d of dossiers) {
  const avant = validerFiche(JSON.parse(readFileSync(join(d, 'rep-1.json'), 'utf8')), { id: 'avant' });
  const apres = existsSync(join(d, 'fiche-finale.json')) ? validerFiche(JSON.parse(readFileSync(join(d, 'fiche-finale.json'), 'utf8')), { id: 'apres' }) : null;
  const vuesRef = choisirVues(apres || avant, geoApprochee(apres || avant), 2);   // mêmes points de vue pour les deux versions
  const meta = [];
  for (const [nom, f] of [['avant', avant], ['apres', apres]]) {
    if (!f) continue;
    const geo = geoApprochee(f), r = resoudreFiche(f, geo);
    vuesRef.forEach((v, k) => {
      const z = v.z, yawTrajet = Math.atan2(geo.pathX(z + 3) - geo.pathX(z - 3), 6);
      const cfg = { still: true, nohud: true, nowalk: true, z, yaw: v.yaw - yawTrajet, scene: r, maxPx: +L * +H };
      const sortie = join(d, `planche-${nom}-${k + 1}.png`);
      const t = Date.now();
      const p = spawnSync('node', [join(root, 'tools/shot.mjs'), sortie, JSON.stringify(cfg), passes, L, H, '1500'], { cwd: root, encoding: 'utf8' });
      console.log(d, nom, k + 1, p.status === 0 ? 'ok' : 'ÉCHEC ' + p.stderr.slice(0, 200), ((Date.now() - t) / 1000).toFixed(0) + ' s');
      meta.push({ nom, k: k + 1, legende: v.legende });
    });
  }
  writeFileSync(join(d, 'planche.json'), JSON.stringify({ titre: (apres || avant).titre, vues: meta }, null, 1));
}
