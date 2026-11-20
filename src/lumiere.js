/* Le monde en JS et la lumière du soleil (module pur, sans DOM : la page l'embarque en LUMIERE, les tests l'importent).
   Ici vit la copie JS du monde de monde.glsl : trajet (pathX), relief (terrainH, bosses et buttes), troncs (arbreA), perches
   (percheB), blocs de grès (blocGres), houppiers (charpentières, masses, bouquets) et trouée. MÊMES FORMULES que le shader,
   à modifier des deux côtés (CLAUDE.md, « Conventions »). L'état est l'objet S de la page (ou etatDeFiche pour les tests) :
   seed, kit, kitP, traj, rel, relB, relC, relS, relOn, creux, houp, hp, sunDir, trou, trou2, degage(x, z).

   Sur ce monde, la lumière directe du soleil en un point du sol (soleilEn), le départ au soleil (chercherDepart, fiche :
   parcours.depart.lumiere) et le point éclairé (ou à l'ombre) le plus proche (chercherLumiere, action « lumiere »).
   docs/fiche-de-lieu.md, « Départ et trouée » ; docs/meneur-de-jeu.md §23. */

export const F32 = Math.fround;
export const fr32 = x => F32(x - Math.floor(x));
export const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const clampN = (v, a, b, d) => { v = Number(v); return Number.isFinite(v) ? Math.min(b, Math.max(a, v)) : d; };
const isObj = v => v && typeof v === 'object' && !Array.isArray(v);

/* ---- aléa : h42, h21, vnoise2 en flottants 32 bits (au bit près comme le shader, pour les cellules) */
export function h42(px, py) {
  px = F32(px); py = F32(py);
  let a = fr32(F32(px * F32(.1031))), b = fr32(F32(py * F32(.1030))), c = fr32(F32(px * F32(.0973))), d = fr32(F32(py * F32(.1099)));
  const k = F32(33.33), t = F32(F32(F32(F32(a * F32(d + k)) + F32(b * F32(c + k))) + F32(c * F32(a + k))) + F32(d * F32(b + k)));
  a = F32(a + t); b = F32(b + t); c = F32(c + t); d = F32(d + t);
  return [fr32(F32(F32(a + b) * c)), fr32(F32(F32(a + c) * b)), fr32(F32(F32(b + c) * d)), fr32(F32(F32(c + d) * a))];
}
export function h21(px, py) {
  px = F32(px); py = F32(py); let a = fr32(F32(px * F32(.1031))), b = fr32(F32(py * F32(.1031))), c = fr32(F32(px * F32(.1031)));
  const k = F32(33.33), t = F32(F32(F32(a * F32(b + k)) + F32(b * F32(c + k))) + F32(c * F32(a + k))); a = F32(a + t); b = F32(b + t); c = F32(c + t);
  return fr32(F32(F32(a + b) * c));
}
export function vnoise2(x, y) {
  const ix = Math.floor(x), iy = Math.floor(y); let fx = x - ix, fy = y - iy; fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
  const m = (a, b, t) => a + (b - a) * t; return m(m(h21(ix, iy), h21(ix + 1, iy), fx), m(h21(ix, iy + 1), h21(ix + 1, iy + 1), fx), fy);
}
/* h31, h33, vnoise3 : en flottants 64 bits (statistiquement les mêmes que le shader, pas au bit près : trouées des feuilles) */
const fr = x => x - Math.floor(x);
function h31(x, y, z) { x = fr(x * .1031); y = fr(y * .1031); z = fr(z * .1031); const t = x * (z + 31.32) + y * (y + 31.32) + z * (x + 31.32); x += t; y += t; z += t; return fr((x + y) * z); }
function h33(x, y, z) { x = fr(x * .1031); y = fr(y * .1030); z = fr(z * .0973); const t = x * (y + 33.33) + y * (x + 33.33) + z * (z + 33.33); x += t; y += t; z += t;
  return [fr((x + y) * z), fr((x + x) * y), fr((y + x) * x)]; }
function vnoise3(x, y, z) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z); let fx = x - ix, fy = y - iy, fz = z - iz;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy); fz = fz * fz * (3 - 2 * fz);
  const m = (a, b, t) => a + (b - a) * t, h = (a, b, c) => h31(ix + a, iy + b, iz + c);
  return m(m(m(h(0, 0, 0), h(1, 0, 0), fx), m(h(0, 1, 0), h(1, 1, 0), fx), fy), m(m(h(0, 0, 1), h(1, 0, 1), fx), m(h(0, 1, 1), h(1, 1, 1), fx), fy), fz);
}

