// La séquence de référence de Toine (docs/meneur-de-jeu.md §14), en promenade libre, avec un faux Claude qui joue chaque
// rôle : « fais une crotte sur le chemin », « éloigne-toi de 2 pas et montre-la-moi », « mets 2 bâtons pour les bras et
// 2 cailloux pour les yeux sur cette crotte ». Plus : monter, s'arrêter, recycler, mode debug, latence. Sans navigateur.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { creerMeneur, histoireLibre, validerHistoire, consigne, consigneAtelier, compacter, normaliserHistoire, creerPartie, reglagesDe,
  envergure, bornesTaille, mettreAEchelle, planCadrage, distanceArret, estStop, rejouer, REGLAGES, placePose, OU_POSE } from '../src/meneur.js';
import { mondePapier, lexiqueTest } from './outils.mjs';

const flush = () => new Promise(r => setImmediate(r));
const FORET = { id: 'foret-test', titre: 'Forêt de grès', kit: 'foret', objets: [] };
const LIBRE = histoireLibre(FORET);
const voixDe = c => { const m = /La voix dit : (".*")\s*$/m.exec(c); return m ? JSON.parse(m[1]) : null; };
const ARBRES = [{ x: -2.5, z: 7, haut: 14, rayon: 0.25 }], ROCHERS = [{ x: 4, z: 12, haut: 1.4, rayon: 1.1 }];

/* Une promenade libre pilotée à la main : tic de 0,5 s, le monde de papier exécute les ordres. */
function promenade(opts = {}, monde0 = {}) {
  const monde = mondePapier(LIBRE, Object.assign({ flaner: false, arbres: ARBRES, rochers: ROCHERS }, monde0)), ordres = [];
  const m = creerMeneur(Object.assign({ histoire: LIBRE, secours: lexiqueTest, graine: 5, emettre: o => { ordres.push(o); monde.executer(o); } }, opts));
  const avancer = async s => { for (let t = 0; t < s; t += 0.5) { m.tic(0.5, monde.perception()); monde.step(0.5); await flush(); } };
  return { m, monde, ordres, avancer };
}
const crotte = () => ({ envergure_m: 0.2, nom: 'crotte', degage: 0, formes: [            // cohérente mais 8 fois trop grande
  { f: 'boule', p: [0, 0.28, 0], taille: [1.1, 0.56, 0.9], couleur: '#4a3220', matiere: 'mat' },
  { f: 'boule', p: [0.1, 0.64, 0], taille: [0.7, 0.45, 0.6], couleur: '#523a26', matiere: 'mat' },
  { f: 'boule', p: [0.08, 0.92, 0], taille: [0.4, 0.32, 0.4], couleur: '#4a3220', matiere: 'mat' }] });

/* Le faux Claude de la séquence. `mode` : comment il répond à la troisième phrase.
   'modifie' : ce qu'on attend ; 'fabrique' : il refait une chose nouvelle (l'échec d'aujourd'hui) ; 'transforme' : il défait et refait. */
