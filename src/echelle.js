// Échelle de l'ombrage v3 (docs/moteur-v3.md, « Échelle de l'ombrage ») : quel programme d'ombrage utiliser, et la mémoire
// des variantes complètes qui n'ont pas pu se compiler sur cette machine. Module pur : ni DOM, ni WebGL, ni localStorage
// (src/main.js lit et écrit la mémoire, sous la clé CLE_OMBRAGE) ; testé par npm test (tests/echelle.test.mjs).
//
// Automate d'une variante complète, par signature (variante + empreinte du source) :
//   (rien) --debut--> « en cours » --ok--> « ok » (avec la durée)
//                                  --delai--> « echec (délai) » : on reste au socle pour cette page, la compilation continue
//                                             en fond et sert si elle finit ; au chargement suivant, la variante se retente
//                                  --erreur--> « echec (erreur) »
//   « en cours » trouvé au chargement de la page (plantage du navigateur ou du processus graphique) --> « echec (interrompu) »
//   « en cours » à la fermeture normale de la page (rechargement, onglet fermé : pagehide) --> oublié (aux) : pas un plantage
// Seuls un plantage (« interrompu ») et une erreur de compilation interdisent durablement la variante sur cette machine
// (jusqu'à la remise à zéro). Un délai dépassé, y compris mémorisé par une ancienne version de la page, ne l'interdit pas.

export const CLE_OMBRAGE = 'bodycam-ombrage';
export const DELAI_OMBRAGE = 40000;          // ms de compilation RÉELLE (file d'attente et écran d'ouverture exclus) : au-delà, on reste au socle
const MAX_ENTREES = 24;

// Empreinte courte d'un texte (FNV-1a 32 bits, base 36) : un shader corrigé change de signature et se retente.
export function empreinte(texte) {
  let h = 0x811c9dc5;
  for (let i = 0; i < texte.length; i++) { h ^= texte.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(36);
}
// Signature d'une variante complète : ses réglages de compilation, puis l'empreinte du source.
export function signature(v, empr) {
  return 'T' + (v.tapis ? 1 : 0) + ' S' + (v.semis ? 1 : 0) + ' A' + (v.atmo ? 1 : 0) + ' R' + (v.rais | 0) + ' · ' + empr;
}

export function lireMemoire(texte) {
  try { const m = JSON.parse(texte || '{}'); return m && typeof m === 'object' && !Array.isArray(m) ? m : {}; }
  catch { return {}; }
}

// Au chargement : ce qui était resté « en cours » n'a pas abouti. Rend la mémoire corrigée et les signatures passées en échec.
export function auDemarrage(mem, now = 0) {
  const m = { ...mem }, echecs = [];
  for (const [k, v] of Object.entries(m)) if (v && v.etat === 'en cours') { m[k] = { ...v, etat: 'echec', cause: 'interrompu', t: now }; echecs.push(k); }
  return { mem: m, echecs };
}

export const peutTenter = (mem, sig) => !(mem[sig] && mem[sig].etat === 'echec' && mem[sig].cause !== 'délai');

// Fermeture normale de la page (pagehide) : une compilation encore « en cours » n'a pas planté, on l'oublie.
export function aLaFermeture(mem) {
  const m = { ...mem };
  for (const [k, v] of Object.entries(m)) if (v && v.etat === 'en cours') delete m[k];
  return m;
}
// Contexte WebGL perdu : ce qui compilait est noté « interrompu » tout de suite (la fermeture qui suivra ne l'effacera pas).
export function auPlantage(mem, now = 0) { return auDemarrage(mem, now).mem; }

// Un événement sur une variante : 'debut', 'ok' (ms : durée), 'delai' (ms), 'erreur'. Rend une nouvelle mémoire.
export function noter(mem, sig, evt, { now = 0, ms } = {}) {
  const m = { ...mem };
  if (evt === 'debut') m[sig] = { etat: 'en cours', t: now };
  else if (evt === 'ok') m[sig] = { etat: 'ok', ms: Math.round(ms || 0), t: now };
  else if (evt === 'delai') m[sig] = { etat: 'echec', cause: 'délai', ms: Math.round(ms || 0), t: now };
  else if (evt === 'erreur') m[sig] = { etat: 'echec', cause: 'erreur', t: now };
  else return m;
  const ks = Object.keys(m);                                  // la mémoire reste petite : on oublie les plus anciennes
  if (ks.length > MAX_ENTREES) ks.sort((a, b) => (m[a].t || 0) - (m[b].t || 0)).slice(0, ks.length - MAX_ENTREES).forEach(k => delete m[k]);
  return m;
}

export const echecs = mem => Object.keys(mem).filter(k => mem[k] && mem[k].etat === 'echec' && mem[k].cause !== 'délai');   // ceux qui interdisent
export function remettreAZero() { return {}; }

/* Quel ombrage dessine cette image, et faut-il lancer la variante complète ?
   mode : 'echelle' (défaut de la page : socle d'abord, montée ensuite), 'socle' (rester au socle), 'plein' (attendre la
   variante complète avant la première image : comportement d'avant, celui des outils de capture).
   Rend { utiliser: 'plein' | 'socle' | null (rien de prêt : pas d'image), tenter: lancer la variante complète maintenant,
          socle: le socle est nécessaire (à compiler s'il ne l'est pas) }. */
export function choisir({ mode = 'echelle', pleinePrete = false, soclePret = false, mem = {}, sig = '', imageFaite = false }) {
  if (mode === 'plein') return { utiliser: pleinePrete ? 'plein' : null, tenter: !pleinePrete, socle: false };
  if (mode === 'socle') return { utiliser: soclePret ? 'socle' : null, tenter: false, socle: true };
  if (pleinePrete) return { utiliser: 'plein', tenter: false, socle: false };
  return { utiliser: soclePret ? 'socle' : null, tenter: soclePret && imageFaite && peutTenter(mem, sig), socle: true };
}

// Lignes lisibles de la mémoire, pour le diagnostic.
export function resumer(mem) {
  return Object.entries(mem).map(([k, v]) => k + ' : ' + (v.etat === 'ok' ? 'ok en ' + (v.ms / 1000).toFixed(1) + ' s' : v.etat === 'echec' ? 'échec (' + (v.cause || '?') + (v.ms ? ', ' + (v.ms / 1000).toFixed(0) + ' s' : '') + ')' : v.etat));
}
