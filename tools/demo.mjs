// La démonstration jouée dans dist/index.html, moteur v3, en promenade libre, avec un Claude simulé (window.claude remplacé
// avant le chargement, 1,5 s de délai). Par défaut, un Claude « méchant », comme le vrai Claude sur le PC de Toine : il pose la
// crotte « devant », répond par du texte seul à « énorme » (« je vais plutôt la faire avec de la terre »), ne donne aucune étape
// de façonnage ; la page tient la demande (docs/meneur-de-jeu.md §17).
//   « fais une petite crotte », « fais une crotte de 5 kg », « maintenant fais une énorme crotte », « fais comme un bonhomme
//   de neige avec » (d'autres phrases : PHRASES='…|…|…|…' ; les phrases manquantes sont celles du scénario par défaut).
// Captures : la petite cadrée ; la 5 kg pendant qu'il est accroupi (elle est derrière lui, invisible) puis cadrée ; l'énorme ;
// il part chercher, ramasse (la main) ; la PLANCHE du façonnage (PLANCHE images réparties sur le geste, 14 par défaut,
// assemblées dans planche.png) ; le bonhomme en pied. Puis une marche forcée droit sur un bloc de grès (§16).
// Graine du monde ET du meneur : celle de la fiche (4821 pour la scène 09).
//
// Usage : node tools/demo.mjs [pixels internes pendant les gestes] [pixels des captures] [docile]
//   docile : le Claude simulé « oublie » gestes et objets ; le mode DOCILE de la page complète.
// Variables : PASSES (images accumulées par capture, 10), PASSES_PLANCHE (4), PLANCHE (14), SCENE (indice de la fiche, 8 :
//   09-champcueil-aube), VUE=pc (tout en 960 × 600, 16/10, dans out/demo-pc), GENTIL=1 (le Claude simulé d'avant, qui fait ce
//   qu'on dit), SANS_OBSTACLE=1, SANS_SEMIS=1, CFGX='{"ombrage":"socle"}' (options de page en plus).
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const [,, px = '9000', pxCapture = '120000', mode = ''] = process.argv;
const PASSES = +(process.env.PASSES || 10);
const GESTES = 40000, GRAINS = 300000;                            // budget de grains v3 : petit pendant les gestes (rendu logiciel lent), celui du téléphone pour les captures
const PC = process.env.VUE === 'pc', VW = PC ? 960 : 390, VH = PC ? 600 : 780;
const out = join(root, PC ? 'out/demo-pc' : 'out/demo');
mkdirSync(out, { recursive: true });
const SCENE = +(process.env.SCENE ?? 8), GENTIL = !!process.env.GENTIL;
const ficheF = readdirSync(join(root, 'scenes')).filter(f => f.endsWith('.json')).sort()[SCENE];
const GRAINE = (JSON.parse(readFileSync(join(root, 'scenes', ficheF), 'utf8')).graine) || 4821;   // la graine de la fiche (le monde), aussi pour le meneur
console.log('scène', ficheF, 'graine', GRAINE, PC ? 'vue PC 960 × 600' : 'vue téléphone 390 × 780', GENTIL ? 'Claude gentil' : 'Claude méchant');

