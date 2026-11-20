// Les bruitages (docs/bruitages.md, src/son.js) : le plan d'un exploit selon la démesure, calé dans le geste (§20), la chute,
// la reproductibilité, les bornes de gain, la synthèse. Sans navigateur ; le rendu par Web Audio est vérifié par tools/son.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { planExploit, caler, planChute, partition, synthese, alea, decoderPrise, enveloppe, creerSons, REGLAGES_SON } from '../src/son.js';
import { gesteExploit, palierExploit, formesModele } from '../src/meneur.js';
import { MODELES } from './outils.mjs';

const B = JSON.parse(readFileSync(new URL('../src/bruitages.json', import.meta.url), 'utf8'));
const EX = MODELES.exploit, BR = EX.bruit;
const M = Object.values(MODELES.modeles).find(m => m.origine === 'corps');   // le modèle qui sort du corps, sans le nommer
const facteurDe = phrase => formesModele(M, phrase).facteur;
const CAS = { petite: 'une petite crotte', '5 kg': 'une crotte de 5 kg', enorme: 'une énorme crotte', '20 kg': 'une crotte de 20 kg' };
function geste(phrase, graine = 4821, compteur = 1) {
  const f = facteurDe(phrase), pal = palierExploit(f, EX);
  const g = gesteExploit(f, EX, l => l[0]);
  return Object.assign(caler(g, BR, { graine, compteur }), { f, pal, g });
}

test('les données : une recette pour l\'exploit, des paliers, des prises qui existent', () => {
  assert.ok(B.recettes[BR.recette], 'la recette du modèle existe');
  for (const p of Object.values(BR.paliers)) for (const id of [...(p.prises || []), ...((p.avant || {}).prises || [])]) assert.ok(B.prises[id], 'prise ' + id);
  const tot = Object.values(B.prises).reduce((s, p) => s + p.pcm.length, 0);
  assert.ok(tot <= 80 * 1024, 'prises : ' + tot + ' octets');
  assert.ok(B.prises_credit && /CC/.test(B.prises_credit.licence) && B.prises_credit.source, 'crédit des prises');
  for (const p of Object.values(B.prises)) { const x = decoderPrise(p); assert.ok(Math.abs(x.length / p.sr - p.duree_s) < 0.01, 'durée décodée'); assert.ok(Math.max(...x.map(Math.abs)) > 0.8); }
});

test('petite contre énorme : nombre, durée, hauteur, force', () => {
  const P = Object.fromEntries(Object.entries(CAS).map(([k, ph]) => [k, geste(ph).plan]));
  const princ = p => p.bruits.find(b => b.principal);
  const petite = P.petite.bruits;
  assert.ok(petite.length >= 4 && petite.length <= 6, 'petite : 4 à 6 bruits');
  for (const b of petite) {
    assert.ok(b.duree >= 0.06 && b.duree <= 0.4, 'petite : bref ' + b.duree);
    assert.ok(b.f0 >= 180 && b.f0 <= 320, 'petite : aigu ' + b.f0);
    assert.ok(b.force <= 0.4, 'petite : timide ' + b.force);
  }
  for (const k of ['5 kg', 'enorme', '20 kg']) {
    const p = princ(P[k]);
    assert.ok(p.duree >= 2.5 && p.duree <= 5, k + ' : long ' + p.duree);
    assert.ok(p.f0 >= 45 && p.f0 <= 90, k + ' : grave ' + p.f0);
    assert.ok(p.force >= 0.85, k + ' : fort ' + p.force);
    assert.equal(p.fin, 'ridicule'); assert.ok(p.rates > 0);
    assert.ok(P[k].bruits.every(b => b === p || b.duree < p.duree), k + ' : le principal est le plus gros');
  }
  assert.ok(princ(P['20 kg']).duree > princ(P['5 kg']).duree && princ(P['20 kg']).f0 < princ(P['5 kg']).f0, 'plus démesuré : plus long, plus grave');
});

