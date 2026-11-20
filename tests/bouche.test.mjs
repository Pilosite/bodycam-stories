// « Après la première crotte elle veut pas avancer de 5 m, elle dit que c'est bouché » (docs/meneur-de-jeu.md §18). Le monde
// de papier de la scène 09 (graine 4821) : troncs, blocs de grès, branches mortes couchées et éclats de grès semés autour du
// sentier ; la petite crotte posée derrière les talons puis cadrée de près ; « avance de 5 mètres », « recule », « va vers
// l'arbre », « reviens », « fais demi-tour et avance », après une petite, une énorme, le bonhomme ; 30 m libres le long du sentier.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { creerMeneur, histoireLibre, planMarche, texteMarche, enjambable, planTrajetSouple, envergure, REGLAGES } from '../src/meneur.js';
import { mondePapier, lexiqueTest, MODELES } from './outils.mjs';

const flush = () => new Promise(r => setImmediate(r));
const FICHE = JSON.parse(readFileSync(new URL('../scenes/09-champcueil-aube.json', import.meta.url), 'utf8'));
const LIBRE = histoireLibre(Object.assign({}, FICHE, { objets: [] }));
const voixDe = c => { const m = /La voix dit : (".*")\s*$/m.exec(c); return m ? JSON.parse(m[1]) : null; };

/* La forêt de la fiche 09 en papier, tirée de sa graine : le sentier est droit (x = 0), troncs sur une grille de 6 m, blocs
   sur 8,5 m (hors du sentier, comme arbreA et blocGres), branches mortes de 2,2 m (des cercles bas en chapelet) et éclats de
   grès sur leurs cellules, jusque sur le sentier pour les éclats. */
function rng(graine) { let a = graine >>> 0 || 1; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), a | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function foret09(graine = FICHE.graine) {
  const r = rng(graine), arbres = [], rochers = [], semis = [];
  for (let i = -6; i <= 6; i++) for (let j = -4; j <= 14; j++) {
    if (r() > FICHE.foret.densite) continue;
    const x = (i + 0.5) * 6 + (r() - 0.5) * 3.8, z = (j + 0.5) * 6 + (r() - 0.5) * 3.8;
    if (Math.abs(x) < 1.5) continue; arbres.push({ x, z, haut: 14, rayon: (0.16 + 0.17 * r()) * 1.3 }); }
  for (let i = -4; i <= 4; i++) for (let j = -3; j <= 10; j++) {
    if (r() > 0.45) continue;
    const R = 0.7 + 1.6 * r() * r(), x = (i + 0.5) * 8.5 + (r() - 0.5) * 2 * (4.25 - 0.3 - 1.25 * R), z = (j + 0.5) * 8.5 + (r() - 0.5) * 2 * (4.25 - 0.3 - 1.25 * R);
    if (Math.abs(x) < R * 1.1 + 0.5) continue; rochers.push({ x, z, haut: R * 0.9, rayon: R * 1.1 }); }
  for (let i = -8; i <= 8; i++) for (let j = -4; j <= 22; j++) {                // branches mortes : cellules de 4,5 m, hors du sentier (1,2 m)
    if (r() > 0.45) continue;
    const k = 0.6 + 0.7 * r(), L = 2.2 * k, a = r() * Math.PI, x = (i + 0.5) * 4.5 + (r() - 0.5) * 2, z = (j + 0.5) * 4.5 + (r() - 0.5) * 2;
    if (Math.abs(x) < 1.2 + L / 2) continue;
    for (let s = -2; s <= 2; s++) semis.push({ x: x + Math.cos(a) * s * L / 4, z: z + Math.sin(a) * s * L / 4, r: 0.07 * k, haut: 0.1 * k }); }
  for (let i = -20; i <= 20; i++) for (let j = -10; j <= 50; j++) {             // éclats de grès : cellules de 2 m, partout
    if (r() > 0.32) continue;
    const k = 0.6 + 0.8 * r(); semis.push({ x: (i + 0.5) * 2 + (r() - 0.5) * 1.2, z: (j + 0.5) * 2 + (r() - 0.5) * 1.2, r: 0.15 * k, haut: 0.1 * k }); }
  return { arbres, rochers, semis };
}
const FORET = foret09();

