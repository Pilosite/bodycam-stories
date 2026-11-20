/* PDL en jetons (docs/pdl.md) : la notation d'affichage d'un format d'échange compact entre modèles et moteur.
   Module pur, sans DOM ni hasard : même donnée → mêmes jetons. Le moteur ne lit pas ce flux, il lit la fiche JSON ;
   ici on transcrit de VRAIES données (fiche, personnage, phrase analysée, actions) dans un alphabet inventé.
   Un jeton = sigle de classe + clé (2 signes, du lexique partagé) + valeur compacte :
     nombre → quantifié au centième, en base 62 (préfixe ˉ si négatif) ; texte → 3 signes de lexique (empreinte) ;
     vrai/faux → ◐/○. Les jetons d'un groupe se suivent ; les groupes sont liés par ⇢ ; une trame porte un en-tête
   ▣<classe><n° base 36> et une somme de contrôle ∴<2 signes>. Chaque jeton garde sa traduction en clair (cle, val). */

const B62 = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
const B36 = B62.slice(0, 36);
export function b62(n) { n = Math.max(0, Math.floor(n)); let s = ''; do { s = B62[n % 62] + s; n = Math.floor(n / 62); } while (n); return s; }
export function empreinte(s) { let h = 2166136261; for (const c of String(s)) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619) >>> 0; } return h; }

/* Les classes : un sigle chacune (glyphes géométriques et opérateurs courants, présents dans les polices système). */
export const CLASSES = {
  lieu: '◆', relief: '△', trajet: '▽', flore: '◇', lumiere: '◐', matiere: '▤', air: '≋', camera: '◎',
  personnage: '●', demande: '◈', analyse: '⊙', action: '⇢', son: '∿', histoire: '∴', garde: '↯'
};
/* Les rubriques de la fiche (clés de pdl().donnees) vers leur classe. */
const RUBRIQUE = { lieu: 'lieu', relief: 'relief', trajet: 'trajet', arbres: 'flore', perches: 'flore', gres: 'matiere', surfaces: 'matiere', air: 'air', camera: 'camera', personnage: 'personnage' };
export const classeDe = cle => RUBRIQUE[cle] || (/^semis/.test(cle) ? 'flore' : 'histoire');

const cleCode = k => { const h = empreinte(k) % 3844; return B62[Math.floor(h / 62)] + B62[h % 62]; };
const lisible = v => typeof v === 'number' ? String(+v.toFixed(2)).replace('.', ',') : typeof v === 'boolean' ? (v ? 'oui' : 'non') : String(v);

/* Les feuilles d'un objet : [chemin, valeur], dans l'ordre des clés ; les tableaux sont dépliés par rang. */
function feuilles(o, chemin, out) {
  if (o === undefined || o === null || o === '') return out;
  if (Array.isArray(o)) { o.forEach((x, i) => feuilles(x, chemin + '.' + i, out)); return out; }
  if (typeof o === 'object') { for (const k of Object.keys(o)) feuilles(o[k], chemin ? chemin + '.' + k : k, out); return out; }
  out.push([chemin, o]); return out;
}

export function valeur(v) {
  if (typeof v === 'number' && isFinite(v)) { const q = Math.round(v * 100); return (q < 0 ? 'ˉ' : '') + b62(Math.abs(q)); }
  if (typeof v === 'boolean') return v ? '◐' : '○';
  const h = empreinte(v); return B62[h % 62] + B62[(h >>> 6) % 62] + B62[(h >>> 12) % 62];
}

/* Une trame : { classe, sigle, entete, jetons: [{ s, cle, val, poids }], somme, texte, n }.
   poids (1 à 3) : le premier jeton d'une trame et les nombres forts pèsent plus ; c'est « l'attention » affichée. */
export function trame(classe, objet, rang = 0) {
  const sg = CLASSES[classe] || CLASSES.histoire;
  const F = feuilles(objet, '', []);
  const jetons = F.map(([k, v], i) => {
    const court = k.split('.').filter(x => !/^\d+$/.test(x)).slice(-2).join('.') || classe;
    const p = i === 0 ? 3 : typeof v === 'number' ? (Math.abs(v) >= 10 ? 3 : 2) : 1;
    return { s: sg + cleCode(k) + valeur(v), cle: (classe + (court ? ' · ' + court : '')).replace(/_/g, ' '), val: lisible(v), poids: p };
  });
  const entete = '▣' + sg + B36[rang % 36];
  const corps = jetons.map(j => j.s).join(' ');
  const h = empreinte(entete + corps) % 1296, somme = '∴' + B36[Math.floor(h / 36)] + B36[h % 36];
  return { classe, sigle: sg, entete, jetons, somme, texte: entete + ' ' + corps + ' ' + somme, n: jetons.length + 2 };
}

