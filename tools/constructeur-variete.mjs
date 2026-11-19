// Cinq demandes variées (tests/scenes-variees.mjs) passées par la chaîne dans la page, avec un échantillonneur simulé qui rend
// le plan et la fiche écrits à la main, puis une relecture « fini » ; la page capture vraiment ses vues. Ensuite : chaque
// scène jouée et capturée, et l'interface en téléphone tactile (390 × 780) et en ordinateur (1280 × 800).
// Avec --lexique : les mêmes demandes sans Claude (composition par mots-clés), pour voir le secours.
//
// Usage : node tools/constructeur-variete.mjs [--lexique] [pixels internes]
// Sorties : out/variete/ (scène-<nom>.png, portrait-*.png, ordinateur-*.png, journal.json)
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { installerFauxClaude } from '../tests/faux-claude.mjs';
import { VARIEES } from '../tests/scenes-variees.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2), lexique = args.includes('--lexique'), px = +(args.find(a => /^\d+$/.test(a)) || 50000);
const out = join(root, 'out/variete' + (lexique ? '-lexique' : '')); mkdirSync(out, { recursive: true });
const t0 = Date.now(), sec = () => ((Date.now() - t0) / 1000).toFixed(0).padStart(4);
const ok = (c, m) => { if (!c) { console.error('ÉCHEC :', m); process.exitCode = 1; } else console.log(sec(), 'ok :', m); };
const SCRIPT = lexique ? [] : VARIEES.flatMap(v => [v.plan, v.fiche, { note: 8, defauts: [], fini: true, pourquoi: 'se lit', changements: {} }]);
const cfg = { maxPx: px, still: true, nowalk: true, capPasses: 2, capDelai: 240000, capLargeur: 256 };

const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const ouvrirPage = async (ctxOpts, init = true) => {
  const ctx = await browser.newContext(ctxOpts), page = await ctx.newPage(), erreurs = [];
  page.on('pageerror', e => erreurs.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_|fonts/.test(m.text())) erreurs.push(m.text()); });
  if (!lexique) await page.addInitScript(installerFauxClaude, { script: SCRIPT, images: true, db: true, latence: 400 });
  await page.addInitScript(c => { window.__CFG = c; }, cfg);
  await page.goto('file://' + join(root, 'dist/index.html'));
  if (init) { await page.evaluate(() => localStorage.clear()); await page.reload(); }
  await page.waitForFunction(() => window.__state && window.balade, null, { timeout: 180000 });
  return { ctx, page, erreurs };
};
const passes = (page, n) => page.waitForFunction(k => window.__state && window.__state.n >= k, n, { timeout: 600000, polling: 500 });

