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
    assert.deepEqual(lignes.filter(e => e.genre === 'requete').map(e => e.texte), R.recherche.requetes);
    assert.deepEqual(lignes.filter(e => e.genre === 'source').map(e => e.texte), R.lecture.sources.map(s => s.titre));
    assert.deepEqual(lignes.filter(e => e.genre === 'constat').map(e => e.texte), R.constats.liste.map(s => s.texte));
    assert.deepEqual(ev.filter(e => e.type === 'etape').map(e => e.id), ['recherche', 'lecture', 'constats', 'traduction', 'controle']);
  }
  // irrégulier : les écarts entre deux requêtes ne sont pas tous égaux, et deux graines ne donnent pas le même rythme
  const ecarts = g => { const q = programme(R, f, alea(g), c).filter(e => e.genre === 'requete').map(e => e.t); return q.slice(1).map((t, i) => t - q[i]); };
  const e1 = ecarts(3); assert.ok(Math.max(...e1) > 1.6 * Math.min(...e1), e1.join(' '));
  assert.notDeepEqual(ecarts(3), ecarts(4));
});
