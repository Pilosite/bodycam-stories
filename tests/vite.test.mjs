// Mode démo (REGLAGES_DEMO, « Claude réagit plus vite ») : une demande que la page reconnaît part dès la phrase, sans attendre
// Claude ; l'accessoiriste n'est pas appelé quand la bibliothèque suffit ; la réponse tardive de Claude ne refait rien.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { creerMeneur, histoireLibre, REGLAGES_DEMO } from '../src/meneur.js';
import { mondePapier, lexiqueTest, MODELES } from './outils.mjs';

const flush = () => new Promise(r => setImmediate(r));
const LIBRE = histoireLibre({ id: 'foret-test', titre: 'Forêt de grès', kit: 'foret', objets: [] });

test('démo : pensée et geste dès la phrase, chose posée sans accessoiriste, bonhomme sans attendre Claude', async () => {
  const monde = mondePapier(LIBRE, { flaner: false, arbres: [{ x: -2.6, z: 6, haut: 14, rayon: 0.3 }] }), ordres = [], appels = [];
  const lents = [];                                                // Claude répond quand on le décide (jamais pendant le geste)
  const m = creerMeneur({ histoire: LIBRE, secours: lexiqueTest, graine: 3, modeles: MODELES, reglages: REGLAGES_DEMO,
    demander: c => { appels.push(c); return new Promise(r => lents.push(r)); }, emettre: o => { ordres.push(o); monde.executer(o); } });
  let t = 0;
  const avancer = async s => { for (let k = 0; k < s; k += 0.5) { m.tic(0.5, monde.perception()); monde.step(0.5); t += 0.5; await flush(); } };
  await avancer(1);
  const n0 = ordres.length; m.voix('fais une petite crotte');
  const tout = ordres.slice(n0);
  assert.ok(tout.some(o => o.type === 'pensee'), 'pensée tout de suite');
  assert.ok(tout.some(o => o.type === 'actions' && o.actions.some(a => a.type === 'effort')), 'geste tout de suite');
  await flush();
  assert.ok(ordres.some(o => o.type === 'objet' && o.op === 'creer'), 'la chose est commandée sans attendre');
  assert.ok(!appels.some(c => /accessoiriste/.test(c)), 'pas d\'accessoiriste');
  const t0 = t; await avancer(12);
  assert.ok(monde.objets.some(o => o.id === 'fab-1'), 'posée en moins de 12 s');
  lents.splice(0).forEach(r => r({ sas: { verdict: 'recevable' }, pensee: 'Avec de la terre, alors.', attitude: 'suit', actions: [{ type: 'marcher', metres: 9 }], faits: ['il a fait une crotte'] }));
  const n1 = ordres.length; await flush(); await avancer(1);
  assert.ok(!ordres.slice(n1).some(o => o.type === 'actions' || o.type === 'pensee' && /terre/.test(o.texte)), 'la réponse tardive ne refait rien');
  m.voix('fais une énorme crotte'); await avancer(16);
  assert.ok(monde.objets.some(o => o.id === 'fab-2'), 'énorme posée');
  m.voix('va chercher des bâtons et des cailloux et fais-en un bonhomme de neige'); await flush(); await flush();
  assert.ok(ordres.some(o => o.type === 'objet' && o.op === 'faconner'), 'façonnage commandé sans attendre Claude');
  await avancer(60);
  assert.ok(monde.faconnes.length || monde.objets.some(o => /bonhomme/.test(o.nom || '')), 'bonhomme fait');
  assert.ok(t - t0 < 100, 'durée : ' + t);
});
