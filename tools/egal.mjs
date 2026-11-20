// Écart entre deux captures (même pose) : moyen, et moyen après flou 4 × 4 (le bruit s'efface, un changement de matière reste).
// Usage : node tools/egal.mjs a.png b.png [c.png d.png …]   (par paires)
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
const f = process.argv.slice(2), b64 = p => 'data:image/png;base64,' + readFileSync(p).toString('base64');
const nav = await chromium.launch({ headless: true, args: ['--no-sandbox'] }), page = await nav.newPage();
for (let i = 0; i + 1 < f.length; i += 2) {
  const r = await page.evaluate(async ([a, b]) => {
    const load = s => new Promise(ok => { const im = new Image(); im.onload = () => ok(im); im.src = s; });
    const px = im => { const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const g = c.getContext('2d'); g.drawImage(im, 0, 0); return g.getImageData(0, 0, c.width, c.height).data; };
    const A = await load(a), B = await load(b), w = A.width, h = A.height, x = px(A), y = px(B), k = 4;
    let s = 0; for (let j = 0; j < x.length; j += 4) for (let c = 0; c < 3; c++) s += Math.abs(x[j + c] - y[j + c]);
    const W = Math.floor(w / k), H = Math.floor(h / k), o = new Float32Array(W * H * 3);
    for (let yy = 0; yy < H * k; yy++) for (let xx = 0; xx < W * k; xx++) for (let c = 0; c < 3; c++) { const j = (yy * w + xx) * 4 + c; o[(Math.floor(yy / k) * W + Math.floor(xx / k)) * 3 + c] += (x[j] - y[j]) / (k * k); }
    let sb = 0; for (const v of o) sb += Math.abs(v);
    return { moyen: +(s / (w * h * 3)).toFixed(2), flou: +(sb / o.length).toFixed(2) };
  }, [b64(f[i]), b64(f[i + 1])]);
  console.log(f[i], f[i + 1], JSON.stringify(r));
}
await nav.close();
