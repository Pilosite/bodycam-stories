// « Il faut que le perso soit un peu dégoûté de faire un bonhomme avec sa propre crotte. » puis « le perso peut vomir pendant
// qu'elle fait le bonhomme » (docs/meneur-de-jeu.md §22). Monde de papier : une chose répugnante petite / énorme, ou neutre,
// façonnée en bonhomme, avec un Claude qui fournit ou non ses propres pensées (« en_faisant »). Pensées par phase, ordre,
// espacement, intensité, hésitation et essuyage, réaction finale unique, humeur, nausée (seuil, déroulé, une fois, flaque
// d'ambiance jamais ciblée) ; rien pour la chose neutre ; aucun mot de modèle dans le code.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { creerMeneur, histoireLibre, degoutDe, intensiteDegout, planDegout, gesteFaconnage, evitementDit, consigne, normaliserHistoire, creerPartie, compacter, formesModele } from '../src/meneur.js';
import { mondePapier, lexiqueTest, MODELES } from './outils.mjs';

const flush = () => new Promise(r => setImmediate(r));
const LIBRE = histoireLibre({ id: 'foret-test', titre: 'Forêt de grès', kit: 'foret', objets: [] });
const voixDe = c => { const m = /La voix dit : (".*")\s*$/m.exec(c); return m ? JSON.parse(m[1]) : null; };
const ARBRES = [{ x: -2.6, z: 6, haut: 14, rayon: 0.3 }, { x: 3, z: -5, haut: 14, rayon: 0.3 }], ROCHERS = [{ x: 6, z: 14, haut: 1.4, rayon: 1.1 }];
const sas = { verdict: 'recevable', regle: null, motif: 'possible' }, accroupi = [{ type: 'posture', hauteur: 0.45 }, { type: 'attendre', secondes: 3 }, { type: 'posture', hauteur: 1 }];
if (MODELES.degout && MODELES.degout.nausee) MODELES.degout.nausee.actif = true;   // éteinte dans les données (demande de Toine) : les tests de la nausée la rallument
const DG = degoutDe(MODELES), NZ = DG.nausee;
const banque = k => Object.values(DG[k]).flat();
const EF = { avant: 'Avec mes mains. Bon. Je retiens ma respiration.', contact: 'Tiède. C\'est tiède. Je vais mourir.', pendant: ['Par la bouche. On respire par la bouche.', 'Ne regarde pas tes doigts.'],
  autre: 'Du bois sec. Merci, la forêt.', fin: 'C\'est atroce. Et il me sourit, en plus.' };

