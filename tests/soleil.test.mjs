// « Fais deux pas et regarde le soleil » (mode démo) : la page comprend seule, dans l'ordre (marcher puis regarder le soleil),
// la réaction ébloui porte la phrase exacte ; le cap visé est celui du soleil de la fiche ; la nuit, rien.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { creerMeneur, histoireLibre, REGLAGES_DEMO, secoursSoleil, validerActions, EBLOUI } from '../src/meneur.js';
import { soleilDir, regardSoleil, eblouissement } from '../src/lumiere.js';
import { mondePapier, lexiqueTest, MODELES } from './outils.mjs';

const flush = () => new Promise(r => setImmediate(r));
const FICHE = JSON.parse(readFileSync(new URL('../scenes/09-champcueil-aube.json', import.meta.url)));

test('les phrases du soleil sont reconnues, dans l\'ordre de la phrase', () => {
  assert.deepEqual(secoursSoleil('Fais deux pas et regarde le soleil'), [{ type: 'marcher', metres: 1.4 }, { type: 'regarder', vers: 'soleil' }]);
  assert.deepEqual(secoursSoleil('avance un peu et regarde le soleil'), [{ type: 'marcher', metres: 1.4 }, { type: 'regarder', vers: 'soleil' }]);
  for (const p of ['regarde le soleil', 'tourne-toi vers le soleil', 'lève les yeux vers le soleil'])
    assert.deepEqual(secoursSoleil(p), [{ type: 'regarder', vers: 'soleil' }], p);
  assert.equal(secoursSoleil('fais deux pas'), null);
  assert.equal(secoursSoleil('regarde l\'arbre'), null);
  assert.deepEqual(validerActions([{ type: 'regarder', vers: 'soleil' }, { type: 'regarder', vers: 'lune' }]), [{ type: 'regarder', vers: 'soleil' }, { type: 'regarder', degres: 0 }]);
});

test('démo : marcher → regarder le soleil → réaction, phrase exacte, sans attendre Claude', async () => {
  const L = histoireLibre(FICHE), monde = mondePapier(L, { flaner: false }), ordres = [], appels = [];
  const m = creerMeneur({ histoire: L, secours: lexiqueTest, graine: 3, modeles: MODELES, reglages: REGLAGES_DEMO,
    demander: c => { appels.push(c); return new Promise(() => {}); }, emettre: o => { ordres.push(o); monde.executer(o); } });
  m.tic(0.5, monde.perception()); await flush();
  const n0 = ordres.length; m.voix('Fais deux pas et regarde le soleil');
  const act = ordres.slice(n0).find(o => o.type === 'actions');
  assert.ok(act, 'geste tout de suite');
  assert.deepEqual(act.actions.map(a => a.type + (a.vers ? ':' + a.vers : '')), ['marcher', 'regarder:soleil']);
  assert.equal(act.actions[0].metres, 1.4);
  assert.equal(act.actions[1].dire, 'T\'es gentil, mais ça me cramerait les yeux.');
  assert.equal(EBLOUI.dire[0], 'T\'es gentil, mais ça me cramerait les yeux.');
  m.voix('regarde le soleil');
  const act2 = ordres.filter(o => o.type === 'actions').pop();
  assert.ok(act2.actions[0].dire && act2.actions[0].dire !== EBLOUI.dire[0], 'une variante la fois suivante');
});

test('le cap visé est la direction du soleil de la fiche ; la nuit, rien', () => {
  const so = FICHE.ambiance.soleil, r = regardSoleil(soleilDir(so), false);
  assert.ok(Math.abs(r.cap * 180 / Math.PI - so.azimut) < 0.01 && Math.abs(r.hauteur * 180 / Math.PI - so.hauteur) < 0.01 && r.visible);
  const d = soleilDir(so);
  assert.ok(eblouissement(d, d, false) > 0.25, 'face au soleil : léger effet');
  assert.equal(eblouissement([0, 0, -1].map((x, i) => i === 0 ? -d[0] : i === 2 ? -d[2] : 0), d, false), 0, 'dos au soleil : rien');
  assert.equal(regardSoleil(soleilDir({ azimut: 35, hauteur: -10 }), true).visible, false);
  assert.equal(eblouissement(d, d, true), 0, 'nuit : rien');
});
