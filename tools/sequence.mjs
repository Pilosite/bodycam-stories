// La séquence de référence de Toine, jouée dans dist/index.html en promenade libre, avec un Claude simulé (window.claude
// remplacé avant le chargement : mêmes réponses que le faux Claude de tests/sequence.test.mjs, 1,5 s de délai).
// « fais une crotte sur le chemin », « éloigne-toi de 2 pas et montre-la-moi », « mets 2 bâtons pour les bras et 2 cailloux
// pour les yeux sur cette crotte », puis « grimpe à l'arbre », « descends », « avance », « arrête-toi ».
// Captures, journal et vérifications dans out/sequence/.
//
// Usage : node tools/sequence.mjs [pixels internes] [debug]     (7000 par défaut : rapide en rendu logiciel)
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const [,, px = '7000', mode = ''] = process.argv;
const out = join(root, 'out/sequence');
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 300, height: 560 }, deviceScaleFactor: 1 });
const erreurs = [];
page.on('pageerror', e => { erreurs.push(e.message); console.log('  [erreur]', e.stack); });
page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_/.test(m.text())) erreurs.push(m.text()); if (m.type() === 'warning') console.log('  [page]', m.text()); });
await page.addInitScript(([c, debug]) => {
  window.__CFG = c;
  if (debug) try { localStorage.setItem('bodycam-docile', '1'); } catch (_) {}
  const voixDe = t => { const m = /La voix dit : (".*")\s*$/m.exec(t); return m ? JSON.parse(m[1]) : null; };
  const sas = { verdict: 'recevable', regle: null, motif: 'geste ordinaire' };
  window.__appels = [];
  function repondre(c) {
    if (/accessoiriste/.test(c)) {
      if (/LA CHOSE, telle qu'elle est/.test(c)) {
        const formes = JSON.parse(/envergure [\d.]+ m[^)\n]*\) : (\[.*\])\n/.exec(c)[1]), haut = Math.max(...formes.map(f => f.p[1] + f.taille[1] / 2));
        const w = Math.max(...formes.map(f => Math.abs(f.p[0]) + f.taille[0] / 2));
        return { retouche: { nom: 'crotte avec des bras et des yeux', ajoute: [
          { f: 'cylindre', p: [-w - 0.03, haut * 0.55, 0], taille: [0.012, 0.12, 0.012], penche: [0, 55], couleur: '#5a4632', matiere: 'bois' },
          { f: 'cylindre', p: [w + 0.03, haut * 0.55, 0], taille: [0.012, 0.12, 0.012], penche: [0, -55], couleur: '#5a4632', matiere: 'bois' },
          { f: 'boule', p: [-0.02, haut * 0.82, 0.05], taille: [0.022, 0.022, 0.018], couleur: '#9a968c', matiere: 'pierre' },
          { f: 'boule', p: [0.02, haut * 0.82, 0.05], taille: [0.022, 0.022, 0.018], couleur: '#9a968c', matiere: 'pierre' }] }, suite: null };
      }
      return { objet: { envergure_m: 0.2, nom: 'crotte', degage: 0, formes: [            // cohérente mais 8 fois trop grande : la page la ramène
        { f: 'boule', p: [0, 0.28, 0], taille: [1.1, 0.56, 0.9], couleur: '#4a3220', matiere: 'mat' },
        { f: 'boule', p: [0.1, 0.64, 0], taille: [0.7, 0.45, 0.6], couleur: '#523a26', matiere: 'mat' },
        { f: 'boule', p: [0.08, 0.92, 0], taille: [0.4, 0.32, 0.4], couleur: '#4a3220', matiere: 'mat' }] }, suite: null };
    }
    const v = voixDe(c) || '', ids = [...c.matchAll(/\((fab-\d+)\)/g)].map(m => m[1]);
    if (/crotte sur le chemin/.test(v)) return { sas, pensee: 'Sérieux ? Bon. Personne regarde.', attitude: 'suit',
      actions: [{ type: 'posture', hauteur: 0.45 }, { type: 'attendre', secondes: 4 }, { type: 'posture', hauteur: 1 }], fabrique: { nom: 'crotte', quoi: 'une crotte de 3 kg, sur le chemin', ou: 'pieds' } };
    if (/éloigne-toi/.test(v)) return { sas, pensee: 'Voilà. Admire.', attitude: 'suit', actions: [{ type: 'marcher', metres: -1.4 }, { type: 'viser', objet: ids[0] }] };
    // comme l'échec d'aujourd'hui : Claude refait une chose nouvelle au lieu de modifier la crotte ; la page corrige
    if (/bâtons/.test(v)) return { sas, pensee: 'Des bras, des yeux. Mon chef-d\'œuvre.', attitude: 'suit', actions: [{ type: 'posture', hauteur: 0.5 }], fabrique: { nom: 'crotte avec des bras', quoi: 'bâtons et cailloux', ou: 'pieds' } };
    if (/grimpe/.test(v)) return { sas, pensee: 'Allez, hop. Je vais voir d\'en haut.', attitude: 'suit', actions: [{ type: 'monter', sur: 'arbre' }] };
    if (/descends/.test(v)) return { sas, pensee: 'Je redescends.', attitude: 'suit', actions: [{ type: 'descendre' }] };
    if (/avance/.test(v)) return { sas, pensee: 'J\'avance.', attitude: 'suit', actions: [{ type: 'marcher', metres: 12 }] };
    if (/arrête/.test(v)) return { sas, pensee: 'Je bouge plus.', attitude: 'suit', actions: [{ type: 'marcher', metres: 3 }] };   // une réponse qui désobéit
    return { sas, pensee: 'Hm.', attitude: 'suit', actions: [] };
  }
  const sampler = { json: (c, opt) => { window.__appels.push({ tier: opt && opt.modelTier, n: c.length }); return new Promise(r => setTimeout(() => r(repondre(c)), 1500)); } };
  window.claude = { use: () => Promise.resolve(sampler) };
}, [{ maxPx: +px, mobile: true, still: true, graine: 7, debug: true }, mode === 'debug']);
await page.goto('file://' + join(root, 'dist/index.html'));
await page.waitForFunction(() => window.balade && window.__state && window.__state.n > 2, null, { timeout: 120000 });