/* Le Claude simulé : il fait ce qu'on dit (la crotte « dessous », accroupi ; la marche telle que demandée). */
function claude() {
  const sas = { verdict: 'recevable', regle: null, motif: '' }, accroupi = [{ type: 'posture', hauteur: 0.45 }, { type: 'attendre', secondes: 2 }, { type: 'posture', hauteur: 1 }];
  return c => {
    if (/accessoiriste/.test(c)) return Promise.resolve({ objet: null, suite: null });
    const v = (voixDe(c) || '').toLowerCase(), n = +((v.match(/(\d+)/) || [])[1] || 4);
    if (!v) return Promise.resolve({ pensee: 'Hm.', attitude: 'initiative' });
    if (/énorme/.test(v)) return Promise.resolve({ sas, pensee: 'Énorme. Bon.', attitude: 'suit', actions: accroupi, fabrique: { nom: 'crotte énorme', quoi: 'une énorme crotte', ou: 'dessous' } });
    if (/crotte/.test(v)) return Promise.resolve({ sas, pensee: 'Sérieux ? Bon.', attitude: 'suit', actions: accroupi, fabrique: { nom: 'petite crotte', quoi: 'une petite crotte', ou: 'dessous' } });
    if (/montre/.test(v)) { const id = [...c.matchAll(/\((fab-\d+)\)/g)].map(m => m[1]).pop(); return Promise.resolve({ sas, pensee: 'Regarde.', attitude: 'suit', actions: [{ type: 'cadrer', objet: id }] }); }
    if (/demi-tour/.test(v)) return Promise.resolve({ sas, pensee: 'Demi-tour.', attitude: 'suit', actions: [{ type: 'tourner', degres: 180 }, { type: 'marcher', metres: n }] });
    if (/reviens/.test(v)) return Promise.resolve({ sas, pensee: 'Je reviens.', attitude: 'suit', actions: [{ type: 'tourner', degres: 180 }, { type: 'marcher', metres: 4 }] });
    if (/recule/.test(v)) return Promise.resolve({ sas, pensee: 'Je recule.', attitude: 'suit', actions: [{ type: 'marcher', metres: -n }] });
    if (/arbre/.test(v)) return Promise.resolve({ sas, pensee: 'L\'arbre.', attitude: 'suit', actions: [{ type: 'rejoindre', objet: 'arbre' }] });
    if (/avance/.test(v)) return Promise.resolve({ sas, pensee: 'J\'y vais.', attitude: 'suit', actions: [{ type: 'marcher', metres: n }] });
    return Promise.resolve({ sas, pensee: 'Hm.', attitude: 'suit', actions: [] });
  };
}
function partie(foret = FORET) {
  const monde = mondePapier(LIBRE, Object.assign({ flaner: false, graine: FICHE.graine }, foret));
  const m = creerMeneur({ histoire: LIBRE, demander: claude(), secours: lexiqueTest, graine: FICHE.graine, modeles: MODELES, emettre: o => monde.executer(o) });
  const avancer = async s => { for (let t = 0; t < s; t += 0.25) { m.tic(0.25, monde.perception()); monde.step(0.25); await flush(); } };
  const dire = async (t, s = 20) => { const n0 = monde.marches.length; await m.voix(t); await flush(); await flush(); await avancer(s); return monde.marches.slice(n0); };
  return { m, monde, avancer, dire };
}
const fab = (monde, k) => monde.objets.filter(o => /^fab-/.test(o.id)).sort((a, b) => +a.id.slice(4) - +b.id.slice(4))[k === undefined ? monde.objets.filter(o => /^fab-/.test(o.id)).length - 1 : k];
const surChemin = (monde, o, depuis) => Math.min(...monde.chemin.slice(depuis).map(p => Math.hypot(p.x - o.x, p.z - o.z)));
const tailleDe = o => envergure(o.formesL) * (o.echelle || 1);

