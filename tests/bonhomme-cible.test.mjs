// « Là il a fait nawak : il a pas fait le bonhomme avec la dernière, et en plus elle s'est transformée en énorme. »
// (vrai Claude, mode debug, promenade libre ; docs/meneur-de-jeu.md §21). Le journal réel : un gros étron, puis une crotte de
// 20 kg (« avec de la terre », disait Claude), une MOUCHE ajoutée par une suite près du premier, puis « fait un bonhomme avec
// des bâtons et des cailloux » : le façonnage a pris la mouche. La cible d'un façonnage est la dernière chose que le joueur a
// DEMANDÉE (jamais l'ambiance d'une suite ni ce qu'il rapporte), sauf désignation explicite ; l'id de Claude ne l'emporte pas ;
// le façonnage garde le volume de la chose ; les autres choses ne bougent pas.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { creerMeneur, histoireLibre, envergure, volumeFormes } from '../src/meneur.js';
import { mondePapier, lexiqueTest, MODELES } from './outils.mjs';

const flush = () => new Promise(r => setImmediate(r));
const LIBRE = histoireLibre({ id: 'foret-test', titre: 'Forêt de grès', kit: 'foret', objets: [] });
const voixDe = c => { const m = /La voix dit : (".*")\s*$/m.exec(c); return m ? JSON.parse(m[1]) : null; };
const ARBRES = [{ x: -2.6, z: 6, haut: 14, rayon: 0.3 }, { x: 3, z: -5, haut: 14, rayon: 0.3 }], ROCHERS = [{ x: 6, z: 14, haut: 1.4, rayon: 1.1 }];
const sas = { verdict: 'recevable', regle: null, motif: 'possible' }, accroupi = [{ type: 'posture', hauteur: 0.45 }, { type: 'attendre', secondes: 3 }, { type: 'posture', hauteur: 1 }];
const BONHOMME = MODELES.modeles.bonhomme;
// la matière de la chose (celle qui fait le plus de volume), que le bonhomme garde
const matiereDe = F => { const v = {}; for (const f of F) v[f.matiere] = (v[f.matiere] || 0) + volumeFormes([f]); return Object.entries(v).sort((a, b) => b[1] - a[1])[0][0]; };

function partie(demander, reglages) {
  const monde = mondePapier(LIBRE, { flaner: false, arbres: ARBRES, rochers: ROCHERS });
  const m = creerMeneur({ histoire: LIBRE, demander, secours: lexiqueTest, graine: 3, modeles: MODELES, reglages, emettre: o => monde.executer(o) });
  const avancer = async s => { for (let t = 0; t < s; t += 0.25) { m.tic(0.25, monde.perception()); monde.step(0.25); await flush(); } };
  const dire = async (t, s) => { await m.voix(t); await flush(); await flush(); await avancer(s); };
  return { m, monde, avancer, dire };
}
const etat = monde => Object.fromEntries(monde.objets.map(o => [o.id, { x: o.x, z: o.z, env: envergure(o.formesL) * (o.echelle || 1), n: o.formesL.length }]));
function verifierFaconnage(monde, m, cible, avant) {
  const ev = m.trace().evenements, fa = ev.filter(e => e.type === 'faconnage');
  assert.ok(fa.length, 'un façonnage : ' + JSON.stringify(ev.filter(e => /faconn|modif|objet_cree|cible/.test(e.type))));
  assert.equal(fa[fa.length - 1].id, cible, 'la bonne chose : ' + JSON.stringify(fa));
  const o = monde.objets.find(x => x.id === cible);
  assert.ok(monde.faconnes.some(f => f.id === cible), 'façonnée dans le monde');
  // le volume de la chose est gardé (la matière, ±15 %), et l'envergure suit (pas d'« énorme »)
  const mat = matiereDe(avant.formes), V0 = volumeFormes(avant.formes), V1 = volumeFormes(o.formesL.filter(f => f.matiere === mat)) * (o.echelle || 1) ** 3;
  assert.ok(Math.abs(V1 / V0 - 1) < 0.15, `volume gardé : ${V0.toFixed(4)} → ${V1.toFixed(4)} m³`);
  return o;
}