const browser = await chromium.launch({ headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: VW, height: VH }, deviceScaleFactor: 1 });
const erreurs = [];
page.on('pageerror', e => { erreurs.push(e.message); console.log('  [erreur]', e.stack); });
page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_/.test(m.text())) erreurs.push(m.text()); if (m.type() === 'warning' && !/GPU stall|GL Driver/.test(m.text())) console.log('  [page]', m.text()); });
await page.addInitScript(([c, oublie, gentil]) => {
  window.__CFG = c;
  try { localStorage.setItem('bodycam-docile', oublie ? '1' : '0'); } catch (_) {}
  const voixDe = t => { const m = /La voix dit : (".*")\s*$/m.exec(t); return m ? JSON.parse(m[1]) : null; };
  const sas = { verdict: 'recevable', regle: null, motif: 'geste ordinaire' };
  function repondre(c) {
    if (/accessoiriste/.test(c)) {                                   // l'accessoiriste écrit mal (trop grand, trois boules, pas d'étapes) : la bibliothèque sert de base sûre
      if (/LA CHOSE, telle qu'elle est/.test(c)) return { retouche: { nom: 'bonhomme', ajoute: [{ f: 'boule', p: [0, 2, 0], taille: [3, 3, 3], couleur: '#ffffff', matiere: 'mat' }] }, suite: null };
      return { objet: { envergure_m: 0.2, nom: 'crotte', formes: [{ f: 'boule', p: [0, 0.4, 0], taille: [1.2, 0.8, 1], couleur: '#4a3220', matiere: 'mat' }] }, suite: null };
    }
    const v = voixDe(c) || '', ids = [...c.matchAll(/\((fab-\d+)\)/g)].map(m => m[1]);
    if (oublie) return { sas, pensee: 'Ha. Si tu veux.', attitude: 'suit', actions: [] };
    if (/avance/.test(v)) return { sas, pensee: 'Un peu plus loin, alors.', attitude: 'suit', actions: [{ type: 'marcher', metres: 3 }] };
    const accroupi = [{ type: 'posture', hauteur: 0.45 }, { type: 'attendre', secondes: 3 }, { type: 'posture', hauteur: 1 }];
    const ou = gentil ? 'dessous' : 'devant';                        // le vrai Claude : « devant » ; la donnée du modèle l'emporte
    if (/bonhomme/.test(v)) return { sas, pensee: 'Un bonhomme de neige. Avec ça. D\'accord, artiste.', attitude: 'suit',   // il vise la première (la petite), sans aller chercher : la page corrige
      actions: [], modifie: { objet: ids[0], quoi: 'en faire un bonhomme de neige' } };
    if (/enorme|énorme|géant/.test(v)) return gentil ? { sas, pensee: 'Ah ouais. Là, quand même… Bon.', attitude: 'suit', actions: accroupi, fabrique: { nom: 'crotte énorme', quoi: 'une énorme crotte, colossale', ou } }
      : { sas, pensee: 'Une énorme ? Non… Je vais plutôt la faire avec de la terre.', attitude: 'suit', actions: [] };   // cas réel : texte seul, autre matière
    if (/kg/.test(v)) return gentil ? { sas, pensee: 'Cinq kilos. Rien que ça.', attitude: 'suit', actions: accroupi, fabrique: { nom: 'crotte de 5 kg', quoi: 'une crotte de 5 kg', ou } }
      : { sas, pensee: 'Elle est déjà bien, celle-là. Je la grossis un peu.', attitude: 'suit', actions: [], modifie: { objet: ids[0], quoi: 'un peu plus grosse' } };   // il retouche la petite
    if (/crotte|caca/.test(v)) return { sas, pensee: 'Sérieux ? … Bon. Personne regarde.', attitude: 'suit', actions: accroupi, fabrique: { nom: 'petite crotte', quoi: 'une petite crotte', ou, distance: gentil ? undefined : 1.2 } };
    return { sas, pensee: 'Hm.', attitude: 'suit', actions: [] };
  }
  const sampler = { json: c => new Promise(r => setTimeout(() => r(repondre(c)), 1500)) };
  window.claude = { use: () => Promise.resolve(sampler) };
}, [{ maxPx: +px, mobile: true, still: true, graine: GRAINE, debug: true, v3: true, grains: GESTES, dtMax: 0.4, scene: SCENE, ...JSON.parse(process.env.CFGX || '{}') }, mode === 'docile', GENTIL]);
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
  const f = join(out, nom + '.png');
  await page.screenshot({ path: f, timeout: 300000 }).catch(async () => { console.log(sec(), '(capture d\'écran expirée : lecture du canevas)'); writeFileSync(f, Buffer.from((await lireCanevas()).split(',')[1], 'base64')); });
  const pensee = await page.textContent('#pensee'); captures.push({ f, quoi, pensee }); console.log(sec(), 'capture', nom, '·', quoi, '·', pensee);
  await page.evaluate(([p, g]) => { balade.grains(g); balade.resolution(p); for (const e of document.querySelectorAll('button, #hint, #debug-meneur')) e.style.visibility = ''; balade.pause(false); }, [+px, GESTES]);
}
const lireCanevas = () => page.evaluate(() => new Promise(ok => requestAnimationFrame(() => {
  const cv = document.querySelector('canvas'), c = document.createElement('canvas'); c.width = cv.width; c.height = cv.height;
  c.getContext('2d').drawImage(cv, 0, 0); ok(c.toDataURL('image/jpeg', 0.9)); })), { timeout: 600000 });
