// Les bruitages, par code (docs/bruitages.md). Aucun fichier son importé, sauf les quelques prises libres de
// src/bruitages.json (« prises », crédits dans la doc), que le code transforme comme une source parmi d'autres.
// Deux parties :
//  - un module pur (sans DOM ni Web Audio), testé par npm test (tests/son.test.mjs) : plan d'un geste (quels bruits, quand,
//    combien de temps, quelle hauteur, quelle force), partition (courbes de hauteur et d'amplitude), synthèse de la source
//    en échantillons ;
//  - une mince couche qui joue (creerSons, chaine, voixBruit) : formants, saturation, « prise micro de téléphone »,
//    limiteur, sur n'importe quel BaseAudioContext (AudioContext dans la page, OfflineAudioContext pour les essais).
// Un bruitage est une RECETTE en données (src/bruitages.json) : des couches du vocabulaire (impulsions = lèvres qui
// vibrent, bruit filtré, onde, prise), une hauteur (glissando, vibrato, instabilité, jitter), une amplitude (attaque,
// chute, percussion, tremblement), des ratés, une fin, des formants, une saturation. Ce qui varie avec la démesure d'une
// chose est dans le modèle (src/modeles.json, exploit.bruit). Tout aléa dérive de la graine et d'un compteur.

export const REGLAGES_SON = {
  sr_controle: 1000,    // points par seconde des courbes de hauteur et d'amplitude
  gain_max: 0.9,        // gain d'un bruitage : borne dure
  volume_max: 0.8,      // volume général : borne dure
  duree_max_s: 8,       // un bruitage ne dure pas plus
  hz_min: 20, hz_max: 4000,
  segment_max_s: 12,    // un temps d'effort ne dure pas plus (la page borne pareil)
};

const isObj = o => o !== null && typeof o === 'object' && !Array.isArray(o);
const liste = l => Array.isArray(l) ? l : [];
const num = (v, lo, hi, d) => { const x = typeof v === 'number' && isFinite(v) ? v : d; return Math.min(hi, Math.max(lo, x)); };
const lerp = (a, b, u) => a + (b - a) * u;
const clamp01 = u => Math.min(1, Math.max(0, u));
const paire = (p, d) => Array.isArray(p) && p.length >= 2 ? [+p[0], +p[1]] : typeof p === 'number' ? [p, p] : d;
const r1 = x => Math.round(x * 1000) / 1000;