/* ------------------------------------------------------------------ le journal réel, rejoué */
function claudeJournal() {
  let nAcc = 0;
  return c => {
    if (/accessoiriste/.test(c)) {
      if (/LA CHOSE, telle qu'elle est/.test(c)) return Promise.resolve({ retouche: { nom: 'bonhomme', ajoute: [] }, suite: null });
      nAcc++;
      if (nAcc === 1) return Promise.resolve({ objet: { envergure_m: 0.45, nom: 'gros étron', formes: [] }, suite: { etapes: [
        { dans_s: 40, ajoute: { pres_de: '@', decale: [0.3, 0.1], nom: 'mouche', formes: [{ f: 'boule', p: [0, 0.06, 0], taille: [0.13, 0.05, 0.08], couleur: '#1a1a1a', matiere: 'mat' }] } },
        { dans_s: 80, pensee: 'Ça attire déjà les mouches.' }, { dans_s: 120, pensee: 'Ça sent jusqu\'ici.' }] } });
      return Promise.resolve({ objet: { envergure_m: 0.9, nom: 'crotte géante de terre', formes: [] }, suite: { etapes: [
        { dans_s: 6, pensee: 'Voilà. Vingt kilos de forêt qui a pris la forme d\'une crotte…' },
        { dans_s: 70, ajoute: { pres_de: '@', decale: [1.2, 0], nom: 'corneille curieuse', formes: [{ f: 'boule', p: [0, 0.15, 0], taille: [0.25, 0.3, 0.4], couleur: '#151515', matiere: 'mat' }] } },
        { dans_s: 90, pensee: 'Une corneille. Elle regarde ma crotte de terre.' }, { dans_s: 110, pensee: 'Elle reste là.' }] } });
    }
    const v = (voixDe(c) || '').toLowerCase();
    if (!v) return Promise.resolve({ pensee: 'Hm.', attitude: 'initiative' });
    if (/etron/.test(v)) return Promise.resolve({ sas, pensee: 'Bon. Là, sur le chemin. Regarde ailleurs.', attitude: 'suit', actions: accroupi, fabrique: { nom: 'étron', quoi: 'un gros étron', ou: 'dessous' } });
    if (/20kg/.test(v)) return Promise.resolve({ sas: { verdict: 'recevable', regle: null, motif: 'absurde mais faisable avec de la terre et des feuilles sur place' },
      pensee: 'Vingt kilos ? Il rêve. Je vais rassembler la terre et les feuilles mouillées autour, et la mouler à côté de l\'autre.', attitude: 'suit', actions: accroupi,
      faits: ['crotte géante (fab-2) : fait à gauche, environ 20 kg de terre et feuilles moulée'],
      fabrique: { nom: 'crotte géante', quoi: 'Gros tas de terre, feuilles mouillées et brindilles moulé en forme de crotte géante', ou: 'gauche' } });
    if (/bonhomme/.test(v)) return Promise.resolve({ sas, pensee: 'Un bonhomme. D\'accord, je vais chercher ce qu\'il faut.', attitude: 'suit',
      actions: [{ type: 'chercher', quoi: 'batons et cailloux' }], fabrique: { nom: 'bonhomme', quoi: 'petit bonhomme fait de bâtons et de cailloux, environ 40 cm', ou: 'gauche' } });
    return Promise.resolve({ sas, pensee: 'Hm.', attitude: 'suit', actions: [] });
  };
}
for (const docile of [true, false]) test(`le journal réel (mode ${docile ? 'debug' : 'normal'}) : le bonhomme est fait avec la crotte de 20 kg, pas avec la mouche`, async () => {
  const { m, monde, dire, avancer } = partie(claudeJournal(), docile ? { DOCILE: true } : undefined);
  await avancer(1);
  await dire('ok pose nous un gros etron', 18);
  await dire('tu rigoles ? je veux une crotte de 20KG !', 30);
  const crees = m.partie().monde.crees;
  const mouche = crees.find(c => c.nom === 'mouche'), grosse = crees.find(c => c.source === 'modele' && /20 kg|geante|géante/.test(c.nom));
  assert.ok(mouche && mouche.source === 'suite', 'la mouche de la suite est là : ' + JSON.stringify(crees.map(c => [c.id, c.nom, c.source])));
  assert.ok(grosse && crees.indexOf(mouche) > crees.indexOf(grosse), 'créée APRÈS la crotte de 20 kg (comme dans le journal)');
  assert.ok(!/terre/.test(grosse.nom), 'son nom ne dit pas de terre : ' + grosse.nom);
  const avant = { formes: grosse.liste.slice() }, e0 = etat(monde);
  await dire('fait un bonhomme avec des batons et des cailloux', 70);
  const o = verifierFaconnage(monde, m, grosse.id, avant);
  assert.ok(envergure(o.formesL) > 0.6, 'un bonhomme à la mesure de 20 kg : ' + envergure(o.formesL).toFixed(2));
  for (const [id, a] of Object.entries(e0)) if (id !== grosse.id && monde.objets.some(x => x.id === id)) {
    const b = etat(monde)[id]; assert.ok(Math.abs(b.env - a.env) < 1e-6 && Math.abs(b.x - a.x) < 1e-6 && Math.abs(b.z - a.z) < 1e-6, id + ' intacte');
  }
  // la terre : nulle part, ni dans les pensées, ni dans les faits, ni dans les noms
  for (const p of monde.pensees) assert.ok(!/terre|feuilles|mouler|forêt/i.test(p.texte), 'pensée : ' + p.texte);
  assert.ok(!m.partie().faits.some(f => /terre/.test(f.t)), 'faits : ' + JSON.stringify(m.partie().faits.map(f => f.t)));
  assert.ok(!m.partie().monde.crees.some(c => /terre/.test(c.nom)));
});

/* ------------------------------------------------------------------ trois choses, cinq formulations, trois Claude
   (deux crottes au plus : trois modèles de 23 formes dépassent les 64 du moteur, la plus ancienne serait recyclée) */
const ORDRES = [
  ['fais une petite crotte', 'déplace-toi et fais une crotte de 20 kg', 'déplace-toi et fais un tas de feuilles'],
  ['fais une crotte de 20 kg', 'déplace-toi et fais un tas de feuilles', 'déplace-toi et fais une petite crotte'],
  ['fais un tas de feuilles', 'déplace-toi et fais une grosse crotte', 'déplace-toi et fais une énorme crotte'],
];
const TAS = { envergure_m: 0.45, nom: 'tas de feuilles', formes: [{ f: 'boule', p: [0, 0.07, 0], taille: [0.45, 0.15, 0.38], couleur: '#6a5634', matiere: 'mat' }, { f: 'boule', p: [0.1, 0.12, 0.05], taille: [0.18, 0.1, 0.15], couleur: '#7a6238', matiere: 'mat' }] };
const FORMULATIONS = ['fais un bonhomme de neige avec', 'fais-en un bonhomme de neige', 'fais un bonhomme avec la dernière',
  'fais un bonhomme avec celle-là', 'prends des bâtons et des cailloux et fais-nous un bonhomme avec'];
function claudeMatrice(facon) {
  return c => {
    if (/accessoiriste/.test(c)) return Promise.resolve(/LA CHOSE, telle qu'elle est/.test(c) ? { retouche: { nom: 'bonhomme', ajoute: [{ f: 'boule', p: [0, 2, 0], taille: [3, 3, 3], couleur: '#ffffff', matiere: 'mat' }] } }
      : /tas de feuilles/.test(c) ? { objet: TAS } : { objet: null });
    const v = (voixDe(c) || '').toLowerCase(), ids = [...c.matchAll(/\((fab-\d+)\)/g)].map(x => x[1]);
    if (!v) return Promise.resolve({ pensee: 'Hm.', attitude: 'initiative' });
    if (/bonhomme/.test(v)) {
      const uniq = [...new Set(ids)].sort((a, b) => +a.slice(4) - +b.slice(4));
      if (facon === 'fabrique') return Promise.resolve({ sas, pensee: 'Un bonhomme, d\'accord.', attitude: 'suit', actions: [], fabrique: { nom: 'énorme bonhomme', quoi: 'bonhomme de bâtons et de cailloux, 40 cm', ou: 'devant' } });
      return Promise.resolve({ sas, pensee: 'Bon, un bonhomme.', attitude: 'suit', actions: [], modifie: { objet: facon === 'bon' ? uniq[uniq.length - 1] : uniq[0], quoi: 'en faire un bonhomme de neige' } });
    }
    const nom = /20 kg/.test(v) ? 'crotte de 20 kg' : /énorme/.test(v) ? 'énorme crotte' : /grosse/.test(v) ? 'grosse crotte' : /tas/.test(v) ? 'tas de feuilles' : 'petite crotte';
    return Promise.resolve({ sas, pensee: 'Si tu veux.', attitude: 'suit', actions: accroupi, fabrique: { nom, quoi: nom, ou: 'dessous' } });
  };
}
for (const [k, ordre] of ORDRES.entries()) for (const phrase of FORMULATIONS) for (const facon of ['bon', 'mauvais', 'fabrique']) {
  test(`ordre ${k + 1}, « ${phrase} », Claude : ${facon} → la dernière demandée, volume gardé, les autres intactes`, async () => {
    const { m, monde, dire, avancer } = partie(claudeMatrice(facon));
    for (const p of ordre) await dire(p, 30);
    const crees = m.partie().monde.crees.filter(c => !c.retire);
    assert.equal(crees.length, 3, JSON.stringify(crees.map(c => c.nom)));
    const der = crees[crees.length - 1], avant = { formes: der.liste.map(f => f) }, e0 = etat(monde);
    if (k === 0) { monde.x += 4; monde.z += 3; await avancer(0.5); }   // il s'est éloigné : il doit la rejoindre d'abord
    await dire(phrase, 70);
    verifierFaconnage(monde, m, der.id, avant);
    const e1 = etat(monde);
    for (const c of crees) if (c.id !== der.id) assert.deepEqual(e1[c.id], e0[c.id], c.nom + ' intacte');
    if (k === 0) assert.ok(m.trace().evenements.some(e => e.type === 'faconnage' && e.rejoint_d_abord), 'il la rejoint d\'abord');
  });
}

test('désignation explicite : « avec la petite », « avec la première » l\'emportent sur la dernière', async () => {
  for (const [phrase, quelle] of [['fais un bonhomme avec la petite', 'petite'], ['fais un bonhomme de neige avec la première', 0]]) {
    const { m, monde, dire } = partie(claudeMatrice('bon'));
    for (const p of ORDRES[1]) await dire(p, 30);
    const crees = m.partie().monde.crees.filter(c => !c.retire);
    const cible = quelle === 0 ? crees[0] : crees.find(c => /petite/.test(c.nom));
    await dire(phrase, 70);
    verifierFaconnage(monde, m, cible.id, { formes: cible.liste.slice() });
  }
});

test('la chose en cours de fabrication compte comme la dernière : le façonnage l\'attend', async () => {
  let lent = null;
  const base = claudeMatrice('fabrique');
  const demander = c => /accessoiriste/.test(c) && !/LA CHOSE/.test(c) && /20 kg/.test(c) ? new Promise(r => { lent = r; }) : base(c);
  const { m, monde, dire, avancer } = partie(demander);
  await dire('fais une petite crotte', 25);
  await m.voix('fais une crotte de 20 kg'); await flush(); await flush(); await avancer(2);
  assert.ok(lent, 'l\'accessoiriste travaille encore');
  await dire('fais-en un bonhomme de neige', 5);
  assert.ok(m.trace().evenements.some(e => e.type === 'faconnage_attend'), 'il attend la chose');
  lent({ objet: null }); await flush(); await flush(); await avancer(80);
  const grosse = m.partie().monde.crees.find(c => /20 kg/.test(c.nom) || c.id === 'fab-2');
  const fa = m.trace().evenements.filter(e => e.type === 'faconnage');
  assert.equal(fa[fa.length - 1].id, grosse.id, JSON.stringify(fa));
  assert.ok(monde.faconnes.some(f => f.id === grosse.id));
});

test('sans chose demandée, un bonhomme de bâtons et de cailloux est une chose nouvelle', async () => {
  const { m, dire } = partie(claudeMatrice('fabrique'));
  await dire('fais un bonhomme avec des bâtons et des cailloux', 20);
  const ev = m.trace().evenements;
  assert.ok(!ev.some(e => e.type === 'faconnage'), 'rien à façonner');
  assert.ok(ev.some(e => e.type === 'objet_demande'), 'une chose nouvelle');
});
