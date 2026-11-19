// Compare deux dossiers de vues (par défaut ref/ et out/vues/) et produit une planche : référence, essai, écart amplifié.
// Usage : node tools/compare.mjs [référence] [essai] [planche.png]
// Mesure, par vue : écart moyen et écart quadratique (sur 255), PSNR, et écart moyen après flou 4×4 (le bruit du
// path tracing s'efface au flou, un changement de matière ou de lumière reste). Le bruit seul se mesure en comparant
// deux rendus du même code : c'est le plancher en dessous duquel une différence ne veut rien dire.
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cfg = JSON.parse(readFileSync(join(root, 'ref/vues.json'), 'utf8'));
const [,, refDir = 'ref', testDir = 'out/vues', sheet = 'out/comparaison.png'] = process.argv;
const b64 = p => 'data:image/png;base64,' + readFileSync(resolve(root, p)).toString('base64');
const vues = cfg.vues.map(v => ({ nom: v.nom, a: b64(join(refDir, v.nom + '.png')), b: b64(join(testDir, v.nom + '.png')) }));

const browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
const page = await browser.newPage();
const res = await page.evaluate(async vues => {
  const load = src => new Promise(ok => { const i = new Image(); i.onload = () => ok(i); i.src = src; });
  const px = img => { const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d'); g.drawImage(img, 0, 0); return g.getImageData(0, 0, c.width, c.height); };
  const blur = (d, w, h, k) => { const W = Math.floor(w / k), H = Math.floor(h / k), o = new Float32Array(W * H * 3);
    for (let y = 0; y < H * k; y++) for (let x = 0; x < W * k; x++) for (let c = 0; c < 3; c++) o[(Math.floor(y / k) * W + Math.floor(x / k)) * 3 + c] += d[(y * w + x) * 4 + c] / (k * k);
    return o; };
  const out = []; let sheetW = 0, sheetH = 0; const rows = [];
  for (const v of vues) {
    const A = await load(v.a), B = await load(v.b), w = A.width, h = A.height;
    const a = px(A).data, b = px(B).data; let s = 0, s2 = 0;
    const diff = new ImageData(w, h);
    for (let i = 0; i < a.length; i += 4) { let m = 0;
      for (let c = 0; c < 3; c++) { const d = a[i + c] - b[i + c]; s += Math.abs(d); s2 += d * d; m = Math.max(m, Math.abs(d)); }
      const sg = (a[i] + a[i + 1] + a[i + 2]) - (b[i] + b[i + 1] + b[i + 2]);
      diff.data[i] = sg < 0 ? Math.min(255, m * 4) : 0; diff.data[i + 1] = 0; diff.data[i + 2] = sg > 0 ? Math.min(255, m * 4) : 0; diff.data[i + 3] = 255; }
    const N = w * h * 3, rmse = Math.sqrt(s2 / N);
    const ba = blur(a, w, h, 4), bb = blur(b, w, h, 4); let sb = 0; for (let i = 0; i < ba.length; i++) sb += Math.abs(ba[i] - bb[i]);
    out.push({ vue: v.nom, ecart_moyen: +(s / N).toFixed(2), ecart_quadratique: +rmse.toFixed(2), psnr: +(20 * Math.log10(255 / Math.max(rmse, 1e-6))).toFixed(1), ecart_flou4: +(sb / ba.length).toFixed(2) });
    rows.push({ A, B, diff, w, h }); sheetW = Math.max(sheetW, w * 3 + 20); sheetH += h + 10;
  }
  const c = document.createElement('canvas'); c.width = sheetW; c.height = sheetH; const g = c.getContext('2d'); g.fillStyle = '#111'; g.fillRect(0, 0, sheetW, sheetH);
  let y = 0; for (const r of rows) { g.drawImage(r.A, 0, y); g.drawImage(r.B, r.w + 10, y); const t = document.createElement('canvas'); t.width = r.w; t.height = r.h; t.getContext('2d').putImageData(r.diff, 0, 0); g.drawImage(t, 2 * r.w + 20, y); y += r.h + 10; }
  return { out, png: c.toDataURL('image/png') };
}, vues);
await browser.close();
mkdirSync(dirname(resolve(root, sheet)), { recursive: true });
writeFileSync(resolve(root, sheet), Buffer.from(res.png.split(',')[1], 'base64'));
console.table(res.out);
console.log('Planche : ' + sheet + ' (référence | essai | écart ×4, rouge = essai plus clair, bleu = plus sombre)');
