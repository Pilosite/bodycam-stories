// « Je lui ai dit de se déplacer et faire la crotte de 20 kg, mais elle est apparue à côté de l'autre ! » (vrai Claude, scène 09,
// docs/meneur-de-jeu.md §19). Une phrase du joueur est une SÉQUENCE ordonnée : « déplace-toi PUIS fais X », « fais X PUIS
// recule ». La page lit l'ordre dans la phrase et le tient, quelle que soit la réponse de Claude (objet seul ; marche puis objet ;
// objet puis marche, à l'envers ; texte seul) ; la place de la chose se prend au moment du geste, là où il est arrivé.
// Le monde de papier de la fiche 09 (graine 4821), une première crotte déjà là.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { creerMeneur, histoireLibre, envergure, ordreDemande, ecartChoses, planDeplacement, placeLibre, REGLAGES } from '../src/meneur.js';
import { mondePapier, lexiqueTest, MODELES, foret09 } from './outils.mjs';

const flush = () => new Promise(r => setImmediate(r));
const FICHE = JSON.parse(readFileSync(new URL('../scenes/09-champcueil-aube.json', import.meta.url), 'utf8'));
const LIBRE = histoireLibre(Object.assign({}, FICHE, { objets: [] }));
const FORET = foret09(FICHE);
const voixDe = c => { const m = /La voix dit : (".*")\s*$/m.exec(c); return m ? JSON.parse(m[1]) : null; };

/* Le Claude simulé. mode : 'objet' (la chose seule, accroupi, sans le déplacement), 'marche_objet' (la marche puis la chose),
   'objet_marche' (la chose puis la marche, quel que soit l'ordre de la phrase), 'texte' (une pensée, rien d'autre). */
function claude(mode) {
  const sas = { verdict: 'recevable', regle: null, motif: '' }, accroupi = [{ type: 'posture', hauteur: 0.45 }, { type: 'attendre', secondes: 2 }, { type: 'posture', hauteur: 1 }];
  return c => {
    if (/accessoiriste/.test(c)) return Promise.resolve({ objet: null, suite: null });
    const v = (voixDe(c) || '').toLowerCase();
    if (!v) return Promise.resolve({ pensee: 'Hm.', attitude: 'initiative' });
    if (/montre/.test(v)) { const id = [...c.matchAll(/\((fab-\d+)\)/g)].map(m => m[1]).pop(); return Promise.resolve({ sas, pensee: 'Regarde.', attitude: 'suit', actions: [{ type: 'cadrer', objet: id }] }); }
    const n = +((v.match(/(\d+)\s*(m\b|mètres?)/) || [])[1] || 0);
    const marche = /déplace|bouge/.test(v) ? [{ type: 'marcher', metres: 2 }] : /avance/.test(v) ? [{ type: 'marcher', metres: n || 4 }]
      : /recule/.test(v) ? [{ type: 'marcher', metres: -(n || 2) }] : /arbre/.test(v) ? [{ type: 'rejoindre', objet: 'arbre' }] : [];
    const nom = /20 kg/.test(v) ? 'crotte de 20 kg' : /énorme/.test(v) ? 'énorme bouse' : /autre/.test(v) ? 'autre crotte' : 'crotte';
    const fabrique = { nom, quoi: nom, ou: 'devant' };
    if (mode === 'texte' && marche.length) return Promise.resolve({ sas, pensee: 'Encore ? T\'es pas croyable.', attitude: 'hesite', actions: [] });
    const actions = mode === 'objet' ? accroupi : mode === 'marche_objet' ? [...marche, ...accroupi] : mode === 'objet_marche' ? [...accroupi, ...marche] : accroupi;
    return Promise.resolve({ sas, pensee: 'Bon. Si tu y tiens.', attitude: 'suit', actions, fabrique });
  };
}
function partie(mode, foret = FORET, demander = claude(mode)) {
  const monde = mondePapier(LIBRE, Object.assign({ flaner: false, graine: FICHE.graine }, foret));
  const m = creerMeneur({ histoire: LIBRE, demander, secours: lexiqueTest, graine: FICHE.graine, modeles: MODELES, emettre: o => monde.executer(o) });
  const avancer = async s => { for (let t = 0; t < s; t += 0.25) { m.tic(0.25, monde.perception()); monde.step(0.25); await flush(); } };
  const dire = async (t, s = 30) => { await m.voix(t); await flush(); await flush(); await avancer(s); };
  return { m, monde, avancer, dire };
}
const traces = monde => monde.objets.filter(o => /^fab-/.test(o.id));
const tailleDe = o => envergure(o.formesL) * (o.echelle || 1);
const d2 = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);

