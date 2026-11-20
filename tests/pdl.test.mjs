// PDL en jetons (src/pdl.js) : déterministe, non vide, pas de caractère de remplacement ; vraies données de l'ouverture.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import * as PDL from '../src/pdl.js';
import { pdl, programme, alea } from '../src/ouverture.js';

const lire = p => JSON.parse(readFileSync(new URL('../' + p, import.meta.url), 'utf8'));
const R = lire('ouvertures/champcueil.json');
const SCENES = readdirSync(new URL('../scenes/', import.meta.url)).filter(f => f.endsWith('.json')).map(f => lire('scenes/' + f));
const F = SCENES.find(x => x.id === R.fiche) || SCENES.find(x => x.id === R.ficheSecours);
const PROPRE = s => !/[�{}"]/.test(s) && !/[\u{1F000}-\u{1FFFF}]/u.test(s);

test('trames de la fiche : déterministes, non vides, propres, comptées sur ce qui s\'affiche', () => {
  const a = pdl(F, R.personnage.reglages, R.comprendre, PDL), b = pdl(F, R.personnage.reglages, R.comprendre, PDL);
  assert.deepEqual(a, b);
  assert.ok(a.trames.length >= 5);
  for (const t of a.trames) { assert.ok(t.jetons.length > 0 && PROPRE(t.texte), t.texte); assert.match(t.entete, /^▣/); assert.match(t.somme, /^∴[0-9a-z]{2}$/); }
  assert.equal(a.tokens, a.trames.reduce((s, t) => s + t.n, 0) + a.trames.length - 1);
  assert.ok(a.gain > 50 && a.gain < 100, a.gain);
  // une traduction en clair retrouve une vraie valeur de la fiche
  const lieu = a.trames.find(t => t.classe === 'lieu');
  assert.ok(lieu.jetons.some(j => j.val === String(F.ambiance.soleil.hauteur).replace('.', ',')), lieu.jetons.map(PDL.traduire).join(' | '));
  // une autre donnée donne d'autres jetons
  const g = Object.assign({}, F, { ambiance: Object.assign({}, F.ambiance, { brume: 0.123 }) });
  assert.notEqual(pdl(g, null, null, PDL).trames.find(t => t.classe === 'air').texte, a.trames.find(t => t.classe === 'air').texte);
});

test('programme : l\'étape PDL porte les trames', () => {
  const ev = programme(R, F, alea(3), null, PDL).filter(e => e.genre === 'pdl');
  assert.ok(ev.length && ev.every(e => e.trame && e.texte === e.trame.texte));
});

test('demande, actions, réaction attendue', () => {
  const d = PDL.trameDemande('va chercher des cailloux', [{ k: ' ', t: 'faire      : modele(crotte) 20 kg → 0.92 m ×6.6' }]);
  assert.ok(d.jetons.length > 3 && PROPRE(d.texte) && d.texte.startsWith('▣◈'));
  assert.equal(PDL.trameActions([{ type: 'marcher', rest: 1.3 }]).texte, PDL.trameActions([{ type: 'marcher', rest: 1.3 }]).texte);
  const P = R.personnage.reglages;
  assert.equal(PDL.reactionAttendue(P, {}), null);
  const r = PDL.reactionAttendue(P, { repugnance: .9, facteur: 6, chercher: true });
  assert.ok(r.texte.includes('F30') && r.reaction.includes('obéit') && r.reaction.some(x => /dégoût/.test(x)) && r.reaction.includes('humour à froid'), r.texte);
  assert.ok(PROPRE(r.trame.texte));
});