/* ---- réglages tirés de la fiche (la page les range dans S, les tests dans etatDeFiche) */
export const kitDe = f => f.kit === 'dunes' ? 1 : f.kit === 'nu' || (f.kit === undefined && Array.isArray(f.semis) && f.semis.length) ? 2 : 0;
export function graineVec(n) { return [(n * 12.9898) % 89, (n * 78.233) % 83, (n * .618034) % 6.2832]; }
export function kitParams(f, kit) {
  const fo = f.foret || {};
  return kit === 1 ? [-1, (f.dunes && f.dunes.rochers) || 0, 0, 1] : kit === 2 ? [-1, 0, 0, 1]
    : [fo.densite !== undefined ? (.2 + .6 * fo.densite) * Math.min(1, fo.densite * 5) : .62, fo.rochers !== undefined ? fo.rochers : 1, fo.feuillage !== undefined ? fo.feuillage : 1, 1];
}
export function soleilDir(so) {
  so = so || { azimut: -33, hauteur: 21 };
  const nuit = so.hauteur < -1, el = nuit ? 38 : Math.max(2, so.hauteur), az = so.azimut * Math.PI / 180, e = el * Math.PI / 180;
  return [Math.sin(az) * Math.cos(e), Math.sin(e), Math.cos(az) * Math.cos(e)];
}
/* Relief et trajet : la fiche règle les formules de terrainH et pathX. Sans réglage, la forêt d'origine à l'identique. */
export function reglerRelief(S, f, seedN) {
  S.rel = [1, 1, 0, 0]; S.traj = [1, .85, .3, .5]; S.creux = [.10, 1.8, .4, 0]; S.terK = [.88, 0]; S.pente = .22;
  S.relB = [0, 0, 0, 0]; S.relC = [0, 0, 1, 1]; S.relS = [0, 0]; S.relOn = false;
  if (S.kit === 1) return;                                       // dunes : relief encore en dur
  const re = isObj(f.relief) ? f.relief : null, tr = isObj(f.trajet) ? f.trajet : null;
  if (!re && !tr && S.kit === 0) return;
  /* Bosses (creux et bosses de 5 à 30 m) et buttes (flanc puis plateau, au second plan) : reliefDetail dans monde.glsl, variante
     RELIEF compilée seulement si la fiche en demande. hauteur en m, echelle en m (longueur d'onde), trajet : part gardée sur le trajet. */
  const bo = re && isObj(re.bosses) ? re.bosses : null, bu = re && isObj(re.buttes) ? re.buttes : null;
  const hB = bo ? clampN(bo.hauteur, 0, 4, 0) : 0, hT = bu ? clampN(bu.hauteur, 0, 25, 0) : 0;
  if (hB > 0 || hT > 0) {
    const part = bu ? clampN(bu.part, 0, 1, .3) : .3, plat = bu ? clampN(bu.plat, 0, 1, .5) : .5, s1 = .78 - .4 * part, s0 = s1 - (.06 + .22 * (1 - plat));
    S.relB = [hB, 1 / (bo ? clampN(bo.echelle, 3, 80, 12) : 12), hT, 1 / (bu ? clampN(bu.echelle, 15, 400, 60) : 60)];
    S.relC = [s0, s1, bo ? clampN(bo.trajet, 0, 1, .35) : .35, bu ? clampN(bu.trajet, 0, 1, .5) : .5];
    S.relS = [seedN % 997, (seedN * 7) % 991]; S.relOn = true;
  }
  const amp = clampN(re && re.amplitude, 0, 12, S.kit === 2 ? .8 : 1.5), ech = clampN(re && re.echelle, 20, 600, 150), pente = clampN(re && re.pente, -.35, .35, 0);
  const larg = clampN(tr && tr.largeur, .6, 30, 1.7), hw = larg / 2, net = !!(tr && tr.bord === 'net'), creux = clampN(tr && tr.creux, 0, 1.2, .10);   // jusqu'à 1,2 m : un sentier encaissé entre deux talus
  const niv = re && re.niveler !== undefined ? !!re.niveler : S.kit === 2 && larg >= 3;
  S.rel = [amp / 1.5, 150 / ech, pente, niv ? hw + 2 : 0];
  S.traj = [clampN(tr && tr.sinuosite, 0, 2, 1), hw, net ? .03 : .3, net ? 0 : .5];
  S.creux = [creux, hw + (net ? .18 : .95), net ? hw : Math.max(0, hw - .45), 0];
  const g = S.rel[0] * S.rel[1] * .22 + Math.abs(pente) + (S.relOn ? 3 * S.relB[0] * S.relB[1] + .6 * S.relB[2] * S.relB[3] / Math.max(.05, S.relC[1] - S.relC[0]) : 0); S.pente = g;     // pente la plus forte du relief, en gros
  S.terK = [.88 / Math.sqrt(1 + g * g), 0];
  const cg = 1.5 * creux / Math.max(.05, S.creux[1] - S.creux[2]);       // bord de trottoir : pas réduit seulement là
  if (cg > .5) S.terK[1] = S.terK[0] / Math.sqrt(1 + cg * cg);
}
/* Un port de houppier (foret.houppiers.*.*), en nombres : 16 flottants à partir de i × 16 dans hp (uHp de monde.glsl). */
export function portHoupNum(hp, o, i, part) {
  if (!isObj(o)) return false;
  const hb = Array.isArray(o.hauteur) ? o.hauteur : [.45, 1], bas = clampN(hb[0], 0, .95, .45), haut = clampN(hb[1], bas + .03, 1, 1);
  hp.set([bas, haut, clampN(o.largeur, .2, 8, 2.5), clampN(o.aplati, 0, 1, .3),
    Math.round(clampN(o.branches, 1, 8, 5)), clampN(o.montee, 0, 1, .5), clampN(o.retombe, 0, 1, .1), Math.round(clampN(o.rameaux, 0, 3, 2)),
    clampN(o.masse, .15, 2.5, .8), clampN(o.feuilles, 0, 1, .5), clampN(o.taille, .02, .4, .08), 1, part, clampN(o.inegal, 0, 1, 0), 0, 0], i * 16);
  return true;
}
/* Trouée (foret.trouee) : une bande sans arbre, perche ni bloc, qui part du trajet à le_long m et s'ouvre vers le soleil (ou un
   azimut) sur longueur m, demi-largeur ondulée autour de largeur / 2. Rangée dans S.trou (origine x, z ; direction unitaire)
   et S.trou2 (longueur, demi-largeur, phase des bords) ; tout à 0 sans trouée : troue() (monde.glsl) ne retire rien. */