/* ------------------------------------------------------------------ l'ordre dans la phrase, pur */
test('ordreDemande : le déplacement avant ou après la chose, selon la phrase', () => {
  const cas = [
    ['déplace-toi et fais une crotte de 20 kg', 'avant'], ['avance de 8 mètres puis fais une énorme bouse', 'avant'],
    ['va près de l\'arbre et fais-en une autre', 'avant'], ['fais une crotte puis recule de 3 m', 'apres'],
    ['fais une crotte et éloigne-toi', 'apres'], ['mets-toi près de l\'arbre, ensuite fais une crotte', 'avant'],
    ['fais une crotte après t\'être déplacé', 'avant'], ['avant de faire une crotte, avance de 5 m', 'avant'],
    ['fais une crotte avant de partir', 'apres'], ['fais une crotte', null], ['avance de 5 mètres', null], ['bouge un peu plus loin et chie', 'avant'],
  ];
  for (const [p, att] of cas) { const o = ordreDemande(p); assert.equal(o ? o.ordre : null, att, p + ' : ' + JSON.stringify(o)); }
});

/* ------------------------------------------------------------------ « déplace-toi PUIS fais » : la chose là où il est allé */
const AVANT = [
  ['déplace-toi et fais une crotte de 20 kg', 3],
  ['avance de 8 mètres puis fais une énorme bouse', 7],
  ['va près de l\'arbre et fais-en une autre', null],
];
for (const mode of ['objet', 'marche_objet', 'objet_marche', 'texte']) for (const [phrase, loin] of AVANT) {
  test(`« ${phrase} » (Claude : ${mode}) : la chose là où il est allé, loin de la première`, async () => {
    const { monde, dire } = partie(mode);
    await dire('fais une crotte', 20); await dire('montre-la-moi', 12);
    const [A] = traces(monde), P0 = { x: monde.x, z: monde.z }, j0 = monde.journal.length;
    assert.ok(A, 'la première crotte');
    await dire(phrase, 45);
    const L = traces(monde); assert.equal(L.length, 2, 'une deuxième chose : ' + JSON.stringify(L.map(o => o.nom)));
    const B = L[1], rA = tailleDe(A) / 2, rB = tailleDe(B) / 2;
    const cr = monde.journal.slice(j0).find(e => e.quoi === 'creer' && e.id === B.id);
    assert.ok(d2(A, B) >= rA + rB + Math.max(1, 2 * (rA + rB)), `pas contre la première : ${d2(A, B).toFixed(2)} m (rayons ${rA.toFixed(2)}, ${rB.toFixed(2)})`);
    if (loin) assert.ok(d2(B, P0) >= loin - 0.5, `faite là où il est allé : ${d2(B, P0).toFixed(2)} m du départ`);
    else { const arbre = FORET.arbres.slice().sort((a, b) => d2(a, P0) - d2(b, P0))[0]; assert.ok(d2(B, arbre) < 3, `près de l'arbre : ${d2(B, arbre).toFixed(2)} m`); }
    // la chose est posée APRÈS la marche, à la place atteinte (pas réservée au départ)
    assert.ok(cr && d2(cr.corps, P0) >= (loin || 1.5) - 0.6, 'créée quand il est arrivé : corps à ' + (cr ? d2(cr.corps, P0).toFixed(2) : '?') + ' m du départ');
    assert.ok(d2(B, cr.corps) < rB + 1.2, 'près de lui au moment du geste : ' + d2(B, cr.corps).toFixed(2));
    const fm = monde.journal.slice(j0).filter(e => e.quoi === 'finMarche');
    if (fm.length) assert.ok(fm[0].t <= cr.t, 'la marche finit avant que la chose apparaisse');
    if (/20 kg/.test(phrase)) assert.ok(tailleDe(B) > 0.85, '20 kg : ' + tailleDe(B).toFixed(2));
    assert.ok(monde.marge >= REGLAGES.MARGE_CORPS - 0.02, 'jamais dans un tronc ni un rocher');
  });
}