function sampler(mode = 'modifie', journal = []) {
  return (c, opt) => {
    journal.push({ c, opt });
    if (/accessoiriste/.test(c)) {
      if (/LA CHOSE, telle qu'elle est/.test(c)) {                                  // retouche : il reçoit les formes de la chose
        const formes = JSON.parse(/envergure [\d.]+ m[^)\n]*\) : (\[.*\])\n/.exec(c)[1]);
        const haut = Math.max(...formes.map(f => f.p[1] + f.taille[1] / 2));
        return Promise.resolve({ retouche: { nom: 'crotte décorée', ajoute: [
          { f: 'cylindre', p: [-0.15, haut * 0.5, 0], taille: [0.02, 0.9, 0.02], penche: [0, 60], couleur: '#4a3a2a', matiere: 'bois' },   // un bâton trop long
          { f: 'cylindre', p: [0.15, haut * 0.5, 0], taille: [0.02, 0.12, 0.02], penche: [0, -60], couleur: '#4a3a2a', matiere: 'bois' },
          { f: 'boule', p: [-0.025, haut * 0.8, 0.06], taille: [0.025, 0.025, 0.02], couleur: '#2e2c29', matiere: 'pierre' },
          { f: 'boule', p: [0.025, haut * 0.8, 0.06], taille: [0.025, 0.025, 0.02], couleur: '#2e2c29', matiere: 'pierre' }] }, suite: null });
      }
      if (/"objet":null/.test(c)) return Promise.resolve({ objet: null, suite: null });
      return Promise.resolve({ objet: /crotte/.test(c) ? crotte() : { envergure_m: 0.5, nom: 'tas', formes: [{ f: 'boule', p: [0, 0.1, 0], taille: [0.5, 0.2, 0.4], couleur: '#777777', matiere: 'pierre' }] }, suite: null });
    }
    const v = voixDe(c) || '', ids = [...c.matchAll(/\((fab-\d+)\)/g)].map(m => m[1]), sas = { verdict: 'recevable', regle: null, motif: 'geste ordinaire' };
    if (/crotte sur le chemin/.test(v)) return Promise.resolve({ sas, pensee: 'Sérieux ? Bon. Personne regarde.', attitude: 'suit',
      actions: [{ type: 'posture', hauteur: 0.45 }, { type: 'attendre', secondes: 4 }, { type: 'posture', hauteur: 1 }],
      fabrique: { nom: 'crotte', quoi: 'une crotte de 3 kg, sur le chemin', ou: 'pieds' } });
    if (/éloigne-toi/.test(v)) return Promise.resolve({ sas, pensee: 'Voilà. Admire.', attitude: 'suit', actions: [{ type: 'marcher', metres: -1.4 }, { type: 'viser', objet: ids[0] }] });
    if (/bâtons/.test(v)) {
      if (mode === 'modifie') return Promise.resolve({ sas, pensee: 'Des bras, des yeux. Mon chef-d\'œuvre.', attitude: 'suit', actions: [], modifie: { objet: ids[0], quoi: 'deux bâtons en bras, deux cailloux en yeux' } });
      if (mode === 'fabrique') return Promise.resolve({ sas, pensee: 'Bon, des bâtons…', attitude: 'suit', actions: [{ type: 'posture', hauteur: 0.5 }], fabrique: { nom: 'crotte avec des bras', quoi: 'bâtons et cailloux', ou: 'pieds' } });
      return Promise.resolve({ sas, pensee: 'On refait.', attitude: 'suit', actions: [], defaire: [ids[0]], fabrique: { nom: 'bonhomme crotte', quoi: 'la crotte avec bras et yeux', ou: 'pieds' } });
    }
    if (/tas de pierres/.test(v)) return Promise.resolve({ sas, pensee: 'Un caillou, deux…', attitude: 'suit', actions: [{ type: 'posture', hauteur: 0.5 }], fabrique: { nom: 'tas de pierres', quoi: 'petit tas', ou: 'devant' } });
    if (/descends/.test(v)) return Promise.resolve({ sas, pensee: 'Je redescends.', attitude: 'suit', actions: [{ type: 'descendre' }] });
    if (/grimpe/.test(v)) return Promise.resolve({ sas, pensee: 'Allez, hop.', attitude: 'suit', actions: [{ type: 'monter', sur: 'arbre' }] });
    if (/arrête/.test(v)) return Promise.resolve({ sas, pensee: 'Je bouge plus.', attitude: 'suit', actions: [{ type: 'marcher', metres: 3 }] });   // une réponse qui désobéit
    return Promise.resolve({ sas, pensee: 'Hm.', attitude: 'suit', actions: [] });
  };
}
const dist = (w, o) => Math.hypot(o.x - w.x, o.z - w.z);