const objet = id => page.evaluate(i => (balade.percevoir().objets || []).find(o => o.id === i), id);

// Le parcours de la démo (§15.6, §17) : une petite crotte, une de 5 kg, une énorme, « fais comme un bonhomme de neige avec ».
const PH0 = ['fais une petite crotte', 'fais une crotte de 5 kg', 'maintenant fais une énorme crotte', 'fais comme un bonhomme de neige avec'];
const PH = (process.env.PHRASES || '').split('|').map(s => s.trim()).filter(Boolean);
while (PH.length < PH0.length) PH.push(PH0[PH.length]);           // moins de phrases : celles du scénario par défaut complètent
const derriere = o => o && Math.abs(o.angle) > 90;                  // perçue derrière le regard du corps
async function vueLibre(id, quoi) { const v = await page.evaluate(i => balade.vue(i), id); verifier(v, `${quoi} : rien entre la caméra et elle (semis, troncs, rochers, choses)`); }
// 1. une petite crotte : posée derrière lui (Claude dit « devant, 1,2 m »), puis cadrée de près
await attendre(1500);
const tVoix1 = await page.evaluate(() => performance.now() / 1000);
await dire(PH[0]);
await quand(() => balade.objets().some(o => o.id === 'fab-1'));
const o1a = await objet('fab-1');
verifier(derriere(o1a), `posée derrière lui pendant qu'il est accroupi : ${o1a && o1a.angle}°, ${o1a && o1a.m} m`);
await auRepos();
const o1 = await objet('fab-1');
verifier(o1 && o1.taille >= 0.08 && o1.taille <= 0.16, `petite crotte : ${o1 && o1.taille} m`);
verifier(o1 && Math.abs(o1.angle) < 10 && o1.m < 1, `cadrée de près : ${o1 && o1.m} m, ${o1 && o1.angle}°, zoom ${(await corps()).zoom.toFixed(1)}`);
{ // les bruits de la petite (docs/bruitages.md) : deux ou trois, brefs, aigus, pendant l'effort, puis la chute
  const J = (await page.evaluate(() => window.balSons)).filter(e => e.t >= tVoix1), B = J.filter(e => e.recette === 'flatulence');
  for (const e of J) console.log(sec(), '  son', JSON.stringify(e));
  verifier(B.length >= 2 && B.length <= 3 && B.every(b => b.duree <= 0.4 && b.f0 >= 180), `petite : ${B.length} petits bruits (${B.map(b => b.duree + ' s, ' + Math.round(b.f0) + ' Hz').join(' ; ')})`);
  verifier(J.some(e => e.recette === 'chute'), 'on l\'entend tomber (chute)');
}
await vueLibre('fab-1', 'petite');
await capture('1-petite', 'la petite crotte, cadrée de près');

// 2. une crotte de 5 kg (Claude retouche la petite au lieu d'en faire une) : la page la fait, derrière lui ; il se retourne
await dire(PH[1]);
await quand(() => balade.objets().some(o => o.id === 'fab-2'));
const o2a = await objet('fab-2');
verifier(derriere(o2a), `5 kg posée derrière lui : ${o2a && o2a.angle}°, ${o2a && o2a.m} m`);
await capture('2a-5kg-pose', 'accroupi : elle tombe derrière lui, on ne la voit pas apparaître');
await auRepos();
const o2 = await objet('fab-2'), c2 = await corps();
verifier(o2 && o2.taille >= 0.5 && o2.taille <= 0.65, `5 kg : ${o2 && o2.taille} m (petite : ${o1.taille} m)`);
verifier(o2 && o2.m >= o2.taille / 2 + 0.3, `il n'est pas dedans : ${o2 && o2.m} m du centre`);
const entiere2 = await page.evaluate(([t, h, m, y, z]) => MENEUR.tientDansImage(t, h, m, y, z, innerWidth / innerHeight), [o2.taille, o2.haut, o2.m, 1.36 * c2.haut, c2.zoom]);
verifier(entiere2 && Math.abs(o2.angle) < 10, `retourné, elle est entière à l'image : ${o2.m} m, ${o2.angle}°, zoom ${c2.zoom.toFixed(1)}`);
await vueLibre('fab-2', '5 kg');
await capture('2b-5kg', 'la crotte de 5 kg, il s\'est retourné, entière');