/* ------------------------------------------------------------------ « fais PUIS recule » : la chose ici, puis il part */
for (const mode of ['objet', 'marche_objet', 'objet_marche', 'texte']) {
  test(`« fais une crotte puis recule de 3 m » (Claude : ${mode}) : ici, puis il recule`, async () => {
    const { monde, dire } = partie(mode);
    await dire('fais une crotte', 20); await dire('montre-la-moi', 12);
    // il s'écarte d'abord de la première (sinon « ici » est contre elle) : on le pose à 4 m, sur le sentier
    monde.z += 4; monde.x = 0; monde.haut = 1; monde.zoom = 1;
    const [A] = traces(monde), P0 = { x: monde.x, z: monde.z }, j0 = monde.journal.length;
    await dire('fais une crotte puis recule de 3 m', 40);
    const L = traces(monde); assert.equal(L.length, 2);
    const B = L[1], cr = monde.journal.slice(j0).find(e => e.quoi === 'creer' && e.id === B.id), fm = monde.journal.slice(j0).find(e => e.quoi === 'finMarche');
    assert.ok(d2(B, P0) < 1.2, 'faite ici : ' + d2(B, P0).toFixed(2));
    assert.ok(fm && Math.abs(fm.fait - 3) < 0.75, 'il recule de 3 m : ' + (fm && fm.fait.toFixed(2)));
    assert.ok(cr.t <= fm.t, 'faite avant qu\'il parte');
    assert.ok(d2(A, B) >= tailleDe(A) / 2 + tailleDe(B) / 2 + 0.5);
  });
}

/* ------------------------------------------------------------------ jamais contre une chose déjà là, sauf si on le demande */
test('« fais-en une autre » sur place : pas contre la première ; « juste à côté de l\'autre » : tout près, sans la toucher', async () => {
  for (const mode of ['objet', 'texte']) {
    const { monde, dire } = partie(mode);
    await dire('fais une crotte', 20); await dire('montre-la-moi', 12);
    await dire('fais-en une autre', 25);
    const [A, B] = traces(monde); assert.ok(B, mode + ' : une deuxième');
    assert.ok(d2(A, B) >= ecartChoses(tailleDe(A) / 2, tailleDe(B) / 2) - 0.01, mode + ' : écart ' + d2(A, B).toFixed(2));
  }
  const { monde, dire } = partie('objet');
  await dire('fais une crotte', 20); await dire('montre-la-moi', 12);
  await dire('fais une crotte juste à côté de l\'autre', 25);
  const [A, B] = traces(monde), rr = tailleDe(A) / 2 + tailleDe(B) / 2;
  assert.ok(d2(A, B) < ecartChoses(tailleDe(A) / 2, tailleDe(B) / 2) && d2(A, B) >= rr, 'à côté, demandé : ' + d2(A, B).toFixed(2));
  // pur : placeLibre écarte une chose (chose: true) selon les deux envergures, un tronc à la marge habituelle
  const p = placeLibre({ x: 0, z: 1 }, 0.4, [{ x: 0, z: 1.2, r: 0.07, chose: true }], { x: 0, z: 0, yaw: 0 });
  assert.ok(Math.hypot(p.x, p.z - 1.2) >= ecartChoses(0.07, 0.4) - 1e-9);
  const q = placeLibre({ x: 0, z: 1 }, 0.4, [{ x: 0, z: 1.2, r: 0.07 }, { x: 5, z: 5, r: 0.3 }], { x: 0, z: 0, yaw: 0 });
  assert.ok(Math.hypot(q.x, q.z - 1.2) >= 0.57 - 1e-9 && Math.hypot(q.x, q.z - 1.2) < 1.2);
});

