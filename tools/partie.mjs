// Joue « Avant la nuit » de bout en bout dans dist/index.html, sans Claude (secours : répliques et lexique),
// en parlant au porteur par l'interface comme un joueur. Captures et trace dans out/meneur/.
// Puis rejoue la trace dans Node (src/meneur.js) et vérifie que l'état final est le même.
//
// Usage : node tools/partie.mjs [demi-tour|retrouve|veille] [pixels internes] [v3]
//   demi-tour : après le sac, elle redescend (2 à 3 minutes)
//   retrouve  : après la lueur, on la guide vers la lanterne (5 à 8 minutes)
//   veille    : personne ne parle, fin par défaut à 14 minutes
//   v3        : la partie jouée avec le moteur v3 (le semeur), qui doit tenir le passage à la nuit et la lampe ; captures préfixées v3-
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rejouer } from '../src/meneur.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const [,, fin0 = 'demi-tour', px = '20000', moteur = ''] = process.argv;
const v3 = moteur === 'v3', fin = fin0;
const out = join(root, 'out/meneur');
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 300, height: 560 }, deviceScaleFactor: 1 });
const erreurs = [];
page.on('pageerror', e => erreurs.push(e.message));
page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_/.test(m.text())) erreurs.push(m.text()); });
await page.addInitScript(c => { window.__CFG = c; }, { histoire: 'avant-la-nuit', maxPx: +px, debug: true, still: true, graine: 7, ...(v3 ? { v3: true } : {}) });
await page.goto('file://' + join(root, 'dist/index.html'));

const t0 = Date.now(), sec = () => ((Date.now() - t0) / 1000).toFixed(0).padStart(4);
const attendre = ms => page.waitForTimeout(ms);
const partie = () => page.evaluate(() => balade.partie());
const passe = (p, id) => p.trame.passes.some(x => x.id === id);
const capture = async nom => { await attendre(1500); await page.screenshot({ path: join(out, `${v3 ? 'v3-' : ''}${fin}-${nom}.png`) });
  const e = await page.evaluate(() => ({ v3: !!(window.__state && window.__state.v3), nuit: window.__state && window.__state.nuit, bouton: document.getElementById('v3') && document.getElementById('v3').textContent }));
  console.log(sec(), 'capture', nom, JSON.stringify(e)); };
async function dire(texte) {                                     // comme un joueur : « Lui parler », taper, envoyer
  await page.click('#parler');
  await page.fill('#msg', texte);
  await page.press('#msg', 'Enter');
  await page.waitForFunction(() => document.getElementById('dire').hidden, null, { timeout: 30000 });
  console.log(sec(), 'voix :', texte, '→', await page.textContent('#pensee'));
}
const libre = () => page.evaluate(() => window.__state && window.__state.file === 0);

let derniere = '', cap = new Set();
await attendre(3000); await capture('depart');
while ((Date.now() - t0) / 1000 < 22 * 60) {
  await attendre(400);
  const p = await partie();
  const pensee = await page.textContent('#pensee');
  if (pensee && pensee !== derniere) { derniere = pensee; console.log(sec(), 'pensée :', pensee); }
  if (p.trame.fin_jouee) break;
  if (passe(p, 'sac') && !cap.has('sac')) { cap.add('sac'); await capture('sac'); }
  if (passe(p, 'lueur') && !cap.has('lueur')) { cap.add('lueur'); await capture('lueur'); }
  if (p.trame.fin && !cap.has('arrivee')) { cap.add('arrivee'); await capture('arrivee'); }   // la dernière image, avant l'écran de fin
  if (p.trame.fin) continue;
  if (fin === 'demi-tour' && passe(p, 'sac') && !cap.has('dit')) {
    if (!(await libre())) continue;
    cap.add('dit'); await dire('fais demi-tour'); await attendre(2500); await dire('avance 30');
  }
  if (fin === 'demi-tour' && cap.has('dit') && await libre()) await dire('avance 20');
  if (fin === 'retrouve' && passe(p, 'lueur') && await libre()) {        // on la guide vers la lanterne, pas à pas
    const ha = (await page.evaluate(() => balade.percevoir())).objets.find(o => o.id === 'hamac');
    if (Math.abs(ha.angle) > 12) await dire(`tourne à ${ha.angle < 0 ? 'gauche' : 'droite'} ${Math.abs(ha.angle)}`);
    else await dire(`avance ${Math.max(2, Math.min(12, Math.round(ha.m - 2.5)))}`);
  }
}
await page.waitForFunction(() => !document.getElementById('fin').hidden, null, { timeout: 60000 });
await capture('fin');
const trace = await page.evaluate(() => balade.trace());
writeFileSync(join(out, `trace-${v3 ? 'v3-' : ''}${fin}.json`), JSON.stringify(trace));
await browser.close();

const histoire = JSON.parse(readFileSync(join(root, 'histoires/avant-la-nuit.json'), 'utf8'));
const rejeu = rejouer(histoire, trace);
const meme = JSON.stringify(rejeu) === JSON.stringify(trace.final);
const f = trace.final;
console.log(JSON.stringify({ fin: f.trame.fin, minutes: +f.horloge.minutes.toFixed(2), temps: f.trame.passes.map(x => `${x.id}@${x.min}:${x.cause}`),
  jauges: [f.porteur.peur, f.porteur.confiance, f.porteur.agacement], appels: f.horloge.appels, faits: f.faits.length, rejeu_identique: meme, erreurs }));
if (!meme || erreurs.length) process.exit(1);
