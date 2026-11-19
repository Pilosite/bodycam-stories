// Essai du moteur v2 (docs/moteur-v2.md) : mêmes poses rendues par le moteur actuel et par la projection de panoramiques.
// Usage : node tools/v2essai.mjs [dossier] [actuel|v2|tout]
// Poses : départ (z = 22), regard tourné de 58°, puis 2 m et 5 m de marche droit devant (agir/marcher, comme le récit).
// En v2, les panoramiques sont tournés une fois pour toutes en z = 22, 24,5 et 27 (option v2tour) avant la première image :
// on juge la projection seule, pas la course entre tournage et marche. Chaque pose v2 est aussi enregistrée sans
// remplissage, trous en magenta (suffixe -trous). Les temps mesurés sont écrits dans mesures-<mode>.json.
// Rendu logiciel : compter une dizaine de minutes pour le mode v2.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const [,, dir = 'out/v2', quoi = 'tout'] = process.argv;
mkdirSync(join(root, dir), { recursive: true });
const W = 270, H = 480, base = { still: true, nohud: true, nowalk: true, z: 22 };

async function session(mode) {
  const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const logs = []; page.on('console', m => { if (m.type() === 'error') logs.push(m.text()); }); page.on('pageerror', e => logs.push('pageerror: ' + e.message));
  const cfg = mode === 'v2' ? { ...base, v2: true, v2tour: [22, 24.5, 27] } : base;
  await page.addInitScript(c => { window.__CFG = c; }, cfg);
  await page.goto('file://' + join(root, 'dist/index.html'), { timeout: 600000 });
  const st = () => page.evaluate(() => window.__state || null);
  const until = async (f, max = 1500) => { const t0 = Date.now(); while ((Date.now() - t0) / 1000 < max) { await page.waitForTimeout(500); const s = await st(); if (s && f(s)) return s; } throw new Error(mode + ' : délai dépassé'); };
  const mes = { mode, poses: [] };
  // v2 : forcer une projection et laisser l'exposition se poser ; actuel : attendre 8 passes fixes
  const pret = async () => {
    if (mode === 'v2') { const k = await page.evaluate(() => { const v = window.__v2; v.lastPose = null; return v.nProj; });
      await page.waitForFunction(k => window.__v2.nProj > k, k, { timeout: 600000, polling: 300 }); await page.waitForTimeout(2500); }
    else await until(s => s.n >= 8 && s.file === 0);
  };
  const shot = async nom => {
    await pret(); const s = await st();
    await page.screenshot({ path: join(root, dir, mode + '-' + nom + '.png') });
    const p = { nom, z: +s.z.toFixed(2), x: +s.x.toFixed(2) };
    if (mode === 'v2') {
      p.msProjection = s.v2.msProj; p.points = s.v2.points;
      await page.evaluate(() => { window.__v2.fill = 0; window.__v2.marque = 1; });
      await pret(); await page.screenshot({ path: join(root, dir, mode + '-' + nom + '-trous.png') });
      await page.evaluate(() => { window.__v2.fill = 2; window.__v2.marque = 0; window.__v2.lastPose = null; });
    }
    mes.poses.push(p); console.log(mode, JSON.stringify(p));
  };
  const marcher = async m => {           // chronomètre chaque image pendant la marche
    const ech = [];
    await page.evaluate(m => window.balade.agir([{ type: 'marcher', metres: m }]), m);
    const t0 = Date.now();
    while (Date.now() - t0 < 600000) {
      const s = await page.evaluate(() => ({ f: window.__state && window.__state.file, ms: window.__v2 ? window.__v2.msProj : window.__state.msMotion, z: window.__state.z }));
      ech.push(s.ms); if (s.f === 0 && ech.length > 3) break; await page.waitForTimeout(150);
    }
    return ech;
  };
  if (mode === 'v2') { const s = await until(s => s.v2 && s.v2.faits.length >= 3); mes.panoramiques = s.v2.faits; console.log(mode, 'panoramiques', JSON.stringify(s.v2.faits)); }
  await shot('a-depart');
  for (let i = 0; i < 17; i++) await page.keyboard.press('ArrowRight');
  await shot('b-regard58');
  for (let i = 0; i < 17; i++) await page.keyboard.press('ArrowLeft');
  mes.marche = await marcher(2); await shot('c-marche2m');
  mes.marche = mes.marche.concat(await marcher(3)); await shot('d-marche5m');
  const s = await st(); mes.msMotionFinal = s.msMotion; mes.W = s.W; mes.H = s.H; if (s.v2) mes.msProjMoy = s.v2.msProjMoy;
  writeFileSync(join(root, dir, 'mesures-' + mode + '.json'), JSON.stringify(mes, null, 1));
  if (logs.length) console.log(mode, logs.slice(0, 8).join('\n'));
  await browser.close();
}
await Promise.all((quoi === 'tout' ? ['actuel', 'v2'] : [quoi]).map(session));
