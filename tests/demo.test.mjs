// La démonstration (docs/meneur-de-jeu.md §15 et §16) : « fais une crotte », « fais une crotte de 5 kg », « va chercher des
// bâtons et des cailloux et fais-en un bonhomme de neige ». La bibliothèque de modèles de référence (src/modeles.json),
// l'échelle par la masse, la séquence « aller chercher, revenir, façonner » jouée dans le monde de papier avec un Claude
// simulé (et sans Claude), et le trajet du corps qui ne traverse jamais rien. Sans navigateur.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { creerMeneur, histoireLibre, envergure, modeleDe, formesModele, formesTransformees, etapesFaconnage, volumeFormes, ramassage,
  planTrajet, lieuChercher, secoursChercher, horsDuCorps, placeLibre, consigneAtelier, normaliserHistoire, creerPartie, compacter, rejouer, planCadrage, REGLAGES } from '../src/meneur.js';
import { mondePapier, lexiqueTest, MODELES } from './outils.mjs';

const MATIERES = JSON.parse(readFileSync(new URL('../src/matieres.json', import.meta.url), 'utf8'));
const flush = () => new Promise(r => setImmediate(r));
const FORET = { id: 'foret-test', titre: 'Forêt de grès', kit: 'foret', objets: [] };
const LIBRE = histoireLibre(FORET);
const voixDe = c => { const m = /La voix dit : (".*")\s*$/m.exec(c); return m ? JSON.parse(m[1]) : null; };
const ARBRES = [{ x: -2.6, z: 6, haut: 14, rayon: 0.3 }], ROCHERS = [{ x: 5, z: 14, haut: 1.4, rayon: 1.1 }];
const haut = F => Math.max(...F.map(f => f.p[1] + f.taille[1] / 2));
const MODELE = id => MODELES.modeles[id];

/* ------------------------------------------------------------------ la bibliothèque */
test('bibliothèque : des données valides, des matières qui existent, aucun nom connu du moteur', () => {
  const internes = ['mat', 'bois', 'pierre', 'metal', 'verre', 'pelage', 'tissu', 'tuile', 'lumineux', '@'];
  for (const [id, m] of Object.entries(MODELES.modeles)) {
    assert.ok(Array.isArray(m.mots) && m.mots.length && m.nom, id + ' : mots et nom');
    assert.ok(m.formes.length >= 1 && m.formes.length <= REGLAGES.FORMES_PAR_OBJET, id + ' : formes');
    for (const f of m.formes) {
      assert.ok(internes.includes(f.matiere) || MATIERES.recettes[f.matiere], `${id} : matière ${f.matiere}`);
      assert.ok(!(f.matiere === '@') || m.transforme, `${id} : "@" seulement dans un modèle qui transforme`);
    }
  }
  // ni le moteur (shaders, page) ni le meneur ne nomment un modèle (le lexique des mondes décrits parle de rochers, pas d'objets)
  const code = ['src/main.js', 'src/meneur.js', 'src/shaders/monde.glsl', 'src/shaders/recette.glsl', 'src/shaders/v3_proches.frag', 'src/shaders/v3_ombrage.frag']
    .map(f => readFileSync(new URL('../' + f, import.meta.url), 'utf8')).join('\n').split('\n').filter(l => !/rochers=|SECOURS|EN_MAIN|pensee: |mots:|nom: '|quoi: '|crotte|\/\/|\/\*|\*\/|^\s*\*/.test(l)).join('\n');
  for (const id of ['bonhomme', 'caillou', 'baton']) assert.ok(!new RegExp('\\b' + id + '\\b').test(code), `le code ne connaît pas « ${id} »`);
  assert.equal(modeleDe(MODELES, 'fais une crotte sur le chemin').id, 'crotte');
  assert.equal(modeleDe(MODELES, 'fais-en un bonhomme de neige', { transforme: true }).id, 'bonhomme');
  assert.equal(modeleDe(MODELES, 'fais-en un bonhomme de neige'), null, 'un modèle qui transforme ne se fabrique pas de rien');
  assert.equal(modeleDe(MODELES, 'allume un feu'), null);
});

test('échelle : une crotte normale fait 12 à 18 cm ; « de 5 kg » 55 à 60 cm (volume réel × exagere du modèle), « énorme » 80 cm, 20 kg plus, au plus 1,2 m', () => {
  const m = MODELE('crotte');
  const n = formesModele(m, 'fais une crotte'), g = formesModele(m, 'fais une crotte de 5 kg'), p = formesModele(m, 'une petite crotte');
  assert.ok(n.envergure >= 0.12 && n.envergure <= 0.18, 'normale : ' + n.envergure);
  assert.ok(g.envergure >= 0.55 && g.envergure <= 0.6, '5 kg : ' + g.envergure + ' (' + g.raison + ')');
  const V = volumeFormes(g.formes) * 1000, ex = m.echelle.exagere;
  assert.ok(V / ex ** 3 > 4.3 && V / ex ** 3 < 5.2, 'volume réel de 5 kg avant exagération : ' + (V / ex ** 3).toFixed(2) + ' L');
  const e = formesModele(m, 'une énorme crotte').envergure, v20 = formesModele(m, 'une crotte de 20 kg').envergure;
  assert.ok(e >= 0.75 && e <= 0.85, 'énorme : ' + e);
  assert.ok(v20 > e && v20 <= 1.2, '20 kg : ' + v20);
  assert.equal(formesModele(m, 'une crotte de 200 kg').envergure, 1.2);
  assert.ok(Math.abs(haut(g.formes) / envergure(g.formes) - haut(n.formes) / envergure(n.formes)) < 0.01, 'mêmes proportions');
  const bas = Math.min(...g.formes.map(f => f.p[1] - f.taille[1] / 2));
  assert.ok(bas <= 0.005 && bas > -0.03, 'posée au sol, un peu tassée : ' + bas);
  assert.ok(p.envergure < n.envergure, 'petite : ' + p.envergure);
  assert.ok(formesModele(m, 'une crotte de 500 kg').envergure <= m.echelle.max_m + 1e-9, 'bornée par le modèle');
});