// 3. une énorme crotte (Claude : texte seul, « avec de la terre ») : la page la fait, énorme ; il pousse accroupi, puis s'étonne (§20)
const tVoix3 = await page.evaluate(() => performance.now() / 1000);
await dire(PH[2]);
await quand(() => balade.objets().some(o => /^fab-/.test(o.id) && o.id !== 'fab-1' && o.id !== 'fab-2'));
const idE = await page.evaluate(() => balade.objets().map(o => o.id).filter(i => /^fab-/.test(i)).sort((a, b) => +b.slice(4) - +a.slice(4))[0]);
const o3a = await objet(idE);
verifier(derriere(o3a), `énorme posée derrière lui : ${o3a && o3a.angle}°`);
await auRepos();
const o3 = await objet(idE), c3 = await corps();
verifier(o3 && o3.taille >= 0.72 && o3.taille <= 0.9, `énorme : ${o3 && o3.taille} m`);
const entiere3 = await page.evaluate(([t, h, m, y, z]) => MENEUR.tientDansImage(t, h, m, y, z, innerWidth / innerHeight), [o3.taille, o3.haut, o3.m, 1.36 * c3.haut, c3.zoom]);
verifier(entiere3, `entière à l'image : ${o3.m} m, accroupi ${c3.haut}, zoom ${c3.zoom.toFixed(1)}`);
verifier(!/terre/.test(await page.textContent('#pensee')), 'sa pensée ne parle plus de terre : « ' + (await page.textContent('#pensee')) + ' »');
{ // le journal des pensées et leurs instants (balPensees) : avant, souffles pendant l'effort, réaction après le cadrage, jamais la terre
  const P = (await page.evaluate(() => window.balPensees)).filter(p => p.t >= tVoix3).map(p => Object.assign(p, { t: +(p.t - tVoix3).toFixed(1) }));
  writeFileSync(join(out, 'pensees.json'), JSON.stringify(P, null, 1));
  for (const p of P) console.log(sec(), `  pensée +${p.t} s [${p.source}] « ${p.texte} » (file : ${p.file.join(', ')})`);
  verifier(P.length && !P.some(p => /terre|boue|mod[eè]l/i.test(p.texte)), 'aucune pensée ne parle d\'une autre matière');
  const souffles = P.filter(p => p.source === 'file' && p.file[0] === 'effort'), reac = P.filter(p => p.source === 'file' && p.file[0] !== 'effort');
  verifier(souffles.length >= 1, `souffles pendant l'effort : ${souffles.map(p => '+' + p.t + ' s').join(', ')}`);
  verifier(reac.length === 1 && reac[0].t > Math.max(0, ...souffles.map(p => p.t)), `une réaction, après l'effort et le cadrage : ${reac.map(p => '+' + p.t + ' s « ' + p.texte + ' »').join(' ; ')}`);
}
{ // les bruits de l'énorme et leurs instants (balSons) : le gros pendant l'effort, après les souffles, juste avant la pose ; aucune pensée dite pendant
  const J = (await page.evaluate(() => window.balSons)).filter(e => e.t >= tVoix3).map(e => Object.assign({}, e, { t: +(e.t - tVoix3).toFixed(2) }));
  const P = (await page.evaluate(() => window.balPensees)).filter(p => p.t >= tVoix3).map(p => Object.assign({}, p, { t: +(p.t - tVoix3).toFixed(2) }));
  writeFileSync(join(out, 'sons.json'), JSON.stringify(J, null, 1));
  for (const e of J) console.log(sec(), '  son', JSON.stringify(e));
  const B = J.filter(e => e.recette === 'flatulence'), G = B.find(e => e.principal), ch = J.find(e => e.recette === 'chute');
  verifier(G && G.duree >= 2.5 && G.f0 <= 90, `énorme : le gros bruit, ${G && G.duree} s, ${G && Math.round(G.f0)} Hz, à +${G && G.t} s`);
  const souffles = P.filter(p => p.source === 'file' && p.file[0] === 'effort');
  verifier(G && souffles.every(p => p.t < G.t), 'les souffles avant le gros bruit');
  // le temps du corps avance par pas bornés (dtMax) : en rendu logiciel, une image lente l'étire par rapport à l'horloge du journal ;
  // on vérifie l'ordre (la chute après le gros bruit, rien entre les deux) et on rapporte l'écart
  verifier(G && ch && ch.t >= G.t + G.duree - 0.3 && !B.some(b => b.t > G.t), `la chose tombe après le gros bruit, rien entre : chute à +${ch && ch.t} s (fin du bruit +${G && (G.t + G.duree).toFixed(2)} s, horloge murale)`);
  const pendant = G ? P.filter(p => p.t > G.t && p.t < G.t + G.duree) : [];
  verifier(pendant.every(p => J.some(e => e.voix_differee_s && Math.abs(e.t - p.t) < 0.2)), `aucune pensée dite pendant le gros bruit (${pendant.length} affichée(s), voix différée)`);
}
await vueLibre(idE, 'énorme');
await capture('3-enorme', 'l\'énorme crotte, entière');