/* L'aléa : une suite reproductible tirée de (graine, compteur). Deux compteurs différents, deux suites différentes. */
export function alea(graine, compteur = 0) {
  let h = 2166136261 >>> 0;
  for (const c of String(graine) + ':' + String(compteur)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0; }
  let a = h;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0; let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const entre = (rnd, p, d = [0, 0]) => { const [a, b] = paire(p, d); return lerp(a, b, rnd()); };
const entier = (rnd, p, d = [1, 1]) => { const [a, b] = paire(p, d); return Math.round(a) + Math.floor(rnd() * (Math.round(b) - Math.round(a) + 1)); };
function poisson(rnd, m) { let k = 0, p = Math.exp(-m), s = p; const u = rnd(); while (u > s && k < 20) { k++; p *= m / k; s += p; } return k; }

/* ------------------------------------------------------------------ le plan d'un exploit
   bruit : la section exploit.bruit du modèle. palier et facteur : la démesure (§20). Rend les bruits dans l'ordre, le
   principal (le plus gros) en dernier. Chaque bruit : duree (s), f0 (Hz), force (0..1), gain, rates, fin, vibrato. */
export function planExploit(bruit, { palier = 'normal', facteur = 1 } = {}, rnd = alea(0)) {
  if (!isObj(bruit) || !isObj(bruit.paliers)) return [];
  const P = isObj(bruit.paliers[palier]) ? bruit.paliers[palier] : bruit.paliers.normal;
  if (!isObj(P)) return [];
  const F = paire(isObj(bruit.facteur) && bruit.facteur[palier], [1, 2]);
  const lg = x => Math.log2(Math.max(0.01, x));
  const u = F[1] > F[0] ? clamp01((lg(num(facteur, 0.01, 100, 1)) - lg(F[0])) / (lg(F[1]) - lg(F[0]))) : 0.5;   // la place dans le palier
  const part = num(P.alea, 0, 1, 0.35), m = () => lerp(u, rnd(), part);
  const [d0, d1] = paire(P.duree_s, [0.2, 0.4]), [h0, h1] = paire(P.hauteur_hz, [250, 200]);
  const n = Math.max(1, entier(rnd, P.nombre, [1, 1]));
  const gainMax = num(bruit.gain_max, 0, REGLAGES_SON.gain_max, REGLAGES_SON.gain_max);
  const force = num(P.force, 0, 1, 0.5) * (0.85 + 0.15 * u);
  const principal = {
    rang: n - 1, principal: true, duree: r1(lerp(d0, d1, m())), f0: r1(lerp(h0, h1, m())), force: r1(force),
    gain: r1(Math.min(gainMax, force * gainMax)), rates: num(P.rates, 0, 10, 0), fin: typeof P.fin === 'string' ? P.fin : 'sec',
    vibrato: num(P.vibrato, 0, 2, 0.3), prise: choix(P.prises), prise_part: num(P.prise_part, 0, 1, 0.5),
  };
  const A = isObj(P.avant) ? P.avant : {}, out = [];
  function choix(L) { L = liste(L).filter(x => typeof x === 'string'); return L.length ? L[Math.floor(rnd() * L.length)] : null; }
  for (let i = 0; i < n - 1; i++) {
    const fo = force * num(entre(rnd, A.force_rapport, [0.7, 1]), 0, 1, 0.8);
    out.push({
      rang: i, principal: false, duree: r1(Math.max(0.06, principal.duree * entre(rnd, A.duree_rapport, [0.6, 1]))),
      f0: r1(principal.f0 * entre(rnd, A.hauteur_rapport, [1, 1.25])), force: r1(fo), gain: r1(Math.min(gainMax, fo * gainMax)),
      rates: num(A.rates, 0, 10, 0), fin: typeof A.fin === 'string' ? A.fin : 'sec', vibrato: num(A.vibrato, 0, 2, principal.vibrato * 0.5),
      prise: choix(liste(A.prises).length ? A.prises : P.prises), prise_part: num(A.prise_part, 0, 1, num(P.prise_part, 0, 1, 0.5)),
    });
  }
  return [...out, principal];
}

/* ------------------------------------------------------------------ caler les bruits dans le geste
   actions : la suite d'un geste (gesteExploit : posture, effort, penser (souffle), effort…, posture). Les efforts portant
   `exploit: {palier, facteur}` reçoivent `bruits` (t relatif au début de l'effort) ; les temps d'effort s'ajustent pour que
   le principal tienne dans le dernier effort, après le dernier souffle (écart pour la voix), et finisse juste avant la pose ;
   les précurseurs vont dans les efforts d'avant (entre les souffles). Le total reste proche de celui du geste.
   Rend { actions, plan } : plan.bruits (t absolu depuis le début du premier effort), plan.souffles, plan.pose_t. */
export function caler(actions, bruit, { graine = 0, compteur = 0 } = {}) {
  const A = liste(actions).map(a => isObj(a) ? Object.assign({}, a) : a);
  const idx = A.map((a, i) => isObj(a) && a.type === 'effort' && isObj(a.exploit) ? i : -1).filter(i => i >= 0);
  const vide = { actions: A, plan: { bruits: [], souffles: [], pose_t: 0 } };
  if (!idx.length || !isObj(bruit)) return vide;
  const ex = A[idx[0]].exploit, rnd = alea(graine, 'geste:' + compteur);
  const evs = planExploit(bruit, ex, rnd);
  if (!evs.length) return vide;
  const ecart = num(bruit.ecart_voix_s, 0, 5, 1.3), m0 = num(bruit.marge_debut_s, 0, 5, 0.6), mp = num(bruit.marge_pose_s, 0, 3, 0.25);
  const gap = num(bruit.ecart_bruits_s, 0, 3, 0.35), queueSeg = num(bruit.marge_souffle_s, 0, 3, 0.4), SMAX = REGLAGES_SON.segment_max_s;
  const segs = idx.map((i, k) => ({ i, s: num(A[i].secondes, 0, SMAX, 3), apresSouffle: k > 0 && A.slice(idx[k - 1] + 1, i).some(a => isObj(a) && a.type === 'penser'), L: [] }));
  const debut = sg => sg.apresSouffle ? ecart : m0;
  const princ = evs[evs.length - 1], pre = evs.slice(0, -1), der = segs.length - 1;
  pre.forEach((e, k) => segs[der > 0 ? k % der : der].L.push(e));
  const somme = L => L.reduce((s, e) => s + e.duree, 0) + gap * Math.max(0, L.length - 1);
  const total = segs.reduce((s, g) => s + g.s, 0);
  // le dernier : précurseurs éventuels, puis le principal, qui finit mp avant la pose
  const S = segs[der];
  let besoin = debut(S) + somme(S.L) + (S.L.length ? gap : 0) + princ.duree + mp;
  if (besoin > SMAX) { princ.duree = r1(Math.max(0.1, princ.duree - (besoin - SMAX))); besoin = SMAX; }
  S.s = Math.max(S.s, besoin);
  const reste = total - S.s;
  for (let k = 0; k < der; k++) {
    const g = segs[k], b = debut(g) + somme(g.L) + queueSeg;
    g.s = Math.min(SMAX, Math.max(b, der ? reste / der : 0, g.L.length ? 0 : Math.min(g.s, 1.5)));
  }
  for (const g of segs) g.s = Math.ceil(g.s * 10 - 1e-9) / 10;
  // placer : la marge libre est répartie au hasard entre les bruits d'un effort
  const repartir = (L, a, b) => {
    const libre = Math.max(0, (b - a) - somme(L)), w = L.map(() => rnd() + 0.2), sw = w.reduce((s, x) => s + x, 0) + 0.6;
    let t = a + libre * 0.3 * rnd();
    L.forEach((e, k) => { t += k ? gap + libre * 0.7 * w[k] / sw : libre * 0.7 * w[0] / sw * 0.5; e.t = r1(t); t += e.duree; });
  };
  for (let k = 0; k < der; k++) repartir(segs[k].L, debut(segs[k]), segs[k].s - queueSeg);
  princ.t = r1(S.s - mp - princ.duree);
  if (S.L.length) repartir(S.L, debut(S), princ.t - gap);
  S.L.push(princ);
  // les bruits sur les efforts ; le plan à plat
  const bruits = [], souffles = [];
  let t0 = 0, cle = 0;
  segs.forEach((g, k) => {
    if (k > 0 && g.apresSouffle) souffles.push(r1(t0));
    const a = A[g.i]; a.secondes = g.s;
    a.bruits = g.L.map(e => Object.assign({}, e, { recette: bruit.recette, graine, cle: compteur * 16 + (cle++) }));
    for (const e of a.bruits) bruits.push(Object.assign({}, e, { t_abs: r1(t0 + e.t), effort: k }));
    t0 += g.s;
  });
  bruits.sort((x, y) => x.t_abs - y.t_abs);
  return { actions: A, plan: { bruits, souffles, pose_t: r1(t0), palier: ex.palier, facteur: ex.facteur } };
}

/* ------------------------------------------------------------------ la chute d'une chose au sol
   rec : la recette (son `echelle` dit comment la masse donne la hauteur et la durée). distance en m. */
export function planChute(rec, { masse = 1, distance = 1.5, graine = 0, cle = 0 } = {}) {
  const E = isObj(rec) && isObj(rec.echelle) ? rec.echelle : {}, rnd = alea(graine, 'chute:' + cle);
  const k = num(masse, 0.001, 1000, 1) / num(E.masse_ref_kg, 0.001, 1000, 1);
  const f0 = num(num(E.hauteur_hz, 20, 2000, 110) * Math.pow(k, num(E.exposant_hauteur, -2, 0, -0.3)) * (0.92 + 0.16 * rnd()), 25, 900, 110);
  const duree = num(num(E.duree_s, 0.02, 3, 0.25) * Math.pow(k, num(E.exposant_duree, 0, 1, 0.2)), 0.06, 1.6, 0.25);
  const loin = Math.max(1, num(distance, 0, 100, 1.5) / num(E.distance_ref_m, 0.1, 20, 1.5));
  const force = num(num(E.force, 0, 1, 0.5) * Math.pow(k, num(E.exposant_force, 0, 1, 0.15)), 0, 1, 0.5) / loin;
  const rebonds = k < num(E.rebond_sous, 0, 1e3, 0.2) ? entier(rnd, E.rebonds, [1, 2]) : 0;
  return { rang: 0, principal: false, duree: r1(duree), f0: r1(f0), force: r1(force), gain: r1(Math.min(REGLAGES_SON.gain_max, force * REGLAGES_SON.gain_max)),
    rates: 0, fin: null, vibrato: 0, rebonds, graine, cle: 'chute:' + cle, masse: r1(masse) };
}

/* ------------------------------------------------------------------ la partition : courbes de hauteur et d'amplitude
   (à sr_controle points par seconde), et les instants des coups (percussion). */
export function partition(rec, ev) {
  const sc = REGLAGES_SON.sr_controle, rnd = alea(ev.graine, 'part:' + ev.cle);
  const d = num(ev.duree, 0.02, REGLAGES_SON.duree_max_s, 0.3), N = Math.max(2, Math.ceil(d * sc) + 1);
  const f = new Float32Array(N), a = new Float32Array(N);
  const H = isObj(rec.hauteur) ? rec.hauteur : {}, Am = isObj(rec.amplitude) ? rec.amplitude : {}, Ra = isObj(rec.rates) ? rec.rates : {};
  const fin = isObj(rec.fins) && ev.fin && isObj(rec.fins[ev.fin]) ? rec.fins[ev.fin] : null;
  const V = isObj(H.vibrato) ? H.vibrato : {}, vhz = entre(rnd, V.hz, [6, 6]), vprof = entre(rnd, V.profondeur, [0, 0]) * num(ev.vibrato, 0, 2, 1);
  const vcr = num(V.croissance, 0, 4, 1), glisse = num(H.glisse, -3, 3, 0) * (0.7 + 0.6 * rnd());
  const inst = num(H.instabilite, 0, 1, 0), ihz = num(H.instabilite_hz, 0.5, 30, 4);
  const nn = Math.ceil(d * ihz) + 4, knots = Array.from({ length: nn }, () => rnd() * 2 - 1), knA = Array.from({ length: nn }, () => rnd() * 2 - 1);
  const lisse = (K, x) => { const i = Math.floor(x), u = x - i, s = u * u * (3 - 2 * u); return lerp(K[Math.min(i, K.length - 1)], K[Math.min(i + 1, K.length - 1)], s); };
  const tremble = num(Am.tremble, 0, 1, 0);
  // la fin : une part de la durée
  const df = fin ? Math.min(num(fin.duree_s, 0, 3, 0.3), 0.45 * d) : 0, tf = d - df;
  const montee = fin ? num(fin.montee, -2, 4, 0) : 0, niveau = fin ? num(fin.niveau, 0, 2, 0.5) : 1;
  const nb = fin ? Math.round(num(fin.bulles, 0, 8, 0)) : 0, sil = fin ? num(fin.silence_s, 0, 1, 0) : 0;
  const bulles = [];
  if (nb) { const u0 = 0.55, a0 = tf + df * u0 + sil, a1 = d - 0.03; for (let k = 0; k < nb; k++) bulles.push({ t: lerp(a0, a1, (k + 0.3 * rnd()) / nb), l: 0.025 + 0.03 * rnd(), g: 0.45 + 0.5 * rnd(), h: 1.1 + 0.7 * rnd() }); }
  // les ratés : ça cale (silence, la hauteur tombe), puis ça repart (plus haut ou plus bas)
  const rates = [];
  const nr = Math.max(Math.floor(num(ev.rates, 0, 10, 0)), poisson(rnd, num(ev.rates, 0, 10, 0) * num(Ra.par_s, 0, 5, 0.5) * tf));   // au moins la partie entière de « rates »
  for (let k = 0, essais = 0; rates.length < nr && essais < 4 * nr; essais++) {
    const t = lerp(0.15 * tf, 0.85 * tf, rnd()), l = entre(rnd, Ra.duree_s, [0.08, 0.25]);
    if (t + l < tf - 0.05 && !rates.some(r => Math.abs(r.t - t) < r.l + l + 0.1)) rates.push({ t, l, reprise: entre(rnd, Ra.reprise, [0.9, 1.2]) });
  }
  rates.sort((x, y) => x.t - y.t);
  // la percussion : des coups (le premier à 0, les rebonds)
  const perc = Am.forme === 'percussion', coups = [{ t: 0, g: 1 }];
  if (perc) for (let k = 0; k < (ev.rebonds | 0); k++) { const p = coups[coups.length - 1]; coups.push({ t: p.t + entre(rnd, Am.rebond_s, [0.06, 0.12]) * (1 - 0.3 * k), g: p.g * entre(rnd, Am.rebond_g, [0.25, 0.45]) }); }
  const CI = isObj(H.chute_initiale) ? H.chute_initiale : null, tau = Am.chute_rapport ? d * num(Am.chute_rapport, 0.01, 2, 0.3) : num(Am.chute_s, 0.005, 3, 0.1), att = num(Am.attaque_s, 0.001, 1, 0.02), rel = num(Am.relache_s, 0.002, 1, 0.05);
  const rampe = 0.012;
  for (let i = 0; i < N; i++) {
    const t = i / sc;
    let fr = ev.f0 * Math.pow(2, glisse * Math.min(t, tf) / d);
    fr *= 1 + vprof * Math.pow(Math.min(1, t / Math.max(tf, 0.01)), vcr) * Math.sin(2 * Math.PI * vhz * t + 0.6 * Math.sin(2 * Math.PI * 0.7 * t));
    fr *= 1 + inst * lisse(knots, t * ihz);
    let am = 1 + tremble * lisse(knA, t * ihz * 1.7);
    for (const r of rates) {
      if (t >= r.t + r.l) fr *= r.reprise;
      else if (t >= r.t) { const u = (t - r.t) / r.l; fr *= lerp(1, 0.72, Math.min(1, u * 3)); am *= Math.max(0, 1 - Math.min(1, (t - r.t) / rampe), Math.min(1, (t - r.t - r.l + rampe) / rampe)); }
      else if (t > r.t - 0.06) fr *= lerp(1, 0.85, (t - r.t + 0.06) / 0.06);   // il cale : la hauteur s'effondre juste avant
    }
    if (perc) {
      let e = 0, fc = 1;
      for (const c of coups) if (t >= c.t) { const x = t - c.t; e += c.g * Math.min(1, x / 0.002) * Math.exp(-x / (tau * (c.t ? 0.6 : 1))); if (CI) fc = 1 + (num(CI.rapport, 1, 8, 2) - 1) * Math.exp(-x / num(CI.duree_s, 0.002, 0.5, 0.02)); }
      am *= e; fr *= fc;
    } else {
      am *= Math.min(1, t / att) * clamp01((d - t) / rel);
    }
    if (fin && t > tf) {
      const u = (t - tf) / df, um = nb ? Math.min(1, u / 0.55) : u;
      fr *= Math.pow(2, montee * um * um);
      am *= lerp(1, niveau, um);
      if (nb && u > 0.55) {                                            // le silence, puis des bulles
        let g = 0, h = 1; for (const b of bulles) if (t >= b.t && t < b.t + b.l) { const x = (t - b.t) / b.l; g = b.g * Math.sin(Math.PI * x); h = b.h; }
        am = g; fr = ev.f0 * h * Math.pow(2, glisse);
      }
      if (fin.pop && t > d - 0.02) am *= 1.25;
    }
    f[i] = Math.min(REGLAGES_SON.hz_max, Math.max(REGLAGES_SON.hz_min, fr));
    a[i] = Math.max(0, am);
  }
  return { sr: sc, f, a, duree: d, rates, bulles, coups };
}
/* La valeur d'une courbe de partition à l'instant t (s). */
export function auTemps(courbe, sr, t) { const x = t * sr, i = Math.floor(x); if (i < 0) return courbe[0]; if (i >= courbe.length - 1) return courbe[courbe.length - 1]; return lerp(courbe[i], courbe[i + 1], x - i); }

/* ------------------------------------------------------------------ les prises (échantillons libres embarqués)
   Une prise : { id, hz (fondamentale estimée), sr, pcm (base64 de PCM 8 bits non signé) }. */
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
export function decoderPrise(p) {
  if (!isObj(p) || typeof p.pcm !== 'string') return null;
  if (p._f) return p._f;
  const s = p.pcm.replace(/[^A-Za-z0-9+/]/g, ''), n = Math.floor(s.length * 3 / 4), o = new Float32Array(n);
  let j = 0;
  for (let i = 0; i + 3 < s.length + 3 && j < n; i += 4) {
    const v = (B64.indexOf(s[i]) << 18) | (B64.indexOf(s[i + 1]) << 12) | ((B64.indexOf(s[i + 2]) & 63) << 6) | (B64.indexOf(s[i + 3]) & 63);
    for (const b of [(v >> 16) & 255, (v >> 8) & 255, v & 255]) if (j < n) o[j++] = (b - 128) / 128;
  }
  Object.defineProperty(p, '_f', { value: o, enumerable: false });
  return o;
}
/* Lire une prise étirée et transposée : grains de ~60 ms en fenêtre de Hann, recouvrement de moitié ; la position dans la
   prise avance pour que la prise entière dure `d` (étirement), la lecture dans chaque grain suit la hauteur voulue. */
function lirePrise(src, srP, hzP, P, sr, n, rnd, boucle) {
  const out = new Float32Array(n), G = Math.round(0.06 * sr), hop = G >> 1, L = src.length, durP = L / srP;
  for (let g0 = -hop; g0 < n; g0 += hop) {
    const tc = Math.max(0, (g0 + hop) / sr), u = Math.min(1, tc / P.duree);
    const fr = auTemps(P.f, P.sr, tc), rate = Math.min(4, Math.max(0.15, fr / hzP)) * srP / sr;
    let pos = (boucle ? (u * P.duree * 0.6) % durP : u * durP * 0.92) * srP + (rnd() - 0.5) * 0.02 * srP;
    for (let k = 0; k < G; k++) {
      const i = g0 + k; if (i < 0 || i >= n) continue;
      const x = pos + k * rate, xi = Math.floor(x); if (xi < 0 || xi + 1 >= L) continue;
      const w = 0.5 - 0.5 * Math.cos(2 * Math.PI * k / G);
      out[i] += w * lerp(src[xi], src[xi + 1], x - xi);
    }
  }
  return out;
}

/* ------------------------------------------------------------------ la synthèse de la source (avant formants et micro)
   Rend un Float32Array mono, crête normalisée à 1 (le gain du bruit se règle après). prises : { id: prise }. */
export function synthese(rec, ev, sr = 44100, prises = {}) {
  const P = partition(rec, ev), rnd = alea(ev.graine, 'synth:' + ev.cle), queueS = Math.round(0.02 * sr);
  const n = Math.ceil(P.duree * sr) + queueS, out = new Float32Array(n);
  const C = liste(rec.couches).filter(isObj);
  const imp = C.find(c => c.source === 'impulsions');
  const oq = imp ? num(imp.ouverture, 0.1, 0.9, 0.4) : 0.4, jit = imp ? num(imp.jitter, 0, 0.5, 0.05) : 0, shimmer = imp ? num(imp.shimmer, 0, 1, 0.2) : 0;
  const irr = imp ? num(imp.irregularite, 0, 0.8, 0) : 0, deriv = imp ? num(imp.claquement, 0, 1, 0.6) : 0;
  let ph = 0, perJ = 1, shim = 1, skip = false, gPrev = 0;
  const etats = C.map(c => ({ ph: rnd() * 6.28, lo: 0, bp: 0 }));
  // la prise, s'il y en a une : lue d'un coup, étirée et transposée sur la partition
  const cp = C.find(c => c.source === 'prise');
  let lue = null;
  if (cp) {
    const p = ev.prise && isObj(prises[ev.prise]) ? prises[ev.prise] : null, src = p && decoderPrise(p);   // la prise que le plan désigne, sinon rien
    if (src && src.length > 64) lue = lirePrise(src, num(p.sr, 4000, 48000, 11025), num(p.hz, 20, 2000, 120), P, sr, n - queueS, rnd, !!cp.boucle);
  }
  const part = num(ev.prise_part, 0, 1, 0.5);
  for (let i = 0; i < n - queueS; i++) {
    const t = i / sr, fr = auTemps(P.f, P.sr, t), am = auTemps(P.a, P.sr, t);
    // les lèvres qui vibrent : une impulsion par période (ouverture douce, fermeture sèche), jitter, shimmer, ratés d'impulsion
    ph += fr * perJ / sr;
    if (ph >= 1) { ph -= Math.floor(ph); perJ = 1 + jit * (rnd() * 2 - 1); shim = 1 + shimmer * (rnd() * 2 - 1); skip = rnd() < irr; }
    const to = oq * 0.65, tn = oq * 0.35;
    const g = ph < to ? 0.5 - 0.5 * Math.cos(Math.PI * ph / to) : ph < oq ? Math.cos(Math.PI / 2 * (ph - to) / tn) : 0;
    const dg = (g - gPrev) / Math.max(1e-4, Math.PI * fr / (2 * to * sr)); gPrev = g;
    const pulse = (skip ? 0.15 : 1) * shim * ((1 - deriv) * (g - oq * 0.5) + deriv * dg * 0.5);
    let y = 0;
    C.forEach((c, k) => {
      const e = etats[k], gn = num(c.gain, 0, 4, 1) * (!lue ? 1 : c.source === 'prise' ? 2 * part : 2 * (1 - part));   // la prise et la synthèse, selon la part que dit le plan
      if (c.source === 'impulsions') y += gn * pulse;
      else if (c.source === 'onde') {
        e.ph += 2 * Math.PI * fr * num(c.rapport, 0.1, 8, 1) / sr;
        const s = Math.sin(e.ph); y += gn * (c.forme === 'carre' ? Math.tanh(4 * s) : c.forme === 'scie' ? ((e.ph / 6.2832) % 1) * 2 - 1 : s) * (c.suit === 'impulsions' ? 0.3 + g : 1);
      } else if (c.source === 'bruit') {
        const F = isObj(c.filtre) ? c.filtre : {}, w = rnd() * 2 - 1;
        const hz = Math.min(sr * 0.45, F.hz_rapport ? fr * num(F.hz_rapport, 0.1, 40, 3) : num(F.hz, 20, 16000, 800));
        const q = num(F.q, 0.3, 20, 1), fk = 2 * Math.sin(Math.PI * hz / sr), hp = w - e.lo - e.bp / q;   // filtre à états variables
        e.bp += fk * hp; e.lo += fk * e.bp;
        const v = F.type === 'passe_bas' ? e.lo : F.type === 'passe_haut' ? hp : e.bp;
        y += gn * v * (c.suit === 'impulsions' ? g : 1) * (c.decroit_s ? Math.exp(-t / c.decroit_s) : 1);
      } else if (c.source === 'prise' && lue) y += gn * lue[i];
    });
    out[i] = am * y;
  }
  // sans continu (passe-haut d'un pôle à 20 Hz), crête à 1
  let x1 = 0, y1 = 0, pk = 0; const R = Math.exp(-2 * Math.PI * 20 / sr);
  for (let i = 0; i < n; i++) { const x = out[i], v = x - x1 + R * y1; x1 = x; y1 = v; out[i] = v; pk = Math.max(pk, Math.abs(v)); }
  if (pk > 0) for (let i = 0; i < n; i++) out[i] /= pk;
  return out;
}

/* L'enveloppe d'un bruit en cours (0..1, force comprise) : ce qui fait trembler la caméra. */
export function enveloppe(P, ev, t) { return t < 0 || t > P.duree ? 0 : Math.min(1, auTemps(P.a, P.sr, t)) * num(ev.force, 0, 1, 0.5); }

/* ------------------------------------------------------------------ la couche qui joue (Web Audio)
   chaine(ctx, B) : l'entrée des bruits → prise micro de téléphone (passe-haut, passe-bas, présence, compression, écrêtage
   quand c'est fort, réverbération courte de plein air) → volume général → limiteur → plafond doux → sortie. */
function courbe(fn, n = 2048) { const c = new Float32Array(n); for (let i = 0; i < n; i++) c[i] = fn(i / (n - 1) * 2 - 1); return c; }
export function chaine(ctx, B = {}) {
  const M = isObj(B.micro) ? B.micro : {}, So = isObj(B.sortie) ? B.sortie : {};
  const entree = ctx.createGain();
  const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = num(M.passe_haut_hz, 20, 1000, 120); hp.Q.value = 0.7;
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = num(M.passe_bas_hz, 1000, 20000, 7000); lp.Q.value = 0.7;
  const pr = ctx.createBiquadFilter(); pr.type = 'peaking'; const PR = isObj(M.presence) ? M.presence : {};
  pr.frequency.value = num(PR.hz, 200, 8000, 2500); pr.gain.value = num(PR.gain_db, -12, 12, 3); pr.Q.value = 1;
  const co = ctx.createDynamicsCompressor(), CO = isObj(M.compression) ? M.compression : {};
  co.threshold.value = num(CO.seuil_db, -60, 0, -24); co.ratio.value = num(CO.ratio, 1, 20, 4); co.knee.value = 6; co.attack.value = 0.005; co.release.value = 0.2;
  const EC = isObj(M.ecretage) ? M.ecretage : {}, s = num(EC.seuil, 0.1, 1, 0.6);
  const pousse = ctx.createGain(); pousse.gain.value = num(EC.pousse, 0.5, 8, 2);
  const ec = ctx.createWaveShaper(); ec.curve = courbe(x => { const a = Math.abs(x); return Math.sign(x) * (a < s ? a : s + (1 - s) * Math.tanh((a - s) / (1 - s))); }); ec.oversample = '2x';
  const apres = ctx.createGain(); apres.gain.value = 1 / Math.max(1, num(EC.pousse, 0.5, 8, 2)) * num(EC.rattrape, 0.5, 4, 1.4);
  entree.connect(hp); hp.connect(lp); lp.connect(pr);
  if (num(CO.ratio, 1, 20, 4) > 1.01) { pr.connect(co); co.connect(pousse); } else pr.connect(pousse);   // la compression du téléphone (Chrome y ajoute un gain de rattrapage) ; ratio 1 : aucune
  pousse.connect(ec); ec.connect(apres);
  const general = ctx.createGain(); general.gain.value = 0;
  apres.connect(general);
  const RV = isObj(M.reverb) ? M.reverb : {};
  if (num(RV.mouille, 0, 1, 0) > 0 && ctx.createConvolver) {        // plein air : quelques réflexions courtes, une réponse faite de bruit qui s'éteint
    const d = num(RV.duree_s, 0.05, 2, 0.3), sr = ctx.sampleRate, L = Math.ceil(d * sr), ir = ctx.createBuffer(1, L, sr), c = ir.getChannelData(0), rnd = alea('reverb');
    for (let i = 0; i < L; i++) c[i] = (rnd() * 2 - 1) * Math.exp(-5 * i / L) * (i < sr * 0.004 ? 0 : 1);
    const cv = ctx.createConvolver(); cv.normalize = true; cv.buffer = ir;
    const mo = ctx.createGain(); mo.gain.value = num(RV.mouille, 0, 1, 0.1);
    apres.connect(cv); cv.connect(mo); mo.connect(general);
  }
  const li = ctx.createDynamicsCompressor();                          // le limiteur : pas d'écrêtage numérique involontaire
  li.threshold.value = num(So.limiteur_db, -30, 0, -3); li.knee.value = 0; li.ratio.value = 20; li.attack.value = 0.001; li.release.value = 0.1;
  const pl = num(So.plafond, 0.1, 1, 0.9), plafond = ctx.createWaveShaper(); plafond.curve = courbe(x => pl * Math.tanh(x / pl));
  general.connect(li); li.connect(plafond); plafond.connect(ctx.destination);
  const volume = Math.min(REGLAGES_SON.volume_max, num(So.volume, 0, 1, 0.5));
  return { entree, general, volume };
}
/* Un bruit : la source (tampon) → formants (crêtes) → saturation douce → gain borné → l'entrée de la chaîne, à l'instant quand. */
export function voixBruit(ctx, chaineE, rec, ev, data, quand = 0) {
  const buf = ctx.createBuffer(1, data.length, ctx.sampleRate); buf.getChannelData(0).set(data);
  const src = ctx.createBufferSource(); src.buffer = buf;
  let n = src;
  for (const fo of liste(rec.formants).filter(isObj).slice(0, 5)) {
    const b = ctx.createBiquadFilter(); b.type = 'peaking'; b.frequency.value = num(fo.hz, 30, 12000, 500); b.Q.value = num(fo.q, 0.3, 30, 2); b.gain.value = num(fo.gain_db, -24, 18, 0);
    n.connect(b); n = b;
  }
  const dr = 1 + num(rec.saturation, 0, 10, 0) * num(ev.force, 0, 1, 0.5) * 4;
  if (dr > 1.01) { const w = ctx.createWaveShaper(); w.curve = courbe(x => Math.tanh(dr * x) / Math.tanh(dr)); w.oversample = '2x'; n.connect(w); n = w; }
  const g = ctx.createGain(); g.gain.value = Math.min(REGLAGES_SON.gain_max, num(ev.gain, 0, 1, 0.5));
  n.connect(g); g.connect(chaineE);
  src.start(Math.max(ctx.currentTime, quand));
  return { src, gain: g };
}
/* Rendu hors ligne (essais) : des bruits ({...ev, t} en s), par la même chaîne, dans un OfflineAudioContext. Rend un Float32Array. */
export async function rendreHorsLigne(Hors, B, evs, sr = 44100) {
  const L = (Array.isArray(evs) ? evs : [evs]).map(ev => ({ ev, rec: B.recettes[ev.recette] })).filter(x => x.rec);
  const D = L.map(x => Object.assign(x, { data: synthese(x.rec, x.ev, sr, B.prises || {}) }));
  const fin = Math.max(0.1, ...D.map(x => num(x.ev.t, 0, 600, 0) + x.data.length / sr));
  const ctx = new Hors(1, Math.ceil((fin + 0.5) * sr), sr), c = chaine(ctx, B);
  c.general.gain.value = c.volume;
  for (const x of D) voixBruit(ctx, c.entree, x.rec, x.ev, x.data, num(x.ev.t, 0, 600, 0));
  const r = await ctx.startRendering();
  return r.getChannelData(0);
}

/* Le lecteur de la page : un contexte audio créé au premier geste du joueur, repris s'il est suspendu ; rien ne casse sans
   Web Audio. La chronologie (enveloppe, occupé, journal) vit même sans son : la caméra tremble pareil. */
export function creerSons({ fabriquer = null, bruitages = {}, maintenant = () => Date.now() / 1000, journal = () => {} } = {}) {
  const B = isObj(bruitages) ? bruitages : {}, recettes = isObj(B.recettes) ? B.recettes : {};
  const So = isObj(B.sortie) ? B.sortie : {}, baisse = num(So.baisse, 0, 1, 0.25);
  let ctx = null, ch = null, on = true, cache = false, bas = false, refus = false;
  const prets = new Map(), enCours = [];
  const sr = () => ctx ? ctx.sampleRate : 44100;
  const cle = ev => ev.graine + '|' + ev.cle + '|' + ev.recette;
  function niveau() {
    if (!ctx || !ch) return;
    const v = on && !cache ? ch.volume * (bas ? baisse : 1) : 0;
    try { ch.general.gain.setTargetAtTime(v, ctx.currentTime, 0.05); } catch (_) { ch.general.gain.value = v; }
  }
  function geste() {
    if (!on || refus) return false;
    if (!ctx) {
      try { ctx = fabriquer ? fabriquer() : null; } catch (_) { ctx = null; }
      if (!ctx) { refus = true; return false; }
      try { ch = chaine(ctx, B); } catch (e) { journal('son:' + (e && e.message)); ctx = null; refus = true; return false; }
      niveau();
    }
    if (ctx.state === 'suspended' && !cache) ctx.resume().catch(() => {});
    return true;
  }
  function preparer(evs) {                                           // la synthèse à l'avance (au moment où le geste arrive)
    for (const ev of liste(evs)) {
      const rec = recettes[ev.recette]; if (!rec || prets.has(cle(ev))) continue;
      try { prets.set(cle(ev), { data: synthese(rec, ev, sr(), B.prises || {}), P: partition(rec, ev) }); } catch (e) { journal('son:' + (e && e.message)); }
      if (prets.size > 24) prets.delete(prets.keys().next().value);
    }
  }
  function jouer(ev) {
    const rec = recettes[ev.recette]; if (!rec) return null;
    preparer([ev]);
    const p = prets.get(cle(ev)); if (!p) return null;
    let audio = false;
    if (on && ctx && ch && ctx.state !== 'closed') { try { voixBruit(ctx, ch.entree, rec, ev, p.data, ctx.currentTime + 0.01); audio = ctx.state === 'running'; } catch (e) { journal('son:' + (e && e.message)); } }
    const x = { t0: maintenant(), ev, P: p.P, audio };
    enCours.push(x);
    while (enCours.length && maintenant() - enCours[0].t0 > enCours[0].P.duree + 1) enCours.shift();
    return x;
  }
  const vivants = () => enCours.filter(x => maintenant() - x.t0 <= x.P.duree);
  return {
    geste, preparer, jouer,
    enveloppe: () => vivants().reduce((m, x) => Math.max(m, enveloppe(x.P, x.ev, maintenant() - x.t0)), 0),
    occupe: (min_s = 0.8) => vivants().filter(x => x.P.duree >= min_s).reduce((m, x) => Math.max(m, x.P.duree - (maintenant() - x.t0)), 0),   // un gros bruit couvre encore, en s
    baisser: v => { bas = !!v; niveau(); },
    masquer: v => { cache = !!v; niveau(); if (ctx) { try { if (cache) ctx.suspend().catch(() => {}); else if (on) ctx.resume().catch(() => {}); } catch (_) {} } },
    actif: v => { if (v !== undefined) { on = !!v; if (on) refus = false; niveau(); } return on; },
    etat: () => ({ actif: on, contexte: ctx ? ctx.state : refus ? 'refus' : 'aucun', en_cours: vivants().length, bas, cache }),
  };
}