export function reglerTrouee(S, f, pathX) {
  S.trou = [0, 0, 0, 0]; S.trou2 = [0, 0, 0, 0];
  const fo = isObj(f.foret) ? f.foret : null;
  let t = fo && (Array.isArray(fo.trouees) ? fo.trouees[0] : fo.trouee);   // une seule trouée par lieu
  if (!isObj(t) || S.kit !== 0) return;
  const z0 = clampN(t.le_long, -400, 400, 0), L = clampN(t.longueur, 5, 200, 120), hw = clampN(t.largeur, 4, 40, 16) / 2;
  let dx, dz;
  if (typeof t.vers === 'number') { const a = t.vers * Math.PI / 180; dx = Math.sin(a); dz = Math.cos(a); }
  else { const s = S.sunDir, n = Math.hypot(s[0], s[2]) || 1; dx = s[0] / n; dz = s[2] / n; }   // « soleil » (par défaut)
  S.trou = [pathX(z0), z0, dx, dz]; S.trou2 = [L, hw, (S.seed[2] * 3.7) % 6.2832, 0];
}
/* L'état du monde d'une fiche, sans la page (tests, outils) : les mêmes réglages que applyFiche (src/main.js). */
export function etatDeFiche(f) {
  const n = f.graine || 4821, S = { seed: graineVec(n), kit: kitDe(f), hp: new Float32Array(64), degage: () => false };
  S.kitP = kitParams(f, S.kit);
  reglerRelief(S, f, n);
  const fo = f.foret || {}, cone = fo.houppier === 'cone';
  S.can = cone ? [clampN(fo.houppier_bas, .3, 8, 1.6), 19] : [7, 19];
  S.houp = [cone ? 1 : 0, S.can[0], clampN(fo.houppier_rayon, .8, 3.2, 3), clampN(fo.perches, 0, 1, cone ? .25 : 1)];
  const sf = isObj(f.surfaces) ? f.surfaces : {}, parts = [clampN(isObj(sf.arbres) ? sf.arbres.part : undefined, 0, 1, .45), clampN(isObj(sf.perches) ? sf.perches.part : undefined, 0, 1, .5)];
  const h = S.kit === 0 && isObj(fo.houppiers) ? fo.houppiers : null;
  if (h) { const fam = ['arbres', 'perches']; for (let i = 0; i < 2; i++) { const g = isObj(h[fam[i]]) ? h[fam[i]] : {};
    S.hp[(2 * i) * 16 + 12] = parts[i]; portHoupNum(S.hp, g.a, 2 * i, parts[i]); portHoupNum(S.hp, g.b, 2 * i + 1, parts[i]); } }
  S.sunDir = soleilDir(f.ambiance && f.ambiance.soleil);
  if (f.ambiance && f.ambiance.saison === 'hiver') S.kitP[2] *= .15;
  const W = mondeJS(S); reglerTrouee(S, f, W.pathX);
  return S;
}