test('reproductible par la graine, varié d\'un tirage à l\'autre', () => {
  const a = geste(CAS.enorme, 7, 1).plan, b = geste(CAS.enorme, 7, 1).plan, c = geste(CAS.enorme, 7, 2).plan, d = geste(CAS.enorme, 8, 1).plan;
  assert.deepEqual(a, b);
  assert.notDeepEqual(a.bruits.map(x => x.duree), c.bruits.map(x => x.duree), 'autre compteur, autre tirage');
  assert.notDeepEqual(a.bruits.map(x => x.f0), d.bruits.map(x => x.f0), 'autre graine, autre tirage');
  const ev = a.bruits.at(-1), s1 = synthese(B.recettes[ev.recette], ev, 8000, B.prises), s2 = synthese(B.recettes[ev.recette], ev, 8000, B.prises);
  assert.deepEqual(s1, s2, 'la même source, échantillon par échantillon');
  const ev2 = c.bruits.at(-1), s3 = synthese(B.recettes[ev2.recette], ev2, 8000, B.prises);
  assert.notDeepEqual(s1.slice(0, 2000), s3.slice(0, 2000));
});

test('bornes : gain, durée, fréquences ; la source est sans continu et sa crête vaut 1', () => {
  for (let g = 1; g <= 30; g++) for (const ph of Object.values(CAS)) {
    for (const b of geste(ph, g, g).plan.bruits) {
      assert.ok(b.gain > 0 && b.gain <= REGLAGES_SON.gain_max, 'gain ' + b.gain);
      assert.ok(b.duree > 0 && b.duree <= REGLAGES_SON.duree_max_s);
    }
  }
  const ev = geste(CAS['20 kg']).plan.bruits.at(-1), P = partition(B.recettes.flatulence, ev);
  assert.ok(P.f.every(f => f >= REGLAGES_SON.hz_min && f <= REGLAGES_SON.hz_max));
  const s = synthese(B.recettes.flatulence, ev, 8000, B.prises);
  assert.ok(Math.abs(Math.max(...s.map(Math.abs)) - 1) < 1e-6);
  assert.ok(Math.abs(s.reduce((a, x) => a + x, 0) / s.length) < 0.01, 'moyenne nulle');
  const ch = planChute(B.recettes.chute, { masse: 1e6, distance: 0 });
  assert.ok(ch.gain <= REGLAGES_SON.gain_max && ch.duree <= 1.6);
});

test('la partition : ça cale et ça repart, la fin ridicule monte puis bulle', () => {
  const ev = geste(CAS['20 kg']).plan.bruits.at(-1), P = partition(B.recettes.flatulence, ev);
  assert.ok(P.rates.length >= 1, 'au moins un raté sur l\'énorme : ' + P.rates.length);
  for (const r of P.rates) { const i = Math.round((r.t + r.l / 2) * P.sr); assert.ok(P.a[i] < 0.05, 'silence pendant le raté'); }
  assert.ok(P.bulles.length >= 2, 'des bulles à la fin');
  const fin = B.recettes.flatulence.fins.ridicule, tf = P.duree - Math.min(fin.duree_s, 0.45 * P.duree);
  const avant = P.f[Math.round((tf - 0.05) * P.sr)], haut = Math.max(...P.f.slice(Math.round(tf * P.sr), Math.round((tf + 0.5 * fin.duree_s) * P.sr)));
  assert.ok(haut > avant * 1.5, 'la fin monte : ' + avant.toFixed(0) + ' → ' + haut.toFixed(0));
});

