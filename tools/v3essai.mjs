// Essai du moteur v3 (docs/moteur-v3.md) : le semeur, comparé au lanceur de rayons.
// Usage : node tools/v3essai.mjs [dossier] [planche|mesures|tout] [tours] [v3,actuel]
//   planche  rend en v3 les trois vues de forêt de ref/vues.json, puis le départ de la vue a-sentier après 2 m et 5 m de
//            marche et le regard tourné de 60°, et assemble out/v3-planche.png (référence | v3, puis la marche).
//   mesures  le test du triptyque : ms par image en marche, en v3, pour la forêt de la fiche 0, la même forêt plus dense
//            (foret.densite 1, rochers et feuillage 1,5) et la fiche 05-maison-lapin ; puis le moteur actuel à la même
//            résolution (CFG.auto, niveau de résolution fixé à 0, temps brut d'une image de mouvement : state.msImage,
//            msMotion en est la moyenne glissante). Résultats dans mesures.json. La machine est partagée : avec tours > 1,
//            les cas sont repris en alternance et la synthèse donne la médiane de chaque cas sur tous les tours.
// Rendu logiciel (SwiftShader) : au plus deux navigateurs à la fois. Compter un quart d'heure pour tout.
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const [,, dir = 'out/v3', quoi = 'tout', tours = '1', moteurs = 'v3,actuel'] = process.argv;
mkdirSync(join(root, dir), { recursive: true });
const vues = JSON.parse(readFileSync(join(root, 'ref/vues.json'), 'utf8'));
const W = vues.largeur, H = vues.hauteur;
const ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'];

async function page(cfg, browser) {
  const p = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const logs = []; p.on('console', m => { if (m.type() === 'error') logs.push(m.text()); }); p.on('pageerror', e => logs.push('pageerror: ' + e.message));
  p.on('console', m => { if (/context lost|CONTEXT_LOST/i.test(m.text())) logs.push('PERTE DE CONTEXTE : ' + m.text()); });
  await p.addInitScript(c => { window.__CFG = c; }, cfg);
  await p.goto('file://' + join(root, 'dist/index.html'), { timeout: 600000 });
  p.logs = logs;
  return p;
}
const st = p => p.evaluate(() => window.__state || null);
async function attendre(p, f, max = 900) {
  const t0 = Date.now();
  while ((Date.now() - t0) / 1000 < max) { await p.waitForTimeout(400); const s = await st(p); if (s && f(s)) return s; }
  throw new Error('délai dépassé');
}

/* ---- planche */
async function planche() {
  const browser = await chromium.launch({ headless: true, args: ARGS });
  const foret = vues.vues.filter(v => !v.options.scene);
  const N = 16, sorties = [];
  // deux vues à la fois
  for (let i = 0; i < foret.length; i += 2) {
    await Promise.all(foret.slice(i, i + 2).map(async v => {
      const p = await page({ still: true, nohud: true, nowalk: true, v3: true, ...v.options }, browser);
      const s = await attendre(p, s => s.n >= N);
      await p.screenshot({ path: join(root, dir, 'v3-' + v.nom + '.png') });
      console.log('vue', v.nom, 'ms/image', s.v3.msMoy, p.logs.join(' | '));
      await p.close();
    }));
  }
  // marche : départ de a-sentier, regard tourné de 60°, puis 2 m et 5 m (images prises dès l'arrêt : c'est l'image de marche)
  const p = await page({ still: true, nohud: true, nowalk: true, v3: true, z: 22 }, browser);
  await attendre(p, s => s.n >= 8);
  await p.screenshot({ path: join(root, dir, 'v3-depart.png') });
  const marcher = async m => {
    await p.evaluate(m => window.balade.agir([{ type: 'marcher', metres: m }]), m);
    const ms = [];
    for (;;) { const s = await st(p); if (s.v3) ms.push(s.v3.ms); if (s.file === 0) break; await p.waitForTimeout(200); }
    return ms;
  };
  const m2 = await marcher(2); await p.screenshot({ path: join(root, dir, 'v3-marche2m.png') });
  const m5 = await marcher(3); await p.screenshot({ path: join(root, dir, 'v3-marche5m.png') });
  await p.evaluate(() => window.balade.agir([{ type: 'tourner', degres: 60 }]));
  for (;;) { const s = await st(p); if (s.file === 0) break; await p.waitForTimeout(200); }
  await p.screenshot({ path: join(root, dir, 'v3-tourne60.png') });
  console.log('marche : ms par image', JSON.stringify({ m2, m5 }), p.logs.join(' | '));
  await p.close();
  // assemblage
  const img = f => 'data:image/png;base64,' + readFileSync(f).toString('base64');
  const lignes = [
    { titre: 'Lanceur de rayons (ref/), 24 passes', imgs: foret.map(v => img(join(root, 'ref', v.nom + '.png'))), noms: foret.map(v => v.nom) },
    { titre: 'Moteur v3 (semeur), ' + N + ' images accumulées', imgs: foret.map(v => img(join(root, dir, 'v3-' + v.nom + '.png'))), noms: foret.map(v => v.nom) },
    { titre: 'Moteur v3 en marche (image prise à l\'arrêt du pas, sans accumulation à l\'arrêt)', imgs: ['marche2m', 'marche5m', 'tourne60'].map(n => img(join(root, dir, 'v3-' + n + '.png'))), noms: ['après 2 m', 'après 5 m', 'regard tourné de 60°'] },
  ];
  const q = await browser.newPage();
  const png = await q.evaluate(async ({ lignes, W, H }) => {
    const load = s => new Promise(ok => { const i = new Image(); i.onload = () => ok(i); i.src = s; });
    const c = document.createElement('canvas'), m = 12, th = 26, lh = 20;
    c.width = 3 * W + 4 * m; c.height = lignes.length * (H + th + lh + m) + m;
    const g = c.getContext('2d'); g.fillStyle = '#141414'; g.fillRect(0, 0, c.width, c.height);
    let y = m;
    for (const l of lignes) {
      g.fillStyle = '#eee'; g.font = '600 15px sans-serif'; g.fillText(l.titre, m, y + 17); y += th;
      for (let k = 0; k < l.imgs.length; k++) { const i = await load(l.imgs[k]); g.drawImage(i, m + k * (W + m), y, W, H);
        g.fillStyle = '#bbb'; g.font = '13px sans-serif'; g.fillText(l.noms[k], m + k * (W + m), y + H + 15); }
      y += H + lh + m;
    }
    return c.toDataURL('image/png');
  }, { lignes, W, H });
  writeFileSync(join(root, 'out/v3-planche.png'), Buffer.from(png.split(',')[1], 'base64'));
  console.log('Planche : out/v3-planche.png');
  await browser.close();
}

