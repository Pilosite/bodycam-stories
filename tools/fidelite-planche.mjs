// Planche avant / après des vues de tools/fidelite.mjs : une rangée par vue, l'avant à gauche, l'après à droite.
// Usage : node tools/fidelite-planche.mjs dossier-avant dossier-apres planche.png [largeur d'une image, défaut 640] [vues…]
// Sans liste de vues : toutes celles présentes dans les deux dossiers, dans l'ordre alphabétique.
import { chromium } from 'playwright';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const [,, A, B, sortie = 'out/fidelite-planche.png', larg = '640', ...noms] = process.argv;
const liste = noms.length ? noms.map(n => n + '.png') : readdirSync(A).filter(f => f.endsWith('.png') && readdirSync(B).includes(f)).sort();
const b64 = p => 'data:image/png;base64,' + readFileSync(p).toString('base64');
const paires = liste.map(f => ({ nom: f.replace('.png', ''), a: b64(join(A, f)), b: b64(join(B, f)) }));
const br = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const p = await br.newPage();
const png = await p.evaluate(async ({ paires, L }) => {
  const load = s => new Promise(ok => { const i = new Image(); i.onload = () => ok(i); i.src = s; });
  const rangs = []; let H = 0;
  for (const q of paires) { const a = await load(q.a), b = await load(q.b), h = Math.round(a.height * L / a.width); rangs.push({ q, a, b, h }); H += h + 34; }
  const c = document.createElement('canvas'); c.width = 2 * L + 30; c.height = H + 10; const g = c.getContext('2d');
  g.fillStyle = '#151515'; g.fillRect(0, 0, c.width, c.height); g.font = '16px sans-serif'; g.fillStyle = '#ddd';
  let y = 8;
  for (const r of rangs) {
    g.fillText(r.q.nom + ' : avant', 10, y + 18); g.fillText(r.q.nom + ' : après', L + 20, y + 18);
    g.drawImage(r.a, 10, y + 26, L, r.h); g.drawImage(r.b, L + 20, y + 26, L, r.h); y += r.h + 34;
  }
  return c.toDataURL('image/png');
}, { paires, L: +larg });
writeFileSync(resolve(sortie), Buffer.from(png.split(',')[1], 'base64'));
await br.close();
console.log('Planche : ' + sortie + ' (' + paires.length + ' vues)');
