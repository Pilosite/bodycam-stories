// Planche des séquences de tools/pixel.mjs : une rangée par version (avant, après…), images entières puis agrandissements.
// Usage : node tools/pixel-planche.mjs sortie.png séquence images rect étiquette=dossier [étiquette=dossier…]
//   images : numéros séparés par des virgules (ex. 1,4,8,12) ; rect : x,y,l,h dans l'image du capteur (315 × 570), agrandi
//   ×3,43 comme le navigateur du téléphone l'agrandit à l'écran (filtrage bilinéaire, variable PROCHE=1 : au plus proche).
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const [,, sortie, seq, imgs, rect, ...rangs] = process.argv;
const nums = imgs.split(',').map(Number), R = rect.split(',').map(Number);
const rows = rangs.map(r => { const [et, d] = r.split('='); return { et, imgs: nums.map(k => {
  const f = resolve(root, d, seq + '-' + String(k).padStart(2, '0') + '.png'); return existsSync(f) ? 'data:image/png;base64,' + readFileSync(f).toString('base64') : ''; }) }; });
const b = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const p = await b.newPage();
const url = await p.evaluate(async ({ rows, nums, R, seq, proche }) => {
  const load = s => new Promise(ok => { if (!s) return ok(null); const i = new Image(); i.onload = () => ok(i); i.src = s; });
  const K = 3.43, w = 315, h = 570, m = 10, tete = 40, et = 26, cw = Math.round(R[2] * K), ch = Math.round(R[3] * K);
  const n = nums.length, larg = m + n * (w + m) + n * (cw + m), haut = tete + rows.length * (Math.max(h, ch) + et + m);
  const c = document.createElement('canvas'); c.width = larg; c.height = haut; const g = c.getContext('2d');
  g.fillStyle = '#151515'; g.fillRect(0, 0, larg, haut); g.fillStyle = '#eee'; g.font = '600 20px sans-serif';
  g.fillText(seq + ' · images ' + nums.join(', ') + ' (33 ms) · à droite : agrandi ×3,43 comme à l\'écran du téléphone', m, 28);
  for (let r = 0; r < rows.length; r++) {
    const y = tete + r * (Math.max(h, ch) + et + m);
    g.fillStyle = '#ccc'; g.font = '18px sans-serif'; g.fillText(rows[r].et, m, y + 19);
    for (let i = 0; i < n; i++) {
      const im = await load(rows[r].imgs[i]); if (!im) continue;
      const x = m + i * (w + m); g.imageSmoothingEnabled = true; g.drawImage(im, x, y + et);
      g.strokeStyle = '#f33'; g.lineWidth = 1; g.strokeRect(x + R[0] + .5, y + et + R[1] + .5, R[2], R[3]);
      g.fillStyle = '#fff'; g.fillText(String(nums[i]), x + 4, y + et + 18);
      const x2 = m + n * (w + m) + i * (cw + m); g.imageSmoothingEnabled = !proche; g.imageSmoothingQuality = 'low';
      g.drawImage(im, R[0], R[1], R[2], R[3], x2, y + et, cw, ch);
    }
  }
  return c.toDataURL('image/png');
}, { rows, nums, R, seq, proche: !!process.env.PROCHE });
writeFileSync(resolve(root, sortie), Buffer.from(url.split(',')[1], 'base64'));
await b.close();
console.log(sortie);
