// « Après la première crotte elle veut pas avancer de 5 m, elle dit que c'est bouché » (docs/meneur-de-jeu.md §18), rejoué dans
// dist/index.html : scène 09 (graine 4821), moteur v3, promenade libre, Claude simulé qui fait ce qu'on dit (1,5 s de délai).
// Chaque essai repart d'une page neuve : « fais une petite crotte » (posée derrière lui, puis cadrée de près), puis la phrase
// essayée ; on note les positions avant/après, la distance faite, ce qu'il dit, et les marches demandées (balade.marches()).
// Essais : avance de 5 mètres ; recule de 3 mètres ; va vers l'arbre ; reviens ; fais demi-tour et avance de 6 mètres ;
// après l'énorme crotte : avance de 5 mètres ; puis 30 m le long du sentier.
// DECALE=0.15 : après le cadrage, il recule d'autant (la distance de cadrage d'un autre écran : 0,4 à 0,7 m).
// Usage : node tools/bouche.mjs [dist/index.html] [essais séparés par |]   (sortie : out/bouche/rapport.json et une capture par essai)
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const page0 = resolve(process.argv[2] || join(root, 'dist/index.html'));
const out = join(root, process.env.OUT || 'out/bouche'); mkdirSync(out, { recursive: true });
const SCENE = +(process.env.SCENE ?? 8);
const ficheF = readdirSync(join(root, 'scenes')).filter(f => f.endsWith('.json')).sort()[SCENE];
const GRAINE = JSON.parse(readFileSync(join(root, 'scenes', ficheF), 'utf8')).graine || 4821;
const ESSAIS = (process.argv[3] || 'avance de 5 mètres|recule de 3 mètres|va vers l\'arbre|reviens|fais demi-tour et avance de 6 mètres|énorme:avance de 5 mètres|sentier:avance de 30 mètres').split('|');
console.log('page', page0, 'scène', ficheF, 'graine', GRAINE);

