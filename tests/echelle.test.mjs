// Échelle de l'ombrage v3 (src/echelle.js) : choix du programme et mémoire des échecs de compilation.
import test from 'node:test';
import assert from 'node:assert/strict';
import { choisir, noter, auDemarrage, aLaFermeture, auPlantage, lireMemoire, peutTenter, echecs, signature, empreinte, resumer, DELAI_OMBRAGE } from '../src/echelle.js';

const SIG = signature({ tapis: false, semis: true, atmo: true, rais: 10 }, empreinte('void main(){}'));

test('signature : réglages de la variante et empreinte du source', () => {
  assert.match(SIG, /^T0 S1 A1 R10 · [0-9a-z]+$/);
  assert.notEqual(empreinte('a'), empreinte('b'));
  assert.equal(empreinte('abc'), empreinte('abc'));
});

test('échelle : rien de prêt, pas d’image ; socle prêt, il dessine ; la complète se tente après la première image', () => {
  assert.deepEqual(choisir({}), { utiliser: null, tenter: false, socle: true });
  assert.deepEqual(choisir({ soclePret: true, sig: SIG }), { utiliser: 'socle', tenter: false, socle: true });
  assert.deepEqual(choisir({ soclePret: true, imageFaite: true, sig: SIG }), { utiliser: 'socle', tenter: true, socle: true });
  assert.equal(choisir({ soclePret: true, pleinePrete: true, imageFaite: true, sig: SIG }).utiliser, 'plein');
  assert.equal(choisir({ pleinePrete: true, sig: SIG }).utiliser, 'plein');        // déjà compilée (retour sur une fiche) : directement
});

test('modes forcés : socle reste au socle, plein attend la complète', () => {
  assert.deepEqual(choisir({ mode: 'socle', soclePret: true, pleinePrete: true, imageFaite: true }), { utiliser: 'socle', tenter: false, socle: true });
  assert.deepEqual(choisir({ mode: 'plein', soclePret: true }), { utiliser: null, tenter: true, socle: false });
  assert.deepEqual(choisir({ mode: 'plein', pleinePrete: true }), { utiliser: 'plein', tenter: false, socle: false });
  const m = noter({}, SIG, 'erreur');                                                // la mémoire n'arrête pas le mode plein (captures)
  assert.equal(choisir({ mode: 'plein', mem: m, sig: SIG }).tenter, true);
});

test('mémoire : en cours puis ok ; en cours au rechargement devient échec et n’est plus tentée', () => {
  let m = noter({}, SIG, 'debut', { now: 1 });
  assert.equal(m[SIG].etat, 'en cours');
  assert.equal(peutTenter(m, SIG), true);
  const ok = noter(m, SIG, 'ok', { now: 2, ms: 8123.4 });
  assert.deepEqual(ok[SIG], { etat: 'ok', ms: 8123, t: 2 });
  assert.deepEqual(auDemarrage(ok).echecs, []);
  // la page tombe pendant la compilation : au chargement suivant, l'essai resté « en cours » est un échec
  const r = auDemarrage(lireMemoire(JSON.stringify(m)), 5);
  assert.deepEqual(r.echecs, [SIG]);
  assert.equal(r.mem[SIG].cause, 'interrompu');
  assert.equal(peutTenter(r.mem, SIG), false);
  assert.equal(choisir({ soclePret: true, imageFaite: true, mem: r.mem, sig: SIG }).tenter, false);
  assert.deepEqual(echecs(r.mem), [SIG]);
  // une autre variante (autre fiche, ou shader corrigé) se tente toujours
  assert.equal(peutTenter(r.mem, 'T0 S0 A0 R0 · x'), true);
});

test('mémoire : délai dépassé et erreur sont des échecs ; mémoire illisible = vide ; taille bornée', () => {
  assert.deepEqual(noter({}, SIG, 'delai', { ms: 25000 })[SIG], { etat: 'echec', cause: 'délai', ms: 25000, t: 0 });
  assert.equal(noter({}, SIG, 'erreur')[SIG].etat, 'echec');
  assert.deepEqual(lireMemoire('pas du json'), {});
  assert.deepEqual(lireMemoire('[1,2]'), {});
  assert.deepEqual(lireMemoire(null), {});
  let m = {};
  for (let i = 0; i < 40; i++) m = noter(m, 'v' + i, 'ok', { now: i, ms: 1 });
  assert.equal(Object.keys(m).length, 24);
  assert.ok(m.v39 && !m.v0);
  assert.match(resumer(noter({}, SIG, 'delai', { ms: 25000 }))[0], /échec \(délai, 25 s\)/);
});

test('délai : n’interdit pas un nouvel essai (anciennes versions comprises) ; seuls plantage et erreur interdisent', () => {
  assert.ok(DELAI_OMBRAGE >= 40000);
  const d = noter({}, SIG, 'delai', { ms: 25000 });
  assert.equal(peutTenter(d, SIG), true);
  assert.deepEqual(echecs(d), []);
  assert.equal(choisir({ soclePret: true, imageFaite: true, mem: d, sig: SIG }).tenter, true);
  const vieux = lireMemoire(JSON.stringify({ [SIG]: { etat: 'echec', cause: 'délai', ms: 45000, t: 1 } }));   // mémoire d’une ancienne page
  assert.equal(peutTenter(vieux, SIG), true);
  assert.equal(peutTenter(noter({}, SIG, 'erreur'), SIG), false);
});

test('fermeture normale : « en cours » oublié ; contexte perdu : « interrompu » tout de suite', () => {
  const m = noter({}, SIG, 'debut', { now: 1 });
  assert.deepEqual(aLaFermeture(m), {});
  assert.deepEqual(auDemarrage(aLaFermeture(m)).echecs, []);
  const p = auPlantage(m, 3);
  assert.equal(p[SIG].cause, 'interrompu');
  assert.equal(aLaFermeture(p)[SIG].cause, 'interrompu');
  assert.equal(peutTenter(p, SIG), false);
});