async function sequence(mode) {
  const appels = [], P = promenade({ demander: sampler(mode, appels) });
  const { m, monde, ordres, avancer } = P;
  await avancer(2);
  await m.voix('fais une crotte sur le chemin'); await flush(); await flush();
  await avancer(14);
  await m.voix('éloigne-toi de 2 pas et montre-la-moi'); await flush();
  await avancer(8);
  const avant = Object.assign({}, monde.objets.find(o => o.id === 'fab-1'));
  const dAvant = dist(monde, avant);
  await m.voix('mets 2 bâtons pour les bras et 2 cailloux pour les yeux sur cette crotte'); await flush(); await flush();
  await avancer(25);
  return Object.assign(P, { avant, dAvant, appels });
}

for (const mode of ['modifie', 'fabrique', 'transforme']) test(`séquence de référence (Claude répond « ${mode} ») : la même crotte est modifiée sur place, puis cadrée`, async () => {
  const { m, monde, ordres, avant, dAvant } = await sequence(mode);
  const ev = m.trace().evenements;
  // 1. la crotte : à ses pieds, à taille réaliste (3 kg : 11 à 40 cm), pas un rocher
  const cree = ordres.find(o => o.type === 'objet' && o.op === 'creer');
  assert.equal(cree.objet.id, 'fab-1');
  const e = envergure(cree.objet.formes);
  assert.ok(e >= 0.1 && e <= 0.4, 'envergure réaliste : ' + e);
  assert.ok(ev.some(x => x.type === 'echelle' && x.objet === 'crotte'), 'mise à l\'échelle consignée');
  // 2. il a reculé d'environ deux pas
  assert.ok(dAvant > 1.8 && dAvant < 3.2, 'à deux pas de plus : ' + dAvant.toFixed(2));
  // 3. une seule chose dans le monde, la même, au même endroit, avec ses nouvelles formes
  const creees = ordres.filter(o => o.type === 'objet' && o.op === 'creer');
  assert.equal(creees.length, 1, 'aucun second objet');
  assert.ok(!ordres.some(o => o.type === 'objet' && o.op === 'retirer'), 'rien n\'est défait');
  const rp = ordres.find(o => o.type === 'objet' && o.op === 'remplacer');
  assert.ok(rp && rp.id === 'fab-1', 'remplacer sur fab-1');
  const apres = monde.objets.find(o => o.id === 'fab-1');
  assert.ok(Math.abs(apres.x - avant.x) < 1e-9 && Math.abs(apres.z - avant.z) < 1e-9, 'même place');
  assert.ok(apres.formesL.length > avant.formesL.length, 'formes ajoutées : ' + avant.formesL.length + ' → ' + apres.formesL.length);
  // ce qui a été ajouté reste à la mesure de la chose (le bâton de 90 cm est ramené)
  assert.ok(envergure(apres.formesL) < 0.5, 'toujours une petite chose : ' + envergure(apres.formesL));
  // 4. il y est retourné (rejoindre), puis il la cadre de près
  const iMod = ordres.indexOf(rp);
  assert.ok(ordres.slice(0, iMod).some(o => o.type === 'actions' && o.actions.some(a => a.type === 'rejoindre' && a.objet === 'fab-1')), 'il retourne vers elle');
  assert.ok(ordres.slice(iMod).some(o => o.type === 'actions' && o.actions.some(a => a.type === 'cadrer' && a.objet === 'fab-1')), 'le résultat est cadré');
  const o = monde.perception().objets.find(x => x.id === 'fab-1');
  assert.ok(Math.abs(o.angle) < 6, 'face à elle : ' + o.angle);
  assert.ok(Math.abs(o.m - planCadrage(o.taille).m) < 0.15, `à la distance de cadrage : ${o.m.toFixed(2)} pour ${planCadrage(o.taille).m}`);
  assert.equal(monde.haut, planCadrage(o.taille).hauteur, 'accroupi pour une petite chose');
  assert.ok(ev.some(x => x.type === 'objet_modifie' && x.id === 'fab-1' && x.source === 'ia'), 'retouche de l\'accessoiriste (pas du secours)');
  if (mode !== 'modifie') assert.ok(ev.some(x => x.type === 'fabrique_vers_modifie' || x.type === 'transformation'), 'la page a corrigé Claude');
});

