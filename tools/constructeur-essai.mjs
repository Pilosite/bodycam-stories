// Joue la chaîne du constructeur de monde de bout en bout dans dist/index.html, avec un faux Claude scripté et une fausse
// base (tests/faux-claude.mjs) : description → plan → fiche → contrôle → repérage (vraies captures du canevas) → relecture
// avec images → banque → rechargement → la scène est toujours là → retouche → suppression ; plus la reprise des mondes de
// l'ancienne version, une erreur de Claude, un arrêt en cours. Captures de l'interface dans out/constructeur/.
//
// Usage : node tools/constructeur-essai.mjs [pixels internes]
import { chromium } from 'playwright';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { installerFauxClaude } from '../tests/faux-claude.mjs';
import { EXEMPLES, geoApprochee, validerFiche } from '../src/constructeur.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const [,, px = '9000'] = process.argv;
const out = join(root, 'out/constructeur'); mkdirSync(out, { recursive: true });
const t0 = Date.now(), sec = () => ((Date.now() - t0) / 1000).toFixed(0).padStart(4);
const ok = (c, m) => { if (!c) { console.error('ÉCHEC :', m); process.exitCode = 1; } else console.log(sec(), 'ok :', m); };

const cim = EXEMPLES[1].fiche;
const SCRIPT = [
  { titre: 'Cimetière', lieu: 'un cimetière de village', depart: 'allée de gravier entre les tombes', repete: [{ quoi: 'tombes' }] },          // plan
  Object.assign({}, cim, { titre: 'Cimetière au crépuscule', objets: [{ id: 'chapelle', nom: 'petite chapelle', devant: 22, cote: 18, formes: [{ f: 'boite', p: [0, 2.5, 0], taille: [5, 5, 7], couleur: '#8b8577', matiere: 'pierre' }, { f: 'toit', p: [0, 5.8, 0], taille: [7.4, 1.8, 5.4], couleur: '#3a3d42', matiere: 'tuile' }] }] }),   // fiche (chapelle hors champ)
  { note: 5, defauts: ['la chapelle est hors champ'], pourquoi: 'rapprocher la chapelle', changements: { objets: { chapelle: { devant: 26, cote: 5 } } } },   // relecture 1
  { note: 8, defauts: [], fini: true, changements: {} },                                                                                   // relecture 2
  { note: 7, pourquoi: 'brume', changements: { ambiance: { brume: 0.045 } } },                                                           // retouche (après rechargement)
  { note: 8, fini: true, changements: {} },                                                                                                // relecture de la retouche
  { erreur: 'rate_limited' },                                                                                                              // une création qui échoue
  { titre: 'jamais lu' },                                                                                                                  // une création arrêtée
];
const cfgPage = { maxPx: +px, still: true, capPasses: 2, capDelai: 240000, capLargeur: 256, nowalk: true };

const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const ctx = await browser.newContext({ viewport: { width: 360, height: 720 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const erreurs = [];
page.on('pageerror', e => erreurs.push(e.message));
page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_/.test(m.text())) erreurs.push(m.text()); });
await page.addInitScript(installerFauxClaude, { script: SCRIPT, images: true, db: true, latence: 300, latences: { 7: 6000 } });
await page.addInitScript(c => { window.__CFG = c; }, cfgPage);
await page.goto('file://' + join(root, 'dist/index.html'));
// un monde gardé par l'ancienne version, à reprendre
await page.evaluate(f => { localStorage.clear(); localStorage.setItem('bodycam-mondes', JSON.stringify([f])); }, validerFiche(EXEMPLES[2].fiche, { id: 'monde-123' }));
await page.reload();
await page.waitForFunction(() => window.__state && window.balade, null, { timeout: 120000 });
await page.waitForTimeout(1500);
const scenes = () => page.evaluate(() => balade.scenes());
ok((await scenes()).some(s => s.source === 'migration'), 'le monde de l\'ancienne version est repris dans la banque');
ok(await page.evaluate(() => !localStorage.getItem('bodycam-mondes')), 'l\'ancienne clé est vidée');

