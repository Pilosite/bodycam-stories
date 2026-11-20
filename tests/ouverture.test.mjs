// Ouverture de démo (src/ouverture.js) : choix du rejeu, programme du rejeu, traduction avec les vraies valeurs de la fiche,
// et tenue du journal enregistré (ouvertures/*.json). Sans navigateur.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { correspond, programme, traduction, alea, normaliser } from '../src/ouverture.js';
import { controler } from '../src/constructeur.js';

const lire = p => JSON.parse(readFileSync(new URL('../' + p, import.meta.url), 'utf8'));
const REJEUX = readdirSync(new URL('../ouvertures/', import.meta.url)).filter(f => f.endsWith('.json')).map(f => lire('ouvertures/' + f));
const SCENES = readdirSync(new URL('../scenes/', import.meta.url)).filter(f => f.endsWith('.json')).map(f => lire('scenes/' + f));
const R = REJEUX.find(r => r.id === 'ouverture-champcueil');
// Comme le build : un journal qui nomme ses photos les reçoit en « vignettes » (ouvertures/photos/<nom>.json).
const AVEC = REJEUX.map(r => r.photos ? Object.assign({}, r, { vignettes: lire('ouvertures/photos/' + r.photos + '.json') }) : r);
const RP = AVEC.find(r => r.id === 'ouverture-champcueil');

test('correspond : la suggestion et ses variantes trouvent le rejeu de Champcueil, le reste part dans la vraie chaîne', () => {
  assert.ok(R);
  for (const t of [R.suggestion, 'fais-moi une forêt en automne genre Champcueil', 'Forêt des Grands Avaux au lever du soleil', 'un bois à Champcueil, le matin', 'FORÊT D\'AUTOMNE, CHAMPCUEIL'])
    assert.equal(correspond(t, REJEUX), R, t);
  for (const t of ['une plage au coucher du soleil', 'forêt de Champcueil la nuit', 'une rue de Tokyo sous la pluie', 'Champcueil', 'une forêt', 'forêt en hiver sous la neige, Champcueil', ''])
    assert.equal(correspond(t, REJEUX), null, t);
  assert.equal(normaliser('Forêt  d\'Été !'), 'foret d ete');
});