// 1. téléphone tactile : les cinq créations, l'une après l'autre, depuis le champ de la banque
const tel = { viewport: { width: 390, height: 780 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true };
const { ctx, page, erreurs } = await ouvrirPage(tel);
await passes(page, 3);
await page.screenshot({ path: join(out, 'portrait-jeu.png') });
await page.tap('#plus'); await page.waitForTimeout(300);
await page.screenshot({ path: join(out, 'portrait-plus.png') });
const largeurs = await page.evaluate(() => { const r = document.getElementById('commandes').getBoundingClientRect(), o = document.getElementById('outils').getBoundingClientRect(); return { rangee: [r.left, r.right], outils: [o.left, o.right], ecran: innerWidth }; });
ok(largeurs.rangee[0] >= 0 && largeurs.rangee[1] <= largeurs.ecran && largeurs.outils[1] <= largeurs.ecran, 'la rangée du bas et le menu « Plus » tiennent dans 390 px ' + JSON.stringify(largeurs));
await page.tap('#monde'); await page.waitForTimeout(400);
ok(await page.evaluate(() => !document.getElementById('banque').hidden && document.activeElement && document.activeElement.id === 'banque-desc'), '« Décrire un monde » ouvre la banque sur le champ de description');
const journal = [];
for (const [i, v] of VARIEES.entries()) {
  await page.fill('#banque-desc', v.demande);
  await page.tap('#banque-creer');
  const vus = new Set(); let capture = false;
  while (true) {
    const j = await page.evaluate(() => { const j = balade.atelier().job(); return j && { etape: j.etape, etapes: j.etapes || [], texte: j.texte, termine: !!j.termine, erreur: j.erreur, vues: (j.vues || []).length, doc: j.doc && { id: j.doc.id, titre: j.doc.titre, vignette: (j.doc.vignette || '').length } }; });
    if (!j) break;
    for (const e of j.etapes) vus.add(e);
    if (!vus.has(j.etape)) { vus.add(j.etape); console.log(sec(), v.nom, 'étape', j.etape, '—', j.texte.slice(0, 100)); }
    if (i === 0 && !capture && (j.etape === 'relecture' || j.vues)) { capture = true; await page.screenshot({ path: join(out, 'portrait-chantier.png') }); }
    if (j.termine) { journal.push({ nom: v.nom, etapes: [...vus], texte: j.texte, erreur: j.erreur, doc: j.doc }); break; }
    await page.waitForTimeout(700);
  }
  const fin = journal[journal.length - 1];
  ok(fin && !fin.erreur && fin.doc, v.nom + ' : scène créée et enregistrée — ' + (fin && fin.texte));
  if (!lexique) ok(fin && ['plan', 'fiche', 'controle', 'capture', 'relecture', 'banque'].every(e => fin.etapes.includes(e)), v.nom + ' : toutes les étapes affichées (' + (fin && fin.etapes.join(' → ')) + ')');
  ok(fin && fin.doc && fin.doc.vignette > 500, v.nom + ' : vignette prise (' + (fin && fin.doc && fin.doc.vignette) + ' octets en base64)');
}
await page.evaluate(() => balade.atelier().ouvrir()); await page.waitForTimeout(500);
await page.screenshot({ path: join(out, 'portrait-banque.png') });
await page.evaluate(() => { document.getElementById('banque').scrollTop = 1e6; }); await page.waitForTimeout(300);
await page.screenshot({ path: join(out, 'portrait-banque-bas.png') });
const scenes = await page.evaluate(() => balade.scenes().map(s => ({ id: s.id, titre: s.titre, source: s.source })));
const cartes = await page.evaluate(() => [...document.querySelectorAll('.carte-tete')].map(b => b.dataset.id));
ok(scenes.length === VARIEES.length && cartes.filter(id => id.startsWith('embarquee-')).length === 8, 'la banque liste les cinq créations et les huit scènes du jeu (' + cartes.length + ' cartes)');

// 2. chaque scène jouée, l'image posée
for (const d of scenes) {
  await page.evaluate(id => balade.atelier().choisir(id), d.id);
  await page.evaluate(() => balade.atelier().fermer());
  await page.waitForTimeout(1500); await passes(page, 6);
  const nom = (VARIEES.find(v => d.titre.startsWith(v.fiche.titre.slice(0, 10))) || { nom: d.id }).nom;
  await page.screenshot({ path: join(out, 'scene-' + nom + '.png') });
  console.log(sec(), 'scène', nom, 'capturée');
}
// 3. renommer, supprimer (au doigt)
await page.evaluate(() => balade.atelier().ouvrir()); await page.waitForTimeout(300);
const premier = scenes.find(s => s.titre.startsWith("Ruelle")) || scenes[0];
await page.tap(`.carte-tete[data-id="${premier.id}"]`); await page.waitForTimeout(300);
await page.screenshot({ path: join(out, 'portrait-carte.png') });
await page.getByRole('button', { name: 'Renommer' }).tap(); await page.fill('.carte-form input', 'Ruelle de Gênes'); await page.getByRole('button', { name: 'Renommer' }).last().tap();
await page.waitForFunction(id => balade.scenes().find(s => s.id === id)?.titre === 'Ruelle de Gênes', premier.id, { timeout: 10000 }).then(() => ok(true, 'renommée'), () => ok(false, 'renommée'));
const dernier = scenes.find(s => s.id !== premier.id && /Entrep/.test(s.titre)) || scenes.find(s => s.id !== premier.id);
await page.tap(`.carte-tete[data-id="${dernier.id}"]`); await page.waitForTimeout(300);
await page.getByRole('button', { name: 'Supprimer' }).tap(); await page.getByRole('button', { name: 'Confirmer la suppression' }).tap();
await page.waitForFunction(id => !balade.scenes().some(s => s.id === id), dernier.id, { timeout: 10000 }).then(() => ok(true, 'supprimée'), () => ok(false, 'supprimée'));
ok(!erreurs.length, 'pas d\'erreur dans la page (téléphone) ' + erreurs.slice(0, 3).join(' | '));
const etatDb = await page.evaluate(() => localStorage.getItem('faux-db') || localStorage.getItem('bodycam-banque'));
await ctx.close();

// 4. ordinateur : la même banque (base simulée relue), panneau à droite
const pc = await ouvrirPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 }, false);
await pc.page.evaluate(([k, v]) => { localStorage.clear(); localStorage.setItem(k, v); }, [lexique ? 'bodycam-banque' : 'faux-db', etatDb]);
await pc.page.reload(); await pc.page.waitForFunction(() => window.__state && window.balade && balade.scenes().length >= 4, null, { timeout: 180000 });
await pc.page.evaluate(id => balade.atelier().choisir(id), scenes.find(s => s.titre.startsWith('Chalet'))?.id || premier.id);
await passes(pc.page, 4);
await pc.page.click('#lieu'); await pc.page.waitForTimeout(400);
await pc.page.screenshot({ path: join(out, 'ordinateur-banque.png') });
await pc.page.click('#banque-fermer'); await pc.page.click('#plus'); await pc.page.waitForTimeout(300);
await pc.page.screenshot({ path: join(out, 'ordinateur-plus.png') });
await pc.page.keyboard.press('Escape');
ok(await pc.page.evaluate(() => document.getElementById('outils').hidden), 'Échap ferme le menu « Plus »');
ok(!pc.erreurs.length, 'pas d\'erreur dans la page (ordinateur) ' + pc.erreurs.slice(0, 3).join(' | '));
writeFileSync(join(out, 'journal.json'), JSON.stringify(journal, null, 1));
await browser.close();
console.log(sec(), 'fini, captures dans', out);
