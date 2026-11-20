// Le panneau d'activité (docs/activite.md) : les lignes viennent de structures réelles, dans l'ordre, sans nom de modèle dans le code.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as M from '../src/meneur.js';
import { analyser, ligneEvenement, ligneAction } from '../src/activite.js';

const BIB = JSON.parse(readFileSync(new URL('../src/modeles.json', import.meta.url), 'utf8'));

test('activité : phrase analysée, événements, actions ; rien en dur', () => {
  const L = analyser('déplace-toi et fais une crotte de 20 kg', M, BIB).map(l => l.k + ' ' + l.t);
  assert.match(L[0], /^> entendre "déplace-toi/);
  assert.ok(L.findIndex(l => /ordre +: aller → faire/.test(l)) < L.findIndex(l => /faire +: modele\(/.test(l)));
  const m = M.modeleDe(BIB, 'crotte'), fm = M.formesModele(m.modele, 'une crotte de 20 kg');
  assert.ok(L.some(l => l.includes('modele(' + m.id + ')') && l.includes(fm.envergure.toFixed(2) + ' m')), L.join('\n'));
  assert.ok(L.some(l => /corps +: accroupi · effort/.test(l)));
  assert.deepEqual(analyser('bonjour', M, BIB).length, 2);                     // rien de local : une ligne qui le dit, pas d'invention
  assert.equal(ligneEvenement({ type: 'inconnu' }), null);
  assert.match(ligneEvenement({ type: 'objet_cree', id: 'fab-2', nom: 'x', formes: 9, envergure: 0.92 }).t, /fab-2 .* 9 formes · 0\.92 m/);
  assert.match(ligneAction({ type: 'posture', h: 0.42 }), /accroupi/);
  const src = readFileSync(new URL('../src/activite.js', import.meta.url), 'utf8');
  for (const id of Object.keys(BIB.modeles)) assert.ok(!new RegExp('\\b' + id + '\\b').test(src), 'nom de modèle dans le code : ' + id);
});