test('l\'accessoiriste reçoit les formes actuelles de la chose visée, numérotées, et l\'ordre de garder son échelle', async () => {
  const { appels } = await sequence('modifie');
  const c = appels.map(a => a.c).find(c => /LA CHOSE/.test(c));
  assert.match(c, /"i":0/); assert.match(c, /MÊME ÉCHELLE/); assert.match(c, /"retouche"/);
  assert.match(c, /envergure 0\.\d+ m/);
  assert.equal(appels.find(a => /LA CHOSE/.test(a.c)).opt.modelTier, 'default');
});

test('la trace d\'une séquence avec retouche se rejoue à l\'identique', async () => {
  const { m } = await sequence('modifie');
  const t = m.trace();
  assert.deepEqual(rejouer(LIBRE, t), t.final);
});

test('échelle : la masse et la nature de la chose bornent sa taille', () => {
  const [mn, mx] = bornesTaille('une crotte de 3 kg');
  assert.ok(mn > 0.09 && mx < 0.45, `${mn} ${mx}`);
  assert.ok(bornesTaille('fais caca')[1] <= 0.4);
  assert.ok(bornesTaille('un caillou')[1] <= 0.5);
  assert.ok(bornesTaille('une cabane de 3 m')[0] >= 2);
  const r = mettreAEchelle(crotte().formes, 0.2, 'une crotte de 3 kg');
  assert.ok(Math.abs(envergure(r.formes) - 0.2) < 0.03, 'ramenée à son envergure déclarée');
  const r2 = mettreAEchelle(crotte().formes, NaN, 'fais caca');
  assert.ok(envergure(r2.formes) <= 0.4 + 1e-6, 'sans envergure déclarée : bornée par la nature');
  assert.ok(Math.min(...r2.formes.map(f => f.p[1] - f.taille[1] / 2)) > -0.01, 'toujours posée au sol');
});

test('position de pose prise au tour de voix : s\'il a bougé avant la réponse de l\'accessoiriste, la chose reste où il a fait le geste', async () => {
  let lacher; const attente = new Promise(r => { lacher = r; });
  const base = sampler('modifie');
  const P = promenade({ demander: (c, o) => /accessoiriste/.test(c) ? attente.then(() => base(c, o)) : base(c, o) });
  await P.avancer(1);
  await P.m.voix('fais une crotte sur le chemin'); await flush();
  const res = P.ordres.find(o => o.type === 'objet' && o.op === 'reserver');
  assert.ok(res, 'place réservée au tour de voix');
  const lieu = Object.assign({}, P.monde.reserves[res.ref]);
  P.monde.x += 5; P.monde.z += 3;                                    // il est parti ailleurs entre-temps
  lacher(); await flush(); await flush();
  const o = P.monde.objets.find(x => x.id === 'fab-1');
  assert.ok(Math.abs(o.x - lieu.x) < 1e-9 && Math.abs(o.z - lieu.z) < 1e-9);
  assert.equal(P.ordres.find(o => o.op === 'creer').reserve, res.ref);
});

test('budget : au-delà des 8 places du moteur, la plus ancienne trace est recyclée, rien n\'est refusé', async () => {
  const P = promenade({ demander: sampler() });
  await P.avancer(1);
  for (let i = 0; i < 11; i++) { await P.m.voix('fais un tas de pierres'); await flush(); await flush(); await P.avancer(3); }
  const ev = P.m.trace().evenements;
  assert.equal(P.ordres.filter(o => o.type === 'objet' && o.op === 'creer').length, 11);
  assert.ok(!ev.some(e => e.type === 'objet_refuse'), 'aucun refus');
  assert.ok(ev.filter(e => e.type === 'objet_recycle').length >= 3);
  assert.equal(ev.find(e => e.type === 'objet_recycle').id, 'fab-1', 'la plus ancienne d\'abord');
  assert.ok(P.monde.objets.length <= 8);
  assert.ok(P.m.partie().monde.places_libres >= 0);
});