test('journal : chaque fiche visée existe, chaque constat a sa source et son réglage, aucune image ni texte de source recopié', () => {
  for (const r of REJEUX) {
    assert.equal(r.type, 'rejeu');
    assert.ok(SCENES.some(f => f.id === r.fiche) || SCENES.some(f => f.id === r.ficheSecours), r.id + ' : fiche ' + r.fiche);
    assert.ok(r.recherche.requetes.length >= 3);
    for (const s of r.lecture.sources) { assert.ok(s.titre && s.domaine && ['lu', 'illisible', 'refuse', 'extrait'].includes(s.etat), JSON.stringify(s)); assert.ok(!/https?:|\.(png|jpe?g|webp)\b/i.test(s.domaine + s.titre)); }
    for (const c of r.constats.liste) { assert.ok(c.texte && c.source && c.reglage, JSON.stringify(c)); assert.ok(c.texte.length < 140, 'constat trop long : ' + c.texte); }
    assert.ok(!JSON.stringify(r).match(/https?:\/\//), 'pas d\'adresse : titres et domaines seulement');
  }
});

test('traduction : les valeurs affichées sont celles de la fiche', () => {
  const f = SCENES.find(x => x.id === R.fiche) || SCENES.find(x => x.id === R.ficheSecours);
  const L = traduction(f), txt = L.map(l => l.join(' ')).join('\n');
  assert.ok(txt.includes(String(f.ambiance.soleil.hauteur).replace('.', ',') + '°'), txt);
  assert.ok(txt.includes(String(f.ambiance.brume).replace('.', ',')), txt);
  assert.ok(txt.includes('sentier-sable'));
  if (f.ambiance.brume_basse) assert.ok(txt.includes(String(f.ambiance.brume_basse.densite).replace('.', ',')));
  const g = Object.assign({}, f, { ambiance: Object.assign({}, f.ambiance, { soleil: { azimut: 10, hauteur: 15.5 } }) });
  assert.ok(traduction(g).some(([, x]) => x.includes('15,5°')));
});

test('programme : 15 à 25 s avant le fondu, des durées irrégulières, tout le journal rejoué dans l\'ordre', () => {
  const f = SCENES.find(x => x.id === R.fiche) || SCENES.find(x => x.id === R.ficheSecours);
  const c = controler(f);
  for (let g = 1; g <= 40; g++) {
    const ev = programme(R, f, alea(g), c);
    const monde = ev.find(e => e.type === 'monde').t, fin = ev[ev.length - 1];
    assert.ok(monde >= 13 && monde <= 23, 'graine ' + g + ' : monde à ' + monde.toFixed(1) + ' s');
    assert.ok(fin.type === 'fin' && fin.t >= 15 && fin.t <= 25.5, 'graine ' + g + ' : fin à ' + fin.t.toFixed(1) + ' s');
    for (let i = 1; i < ev.length; i++) assert.ok(ev[i].t >= ev[i - 1].t);
    const lignes = ev.filter(e => e.type === 'ligne');
    assert.deepEqual(lignes.filter(e => e.genre === 'requete' && e.etape === 'recherche').map(e => e.texte), R.recherche.requetes);
    assert.deepEqual(lignes.filter(e => e.genre === 'source').map(e => e.texte), R.lecture.sources.map(s => s.titre));
    assert.deepEqual(lignes.filter(e => e.genre === 'constat').map(e => e.texte), R.constats.liste.map(s => s.texte));
    assert.deepEqual(ev.filter(e => e.type === 'etape').map(e => e.id), ['recherche', 'lecture', 'constats', 'traduction', 'controle']);
  }
  // irrégulier : les écarts entre deux requêtes ne sont pas tous égaux, et deux graines ne donnent pas le même rythme
  const ecarts = g => { const q = programme(R, f, alea(g), c).filter(e => e.genre === 'requete').map(e => e.t); return q.slice(1).map((t, i) => t - q[i]); };
  const e1 = ecarts(3); assert.ok(Math.max(...e1) > 1.6 * Math.min(...e1), e1.join(' '));
  assert.notDeepEqual(ecarts(3), ecarts(4));
});

test('photos : chaque vignette a titre, auteur, licence libre reconnue et page Commons ; poids borné ; observations relues', () => {
  const LIBRES = /^(CC0( 1\.0)?|Public domain|Domaine public|CC BY(-SA)? [1-4]\.0)$/;
  for (const r of REJEUX.filter(r => r.photos)) {
    const V = lire('ouvertures/photos/' + r.photos + '.json');
    assert.equal(V.type, 'photos'); assert.equal(V.rejeu, r.id);
    assert.ok(V.photos.length >= 8 && V.photos.length <= 12, V.photos.length + ' photos');
    let total = 0;
    for (const p of V.photos) {
      assert.ok(p.id && p.titre && p.auteur, JSON.stringify(Object.assign({}, p, { donnees: '…' })));
      assert.match(p.licence, LIBRES, p.id + ' : licence ' + p.licence);
      assert.match(p.licenceUrl || '', /^https:\/\/creativecommons\.org\/(licenses|publicdomain)\//, p.id);
      assert.ok(p.page.startsWith('https://commons.wikimedia.org/wiki/File:'), p.id + ' : page source');
      assert.match(p.adaptation || '', /recadr.*rédui/, p.id + ' : adaptation indiquée');
      assert.ok(p.ecartee ? p.pourquoi : p.observation && p.observation.length <= 60, p.id + ' : observation ou raison');
      assert.match(p.donnees, /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/, p.id);
      const octets = Buffer.from(p.donnees.split(',')[1], 'base64');
      assert.ok(octets[0] === 0xff && octets[1] === 0xd8, p.id + ' : JPEG');
      assert.ok(octets.length <= 9000, p.id + ' : ' + octets.length + ' octets');
      total += p.donnees.length;
    }
    assert.ok(total <= 100 * 1024, 'vignettes : ' + total + ' octets en base64 (borne 100 Ko)');
    assert.ok(V.photos.some(p => p.ecartee) && V.photos.filter(p => !p.ecartee).length >= 6, 'un vrai tri : gardées et écartées');
    // les constats tirés d'une photo la nomment, et elle est gardée
    for (const c of r.constats.liste.filter(c => c.photo)) assert.ok(V.photos.some(p => p.id === c.photo && !p.ecartee), c.photo);
    assert.ok(r.constats.liste.filter(c => c.photo).length >= 4);
  }
});

test('programme avec photos : rafales de 80 à 200 ms, lecture puis observation, épinglage, au plus 4 s de plus', () => {
  const f = SCENES.find(x => x.id === RP.fiche) || SCENES.find(x => x.id === RP.ficheSecours);
  const c = controler(f), V = RP.vignettes;
  let ecartTotal = 0;
  for (let g = 1; g <= 40; g++) {
    const ev = programme(RP, f, alea(g), c), sans = programme(R, f, alea(g), c);
    for (let i = 1; i < ev.length; i++) assert.ok(ev[i].t >= ev[i - 1].t);
    assert.deepEqual(ev.filter(e => e.type === 'etape').map(e => e.id), ['recherche', 'lecture', 'photos', 'constats', 'traduction', 'controle']);
    const ph = ev.filter(e => e.genre === 'photo');
    assert.deepEqual(ph.map(e => e.photo), V.photos.map(p => p.id));
    const ecarts = ph.slice(1).map((e, i) => e.t - ph[i].t);
    assert.ok(ecarts.filter(x => x >= .079 && x <= .201).length >= ecarts.length - 3, 'rafales : ' + ecarts.map(x => x.toFixed(2)).join(' '));
    for (const p of ph) { const lu = ev.find(e => e.type === 'photo-lue' && e.photo === p.photo); assert.ok(lu && lu.t > p.t && lu.t - p.t < 1.2); }
    const debut = ev.find(e => e.type === 'etape' && e.id === 'photos').t, finP = ev.find(e => e.type === 'fin-etape' && e.id === 'photos').t;
    assert.ok(ev.filter(e => e.type === 'photo-lue').every(e => e.t <= finP + 1e-9));
    assert.ok(finP - debut < 4.3, 'étape photos : ' + (finP - debut).toFixed(2) + ' s');
    assert.ok(ev.some(e => e.type === 'credits'));
    const fin = ev[ev.length - 1].t, fin0 = sans[sans.length - 1].t;
    ecartTotal += fin - fin0;
    assert.ok(fin <= 30, 'graine ' + g + ' : fin à ' + fin.toFixed(1));
    assert.ok(ev.filter(e => e.genre === 'constat' && e.photo).length >= 4);
  }
  assert.ok(ecartTotal / 40 <= 4, 'allongement moyen ' + (ecartTotal / 40).toFixed(2) + ' s');
  // sans photos (vraie chaîne, ou journal sans « photos ») : aucun événement de photo
  assert.ok(!programme(R, SCENES[0], alea(1), null).some(e => e.genre === 'photo' || e.type === 'credits'));
});
