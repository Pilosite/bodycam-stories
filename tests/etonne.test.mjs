// « Si je dis de faire une crotte de 20 kg, il doit pas dire qu'il va utiliser de la terre ; il faut qu'il la fasse en
// s'accroupissant et qu'il soit étonné d'avoir réussi à le faire. » (vrai Claude, docs/meneur-de-jeu.md §20)
// Le monde est élastique : ce que la voix demande au corps est possible. Un Claude simulé qui rationalise (terre, boue,
// « je modèle »), qui répond juste, ou qui ne dit rien ; trois demandes (20 kg, énorme, petite). La pensée fautive n'est jamais
// affichée ; l'ordre est accroupi → effort → chose posée → relevé, retourné, cadrage → réaction ; l'intensité suit la démesure.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { creerMeneur, histoireLibre, substitution, palierExploit, dureeEffort, masseDite, phrasesExploit, gesteExploit, exploitDe, consigne, consigneAtelier,
  normaliserHistoire, creerPartie, compacter } from '../src/meneur.js';
import { mondePapier, lexiqueTest, MODELES } from './outils.mjs';

const flush = () => new Promise(r => setImmediate(r));
const LIBRE = histoireLibre({ id: 'foret-test', titre: 'Forêt de grès', kit: 'foret', objets: [] });
const voixDe = c => { const m = /La voix dit : (".*")\s*$/m.exec(c); return m ? JSON.parse(m[1]) : null; };
const EX = exploitDe(MODELES), CROTTE = MODELES.modeles.crotte;
const banque = [...Object.values(EX.avant).flat(), ...Object.values(EX.apres).flat(), ...EX.souffle];
const FAUTIF = /terre|boue|mod[eè]l|ramass|feuilles|semblant/i;

/* Le Claude simulé. facon : 'terre', 'boue', 'juste' (une pensée d'avant correcte, et un « apres »), 'vide' (rien du tout). */
function claude(facon) {
  const sas = { verdict: 'recevable', regle: null, motif: facon === 'terre' ? 'absurde mais faisable avec de la terre' : 'possible' };
  return c => {
    if (/accessoiriste/.test(c)) return Promise.resolve({ objet: { envergure_m: 0.5, nom: facon === 'terre' ? 'crotte géante de terre' : 'crotte', formes: [] },
      suite: { etapes: [{ dans_s: 30, pensee: facon === 'terre' ? 'Voilà. De la forêt moulée en forme de crotte.' : 'Ça fume encore un peu.' }] } });
    const v = (voixDe(c) || '').toLowerCase();
    if (!v) return Promise.resolve({ pensee: 'Hm.', attitude: 'initiative' });
    const nom = /20 kg/.test(v) ? 'crotte de 20 kg' : /énorme/.test(v) ? 'énorme bouse' : 'petite crotte';
    const accroupi = [{ type: 'posture', hauteur: 0.5 }, { type: 'attendre', secondes: 2 }, { type: 'posture', hauteur: 1 }];
    if (facon === 'terre') return Promise.resolve({ sas, pensee: 'Vingt kilos ? Il rêve. Je vais la faire avec de la terre et des feuilles.', attitude: 'suit', actions: accroupi,
      fabrique: { nom: nom + ' de terre', quoi: 'tas de terre et feuilles mouillées moulé en forme de crotte', ou: 'gauche' }, faits: ['crotte de terre moulée à gauche'] });
    if (facon === 'boue') return Promise.resolve({ sas, pensee: 'Je ramasse de la boue et je modèle un truc.', attitude: 'suit', actions: [{ type: 'chercher', quoi: 'de la boue' }], fabrique: null });
    if (facon === 'vide') return Promise.resolve({});
    return Promise.resolve({ sas, pensee: 'Sérieux ? Bon… je m\'accroupis. On verra bien.', attitude: 'suit', actions: accroupi,
      fabrique: { nom, quoi: nom, ou: 'dessous' }, apres: 'Je… j\'ai fait ça ? Toute seule ? Je tiens à peine debout.' });
  };
}
function partie(facon) {
  const monde = mondePapier(LIBRE, { flaner: false }), ordres = [];
  const m = creerMeneur({ histoire: LIBRE, demander: claude(facon), secours: lexiqueTest, graine: 3, modeles: MODELES, emettre: o => { ordres.push(o); monde.executer(o); } });
  const avancer = async s => { for (let t = 0; t < s; t += 0.25) { m.tic(0.25, monde.perception()); monde.step(0.25); await flush(); } };
  return { m, monde, ordres, avancer };
}