test('monter : « grimpe à l\'arbre » le mène au tronc le plus proche et élève la caméra ; « descends » le ramène au sol', async () => {
  const P = promenade({ demander: sampler() });
  await P.avancer(1);
  const c = consigne(normaliserHistoire(LIBRE), P.m.partie(), compacter(P.monde.perception()), { type: 'voix', texte: 'x' }, reglagesDe(LIBRE));
  assert.match(c, /Autour, pour monter : arbre \(arbre\)/); assert.match(c, /monter sur/);
  await P.m.voix('grimpe à l\'arbre'); await flush();
  await P.avancer(15);
  assert.ok(P.monde.elev > 1, 'perché : ' + P.monde.elev);
  assert.ok(Math.hypot(P.monde.x - ARBRES[0].x, P.monde.z - ARBRES[0].z) < 1, 'contre le tronc');
  assert.ok(P.m.trace().evenements.some(e => e.type === 'monter'));
  assert.match(consigne(normaliserHistoire(LIBRE), P.m.partie(), compacter(P.monde.perception()), { type: 'voix', texte: 'x' }, reglagesDe(LIBRE)), /Tu es perché/);
  await P.m.voix('descends'); await flush(); await P.avancer(3);
  assert.equal(P.monde.elev, 0);
});

test('monter sans Claude : le secours comprend « monte sur le rocher », « grimpe », « accroupis-toi »', async () => {
  const P = promenade({});
  await P.avancer(1);
  await P.m.voix('monte sur le rocher'); await flush(); await P.avancer(20);
  assert.equal(P.monde.perche, 'rocher'); assert.ok(P.monde.elev > 1);
  await P.m.voix('accroupis-toi'); await flush(); await P.avancer(2);
  assert.equal(P.monde.haut, 0.5);
});

test('monter sans rien autour : l\'action est jetée et consignée, rien ne casse', async () => {
  const P = promenade({ demander: sampler() }, { arbres: [], rochers: [] });
  await P.avancer(1);
  await P.m.voix('grimpe à l\'arbre'); await flush(); await P.avancer(4);
  assert.ok(P.m.trace().evenements.some(e => e.type === 'monter_sans_support'));
  assert.equal(P.monde.elev, 0);
});

test('stop : la file est vidée tout de suite, avant toute réponse, et il ne repart pas de lui-même ; en histoire comme en promenade', async () => {
  for (const libre of [true, false]) {
    let lacher; const attente = new Promise(r => { lacher = r; });
    const base = sampler();
    const histoire = libre ? LIBRE : JSON.parse(JSON.stringify((await import('./outils.mjs')).ANLN));
    const monde = mondePapier(histoire, { flaner: true }), ordres = [];
    const m = creerMeneur({ histoire, secours: lexiqueTest, graine: 5, demander: (c, o) => voixDe(c) === 'arrête-toi' ? attente.then(() => base(c, o)) : base(c, o), emettre: x => { ordres.push(x); monde.executer(x); } });
    const avancer = async s => { for (let t = 0; t < s; t += 0.5) { m.tic(0.5, monde.perception()); monde.step(0.5); await flush(); } };
    await avancer(4);
    monde.file.push({ type: 'marcher', rest: 20 });
    m.voix('arrête-toi'); await flush();
    assert.equal(monde.file.length, 0, 'vidée sans attendre Claude');
    const x0 = monde.x, z0 = monde.z;
    lacher(); await flush(); await flush();
    await avancer(20);
    assert.ok(Math.hypot(monde.x - x0, monde.z - z0) < 1e-6, 'il ne bouge plus (même si la réponse disait de marcher)');
    assert.ok(m.trace().evenements.some(e => e.type === 'stop'));
    await m.voix('avance de 3 mètres'); await flush(); await avancer(6);
    assert.ok(Math.hypot(monde.x - x0, monde.z - z0) > 2, 'un nouvel ordre le fait repartir');
  }
});

