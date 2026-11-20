// « Faudrait des oiseaux qui tombent du ciel, morts, à cause de l'odeur de la crotte de 20 kg, avec un bruit de piaf
// mourant. » (docs/meneur-de-jeu.md §24) Une conséquence d'ambiance en données : au palier démesuré d'une chose répugnante
// qui sort du corps, 3 à 5 choses d'un modèle d'ambiance tombent autour d'elle, avec un cri qui déraille et un petit choc.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { creerMeneur, histoireLibre, planConsequences, placesChute, exploitDe } from '../src/meneur.js';
import { partition, synthese, planChute } from '../src/son.js';
import { mondePapier, MODELES } from './outils.mjs';

const BRUITAGES = JSON.parse(readFileSync(new URL('../src/bruitages.json', import.meta.url), 'utf8'));
const flush = () => new Promise(r => setImmediate(r));
const LIBRE = histoireLibre({ id: 'foret-test', titre: 'Forêt', kit: 'foret', objets: [] });
const EX = exploitDe(MODELES), C = EX.consequences[0], MC = MODELES.modeles[C.modele];
const rng = g => { let a = g >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), a | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; };
const SOURCE = Object.values(MODELES.modeles).find(m => m.origine === 'corps' && m.repugnance >= C.si.repugnance_min && !m.ambiance);

test('données : un modèle d\'ambiance léger, une recette de cri qui existe', () => {
  assert.ok(MC.ambiance, 'marqué ambiance');
  assert.ok(MC.formes.length >= 4 && MC.formes.length <= 7, 'budget de formes faible');
  assert.ok(MC.envergure_m >= 0.18 && MC.envergure_m <= 0.3);
  assert.ok(BRUITAGES.recettes[C.son.recette], 'recette du cri');
  const code = ['src/main.js', 'src/meneur.js', 'src/son.js'].map(f => readFileSync(new URL('../' + f, import.meta.url), 'utf8')).join('\n');
  for (const m of MC.mots) assert.ok(!new RegExp('\\b' + m + '\\b').test(code), 'le code ne nomme pas « ' + m + ' »');
});

test('déclenchement : seulement au palier démesuré d\'une chose répugnante du corps ; 3 à 5, espacées, de haut, vite', () => {
  for (let g = 1; g < 40; g++) {
    const p = planConsequences(MODELES, { palier: 'demesure', facteur: 6.5, modele: SOURCE }, rng(g));
    assert.ok(p && p.chutes.length >= 3 && p.chutes.length <= 5, 'nombre');
    p.chutes.forEach((c, i) => {
      if (i) { const e = c.t - p.chutes[i - 1].t; assert.ok(e >= 0.6 - 1e-9 && e <= 2 + 1e-9, 'écart ' + e); }
      assert.ok(c.hauteur >= 6 && c.hauteur <= 10 && c.chute_s >= 0.8 && c.chute_s <= 1.3);
      assert.ok(c.son.duree >= 0.4 && c.son.duree <= 0.8 && c.son.impact_kg < 0.2);
    });
    const pz = p.chutes.filter(c => c.pensee);
    assert.equal(pz.length, 1, 'une pensée'); assert.ok(p.chutes.indexOf(pz[0]) <= 1, 'après le premier ou le deuxième');
  }
  for (const palier of ['normal', 'gros']) assert.equal(planConsequences(MODELES, { palier, modele: SOURCE }, rng(1)), null, palier);
  assert.equal(planConsequences(MODELES, { palier: 'demesure', facteur: 4.1, modele: SOURCE }, rng(1)), null, '5 kg : pas assez');
  assert.equal(planConsequences(MODELES, { palier: 'demesure', facteur: 6.5, modele: Object.assign({}, SOURCE, { origine: null }) }, rng(1)), null, 'pas du corps');
  assert.equal(planConsequences(MODELES, { palier: 'demesure', facteur: 6.5, modele: Object.assign({}, SOURCE, { repugnance: 0 }) }, rng(1)), null, 'pas répugnante');
});