/* Le Claude simulé : chose = 'petite' | 'enorme' | 'feuilles' ; ef : ses pensées « en_faisant » (ou une version fautive). */
function claude(chose, ef = null) {
  return c => {
    if (/accessoiriste/.test(c)) {
      if (/LA CHOSE, telle qu'elle est/.test(c)) return Promise.resolve({ retouche: { nom: 'bonhomme', ajoute: [] }, suite: null });
      if (chose === 'feuilles') return Promise.resolve({ objet: { envergure_m: 0.6, nom: 'tas de feuilles', formes: [{ f: 'boule', p: [0, 0.15, 0], taille: [0.6, 0.3, 0.5], couleur: '#8a5a2a', matiere: 'mat' }] }, suite: null });
      return Promise.resolve({ objet: { envergure_m: 0.3, nom: chose === 'enorme' ? 'énorme crotte' : 'petite crotte', formes: [] }, suite: null });
    }
    const v = (voixDe(c) || '').toLowerCase();
    if (!v) return Promise.resolve({ pensee: 'Hm.', attitude: 'initiative' });
    if (/bonhomme/.test(v)) return Promise.resolve(Object.assign({ sas, pensee: 'Un bonhomme. Je vais chercher ce qu\'il faut.', attitude: 'suit',
      actions: [{ type: 'chercher', quoi: 'batons et cailloux' }], fabrique: { nom: 'bonhomme', quoi: 'bonhomme de neige avec bâtons et cailloux', ou: 'gauche' } }, ef ? { en_faisant: ef } : {}));
    if (/feuilles/.test(v)) return Promise.resolve({ sas, pensee: 'Un tas de feuilles. Facile.', attitude: 'suit', actions: accroupi, fabrique: { nom: 'tas de feuilles', quoi: 'tas de feuilles mortes, 60 cm', ou: 'devant' } });
    return Promise.resolve({ sas, pensee: 'Bon. Regarde ailleurs.', attitude: 'suit', actions: accroupi, fabrique: { nom: chose === 'enorme' ? 'énorme crotte' : 'petite crotte', quoi: 'crotte', ou: 'dessous' } });
  };
}
async function jouer(chose, { ef = null, graine = 3 } = {}) {
  const monde = mondePapier(LIBRE, { flaner: false, arbres: ARBRES, rochers: ROCHERS });
  const m = creerMeneur({ histoire: LIBRE, demander: claude(chose, ef), secours: lexiqueTest, graine, modeles: MODELES, emettre: o => monde.executer(o) });
  const avancer = async s => { for (let t = 0; t < s; t += 0.25) { m.tic(0.25, monde.perception()); monde.step(0.25); await flush(); } };
  await avancer(1);
  await m.voix(chose === 'feuilles' ? 'fais un tas de feuilles' : chose === 'enorme' ? 'fais une énorme crotte' : 'fais une petite crotte'); await flush(); await flush();
  await avancer(30);
  const humeur0 = Object.assign({}, m.partie().porteur), n0 = monde.pensees.length;
  await m.voix('fais un bonhomme de neige avec, va chercher des bâtons et des cailloux'); await flush(); await flush();
  await avancer(90);
  return { m, monde, humeur0, pensees: monde.pensees.slice(n0), ev: m.trace().evenements, J: monde.journal };
}

/* ------------------------------------------------------------------ règles pures */
test('données génériques ; intensité selon répugnance × taille × fraîcheur × soi ; évitements', () => {
  const brut = JSON.stringify(['avant', 'contact', 'pendant', 'autre', 'fin'].map(banque).concat(NZ.signes, NZ.pardon, NZ.reprise));
  for (const m of Object.values(MODELES.modeles)) for (const mot of m.mots || []) if (mot.length > 3) assert.ok(!new RegExp('\\b' + mot + '\\b', 'i').test(brut), 'banque sans nom de modèle : ' + mot);
  const code = ['src/main.js', 'src/meneur.js'].map(f => readFileSync(new URL('../' + f, import.meta.url), 'utf8')).join('\n').split('\n')
    .filter(l => !/rochers=|SECOURS|EN_MAIN|pensee: |mots:|nom: '|quoi: '|crotte|\/\/|\/\*|\*\/|^\s*\*/.test(l)).join('\n');   // comme demo.test.mjs
  for (const id of Object.keys(MODELES.modeles)) assert.ok(!new RegExp('\\b' + id + '\\b').test(code), 'le code ne nomme pas le modèle ' + id);
  for (const mot of ['vomi', 'vomit', 'flaque']) assert.ok(!new RegExp('\\b' + mot + '\\b').test(code.replace(/vomir/g, '')), 'ni « ' + mot + ' »');
  const r = MODELES.modeles.crotte.repugnance;
  const petite = intensiteDegout({ repugnance: r, facteur: 0.85 }, DG), enorme = intensiteDegout({ repugnance: r, facteur: 5.8 }, DG);
  assert.equal(petite.palier, 'leger'); assert.equal(enorme.palier, 'fort'); assert.ok(enorme.intensite > petite.intensite);
  assert.ok(intensiteDegout({ repugnance: r, facteur: 5.8, age_min: 30 }, DG).intensite < enorme.intensite, 'moins fraîche, moins fort');
  assert.ok(intensiteDegout({ repugnance: r, facteur: 5.8, soi: false }, DG).intensite < enorme.intensite, 'pas de lui, moins fort');
  assert.equal(intensiteDegout({ repugnance: 0, facteur: 5.8 }, DG), null, 'neutre : rien');
  assert.ok(evitementDit('Je mets des gants.', DG)); assert.ok(evitementDit('Je fais ça avec un bâton.', DG)); assert.equal(evitementDit('C\'est tiède.', DG), null);
});

test('planDegout : pensées accrochées aux phases par leur nom, espacées, la nausée à la fin du contact', () => {
  const C = formesModele(MODELES.modeles.crotte, 'une énorme crotte').formes, B = [{ f: 'boule', p: [0, 0.1, 0], taille: [0.2, 0.2, 0.2], couleur: '#5a3d22', matiere: 'pate-organique' },
    { f: 'boule', p: [0, 0.27, 0], taille: [0.14, 0.14, 0.14], couleur: '#5a3d22', matiere: 'pate-organique' }, { f: 'boule', p: [0, 0.39, 0], taille: [0.1, 0.1, 0.1], couleur: '#5a3d22', matiere: 'pate-organique' },
    { f: 'capsule', p: [0.1, 0.28, 0], taille: [0.01, 0.12, 0.01], couleur: '#555555', matiere: 'bois' }, { f: 'boule', p: [0.02, 0.4, 0.05], taille: [0.015, 0.015, 0.015], couleur: '#eeeeee', matiere: 'pierre' }];
  const T = gesteFaconnage(C, B, []);
  for (const duree of [11, 16]) {                                // le rendu du geste peut s'allonger : les accroches tiennent
    const T2 = gesteFaconnage(C, B, [], { duree }).map(t => Object.assign({}, t, { duree: t.duree * duree / 11 }));
    const p = planDegout(T2, { intensite: 0.86, palier: 'fort', contact: 'c', pendant: ['p1', 'p2'], autre: 'a', nausee: { tirage: 0.99, signe: 's', pardon: 'pa', reprise: 'r' } }, DG);
    const ts = p.pensees.map(x => x.t).concat(p.nausee ? [p.nausee.t] : []).sort((a, b) => a - b);
    for (let i = 1; i < ts.length; i++) assert.ok(ts[i] - ts[i - 1] >= DG.espacement_s - 1e-6, 'espacement : ' + ts);
    assert.equal(p.pensees[0].phase, 'contact');
    assert.ok(p.nausee, 'énorme : la nausée'); assert.ok(NZ.phases_contact.includes(p.nausee.apres), 'après une phase de contact : ' + p.nausee.apres);
    assert.ok(p.nausee.duree >= 6 && p.nausee.duree <= 9, 'déroulé de 6 à 9 s : ' + p.nausee.duree);
    const autre = p.pensees.find(x => x.phase === 'autre'), s0 = T2.slice(0, T2.findIndex(t => t.geste === 'prendre')).reduce((x, t) => x + t.duree, 0);
    if (autre) assert.ok(autre.t >= s0, 'autre : quand il prend autre chose');
    assert.ok(p.detourne.length >= 2 && p.detourne.every(x => x.amp > 0.4), 'regards détournés amples');
  }
  const leg = planDegout(T, { intensite: 0.36, palier: 'leger', contact: 'c', pendant: ['p1'], autre: 'a', nausee: { tirage: 0 } }, DG);
  assert.ok(!leg.nausee, 'petite : jamais de nausée'); assert.ok(leg.detourne.every(x => x.amp < 0.3));
});

test('la consigne parle du corps et de la dignité quand une chose répugnante est là, pas sinon', () => {
  const h = normaliserHistoire(LIBRE), p = creerPartie(h, { graine: 1 });
  assert.doesNotMatch(consigne(h, p, compacter({}), { type: 'voix', texte: 'x' }), /CORPS ET DIGNITÉ/);
  p.monde.crees.push({ id: 'fab-1', nom: 'crotte', min: 0, liste: [], formes: 0, echelle: 1, retire: false, source: 'modele', repugnance: 0.9 });
  const c = consigne(h, p, compacter({}), { type: 'voix', texte: 'x' });
  assert.match(c, /CORPS ET DIGNITÉ/); assert.match(c, /"en_faisant"/); assert.match(c, /pas de gants/);
});

/* ------------------------------------------------------------------ le déroulé, dans le monde de papier */
for (const chose of ['petite', 'enorme']) for (const ia of [false, true]) {
  test(`bonhomme fait avec la ${chose} (Claude ${ia ? 'donne' : 'ne donne pas'} ses pensées) : il hésite, le dit, s'essuie, réagit une fois`, async () => {
    const { m, monde, humeur0, pensees, ev, J } = await jouer(chose, { ef: ia ? EF : null });
    const dg = ev.find(e => e.type === 'degout'); assert.ok(dg, 'dégoût : ' + JSON.stringify(ev.map(e => e.type)));
    assert.equal(dg.palier, chose === 'enorme' ? 'fort' : 'leger');
    const iq = q => J.findIndex(q);
    const iH = iq(e => e.quoi === 'hesiter'), iF = iq(e => e.quoi === 'faconner_debut'), iFin = iq(e => e.quoi === 'faconner_fin'), iE = iq(e => e.quoi === 'essuyer');
    const iCad = J.findIndex((e, k) => k > iE && e.quoi === 'cadrer'), fins = J.filter(e => e.quoi === 'penser' && !e.phase && !e.bref && J.indexOf(e) > iE);
    assert.ok(iH >= 0 && iH < iF && iF < iFin && iFin < iE && iE < iCad, 'ordre hésite → façonne → essuie → cadre : ' + JSON.stringify(J.map(e => e.quoi)));
    assert.equal(fins.length, 1, 'une réaction finale, une seule : ' + JSON.stringify(fins)); assert.ok(J.indexOf(fins[0]) > iCad, 'après le cadrage');
    // les pensées du geste, par phase et dans l'ordre
    const ph = pensees.filter(p => p.source === 'degout').map(p => p.phase);
    assert.equal(ph[0], 'contact'); assert.ok(ph.includes('pendant'));
    if (chose === 'enorme') assert.ok(ph.filter(x => x === 'pendant').length + (ph.includes('autre') ? 1 : 0) >= 2, 'fort : plus de pensées : ' + ph);
    // au plus une pensée toutes les ~3 s, de l'avant à la réaction
    const t = pensees.filter(p => p.type === 'pensee' && J.length).map(p => p.t).filter(x => x >= J[iH].t - 0.01);
    for (let i = 1; i < t.length; i++) assert.ok(t[i] - t[i - 1] >= 2.99, 'espacement : ' + t.join(' '));
    // les textes : ceux de Claude s'ils sont donnés, sinon la banque
    const av = pensees.find(p => p.t <= J[iH].t + 0.01 && p.t >= J[iH].t - 1 && p.source === 'file');
    if (ia) { assert.ok(pensees.some(p => p.texte === EF.contact)); assert.equal(fins[0].texte, EF.fin); assert.ok(av && av.texte === EF.avant, 'avant : ' + JSON.stringify(av)); }
    else { assert.ok(banque('contact').includes(pensees.find(p => p.phase === 'contact').texte)); assert.ok(banque('fin').includes(fins[0].texte)); assert.ok(av && banque('avant').includes(av.texte)); }
    // l'humeur en garde la trace, et la mémoire
    const po = m.partie().porteur; assert.ok(po.agacement > humeur0.agacement, 'agacement : ' + humeur0.agacement + ' → ' + po.agacement);
    assert.ok(m.partie().faits.some(f => /mains nues|vomi/.test(f.t)), 'un fait : ' + JSON.stringify(m.partie().faits));
    // la nausée : toujours avec l'énorme, jamais avec la petite
    const nz = J.filter(e => /^nausee_/.test(e.quoi)).map(e => e.quoi.slice(7));
    if (chose === 'petite') assert.equal(nz.length, 0, 'petite : pas de nausée');
    else {
      assert.deepEqual(nz, ['lacher', 'detourner', 'pencher', 'vomir', 'souffler', 'essuyer', 'revenir'], 'déroulé une fois, dans l\'ordre');
      const lache = J.find(e => e.quoi === 'nausee_lacher'), rep = J.find(e => e.quoi === 'reprend'), fl = J.find(e => e.quoi === 'flaque');
      assert.equal(rep.tt, lache.tt, 'reprend au même point du geste');
      assert.ok(J.indexOf(fl) > J.indexOf(lache) && J.indexOf(fl) < J.indexOf(rep), 'la flaque quand il vomit');
      assert.ok(Math.abs(J.find(e => e.quoi === 'nausee_vomir').yaw - J.find(e => e.quoi === 'nausee_lacher').yaw) > 1, 'il s\'est détourné');
      const ouv = monde.objets.find(o => o.id === ev.find(e => e.type === 'faconnage').id), flq = monde.objets.find(o => o.id === fl.id);
      assert.ok(flq && Math.hypot(flq.x - ouv.x, flq.z - ouv.z) > 0.3, 'hors de l\'ouvrage');
      const duree = J[iFin].t - J[iF].t, plan = monde.degouts[0].plan; assert.ok(duree - plan.total >= 6 - 0.5 && duree - plan.total <= 9 + 0.5, 'façonnage allongé de 6 à 9 s : ' + (duree - plan.total));
      assert.ok(J.some(e => e.quoi === 'son' && e.evenement === 'nausee'), 'l\'accroche du bruitage');
      assert.ok(po.peur > humeur0.peur, 'la nausée laisse une trace');
      assert.ok(m.partie().monde.crees.find(c => c.id === fl.id).source === 'ambiance');
    }
  });
}

test('chose neutre (un tas de feuilles) : ni hésitation, ni pensées de dégoût, ni nausée', async () => {
  const { pensees, ev, J, m, humeur0 } = await jouer('feuilles');
  assert.ok(ev.some(e => e.type === 'faconnage'), 'il façonne : ' + JSON.stringify(ev.map(e => e.type)));
  assert.ok(!ev.some(e => e.type === 'degout' || e.type === 'degout_fin'));
  assert.ok(!J.some(e => ['hesiter', 'essuyer', 'faconner_debut', 'flaque'].includes(e.quoi) || /^nausee_/.test(e.quoi)));
  assert.ok(!pensees.some(p => p.source === 'degout' || p.source === 'nausee'));
  assert.equal(m.partie().porteur.agacement, humeur0.agacement);
});

test('pensées de Claude fautives (gants, bâton, refus) : remplacées par la banque', async () => {
  const { pensees, ev } = await jouer('enorme', { ef: { avant: 'Je mets des gants d\'abord.', contact: 'Je fais ça avec un bâton, sans toucher.', pendant: ['Je refuse de continuer.'], fin: 'Pas question.' } });
  for (const p of pensees) assert.ok(!/gants|bâton, sans|refuse|Pas question/.test(p.texte), 'pensée affichée : ' + p.texte);
  assert.ok(ev.find(e => e.type === 'degout').jetees >= 3);
});

test('la flaque n\'est jamais la cible de « avec ça » ni d\'un façonnage, et la nausée ne revient pas', async () => {
  const { m, monde, J } = await jouer('enorme');
  const fl = J.find(e => e.quoi === 'flaque'); assert.ok(fl);
  const n0 = J.filter(e => e.quoi === 'nausee_lacher').length;
  await m.voix('fais un bonhomme avec ça'); await flush(); await flush();
  for (let t = 0; t < 60; t += 0.25) { m.tic(0.25, monde.perception()); monde.step(0.25); await flush(); }
  const fa = m.trace().evenements.filter(e => e.type === 'faconnage');
  assert.ok(fa.every(e => e.id !== fl.id), 'jamais la flaque : ' + JSON.stringify(fa));
  assert.ok(monde.journal.filter(e => e.quoi === 'nausee_lacher').length - n0 <= 1, 'au plus une par façonnage');
});