/* ---- le monde : mêmes formules que monde.glsl */
const CA = 6, CB = 3.3, CC = 8.5;
const COUV = .65;                  // part d'une couche de bouquet couverte quand les feuilles y sont (réglée sur la carte d'ombres du moteur)
export function mondeJS(S) {
  const pathX = z => S.traj[0] * (3.2 * Math.sin(z * .047 + S.seed[2]) + 1.6 * Math.sin(z * .113 + 1.7 + S.seed[2] * 2));
  const pathYaw = z => Math.atan2(pathX(z + 3) - pathX(z - 3), 6);
  function ondul(x, z) { const qx = x * S.rel[1], qz = z * S.rel[1];
    return S.rel[0] * (1.5 * Math.sin(qx * .041 + .6 + S.seed[2]) * Math.cos(qz * .035 + 1.1) + .65 * Math.sin(qx * .097 + qz * .071 + 2) + .22 * Math.sin(qx * .29 - qz * .21 + S.seed[2] * 3)); }
  /* Bosses et buttes : la même formule que reliefDetail (monde.glsl), au bit près pour le hachage (entiers non signés, Math.imul). */
  function hR(cx, cz) { let x = (Math.imul((cx + S.relS[0] + 46000) >>> 0, 1597334677) ^ Math.imul((cz + S.relS[1] + 46000) >>> 0, 3812015801)) >>> 0;
    x = (Math.imul(x, 747796405) + 2891336453) >>> 0; x = Math.imul(((x >>> ((x >>> 28) + 4)) ^ x) >>> 0, 277803737) >>> 0; x = ((x >>> 22) ^ x) >>> 0; return (x >>> 8) / 16777216; }
  function bruitR(px, pz) { const ix = Math.floor(px), iz = Math.floor(pz); let fx = px - ix, fz = pz - iz; fx = fx * fx * (3 - 2 * fx); fz = fz * fz * (3 - 2 * fz);
    const a = hR(ix, iz), b = hR(ix + 1, iz), c = hR(ix, iz + 1), d = hR(ix + 1, iz + 1); return (a + (b - a) * fx) + ((c + (d - c) * fx) - (a + (b - a) * fx)) * fz; }
  function reliefDetail(x, z, ax) {
    const B = S.relB, C = S.relC, qx = x * B[1], qz = z * B[1], rx = x * B[3], rz = z * B[3], hw = S.traj[1];
    if (B[0] === 0 && B[2] === 0) return 0;                              // ni bosses ni buttes (comme monde.glsl)
    const b = (bruitR(qx, qz) - .5) * 1.4 + (bruitR((.8 * qx - .6 * qz) * 2.13 + 31, (.6 * qx + .8 * qz) * 2.13 + 17) - .5) * .6;
    const t = sstep(C[0], C[1], bruitR(.6 * rx + .8 * rz - 57, -.8 * rx + .6 * rz + 83));
    return B[0] * b * (C[2] + (1 - C[2]) * sstep(hw, hw + 2.5, ax)) + B[2] * t * (C[3] + (1 - C[3]) * sstep(hw + 1, hw + 14, ax));
  }
  function terrainH(x, z) {
    if (S.kit === 1) { const a = x * .045 + .9 * Math.sin(z * .021 + S.seed[2]) + .5 * Math.sin(z * .05 + 1.3);
      return 3.2 * (1 - Math.abs(Math.sin(a))) * (.62 + .38 * Math.sin(z * .03 + 2 + S.seed[2])) + .5 * Math.sin(x * .11 + z * .08); }
    const px = pathX(z), ax = Math.abs(x - px);
    let h = ondul(S.rel[3] > 0 ? x + (px - x) * sstep(S.rel[3] + 5, S.rel[3], ax) : x, z);   // une rue reste de niveau en travers : l'ondulation y est lue sur l'axe
    h += S.rel[2] * z;
    h -= S.creux[0] * sstep(S.creux[1], S.creux[2], ax);
    return S.relOn ? h + reliefDetail(x, z, ax) : h;
  }
  /* Trouée : troue() de monde.glsl. */
  function troue(wx, wz) {
    const T = S.trou, T2 = S.trou2; if (!T || !T2 || !(T2[0] > 0)) return false;
    const dx = wx - T[0], dz = wz - T[1], a = dx * T[2] + dz * T[3], l = Math.abs(dx * T[3] - dz * T[2]);
    return a > -T2[1] && a < T2[0] && l < T2[1] * (.8 + .2 * Math.sin(a * .21 + T2[2]) + .15 * Math.sin(a * .57 + 1.3));
  }
  const libre = (wx, wz) => (S.degage && S.degage(wx, wz)) || troue(wx, wz);   // cleared() || troue()
  const sx = () => F32(S.seed[0]), sy = () => F32(S.seed[1]);
  /* Objets de cellule : arbreA, percheB, blocGres (monde.glsl). Rendent null pour une cellule vide. */
  function arbreA(i, j) {
    if (S.kit !== 0 || !(S.kitP[0] > 0)) return null;
    const h = h42(i + sx(), j + sy()); if (h[0] > S.kitP[0]) return null;
    const o = [(h[1] - .5) * 3.8, (h[2] - .5) * 3.8], vx = (i + .5) * CA + o[0], vz = (j + .5) * CA + o[1], wx = .8776 * vx + .4794 * vz, wz = -.4794 * vx + .8776 * vz;
    if (Math.abs(wx - pathX(wz)) < 1.5 || libre(wx, wz)) return null;
    const l = h42(i + 31.7, j + 31.7);
    return { fam: 'a', i, j, h, o, x: wx, z: wz, H: 11 + 6 * h[3], r0: .16 + .17 * fr32(h[3] * 7.31), lean: [(l[0] - .5) * .035, (l[1] - .5) * .035], c: [(i + .5) * CA, (j + .5) * CA] };
  }
  function percheB(i, j) {
    if (S.kit !== 0 || !(S.kitP[0] > 0) || !(S.houp[3] > 0)) return null;
    const h = h42(i + sx() + 71, j + sy() + 71); if (h[0] > S.kitP[0] * .8 * S.houp[3]) return null;
    const o = [(h[1] - .5) * 1.9, (h[2] - .5) * 1.9], vx = (i + .5) * CB + o[0] - 17.3, vz = (j + .5) * CB + o[1] - 17.3, wx = .6216 * vx - .7833 * vz, wz = .7833 * vx + .6216 * vz;
    if (Math.abs(wx - pathX(wz)) < 1.15 || libre(wx, wz)) return null;
    const l = h42(i + 3.1, j + 3.1);
    return { fam: 'p', i, j, h, o, x: wx, z: wz, H: 6 + 5 * h[3], r0: .035 + .07 * fr32(h[3] * 5.3), lean: [(l[0] - .5) * .06, (l[1] - .5) * .06], c: [(i + .5) * CB - 17.3, (j + .5) * CB - 17.3] };
  }
  function blocGres(i, j) {
    if (S.kit === 2 || !(S.kitP[1] > 0)) return null;
    const h = h42(i + sx() + 13, j + sy() + 13), mask = vnoise2(i * .37 + sx(), j * .37 + sy());
    if (h[0] > (sstep(.32, .68, mask) * .9 + .08) * S.kitP[1]) return null;
    const R = .7 + 1.6 * h[3] * h[3], ox = (h[1] - .5) * 2 * (.5 * CC - .3 - 1.25 * R), oz = (h[2] - .5) * 2 * (.5 * CC - .3 - 1.25 * R), wx = (i + .5) * CC + ox, wz = (j + .5) * CC + oz;
    if (Math.abs(wx - pathX(wz)) < R * 1.1 + .5 || libre(wx, wz)) return null;
    return { fam: 'r', i, j, h, R, x: wx, z: wz, a: h[0] * 50, rad: [R * (1 + .25 * fr32(h[1] * 9)), R * (.62 + .3 * fr32(h[2] * 7)), R * (.8 + .3 * fr32(h[3] * 11))] };
  }
  /* Repères des grilles : monde → cellule (q) et cellule → monde */
  const versA = (x, z) => [.8776 * x - .4794 * z, .4794 * x + .8776 * z];
  const versB = (x, z) => [.6216 * x + .7833 * z + 17.3, -.7833 * x + .6216 * z + 17.3];
  /* Tous les objets de cellule dont le centre est à moins de R m de (x, z) (une famille : 'a', 'p', 'r'). */
  function cellules(fam, x, z, R) {
    const out = [];
    if (fam === 'a' || fam === 'p') {
      const C = fam === 'a' ? CA : CB, q = fam === 'a' ? versA(x, z) : versB(x, z), n = Math.ceil(R / C) + 1, i0 = Math.floor(q[0] / C), j0 = Math.floor(q[1] / C);
      for (let i = i0 - n; i <= i0 + n; i++) for (let j = j0 - n; j <= j0 + n; j++) {
        const o = fam === 'a' ? arbreA(i, j) : percheB(i, j); if (o && Math.hypot(o.x - x, o.z - z) <= R) out.push(o); }
    } else {
      const n = Math.ceil(R / CC) + 1, i0 = Math.floor(x / CC), j0 = Math.floor(z / CC);
      for (let i = i0 - n; i <= i0 + n; i++) for (let j = j0 - n; j <= j0 + n; j++) { const o = blocGres(i, j); if (o && Math.hypot(o.x - x, o.z - z) <= R) out.push(o); }
    }
    return out;
  }
  return { pathX, pathYaw, terrainH, reliefDetail, troue, arbreA, percheB, blocGres, cellules, versA, versB, S };
}

