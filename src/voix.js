// La voix du personnage : ses pensées lues à voix haute.
// Module sans DOM : la file et ses règles (creerVoix) sont testées par npm test (tests/voix.test.mjs) avec de faux moteurs.
// Deux moteurs possibles, passés par la page :
//  - tts : la capacité « tts » d'un artefact claude.ai (une promesse de son espace de noms, ou null) ;
//  - locale : le repli du navigateur (voixNavigateur(window), speechSynthesis), quand tts est absent ou en panne.
// Règles : jamais deux voix à la fois (la nouvelle remplace), les « … » d'attente ne sont pas lus, une pensée
// identique à la précédente (aperçu puis pensée) n'est pas relue, aucune erreur ne remonte, et un premier refus
// faute de geste du joueur est rejoué au geste suivant (geste()), s'il n'est pas trop vieux.

export const REGLAGES_VOIX = {
  voix: 'airy',      // tts : « airy », souffle léger, ce qui ressemble le plus à une voix intérieure
  debit: 0.92,       // tts : un peu plus lent que la normale (0,7 à 1,5)
  debitLocal: 1,     // speechSynthesis : les voix du navigateur sont déjà lentes
  langue: 'fr',
  max: 2000,         // limite de speak()
  doublon_s: 30,     // même texte relu dans ce délai : ignoré
  file: false,       // true : une phrase en cours n'est pas coupée, la suivante attend (la page) ; false : la nouvelle remplace
  geste_s: 20,       // une pensée refusée faute de geste se rejoue au geste suivant, si elle a moins de cet âge
};
export const VOIX_TTS = ['buttery', 'airy', 'glassy', 'rounded'];

/* Ce qu'on lit d'un texte affiché : '' s'il n'y a rien à dire (« … », ponctuation seule). */
export function aLire(texte, max = REGLAGES_VOIX.max) {
  let t = String(texte == null ? '' : texte).replace(/\s+/g, ' ').trim();
  if (!/[\p{L}\p{N}]/u.test(t)) return '';
  if (t.length > max) {
    const c = t.slice(0, max), fin = Math.max(c.lastIndexOf('. '), c.lastIndexOf('! '), c.lastIndexOf('? '));
    t = fin > max / 2 ? c.slice(0, fin + 1) : c.slice(0, Math.max(c.lastIndexOf(' '), max / 2)).trim();
  }
  return t;
}

/* Codes d'échec de tts.speak() : ce qu'on en fait. */
function suite(code) {
  if (code === 'no_gesture') return 'geste';                    // rejouer au prochain geste du joueur
  if (code === 'stopped' || code === 'busy') return 'rien';     // remplacée, arrêtée, ou le joueur dicte : on se tait
  if (code === 'not_granted') return 'refus';                   // le joueur a coupé la lecture : ne rien dire d'une autre façon
  if (code === 'invalid_argument') return 'rien';
  return 'repli';                                               // rate_limited, unavailable, upstream_error, inconnu : voix du navigateur
}