/* ------------------------------------------------------------------ la cause, reproduite */
test('la cause : la crotte cadrée de près est un obstacle à moins de sa marge ; tout droit, le corps est repoussé sur place (avant §18)', async () => {
  const { monde, dire } = partie();
  await dire('fais une petite crotte', 16);
  await dire('montre-la-moi', 12);
  const o = fab(monde), d = Math.hypot(o.x - monde.x, o.z - monde.z), t = tailleDe(o);
  let ang = (Math.atan2(o.x - monde.x, o.z - monde.z) - monde.yaw) * 180 / Math.PI; ang = ((ang % 360) + 540) % 360 - 180;
  assert.ok(d < 1 && Math.abs(ang) < 15 && t < 0.2, `il lui fait face, de près : ${d.toFixed(2)} m, ${ang.toFixed(0)}°, ${t.toFixed(2)} m`);
  assert.ok(d < t / 2 + REGLAGES.MARGE_CORPS + 0.15, 'il est dans (ou au bord de) la marge du corps autour d\'elle');
  // l'ancienne marche (moveBy d'avant) : tout droit, repoussé à la marge de chaque obstacle connu
  let x = monde.x, z = monde.z;
  for (let k = 0; k < 40; k++) { let nx = x + Math.sin(monde.yaw) * 0.125, nz = z + Math.cos(monde.yaw) * 0.125;
    const R = t / 2 + REGLAGES.MARGE_CORPS, ex = nx - o.x, ez = nz - o.z, mm = Math.hypot(ex, ez);
    if (mm < R && Math.hypot(x - o.x, z - o.z) >= R - 1e-3) { nx = o.x + ex / mm * R; nz = o.z + ez / mm * R; }
    x = nx; z = nz; }
  assert.ok(Math.hypot(x - monde.x, z - monde.z) < 1, 'avant : coincé contre la crotte (moins d\'un mètre en 5 m de marche), d\'où « c\'est bouché »');
  assert.ok(enjambable({ r: t / 2, haut: 0.08 }), 'une petite crotte s\'enjambe');
});

/* ------------------------------------------------------------------ « avance de 5 mètres » après la petite crotte */
test('après la petite crotte cadrée : « avance de 5 mètres » le fait, debout, sans zoom, sans marcher dedans', async () => {
  const { monde, dire } = partie();
  await dire('fais une petite crotte', 16); await dire('montre-la-moi', 12);
  const o = fab(monde), x0 = monde.x, z0 = monde.z, i0 = monde.chemin.length;
  assert.ok(monde.haut < 0.95 || monde.zoom > 1, 'précondition : il est en état de cadrage (accroupi ou zoomé)');
  const [mar] = await dire('avance de 5 mètres');
  assert.ok(mar, 'une marche a eu lieu');
  assert.ok(Math.abs(mar.fait - 5) < 0.75, '5 m : ' + mar.fait.toFixed(2));
  assert.equal(mar.texte, null, 'il ne dit rien de bouché');
  assert.ok(monde.haut === 1 && monde.zoom === 1, 'debout, dézoomé');
  assert.ok(surChemin(monde, o, i0) >= tailleDe(o) / 2 + 0.05, 'il ne marche pas dedans : ' + surChemin(monde, o, i0).toFixed(2));
  assert.ok(Math.hypot(monde.x - x0, monde.z - z0) > 4.2);
});

test('après la petite crotte : reculer, « va vers l\'arbre », « reviens », « fais demi-tour et avance » ; rien n\'est bouché', async () => {
  for (const [phrase, att] of [['recule de 3 mètres', 3], ['va vers l\'arbre', null], ['reviens', 4], ['fais demi-tour et avance de 6 mètres', 6]]) {
    const { monde, dire } = partie();
    await dire('fais une petite crotte', 16); await dire('montre-la-moi', 12);
    const x0 = monde.x, z0 = monde.z, n0 = monde.bloques.length, mar = await dire(phrase, 25);
    assert.equal(monde.bloques.length, n0, phrase + ' : jamais bloqué');
    if (att) { assert.ok(mar.length === 1 && Math.abs(mar[0].fait - att) < 0.75 && !mar[0].texte, phrase + ' : ' + JSON.stringify(mar.map(q => [q.fait, q.texte]))); }
    else assert.ok(Math.hypot(monde.x - x0, monde.z - z0) > 1 || monde.perception().supports.find(s => s.id === 'arbre').m < 1.5, phrase + ' : il y va');
    assert.ok(monde.marge >= REGLAGES.MARGE_CORPS - 0.02, phrase + ' : jamais dans un tronc ni un rocher : ' + monde.marge.toFixed(2));
  }
});