// 4. « fais comme un bonhomme de neige avec » : il va chercher bâtons et cailloux, ramasse (la main), revient, façonne, cadre en pied
const tVoix4 = await page.evaluate(() => performance.now() / 1000);
await dire(PH[3]);
await quand(() => balade.corps().file.includes('marcher') && balade.lieuCherche());
await attendre(2500);
const lieu = await page.evaluate(() => balade.lieuCherche());
console.log(sec(), 'il va chercher', JSON.stringify(lieu));
await capture('4-depart', 'il part chercher (' + (lieu && lieu.ou) + ')');
await page.evaluate(() => balade.pauseQuand('ramasser', 0.5));     // figé quand la main est au sol
await quand(() => balade.enPause());
const o4 = await objet(idE);
verifier(o4 && o4.m > 2.5, `il s'est éloigné pour chercher : ${o4 && o4.m} m`);
verifier((await page.evaluate(() => balade.faconnage().mains)) === 3, 'une main ramasse');
await capture('5-ramassage', 'il ramasse : la main au sol');
await quand(() => balade.faconnage().file.some(f => f.i >= 0 && f.total > 0));
const ram = await page.evaluate(() => balade.objets().find(o => /ramass/.test(o.nom || '')));
verifier(ram, 'ce qu\'il a rapporté est posé près de la crotte : ' + (ram && ram.nom));
const geste = await page.evaluate(() => balade.faconnage().file[0]);
verifier(geste.total >= 8 && geste.total <= 12.5 && geste.n >= 8, `geste continu : ${geste.total} s, ${geste.n} transitions`);
// la planche : PLANCHE images réparties sur le geste, le corps figé à chaque fois (l'image s'affine), les mains dans le champ
const NP = +(process.env.PLANCHE || 14), PP = +(process.env.PASSES_PLANCHE || 4), planche = [];
for (let k = 0; k < NP; k++) {
  const tc = geste.total * (k + 0.5) / NP;
  await page.evaluate(t => balade.pauseQuand('faconner', t), tc);   // figé à cet instant précis du geste
  await quand(() => balade.enPause() || !balade.faconnage().file.length);
  const f = await page.evaluate(() => balade.faconnage());
  if (!f.file.length) break;
  await page.evaluate(([p, g]) => { balade.pause(true); balade.grains(g); balade.resolution(p); }, [Math.round(+pxCapture / 2), GRAINS]);
  await page.waitForFunction(n => window.__state.n >= n, PP, { timeout: 400000 }).catch(() => {});
  const url = await lireCanevas(), nom = `6-faconnage-${String(k + 1).padStart(2, '0')}`;
  writeFileSync(join(out, nom + '.jpg'), Buffer.from(url.split(',')[1], 'base64'));
  planche.push({ nom, t: f.file[0].t, geste: f.file[0].geste, mains: f.mains });
  console.log(sec(), 'planche', nom, `t ${f.file[0].t} s`, f.file[0].geste, 'mains', f.mains);
  await page.evaluate(([p, g]) => { balade.grains(g); balade.resolution(p); balade.pause(false); }, [+px, GESTES]);
}
verifier(planche.length >= 12, `planche du façonnage : ${planche.length} images`);
verifier(planche.filter(p => p.mains === 6).length >= planche.length - 1, 'les deux mains dans le champ pendant le geste');
verifier(new Set(planche.map(p => p.geste)).size >= 5, 'gestes vus : ' + [...new Set(planche.map(p => p.geste))].join(', '));
writeFileSync(join(out, 'planche.html'), `<!doctype html><meta charset=utf-8><style>body{margin:0;background:#111;color:#ddd;font:12px sans-serif;display:grid;grid-template-columns:repeat(${PC ? 4 : 7},1fr);gap:4px;padding:4px}img{width:100%;display:block}</style>`
  + planche.map(p => `<figure style="margin:0"><img src="${p.nom}.jpg"><figcaption>${p.t.toFixed(1)} s · ${p.geste}</figcaption></figure>`).join(''));
{ const b2 = await browser.newPage({ viewport: { width: PC ? 1600 : 1400, height: 600 } }); await b2.goto('file://' + join(out, 'planche.html'));
  await b2.waitForTimeout(500); await b2.screenshot({ path: join(out, 'planche.png'), fullPage: true }); await b2.close(); }