export function creerVoix({ tts = null, locale = null, reglages = {}, maintenant = () => Date.now(), onParle = () => {}, journal = () => {} } = {}) {
  const R = Object.assign({}, REGLAGES_VOIX);
  for (const [k, v] of Object.entries(reglages || {})) if (v !== undefined && v !== null) R[k] = v;
  if (!VOIX_TTS.includes(R.voix)) R.voix = REGLAGES_VOIX.voix;
  const sec = () => maintenant() / 1000;
  let T = null, ttsAttendu = !!(tts && typeof tts.then === 'function'), refus = false, sansTts = false;
  let on = false, n = 0, courant = null, attente = null, dernier = null, parle = false;
  const file = [];                                                // pensées en attente : une phrase en cours n'est plus coupée par la suivante
  let tFile = 0;
  const signaler = p => { if (p !== parle) { parle = p; try { onParle(p); } catch (_) {} }
    if (!p && file.length) { clearTimeout(tFile); tFile = setTimeout(() => { if (!parle && file.length && on && !refus) lancer(file.shift()); }, 120); } };

  function brancher(t) {
    T = t && typeof t.speak === 'function' ? t : null;
    if (T && typeof T.onState === 'function') {
      try {
        T.onState(e => {
          if (e.state === 'idle' && e.reason === 'not_granted') refus = true;
          if (e.state === 'idle' && e.reason === 'unavailable') sansTts = true;
          if (!courant || courant.moteur === 'tts') signaler(e.state !== 'idle');
        });
      } catch (_) {}
    }
  }
  if (ttsAttendu) Promise.resolve(tts).then(t => brancher(t), () => brancher(null)).then(() => {
    ttsAttendu = false;
    if (attente && on && sec() - attente.t < R.geste_s) { const a = attente; attente = null; lancer(a.texte); }
  });
  else brancher(tts);

  const ttsUtilisable = () => T && !sansTts;

  function viaLocale(texte, id) {
    if (!locale || refus) { if (courant && courant.id === id) courant = null; signaler(false); return; }
    courant = { id, texte, moteur: 'locale' };
    try {
      locale.speak(texte, { debit: R.debitLocal, langue: R.langue }, {
        debut: () => { if (courant && courant.id === id) signaler(true); },
        fin: () => { if (courant && courant.id === id) { courant = null; signaler(false); } },
        erreur: code => {
          if (!courant || courant.id !== id) return;
          courant = null; signaler(false);
          if (code === 'not-allowed') attente = { texte, t: sec() };   // pas encore de geste du joueur
          journal('locale:' + code);
        },
      });
    } catch (e) { courant = null; signaler(false); journal('locale:' + (e && e.message)); }
  }

  function lancer(texte) {
    const id = ++n, avant = courant;
    if (locale) try { locale.cancel(); } catch (_) {}
    if (ttsUtilisable()) {
      courant = { id, texte, moteur: 'tts' };
      let p;
      try { p = T.speak(texte, { voice: R.voix, rate: R.debit, language: R.langue }); }
      catch (e) { p = Promise.reject(e); }
      Promise.resolve(p).then(() => {
        if (courant && courant.id === id) courant = null;
      }, e => {
        const code = e && e.code || 'upstream_error', s = suite(code);
        journal('tts:' + code);
        if (s === 'refus') refus = true;
        if (code === 'unavailable') sansTts = true;
        if (!courant || courant.id !== id) return;                // une autre pensée a pris la place
        if (s === 'geste') { attente = { texte, t: sec() }; courant = null; }
        else if (s === 'repli') viaLocale(texte, id);
        else courant = null;
      });
    } else {
      if (avant && avant.moteur === 'tts' && T) T.stop().catch(() => {});
      viaLocale(texte, id);
    }
  }

  function taire() {
    attente = null; file.length = 0; clearTimeout(tFile);
    const c = courant; courant = null;
    if (c && c.moteur === 'tts' && T) { try { T.stop().catch(() => {}); } catch (_) {} }
    if (locale) try { locale.cancel(); } catch (_) {}
    signaler(false);
  }

  function dire(texte) {
    if (!on || refus) return false;
    const t = aLire(texte, R.max);
    if (!t) return false;
    if (dernier && dernier.texte === t && sec() - dernier.t < R.doublon_s) return false;
    dernier = { texte: t, t: sec() };
    attente = null;
    if (ttsAttendu) { taire(); attente = { texte: t, t: sec() }; return true; }   // la capacité répond encore : on lira à sa réponse
    if (R.file && /^[\shmnrgaeo….!'’-]+$/i.test(t) && t.length < 28) return false;      // un souffle d'effort (« Hhhnn… ») : les bruitages s'en chargent
    if (R.file && (parle || courant)) { if (file.length >= 2) file.shift(); file.push(t); return true; }   // elle finit sa phrase d'abord
    if (!ttsUtilisable() && !locale) return false;
    lancer(t);
    return true;
  }

  /* Un geste du joueur (clic, touche) : la pensée refusée faute de geste est lue maintenant, dans le geste. */
  function geste() {
    if (!attente || !on || refus || ttsAttendu) return false;
    const a = attente; attente = null;
    if (sec() - a.t >= R.geste_s) return false;
    lancer(a.texte);
    return true;
  }

  function actif(v) {
    if (v !== undefined) { on = !!v; if (!on) taire(); else refus = false; }
    return on;
  }

  return {
    dire, taire, actif, geste,
    etat: () => ({ actif: on, parle, moteur: courant ? courant.moteur : null, texte: courant ? courant.texte : null,
      attente: attente ? attente.texte : null, tts: ttsAttendu ? 'attendu' : ttsUtilisable() ? 'oui' : 'non', refus }),
  };
}

/* Le repli du navigateur : speechSynthesis, une voix française si le système en a une. */
export function voixNavigateur(w) {
  const S = w && w.speechSynthesis, U = w && w.SpeechSynthesisUtterance;
  if (!S || !U) return null;
  const choisir = () => {
    let vs = [];
    try { vs = S.getVoices() || []; } catch (_) {}
    const fr = vs.filter(v => /^fr\b/i.test(v.lang || ''));
    const F = /am[eé]lie|audrey|aurelie|aurélie|marie|julie|denise|hortense|brigitte|virginie|c[eé]line|l[eé]a|chlo[eé]|female|femme|google fran/i, f = fr.filter(v => F.test(v.name || ''));   // une voix de femme d'abord (Sam)
    return f.find(v => /^fr[-_]FR/i.test(v.lang)) || f[0] || fr.find(v => /^fr[-_]FR/i.test(v.lang) && v.localService) || fr.find(v => /^fr[-_]FR/i.test(v.lang)) || fr[0] || null;
  };
  let voix = null;
  try { voix = choisir(); if (S.addEventListener) S.addEventListener('voiceschanged', () => { voix = choisir(); }); } catch (_) {}
  return {
    speak(texte, o, cb) {
      if (!voix) voix = choisir();
      if (!voix) { cb.fin(); return; }                     // aucune voix française : on se tait (une voix anglaise lisait le français)
      const u = new U(texte);
      u.lang = voix ? voix.lang : 'fr-FR';
      if (voix) u.voice = voix;
      u.rate = o.debit || 1;
      u.onstart = () => cb.debut();
      u.onend = () => cb.fin();
      u.onerror = e => (e && (e.error === 'interrupted' || e.error === 'canceled')) ? cb.fin() : cb.erreur(e && e.error || 'erreur');
      S.speak(u);
    },
    cancel() { S.cancel(); },
  };
}