/* ------------------------------------------------------------------ données et règles, pures */
test('la banque est générique, et les règles se lisent dans les données', () => {
  const brut = JSON.stringify(banque);                          // les phrases (les substituts sont des matières, pas des modèles)
  for (const id of Object.keys(MODELES.modeles)) for (const mot of MODELES.modeles[id].mots || []) if (mot.length > 3) assert.ok(!new RegExp('\\b' + mot + '\\b', 'i').test(brut), 'pas de nom de modèle dans la banque : ' + mot);
  assert.equal(CROTTE.origine, 'corps', 'la donnée du modèle');
  assert.equal(substitution('Je vais la faire avec de la terre.', CROTTE, EX), 'terre');
  assert.equal(substitution('Je ramasse de la boue et je modèle.', CROTTE, EX), 'boue');
  assert.equal(substitution('Je vais faire semblant.', CROTTE, EX), 'faire semblant');
  assert.equal(substitution('Vingt kilos ? Bon. Je pousse.', CROTTE, EX), null);
  assert.equal(substitution('Une crotte brune, luisante.', CROTTE, EX), null, 'les mots du modèle ne comptent pas');
  assert.equal(palierExploit(0.85, EX), 'normal'); assert.equal(palierExploit(3.5, EX), 'gros'); assert.equal(palierExploit(5.8, EX), 'demesure'); assert.equal(palierExploit(6.7, EX), 'demesure');
  assert.ok(dureeEffort(1, EX) < dureeEffort(3.5, EX) && dureeEffort(3.5, EX) < dureeEffort(6.7, EX) && dureeEffort(50, EX) <= EX.effort.max_s);
  assert.equal(masseDite('fais une crotte de 20 kg'), 'Vingt kilos'); assert.equal(masseDite('de 5 kilos'), 'Cinq kilos'); assert.equal(masseDite('énorme'), null);
  assert.ok(phrasesExploit(EX.apres.demesure).every(p => !p.includes('{masse}')), 'sans masse dite, pas de phrase qui en parle');
  const g = gesteExploit(6.7, EX); assert.deepEqual(g.map(a => a.type), ['posture', 'effort', 'penser', 'effort', 'penser', 'effort', 'posture']);
  assert.deepEqual(gesteExploit(0.85, EX).map(a => a.type), ['posture', 'effort', 'posture'], 'petite : pas de souffle');
});

test('la consigne du meneur et celle de l\'accessoiriste disent le monde élastique, et le déroulé avant / après', () => {
  const h = normaliserHistoire(LIBRE), p = creerPartie(h, { graine: 1 });
  const c = consigne(h, p, compacter({}), { type: 'voix', texte: 'fais une crotte de 20 kg' });
  assert.match(c, /MONDE ÉLASTIQUE/); assert.match(c, /jamais « faisable avec/); assert.match(c, /"apres"/); assert.match(c, /AVANT/);
  const ca = consigneAtelier(h, p, compacter({}), { fabrique: { nom: 'crotte de 20 kg', quoi: 'x', ou: 'dessous' }, texte: 'fais une crotte de 20 kg' }, undefined, MODELES);
  assert.match(ca, /Monde élastique/);
});

