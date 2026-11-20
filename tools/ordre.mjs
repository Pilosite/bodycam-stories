// « Déplace-toi et fais la crotte de 20 kg : elle est apparue à côté de l'autre ! » (docs/meneur-de-jeu.md §19), rejoué dans
// dist/index.html : scène 09 (graine 4821), moteur v3, promenade libre, Claude simulé (1,5 s de délai). Chaque essai repart
// d'une page neuve : « fais une crotte » (la première), « montre-la-moi », puis la phrase essayée. On note où est la première,
// où est la nouvelle, la distance entre elles, où il était quand la place a été prise (window.balPoses), les marches
// (balade.marches()), ce qu'il dit, et une capture à la fin.
// CLAUDE=objet (défaut : la chose seule, sans le déplacement) | marche_objet | objet_marche (à l'envers) | texte (texte seul).
// Usage : node tools/ordre.mjs [dist/index.html] [phrases séparées par |]   (sortie : out/ordre/rapport.json, une capture par essai)
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const page0 = resolve(process.argv[2] || join(root, 'dist/index.html'));
const out = join(root, process.env.OUT || 'out/ordre'); mkdirSync(out, { recursive: true });
const SCENE = +(process.env.SCENE ?? 8), MODE = process.env.CLAUDE || 'objet';
const ficheF = readdirSync(join(root, 'scenes')).filter(f => f.endsWith('.json')).sort()[SCENE];
const GRAINE = JSON.parse(readFileSync(join(root, 'scenes', ficheF), 'utf8')).graine || 4821;
const ESSAIS = (process.argv[3] || 'déplace-toi et fais une crotte de 20 kg|avance de 8 mètres puis fais une énorme bouse|fais une crotte puis recule de 3 m').split('|');
console.log('page', page0, 'scène', ficheF, 'graine', GRAINE, 'Claude', MODE);