/* ---- houppiers : charpente, rameau, masse (monde.glsl), bouquets (semeHoup, v3_grains.vert). Repère de la cellule. */
function houppier(W, o) {
  const S = W.S, hp = S.hp;
  let e;
  if (o.fam === 'a') e = fr(o.h[3] * .999 * 3.7) < hp[12] ? 0 : 1;      // même partage que l'écorce
  else e = fr(o.h[3] * 9.1) < hp[44] ? 2 : 3;
  if (!(hp[e * 16 + 11] > .5)) return null;
  const P0 = hp.subarray(e * 16, e * 16 + 4), P1 = hp.subarray(e * 16 + 4, e * 16 + 8), P2 = hp.subarray(e * 16 + 8, e * 16 + 12), P3 = hp.subarray(e * 16 + 12, e * 16 + 16);
  const M = o.fam === 'a' ? (a, b) => [.8776 * a + .4794 * b, -.4794 * a + .8776 * b] : (a, b) => [.6216 * a - .7833 * b, .7833 * a + .6216 * b];
  const c0 = o.fam === 'a' ? o.c : o.c, wa = o.fam === 'a' ? 0 : .06, wp = o.fam === 'a' ? 0 : o.h[3] * 20, wd = o.fam === 'a' ? [1, 0] : [Math.cos(o.h[0] * 40), Math.sin(o.h[0] * 40)];
  const axe = y => [o.o[0] + o.lean[0] * y + wa * Math.sin(y * .6 + wp) * wd[0], o.o[1] + o.lean[1] * y + wa * Math.sin(y * .6 + wp) * wd[1]];
  const th = W.terrainH(o.x, o.z);
  const monde = p => { const w = M(c0[0] + p[0], c0[1] + p[2]); return [w[0], th + p[1], w[1]]; };
  const nb = Math.max(P1[0], 1), nr = P1[3], bois = [], bouquets = [];
  const ht = fr(o.h[2] * 13.37 + o.h[1] * 7.1), inegal = P3[1];
  const tmA = (1 - inegal) + inegal * (ht < .25 ? .04 + .3 * ht : .4 + 1.2 * (ht - .25) / .75);
  for (let k = 0; k < P1[0]; k++) {
    const r = h42(o.h[2] * 37.1 + k * 7.31, o.h[3] * 37.1 + k * 3.17);
    const u = Math.min(1, Math.max(0, (k + .2 + .6 * r[0]) / nb)), y = o.H * (P0[0] + (P0[1] - P0[0]) * u);
    const prof = Math.sin(3.1416 * (.15 + .8 * u)) + ((.55 + .45 * u) - Math.sin(3.1416 * (.15 + .8 * u))) * P0[3];
    const L = P0[2] * prof * (.7 + .45 * r[1]), az = k * 2.39996 + o.h[0] * 6.2832 + (r[2] - .5) * .9;
    const el = (.12 + (1.35 - .12) * P1[1]) * (.75 + .5 * r[3]) - .3 * u * P0[3];
    const ax = axe(y), a0 = [ax[0], y, ax[1]], d1 = [Math.cos(az) * Math.cos(el), Math.sin(el), Math.sin(az) * Math.cos(el)];
    const am = [a0[0] + d1[0] * L * .5, a0[1] + d1[1] * L * .5, a0[2] + d1[2] * L * .5];
    const el2 = el - P1[2] * 1.4 - .12, a2 = az + (r[1] - .5) * .6, d2 = [Math.cos(a2) * Math.cos(el2), Math.sin(el2), Math.sin(a2) * Math.cos(el2)];
    const a1 = [am[0] + d2[0] * L * .55, am[1] + d2[1] * L * .55, am[2] + d2[2] * L * .55];
    const rb = o.r0 * (.62 + (.3 - .62) * u) * (.8 + .3 * r[0]);
    bois.push([monde(a0), monde(am), rb], [monde(am), monde(a1), rb * .7]);
    for (let m = 0; m <= nr; m++) {
      let c;
      if (m < nr) {                                                  // rameau m : la masse est à son bout
        const rr = h42(o.h[1] * 53.7 + k * 5.1 + m * 1.7, o.h[0] * 53.7 + m * 9.3);
        const t = .3 + .6 * (m + .3 + .4 * rr[0]) / Math.max(nr, 1);
        const s0 = t < .5 ? a0.map((v, n) => v + (am[n] - v) * 2 * t) : am.map((v, n) => v + (a1[n] - v) * (2 * t - 1));
        let d = t < .5 ? am.map((v, n) => v - a0[n]) : a1.map((v, n) => v - am[n]); const LL = Math.hypot(...a1.map((v, n) => v - am[n])) + Math.hypot(...am.map((v, n) => v - a0[n]));
        let dl = Math.hypot(...d) || 1e-4; d = d.map(v => v / dl);
        let sd = [-d[2], 1e-3, d[0]]; dl = Math.hypot(...sd); sd = sd.map(v => v / dl);    // cross(d, y) + petit y, normalisé
        d = [d[0] + sd[0] * (rr[1] - .5) * 2.4, d[1] + sd[1] * (rr[1] - .5) * 2.4 + .35 - P1[2] * .9, d[2] + sd[2] * (rr[1] - .5) * 2.4]; dl = Math.hypot(...d); d = d.map(v => v / dl);
        c = s0.map((v, n) => v + d[n] * LL * .42 * (.65 + .6 * rr[2]));
      } else c = a1.map((v, n) => v + d2[n] * P2[0] * .25);
      const Mm = P2[0] * (.7 + .6 * h42(o.h[3] * 21.3 + k * 2.7, o.h[2] * 21.3 + m * 4.1)[0]);
      c[1] -= P1[2] * .35 * Mm;
      const rad = [Mm, Mm * (1 - .4 * P0[3]) * (1 + .7 * P1[2]), Mm];
      for (let b = 0; b < 4; b++) {                                   // quatre bouquets par masse (semeHoup)
        const hb = h33(o.h[0] * 31.7 + (k * 7 + m), o.h[1] * 31.7 + b, o.h[2] * 31.7 + (m * 3 + b));
        let db = [hb[0] * 2 - 1, hb[1] * 2 - 1 + .15, hb[2] * 2 - 1]; const dl = Math.hypot(...db) || 1; db = db.map(v => v / dl);
        const f = (.38 + .16 * hb[2]) + ((.26 + .4 * hb[2]) - (.38 + .16 * hb[2])) * inegal;
        const cc = [c[0] + db[0] * rad[0] * .7, c[1] + db[1] * rad[1] * .7, c[2] + db[2] * rad[2] * .7];
        const tm = tmA * ((1 - inegal) + inegal * (.35 + 1.3 * hb[1]));
        bouquets.push({ p: monde(cc), r: [rad[0] * f, rad[1] * f, rad[2] * f], pres: Math.min(1, Math.max(0, P2[1] * 2.2 * tm)), e, L: P2[2], M: P2[0], inegal });
      }
    }
  }
  return { bois, bouquets };
}