test('estStop : les façons de dire stop, et ce qui n\'en est pas', () => {
  for (const t of ['stop', 'Stop !', 'arrête-toi', 'arrête', 'ne bouge plus', 'Bouge plus.', 'attends', 'reste là', 'halte', 'arrête de marcher', 'OK stop, ne bouge plus'])
    assert.ok(estStop(t), t);
  for (const t of ['arrête le feu', 'avance', 'éteins le feu', 'grimpe à l\'arbre', 'attends-moi au rocher puis monte dessus'])
    assert.ok(!estStop(t), t);
});

test('mode debug (DOCILE) : la page ajoute monter, rejoindre, reculer et la retouche que la réponse oublie ; le journal le dit', async () => {
  const oublieux = (c) => /accessoiriste/.test(c) ? sampler()(c) : Promise.resolve({ sas: { verdict: 'recevable', regle: null, motif: '' }, pensee: 'Ok.', attitude: 'suit', actions: [] });
  const P = promenade({ demander: oublieux, reglages: { DOCILE: true } });
  await P.avancer(1);
  const ev = () => P.m.trace().evenements;
  assert.ok(ev().some(e => e.type === 'mode_debug'), 'le journal dit que le mode debug est actif');
  assert.equal(P.m.trace().reglages.DOCILE, true);
  await P.m.voix('fais une crotte sur le chemin'); await flush(); await flush(); await P.avancer(12);
  assert.ok(P.monde.objets.some(o => o.id === 'fab-1'), 'la fabrique oubliée est ajoutée');
  await P.m.voix('éloigne-toi de 2 pas'); await flush(); await P.avancer(5);
  assert.ok(dist(P.monde, P.monde.objets[0]) > 1.6, 'le recul oublié est ajouté');
  await P.m.voix('mets 2 bâtons pour les bras sur cette crotte'); await flush(); await flush(); await P.avancer(20);
  assert.ok(P.ordres.some(o => o.op === 'remplacer' && o.id === 'fab-1'), 'la retouche oubliée est ajoutée');
  await P.m.voix('grimpe à l\'arbre'); await flush(); await P.avancer(15);
  assert.ok(P.monde.elev > 1, 'le monter oublié est ajouté');
  assert.ok(ev().filter(e => e.type === 'docile').length >= 3);
});

test('latence : un geste sûr part tout de suite pendant que Claude répond ; la consigne de la promenade tient dans le budget', async () => {
  let lacher; const attente = new Promise(r => { lacher = r; });
  const P = promenade({ demander: (c, o) => attente.then(() => sampler()(c, o)) });
  await P.avancer(1);
  P.m.voix('fais une crotte sur le chemin'); await flush();
  const imm = P.ordres.find(o => o.type === 'actions');
  assert.ok(imm && imm.actions[0].type === 'posture' && imm.actions[0].hauteur < 0.6, 'il se baisse avant la réponse');
  await P.avancer(2);
  assert.ok(P.monde.haut < 0.6);
  lacher(); await flush(); await flush();
  const c = consigne(normaliserHistoire(LIBRE), creerPartie(LIBRE), compacter(P.monde.perception()), { type: 'voix', texte: 'fais une crotte' }, reglagesDe(LIBRE));
  assert.ok(c.length < 7000, 'consigne de promenade : ' + c.length);
});