/* ------------------------------------------------------------------ marche raccourcie, accessoiriste lent, bougé sans qu'on le demande */
test('marche raccourcie par un rocher : la chose est faite là où il est arrivé', async () => {
  const mur = []; for (let x = -16; x <= 16; x += 0.8) mur.push({ x, z: -3.4, haut: 2, rayon: 0.5 });   // derrière lui : il regarde la première, vers −z
  const { monde, dire } = partie('marche_objet', { arbres: [], rochers: mur, semis: [] });
  await dire('fais une crotte', 20); await dire('montre-la-moi', 12);
  const P0 = { x: monde.x, z: monde.z }, j0 = monde.journal.length;
  monde.yaw = Math.PI;                                               // face au mur
  await dire('avance de 8 mètres puis fais une énorme bouse', 40);
  const [A, B] = traces(monde), fm = monde.journal.slice(j0).find(e => e.quoi === 'finMarche'), cr = monde.journal.slice(j0).find(e => e.quoi === 'creer');
  assert.ok(B && fm && fm.fait < 7, 'raccourcie : ' + (fm && fm.fait));
  assert.ok(cr.t >= fm.t && d2(cr.corps, fm.corps) < 0.05, 'faite à l\'arrivée');
  assert.ok(d2(B, fm.corps) < tailleDe(B) / 2 + 1.2 && d2(A, B) >= ecartChoses(tailleDe(A) / 2, tailleDe(B) / 2) - 0.01, d2(A, B).toFixed(2) + ' ' + JSON.stringify(P0));
});

test('accessoiriste lent : la place est prise au geste ; s\'il a bougé ensuite sans qu\'on le demande, elle reste là', async () => {
  let lacher = null; const base = claude('marche_objet');
  const demander = (c, o) => /accessoiriste/.test(c) && /20 kg/.test(c) ? new Promise(r => { lacher = () => r(base(c, o)); }) : base(c, o);
  const { monde, dire, avancer } = partie('marche_objet', FORET, demander);
  await dire('fais une crotte', 20); await dire('montre-la-moi', 12);
  const P0 = { x: monde.x, z: monde.z }, j0 = monde.journal.length;
  await dire('déplace-toi et fais une crotte de 20 kg', 20);
  const po = monde.journal.slice(j0).find(e => e.quoi === 'poser');
  assert.ok(po && d2(po.corps, P0) >= 3.4, 'arrivé avant le geste : ' + (po && d2(po.corps, P0).toFixed(2)));
  assert.equal(traces(monde).length, 1, 'pas encore de réponse : rien');
  monde.x += 6; monde.z += 2;                                        // il est parti ailleurs (flânerie)
  lacher(); await flush(); await flush(); await avancer(1);
  const B = traces(monde)[1];
  assert.ok(B && d2(B, po.corps) < tailleDe(B) / 2 + 1.2, 'faite où il a fait le geste : ' + (B && d2(B, po.corps).toFixed(2)));
});

test('planDeplacement : le long du sentier, pas vers une chose toute proche, arrivée loin des choses', () => {
  const choses = [{ id: 'fab-1', x: 0, z: -0.7, r: 0.07, haut: 0.05, chose: true }];
  const d = planDeplacement({ x: 0, z: 0, yaw: Math.PI }, 4, choses, { caps: [Math.PI, 0], rayon: 0.46 });
  assert.ok(Math.abs(d.cap) < 0.01 && d.libre && d.fait >= 3.9, JSON.stringify(d));
  const rocher = [{ id: 'r', x: 0, z: 2.5, r: 1.2, haut: 2 }, ...[-3, -2, -1, 0, 1, 2, 3].map(x => ({ id: 'm' + x, x, z: -2, r: 0.6, haut: 2 }))];
  const e = planDeplacement({ x: 0, z: 0, yaw: 0 }, 4, rocher, { caps: [0, Math.PI] });
  assert.ok(e.fait >= 3.3 && e.libre, 'une direction dégagée : ' + JSON.stringify(e));
});
