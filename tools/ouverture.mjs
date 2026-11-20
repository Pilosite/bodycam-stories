// L'ouverture de démo dans la page, au téléphone (390 × 780, tactile) puis à l'ordinateur (1280 × 800) :
// captures de la question, de la suggestion tapée, du milieu du rejeu, du fondu et du monde, puis contrôle de l'arrivée
// (position inchangée 15 s après, phrase affichée). Captures dans out/ouverture/.
// Usage : node tools/ouverture.mjs [telephone|ordinateur] [--mention]
// PAGE=autre.html : une autre page que dist/index.html (comparer à main) ; OMBRAGE=echelle|plein|socle (défaut echelle, comme la
// page publiée : window.__CFG mettrait « plein »). Mesure aussi l'attente entre la fin du rejeu (ligne « Le monde se construit »)
// et le départ du fondu.
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, process.env.OUT || 'out/ouverture'); mkdirSync(out, { recursive: true });
const quoi = process.argv.slice(2).filter(a => !a.startsWith('--'));
const mention = process.argv.includes('--mention');
const FORMATS = {
  telephone: { viewport: { width: 390, height: 780 }, isMobile: true, hasTouch: true, cfg: { mobile: true, w: 195, h: 390 } },
  ordinateur: { viewport: { width: 1280, height: 800 }, isMobile: false, hasTouch: false, cfg: { bureau: true, full: false, w: 320, h: 200, grains: 300000 } },
};
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
let echecs = 0;
for (const nom of quoi.length ? quoi : Object.keys(FORMATS)) {
  const F = FORMATS[nom], suf = nom + (mention ? '-mention' : '');
  const ctx = await browser.newContext({ viewport: F.viewport, isMobile: F.isMobile, hasTouch: F.hasTouch, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const logs = []; page.on('pageerror', e => logs.push('pageerror: ' + e.message)); page.on('console', m => { if (m.type() === 'error') logs.push(m.text()); });
  await page.addInitScript(c => { window.__CFG = c; }, Object.assign({ demo: true, arrivee: true, v3: true, demoMention: mention, ombrage: process.env.OMBRAGE || 'echelle' }, F.cfg));
  await page.goto('file://' + resolve(root, process.env.PAGE || 'dist/index.html'), { timeout: 600000 });
  await page.waitForSelector('#ouverture:not([hidden])', { timeout: 120000 });
  await page.waitForTimeout(800);
  const shot = async n => { await page.screenshot({ path: join(out, suf + '-' + n + '.png'), timeout: 300000 }); console.log(nom, n); };
  await shot('1-question');
  await page.click('#ouv-sugg');
  await page.waitForFunction(() => document.getElementById('ouv-txt').value.length > 40, null, { timeout: 240000 });
  await page.waitForTimeout(2500);
  await shot('2-suggestion');
  const t0 = Date.now();
  await page.click('#ouv-go');
  // Les vignettes de photos (ouvertures/photos/*.json) : la rafale, une observation qui s'écrit, l'épinglage près des constats.
  const photos = await page.evaluate(() => (typeof OUVERTURES !== 'undefined' ? OUVERTURES : []).some(r => r.vignettes));
  if (photos) {
    await page.waitForFunction(() => document.querySelectorAll('.ouv-vg').length >= 4, null, { timeout: 600000, polling: 30 });
    await shot('3a-rafale');
    await page.waitForFunction(() => document.querySelectorAll('.ouv-vg.lue, .ouv-vg.ecartee').length >= 6, null, { timeout: 600000, polling: 30 });
    await shot('3b-observations');
    await page.waitForFunction(() => document.querySelectorAll('.ouv-epingle').length >= 3, null, { timeout: 600000, polling: 30 });
    await shot('3c-epinglage');
    const vg = await page.evaluate(() => ({ cartes: document.querySelectorAll('.ouv-vg').length, decodees: [...document.querySelectorAll('.ouv-vg img')].filter(i => i.complete && i.naturalWidth > 0).length, credit: (document.querySelector('.ouv-credit') || {}).textContent || '' }));
    console.log(nom, 'vignettes', JSON.stringify(vg));
    if (!vg.credit.includes('Wikimedia Commons') || vg.decodees < vg.cartes) echecs++;
  }
  await page.waitForFunction(() => document.querySelectorAll('.ouv-constat').length >= 4, null, { timeout: 600000 });
  await shot('3-rejeu');
  const mentionVue = await page.evaluate(() => { const m = document.getElementById('ouv-mention'); return !!m && !m.hidden && m.textContent; });
  console.log(nom, 'constats affichés après', ((Date.now() - t0) / 1000).toFixed(1), 's');
  await page.waitForFunction(() => document.querySelectorAll('.ouv-valeur').length >= 5, null, { timeout: 600000 });
  await shot('4-traduction');
  await page.waitForFunction(() => [...document.querySelectorAll('.ouv-titre')].some(x => x.textContent === 'Le monde se construit'), null, { timeout: 1200000, polling: 50 });
  const tMonde = Date.now();
  await page.waitForFunction(() => { const o = document.getElementById('ouverture'); return !o || o.classList.contains('ouv-fondu'); }, null, { timeout: 1200000, polling: 50 });   // en rendu logiciel, le fondu peut être fini avant qu'on regarde
  const attente = (Date.now() - tMonde) / 1000, mes = await page.evaluate(() => window.balade.ouvertureMesure ? window.balade.ouvertureMesure() : null);
  console.log(nom, 'fondu après', ((Date.now() - t0) / 1000).toFixed(1), 's ; attente fin du rejeu → fondu', attente.toFixed(1), 's', mes ? JSON.stringify(mes) : '');
  await page.waitForTimeout(900);
  await shot('5-fondu');
  await page.waitForFunction(() => !document.getElementById('ouverture'), null, { timeout: 600000 });
  const p0 = await page.evaluate(() => window.balade.corps());
  const fiche = await page.evaluate(() => window.__state && window.__state.titre);
  await page.waitForFunction(() => document.getElementById('pensee').textContent.length > 5, null, { timeout: 60000 });
  await shot('6-monde');
  await page.waitForTimeout(15000);
  const p1 = await page.evaluate(() => window.balade.corps()), arr = await page.evaluate(() => window.balade.arrivee());
  await shot('7-arrivee-15s');
  const bouge = Math.hypot(p1.x - p0.x, p1.z - p0.z);
  const ok = bouge < 0.05 && /\?|…|\./.test(arr.pensee) && !arr.errance && (mention ? !!mentionVue : !mentionVue);
  if (!ok) echecs++;
  console.log(JSON.stringify({ format: nom, fiche, deplacement_m: +bouge.toFixed(3), cap_avant: +p0.yaw.toFixed(2), cap_apres: +p1.yaw.toFixed(2), pensee: arr.pensee, errance: arr.errance, mention: mentionVue || false, ok }));
  const reels = logs.filter(l => !l.includes('ERR_TUNNEL') && !l.includes('Failed to load resource'));
  if (reels.length) { console.log(reels.slice(0, 8).join('\n')); echecs++; }
  await ctx.close();
}
await browser.close();
process.exit(echecs ? 1 : 0);
