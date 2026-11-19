// La voix du personnage (src/voix.js) : la file et ses règles, avec de faux moteurs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { creerVoix, aLire } from '../src/voix.js';

const tick = () => new Promise(r => setTimeout(r, 0));

function fauxTts() {
  const f = { appels: [], stops: 0, refuser: null, en: [], etat: null };
  f.speak = (texte, o) => {
    f.appels.push({ texte, o });
    if (f.refuser) { const code = f.refuser; return Promise.reject({ code, message: code }); }
    return new Promise((res, rej) => { f.en.push({ res, rej }); });
  };
  f.stop = () => { f.stops++; return Promise.resolve(); };
  f.onState = h => { f.etat = h; return () => {}; };
  return f;
}
function fauxLocal() {
  const f = { dits: [], cancels: 0, cb: null };
  f.speak = (texte, o, cb) => { f.dits.push({ texte, o }); f.cb = cb; };
  f.cancel = () => { f.cancels++; };
  return f;
}

test('aLire : les « … » et la ponctuation seule ne se lisent pas, les longs textes sont coupés', () => {
  assert.equal(aLire('…'), '');
  assert.equal(aLire(' ... '), '');
  assert.equal(aLire(''), '');
  assert.equal(aLire(null), '');
  assert.equal(aLire('  Bon.\n On  y va. '), 'Bon. On y va.');
  const long = 'Une phrase assez longue. '.repeat(120);
  const c = aLire(long);
  assert.ok(c.length <= 2000 && c.endsWith('.'));
});

test('éteinte par défaut, rien ne part ; allumée, la pensée part par tts avec voix, débit et langue', async () => {
  const t = fauxTts(), v = creerVoix({ tts: t, locale: fauxLocal() });
  assert.equal(v.dire('Je tourne.'), false);
  assert.equal(t.appels.length, 0);
  v.actif(true);
  assert.equal(v.dire('Je tourne.'), true);
  assert.deepEqual(t.appels[0], { texte: 'Je tourne.', o: { voice: 'airy', rate: 0.92, language: 'fr' } });
  const w = creerVoix({ tts: t, reglages: { voix: 'glassy', debit: 1.1, inconnu: undefined } }); w.actif(true); w.dire('Autre chose.');
  assert.deepEqual(t.appels[1].o, { voice: 'glassy', rate: 1.1, language: 'fr' });
  const x = creerVoix({ tts: t, reglages: { voix: 'robot' } }); x.actif(true); x.dire('Encore.');
  assert.equal(t.appels[2].o.voice, 'airy');
});

test('la nouvelle pensée remplace : un seul appel en cours, le repli local est coupé', async () => {
  const t = fauxTts(), l = fauxLocal(), v = creerVoix({ tts: t, locale: l }); v.actif(true);
  v.dire('Un.'); v.dire('Deux.');
  assert.equal(t.appels.length, 2);
  assert.ok(l.cancels >= 2);
  t.en[0].rej({ code: 'stopped', reason: 'replaced' }); await tick();
  assert.equal(v.etat().texte, 'Deux.');
  assert.equal(l.dits.length, 0, 'une pensée remplacée ne déclenche pas le repli');
});

test('un aperçu puis la même pensée : lue une seule fois ; « … » ne coupe pas', () => {
  let s = 0; const t = fauxTts(), v = creerVoix({ tts: t, maintenant: () => s * 1000 }); v.actif(true);
  v.dire('Il y a quelqu\'un.'); v.dire('…'); v.dire('Il y a quelqu\'un.');
  assert.equal(t.appels.length, 1);
  assert.equal(t.stops, 0);
  s = 40; v.dire('Il y a quelqu\'un.');
  assert.equal(t.appels.length, 2, 'relue après le délai');
});

test('taire : stoppe tts et le navigateur, oublie la pensée en attente', async () => {
  const t = fauxTts(), l = fauxLocal(), v = creerVoix({ tts: t, locale: l }); v.actif(true);
  v.dire('Je parle.'); v.taire();
  assert.equal(t.stops, 1); assert.ok(l.cancels >= 2);
  assert.equal(v.etat().texte, null);
  t.refuser = 'no_gesture'; v.dire('Pas encore de geste.'); await tick();
  assert.equal(v.etat().attente, 'Pas encore de geste.');
  v.taire();
  assert.equal(v.geste(), false);
});