/* ---- la lumière directe du soleil en un point du sol
   0 à 1 : la part du disque solaire qui arrive (terrain, troncs, perches, charpentières, bouquets de feuilles, blocs), sans le
   cosinus. Les bouquets sont troués comme dans le semeur (trouées à l'échelle du bouquet, petits jours) : la transmittance est
   tirée le long de la corde, déterministe. La canopée statistique (canopyT) n'est pas comptée ici (voir canopee()). */
export function creerSoleil(W) {
  const S = W.S, sd = S.sunDir, sh = Math.hypot(sd[0], sd[2]) || 1, ux = sd[0] / sh, uz = sd[2] / sh, tanE = sd[1] / sh;
  const cache = new Map(), houpOn = S.hp && S.hp[11] + S.hp[27] + S.hp[43] + S.hp[59] > 0;
  const objet = o => { const k = o.fam + o.i + ',' + o.j; let v = cache.get(k); if (v === undefined) { v = o.fam === 'r' ? null : houpOn ? houppier(W, o) : null; cache.set(k, v); } return v; };
  const Lmax = y0 => Math.min(160, Math.max(10, (24 - 0) / Math.max(tanE, .02)));
  /* Les ombreurs possibles le long du rayon issu de (x, z) : cellules à moins de 7 m de la droite, jusqu'à Lmax. */
  function ombreurs(x, z) {
    const L = Lmax(), vus = new Set(), out = [];
    for (const fam of ['a', 'p', 'r']) {
      const pasR = fam === 'a' ? 6 : fam === 'p' ? 4 : 6;
      for (let t = 0; t <= L; t += pasR) for (const o of W.cellules(fam, x + ux * t, z + uz * t, fam === 'r' ? 9 : 8)) {
        const k = fam + o.i + ',' + o.j; if (vus.has(k)) continue; vus.add(k);
        const dx = o.x - x, dz = o.z - z, a = dx * ux + dz * uz, l = Math.abs(dx * uz - dz * ux);
        if (a < -4 || l > 7.5) continue; out.push(o); }
    }
    return out;
  }
  const memo = new Map();
  function ombreursPres(x, z) {                                       // par carreaux de 4 m (le rayon d'un point voisin croise les mêmes)
    const k = Math.floor(x / 4) + ',' + Math.floor(z / 4); let v = memo.get(k);
    if (!v) { v = ombreurs(Math.floor(x / 4) * 4 + 2, Math.floor(z / 4) * 4 + 2); memo.set(k, v); if (memo.size > 4000) memo.clear(); }
    return v;
  }
  /* axe du tronc à la hauteur y, dans le monde (axeT / axeB de monde.glsl) */
  function axeMonde(o, y) {
    if (o.fam === 'a') { const vx = o.c[0] + o.o[0] + o.lean[0] * y, vz = o.c[1] + o.o[1] + o.lean[1] * y; return [.8776 * vx + .4794 * vz, -.4794 * vx + .8776 * vz]; }
    const w = .06 * Math.sin(y * .6 + o.h[3] * 20), vx = o.c[0] + o.o[0] + o.lean[0] * y + w * Math.cos(o.h[0] * 40), vz = o.c[1] + o.o[1] + o.lean[1] * y + w * Math.sin(o.h[0] * 40);
    return [.6216 * vx - .7833 * vz, .7833 * vx + .6216 * vz];
  }
  /* rayon P + t (ux, tanE, uz) : t horizontal ; renvoie [t, écart horizontal, hauteur du rayon] au plus près d'un axe vertical (cx, cz) */
  function enY(P, x, z, y) { return P[1] + Math.max(0, (x - P[0]) * ux + (z - P[2]) * uz) * tanE; }
  function capsule(P, a, b, r) {                                      // le rayon passe-t-il dans le segment épais a-b ? (8 points)
    for (let s = 0; s <= 8; s++) { const q = [a[0] + (b[0] - a[0]) * s / 8, a[1] + (b[1] - a[1]) * s / 8, a[2] + (b[2] - a[2]) * s / 8];
      const t = (q[0] - P[0]) * ux + (q[2] - P[2]) * uz; if (t < .05) continue;
      const lx = q[0] - (P[0] + ux * t), lz = q[2] - (P[2] + uz * t), ly = q[1] - (P[1] + tanE * t);
      // distance du point au rayon (3D) : la composante le long du rayon est retirée
      const dir = [ux, tanE, uz], n = Math.hypot(...dir), d = [lx, ly, lz], dp = (d[0] * dir[0] + d[1] * dir[1] + d[2] * dir[2]) / (n * n);
      if (Math.hypot(d[0] - dir[0] * dp, d[1] - dir[1] * dp, d[2] - dir[2] * dp) < r) return true; }
    return false;
  }
  function transmis(P, x, z) {
    let T = 1;
    // terrain : le soleil bas est vite masqué par une butte ou le talus
    for (let t = .4; t < Lmax(); t += t < 6 ? .4 : t < 30 ? 1 : 2.5) {
      if (W.terrainH(P[0] + ux * t, P[2] + uz * t) > P[1] + tanE * t) return 0; }
    const dir = [ux, tanE, uz], n2 = 1 + tanE * tanE;
    for (const o of ombreursPres(x, z)) {
      if (o.fam === 'r') {                                            // bloc : ellipsoïde tourné, centre à R × 0,22 au-dessus du sol
        const th = W.terrainH(o.x, o.z), ca = Math.cos(o.a), sa = Math.sin(o.a);
        const loc = v => { const x2 = v[0], z2 = v[2]; return [(ca * x2 - sa * z2) / o.rad[0], v[1] / o.rad[1], (sa * x2 + ca * z2) / o.rad[2]]; };   // mat2(ca,sa,-sa,ca)*lp.xz
        const p0 = loc([P[0] - o.x, P[1] - (th + o.R * .22), P[2] - o.z]), d = loc(dir);
        const A = d[0] * d[0] + d[1] * d[1] + d[2] * d[2], B = p0[0] * d[0] + p0[1] * d[1] + p0[2] * d[2], C = p0[0] * p0[0] + p0[1] * p0[1] + p0[2] * p0[2] - .92;
        if (B * B - A * C > 0 && -B + Math.sqrt(B * B - A * C) > 0) return 0;
        continue;
      }
      // tronc : à la hauteur où le rayon passe, l'écart à l'axe (penché, et ondulé pour une perche)
      const t = (o.x - P[0]) * ux + (o.z - P[2]) * uz;
      if (t > -.5) {
        const y = P[1] + tanE * Math.max(t, 0) - W.terrainH(o.x, o.z);
        if (y < o.H) {
          const yc = Math.min(Math.max(y, -1), o.H), ax = axeMonde(o, yc);
          const ta = (ax[0] - P[0]) * ux + (ax[1] - P[2]) * uz, lx = ax[0] - (P[0] + ux * ta), lz = ax[1] - (P[2] + uz * ta);
          const ra = o.fam === 'a' ? o.r0 * (1 - .5 * Math.min(1, Math.max(0, y / o.H))) + o.r0 * .45 * Math.exp(-Math.max(y, 0) * 2.5)
            : o.r0 * (1 - .6 * Math.min(1, Math.max(0, y / o.H))) + o.r0 * .3 * Math.exp(-Math.max(y, 0) * 4);
          if (Math.hypot(lx, lz) < ra + .02) return 0;
        }
      }
      const hq = objet(o); if (!hq) continue;
      for (const [a, b, r] of hq.bois) if (r > .04 && capsule(P, a, b, r)) return 0;
      for (const q of hq.bouquets) {
        const R = Math.max(q.r[0], q.r[1]); const dx = q.p[0] - P[0], dy = q.p[1] - P[1], dz = q.p[2] - P[2];
        const s = (dx * ux + dy * tanE + dz * uz) / n2; if (s < 0) continue;
        const ex = dx - ux * s, ey = dy - tanE * s, ez = dz - uz * s, dd = Math.hypot(ex, ey * R / Math.max(q.r[1], .05), ez);
        if (dd >= R) continue;
        // les feuilles d'un bouquet sont sur sa surface (plus quelques-unes dedans) : le rayon traverse deux couches, à l'entrée
        // et à la sortie, et un peu du cœur ; présence du semeur à chaque traversée (trouées gp, petits jours gq)
        const demi = Math.sqrt(R * R - dd * dd);
        for (const [u0, w] of [[s - demi, COUV], [s + demi, COUV], [s, COUV * .3]]) {
          const X = P[0] + ux * u0, Y = P[1] + tanE * u0, Z = P[2] + uz * u0;
          const gp = vnoise3(X / (q.M * .3) + S.seed[0] + q.e * 7, Y / (q.M * .3) + S.seed[1] + q.e * 7, Z / (q.M * .3) + S.seed[2] + q.e * 7);
          const gq = vnoise3(X / (q.L * 3.5) + S.seed[0] * 1.7, Y / (q.L * 3.5) + S.seed[1] * 1.7, Z / (q.L * 3.5) + S.seed[2] * 1.7);
          const pres = Math.min(1, q.pres * sstep(.42, .58, gp)) * (1 + (sstep(.25, .45, gq) - 1) * q.inegal);
          T *= 1 - w * pres;
        }
        if (T < .02) return 0;
      }
    }
    return T;
  }
  /* soleil au sol en (x, z) : { v : lumière directe 0 à 1, cos : éclairement de la pente (n·soleil) } */
  function soleilEn(x, z) {
    const y = W.terrainH(x, z), e = .3, gx = (W.terrainH(x + e, z) - W.terrainH(x - e, z)) / (2 * e), gz = (W.terrainH(x, z + e) - W.terrainH(x, z - e)) / (2 * e);
    const nn = Math.hypot(gx, 1, gz), cos = Math.max(0, (-gx * sd[0] + sd[1] - gz * sd[2]) / nn);
    if (cos <= 0) return { v: 0, cos: 0 };
    return { v: transmis([x, y + .06, z], x, z), cos };
  }
  return { soleilEn, ombreurs, houppier: o => objet(o), ux, uz, tanE };
}

