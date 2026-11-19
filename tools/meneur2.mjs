// Preuve de la conception du 19/11 (docs/meneur-de-jeu.md §13) : dans la page, sans Claude (secours par mots-clés),
// le joueur demande un feu de camp, le feu apparaît puis dégénère, il le fait éteindre ; puis, dans une nouvelle partie,
// « fais caca sur le chemin » et « regarde-la ». Captures et traces dans out/meneur2/, rejeu des traces dans Node.
//
// Usage : node tools/meneur2.mjs [pixels internes] [feu|caca|tout]
// Sans GPU : compter 6 à 10 minutes (rendu logiciel). La page tourne avec nowalk (Lina ne repart pas d'elle-même)
// pour garder le feu dans le cadre ; tout le reste est le jeu normal, par l'interface.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rejouer } from '../src/meneur.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const [,, px = '45000', quoi = 'tout'] = process.argv;
const out = join(root, 'out/meneur2');
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 270, height: 480 }, deviceScaleFactor: 1 });
const erreurs = [];
page.on('pageerror', e => erreurs.push(e.message));
page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_/.test(m.text())) erreurs.push(m.text()); });
await page.addInitScript(c => { window.__CFG = c; }, { histoire: 'avant-la-nuit', maxPx: +px, debug: true, still: true, graine: 7, nowalk: true });
await page.goto('file://' + join(root, 'dist/index.html'));

const t0 = Date.now(), sec = () => ((Date.now() - t0) / 1000).toFixed(0).padStart(4);
const attendre = ms => page.waitForTimeout(ms);
const partie = () => page.evaluate(() => balade.partie());
const corps = () => page.evaluate(() => balade.corps());
const minutes = async () => (await partie()).horloge.minutes * 60;
const capture = async (nom, pause = 6000) => { await attendre(pause); await page.screenshot({ path: join(out, nom + '.png') });
  console.log(sec(), 'capture', nom, '· jeu', (await minutes()).toFixed(0), 's ·', await page.textContent('#debug-meneur')); };
async function dire(texte) {                                     // comme un joueur : « Lui parler », taper, envoyer
  await page.click('#parler'); await page.fill('#msg', texte); await page.press('#msg', 'Enter');
  await page.waitForFunction(() => document.getElementById('dire').hidden, null, { timeout: 30000 });
  console.log(sec(), 'voix :', texte, '→', await page.textContent('#pensee'));
}
async function jusqua(cond, maxS = 240) { const d = Date.now(); while ((Date.now() - d) / 1000 < maxS) { if (await cond()) return true; await attendre(500); } return false; }
let suivi = 0;
const jeuA = s => jusqua(async () => { const m = await minutes(); if (Date.now() - suivi > 20000) { suivi = Date.now(); console.log(sec(), '… jeu', m.toFixed(0), 's, attendu', s.toFixed(0)); } return m >= s; }, 600);
const libre = () => jusqua(async () => (await corps()).file.length === 0, 120);
const histoire = JSON.parse(readFileSync(join(root, 'histoires/avant-la-nuit.json'), 'utf8'));
function garder(nom) {
  return page.evaluate(() => balade.trace()).then(trace => {
    writeFileSync(join(out, `trace-${nom}.json`), JSON.stringify(trace, null, 1));
    const meme = JSON.stringify(rejouer(histoire, trace)) === JSON.stringify(trace.final);
    const ev = trace.evenements.filter(e => /objet|suite|defaire|sas/.test(e.type)).map(e => `${e.min.toFixed(2)} ${e.type} ${e.id || e.nom || ''}`);
    console.log(`trace ${nom} : rejeu identique = ${meme}\n  ` + ev.join('\n  '));
    return meme;
  });
}
let ok = true;

if (quoi !== 'caca') {
  await jeuA(4); await libre();
  await capture('feu-1-avant');
  await dire('fais un feu de camp, là, devant toi');
  await jusqua(async () => (await page.evaluate(() => balade.objets())).some(o => o.id === 'fab-1'));
  const debut = await minutes();
  await jusqua(async () => (await corps()).haut < 0.6, 20); await capture('feu-2-accroupie', 1500);
  await libre(); await dire('regarde le feu'); await libre(); await capture('feu-3-allume', 3000);
  console.log('objets :', JSON.stringify(await page.evaluate(() => balade.objets().filter(o => /^fab/.test(o.id)))));
  await jeuA(debut + 45); await capture('feu-4-ca-prend-45s');
  await jeuA(debut + 85); await capture('feu-5-fumee-85s');
  console.log('objets :', JSON.stringify(await page.evaluate(() => balade.objets().filter(o => /^fab/.test(o.id)))));
  await dire('éteins-le, vite, jette de la terre dessus');
  const e0 = await minutes();
  await libre(); await jeuA(e0 + 30); await capture('feu-6-eteint-30s');
  ok = await garder('feu') && ok;
}
if (quoi !== 'feu') {
  await page.evaluate(() => balade.jouer('avant-la-nuit'));      // une nouvelle partie : le budget d'objets repart
  await jeuA(4); await libre();
  await dire('avance 6'); await libre();                         // buildShapes ne pose rien à moins de 2 m du départ du trajet
  await dire('fais caca sur le chemin');
  await jusqua(async () => (await corps()).haut < 0.55, 30); await capture('caca-1-accroupie', 2500);
  await libre(); await capture('caca-2-relevee');
  await dire('tourne à droite 120'); await libre(); await capture('caca-3-ailleurs', 3000);
  await dire('regarde-la');
  await libre(); await capture('caca-4-regarde-la');
  console.log('corps :', JSON.stringify(await corps()), 'objets :', JSON.stringify(await page.evaluate(() => balade.objets().filter(o => /^fab/.test(o.id)))));
  ok = await garder('caca') && ok;
}
await browser.close();
console.log(JSON.stringify({ erreurs }));
if (!ok || erreurs.length) process.exit(1);