const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const rapport = [];
for (const essai of ESSAIS) {
  const [avant, phrase] = essai.includes(':') ? essai.split(':') : ['petite', essai];
  const page = await browser.newPage({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 1 });
  const erreurs = [], journal = [];
  page.on('pageerror', e => erreurs.push(e.message));
  page.on('console', m => { const t = m.text(); if (/marche|bloqu|cadrage/.test(t)) journal.push(t); });
  await page.addInitScript(([c]) => {
    window.__CFG = c;
    try { localStorage.setItem('bodycam-docile', '0'); } catch (_) {}
    const voixDe = t => { const m = /La voix dit : (".*")\s*$/m.exec(t); return m ? JSON.parse(m[1]) : null; };
    const sas = { verdict: 'recevable', regle: null, motif: 'geste ordinaire' }, accroupi = [{ type: 'posture', hauteur: 0.45 }, { type: 'attendre', secondes: 3 }, { type: 'posture', hauteur: 1 }];
    function repondre(c) {
      if (/accessoiriste/.test(c)) return { objet: null, suite: null };
      const v = (voixDe(c) || '').toLowerCase(), n = +((v.match(/(\d+)/) || [])[1] || 4);
      if (/énorme/.test(v)) return { sas, pensee: 'Énorme. Bon.', attitude: 'suit', actions: accroupi, fabrique: { nom: 'crotte énorme', quoi: 'une énorme crotte', ou: 'dessous' } };
      if (/crotte/.test(v)) return { sas, pensee: 'Sérieux ? … Bon.', attitude: 'suit', actions: accroupi, fabrique: { nom: 'petite crotte', quoi: 'une petite crotte', ou: 'dessous' } };
      if (/demi-tour/.test(v)) return { sas, pensee: 'Demi-tour.', attitude: 'suit', actions: [{ type: 'tourner', degres: 180 }, { type: 'marcher', metres: n }] };
      if (/reviens/.test(v)) return { sas, pensee: 'Je reviens.', attitude: 'suit', actions: [{ type: 'tourner', degres: 180 }, { type: 'marcher', metres: 4 }] };
      if (/recule/.test(v)) return { sas, pensee: 'Je recule.', attitude: 'suit', actions: [{ type: 'marcher', metres: -n }] };
      if (/arbre/.test(v)) return { sas, pensee: 'L\'arbre.', attitude: 'suit', actions: [{ type: 'rejoindre', objet: 'arbre' }] };
      if (/avance/.test(v)) return { sas, pensee: 'J\'y vais.', attitude: 'suit', actions: [{ type: 'marcher', metres: n }] };
      return { sas, pensee: 'Hm.', attitude: 'suit', actions: [] };
    }
    const sampler = { json: c => new Promise(r => setTimeout(() => r(repondre(c)), 1500)) };
    window.claude = { use: () => Promise.resolve(sampler) };
  }, [{ maxPx: 9000, mobile: true, still: true, graine: GRAINE, debug: true, v3: true, grains: 40000, dtMax: 0.4, scene: SCENE }]);
  await page.goto('file://' + page0, { timeout: 240000 });
  await page.waitForFunction(() => window.balade && window.__state && window.__state.n > 2, null, { timeout: 240000 });
  const quand = (fn, arg, max = 300000) => page.waitForFunction(fn, arg, { timeout: max, polling: 250 }).then(() => true, () => false);
  const auRepos = async () => { await quand(() => balade.corps().file.length === 0 && !/atelier|appel/.test(document.getElementById('debug-meneur').textContent || '')); await page.waitForTimeout(1200); };
  const corps = () => page.evaluate(() => balade.corps());
  const dire = async t => { await page.evaluate(t => balade.dire(t), t); await page.waitForTimeout(400); await quand(() => balade.corps().file.length > 0, null, 20000); await auRepos(); };
  const R = { essai, avant, phrase };
  if (avant === 'sentier') {                                       // sur le sentier, tourné le long du trajet
    await page.evaluate(() => { const c = balade.corps(), s = balade.sol(c.x, c.z + 6).trajet, s0 = balade.sol(c.x, c.z).trajet; balade.placer(s0, c.z, Math.atan2(s - s0, 6)); });
    await page.waitForTimeout(800);
  } else {
    await dire(avant === 'énorme' ? 'fais une énorme crotte' : 'fais une petite crotte');
    const o = await page.evaluate(() => { const L = (balade.percevoir().objets || []).filter(o => /^fab-/.test(o.id)); return L[L.length - 1]; });
    const c = await corps();
    R.chose = o && { id: o.id, m: +o.m.toFixed(2), angle: Math.round(o.angle), taille: o.taille };
    R.cadrage = { haut: +c.haut.toFixed(2), zoom: +c.zoom.toFixed(2) };
    if (+process.env.DECALE) {                                      // une autre distance de cadrage (un autre écran) : il recule d'autant, face à elle
      await page.evaluate(d => { const c = balade.corps(); balade.placer(c.x - Math.sin(c.yaw) * d, c.z - Math.cos(c.yaw) * d, c.yaw); }, +process.env.DECALE);
      await page.waitForTimeout(800); const o2 = await page.evaluate(i => balade.percevoir().objets.find(o => o.id === i), o.id); R.chose.m = +o2.m.toFixed(2); }
  }
  const c0 = await corps(), n0 = (await page.evaluate(() => balade.marches ? balade.marches() : [])).length;
  const objets0 = await page.evaluate(() => balade.objets());
  let mini = 99; const suivi = setInterval(async () => { try { const k = await corps(); for (const o of objets0) if (/^fab-/.test(o.id)) mini = Math.min(mini, Math.hypot(k.x - o.x, k.z - o.z)); } catch (_) {} }, 150);
  await dire(phrase);
  clearInterval(suivi);
  const c1 = await corps();
  R.de = { x: +c0.x.toFixed(2), z: +c0.z.toFixed(2), cap: Math.round(c0.yaw * 57.3) };
  R.a = { x: +c1.x.toFixed(2), z: +c1.z.toFixed(2), cap: Math.round(c1.yaw * 57.3), haut: +c1.haut.toFixed(2), zoom: +c1.zoom.toFixed(2) };
  R.deplacement = +Math.hypot(c1.x - c0.x, c1.z - c0.z).toFixed(2);
  R.pensee = await page.textContent('#pensee');
  R.marches = (await page.evaluate(() => balade.marches ? balade.marches() : [])).slice(n0);
  R.auPlusPresDeLaChose = mini < 99 ? +mini.toFixed(2) : null;
  R.journal = journal.slice(-6); R.erreurs = erreurs;
  console.log(JSON.stringify(R));
  rapport.push(R);
  await page.evaluate(() => { for (const e of document.querySelectorAll('button, #hint, #debug-meneur')) e.style.visibility = 'hidden'; });
  await page.screenshot({ path: join(out, essai.replace(/[^a-zà-ü0-9]+/gi, '-') + '.png'), timeout: 120000 }).catch(() => {});
  await page.close();
}
await browser.close();
writeFileSync(join(out, 'rapport.json'), JSON.stringify(rapport, null, 1));