test('distances : on s\'arrête près d\'une petite chose, on la filme de près et accroupi ; une grande, de plus loin et debout', () => {
  assert.ok(distanceArret(0.2) <= 0.6); assert.ok(distanceArret(3) >= 1.9);
  assert.ok(planCadrage(0.2).m < 1 && planCadrage(0.2).hauteur === 0.5);
  assert.ok(planCadrage(4).m > 6 && planCadrage(4).hauteur === 1);
});

test('la promenade libre est un contrat valide, sans budget de choses nouvelles en pratique', () => {
  const v = validerHistoire(LIBRE);
  assert.ok(v.ok, JSON.stringify(v.erreurs));
  assert.equal(creerPartie(LIBRE).monde.objets_nouveaux_restants, REGLAGES.OBJETS_PARTIE_MAX);
  const c = consigneAtelier(normaliserHistoire(LIBRE), creerPartie(LIBRE), compacter({}), { fabrique: { nom: 'crotte', quoi: '3 kg', ou: 'pieds' }, texte: 'x' });
  assert.match(c, /envergure_m/); assert.match(c, /TAILLES RÉELLES/);
});

test('cas réel : « fais une petite crotte par terre, retourne-toi et montre-la-moi » ; la noix arrive 6 s après les gestes, elle est cadrée quand elle existe, assez grande à l\'image', async () => {
  const noix = { envergure_m: 0.035, nom: 'petite crotte', degage: 0, formes: [
    { f: 'boule', p: [0, 0.008, 0], taille: [0.035, 0.016, 0.03], couleur: '#4a3220', matiere: 'mat' },
    { f: 'boule', p: [0.002, 0.02, 0], taille: [0.024, 0.014, 0.02], couleur: '#523a26', matiere: 'mat' },
    { f: 'boule', p: [0.002, 0.03, 0], taille: [0.012, 0.01, 0.012], couleur: '#4a3220', matiere: 'mat' }] };
  let t = 0; const enAttente = [];
  const demander = (c) => {
    if (/accessoiriste/.test(c)) return new Promise(r => enAttente.push({ t: t + 6, r: () => r({ objet: noix, suite: null }) }));
    return Promise.resolve({ sas: { verdict: 'recevable', regle: null, motif: '' }, pensee: 'Voilà. Une toute petite.', attitude: 'suit',
      actions: [{ type: 'posture', hauteur: 0.45 }, { type: 'attendre', secondes: 1 }, { type: 'posture', hauteur: 1 }, { type: 'tourner', degres: 180 }, { type: 'viser', objet: 'fab-1' }],
      fabrique: { nom: 'crotte', quoi: 'petite crotte de la taille d\'une noix', ou: 'pieds' } });
  };
  const P = promenade({ demander });
  const avancer = async s => { for (let k = 0; k < s; k += 0.5) { t += 0.5; enAttente.filter(e => e.t <= t).forEach(e => { e.r(); e.t = 1e9; }); await flush();
    P.m.tic(0.5, P.monde.perception()); P.monde.step(0.5); await flush(); } };
  await avancer(1);
  await P.m.voix('fais une petite crotte par terre stp, retourne toi et montre la moi'); await flush();
  await avancer(4);
  assert.ok(!P.monde.objets.some(o => o.id === 'fab-1'), 'pas encore là : les gestes sont finis avant l\'objet');
  assert.ok(P.m.trace().evenements.some(e => e.type === 'pose_corrigee' && e.vers === 'dessous'), 'pieds corrigé en dessous');
  await avancer(20);
  const iCree = P.ordres.findIndex(o => o.op === 'creer');
  assert.ok(iCree > 0);
  assert.ok(P.ordres.slice(iCree).some(o => o.type === 'actions' && o.actions.some(a => a.type === 'cadrer')), 'cadrée une fois créée');
  const o = P.monde.perception().objets.find(x => x.id === 'fab-1');
  assert.ok(o.taille > 0.02 && o.taille < 0.06, 'taille d\'une noix : ' + o.taille);
  assert.ok(Math.abs(o.angle) < 6, 'face à elle : ' + o.angle);
  const oeil = 1.36 * P.monde.haut, d = Math.hypot(o.m, oeil), ang = 2 * Math.atan(o.taille / 2 / d);
  assert.ok(ang * P.monde.zoom >= 2.18 / 6 * 0.9, `au moins un sixième de l'image : ${(ang * P.monde.zoom / 2.18).toFixed(3)} (zoom ${P.monde.zoom}, ${o.m.toFixed(2)} m, yeux à ${oeil.toFixed(2)} m)`);
  assert.equal(P.monde.haut, 0.35, 'accroupi bas');
});