const t0 = Date.now(), sec = () => ((Date.now() - t0) / 1000).toFixed(0).padStart(4);
const attendre = ms => page.waitForTimeout(ms);
const corps = () => page.evaluate(() => balade.corps());
const objets = () => page.evaluate(() => balade.objets());
const verifs = [];
const verifier = (ok, quoi) => { verifs.push({ ok: !!ok, quoi }); console.log(sec(), ok ? 'OK  ' : 'ÉCHEC', quoi); };
async function dire(texte, attendreReponse = true) {           // comme un joueur ; puis on attend la pensée de la réponse
  await page.evaluate(t => { balade.dire(t); }, texte); console.log(sec(), 'voix :', texte);
  if (attendreReponse) await page.waitForFunction(() => { const t = document.getElementById('pensee').textContent; return t && t !== '…'; }, null, { timeout: 30000, polling: 200 }).catch(() => console.log(sec(), '(pas de pensée)'));
}
async function auRepos(max = 90000) {                             // file vide, accessoiriste fini, quelques passes accumulées
  await page.waitForFunction(() => balade.corps().file.length === 0 && !/atelier|appel/.test(document.getElementById('debug-meneur').textContent || ''), null, { timeout: max, polling: 500 }).catch(() => console.log(sec(), '(délai dépassé)'));
  await attendre(2500);
}
async function capture(nom) {                                     // à l'arrêt : plus fine, sans les boutons, puis on revient à la résolution d'essai
  await page.evaluate(p => { balade.resolution(p); for (const e of document.querySelectorAll('button, #hint, #debug-meneur')) e.style.visibility = 'hidden'; }, +(process.env.CAPTURE_PX || 45000));
  await page.waitForFunction(n => window.__state.n >= n, 10, { timeout: 180000 }).catch(() => {});
  await page.screenshot({ path: join(out, nom + '.png') }); console.log(sec(), 'capture', nom, '·', await page.textContent('#pensee'));
  await page.evaluate(p => { balade.resolution(p); for (const e of document.querySelectorAll('button, #hint, #debug-meneur')) e.style.visibility = ''; }, +px);
}
const fab = async () => (await objets()).find(o => o.id === 'fab-1');
const distA = async o => { const c = await corps(); const q = await page.evaluate(id => { const o = (balade.percevoir().objets || []).find(x => x.id === id); return o; }, o); return q; };

