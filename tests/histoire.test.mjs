// Étape 1 : normalisation v0 -> v1 et vérification des contrats d'histoire, sans IA.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { normaliserHistoire, validerHistoire } from '../src/meneur.js';

const lire = f => JSON.parse(readFileSync(new URL('../histoires/' + f, import.meta.url), 'utf8'));
const ANLN = lire('avant-la-nuit.json');
const copie = () => JSON.parse(JSON.stringify(ANLN));

test('les histoires du dépôt passent la vérification', () => {
  for (const f of readdirSync(new URL('../histoires/', import.meta.url)).filter(f => f.endsWith('.json'))) {
    const r = validerHistoire(lire(f));
    assert.deepEqual(r.erreurs, [], f);
  }
});

test('un contrat v0 se lit comme un v1 sans échéances, avec une fin par défaut à l\'heure', () => {
  const v0 = lire('chateau-minuit.json');
  const h = normaliserHistoire(v0);
  assert.equal(h.version, 1);
  assert.ok(h.temps.every(t => t.role === 'facultatif' && !t.des_que && !t.au_plus_tard_min));
  const d = h.fins.find(f => f.par_defaut);
  assert.ok(d && d.des_que[0].minutes === 15);
  assert.equal(v0.version, 0, 'le contrat d\'origine n\'est pas modifié');
});

const casses = [
  ['E_ID', h => { h.id = 'Avant la nuit !'; }],
  ['E_ID_DOUBLE', h => { h.temps[2].id = 'sac'; }],
  ['E_APRES_INCONNU', h => { h.temps[1].apres = ['nulle-part']; }],
  ['E_APRES_BOUCLE', h => { h.temps[1].apres = ['camp']; }],
  ['E_ECHEANCE', h => { delete h.temps[1].au_plus_tard_min; }],
  ['E_REPLIQUE', h => { delete h.temps[2].replique; }],
  ['E_ECHEANCE_ORDRE', h => { h.temps[2].au_plus_tard_min = 2; }],
  ['E_ECHEANCE_DUREE', h => { h.temps[4].au_plus_tard_min = 30; }],
  ['E_FIN_DEFAUT', h => { h.fins = h.fins.filter(f => !f.par_defaut); h.fins.forEach(f => { f.par_defaut = false; }); h.fins.push({ id: 'x', titre: 'x', par_defaut: true, des_que: [{ avance_m: 3 }] }); }],
  ['E_OBJET_INCONNU', h => { h.temps[1].des_que = [{ pres_de: { objet: 'cabane', m: 4 } }]; }],
  ['E_CONDITION', h => { h.temps[1].des_que = [{ jauge: { peur: 'beaucoup' } }]; }],
  ['E_ACCESSOIRE_INCONNU', h => { h.accessoires.push({ objet: 'drone', apres: [] }); }],
  ['E_LIMITE_OBJETS', h => { const o = h.lieux[0].fiche.objets; for (let i = 0; i < 3; i++) o.push(Object.assign({}, o[0], { id: 'sac' + i })); }],
  ['E_FIN_INATTEIGNABLE', h => { h.fins.push({ id: 'muette', titre: 'Muette' }); }],
];
for (const [code, casser] of casses) {
  test('contrat cassé : ' + code, () => {
    const h = copie(); casser(h);
    const r = validerHistoire(h);
    assert.equal(r.ok, false);
    assert.ok(r.erreurs.some(e => e.code === code), JSON.stringify(r.erreurs));
  });
}