// 1. description → chaîne complète
await page.click('#lieu');
await page.fill('#banque-desc', 'Un cimetière de campagne au crépuscule, une petite chapelle au fond');
await page.click('#banque-creer');
let etapes = new Set(), capPanneau = false;
while (true) {
  const j = await page.evaluate(() => { const j = balade.atelier().job(); return j && { etape: j.etape, etapes: j.etapes || [], texte: j.texte, termine: !!j.termine, erreur: j.erreur, vues: (j.vues || []).length }; });
  if (!j) break;
  for (const e of [...j.etapes, j.etape]) if (!etapes.has(e)) { etapes.add(e); console.log(sec(), 'étape', e, '—', j.texte); }
  if (j.vues && !capPanneau) { capPanneau = true; await page.screenshot({ path: join(out, 'portrait-chantier.png') }); }
  if (j.termine) { ok(!j.erreur, 'chaîne terminée sans erreur : ' + j.texte); break; }
  await page.waitForTimeout(500);
}
for (const k of ['plan', 'fiche', 'controle', 'capture', 'relecture', 'banque']) ok(etapes.has(k), 'étape ' + k + ' montrée');
const appels = await page.evaluate(() => window.__fauxClaude.appels.map(a => ({ i: a.i, modelTier: a.modelTier, images: a.images, longueur: a.longueur, constat: /Le contrôle géométrique/.test(a.consigne), hors: /jamais dans le champ/.test(a.consigne) })));
ok(appels.length === 4, '4 appels à Claude (plan, fiche, deux relectures) : ' + appels.length);
const rel = appels.filter(a => a.images.length);
ok(rel.length === 2 && rel.every(a => a.images.length === 3), 'deux relectures avec trois vues chacune');
for (const a of rel) for (const im of a.images) ok(im.type === 'image/jpeg' && im.octets > 1500 && im.moyenne > 8 && im.ecart > 3, `image envoyée réelle et non noire : ${im.largeur}×${im.hauteur}, ${im.octets} o, moyenne ${im.moyenne}, écart ${im.ecart}`);
ok(appels[2].constat && appels[2].hors, 'la relecture reçoit le constat (« chapelle jamais dans le champ »)');
let db = await page.evaluate(() => JSON.parse(localStorage.getItem('faux-db') || '{}'));
let docs = Object.values(db).filter(d => d.source === 'claude');
ok(docs.length === 1, 'une scène créée dans la base partagée');
const doc = docs[0];
ok(doc && /^data:image\/jpeg;base64,/.test(doc.vignette) && doc.vignette.length < 40000, 'vignette légère : ' + (doc && doc.vignette.length) + ' caractères');
ok(doc && doc.fiche.objets[0].devant === 26 && doc.fiche.objets[0].cote === 5, 'la retouche de la relecture est dans la fiche gardée');
ok(doc && doc.historique.map(h => h.type).join(',') === 'creation,relecture,relecture', 'historique : ' + (doc && doc.historique.map(h => h.type)));
ok(doc && doc.histoire === null && typeof doc.etats === 'object', 'place réservée pour une histoire et des états');
ok(await page.evaluate(id => !(localStorage.getItem('bodycam-banque') || '').includes(id), doc.id), 'rien de la scène dans le stockage local (elle est dans la base)');
const geoPage = await page.evaluate(() => [0, 13, 27, 61].map(z => balade.sol(0, z).trajet));
const geoNode = [0, 13, 27, 61].map(geoApprochee(doc.fiche).pathX);
ok(geoPage.every((v, i) => Math.abs(v - geoNode[i]) < 1e-6), 'geoApprochee suit pathX du moteur');
await page.waitForTimeout(800);
await page.screenshot({ path: join(out, 'portrait-banque.png') });

// 2. rechargement : la scène est toujours là (base partagée), et rechoisie
await page.reload();
await page.waitForFunction(() => window.__state && window.balade, null, { timeout: 120000 });
await page.waitForFunction(id => balade.scenes().some(s => s.id === id), doc.id, { timeout: 90000 }).catch(() => {});
ok((await scenes()).some(s => s.id === doc.id), 'après rechargement, la scène est dans la banque');
if (!(await scenes()).some(s => s.id === doc.id)) console.log('banque :', JSON.stringify(await scenes()), 'base :', await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem('faux-db') || '{}'))), 'mode :', await page.evaluate(() => balade.atelier().banque().mode()));

