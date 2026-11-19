// Cas réel : « fais une petite crotte par terre stp, retourne toi et montre la moi ». Claude (simulé) répond par
// posture, attendre, posture, tourner 180, viser ; l'accessoiriste rend une crotte de la taille d'une noix 6 s plus tard.
// La page doit la cadrer quand elle existe : accroupi, tout près, zoom du téléphone. Captures dans out/petit-objet/.
//
// Usage : node tools/petit-objet.mjs [rayons|v3] [pixels internes pendant les gestes] [pixels de la capture]
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const [,, moteur = 'rayons', px = '7000', pxCapture = '45000'] = process.argv;
const out = join(root, 'out/petit-objet');
mkdirSync(out, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 300, height: 560 }, deviceScaleFactor: 1 });
const erreurs = [];
page.on('pageerror', e => { erreurs.push(e.message); console.log('  [erreur]', e.stack); });
await page.addInitScript(([c]) => {
  window.__CFG = c;
  const noix = { envergure_m: 0.035, nom: 'petite crotte', degage: 0, formes: [
    { f: 'boule', p: [0, 0.008, 0], taille: [0.035, 0.016, 0.03], couleur: '#4a3220', matiere: 'mat' },
    { f: 'boule', p: [0.002, 0.02, 0], taille: [0.024, 0.014, 0.02], couleur: '#523a26', matiere: 'mat' },
    { f: 'boule', p: [0.002, 0.03, 0], taille: [0.012, 0.01, 0.012], couleur: '#4a3220', matiere: 'mat' }] };
  const sampler = { json: c => new Promise(r => {
    if (/accessoiriste/.test(c)) setTimeout(() => r({ objet: noix, suite: null }), 6000);
    else setTimeout(() => r({ sas: { verdict: 'recevable', regle: null, motif: '' }, pensee: 'Voilà. Une toute petite.', attitude: 'suit',
      actions: [{ type: 'posture', hauteur: 0.45 }, { type: 'attendre', secondes: 1 }, { type: 'posture', hauteur: 1 }, { type: 'tourner', degres: 180 }, { type: 'viser', objet: 'fab-1' }],
      fabrique: { nom: 'crotte', quoi: 'petite crotte de la taille d\'une noix', ou: 'pieds' } }), 1500); }) };
  window.claude = { use: () => Promise.resolve(sampler) };
}, [{ maxPx: +px, mobile: moteur !== 'v3', still: true, graine: 7, debug: true, v3: moteur === 'v3' }]);
await page.goto('file://' + join(root, 'dist/index.html'));
await page.waitForFunction(() => window.balade && window.__state && window.__state.n > 2, null, { timeout: 180000 });
await page.evaluate(() => balade.dire('fais une petite crotte par terre stp, retourne toi et montre la moi'));
await page.waitForFunction(() => balade.objets().some(o => o.id === 'fab-1'), null, { timeout: 240000, polling: 500 });
await page.waitForFunction(() => { const c = balade.corps(); return c.file.length === 0 && Math.abs(c.zoom - 1) > 0.5; }, null, { timeout: 400000, polling: 500 }).catch(() => console.log('(pas de zoom)'));
console.log(JSON.stringify((await page.evaluate(() => balade.trace().evenements)).filter(e => !/pensee|suite/.test(e.type)).map(e => e.type + (e.id ? ':' + e.id : ''))));
const c = await page.evaluate(() => balade.corps()), o = await page.evaluate(() => balade.percevoir().objets.find(x => x.id === 'fab-1'));
console.log(moteur, JSON.stringify({ corps: { haut: c.haut, zoom: +c.zoom.toFixed(2), pitch: +c.pitch.toFixed(2) }, objet: o }));
await page.evaluate(p => { balade.resolution(p); for (const e of document.querySelectorAll('button, #hint, #debug-meneur')) e.style.visibility = 'hidden'; }, +pxCapture);
await page.waitForFunction(n => window.__state.n >= n, +(process.env.PASSES || 10), { timeout: 600000 }).catch(() => console.log('(passes incomplètes)'));
await page.screenshot({ path: join(out, moteur + '-zoom.png') });
await page.evaluate(() => { balade.agir([{ type: 'attendre', secondes: 0 }]); });
await browser.close();
console.log(JSON.stringify({ erreurs }));