/* Disque autour du porteur : centre, 6 points à 1,2 m, 8 à 2,5 m (devant ET derrière : il pose derrière ses talons). */
export const DISQUE = [[0, 0], ...[0, 1, 2, 3, 4, 5].map(k => [1.2 * Math.sin(k * Math.PI / 3), 1.2 * Math.cos(k * Math.PI / 3)]),
  ...[0, 1, 2, 3, 4, 5, 6, 7].map(k => [2.5 * Math.sin(k * Math.PI / 4 + .39), 2.5 * Math.cos(k * Math.PI / 4 + .39)])];
/* Un point au soleil : la lumière directe, et la pente qui la reçoit (une pente tournée vers l'ombre compte sombre ; à partir de
   60 % de l'éclairement du sol plat, pleine). */
export const vu = (L, r) => r.v * sstep(0, .6 * L.tanE / Math.hypot(1, L.tanE), r.cos);
/* Part du disque au soleil (moyenne de v × min(1, cos / cos du sol plat)), et la plus petite valeur. */
export function disqueAuSoleil(L, x, z, rayon = 2.5) {
  const k = rayon / 2.5; let s = 0, mn = 1;
  for (const [dx, dz] of DISQUE) { const v = vu(L, L.soleilEn(x + dx * k, z + dz * k)); s += v; mn = Math.min(mn, v); }
  return { part: s / DISQUE.length, min: mn };
}
/* Libre d'obstacle : ni tronc, ni perche, ni bloc à moins de marge du point. */
function degageEn(W, x, z, marge) {
  for (const o of W.cellules('a', x, z, 3)) if (Math.hypot(o.x - x, o.z - z) < o.r0 * 1.3 + marge) return false;
  for (const o of W.cellules('p', x, z, 2.5)) if (Math.hypot(o.x - x, o.z - z) < o.r0 * 1.3 + .06 + marge) return false;
  for (const o of W.cellules('r', x, z, 6)) if (Math.hypot(o.x - x, o.z - z) < o.R * 1.35 + marge) return false;
  return true;
}

