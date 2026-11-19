// La démonstration (docs/meneur-de-jeu.md §15 et §16) : « fais une crotte », « fais une crotte de 5 kg », « va chercher des
// bâtons et des cailloux et fais-en un bonhomme de neige ». La bibliothèque de modèles de référence (src/modeles.json),
// l'échelle par la masse, la séquence « aller chercher, revenir, façonner » jouée dans le monde de papier avec un Claude
// simulé (et sans Claude), et le trajet du corps qui ne traverse jamais rien. Sans navigateur.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { creerMeneur, histoireLibre, envergure, modeleDe, formesModele, formesTransformees, etapesFaconnage, volumeFormes, ramassage,
  planTrajet, lieuChercher, secoursChercher, horsDuCorps, consigneAtelier, normaliserHistoire, creerPartie, compacter, rejouer, planCadrage, REGLAGES } from '../src/meneur.js';
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

test('échelle : une crotte normale fait 12 à 18 cm ; « de 5 kg » 30 à 35 cm (densité ≈ 1), proportions gardées, posée au sol', () => {
  const m = MODELE('crotte');
  const n = formesModele(m, 'fais une crotte'), g = formesModele(m, 'fais une crotte de 5 kg'), p = formesModele(m, 'une petite crotte');
  assert.ok(n.envergure >= 0.12 && n.envergure <= 0.18, 'normale : ' + n.envergure);
  assert.ok(g.envergure >= 0.30 && g.envergure <= 0.35, '5 kg : ' + g.envergure + ' (' + g.raison + ')');
  const V = volumeFormes(g.formes) * 1000;
  assert.ok(V > 4.3 && V < 5.2, 'volume de 5 kg : ' + V.toFixed(2) + ' L');
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
  assert.ok(lum(yeux[0].couleur) > 3 * lum(tete.couleur), 'contraste des yeux sur la tête');
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
  const n2 = monde.objets.find(o => o.id === 'fab-2');
  const avant = { x: monde.x, z: monde.z };
  await m.voix('va chercher des bâtons et des cailloux et fais-en un bonhomme de neige'); await flush(); await flush();
  let loin = 0, vuRamasse = false;
  for (let t = 0; t < 70; t += 0.5) { await avancer(0.5); loin = Math.max(loin, Math.hypot(monde.x - n2.x, monde.z - n2.z));
    vuRamasse = vuRamasse || monde.objets.some(o => /ramass/.test(o.nom || '')); }
  return Object.assign(P, { n1, n2, avant, loin, vuRamasse });
}
function verifierDemo({ m, monde, ordres, n1, n2, loin }, source = 'modele') {
  const ev = m.trace().evenements;
  assert.ok(envergure(n1.formesL) >= 0.12 && envergure(n1.formesL) <= 0.18, 'crotte normale : ' + envergure(n1.formesL));
  assert.ok(envergure(n2.formesL) >= 0.30 && envergure(n2.formesL) <= 0.35, 'crotte de 5 kg : ' + envergure(n2.formesL));
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