test('synchronisation : pendant l\'effort, entre les souffles, le plus gros juste avant la pose', () => {
  for (const [k, ph] of Object.entries(CAS)) for (let g = 1; g <= 12; g++) {
    const { actions, plan, pal } = geste(ph, g, g);
    const efforts = actions.filter(a => a.type === 'effort');
    assert.equal(actions.map(a => a.type).join(), geste(ph, g, g).g.map(a => a.type).join(), 'le geste garde son ordre');
    const total = efforts.reduce((s, a) => s + a.secondes, 0);
    assert.ok(efforts.every(a => a.secondes <= REGLAGES_SON.segment_max_s));
    for (const e of efforts) for (const b of e.bruits || []) assert.ok(b.t >= 0 && b.t + b.duree <= e.secondes + 1e-6, k + ' : dans son effort');
    const p = plan.bruits.at(-1);
    assert.ok(p.principal);
    assert.ok(plan.pose_t - (p.t_abs + p.duree) >= 0.2 && plan.pose_t - (p.t_abs + p.duree) <= 0.35, k + ' : le principal finit juste avant la pose');
    for (let i = 1; i < plan.bruits.length; i++) assert.ok(plan.bruits[i].t_abs >= plan.bruits[i - 1].t_abs + plan.bruits[i - 1].duree, 'pas de chevauchement');
    for (const s of plan.souffles) for (const b of plan.bruits) {   // un souffle dit : aucun bruit pendant qu'il le dit, ni le principal autour
      assert.ok(!(b.t_abs < s + BR.ecart_voix_s && b.t_abs + b.duree > s), k + ' : bruit sur un souffle');
    }
    if (pal === 'demesure') {
      assert.ok(plan.souffles.length >= 1 && plan.souffles.every(s => s < p.t_abs), 'tous les souffles avant le gros');
      assert.ok(total <= 14.5, 'l\'effort reste raisonnable : ' + total);
    }
    if (pal === 'normal') assert.equal(plan.souffles.length, 0);
  }
});

test('la chute : la masse donne la hauteur et la durée ; ce qui est loin est plus faible', () => {
  const R = B.recettes.chute, l = planChute(R, { masse: 0.2, graine: 1 }), m = planChute(R, { masse: 5, graine: 1 }), h = planChute(R, { masse: 40, graine: 1 });
  assert.ok(l.f0 > m.f0 && m.f0 > h.f0, 'plus lourd, plus grave');
  assert.ok(l.duree < m.duree && m.duree < h.duree, 'plus lourd, plus long');
  assert.ok(l.rebonds >= 1 && h.rebonds === 0, 'ce qui est léger rebondit');
  assert.ok(planChute(R, { masse: 5, distance: 6 }).gain < m.gain);
  const s = synthese(R, Object.assign({ recette: 'chute' }, h), 8000);
  assert.ok(s.length > 0.3 * 8000);
});

test('le lecteur sans Web Audio : rien ne casse, la chronologie vit (enveloppe, occupé)', () => {
  let t = 0;
  const S = creerSons({ fabriquer: () => null, bruitages: B, maintenant: () => t });
  assert.equal(S.geste(), false);
  const ev = geste(CAS.enorme).plan.bruits.at(-1);
  const x = S.jouer(ev); assert.ok(x && !x.audio);
  let fort = 0; for (t = 0.2; t <= 2; t += 0.1) fort = Math.max(fort, S.enveloppe());   // un raté peut tomber sur un instant donné : on regarde le début du bruit
  assert.ok(fort > 0.1, 'la caméra tremble avec le gros bruit');
  t = 0.5;
  assert.ok(S.occupe() > ev.duree - 0.6, 'une pensée attendra');
  t = ev.duree + 0.1; assert.equal(S.enveloppe(), 0); assert.equal(S.occupe(), 0);
  const S2 = creerSons({ fabriquer: () => { throw new Error('refusé'); }, bruitages: B });
  assert.equal(S2.geste(), false); assert.equal(S2.etat().contexte, 'refus');
  assert.ok(enveloppe(partition(B.recettes.flatulence, ev), ev, 1) <= 1);
  assert.ok(alea(1, 2)() !== alea(1, 3)());
});