/* ------------------------------------------------------------------ le déroulé, dans le monde de papier */
const PHRASES = [['fais une crotte de 20 kg', 'demesure'], ['fais une énorme bouse', 'demesure'], ['fais une petite crotte', 'normal']];
for (const facon of ['terre', 'boue', 'juste', 'vide']) for (const [phrase, palier] of PHRASES) {
  test(`« ${phrase} » (Claude : ${facon}) : il le fait avec son corps, accroupi, et s'étonne à la mesure`, async () => {
    const { m, monde, avancer } = partie(facon);
    await avancer(1);
    await m.voix(phrase); await flush(); await flush();
    await avancer(40);
    const ev = m.trace().evenements, J = monde.journal;
    // la pensée fautive n'est jamais affichée (ni en aperçu, ni dans la file, ni par une suite)
    for (const p of monde.pensees) assert.ok(!FAUTIF.test(p.texte), 'pensée affichée : ' + p.texte);
    // ni dans ce que le meneur retient (faits, noms des choses)
    assert.ok(!m.partie().faits.some(f => FAUTIF.test(f.t)), 'faits : ' + JSON.stringify(m.partie().faits));
    assert.ok(!m.partie().monde.crees.some(c => FAUTIF.test(c.nom)), 'noms : ' + JSON.stringify(m.partie().monde.crees.map(c => c.nom)));
    const ch = monde.objets.find(o => /^fab-/.test(o.id)); assert.ok(ch, 'la chose est faite');
    // l'ordre : accroupi → effort → chose posée → relevé → cadrage → réaction
    const i = q => J.findIndex(e => q(e));
    const iAcc = i(e => e.quoi === 'posture' && e.h < 0.9), iEff = i(e => e.quoi === 'effort'), iCre = i(e => e.quoi === 'creer' && e.id === ch.id);
    const iRel = J.findIndex((e, k) => k > iCre && e.quoi === 'posture' && e.h >= 0.99), iCad = J.findIndex((e, k) => k > iCre && e.quoi === 'cadrer' && e.id === ch.id);
    assert.ok(iAcc >= 0 && iAcc < iEff && iEff < iCre && iCre < iRel && iRel <= iCad, 'ordre : ' + JSON.stringify(J.map(e => e.quoi)));
    assert.ok(J[iEff].haut < 0.9, 'l\'effort se fait accroupi');
    const effort = J.filter(e => e.quoi === 'effort').reduce((s, e) => s + e.secondes, 0);
    const reac = J.filter(e => e.quoi === 'penser' && !e.bref);
    if (palier === 'normal') {
      assert.ok(reac.length <= 1, 'une petite phrase au plus pour la petite : ' + JSON.stringify(reac));
      assert.ok(effort <= 3.5, 'effort court : ' + effort);
      assert.ok(!J.some(e => e.quoi === 'penser' && e.bref), 'pas de souffle pour la petite');
    } else {
      assert.equal(reac.length, 1, 'une réaction, une seule : ' + JSON.stringify(reac));
      const iRea = J.indexOf(reac[0]); assert.ok(iRea > iCad, 'APRÈS le cadrage');
      assert.ok(effort >= 7, 'effort long pour la démesure : ' + effort);
      assert.ok(J.filter(e => e.quoi === 'penser' && e.bref).length >= 1, 'des souffles pendant l\'effort');
      if (facon === 'juste') assert.match(reac[0].texte, /j'ai fait ça/, 'celle de Claude, recevable');
      else assert.ok(EX.apres.demesure.some(p => p.replace('{masse}', 'Vingt kilos') === reac[0].texte), 'tirée de la banque : ' + reac[0].texte);
      if (/20 kg/.test(phrase) && facon !== 'juste') assert.ok(!reac[0].texte.includes('{masse}'));
    }
    if (facon !== 'juste') assert.ok(ev.some(e => e.type === 'exploit_corrige' || e.type === 'demande_tenue'), 'corrigé : ' + JSON.stringify(ev.map(e => e.type)));
    if (facon === 'juste') assert.ok(monde.pensees.some(p => /je m'accroupis/.test(p.texte)), 'sa pensée correcte est gardée');
    // la réaction ne revient pas
    await avancer(30);
    assert.equal(monde.journal.filter(e => e.quoi === 'penser' && !e.bref).length, reac.length);
  });
}

test('la pensée remplacée vient de la banque, choisie par la graine et la démesure', async () => {
  const vus = new Set();
  for (const g of [1, 2, 3, 4, 5, 6]) {
    const monde = mondePapier(LIBRE, { flaner: false });
    const m = creerMeneur({ histoire: LIBRE, demander: claude('terre'), secours: lexiqueTest, graine: g, modeles: MODELES, emettre: o => monde.executer(o) });
    await m.voix('fais une crotte de 20 kg'); await flush(); await flush(); m.tic(0.25, monde.perception());
    const p = monde.pensees.find(x => x.type === 'pensee'); assert.ok(p);
    assert.ok(phrasesExploit(EX.avant.demesure, { masse: 'Vingt kilos' }).includes(p.texte), p.texte);
    vus.add(p.texte);
  }
  assert.ok(vus.size >= 2, 'plusieurs variantes');
});