await auRepos();
const b = await page.evaluate(i => balade.objets().find(o => o.id === i), idE), ob = await objet(idE), cb = await corps();
verifier(b && /bonhomme/.test(b.nom) && b.formes === 8, `bonhomme fait avec l'énorme (${idE}) : ${b && b.nom}, ${b && b.formes} formes`);
verifier(ob && ob.haut >= 0.75 && ob.haut <= 1.25, `environ un mètre de haut : ${ob && ob.haut} m`);
verifier(!(await page.evaluate(() => balade.objets().some(o => /ramass/.test(o.nom || '')))), 'ce qu\'il a ramassé a servi (retiré)');
verifier((await page.evaluate(() => balade.faconnage().mains)) === 0, 'les mains ne sont plus dans le champ');
const enPied = await page.evaluate(([t, h, m, y, z]) => MENEUR.tientDansImage(t, h, m, y, z, innerWidth / innerHeight), [ob.taille, ob.haut, ob.m, 1.36 * cb.haut, cb.zoom]);
verifier(ob && Math.abs(ob.angle) < 10 && enPied, `bonhomme cadré en pied, entier : ${ob && ob.m} m, ${ob && ob.angle}°`);
await vueLibre(idE, 'bonhomme');
await capture('8-bonhomme', 'le bonhomme fini, cadré en pied');