/* La fiche entière (pdl().donnees) : une trame par rubrique, liées par ⇢. Tokens comptés : un par jeton, en-tête et somme. */
export function trames(donnees) {
  const T = Object.keys(donnees || {}).map((k, i) => trame(classeDe(k), donnees[k], i)).filter(t => t.jetons.length);
  return { trames: T, texte: T.map(t => t.texte).join(' ⇢ '), tokens: T.reduce((a, t) => a + t.n, 0) + Math.max(0, T.length - 1) };
}

/* La phrase du joueur, telle que la page la comprend avant Claude (lignes de activite.analyser) : ◈ entendre ⇢ ⊙ analyse. */
export function trameDemande(texte, lignes) {
  const o = { entendre: String(texte || '').trim().toLowerCase().split(/\s+/).slice(0, 8) };
  for (const l of lignes || []) {
    const m = /^\s*([^:]+?)\s*:\s*(.*)$/.exec(l.t || ''); if (!m || l.k === '>') continue;
    const nums = (m[2].match(/-?\d+(?:[.,]\d+)?/g) || []).map(x => +x.replace(',', '.'));
    o[m[1].replace(/\s+/g, '_')] = Object.assign({ mot: m[2].split(/[\s(]/)[0] }, nums.length ? { n: nums } : {});
  }
  return trame('demande', o, 0);
}

/* Les actions de la file, à la réponse : ⇢ type + paramètres numériques réels. */
export function trameActions(actions, rang = 1) {
  const o = (actions || []).slice(0, 8).map(a => {
    const x = { type: a.type };
    for (const k of ['rest', 'metres', 'h', 'pitch', 'secondes', 'z']) if (typeof a[k] === 'number') x[k] = a[k];
    if (a.objet || a.ref) x.objet = a.objet || a.ref;
    return x;
  });
  return trame('action', o, rang);
}

/* La traduction en clair d'un jeton : « ◆r7k = relief · amplitude : 0,8 ». */
export const traduire = j => j.s + ' = ' + j.cle + ' : ' + j.val;

/* La réaction attendue du personnage à une demande (panneau d'activité, bloc « persona ») : calculée à partir de ses VRAIS
   réglages (ceux de la recherche de l'ouverture) et de la nature de la demande, jamais d'un objet en dur.
   perso : { id, genre, age, pays, annee, metier, ton[], peur (0..3), humour, sait[] } ;
   nature : { repugnance 0..1, facteur (échelle), effort (s), chercher, faconner }. Rend null si ses réglages ne jouent pas. */
export function reactionAttendue(perso, nature = {}) {
  if (!perso || typeof perso !== 'object') return null;
  const n = nature || {}, rp = +n.repugnance || 0, fa = +n.facteur || 1, ef = +n.effort || 0;
  if (!(rp > 0 || fa >= 3 || ef >= 4 || n.chercher || n.faconner)) return null;
  const F = perso.genre === 'F', e = s => F ? s + 'e' : s, ton = [].concat(perso.ton || []);
  const R = [];
  if (ton.includes('sec')) R.push('râle');
  R.push('obéit');
  if (rp >= .5) R.push(fa >= 3 || rp >= .85 ? 'dégoût marqué, se retient' : 'dégoût marqué');
  else if (rp > 0) R.push('grimace');
  if (fa >= 5) R.push('incrédule devant la taille');
  if (ef >= 4) R.push('souffle, effort long');
  if (n.chercher) R.push((perso.sait || []).length ? 'cherche en ' + (F ? 'connaisseuse' : 'connaisseur') : 'cherche sans discuter');
  if ((+perso.peur || 0) <= 1) R.push('pas ' + e('impressionné'));
  else R.push(e('inquiet'));
  const H = ton.includes('drôle') || perso.humour;
  R.splice(H ? 4 : 5);                                     // court : trois lignes au plus dans le panneau
  if (H) R.push('humour à froid');
  const profil = [perso.id ? perso.id[0].toUpperCase() + perso.id.slice(1) : 'perso', (perso.genre || '') + (perso.age || ''), (perso.pays || '') + (perso.annee || ''), perso.metier, ton.length ? 'ton ' + ton.join(', ') : ''].filter(Boolean).join(' · ');
  const tr = trame('personnage', { id: perso.id, genre: perso.genre, age: perso.age, pays: perso.pays, annee: perso.annee, ton, peur: perso.peur, demande: { repugnance: rp || undefined, facteur: fa !== 1 ? fa : undefined, effort: ef || undefined } }, 2);
  return { profil, reaction: R, texte: profil + ' → ' + R.join(', '), trame: tr };
}
