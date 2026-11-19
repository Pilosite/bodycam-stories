// Captures de l'interface de la banque avec les scènes d'essai (out/scenes/<nom>/journal.json, écrits par
// tools/constructeur-scene.mjs) : téléphone en portrait et ordinateur en paysage. Sorties dans out/constructeur/.
//
// Usage : node tools/constructeur-interface.mjs [scène jouée] [pixels internes]
import { chromium } from 'playwright';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { installerFauxClaude } from '../tests/faux-claude.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const [,, jouee = 'gare', px = '60000'] = process.argv;
mkdirSync(join(root, 'out/constructeur'), { recursive: true });
const docs = {};
for (const n of ['port', 'gare', 'parking']) {
  const f = join(root, 'out/scenes', n, 'journal.json');
  if (existsSync(f)) { const d = JSON.parse(readFileSync(f, 'utf8')).job.doc; d.description = readFileSync(join(root, 'out/scenes', n, 'description.txt'), 'utf8').trim(); docs['scenes/' + d.id] = d; }
}
const idJouee = Object.values(docs).find(d => d.id.startsWith({ port: 'port', gare: 'la-gare', parking: 'parking' }[jouee]))?.id;
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
for (const [nom, vp, ouvrir] of [['portrait-scenes', { width: 390, height: 844 }, true], ['paysage-scenes', { width: 1440, height: 900 }, true], ['portrait-jeu', { width: 390, height: 844 }, false]]) {
  const page = await (await browser.newContext({ viewport: vp, deviceScaleFactor: 1 })).newPage();
  await page.addInitScript(installerFauxClaude, { script: [], images: true, db: true });
  await page.addInitScript(c => { window.__CFG = c; }, { maxPx: +px, still: true, nowalk: true });
  await page.goto('file://' + join(root, 'dist/index.html'));
  await page.evaluate(d => { localStorage.clear(); localStorage.setItem('faux-db', JSON.stringify(d)); }, docs);
  await page.reload();
  await page.waitForFunction(id => window.balade && balade.scenes().some(s => s.id === id), idJouee, { timeout: 300000 });
  await page.evaluate(id => balade.atelier().choisir(id), idJouee);
  await page.waitForFunction(() => window.__state && window.__state.n >= 8, null, { timeout: 900000, polling: 1000 });
  if (ouvrir) { await page.click('#lieu'); await page.waitForTimeout(300); await page.click(`.carte-tete[data-id="${idJouee}"]`); await page.waitForTimeout(300); await page.click('.carte.ouverte summary'); }
  await page.waitForTimeout(800);
  await page.screenshot({ path: join(root, 'out/constructeur', nom + '.png') });
  console.log(nom, 'ok');
  await page.close();
}
await browser.close();