test('après l\'énorme (81 cm) : il la contourne à la marge du corps, et fait ses 5 m', async () => {
  const { monde, dire } = partie();
  await dire('fais une énorme crotte', 16); await dire('montre-la-moi', 14);
  const o = fab(monde), t = tailleDe(o), i0 = monde.chemin.length;
  assert.ok(t > 0.7 && !enjambable({ r: t / 2, haut: 0.5 }), 'énorme : ' + t.toFixed(2));
  const [mar] = await dire('avance de 5 mètres');
  assert.ok(mar && Math.abs(mar.fait - 5) < 0.75 && !mar.texte, JSON.stringify(mar && [mar.fait, mar.texte]));
  assert.ok(surChemin(monde, o, i0) >= t / 2 + REGLAGES.MARGE_CORPS - 0.03, 'jamais dedans : ' + surChemin(monde, o, i0).toFixed(2));
});

test('après le bonhomme : « avance de 5 mètres » le contourne et avance', async () => {
  const { monde, dire } = partie();
  await dire('fais une petite crotte', 16); await dire('montre-la-moi', 12);
  // le bonhomme fini, posé juste devant lui (un mètre de haut, 60 cm de large)
  const B = MODELES.modeles['bonhomme de neige'] || Object.values(MODELES.modeles).find(m => /bonhomme/.test(m.nom || ''));
  const o = fab(monde); o.formesL = B.formes; o.nom = 'bonhomme'; const t = tailleDe(o);
  o.x = monde.x + Math.sin(monde.yaw) * (t / 2 + 0.6); o.z = monde.z + Math.cos(monde.yaw) * (t / 2 + 0.6);
  const i0 = monde.chemin.length, [mar] = await dire('avance de 5 mètres');
  assert.ok(mar && Math.abs(mar.fait - 5) < 0.75 && !mar.texte, JSON.stringify(mar && [mar.fait, mar.texte]));
  assert.ok(surChemin(monde, o, i0) >= t / 2 + REGLAGES.MARGE_CORPS - 0.03, 'il le contourne : ' + surChemin(monde, o, i0).toFixed(2));
});

