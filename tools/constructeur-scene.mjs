// Fait passer une description par la chaîne du constructeur, dans la page, en tenant le rôle de Claude par des fichiers :
// pour l'appel i, la page écrit la consigne réelle dans <dossier>/appel-i.txt et les vues capturées dans
// <dossier>/appel-i-vue-k.jpg, puis attend la réponse <dossier>/rep-i.json (écrite à l'avance ou pendant l'attente).
// C'est ainsi qu'on éprouve la consigne : on y répond soi-même, en regardant les vraies captures.
// À la fin : <dossier>/fiche-finale.json, <dossier>/journal.json.
//
// Usage : node tools/constructeur-scene.mjs <dossier> <fichier de description> [pixels internes] [passes par vue]
import { chromium } from 'playwright';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const [,, dossierArg, descFichier, px = '24000', passes = '4'] = process.argv;
const dossier = resolve(dossierArg); mkdirSync(dossier, { recursive: true });
const description = readFileSync(descFichier, 'utf8').trim();
const t0 = Date.now(), sec = () => ((Date.now() - t0) / 1000).toFixed(0).padStart(5);

const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 288, height: 512 }, deviceScaleFactor: 1 });
const erreurs = [];
page.on('pageerror', e => erreurs.push(e.message));
page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_/.test(m.text())) erreurs.push(m.text()); });
await page.exposeFunction('__claudeFichier', async (i, consigne, images, modelTier) => {
  writeFileSync(join(dossier, `appel-${i}.txt`), `modèle : ${modelTier}\n\n` + consigne);
  images.forEach((u, k) => writeFileSync(join(dossier, `appel-${i}-vue-${k + 1}.jpg`), Buffer.from(u.split(',')[1], 'base64')));
  console.log(sec(), `appel ${i} (${modelTier}, ${images.length} image(s)) : en attente de rep-${i}.json`);
  const f = join(dossier, `rep-${i}.json`);
  while (!existsSync(f)) await new Promise(r => setTimeout(r, 2000));
  await new Promise(r => setTimeout(r, 300));
  const t = readFileSync(f, 'utf8'); console.log(sec(), `réponse ${i} lue`);
  return t;
});
await page.addInitScript(() => {
  let i = 0;
  const lire = b => new Promise(ok => { const r = new FileReader(); r.onload = () => ok(r.result); r.readAsDataURL(b); });
  const sample = async (input, o = {}) => {
    const imgs = o.images ? await Promise.all([].concat(o.images).map(lire)) : [];
    const t = await window.__claudeFichier(i++, String(input), imgs, o.modelTier || 'default');
    if (o.signal && o.signal.aborted) throw { code: 'cancelled', message: 'arrêté' };
    let v; try { v = JSON.parse(t); } catch (_) { throw { code: 'invalid_json', message: 'illisible', text: t }; }
    if (v && v.erreur) throw { code: v.erreur, message: v.erreur };
    return { text: JSON.stringify(v), truncated: false, modelTierApplied: o.modelTier || 'default' };
  };
  const ns = Object.assign((a, b) => sample(a, b), { json: (a, b) => sample(a, b).then(r => JSON.parse(r.text)), limits: async () => ({ maxPromptBytes: 262144, images: { maxCount: 5, maxInputBytes: 2e7, mediaTypes: ['image/jpeg'] } }) });
  window.claude = { use: async n => n === 'sample' ? ns : null };
});
await page.addInitScript(c => { window.__CFG = c; }, { maxPx: +px, still: true, capPasses: +passes, capDelai: 1800000, capLargeur: 288, nowalk: true });
await page.goto('file://' + join(root, 'dist/index.html'));
await page.waitForFunction(() => window.__state && window.balade, null, { timeout: 300000 });
await page.evaluate(d => balade.atelier().creer(d), description);
let vu = '';
while (true) {
  await page.waitForTimeout(2000);
  const j = await page.evaluate(() => { const j = balade.atelier().job(); return j && { etape: j.etape, texte: j.texte, termine: !!j.termine, erreur: j.erreur, doc: j.doc || null, journal: j.journal || [] }; });
  if (!j) break;
  if (j.texte !== vu) { vu = j.texte; console.log(sec(), j.etape, '—', j.texte); }
  if (j.termine) { if (j.doc) writeFileSync(join(dossier, 'fiche-finale.json'), JSON.stringify(j.doc.fiche, null, 1)); writeFileSync(join(dossier, 'journal.json'), JSON.stringify({ job: j, erreurs }, null, 1)); break; }
}
await browser.close();
console.log(sec(), 'fini', erreurs.length ? erreurs.slice(0, 5) : '');
