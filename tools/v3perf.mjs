// Moteur v3 en qualité mobile : images avant / après les optimisations (docs/moteur-v3.md, « Vers 30 images par seconde »).
// Usage :
//   node tools/v3perf.mjs rendre out/v3perf/apres ['{"options":"en plus"}']
//        rend en v3, qualité mobile (CFG full:false, mobile:true), les trois vues de forêt de ref/vues.json (16 images
//        accumulées), puis le départ de la vue a-sentier après 2 m et 5 m de marche (image prise dès l'arrêt du pas : c'est
//        l'image de marche, sans accumulation à l'arrêt). Les options en plus permettent de couper une optimisation.
//   node tools/v3perf.mjs planche out/v3perf/avant out/v3perf/apres [out/v3perf-planche.png]
//        assemble : ref/ | avant | après pour les trois vues, puis la marche avant | après.
// Rendu logiciel (SwiftShader) : trois navigateurs à la fois au plus.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const [,, quoi = 'rendre', a = 'out/v3perf/apres', b = '{}', c = 'out/v3perf-planche.png'] = process.argv;
const vues = JSON.parse(readFileSync(join(root, 'ref/vues.json'), 'utf8'));
const W = vues.largeur, H = vues.hauteur;
const ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'];
const foret = vues.vues.filter(v => !v.options.scene);
const BASE = { v3: true, full: false, mobile: true, still: true, nohud: true, nowalk: true };

async function page(browser, cfg) {
  const p = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  p.logs = []; p.on('console', m => { if (m.type() === 'error') p.logs.push(m.text()); }); p.on('pageerror', e => p.logs.push('pageerror: ' + e.message));
  await p.addInitScript(c => { window.__CFG = c; }, cfg);
  await p.goto('file://' + join(root, 'dist/index.html'), { timeout: 600000 });
  return p;
}
const st = p => p.evaluate(() => window.__state || null);
async function attendre(p, f, max = 900) {
  const t0 = Date.now();
  while ((Date.now() - t0) / 1000 < max) { await p.waitForTimeout(400); const s = await st(p); if (s && f(s)) return s; }
  throw new Error('délai dépassé');
}

async function rendre(dir, extra) {
  mkdirSync(join(root, dir), { recursive: true });
  const browser = await chromium.launch({ headless: true, args: ARGS });
  const statique = foret.map(async v => {
    const p = await page(browser, { ...BASE, ...extra, ...v.options });
    const s = await attendre(p, s => s.n >= 16);
    await p.screenshot({ path: join(root, dir, v.nom + '.png') });
    console.log(dir, v.nom, 'images', s.v3 && s.v3.images, p.logs.join(' | '));
    await p.close();
  });
  const marche = (async () => {
    const p = await page(browser, { ...BASE, ...extra, z: 22 });
    await attendre(p, s => s.n >= 8);
    const marcher = async m => {
      await p.evaluate(m => window.balade.agir([{ type: 'marcher', metres: m }]), m);
      for (;;) { const s = await st(p); if (s.file === 0) break; await p.waitForTimeout(150); }
    };
    await marcher(2); await p.screenshot({ path: join(root, dir, 'marche2m.png') });
    await marcher(3); await p.screenshot({ path: join(root, dir, 'marche5m.png') });
    console.log(dir, 'marche faite', p.logs.join(' | '));
    await p.close();
  })();
  await Promise.all([...statique, marche]);
  await browser.close();
}

async function planche(avant, apres, sortie) {
  const browser = await chromium.launch({ headless: true, args: ARGS });
  const img = f => existsSync(f) ? 'data:image/png;base64,' + readFileSync(f).toString('base64') : null;
  const lignes = foret.map(v => ({ titre: v.nom + ' · à l\'arrêt, 16 images', imgs: [img(join(root, 'ref', v.nom + '.png')), img(join(root, avant, v.nom + '.png')), img(join(root, apres, v.nom + '.png'))], noms: ['ref/ (rayons, 24 passes)', 'v3 mobile avant', 'v3 mobile après'] }));
  lignes.push({ titre: 'en marche depuis a-sentier (image de marche, sans accumulation)', imgs: [img(join(root, avant, 'marche2m.png')), img(join(root, apres, 'marche2m.png')), img(join(root, apres, 'marche5m.png'))], noms: ['2 m, avant', '2 m, après', '5 m, après'] });
  lignes.push({ titre: '', imgs: [img(join(root, avant, 'marche5m.png')), null, null], noms: ['5 m, avant', '', ''] });
  const q = await browser.newPage();
  const png = await q.evaluate(async ({ lignes, W, H }) => {
    const load = s => new Promise(ok => { const i = new Image(); i.onload = () => ok(i); i.src = s; });
    const c = document.createElement('canvas'), m = 12, th = 24, lh = 18;
    c.width = 3 * W + 4 * m; c.height = lignes.length * (H + th + lh + m) + m;
    const g = c.getContext('2d'); g.fillStyle = '#141414'; g.fillRect(0, 0, c.width, c.height);
    let y = m;
    for (const l of lignes) {
      g.fillStyle = '#eee'; g.font = '600 14px sans-serif'; g.fillText(l.titre, m, y + 16); y += th;
      for (let k = 0; k < l.imgs.length; k++) { if (!l.imgs[k]) continue; const i = await load(l.imgs[k]); g.drawImage(i, m + k * (W + m), y, W, H);
        g.fillStyle = '#bbb'; g.font = '12px sans-serif'; g.fillText(l.noms[k], m + k * (W + m), y + H + 14); }
      y += H + lh + m;
    }
    return c.toDataURL('image/png');
  }, { lignes, W, H });
  writeFileSync(join(root, sortie), Buffer.from(png.split(',')[1], 'base64'));
  console.log('Planche : ' + sortie);
  await browser.close();
}

if (quoi === 'rendre') await rendre(a, JSON.parse(b));
else if (quoi === 'planche') await planche(a, b, c);
else console.log('rendre ou planche');