test('bonhomme : la matière de la chose, à volume égal, trois boules, deux bras, deux yeux clairs et assez gros', () => {
  const g = formesModele(MODELE('crotte'), 'crotte de 5 kg').formes, t = formesTransformees(MODELE('bonhomme'), g);
  const F = t.formes, boules = F.filter(f => f.matiere === 'pate-organique'), bras = F.filter(f => f.matiere === 'bois'), yeux = F.filter(f => f.matiere === 'gres');
  assert.equal(boules.length, 3); assert.equal(bras.length, 2); assert.equal(yeux.length, 2);
  const V0 = volumeFormes(g), V1 = volumeFormes(boules);
  assert.ok(Math.abs(V1 / V0 - 1) < 0.08, `volume gardé : ${(V0 * 1000).toFixed(2)} L → ${(V1 * 1000).toFixed(2)} L`);
  const tete = boules.reduce((a, b) => b.p[1] > a.p[1] ? b : a);
  assert.ok(yeux.every(y => y.taille[0] >= 0.2 * tete.taille[0]), 'un œil fait au moins le cinquième de la tête');
  assert.ok(yeux.every(y => y.p[2] > tete.p[2] + tete.taille[2] * 0.35), 'les yeux sont sur le devant de la tête (+z)');
  const lum = c => parseInt(c.slice(1, 3), 16) + parseInt(c.slice(3, 5), 16) + parseInt(c.slice(5, 7), 16);
  assert.ok(lum(yeux[0].couleur) > 2.5 * lum(tete.couleur), 'contraste des yeux sur la tête');
  const e = etapesFaconnage(g, F, REGLAGES.FACONNAGE_ETAPES);
  assert.ok(e.length >= 4 && e.length <= 5, 'états visibles : ' + e.length);
  assert.deepEqual(e[e.length - 1], F, 'le dernier état est le résultat');
  assert.ok(e.every(L => L.length <= REGLAGES.FORMES_PAR_OBJET));
  assert.ok(new Set(e.map(L => JSON.stringify(L))).size === e.length, 'chaque état change quelque chose');
});

test('ramasser : « des bâtons et des cailloux » donne de vrais petits objets ; « va chercher… » se comprend sans Claude', () => {
  const r = ramassage(MODELES, 'des bâtons et des cailloux');
  assert.ok(r.formes.some(f => f.matiere === 'bois') && r.formes.some(f => f.matiere === 'gres'));
  assert.ok(envergure(r.formes) < 0.5);
  assert.deepEqual(secoursChercher('va chercher des bâtons et des cailloux et fais-en un bonhomme de neige'), { type: 'chercher', quoi: 'des batons et des cailloux' });
  assert.equal(secoursChercher('fais une crotte'), null);
  const sup = [{ id: 'arbre', x: 3, z: 4, rayon: 0.3 }];
  const q = lieuChercher('des bâtons', { x: 0, z: 0, yaw: 0 }, sup, () => 0, 1, MODELES);
  assert.equal(q.ou, 'au pied d\'un arbre'); assert.ok(Math.hypot(q.x - 3, q.z - 4) < 1.2);
  assert.equal(lieuChercher('des cailloux', { x: 0, z: 0, yaw: 0 }, []).ou, 'au bord du chemin');
});

test('l\'accessoiriste reçoit le modèle de référence comme exemple, et le format des étapes et du ramassage', () => {
  const p = creerPartie(LIBRE);
  const c = consigneAtelier(normaliserHistoire(LIBRE), p, compacter({}), { fabrique: { nom: 'crotte', quoi: '5 kg', ou: 'dessous' }, texte: 'fais une crotte de 5 kg' }, REGLAGES, MODELES);
  assert.match(c, /MODÈLE DE RÉFÉRENCE « crotte »/); assert.match(c, /"regle":"masse"/);
  assert.ok(c.length <= REGLAGES.BUDGET_ATELIER);
  const cible = { id: 'fab-1', nom: 'crotte', formes: MODELE('crotte').formes, echelle: 1 };
  const c2 = consigneAtelier(normaliserHistoire(LIBRE), p, compacter({}), { modifie: { objet: 'fab-1', quoi: 'un bonhomme de neige', cible, faconner: true, chercher: 'des bâtons et des cailloux' }, texte: 'fais-en un bonhomme de neige' }, REGLAGES, MODELES);
  assert.match(c2, /MODÈLE DE RÉFÉRENCE « bonhomme de neige »/); assert.match(c2, /"etapes"/); assert.match(c2, /"ramasse"/);
  assert.ok(c2.length <= REGLAGES.BUDGET_ATELIER, 'budget : ' + c2.length);
});