// 3. retouche en langage libre
await page.click('#lieu');
await page.click(`.carte-tete[data-id="${doc.id}"]`);
await page.click('.carte.ouverte button:has-text("Retoucher")');
await page.fill('.carte-form input', 'plus de brouillard');
await page.click('.carte-form button[type=submit]');
await page.waitForFunction(() => { const j = balade.atelier().job(); return !j || j.termine; }, null, { timeout: 900000, polling: 500 });
db = await page.evaluate(() => JSON.parse(localStorage.getItem('faux-db') || '{}'));
const apres = db['scenes/' + doc.id];
ok(apres && apres.fiche.ambiance.brume === 0.045, 'retouche appliquée : brume ' + (apres && apres.fiche.ambiance.brume));
ok(apres && apres.historique.some(h => h.type === 'retouche' && h.consigne === 'plus de brouillard'), 'retouche dans l\'historique');
const appelRetouche = await page.evaluate(() => window.__fauxClaude.appels[4]);
ok(appelRetouche && /"plus de brouillard"/.test(appelRetouche.consigne) && appelRetouche.modelTier === 'default', 'la retouche part avec la demande citée');
await page.waitForTimeout(500);

// 4. une erreur de Claude : état clair, possibilité de réessayer
await page.fill('#banque-desc', 'un port de pêche');
await page.click('#banque-creer');
await page.waitForFunction(() => { const j = balade.atelier().job(); return j && j.termine; }, null, { timeout: 60000, polling: 300 });
const txt = await page.textContent('#chantier');
ok(/Trop de demandes/.test(txt) && /Réessayer/.test(txt), 'erreur rate_limited : message clair et bouton Réessayer');
await page.screenshot({ path: join(out, 'portrait-erreur.png') });
await page.click('#chantier button:has-text("Fermer")');
// 5. arrêt en cours
await page.fill('#banque-desc', 'une ville');
await page.click('#banque-creer');
await page.waitForSelector('#chantier button:has-text("Arrêter")');
await page.evaluate(() => [...document.querySelectorAll('#chantier button')].find(b => b.textContent === 'Arrêter').click());
await page.waitForFunction(() => { const j = balade.atelier().job(); return !j || j.termine; }, null, { timeout: 30000, polling: 200 });
ok(/Arrêté/.test(await page.textContent('#chantier')), 'arrêt : « Arrêté », rien d\'enregistré');
ok((await scenes()).filter(s => s.source === 'claude').length === 1, 'toujours une seule scène créée');
await page.click('#chantier button:has-text("Fermer")');

// 6. suppression, en deux temps
await page.click(`.carte-tete[data-id="${doc.id}"]`).catch(() => {});
if (!(await page.$('.carte.ouverte button:has-text("Supprimer")'))) await page.click(`.carte-tete[data-id="${doc.id}"]`);
await page.click('.carte.ouverte button:has-text("Supprimer")');
ok(!!(await page.$('.carte.ouverte button:has-text("Confirmer la suppression")')), 'la suppression demande confirmation, sans confirm()');
await page.click('.carte.ouverte button:has-text("Confirmer la suppression")');
await page.waitForTimeout(600);
db = await page.evaluate(() => JSON.parse(localStorage.getItem('faux-db') || '{}'));
ok(!db['scenes/' + doc.id] && !(await scenes()).some(s => s.id === doc.id), 'scène supprimée de la base et de la liste');

// 7. captures de l'interface : ordinateur en paysage
const p2 = await (await browser.newContext({ viewport: { width: 1280, height: 760 }, deviceScaleFactor: 1 })).newPage();
await p2.addInitScript(installerFauxClaude, { script: [], images: true, db: true });
await p2.addInitScript(c => { window.__CFG = c; }, Object.assign({}, cfgPage, { scene: 7 }));
await p2.goto('file://' + join(root, 'dist/index.html'));
await p2.evaluate(d => { localStorage.setItem('faux-db', JSON.stringify(d)); }, Object.assign({}, db, { ['scenes/' + doc.id]: doc }));
await p2.reload();
await p2.waitForFunction(() => window.__state && window.__state.n >= 2, null, { timeout: 300000 });
await p2.click('#lieu');
await p2.waitForTimeout(400);
await p2.click(`.carte-tete[data-id="${doc.id}"]`).catch(() => {});
await p2.waitForTimeout(400);
await p2.screenshot({ path: join(out, 'paysage-banque.png') });
await browser.close();
ok(!erreurs.length, 'aucune erreur dans la page' + (erreurs.length ? ' : ' + erreurs.slice(0, 5).join(' | ') : ''));
console.log(sec(), process.exitCode ? 'ÉCHEC' : 'tout est bon');