/* ---- mesures : le triptyque */
async function mesures() {
  const fiche0 = JSON.parse(readFileSync(join(root, 'scenes/01-grands-avaux.json'), 'utf8'));
  const dense = { ...fiche0, id: 'grands-avaux-dense', titre: 'Forêt plus dense', foret: { densite: 1, rochers: 1.5, feuillage: 1.5 } };
  const cas = [
    { nom: 'foret', scene: 0 },
    { nom: 'foret-dense', scene: dense },
    { nom: 'maison-lapin', scene: 4 },
  ];
  const marche = [{ type: 'marcher', metres: 30 }];
  const res = [];
  const une = async (c, moteur, browser) => {
    const cfg = { nohud: true, still: true, scene: c.scene, auto: marche, w: W, h: H };
    if (moteur === 'v3') { cfg.v3 = true; cfg.v3sync = true; } else cfg.level = 0;   // v3sync : ms = temps de calcul attendu, pas l'intervalle entre images     // moteur actuel : résolution de mouvement fixée à la pleine résolution
    const p = await page(cfg, browser);
    const ech = [];
    const t0 = Date.now();
    while (ech.length < (moteur === 'v3' ? 14 : 8) && Date.now() - t0 < 900000) {
      await p.waitForTimeout(moteur === 'v3' ? 400 : 1500);
      const s = await st(p); if (!s) continue;
      const ms = moteur === 'v3' ? (s.v3 && s.v3.images > 3 ? s.v3.ms : null) : (s.n > 2 ? s.msImage : null);   // temps brut de la dernière image
      if (ms != null && (!ech.length || ms !== ech[ech.length - 1])) ech.push(ms);
    }
    const s = await st(p);
    const med = a => { a = a.slice().sort((x, y) => x - y); return a[a.length >> 1]; };
    const r = { cas: c.nom, moteur, W: s.W, H: s.H, ms_mediane: +med(ech).toFixed(0), echantillons: ech.map(x => +x.toFixed(0)), grains: s.v3 ? s.v3.grains : undefined, erreurs: p.logs };
    console.log(JSON.stringify(r)); res.push(r);
    await p.close();
  };
  const browser = await chromium.launch({ headless: true, args: ARGS });
  for (let t = 0; t < +tours; t++)
    for (const c of cas) for (const m of moteurs.split(',')) await une(c, m, browser);   // l'un après l'autre : le rendu logiciel est partagé
  await browser.close();
  const med = a => { a = a.slice().sort((x, y) => x - y); return a[a.length >> 1]; };
  const synthese = {};
  for (const r of res) { const k = r.cas + ' / ' + r.moteur; (synthese[k] = synthese[k] || []).push(...r.echantillons); }
  for (const k in synthese) synthese[k] = { ms_mediane: med(synthese[k]), n: synthese[k].length, min: Math.min(...synthese[k]), max: Math.max(...synthese[k]) };
  // la machine est partagée : la médiane de chaque tour, puis la plus basse, est l'estimation la moins chargée
  for (const k in synthese) synthese[k].meilleur_tour = Math.min(...res.filter(r => r.cas + ' / ' + r.moteur === k).map(r => r.ms_mediane));
  console.table(synthese);
  writeFileSync(join(root, dir, 'mesures.json'), JSON.stringify({ synthese, mesures: res }, null, 1));
}

if (quoi === 'planche' || quoi === 'tout') await planche();
if (quoi === 'mesures' || quoi === 'tout') await mesures();