{ // §22 : le dégoût (et la nausée) du bonhomme fait avec l'énorme : le journal des pensées et leurs instants, depuis la phrase
  const P = (await page.evaluate(() => window.balPensees)).filter(p => p.t >= tVoix4).map(p => ({ t: +(p.t - tVoix4).toFixed(1), source: p.source, phase: p.phase, texte: p.texte }));
  writeFileSync(join(out, 'pensees-bonhomme.json'), JSON.stringify(P, null, 1));
  for (const p of P) console.log('   ', String(p.t).padStart(6), p.source + (p.phase ? '/' + p.phase : ''), '«', p.texte, '»');
  const sons = await page.evaluate(() => window.balSons || []), ev2 = await page.evaluate(() => balade.trace().evenements.filter(e => /degout/.test(e.type)));
  console.log(sec(), 'dégoût', JSON.stringify(ev2), 'sons', JSON.stringify(sons.map(x => x.evenement)));
  verifier(P.some(p => p.source === 'degout' && p.phase === 'contact'), 'une pensée de dégoût au premier contact');
  verifier(P.some(p => p.source === 'nausee'), 'l\'énorme : la nausée');
  verifier(ev2.some(e => e.type === 'degout_fin'), 'la réaction finale, dégoût et fierté');
}
const ev = (await page.evaluate(() => balade.trace().evenements)).filter(e => /modele|faconnage|objet_|cadrage|docile|consomme/.test(e.type));
console.log(sec(), 'événements', JSON.stringify(ev.map(e => e.type + (e.id ? ':' + e.id : '') + (e.raison ? ' (' + e.raison + ')' : ''))));
writeFileSync(join(out, 'trace.json'), JSON.stringify(await page.evaluate(() => balade.trace())));

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

// 6. la boule blanche (§17.1) : le corps posé juste devant un élément de semis (éclat de grès, branche morte), dos à lui ; « fais une
// petite crotte » : elle tomberait dessus ; elle glisse à côté, et le cadrage voit la crotte, pas l'éclat
if (!process.env.SANS_SEMIS) {
  const ici = await page.evaluate(() => {
    const c = balade.corps(); let best = null;
    for (let i = -40; i <= 40; i++) for (let j = -40; j <= 40; j++) { const x = c.x + i * 0.15, z = c.z + j * 0.15, y = balade.sol(x, z).hauteur;
      if (balade.semis(x, y + 0.03, z) < 0 && balade.obstacles().every(o => Math.hypot(o.x - x, o.z - z) > o.r + 1.2)) { const m = Math.hypot(i, j); if (!best || m < best.m) best = { x, z, m }; } }
    return best;
  });
  if (!ici) verifier(false, 'aucun élément de semis trouvé autour');
  else {
    // le corps à 0,3 m de l'élément, dos tourné (ce qui tombe « dessous » tombe derrière les talons, donc dessus)
    const a = Math.random() * 6.28, bx = ici.x + Math.sin(a) * 0.32, bz = ici.z + Math.cos(a) * 0.32;
    await page.evaluate(([x, z, y]) => balade.placer(x, z, y), [bx, bz, a]);
    await attendre(1000);
    const avant = await page.evaluate(() => balade.objets().map(o => o.id));
    console.log(sec(), 'élément de semis en', ici.x.toFixed(2), ici.z.toFixed(2), '; corps dos à lui, à 0,32 m');
    await dire(PH[0]);
    await quand(a => balade.objets().some(o => /^fab-/.test(o.id) && !a.includes(o.id)), avant);
    await auRepos();
    const idS = await page.evaluate(a => balade.objets().map(o => o.id).find(i => /^fab-/.test(i) && !a.includes(i)), avant);
    const oS = await page.evaluate(i => { const o = balade.objets().find(x => x.id === i); return o; }, idS), pS = await objet(idS);
    const dans = await page.evaluate(([x, z, t]) => balade.semisSous(x, z, t / 2, t / 2), [oS.x, oS.z, pS.taille]);
    verifier(!dans, `posée hors de l'élément de semis (${Math.hypot(oS.x - ici.x, oS.z - ici.z).toFixed(2)} m de lui)`);
    await vueLibre(idS, 'à côté d\'un élément de semis');
    await capture('13-semis', 'posée à côté d\'un élément de semis, cadrée sans rien devant');
  }
}

await page.click('#journal').catch(() => {});
writeFileSync(join(out, 'journal.txt'), await page.textContent('#mesure-txt').catch(() => ''));
writeFileSync(join(out, 'captures.json'), JSON.stringify(captures, null, 1));
await browser.close();
console.log(JSON.stringify({ echecs: verifs.filter(v => !v.ok).map(v => v.quoi), ok: verifs.filter(v => v.ok).length, total: verifs.length, erreurs }));
if (verifs.some(v => !v.ok) || erreurs.length) process.exit(1);