test('la fiche 09 en papier : 30 m libres le long du sentier, branches et éclats enjambés, jamais bloqué', async () => {
  assert.ok(FORET.semis.length > 300 && FORET.semis.every(s => enjambable(s)), 'les éléments de semis sont bas : ils s\'enjambent');
  const { monde, dire } = partie();
  const z0 = monde.z, [mar] = await dire('avance de 30 mètres', 35);
  assert.ok(mar && mar.fait > 29 && !mar.texte, JSON.stringify(mar && [mar.fait, mar.texte]));
  assert.ok(monde.z - z0 > 28 && Math.abs(monde.x) < 1.5, 'le long du sentier : ' + monde.x.toFixed(2) + ', ' + monde.z.toFixed(2));
  // à travers bois aussi (branches au sol, éclats) : il fait ce qu'il peut, ne dit « bouché » que s'il ne peut pas faire un mètre
  for (const deg of [60, -60, 90, -90]) {
    const p2 = partie(); await p2.avancer(1); p2.monde.yaw = deg * Math.PI / 180;
    const [q] = await p2.dire('avance de 10 mètres', 20);
    assert.ok(q && (q.fait > 8.4 || (q.fait >= 1 && /J'ai fait/.test(q.texte))), deg + '° : ' + JSON.stringify(q && [q.fait, q.texte]));
    assert.ok(p2.monde.marge >= REGLAGES.MARGE_CORPS - 0.02, 'jamais dans un tronc ni un rocher');
  }
});

/* ------------------------------------------------------------------ planMarche, pur */
test('planMarche : ce qui est bas ne bloque jamais ; un mur continu : il fait ce qu\'il peut et le dit ; « bouché » seulement s\'il est muré', () => {
  const c = { x: 0, z: 0, yaw: 0 };
  // une branche couchée en travers (chapelet de cercles bas) et des éclats : enjambés
  const branche = Array.from({ length: 9 }, (_, i) => ({ id: 'b' + i, x: -2 + i * 0.5, z: 2, r: 0.07, haut: 0.1 }));
  const p1 = planMarche(c, 5, branche);
  assert.ok(p1.fait >= 4.9 && !p1.bloque && texteMarche(p1) === null, JSON.stringify(p1));
  // départ collé à une petite chose (dans la marge du corps) : il part quand même, et l'évite d'un pas
  const crotte = { id: 'fab-1', nom: 'petite crotte', x: 0, z: 0.45, r: 0.07, haut: 0.08 };
  const p2 = planMarche(c, 5, [crotte]);
  assert.ok(p2.fait >= 4.9 && !p2.enjambe, JSON.stringify(p2));
  const seg = (a, b, q) => { const dx = b.x - a.x, dz = b.z - a.z, L2 = dx * dx + dz * dz || 1e-9, t = Math.max(0, Math.min(1, ((q.x - a.x) * dx + (q.z - a.z) * dz) / L2)); return Math.hypot(a.x + t * dx - q.x, a.z + t * dz - q.z); };
  const mini = (pts, q) => { let m = 9, a = c; for (const b of pts) { m = Math.min(m, seg(a, b, q)); a = b; } return m; };
  assert.ok(mini(p2.points, crotte) >= crotte.r + REGLAGES.MARGE_PIEDS - 0.01, 'à côté de la crotte, pas dessus');
  // un rocher droit devant : contourné, 5 m faits
  const p3 = planMarche(c, 5, [{ id: 'r', nom: 'un rocher', x: 0.2, z: 2.5, r: 0.9, haut: 1 }]);
  assert.ok(p3.fait >= 4.25 && texteMarche(p3) === null, JSON.stringify(p3));
  // un mur continu à 3,5 m sur ±70° : trois mètres, et il le dit
  const mur = []; for (let a = -80; a <= 80; a += 4) { const r = 3.5 / Math.cos(a * Math.PI / 180); mur.push({ id: 'm' + a, nom: 'le rocher', x: Math.sin(a * Math.PI / 180) * Math.min(r, 12), z: 3.5 + 0.6, r: 0.6, haut: 2 }); }
  const p4 = planMarche(c, 8, mur);
  assert.ok(p4.fait >= 2.5 && p4.fait <= 3.2 && !p4.bouche, JSON.stringify([p4.fait, p4.bloque]));
  assert.match(texteMarche(p4, 'le rocher'), /^J'ai fait trois mètres, après c'est le rocher\.$/);
  // muré devant sur ±70° à 0,6 m : « bouché » ; en arrière, il recule
  const cage = []; for (let a = -90; a <= 90; a += 10) cage.push({ id: 'c' + a, x: Math.sin(a * Math.PI / 180) * 1.3, z: Math.cos(a * Math.PI / 180) * 1.3, r: 0.4, haut: 2 });
  const p5 = planMarche(c, 5, cage);
  assert.ok(p5.bouche && /bouché/.test(texteMarche(p5)), JSON.stringify(p5));
  const p6 = planMarche(c, -3, cage);
  assert.ok(p6.recul && p6.fait >= 2.9 && p6.points[p6.points.length - 1].z < -2.9, 'il recule : ' + JSON.stringify(p6));
  // le trajet vers un point (rejoindre) : une petite chose ne l'arrête pas, une grosse si
  const q1 = planTrajetSouple(c, { x: 0, z: 4 }, [{ id: 'x', x: 0, z: 4, r: 0.07, haut: 0.08 }]);
  assert.ok(!q1.bloque, JSON.stringify(q1));
});