test('no_gesture : la pensée se rejoue au geste suivant, pas si elle est trop vieille', async () => {
  let s = 0; const t = fauxTts(), v = creerVoix({ tts: t, maintenant: () => s * 1000 }); v.actif(true);
  t.refuser = 'no_gesture';
  v.dire('Où suis-je ?'); await tick();
  t.refuser = null;
  assert.equal(v.geste(), true);
  assert.equal(t.appels.length, 2);
  assert.equal(t.appels[1].texte, 'Où suis-je ?');
  assert.equal(v.geste(), false, 'une seule fois');
  t.refuser = 'no_gesture'; v.dire('Plus tard.'); await tick(); t.refuser = null;
  s = 60; assert.equal(v.geste(), false);
});

test('busy (dictée) et not_granted : silence, sans repli ; not_granted coupe la suite', async () => {
  const t = fauxTts(), l = fauxLocal(), v = creerVoix({ tts: t, locale: l }); v.actif(true);
  t.refuser = 'busy'; v.dire('Pendant la dictée.'); await tick();
  assert.equal(l.dits.length, 0);
  t.refuser = 'not_granted'; v.dire('Refusé.'); await tick();
  assert.equal(l.dits.length, 0, 'le navigateur ne passe pas outre le choix du joueur');
  assert.equal(v.dire('Après le refus.'), false);
  assert.equal(t.appels.length, 2);
});

test('rate_limited, upstream_error : repli sur la voix du navigateur ; unavailable : le navigateur ensuite', async () => {
  const t = fauxTts(), l = fauxLocal(), v = creerVoix({ tts: t, locale: l }); v.actif(true);
  t.refuser = 'rate_limited'; v.dire('Trop vite.'); await tick();
  assert.deepEqual(l.dits.map(d => d.texte), ['Trop vite.']);
  assert.deepEqual(l.dits[0].o, { debit: 1, langue: 'fr' });
  t.refuser = 'unavailable'; v.dire('Plus de service.'); await tick();
  assert.equal(l.dits.length, 2);
  v.dire('Directement.');
  assert.equal(t.appels.length, 2, 'tts n\'est plus appelé');
  assert.equal(l.dits[2].texte, 'Directement.');
});

test('sans tts : la voix du navigateur, et son refus faute de geste se rejoue au geste', () => {
  const l = fauxLocal(), parle = [], v = creerVoix({ tts: null, locale: l, onParle: p => parle.push(p) }); v.actif(true);
  v.dire('Bonjour.'); l.cb.debut();
  assert.deepEqual(parle, [true]);
  l.cb.erreur('not-allowed');
  assert.equal(v.etat().attente, 'Bonjour.');
  assert.equal(v.geste(), true);
  assert.equal(l.dits.length, 2);
  l.cb.fin(); assert.deepEqual(parle, [true, false]);
});

test('sans aucun moteur : rien, sans erreur', () => {
  const v = creerVoix({}); v.actif(true);
  assert.equal(v.dire('Rien.'), false);
  v.taire(); v.geste();
});

test('tts encore en route : la pensée attend sa réponse ; null → navigateur', async () => {
  let r; const p = new Promise(x => { r = x; }), l = fauxLocal(), v = creerVoix({ tts: p, locale: l }); v.actif(true);
  assert.equal(v.dire('Tôt.'), true);
  assert.equal(v.etat().tts, 'attendu');
  r(null); await tick(); await tick();
  assert.deepEqual(l.dits.map(d => d.texte), ['Tôt.']);
  const t = fauxTts(); let r2; const p2 = new Promise(x => { r2 = x; }), w = creerVoix({ tts: p2, locale: fauxLocal() }); w.actif(true);
  w.dire('Tôt aussi.'); r2(t); await tick(); await tick();
  assert.equal(t.appels[0].texte, 'Tôt aussi.');
});

test('éteindre se tait ; tts qui lance une exception ne remonte pas', async () => {
  const t = fauxTts(), v = creerVoix({ tts: t }); v.actif(true);
  v.dire('Avant.'); v.actif(false);
  assert.equal(t.stops, 1);
  assert.equal(v.dire('Après.'), false);
  t.speak = () => { throw new Error('boum'); };
  v.actif(true); assert.equal(v.dire('Exception.'), true); await tick();
});

test('onParle suit l\'état de tts', () => {
  const t = fauxTts(), parle = [], v = creerVoix({ tts: t, onParle: p => parle.push(p) }); v.actif(true);
  v.dire('Hop.'); t.etat({ state: 'starting' }); t.etat({ state: 'speaking' }); t.etat({ state: 'idle', reason: 'completed' });
  assert.deepEqual(parle, [true, false]);
  t.etat({ state: 'idle', reason: 'not_granted' });
  assert.equal(v.dire('Coupé par le joueur.'), false);
});