test('places : autour de la chose, du côté de la caméra, ni sur elle, ni sur le corps, ni dans un obstacle, ni l\'une sur l\'autre', () => {
  const chose = { x: 0, z: 0, r: 0.6 }, cam = { x: 0, z: 2.2 }, obs = [{ x: 0.9, z: 0.6, r: 0.4 }];
  for (let g = 1; g < 30; g++) {
    const p = planConsequences(MODELES, { palier: 'demesure', facteur: 6.5, modele: SOURCE }, rng(g)), P = placesChute(chose, cam, p.chutes, obs, 0.12);
    P.forEach((q, i) => {
      assert.ok(q, 'une place');
      assert.ok(Math.hypot(q.x, q.z) >= chose.r + 0.12, 'hors de la chose');
      assert.ok(Math.hypot(q.x - cam.x, q.z - cam.z) > 0.5, 'pas sur lui');
      assert.ok(Math.hypot(q.x - 0.9, q.z - 0.6) >= 0.52, 'pas dans l\'obstacle');
      assert.ok(Math.hypot(q.x, q.z) <= chose.r + 3.5, 'près');
      assert.ok(q.z > -0.4, 'du côté de la caméra');
      for (const r of P.slice(0, i)) assert.ok(Math.hypot(q.x - r.x, q.z - r.z) >= 0.24, 'pas l\'une sur l\'autre');
    });
  }
});

test('le cri descend, s\'emballe et cale ; le choc est mat et petit', () => {
  const p = planConsequences(MODELES, { palier: 'demesure', facteur: 6.5, modele: SOURCE }, rng(5)), s = p.chutes[0].son, rec = BRUITAGES.recettes[s.recette];
  const ev = { rang: 0, duree: s.duree, f0: s.f0, force: s.force, gain: 0.4, rates: s.rates, fin: 'cale', vibrato: s.vibrato, graine: 9, cle: 'cri:1' };
  const P = partition(rec, ev), n = P.f.length;
  assert.ok(P.f[n - 1] < P.f[0] * 0.6, 'glissando vers le grave : ' + P.f[0] + ' → ' + P.f[n - 1]);
  assert.ok(P.rates.length >= 1, 'ça cale');
  const x = synthese(rec, ev, 22050); assert.ok(x.length > 0.4 * 22050 && x.some(v => Math.abs(v) > 0.5));
  const ch = planChute(BRUITAGES.recettes.chute, { masse: s.impact_kg, distance: 2, graine: 9, cle: 1 });
  assert.ok(ch.duree < 0.2 && ch.f0 > 120, 'poc : ' + JSON.stringify(ch));
});

/* Le déroulé dans le monde de papier, Claude absent (la bibliothèque sert de base sûre). */
async function jouer(phrase) {
  const monde = mondePapier(LIBRE, { flaner: false }), ordres = [];
  const m = creerMeneur({ histoire: LIBRE, demander: () => Promise.resolve({ pensee: 'Bon.', attitude: 'suit', actions: [], fabrique: { nom: phrase.replace(/^fais /, ''), quoi: phrase, ou: 'dessous' } }),
    graine: 3, modeles: MODELES, emettre: o => { ordres.push(o); monde.executer(o); } });
  const avancer = async s => { for (let t = 0; t < s; t += 0.25) { m.tic(0.25, monde.perception()); monde.step(0.25); await flush(); } };
  await avancer(1); await m.voix(phrase); await flush(); await flush(); await avancer(30);
  return { ordres, m };
}
test('« une crotte de 20 kg » : des choses d\'ambiance qui tombent près d\'elle ; pas pour 5 kg', async () => {
  const { ordres, m } = await jouer('fais une crotte de 20 kg');
  const cr = ordres.filter(o => o.type === 'objet' && o.op === 'creer'), base = cr.find(o => !o.chute), ch = cr.filter(o => o.chute);
  assert.ok(base, 'la chose');
  assert.ok(ch.length >= 3 && ch.length <= 5, 'nombre : ' + ch.length);
  for (const o of ch) { assert.equal(o.pres_de, base.objet.id); assert.equal(o.objet.formes.length, MC.formes.length); assert.ok(o.chute.son && o.chute.hauteur >= 6); }
  const crees = m.trace().partie ? m.trace().partie.monde.crees : null;
  if (crees) for (const o of ch) assert.equal(crees.find(c => c.id === o.objet.id).source, 'ambiance');
  const petit = await jouer('fais une crotte de 5 kg');
  assert.equal(petit.ordres.filter(o => o.type === 'objet' && o.op === 'creer' && o.chute).length, 0, 'pas pour une grosse');
});