test('tailles connues : « de la taille d\'une noix », « grosse comme un poing »', () => {
  const [a, b] = bornesTaille('fais une petite crotte de la taille d\'une noix');
  assert.ok(a < 0.035 && b > 0.035 && b < 0.06);
  const [c, e] = bornesTaille('une pierre grosse comme un poing');
  assert.ok(c < 0.1 && e > 0.1 && e < 0.2);
});

test('pose relative au corps : ce qui tombe du corps est à l\'aplomb (derrière les talons), pas devant ; « retourne-toi et montre-la » la cadre là où elle est', async () => {
  const sas = { verdict: 'recevable', regle: null, motif: '' };
  const demander = (c) => {
    if (/accessoiriste/.test(c)) return Promise.resolve({ objet: { envergure_m: 0.15, nom: 'crotte', formes: [{ f: 'boule', p: [0, 0.04, 0], taille: [0.15, 0.08, 0.12], couleur: '#4a3220', matiere: 'mat' }] }, suite: null });
    const v = voixDe(c);
    if (/caca/.test(v)) return Promise.resolve({ sas, pensee: 'Bon.', attitude: 'suit', actions: [{ type: 'posture', hauteur: 0.45 }, { type: 'attendre', secondes: 3 }, { type: 'posture', hauteur: 1 }], fabrique: { nom: 'crotte', quoi: 'crotte', ou: 'dessous' } });
    return Promise.resolve({ sas, pensee: 'Tiens.', attitude: 'suit', actions: [{ type: 'tourner', degres: 180 }, { type: 'viser', objet: 'fab-1' }] });
  };
  const P = promenade({ demander });
  await P.avancer(1);
  P.monde.yaw = 0.6;                                                 // il regarde de biais
  const x0 = P.monde.x, z0 = P.monde.z, cap = P.monde.yaw;
  await P.m.voix('fais caca'); await flush(); await flush();
  const o = P.monde.objets.find(x => x.id === 'fab-1');
  const devant = Math.sin(cap) * (o.x - x0) + Math.cos(cap) * (o.z - z0);
  assert.ok(devant < 0 && devant > -0.3, 'à l\'aplomb, un peu derrière : ' + devant.toFixed(2));
  await P.avancer(12);
  await P.m.voix('retourne-toi et montre-la-moi'); await flush(); await P.avancer(15);
  const q = P.monde.perception().objets.find(x => x.id === 'fab-1'), pl = planCadrage(q.taille);
  assert.ok(Math.abs(q.angle) < 6 && Math.abs(q.m - pl.m) < 0.15, `cadrée : ${q.m.toFixed(2)} m, ${q.angle}°`);
  assert.equal(P.monde.zoom, pl.zoom);
  // le vocabulaire de pose
  for (const [ou, [a, m]] of Object.entries(OU_POSE)) { const p = placePose(0, 0, 0, ou); assert.ok(Math.abs(Math.hypot(p.x, p.z) - m) < 1e-9, ou); }
  assert.ok(placePose(0, 0, 0, 'devant').z > 2 && placePose(0, 0, 0, 'dessous').z < 0 && placePose(0, 0, 0, 'gauche').x < 0 && placePose(0, 0, 0, 'main').z < 0.5);
  assert.ok(Math.abs(placePose(0, 0, 0, 'devant', 3).z - 3) < 1e-9, 'distance dite');
});

