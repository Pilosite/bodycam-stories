// La démonstration jouée dans dist/index.html, moteur v3, en promenade libre, avec un Claude simulé (window.claude remplacé
// avant le chargement : mêmes réponses que le faux Claude de tests/demo.test.mjs, 1,5 s de délai) :
//   « fais une crotte », « avance de 3 mètres », « fais une crotte de 5 kg »,
//   « va chercher des bâtons et des cailloux et fais-en un bonhomme de neige ».
// Puis une marche forcée droit sur un bloc de grès (§16) : avant, pendant, après.
// Captures (format téléphone 390 × 780, et une vue PC 960 × 540), journal et vérifications dans out/demo/.
//
// Usage : node tools/demo.mjs [pixels internes pendant les gestes] [pixels des captures] [docile]
//   docile : le Claude simulé « oublie » gestes et objets ; le mode DOCILE de la page complète.
// Variables : PASSES (images accumulées par capture, 10), SANS_OBSTACLE=1, SANS_PC=1.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const [,, px = '9000', pxCapture = '120000', mode = ''] = process.argv;
const PASSES = +(process.env.PASSES || 10);
const GESTES = 40000, GRAINS = 300000;                            // budget de grains v3 : petit pendant les gestes (rendu logiciel lent), celui du téléphone pour les captures
const out = join(root, 'out/demo');
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 1 });
const erreurs = [];
page.on('pageerror', e => { erreurs.push(e.message); console.log('  [erreur]', e.stack); });
page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_/.test(m.text())) erreurs.push(m.text()); if (m.type() === 'warning' && !/GPU stall|GL Driver/.test(m.text())) console.log('  [page]', m.text()); });
await page.addInitScript(([c, oublie]) => {
  window.__CFG = c;
  try { localStorage.setItem('bodycam-docile', oublie ? '1' : '0'); } catch (_) {}
  const voixDe = t => { const m = /La voix dit : (".*")\s*$/m.exec(t); return m ? JSON.parse(m[1]) : null; };
  const sas = { verdict: 'recevable', regle: null, motif: 'geste ordinaire' };
  function repondre(c) {
    if (/accessoiriste/.test(c)) {                                   // l'accessoiriste écrit mal (trop grand, trois boules) : la bibliothèque sert de base sûre
      if (/LA CHOSE, telle qu'elle est/.test(c)) return { retouche: { nom: 'bonhomme', ajoute: [{ f: 'boule', p: [0, 2, 0], taille: [3, 3, 3], couleur: '#ffffff', matiere: 'mat' }] }, suite: null };
      return { objet: { envergure_m: 0.2, nom: 'crotte', formes: [{ f: 'boule', p: [0, 0.4, 0], taille: [1.2, 0.8, 1], couleur: '#4a3220', matiere: 'mat' }] }, suite: null };
    }
    const v = voixDe(c) || '', ids = [...c.matchAll(/\((fab-\d+)\)/g)].map(m => m[1]);
    if (oublie) return { sas, pensee: 'Ha. Si tu veux.', attitude: 'suit', actions: [] };
    if (/avance/.test(v)) return { sas, pensee: 'Un peu plus loin, alors.', attitude: 'suit', actions: [{ type: 'marcher', metres: 3 }] };
    if (/5 kg/.test(v)) return { sas, pensee: 'Cinq kilos. Rien que ça. Bon…', attitude: 'suit', actions: [{ type: 'posture', hauteur: 0.45 }, { type: 'attendre', secondes: 3 }, { type: 'posture', hauteur: 1 }], fabrique: { nom: 'crotte de 5 kg', quoi: 'une énorme crotte de 5 kg', ou: 'dessous' } };
    if (/crotte/.test(v)) return { sas, pensee: 'Sérieux ? … Bon. Personne regarde.', attitude: 'suit', actions: [{ type: 'posture', hauteur: 0.45 }, { type: 'attendre', secondes: 3 }, { type: 'posture', hauteur: 1 }], fabrique: { nom: 'crotte', quoi: 'une crotte', ou: 'dessous' } };
    if (/bonhomme/.test(v)) return { sas, pensee: 'Un bonhomme de neige. Avec ça. D\'accord, artiste.', attitude: 'suit',
      actions: [{ type: 'chercher', quoi: 'des bâtons et des cailloux' }], modifie: { objet: ids[ids.length - 1], quoi: 'en faire un bonhomme de neige avec les bâtons et les cailloux' } };
    return { sas, pensee: 'Hm.', attitude: 'suit', actions: [] };
  }
  const sampler = { json: c => new Promise(r => setTimeout(() => r(repondre(c)), 1500)) };
  window.claude = { use: () => Promise.resolve(sampler) };
}, [{ maxPx: +px, mobile: true, still: true, graine: 7, debug: true, v3: true, grains: GESTES, dtMax: 0.4 }, mode === 'docile']);
await page.goto('file://' + join(root, 'dist/index.html'), { timeout: 240000 });
await page.waitForFunction(() => window.balade && window.__state && window.__state.n > 2, null, { timeout: 240000 });

const t0 = Date.now(), sec = () => ((Date.now() - t0) / 1000).toFixed(0).padStart(5);
const attendre = ms => page.waitForTimeout(ms);
const corps = () => page.evaluate(() => balade.corps());
const verifs = [];
const verifier = (ok, quoi) => { verifs.push({ ok: !!ok, quoi }); console.log(sec(), ok ? 'OK   ' : 'ÉCHEC', quoi); };
const captures = [];
async function dire(texte) { await page.evaluate(t => { balade.dire(t); }, texte); console.log(sec(), 'voix :', texte); }
const quand = (fn, arg, max = 400000) => page.waitForFunction(fn, arg, { timeout: max, polling: 250 }).then(() => true, () => { console.log(sec(), '(délai dépassé)'); return false; });
async function auRepos(max = 400000) {                              // file vide, plus d'appel ni d'accessoiriste en cours
  await quand(() => balade.corps().file.length === 0 && !/atelier|appel/.test(document.getElementById('debug-meneur').textContent || ''), null, max);
  await attendre(1500);
}
async function capture(nom, quoi) {                                  // le corps s'arrête net, l'image s'affine, sans les boutons
  await page.evaluate(([p, g]) => { balade.pause(true); balade.grains(g); balade.resolution(p); for (const e of document.querySelectorAll('button, #hint, #debug-meneur')) e.style.visibility = 'hidden'; }, [+pxCapture, GRAINS]);
  await page.waitForFunction(n => window.__state.n >= n, PASSES, { timeout: 400000 }).catch(() => console.log(sec(), '(passes incomplètes)'));
  const f = join(out, nom + '.png'); await page.screenshot({ path: f, timeout: 300000 });
  const pensee = await page.textContent('#pensee'); captures.push({ f, quoi, pensee }); console.log(sec(), 'capture', nom, '·', quoi, '·', pensee);
  await page.evaluate(([p, g]) => { balade.grains(g); balade.resolution(p); for (const e of document.querySelectorAll('button, #hint, #debug-meneur')) e.style.visibility = ''; balade.pause(false); }, [+px, GESTES]);
}
const objet = id => page.evaluate(i => (balade.percevoir().objets || []).find(o => o.id === i), id);

// 1. une crotte, de taille normale, cadrée de près
await attendre(1500);
await dire('fais une crotte');
await quand(() => balade.objets().some(o => o.id === 'fab-1'));
await auRepos();
const o1 = await objet('fab-1');
verifier(o1 && o1.taille >= 0.12 && o1.taille <= 0.18, `crotte normale : ${o1 && o1.taille} m`);
verifier(o1 && Math.abs(o1.angle) < 10 && o1.m < 1, `cadrée de près : ${o1 && o1.m} m, ${o1 && o1.angle}°, zoom ${(await corps()).zoom.toFixed(1)}`);
await capture('1-crotte', 'crotte normale, cadrée de près');

// 2. un peu plus loin, une crotte de 5 kg
await dire('avance de 3 mètres');
await auRepos();
await dire('fais une crotte de 5 kg');
await quand(() => balade.objets().some(o => o.id === 'fab-2'));
await auRepos();
const o2 = await objet('fab-2');
verifier(o2 && o2.taille >= 0.3 && o2.taille <= 0.35, `crotte de 5 kg : ${o2 && o2.taille} m`);
await capture('2-crotte-5kg', 'crotte de 5 kg, cadrée');

// 3. aller chercher des bâtons et des cailloux, revenir, façonner, cadrer
await dire('va chercher des bâtons et des cailloux et fais-en un bonhomme de neige');
await quand(() => balade.corps().file.includes('marcher') && balade.lieuCherche());
await attendre(2500);
const lieu = await page.evaluate(() => balade.lieuCherche());
console.log(sec(), 'il va chercher', JSON.stringify(lieu));
await capture('3-depart', 'il part chercher (' + (lieu && lieu.ou) + ')');
await quand(() => { const c = balade.corps(), l = balade.lieuCherche(); return l && Math.hypot(c.x - l.x, c.z - l.z) < 0.4 && c.haut < 0.6 && c.pitch < -0.5; });
const c4 = await corps(), o4 = await objet('fab-2');
verifier(o4 && o4.m > 2.5, `il s'est éloigné de la crotte pour chercher : ${o4 && o4.m} m`);
await capture('4-ramassage', 'il ramasse, accroupi');
await quand(() => balade.faconnage().file.some(f => f.i >= 0));
const ram = await page.evaluate(() => balade.objets().find(o => /ramass/.test(o.nom || '')));
verifier(ram, 'ce qu\'il a rapporté est posé près de la crotte : ' + (ram && ram.nom));
await capture('5-retour', 'retour : il pose ce qu\'il a ramassé, accroupi devant elle');
await quand(() => balade.faconnage().file.some(f => f.i >= 2));
await capture('6-faconnage-a', 'façonnage, un état intermédiaire');
await quand(() => balade.faconnage().file.some(f => f.i >= 4) || balade.faconnage().file.length === 0);
await capture('7-faconnage-b', 'façonnage, un état plus loin');
await auRepos();
const b = await page.evaluate(() => balade.objets().find(o => o.id === 'fab-2')), ob = await objet('fab-2');
verifier(b && /bonhomme/.test(b.nom) && b.formes === 8, `bonhomme : ${b && b.nom}, ${b && b.formes} formes`);
verifier(!(await page.evaluate(() => balade.objets().some(o => /ramass/.test(o.nom || '')))), 'ce qu\'il a ramassé a servi (retiré)');
verifier(ob && Math.abs(ob.angle) < 10, `bonhomme cadré : ${ob && ob.m} m, ${ob && ob.angle}°`);
await capture('8-bonhomme', 'le bonhomme fini, cadré de près');

const ev = (await page.evaluate(() => balade.trace().evenements)).filter(e => /modele|faconnage|objet_|cadrage|docile|consomme/.test(e.type));
console.log(sec(), 'événements', JSON.stringify(ev.map(e => e.type + (e.id ? ':' + e.id : '') + (e.raison ? ' (' + e.raison + ')' : ''))));
writeFileSync(join(out, 'trace.json'), JSON.stringify(await page.evaluate(() => balade.trace())));

// 4. la vue PC
if (!process.env.SANS_PC) {
  await page.setViewportSize({ width: 960, height: 540 }); await attendre(1500);
  await capture('9-pc-bonhomme', 'vue PC 960 × 540 : le bonhomme');
  await page.setViewportSize({ width: 390, height: 780 }); await attendre(1500);
}

// 5. marche forcée droit sur un bloc de grès (§16)
if (!process.env.SANS_OBSTACLE) {
  const c = await corps();
  const roc = (await page.evaluate(() => balade.obstacles())).filter(o => /^rocher/.test(o.id)).map(o => Object.assign(o, { m: Math.hypot(o.x - c.x, o.z - c.z) })).sort((a, b) => a.m - b.m)[0];
  console.log(sec(), 'bloc de grès', JSON.stringify(roc));
  // il se place à 5 m du bloc, face à lui, puis on le fait marcher tout droit, 3 m au-delà du centre du bloc
  const dx = c.x - roc.x, dz = c.z - roc.z, l = Math.hypot(dx, dz), d0 = roc.r + 5;
  const sx = roc.x + dx / l * d0, sz = roc.z + dz / l * d0;
  await page.evaluate(([x, z]) => { const c = balade.corps(); const a = Math.atan2(x - c.x, z - c.z) - c.yaw; balade.agir([{ type: 'posture', hauteur: 1 }, { type: 'tourner', degres: Math.atan2(Math.sin(a), Math.cos(a)) * 180 / Math.PI }]); }, [sx, sz]);
  await auRepos();
  const c1 = await corps(), m1 = Math.hypot(sx - c1.x, sz - c1.z);
  await page.evaluate(m => balade.agir([{ type: 'marcher', metres: Math.min(30, m) }]), m1); await auRepos();
  await page.evaluate(([x, z]) => { const c = balade.corps(); const a = Math.atan2(x - c.x, z - c.z) - c.yaw; balade.agir([{ type: 'tourner', degres: Math.atan2(Math.sin(a), Math.cos(a)) * 180 / Math.PI }, { type: 'regarder', degres: -8 }]); }, [roc.x, roc.z]);
  await auRepos();
  await capture('10-obstacle-avant', 'face au bloc de grès, à 5 m');
  const dist = Math.hypot(roc.x - (await corps()).x, roc.z - (await corps()).z);
  await page.evaluate(m => balade.agir([{ type: 'marcher', metres: m }]), dist + 3);
  let mini = 99;
  const suivre = setInterval(async () => { try { const k = await corps(); mini = Math.min(mini, Math.hypot(k.x - roc.x, k.z - roc.z) - roc.r); } catch (_) {} }, 200);
  await quand(r => { const k = balade.corps(); return Math.hypot(k.x - r.x, k.z - r.z) - r.r < 1.4; }, roc);
  await capture('11-obstacle-pendant', 'en marche droit sur le bloc');
  await auRepos();
  clearInterval(suivre);
  const k = await corps(), fin = Math.hypot(k.x - roc.x, k.z - roc.z) - roc.r;
  const sonde = await page.evaluate(() => { const c = balade.corps(); return balade.sonde(c.x, balade.sol(c.x, c.z).hauteur + 1.36 * c.haut, c.z); });
  verifier(mini >= 0.3 && fin >= 0.3, `jamais dans le bloc : au plus près ${mini.toFixed(2)} m de son bord (cercle JS), arrêt à ${fin.toFixed(2)} m ; sonde du moteur à la caméra : ${sonde.toFixed(2)} m`);
  verifier(sonde > 0.2, 'la caméra reste hors de toute surface (sonde v3)');
  await capture('12-obstacle-apres', 'arrêté devant le bloc : « ' + (await page.textContent('#pensee')) + ' »');
}

await page.click('#journal').catch(() => {});
writeFileSync(join(out, 'journal.txt'), await page.textContent('#mesure-txt').catch(() => ''));
writeFileSync(join(out, 'captures.json'), JSON.stringify(captures, null, 1));
await browser.close();
console.log(JSON.stringify({ echecs: verifs.filter(v => !v.ok).map(v => v.quoi), ok: verifs.filter(v => v.ok).length, total: verifs.length, erreurs }));
if (verifs.some(v => !v.ok) || erreurs.length) process.exit(1);