await attendre(1500);
await dire('fais une crotte sur le chemin', false);
await attendre(800);
verifier((await corps()).haut < 0.95 || (await corps()).file.includes('posture'), 'geste immédiat : il se baisse avant la réponse');
await page.waitForFunction(() => { const t = document.getElementById('pensee').textContent; return t && t !== '…'; }, null, { timeout: 30000, polling: 200 });
await auRepos();
const f1 = await fab();
verifier(f1, 'la crotte existe (fab-1)');
const p1 = await distA('fab-1');
verifier(p1 && p1.taille >= 0.1 && p1.taille <= 0.4, 'taille réaliste : ' + (p1 && p1.taille) + ' m');
await capture('1-crotte');

await dire('éloigne-toi de 2 pas et montre-la-moi');
await auRepos();
const p2 = await distA('fab-1');
verifier(p2 && p2.m > 1.6, 'il a reculé : ' + (p2 && p2.m) + ' m');
verifier(p2 && Math.abs(p2.angle) < 10, 'il la regarde : ' + (p2 && p2.angle) + '°');
await capture('2-recule-montre');

await dire('mets 2 bâtons pour les bras et 2 cailloux pour les yeux sur cette crotte');
await attendre(2500);
await auRepos();
const f3 = await fab(), tous = await objets();
verifier(f3 && f3.formes > f1.formes, `même objet modifié : ${f1.formes} → ${f3 && f3.formes} formes`);
verifier(f3 && Math.abs(f3.devant - f1.devant) < 1e-6 && Math.abs(f3.cote - f1.cote) < 1e-6, 'à la même place');
verifier(!tous.some(o => o.id === 'fab-2'), 'pas de second objet');
const p3 = await distA('fab-1'), c3 = await corps();
verifier(p3 && p3.m < 1.2 && Math.abs(p3.angle) < 10, `cadrée de près : ${p3 && p3.m} m, ${p3 && p3.angle}°, accroupi ${c3.haut}`);
await capture('3-modifiee-cadree');

const sup = await page.evaluate(() => balade.supports().map(s => Object.assign({}, s, { sonde: balade.sonde(s.x, balade.sol(s.x, s.z).hauteur + (s.id === 'rocher' ? .3 : .75), s.z) })));
console.log(sec(), 'supports', JSON.stringify(sup));
for (const s of sup) verifier(s.sonde < 0.15, `copie JS de ${s.id} : la sonde du moteur trouve bien la matière à l'endroit dit (${s.sonde.toFixed(2)})`);
await dire('grimpe à l\'arbre');
await auRepos();
const c4 = await corps();
verifier(c4.elev > 1, 'perché : ' + c4.elev.toFixed(2) + ' m sur ' + c4.perche);
await capture('4-perche');
await dire('descends');
await auRepos();
verifier((await corps()).elev === 0, 'redescendu');

await dire('avance de 12 mètres');
await attendre(4000);
const avant = await corps();
await dire('arrête-toi', false);
await attendre(150);
const juste = await corps();
verifier(juste.file.length === 0 && juste.immobile, 'stop : file vidée tout de suite (avant la réponse)');
await attendre(9000);
const apres = await corps();
verifier(Math.hypot(apres.x - juste.x, apres.z - juste.z) < 0.3, 'il ne bouge plus : ' + Math.hypot(apres.x - juste.x, apres.z - juste.z).toFixed(2) + ' m depuis le stop (avant : en marche, ' + avant.file.join(',') + ')');
await capture('5-stop');

await page.click('#journal').catch(() => {});
const journal = await page.textContent('#mesure-txt');
writeFileSync(join(out, 'journal.txt'), journal);
writeFileSync(join(out, 'trace.json'), JSON.stringify(await page.evaluate(() => balade.trace())));
const appels = await page.evaluate(() => window.__appels);
console.log(sec(), 'appels', JSON.stringify(appels));
await browser.close();
console.log(JSON.stringify({ verifs: verifs.filter(v => !v.ok).map(v => v.quoi), ok: verifs.filter(v => v.ok).length, total: verifs.length, erreurs }));
if (verifs.some(v => !v.ok) || erreurs.length) process.exit(1);