const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const rapport = [];
for (const phrase of ESSAIS) {
  const page = await browser.newPage({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 1 });
  const erreurs = [], journal = [];
  page.on('pageerror', e => erreurs.push(e.message));
  page.on('console', m => { const t = m.text(); if (/marche|déplacement|bloqu|cadrage/.test(t)) journal.push(t); });
  await page.addInitScript(([c, mode]) => {
    window.__CFG = c;
    try { localStorage.setItem('bodycam-docile', '0'); } catch (_) {}
    const voixDe = t => { const m = /La voix dit : (".*")\s*$/m.exec(t); return m ? JSON.parse(m[1]) : null; };
    const sas = { verdict: 'recevable', regle: null, motif: 'geste ordinaire' }, accroupi = [{ type: 'posture', hauteur: 0.45 }, { type: 'attendre', secondes: 3 }, { type: 'posture', hauteur: 1 }];
    function repondre(c) {
      if (/accessoiriste/.test(c)) return { objet: null, suite: null };
      const v = (voixDe(c) || '').toLowerCase();
      if (!v) return { pensee: 'Hm.', attitude: 'initiative' };
      if (/montre/.test(v)) { const id = [...c.matchAll(/\((fab-\d+)\)/g)].map(m => m[1]).pop(); return { sas, pensee: 'Regarde.', attitude: 'suit', actions: [{ type: 'cadrer', objet: id }] }; }
      const n = +((v.match(/(\d+)\s*(m\b|mètres?)/) || [])[1] || 0);
      const marche = /déplace|bouge/.test(v) ? [{ type: 'marcher', metres: 2 }] : /avance/.test(v) ? [{ type: 'marcher', metres: n || 4 }]
        : /recule/.test(v) ? [{ type: 'marcher', metres: -(n || 2) }] : /arbre/.test(v) ? [{ type: 'rejoindre', objet: 'arbre' }] : [];
      const nom = /20 kg/.test(v) ? 'crotte de 20 kg' : /énorme/.test(v) ? 'énorme bouse' : /autre/.test(v) ? 'autre crotte' : 'crotte';
      if (mode === 'texte' && marche.length) return { sas, pensee: 'Encore ? T\'es pas croyable.', attitude: 'hesite', actions: [] };
      const actions = mode === 'marche_objet' ? [...marche, ...accroupi] : mode === 'objet_marche' ? [...accroupi, ...marche] : accroupi;
      return { sas, pensee: 'Bon. Si tu y tiens.', attitude: 'suit', actions, fabrique: { nom, quoi: nom, ou: 'devant' } };
    }
    const sampler = { json: c => new Promise(r => setTimeout(() => r(repondre(c)), 1500)) };
    window.claude = { use: () => Promise.resolve(sampler) };
  }, [{ maxPx: 9000, mobile: true, still: true, graine: GRAINE, debug: true, v3: process.env.V3 !== '0', grains: 40000, dtMax: +(process.env.DTMAX || 0.4), scene: SCENE }, MODE]);
  await page.goto('file://' + page0, { timeout: 900000 });
  await page.waitForFunction(() => window.balade && window.__state && window.__state.n > 2, null, { timeout: 900000 });
  const quand = (fn, arg, max = 300000) => page.waitForFunction(fn, arg, { timeout: max, polling: 250 }).then(() => true, () => false);
  const auRepos = async () => { await quand(() => balade.corps().file.length === 0 && !/atelier|appel/.test(document.getElementById('debug-meneur').textContent || '')); await page.waitForTimeout(1200); };
  const corps = () => page.evaluate(() => balade.corps());
  const traces = () => page.evaluate(() => balade.objets().filter(o => /^fab-/.test(o.id)));
  const dire = async t => { await page.evaluate(t => balade.dire(t), t); await page.waitForTimeout(400); await quand(() => balade.corps().file.length > 0, null, 20000); await auRepos(); };
  await dire('fais une crotte'); await dire('montre-la-moi');
  const c0 = await corps(), [A] = await traces(), n0 = (await page.evaluate(() => balade.marches())).length, p0 = await page.evaluate(() => window.balPoses.length);
  const dits = new Set(); const ecoute = setInterval(async () => { try { const t = await page.textContent('#pensee'); if (t) dits.add(t); } catch (_) {} }, 400);
  await dire(phrase);
  clearInterval(ecoute);
  const c1 = await corps(), L = await traces(), B = L.find(o => o.id !== (A && A.id));
  const poses = (await page.evaluate(() => window.balPoses.slice())).slice(p0);
  const r2 = v => +v.toFixed(2), d = (a, b) => a && b ? r2(Math.hypot(a.x - b.x, a.z - b.z)) : null;
  const R = { phrase, claude: MODE, depart: { x: r2(c0.x), z: r2(c0.z) }, arrivee: { x: r2(c1.x), z: r2(c1.z) },
    premiere: A && { id: A.id, x: r2(A.x), z: r2(A.z), taille: A.taille }, nouvelle: B && { id: B.id, nom: B.nom, x: r2(B.x), z: r2(B.z), taille: B.taille },
    entre_elles_m: d(A, B), nouvelle_depuis_depart_m: d(B, c0), place_prise_a: poses[0] || null, place_depuis_depart_m: poses[0] ? d(poses[0], c0) : null,
    marches: (await page.evaluate(() => balade.marches())).slice(n0), dits: [...dits], journal: journal.slice(-8), erreurs };
  console.log(JSON.stringify(R));
  rapport.push(R);
  await page.evaluate(() => { for (const e of document.querySelectorAll('button, #hint, #debug-meneur')) e.style.visibility = 'hidden'; });
  await page.screenshot({ path: join(out, MODE + '-' + phrase.replace(/[^a-zà-ü0-9]+/gi, '-') + '.png'), timeout: 120000 }).catch(() => {});
  await page.close();
}
await browser.close();
writeFileSync(join(out, 'rapport-' + MODE + '.json'), JSON.stringify(rapport, null, 1));