/* ------------------------------------------------------------------ la séquence, dans le monde de papier */
function promenade(opts = {}, monde0 = {}) {
  const monde = mondePapier(LIBRE, Object.assign({ flaner: false, arbres: ARBRES, rochers: ROCHERS }, monde0)), ordres = [];
  const m = creerMeneur(Object.assign({ histoire: LIBRE, secours: lexiqueTest, graine: 3, modeles: MODELES, emettre: o => { ordres.push(o); monde.executer(o); } }, opts));
  const avancer = async s => { for (let t = 0; t < s; t += 0.5) { m.tic(0.5, monde.perception()); monde.step(0.5); await flush(); } };
  return { m, monde, ordres, avancer };
}
/* Le Claude simulé de la démo. oublie : il répond sans gestes ni objet (le mode DOCILE complète). */
function claudeDemo({ oublie = false } = {}) {
  const sas = { verdict: 'recevable', regle: null, motif: 'geste ordinaire' };
  return c => {
    if (/accessoiriste/.test(c)) {
      if (/LA CHOSE, telle qu'elle est/.test(c)) return Promise.resolve({ retouche: { nom: 'bonhomme', ajoute: [{ f: 'boule', p: [0, 2, 0], taille: [3, 3, 3], couleur: '#ffffff', matiere: 'mat' }] }, suite: null });
      return Promise.resolve({ objet: { envergure_m: 0.2, nom: 'crotte', formes: [{ f: 'boule', p: [0, 0.4, 0], taille: [1.2, 0.8, 1], couleur: '#4a3220', matiere: 'mat' }] }, suite: null });   // trois fois rien, et trop grand
    }
    const v = voixDe(c) || '', ids = [...c.matchAll(/\((fab-\d+)\)/g)].map(m => m[1]);
    if (oublie) return Promise.resolve({ sas, pensee: 'Ha. Si tu veux.', attitude: 'suit', actions: [] });
    if (/5 kg/.test(v)) return Promise.resolve({ sas, pensee: 'Cinq kilos. Rien que ça.', attitude: 'suit', actions: [{ type: 'posture', hauteur: 0.45 }, { type: 'attendre', secondes: 3 }, { type: 'posture', hauteur: 1 }], fabrique: { nom: 'crotte de 5 kg', quoi: 'une énorme crotte de 5 kg', ou: 'dessous' } });
    if (/crotte/.test(v)) return Promise.resolve({ sas, pensee: 'Sérieux ? Bon.', attitude: 'suit', actions: [{ type: 'posture', hauteur: 0.45 }, { type: 'attendre', secondes: 3 }, { type: 'posture', hauteur: 1 }], fabrique: { nom: 'crotte', quoi: 'une crotte', ou: 'dessous' } });
    if (/bonhomme/.test(v)) return Promise.resolve({ sas, pensee: 'Un bonhomme. Avec ça. D\'accord, artiste.', attitude: 'suit',
      actions: [{ type: 'chercher', quoi: 'des bâtons et des cailloux' }], modifie: { objet: ids[ids.length - 1], quoi: 'en faire un bonhomme de neige avec les bâtons et les cailloux' } });
    return Promise.resolve({ sas, pensee: 'Hm.', attitude: 'suit', actions: [] });
  };
}
async function demo(opts = {}) {
  const P = promenade(opts);
  const { m, monde, avancer } = P;
  await avancer(1);
  await m.voix('fais une crotte'); await flush(); await flush(); await avancer(14);
  const n1 = monde.objets.find(o => o.id === 'fab-1');
  monde.x += 0.2; monde.yaw += 1.2;                                 // il s'est un peu tourné
  await avancer(1);
  await m.voix('fais une crotte de 5 kg'); await flush(); await flush(); await avancer(14);
  const n2 = monde.objets.find(o => o.id === 'fab-2'), e2 = n2 ? envergure(n2.formesL) : 0, d2 = n2 ? Math.hypot(n2.x - monde.x, n2.z - monde.z) : 0;
  const avant = { x: monde.x, z: monde.z };
  await m.voix('va chercher des bâtons et des cailloux et fais-en un bonhomme de neige'); await flush(); await flush();
  let loin = 0, vuRamasse = false;
  for (let t = 0; t < 70; t += 0.5) { await avancer(0.5); loin = Math.max(loin, Math.hypot(monde.x - n2.x, monde.z - n2.z));
    vuRamasse = vuRamasse || monde.objets.some(o => /ramass/.test(o.nom || '')); }
  return Object.assign(P, { n1, n2, e2, d2, avant, loin, vuRamasse });
}
function verifierDemo({ m, monde, ordres, n1, e2, loin }, source = 'modele') {
  const ev = m.trace().evenements;
  assert.ok(envergure(n1.formesL) >= 0.12 && envergure(n1.formesL) <= 0.18, 'crotte normale : ' + envergure(n1.formesL));
  assert.ok(e2 >= 0.54 && e2 <= 0.62, 'crotte de 5 kg, grossie à l\'image (modèle : exagere) : ' + e2);
  assert.ok(n1.formesL.length > 10, 'le modèle de référence, pas trois boules');
  assert.ok(ev.filter(e => e.type === 'modele').length >= 3, 'la bibliothèque a servi trois fois');
  // il est parti chercher (au pied de l'arbre), revenu, a façonné en plusieurs états, puis cadré le résultat
  assert.ok(monde.cherche && /arbre|rocher|chemin/.test(monde.cherche.ou), 'un endroit plausible');
  assert.ok(loin > 2.5, 'il s\'est éloigné pour chercher : ' + loin.toFixed(1) + ' m');
  const f = monde.faconnes.find(x => x.id === 'fab-2');
  assert.ok(f, 'façonnage joué sur la crotte de 5 kg (la dernière trace)');
  assert.ok(f.etapes >= 4 && f.etapes <= 5, 'états : ' + f.etapes);
  assert.equal(f.vus, 1, 'ce qu\'il a ramassé est posé près d\'elle à son retour');
  assert.ok(!monde.objets.some(o => f.consomme.includes(o.id)), '... et consommé à la fin');
  assert.equal(f.consomme.length, 1, 'un tas ramassé');
  const iFac = ordres.findIndex(o => o.type === 'objet' && o.op === 'faconner');
  const ram = ordres.find(o => o.type === 'objet' && o.op === 'creer' && o.differe === 'fab-2');
  assert.ok(ram && ordres.indexOf(ram) < iFac, 'le tas ramassé est posé à son retour, avant le façonnage');
  const b = monde.objets.find(o => o.id === 'fab-2');
  assert.equal(b.formesL.filter(x => x.matiere === 'bois').length, 2, 'deux bras');
  assert.equal(b.formesL.filter(x => x.matiere === 'gres').length, 2, 'deux yeux');
  assert.ok(ev.some(e => e.type === 'objet_modifie' && e.id === 'fab-2' && e.source === source && e.etapes >= 4));
  const q = monde.perception().objets.find(x => x.id === 'fab-2'), pl = planCadrage(q.taille);
  assert.ok(Math.abs(q.angle) < 6 && Math.abs(q.m - pl.m) < 0.15, `bonhomme cadré : ${q.m.toFixed(2)} m pour ${pl.m}, ${q.angle}°`);
  assert.ok(monde.marge >= REGLAGES.MARGE_CORPS - 0.02 || monde.marge > 8, 'jamais dans un obstacle : ' + monde.marge.toFixed(2));
  assert.deepEqual(rejouer(LIBRE, m.trace(), { modeles: MODELES }), m.trace().final, 'la trace se rejoue');
}

test('démo complète avec un Claude simulé : crotte, crotte de 5 kg, aller chercher, revenir, façonner, cadrer', async () => {
  const P = await demo({ demander: claudeDemo() });
  verifierDemo(P);
  assert.ok(P.m.trace().evenements.some(e => e.type === 'faconnage' && e.chercher && e.modele === 'bonhomme'));
});

test('démo en mode DOCILE avec un Claude qui oublie tout : la page complète gestes, objets, recherche et façonnage', async () => {
  const P = await demo({ demander: claudeDemo({ oublie: true }), reglages: { DOCILE: true } });
  verifierDemo(P);
  assert.ok(P.m.trace().evenements.some(e => e.type === 'docile' && liste(e.ajoute).includes('chercher')));
});
const liste = v => Array.isArray(v) ? v : [];

test('démo sans Claude : le secours et la bibliothèque jouent toute la séquence', async () => {
  const P = await demo({});
  verifierDemo(P);
});

test('MODELES « exemple » : les formes et les étapes de Claude passent, la bibliothèque n\'est qu\'un exemple', async () => {
  const etape = [{ f: 'boule', p: [0, 0.1, 0], taille: [0.25, 0.2, 0.25], couleur: '#4a3220', matiere: 'pate-organique' }];
  const base = claudeDemo();
  const demander = (c, o) => /LA CHOSE/.test(c) ? Promise.resolve({ retouche: { nom: 'bonhomme', ajoute: [{ f: 'cylindre', p: [0.2, 0.2, 0], taille: [0.02, 0.2, 0.02], penche: [0, 50], couleur: '#5b4733', matiere: 'ecorce-chene' }] },
    etapes: [etape, etape.concat(etape.map(f => Object.assign({}, f, { p: [0, 0.3, 0] })))], suite: null }) : base(c, o);
  const P = promenade({ demander, reglages: { MODELES: 'exemple' } });
  await P.avancer(1);
  await P.m.voix('fais une crotte de 5 kg'); await flush(); await flush(); await P.avancer(14);
  await P.m.voix('va chercher des bâtons et des cailloux et fais-en un bonhomme de neige'); await flush(); await flush(); await P.avancer(60);
  const ev = P.m.trace().evenements;
  assert.ok(!ev.some(e => e.type === 'modele'), 'pas de modèle imposé');
  assert.equal(P.monde.faconnes[0].etapes, 3, 'les deux états de Claude, puis le résultat');
});

/* ------------------------------------------------------------------ le corps ne traverse rien (§16) */
const traverse = (pts, de, obs, marge) => {                       // le trajet passe-t-il à moins de « marge » d'un obstacle ?
  let a = de;
  for (const b of pts) { for (let k = 0; k <= 50; k++) { const x = a.x + (b.x - a.x) * k / 50, z = a.z + (b.z - a.z) * k / 50;
    if (obs.some(o => Math.hypot(x - o.x, z - o.z) < o.r + marge - 1e-6)) return true; } a = b; }
  return false;
};
test('trajet droit vers un rocher : contourné, la caméra garde sa marge ; cible dans le rocher : arrêt devant', () => {
  const rocher = { id: 'rocher', x: 0, z: 5, r: 1.2 };
  const p = planTrajet({ x: 0.1, z: 0 }, { x: 0, z: 10 }, [rocher]);
  assert.equal(p.bloque, null);
  assert.ok(p.points.length >= 2, 'un point de passage à côté du rocher');
  assert.ok(!traverse(p.points, { x: 0.1, z: 0 }, [rocher], REGLAGES.MARGE_CORPS), 'aucun point du trajet dans le rocher élargi');
  const fin = p.points[p.points.length - 1]; assert.ok(Math.hypot(fin.x, fin.z - 10) < 1e-3, 'il arrive');
  // deux rochers côte à côte, un tronc : il passe quand même, ou s'arrête devant
  const obs = [rocher, { id: 'r2', x: 2.6, z: 6, r: 1 }, { id: 'arbre', x: -2.2, z: 4.4, r: 0.3 }];
  const p2 = planTrajet({ x: 0, z: 0 }, { x: 0, z: 12 }, obs);
  assert.ok(!traverse(p2.points, { x: 0, z: 0 }, obs, REGLAGES.MARGE_CORPS), 'aucun obstacle traversé : ' + JSON.stringify(p2));
  // la cible est dans le rocher : il s'arrête devant et le dit (bloque)
  const p3 = planTrajet({ x: 0, z: 0 }, { x: 0, z: 5 }, [rocher]);
  assert.equal(p3.bloque, 'rocher');
  const f3 = p3.points[p3.points.length - 1];
  assert.ok(Math.abs(Math.hypot(f3.x, f3.z - 5) - (1.2 + REGLAGES.MARGE_CORPS)) < 0.1, 'devant, à la marge : ' + JSON.stringify(f3));
  // une chose qu'il rejoint : il s'arrête à sa surface plus la marge, même si l'arrêt demandé est plus court
  const p4 = planTrajet({ x: 0, z: 0 }, { x: 0, z: 3 }, [{ id: 'fab-1', x: 0, z: 3, r: 0.4 }], { arret: 0.3, cible: 'fab-1' });
  assert.ok(Math.abs(p4.points[0].z - (3 - 0.4 - REGLAGES.MARGE_CORPS)) < 1e-3);
  // une chose grosse posée « dessous » est poussée hors du corps ; une petite tombe aux talons
  assert.ok(Math.hypot(horsDuCorps({ x: 0, z: -0.12 }, { x: 0, z: 0 }, 0.16).z) >= 0.5);
  assert.ok(Math.abs(horsDuCorps({ x: 0, z: -0.12 }, { x: 0, z: 0 }, 0.07).z + 0.12) < 1e-9);
});

test('monde de papier : rejoindre une chose derrière un rocher, droit dessus — il contourne, ne traverse jamais', async () => {
  const P = promenade({ demander: claudeDemo() }, { rochers: [{ x: 0, z: 4, haut: 1.4, rayon: 1.1 }], arbres: [] });
  P.monde.objets.push({ id: 'sac', nom: 'sac', x: 0, z: 8, formes: 1, formesL: [{ f: 'boite', p: [0, 0.2, 0], taille: [0.4, 0.4, 0.3] }], echelle: 1 });
  P.monde.executer({ type: 'actions', actions: [{ type: 'rejoindre', objet: 'sac' }] });
  await P.avancer(20);
  assert.ok(Math.hypot(P.monde.x, P.monde.z - 8) < 1.2, 'arrivé au sac : ' + P.monde.x.toFixed(2) + ',' + P.monde.z.toFixed(2));
  assert.ok(P.monde.marge >= REGLAGES.MARGE_CORPS - 0.02, 'marge tenue : ' + P.monde.marge.toFixed(2));
  // marche forcée droit sur le rocher (« avance de 8 m ») : il s'arrête contre, à la marge, sans entrer
  const Q = promenade({}, { rochers: [{ x: 0, z: 4, haut: 1.4, rayon: 1.1 }], arbres: [] });
  Q.monde.executer({ type: 'actions', actions: [{ type: 'marcher', metres: 8 }] });
  await Q.avancer(10);
  assert.ok(Q.monde.marge >= REGLAGES.MARGE_CORPS - 0.02, 'marge tenue en marche forcée : ' + Q.monde.marge.toFixed(2));
});

/* ------------------------------------------------------------------ le parcours de la démo, tel qu'il sera joué (§15.6)
   1. une petite crotte ; 2. une énorme bouse ; 3. « fais comme un bonhomme de neige avec » (la géante), sans dire d'aller
   chercher quoi que ce soit. Plusieurs formulations du joueur, plusieurs façons dont Claude nomme les choses ou se trompe. */
import { tientDansImage } from '../src/meneur.js';
const PHRASES = [
  ['fais une petite crotte', 'maintenant fais une énorme bouse', 'fais comme un bonhomme de neige avec'],
  ['fais une petite crotte', 'fais une crotte géante', 'fais-en un bonhomme de neige'],
  ['fais un petit caca', 'un énorme caca maintenant', 'fais un bonhomme de neige avec la grosse'],
  ['fais une petite crotte', 'une grosse merde', 'avec ça, fais un bonhomme de neige'],
];
const NOMS = ['bouse énorme', 'étron colossal', 'tas de merde', 'crotte'];
function claudeParcours(nom2, facon) {
  const sas = { verdict: 'recevable', regle: null, motif: '' };
  let n = 0;
  return c => {
    if (/accessoiriste/.test(c)) {                                   // il écrit mal : une boule de 3 m, grise
      if (/LA CHOSE/.test(c)) return Promise.resolve({ retouche: { ajoute: [{ f: 'boule', p: [0, 1, 0], taille: [2, 2, 2], couleur: '#777777', matiere: 'pierre' }] } });
      return Promise.resolve({ objet: { envergure_m: 3, nom: 'x', formes: [{ f: 'boule', p: [0, 1, 0], taille: [3, 2, 3], couleur: '#555555', matiere: 'pierre' }] } });
    }
    const v = voixDe(c); if (v === null) return Promise.resolve({ pensee: 'Hm.', attitude: 'initiative' });
    n++;
    if (n === 1) return Promise.resolve({ sas, pensee: 'Bon.', attitude: 'suit', actions: [{ type: 'posture', hauteur: 0.45 }, { type: 'attendre', secondes: 2 }, { type: 'posture', hauteur: 1 }], fabrique: { nom: 'petite crotte', quoi: 'une petite crotte', ou: 'dessous' } });
    if (n === 2) return Promise.resolve({ sas, pensee: 'Ah ouais.', attitude: 'suit', actions: [{ type: 'posture', hauteur: 0.45 }, { type: 'attendre', secondes: 2 }, { type: 'posture', hauteur: 1 }], fabrique: { nom: nom2, quoi: 'une ' + nom2, ou: 'dessous' } });
    if (facon === 'oublie') return Promise.resolve({ sas, pensee: 'Si tu veux.', attitude: 'suit', actions: [] });
    if (facon === 'fabrique') return Promise.resolve({ sas, pensee: 'Un bonhomme.', attitude: 'suit', actions: [], fabrique: { nom: 'bonhomme de neige', quoi: 'un bonhomme de neige', ou: 'devant' } });
    return Promise.resolve({ sas, pensee: 'Un bonhomme.', attitude: 'suit', actions: [], modifie: { objet: 'fab-1', quoi: 'un bonhomme de neige' } });   // il vise la petite : la page corrige
  };
}
async function parcours(phrases, nom2, facon) {
  const P = promenade({ demander: claudeParcours(nom2, facon), reglages: facon === 'oublie' ? { DOCILE: true } : undefined });
  const { m, monde, avancer } = P;
  const dans2 = { min: 99 };
  const pas = async s => { for (let t = 0; t < s; t += 0.5) { await avancer(0.5); const o = monde.objets.find(x => x.id === 'fab-2');
    if (o) dans2.min = Math.min(dans2.min, Math.hypot(monde.x - o.x, monde.z - o.z) - Math.max(...o.formesL.map(f => Math.hypot(f.p[0], f.p[2]) + Math.max(f.taille[0], f.taille[2]) / 2)) * (o.echelle || 1)); } };
  await avancer(1);
  await m.voix(phrases[0]); await flush(); await flush(); await pas(14);
  await m.voix(phrases[1]); await flush(); await flush(); await pas(16);
  const e1 = envergure(monde.objets.find(o => o.id === 'fab-1').formesL), g = monde.objets.find(o => o.id === 'fab-2'), e2 = envergure(g.formesL);
  await m.voix(phrases[2]); await flush(); await flush(); await pas(80);
  return Object.assign(P, { e1, e2, dans2 });
}
for (const [i, phrases] of PHRASES.entries()) for (const facon of ['petite', 'fabrique', 'oublie']) {
  const nom2 = NOMS[(i + ['petite', 'fabrique', 'oublie'].indexOf(facon)) % NOMS.length];
  test(`parcours de la démo : « ${phrases.join(' » / « ')} » ; Claude nomme « ${nom2} », et pour le bonhomme : ${facon}`, async () => {
    const { m, monde, e1, e2, dans2 } = await parcours(phrases, nom2, facon);
    const ev = m.trace().evenements;
    assert.ok(e1 >= 0.08 && e1 <= 0.16, 'petite : ' + e1);
    assert.ok(e2 >= 0.45 && e2 <= 0.9 && e2 >= 3 * e1, 'énorme, nettement plus grosse, bornée : ' + e2);
    assert.ok(dans2.min >= REGLAGES.MARGE_CORPS - 0.05, 'jamais dans la grosse : ' + dans2.min.toFixed(2));
    const f = monde.faconnes.find(x => x.id === 'fab-2');
    assert.ok(f, 'le bonhomme est fait avec la grosse (fab-2), pas la petite');
    assert.ok(!monde.faconnes.some(x => x.id === 'fab-1'));
    assert.ok(monde.cherche, 'il est allé chercher de lui-même : ' + JSON.stringify(ev.filter(e => /chercher|faconnage/.test(e.type))));
    assert.equal(f.vus, 1, 'bâtons et cailloux posés à son retour');
    const b = monde.objets.find(o => o.id === 'fab-2'), H = haut(b.formesL), t = envergure(b.formesL);
    const enorme = /énorme|géante/.test(phrases[1]);
    assert.ok(enorme ? H >= 0.8 && H <= 1.2 : H >= 0.45 && H <= 1.2, (enorme ? 'bonhomme d\'environ un mètre : ' : 'bonhomme : ') + H.toFixed(2));
    assert.equal(b.formesL.filter(x => x.matiere === 'pate-organique').length, 3, 'trois boules de la matière de la bouse (pas de gris)');
    assert.ok(b.formesL.filter(x => x.matiere === 'pate-organique').every(x => x.couleur === b.formesL.find(y => y.matiere === 'pate-organique').couleur));
    assert.equal(b.formesL.filter(x => x.matiere === 'bois').length, 2); assert.equal(b.formesL.filter(x => x.matiere === 'gres').length, 2);
    // cadrage final : en pied, entier, en portrait comme en paysage
    const q = monde.perception().objets.find(x => x.id === 'fab-2'), pl = planCadrage(t, 1.36, H);
    assert.ok(Math.abs(q.m - pl.m) < 0.2 && Math.abs(q.angle) < 6, `cadré : ${q.m.toFixed(2)} m pour ${pl.m}`);
    for (const a of [0.5, 16 / 9]) assert.ok(tientDansImage(t, H, q.m, 1.36 * monde.haut, monde.zoom, a), 'entier à l\'image, aspect ' + a.toFixed(2));
  });
}

test('cadrage : de 5 cm à 3 m, la chose tient ENTIÈRE dans l\'image (portrait et paysage), avec de la marge, et jamais sur elle', () => {
  for (const t of [0.05, 0.1, 0.14, 0.2, 0.3, 0.5, 0.7, 0.9, 1.2, 1.6, 2, 3]) for (const H of [t * 0.45, t, t * 1.3]) {
    const p = planCadrage(t, 1.36, H);
    for (const a of [0.5, 16 / 9]) assert.ok(tientDansImage(t, H, p.m, 1.36 * p.hauteur, p.zoom, a), `${t} m (haut ${H.toFixed(2)}), aspect ${a.toFixed(2)} : ${JSON.stringify(p)}`);
    assert.ok(p.m >= t / 2 + REGLAGES.MARGE_CORPS - 1e-9, 'hors de la chose');
    if (t >= 0.7) assert.equal(p.zoom, 1, 'une grande chose : sans zoom');
    assert.ok(p.m <= 2.2 * t + 1.2, 'pas plus loin qu\'il ne faut : ' + p.m);
  }
  // la projection elle-même : une chose de 3 m à 1 m n'y tient pas
  assert.ok(!tientDansImage(3, 3, 1, 1.36, 1, 0.5));
});

test('une grande chose n\'est jamais posée sur le porteur, ni sur une autre chose ; il sort d\'une chose où il se trouve', () => {
  const corps = { x: 0, z: 0, yaw: 0 };
  const q = horsDuCorps({ x: 0, z: -0.12 }, corps, 0.4);
  assert.ok(q.z > 0.4 + REGLAGES.MARGE_CORPS, 'devant lui, à une distance faite pour sa taille : ' + JSON.stringify(q));
  const r = placeLibre(q, 0.4, [{ x: q.x, z: q.z, r: 0.1 }], corps);
  assert.ok(Math.hypot(r.x - q.x, r.z - q.z) > 0.45, 'pas sur la petite');
  const p = planTrajet({ x: 0, z: 0 }, { x: 0, z: 0.1 }, [{ id: 'g', x: 0, z: 0.1, r: 0.4 }], { arret: 1.5, cible: 'g' });
  assert.ok(p.sortie, 'il sort d\'abord');
  const f = p.points[p.points.length - 1]; assert.ok(Math.abs(Math.hypot(f.x, f.z - 0.1) - 1.5) < 0.05, 'puis se place pour la cadrer');
});

/* ------------------------------------------------------------------ retours du vrai Claude (PC de Toine, graine 4821) */
/* Un Claude « méchant » : à « fais une énorme crotte », il répond par du texte seul, ou retouche la petite, ou fabrique autre
   chose (de la terre), ou refuse poliment ; la crotte, il la pose « devant ». La page tient la demande et la pose derrière. */
function claudeMechant(facon) {
  const sas = { verdict: 'recevable', regle: null, motif: 'geste ordinaire' };
  return c => {
    if (/accessoiriste/.test(c)) return Promise.resolve({ objet: { envergure_m: 0.3, nom: 'tas de terre', formes: [{ f: 'boule', p: [0, 0.1, 0], taille: [0.3, 0.2, 0.3], couleur: '#5a4a3a', matiere: 'mat' }] }, suite: null });
    const v = voixDe(c) || '', ids = [...c.matchAll(/\((fab-\d+)\)/g)].map(m => m[1]);
    const accroupi = [{ type: 'posture', hauteur: 0.45 }, { type: 'attendre', secondes: 3 }, { type: 'posture', hauteur: 1 }];
    if (/enorme|énorme|5 kg/.test(v)) {
      if (facon === 'texte') return Promise.resolve({ sas, pensee: 'Une énorme ? Non. Je vais plutôt la faire avec de la terre.', attitude: 'suit', actions: [] });
      if (facon === 'modifie') return Promise.resolve({ sas, pensee: 'Elle est déjà bien, celle-là.', attitude: 'suit', actions: [], modifie: { objet: ids[0], quoi: 'un peu plus grosse' } });
      if (facon === 'terre') return Promise.resolve({ sas, pensee: 'Avec de la terre, alors.', attitude: 'suit', actions: [{ type: 'chercher', quoi: 'de la terre' }], fabrique: { nom: 'tas de terre', quoi: 'un tas de terre', ou: 'devant' } });
      if (facon === 'refus') return Promise.resolve({ sas, pensee: 'Non. Ça, non.', attitude: 'refuse', actions: [] });
      return Promise.resolve({ sas, pensee: 'Bon.', attitude: 'suit', actions: accroupi, fabrique: { nom: 'crotte énorme', quoi: 'une énorme crotte', ou: 'devant' } });
    }
    if (/crotte/.test(v)) return Promise.resolve({ sas, pensee: 'Sérieux ? Bon.', attitude: 'suit', actions: accroupi, fabrique: { nom: 'petite crotte', quoi: 'une petite crotte', ou: 'devant', distance: 1.5 } });
    return Promise.resolve({ sas, pensee: 'Hm.', attitude: 'suit', actions: [] });
  };
}
for (const [facon, phrase] of [['texte', 'fais une énorme crotte'], ['modifie', 'maintenant fais une énorme crotte'], ['terre', 'fais une énorme crotte'], ['refus', 'fais une énorme crotte'], ['devant', 'fais une énorme crotte'], ['texte', 'fais une crotte de 5 kg']]) {
  test(`la page tient la demande (« ${phrase} », Claude : ${facon}) et la pose DERRIÈRE lui, hors du corps`, async () => {
    const P = promenade({ demander: claudeMechant(facon) }), { m, monde, avancer } = P;
    await avancer(1);
    await m.voix('fais une petite crotte'); await flush(); await flush(); await avancer(14);
    const n1 = monde.objets.find(o => o.id === 'fab-1');
    assert.ok(n1, 'la petite');
    const e1 = envergure(n1.formesL), d1 = { x: n1.x - monde.x, z: n1.z - monde.z };
    monde.x += 2; monde.yaw += 0.8; await avancer(1);
    const c = { x: monde.x, z: monde.z, yaw: monde.yaw };
    await m.voix(phrase); await flush(); await flush();
    await avancer(12);                                   // l'effort dure selon la démesure (§20) : la chose tombe à la fin
    const n2 = monde.objets.find(o => o.id === 'fab-2');
    const ev = m.trace().evenements;
    assert.ok(n2, 'une nouvelle chose : ' + JSON.stringify(ev.filter(e => /tenue|objet|modele/.test(e.type))));
    const e2 = envergure(n2.formesL);
    assert.ok(n2.formesL.length > 10, 'le modèle, pas de la terre');
    if (/5 kg/.test(phrase)) assert.ok(e2 >= 0.54 && e2 <= 0.62, '5 kg : ' + e2); else assert.ok(e2 >= 0.75 && e2 <= 0.85, 'énorme : ' + e2);
    assert.ok(Math.abs(envergure(monde.objets.find(o => o.id === 'fab-1').formesL) - e1) < 1e-6, 'la petite n\'a pas changé');
    // posée derrière lui (par rapport au regard au moment du geste), hors du corps
    const dx = n2.x - c.x, dz = n2.z - c.z, av = dx * Math.sin(c.yaw) + dz * Math.cos(c.yaw), r = e2 / 2;
    assert.ok(av < -r, 'derrière les talons : ' + av.toFixed(2));
    assert.ok(Math.hypot(dx, dz) >= r + 0.2, 'jamais dans le corps : ' + Math.hypot(dx, dz).toFixed(2));
    assert.ok(Math.hypot(d1.x, d1.z) >= 0.2 && d1.x * 0 + d1.z < 0, 'la petite aussi, derrière (malgré « devant » et 1,5 m) : ' + JSON.stringify(d1));
    if (facon !== 'devant') assert.ok(ev.some(e => e.type === 'demande_tenue' || e.type === 'cede'), 'demande tenue (ou il cède)');
    assert.ok(ev.some(e => e.type === 'pose_corrigee'), 'pose corrigée par la donnée du modèle');
    assert.ok(monde.pensees.length >= 2 && !/terre|déjà bien/.test(JSON.stringify(monde.pensees.slice(-2))), 'sa pensée ne dit pas autre chose que ce qu\'il fait : ' + JSON.stringify(monde.pensees.slice(-2)));
    // puis il se retourne et la cadre entière
    await avancer(16);
    const q = monde.perception().objets.find(x => x.id === 'fab-2');
    assert.ok(q && Math.abs(q.angle) < 10, 'il s\'est retourné vers elle : ' + (q && q.angle));
  });
}

test('horsDuCorps : « dessous » derrière les talons, à une distance faite pour la taille', () => {
  const corps = { x: 0, z: 0, yaw: 0 };
  for (const r of [0.05, 0.15, 0.3, 0.45]) {
    const q = horsDuCorps({ x: 0, z: -0.12 }, corps, r, REGLAGES.MARGE_CORPS, 'dessous');
    assert.ok(q.z <= -(r + 0.2) + 1e-9 && Math.abs(q.x) < 1e-9, r + ' : ' + JSON.stringify(q));
  }
  assert.ok(horsDuCorps({ x: 0, z: -2 }, corps, 0.1, REGLAGES.MARGE_CORPS, 'derriere').z === -2, 'derrière, assez loin : gardé');
  // un élément du décor sous la place (occupe) : elle glisse ailleurs, toujours hors du corps
  const p = placeLibre({ x: 0, z: -0.4 }, 0.2, [], corps, REGLAGES.MARGE_CORPS, q => Math.hypot(q.x, q.z + 0.4) < 0.3);
  assert.ok(Math.hypot(p.x, p.z + 0.4) >= 0.3 && Math.hypot(p.x, p.z) >= 0.35, JSON.stringify(p));
});

test('façonnage continu, à la main : pétrir, puis pour chaque boule (la plus grosse d\'abord) diviser, rouler, poser ; planter et presser ce qu\'on prend dans le tas ; lisser ; 12 à 16 s ; budget tenu', async () => {
  const { gesteFaconnage, etatGeste } = await import('../src/meneur.js');
  const av = formesModele(MODELE('crotte'), 'une énorme crotte').formes, ap = formesTransformees(MODELE('bonhomme'), av).formes;
  const tas = ramassage(MODELES, 'des bâtons et des cailloux').formes.map(f => Object.assign({}, f, { p: [f.p[0] + 0.5, f.p[1], f.p[2] + 0.3] }));
  const T = gesteFaconnage(av, ap, tas), tot = T.reduce((s, t) => s + t.duree, 0);
  assert.ok(tot >= 12 && tot <= 16, 'durée : ' + tot);
  assert.deepEqual(T.map(t => t.geste), ['petrir', 'diviser', 'rouler', 'poser', 'diviser', 'rouler', 'poser', 'diviser', 'rouler', 'poser', 'prendre', 'prendre', 'prendre', 'prendre', 'tapoter']);
  assert.deepEqual(T.filter(t => t.geste === 'prendre').map(t => t.op), ['planter', 'planter', 'presser', 'presser'], 'bâtons plantés, cailloux pressés');
  const vols = T.filter(t => t.geste === 'poser').map(t => { const f = t.a.find(g => g._k === t.cle); return f.taille[0] * f.taille[1] * f.taille[2]; });
  assert.ok(vols.every((v, i) => !i || v <= vols[i - 1]), 'de la plus grosse à la plus petite');
  // pendant tout le geste, la matière façonnée est molle (fondu), le reste est dur
  for (const t of T) for (const f of etatGeste(t, 0.5)) if (f.matiere !== 'pate-organique' || f.taille[1] < 0.1 * f.taille[0]) assert.ok(!(f.lisse > 0), 'dur : ' + f.matiere);
  // chaque ajout vient du tas, d'une forme de même matière, et chaque forme du tas ne sert qu'une fois
  const pris = T.filter(t => t.geste === 'prendre');
  for (const t of pris) { const de = t.de.find(f => f._k === t.cle), a = t.a.find(f => f._k === t.cle);
    assert.equal(tas[t.pile].matiere, a.matiere); assert.deepEqual(de.p, tas[t.pile].p, 'part du tas'); }
  assert.equal(new Set(pris.map(t => t.pile)).size, pris.length);
  // continu : d'une image à l'autre (1/30 s), rien ne saute ; le budget d'un objet (24 formes) tenu
  for (const t of T) { let prec = null;
    for (let i = 0; i <= 30; i++) { const u = i / 30, F = etatGeste(t, u * u * (3 - 2 * u));
      assert.ok(F.length <= REGLAGES.FORMES_PAR_OBJET, t.geste + ' : ' + F.length + ' formes');
      if (prec) for (const f of F) { const g = prec.find(x => x._k === f._k); if (g) assert.ok(Math.hypot(f.p[0] - g.p[0], f.p[1] - g.p[1], f.p[2] - g.p[2]) < 0.25, t.geste + ' : saut de ' + f._k); }
      prec = F; } }
  // la fin est exactement le résultat ; le début, la chose telle qu'elle était
  const fin = etatGeste(T[T.length - 1], 1);
  assert.equal(fin.length, ap.length);
  for (const f of ap) assert.ok(fin.some(g => g.f === f.f && g.matiere === f.matiere && g.p.every((v, i) => Math.abs(v - f.p[i]) < 1e-3)), 'forme du résultat');
  assert.equal(etatGeste(T[0], 0).length, av.length);
  // les masses montent une à une : après le 1er « poser », une seule est à sa place
  const surPlace = (F, k) => { const m = F.find(f => f._k === k), b = T[T.length - 1].a.find(f => f._k === k); return Math.hypot(...m.p.map((v, i) => v - b.p[i])) < 1e-3; };
  const p1 = etatGeste(T[3], 1), k1 = T[3].cle; assert.ok(surPlace(p1, k1) && p1.filter(f => /^m\d/.test(f._k)).length === 1, 'une seule boule posée');
  // diviser : un pont de matière entre la boule et la poignée, qui rompt avant la fin
  assert.ok(etatGeste(T[1], 0.4).some(f => f._k === 'pont') && !etatGeste(T[1], 0.95).some(f => f._k === 'pont'), 'pont qui rompt');
  // les mains, des données : neuf formes par main, des matières qui existent
  const M = MODELES.corps.mains;
  for (const k of ['manche', 'avant_bras', 'paume', 'doigts', 'pouce']) assert.ok(['tissu', 'mat'].includes(M[k].matiere) || MATIERES.recettes[M[k].matiere], k);
  // sans tas ni masse multiple : un geste quand même (pétrir, ajouts venus de la main, tapoter)
  const T2 = gesteFaconnage(av, [...av.slice(0, 1), { f: 'boule', p: [0, 0.1, 0], taille: [0.3, 0.2, 0.3], couleur: '#5a3d22', matiere: 'pate-organique' }, { f: 'cylindre', p: [0, 0.3, 0], taille: [0.02, 0.3, 0.02], couleur: '#4e3a27', matiere: 'bois' }]);
  assert.deepEqual(T2.map(t => t.geste), ['petrir', 'diviser', 'rouler', 'poser', 'prendre', 'tapoter']);
  assert.ok(T2.find(t => t.geste === 'prendre').depuis, 'vient de la main');
});