/* ---- le départ (fiche : parcours.depart.lumiere = "soleil" | "ombre")
   Le long du trajet (de -60 à 160 m), sur l'axe et un peu de part et d'autre, le point dont le disque de 2,5 m autour du porteur
   est au soleil (ou à l'ombre), libre d'obstacle ; puis le cap le long du trajet (devant ou derrière) qui met le soleil de trois
   quarts (vers 40° du regard), avec des troncs à contre-jour plus loin (les rais). Déterministe : ne dépend que du monde. Rend
   { x, z, yaw, part, min, z0 } ou null. */
export function chercherDepart(W, opts = {}) {
  const L = creerSoleil(W), veut = opts.lumiere === 'ombre' ? 'ombre' : 'soleil';
  const de = opts.de !== undefined ? opts.de : -60, a = opts.a !== undefined ? opts.a : 160, pas = opts.pas || 1;
  const cands = [];
  for (let z = de; z <= a; z += pas) for (const dx of [0, -.7, .7, -1.4, 1.4]) {
    const x = W.pathX(z) + dx; if (!degageEn(W, x, z, 1.2)) continue;
    const v = vu(L, L.soleilEn(x, z));
    cands.push({ x, z, v, dx });
  }
  const bon = c => veut === 'soleil' ? c.v : 1 - c.v;
  cands.sort((p, q) => bon(q) - bon(p) || Math.abs(p.z) - Math.abs(q.z) || Math.abs(p.dx) - Math.abs(q.dx));
  let best = null;
  for (const c of cands.slice(0, 60)) {
    if (bon(c) < .5) break;
    const d = disqueAuSoleil(L, c.x, c.z), b = veut === 'soleil' ? d : { part: 1 - d.part, min: 1 - d.part };
    // la vue : soleil de trois quarts (40° du regard) le long du trajet, devant ou derrière ; troncs à contre-jour de 8 à 40 m
    const yaw0 = W.pathYaw(c.z), azS = Math.atan2(L.ux, L.uz);
    let cap = null;
    for (const y of [yaw0, yaw0 + Math.PI]) { const ec = Math.abs(Math.atan2(Math.sin(azS - y), Math.cos(azS - y)));
      const note = 1 - Math.abs(ec - .7) / 1.6; if (!cap || note > cap.note) cap = { yaw: Math.atan2(Math.sin(y), Math.cos(y)), note, ec }; }
    const contre = W.cellules('a', c.x + L.ux * 24, c.z + L.uz * 24, 18).filter(o => { const dx = o.x - c.x, dz = o.z - c.z, t = dx * L.ux + dz * L.uz;
      return t > 8 && Math.abs(dx * L.uz - dz * L.ux) < t * .6; }).length;
    const score = b.part * 3 + b.min + cap.note * .6 + Math.min(contre, 6) * .05 - Math.abs(c.z) * .002;
    if (!best || score > best.score) best = { x: c.x, z: c.z, yaw: cap.yaw, part: d.part, min: d.min, score, contre, soleil_deg: Math.round(cap.ec * 180 / Math.PI) };
    if (best.part > .97 && cands.indexOf(c) > 20) break;
  }
  return best;
}

/* ---- « Va au soleil », « mets-toi à l'ombre » (action lumiere) : le point le plus proche dont le disque (rayon r) est au soleil
   (ou à l'ombre), libre d'obstacle, à moins de 25 m, de préférence près du trajet. obstacles : cercles {x, z, r} en plus (les
   choses posées). Rend { x, z, part, trouve, d } : trouve = false s'il n'y en a pas (le plus clair, ou le plus sombre, atteint). */
export function chercherLumiere(W, depuis, vers = 'soleil', opts = {}) {
  const L = opts.soleil || creerSoleil(W), R = opts.rayon || 25, marge = opts.marge || .6, obs = opts.obstacles || [], dr = opts.disque || 1.6;
  const ok = (x, z) => degageEn(W, x, z, marge) && obs.every(o => Math.hypot(o.x - x, o.z - z) >= (o.r || 0) + marge);
  const bon = v => vers === 'ombre' ? 1 - v : v;
  const ici = disqueAuSoleil(L, depuis.x, depuis.z, dr);
  const cands = [];
  for (let r = 0; r <= R; r += 1.5) {
    const n = r === 0 ? 1 : Math.max(6, Math.round(2 * Math.PI * r / 1.6));
    for (let k = 0; k < n; k++) { const a = k / n * 2 * Math.PI, x = depuis.x + r * Math.sin(a), z = depuis.z + r * Math.cos(a);
      if (!ok(x, z)) continue;
      const v = vu(L, L.soleilEn(x, z)), ax = Math.abs(x - W.pathX(z));
      cands.push({ x, z, v, d: r, ax }); }
  }
  // le plus près parmi ceux dont le centre est franc ; le disque entier est vérifié dans l'ordre de la distance (le trajet compte un peu)
  const cout = c => c.d + Math.max(0, c.ax - 1.2) * .8;
  const francs = cands.filter(c => bon(c.v) > .85).sort((p, q) => cout(p) - cout(q));
  for (const c of francs.slice(0, 80)) {
    const d = disqueAuSoleil(L, c.x, c.z, dr), p = vers === 'ombre' ? 1 - d.part : d.part;
    if (p > .8) return { x: c.x, z: c.z, part: d.part, trouve: true, d: c.d, ici: ici.part };
  }
  const mieux = cands.sort((p, q) => bon(q.v) - bon(p.v) || cout(p) - cout(q))[0];
  if (!mieux || bon(mieux.v) <= bon(ici.part) + .05) return { x: depuis.x, z: depuis.z, part: ici.part, trouve: false, d: 0, ici: ici.part };
  return { x: mieux.x, z: mieux.z, part: disqueAuSoleil(L, mieux.x, mieux.z, dr).part, trouve: false, d: mieux.d, ici: ici.part };
}
