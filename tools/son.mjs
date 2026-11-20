// Les bruitages rendus hors ligne (docs/bruitages.md) : dans Chrome (Playwright), par la chaîne Web Audio de la page
// (src/son.js : formants, saturation, prise micro, limiteur) dans un OfflineAudioContext. Pour chaque cas, le geste
// complet tel que la page le cale (gesteExploit du meneur, puis SON.caler), la chute à la pose comprise.
// Écrit out/son/<cas>.wav (16 bits, 44,1 kHz, mono) et <cas>.png (spectrogramme, calcul maison : 0 à 4 kHz, 60 dB,
// repères blancs en haut = débuts des bruits, rouge = la pose), et out/son/mesures.json (durée, RMS, crête, fondamentale).
// Rien n'a été écouté par la machine : ce sont des mesures. Usage : node tools/son.mjs  (CAS='petite-1|enorme' : quelques cas)
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';
import { caler, planChute } from '../src/son.js';
import { gesteExploit, formesModele, palierExploit, volumeFormes } from '../src/meneur.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..'), out = join(root, 'out/son');
mkdirSync(out, { recursive: true });
const MOD = JSON.parse(readFileSync(join(root, 'src/modeles.json'), 'utf8')), B = JSON.parse(readFileSync(join(root, 'src/bruitages.json'), 'utf8'));
const EX = MOD.exploit, M = Object.values(MOD.modeles).find(m => m.origine === 'corps');
const SR = 44100;

/* Les cas : le geste entier (bruits à leur instant), puis la chute de la chose à la pose. */
function cas(nom, phrase, graine, { sansPrise = false } = {}) {
  const fm = formesModele(M, phrase), f = fm.facteur, r = caler(gesteExploit(f, EX), EX.bruit, { graine, compteur: 1 });
  const evs = r.plan.bruits.map(b => Object.assign({}, b, { t: b.t_abs + 0.2 }, sansPrise ? { prise: null } : {}));
  const masse = volumeFormes(fm.formes) * 500;
  evs.push(Object.assign(planChute(B.recettes.chute, { masse, distance: 1, graine, cle: 1 }), { recette: 'chute', t: r.plan.pose_t + 0.2 }));
  return { nom, phrase, facteur: f, palier: palierExploit(f, EX), evs, souffles: r.plan.souffles.map(s => s + 0.2), pose: r.plan.pose_t + 0.2 };
}
const CAS = [
  cas('petite-1', 'une petite crotte', 4821), cas('petite-2', 'une petite crotte', 7), cas('petite-3', 'une petite crotte', 99),
  cas('5kg', 'une crotte de 5 kg', 4821), cas('enorme', 'une énorme crotte', 4821), cas('20kg', 'une crotte de 20 kg', 4821),
  cas('enorme-synthese-seule', 'une énorme crotte', 4821, { sansPrise: true }),
];
for (const [nom, masse] of [['chute-200g', 0.2], ['chute-5kg', 5], ['chute-40kg', 40]])
  CAS.push({ nom, phrase: 'chute ' + masse + ' kg', evs: [Object.assign(planChute(B.recettes.chute, { masse, distance: 1.5, graine: 4821, cle: 2 }), { recette: 'chute', t: 0.1 })], souffles: [], pose: null });

const son = readFileSync(join(root, 'src/son.js'), 'utf8').replace(/^export\s+/gm, '');
const browser = await chromium.launch({ headless: true, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
await page.setContent('<!doctype html><meta charset="utf-8"><body></body>');
await page.addScriptTag({ content: son + '\nwindow.SON={rendreHorsLigne};' });
const mesures = [];
const FILTRE = process.env.CAS ? new RegExp(process.env.CAS) : null;   // CAS='petite|enorme' : quelques cas seulement
for (const c of CAS.filter(c => !FILTRE || FILTRE.test(c.nom))) {
  const b64 = await page.evaluate(async ([B, evs, sr]) => {
    const x = await window.SON.rendreHorsLigne(OfflineAudioContext, B, evs, sr);
    const u = new Uint8Array(x.buffer.slice(0)); let s = ''; for (let i = 0; i < u.length; i += 32768) s += String.fromCharCode(...u.subarray(i, i + 32768));
    return btoa(s);
  }, [B, c.evs, SR]);
  const buf = Buffer.from(b64, 'base64'), x = new Float32Array(buf.buffer, buf.byteOffset, buf.length / 4);
  writeFileSync(join(out, c.nom + '.wav'), wav(x, SR));
  writeFileSync(join(out, c.nom + '.png'), spectrogramme(x, SR, c));
  const m = mesurer(x, SR, c);
  mesures.push(m);
  console.log(c.nom.padEnd(22), `durée ${m.duree_s} s  RMS ${m.rms_db} dBFS  crête ${m.crete_db} dBFS  bruits ${m.bruits}  principal ${m.principal_s ?? '-'} s, f0 voulue ${m.f0_voulue ?? '-'} Hz, f0 mesurée ${m.f0_mesuree ?? '-'} Hz (${m.voise ?? '-'} voisé)`);
}
writeFileSync(join(out, 'mesures.json'), JSON.stringify(mesures, null, 1));
await browser.close();

/* ------------------------------------------------------------------ mesures, WAV, spectrogramme */
function mesurer(x, sr, c) {
  let s = 0, pk = 0; for (const v of x) { s += v * v; pk = Math.max(pk, Math.abs(v)); }
  const db = v => +(20 * Math.log10(Math.max(v, 1e-9))).toFixed(1);
  const p = c.evs.filter(e => e.recette !== 'chute').sort((a, b) => b.duree - a.duree)[0] || c.evs[0];
  const a = Math.round(p.t * sr), z = Math.round((p.t + p.duree * 0.8) * sr), F = fondamentales(x.subarray(a, z), sr, p.f0);
  let sp = 0; for (let i = a; i < Math.min(x.length, Math.round((p.t + p.duree) * sr)); i++) sp += x[i] * x[i];
  return { cas: c.nom, phrase: c.phrase, facteur: c.facteur, palier: c.palier, duree_s: +(x.length / sr).toFixed(2), rms_db: db(Math.sqrt(s / x.length)), crete_db: db(pk),
    bruits: c.evs.filter(e => e.recette !== 'chute').length, principal_s: p.duree, principal_t: +p.t.toFixed(2), principal_rms_db: db(Math.sqrt(sp / Math.max(1, p.duree * sr))),
    f0_voulue: Math.round(p.f0), f0_mesuree: F.n ? Math.round(F.moy) : null, voise: F.total ? Math.round(100 * F.n / F.total) + ' %' : null,
    plan: c.evs.map(e => ({ t: +e.t.toFixed(2), duree: e.duree, f0: e.f0, gain: e.gain, recette: e.recette, prise: e.prise || null, fin: e.fin })), souffles: c.souffles, pose: c.pose };
}
/* Fondamentale par autocorrélation (trames de 60 ms), cherchée entre la moitié et le double de la hauteur voulue (pas
   d'erreur d'octave grossière) ; une trame compte si la corrélation normalisée dépasse 0,35. */
function fondamentales(x, sr, voulue) {
  const N = Math.round(0.06 * sr), lo = Math.max(2, Math.floor(sr / Math.min(1000, voulue * 2.2))), hi = Math.ceil(sr / Math.max(20, voulue / 2.2));
  let n = 0, total = 0, s = 0;
  for (let i = 0; i + N + hi < x.length; i += N >> 1) {
    let e0 = 0; for (let k = 0; k < N; k++) e0 += x[i + k] * x[i + k];
    if (e0 / N < 1e-5) continue;
    total++;
    let best = 0, lag = 0;
    for (let L = lo; L <= hi; L++) { let c = 0, e1 = 0; for (let k = 0; k < N; k++) { c += x[i + k] * x[i + k + L]; e1 += x[i + k + L] * x[i + k + L]; } const r = c / Math.sqrt(e0 * e1 + 1e-12); if (r > best) { best = r; lag = L; } }
    if (best > 0.35) { n++; s += sr / lag; }
  }
  return { n, total, moy: n ? s / n : 0 };
}
function wav(x, sr) {
  const b = Buffer.alloc(44 + x.length * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + x.length * 2, 4); b.write('WAVEfmt ', 8); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(x.length * 2, 40);
  for (let i = 0; i < x.length; i++) b.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(x[i] * 32767))), 44 + i * 2);
  return b;
}
function fft(re, im) {                                             // radix 2, en place
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
  for (let len = 2; len <= n; len <<= 1) {
    const a = -2 * Math.PI / len, wr = Math.cos(a), wi = Math.sin(a);
    for (let i = 0; i < n; i += len) { let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) { const ur = re[i + k], ui = im[i + k], vr = re[i + k + len / 2] * cr - im[i + k + len / 2] * ci, vi = re[i + k + len / 2] * ci + im[i + k + len / 2] * cr;
        re[i + k] = ur + vr; im[i + k] = ui + vi; re[i + k + len / 2] = ur - vr; im[i + k + len / 2] = ui - vi; const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t; } }
  }
}
function spectrogramme(x, sr, c) {
  const N = 4096, hop = Math.round(sr * 0.008), fmax = 4000, H = 300, bins = Math.round(fmax / (sr / N));
  const W = Math.max(1, Math.floor((x.length - N) / hop)), img = new Float32Array(W * H), win = Float32Array.from({ length: N }, (_, i) => 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N));
  let mx = -1e9;
  for (let w = 0; w < W; w++) {
    const re = new Float64Array(N), im = new Float64Array(N);
    for (let i = 0; i < N; i++) re[i] = (x[w * hop + i] || 0) * win[i];
    fft(re, im);
    for (let y = 0; y < H; y++) {                                  // échelle de fréquence en racine : le grave a de la place
      const f = Math.pow(1 - y / H, 2) * bins, k = Math.min(bins, Math.max(1, Math.round(f)));
      const v = 10 * Math.log10(re[k] * re[k] + im[k] * im[k] + 1e-12); img[y * W + w] = v; if (v > mx) mx = v;
    }
  }
  const px = Buffer.alloc((W * 3 + 1) * H);
  const mark = new Map();
  for (const e of c.evs) mark.set(Math.round((e.t * sr + N / 2) / hop), e.recette === 'chute' ? [255, 60, 60] : [255, 255, 255]);
  for (const s of c.souffles || []) mark.set(Math.round((s * sr + N / 2) / hop), [80, 160, 255]);
  for (let y = 0; y < H; y++) {
    px[y * (W * 3 + 1)] = 0;
    for (let w = 0; w < W; w++) {
      const u = Math.max(0, Math.min(1, (img[y * W + w] - mx + 60) / 60)), o = y * (W * 3 + 1) + 1 + w * 3;
      let rgb = [Math.round(255 * Math.min(1, u * 1.6)), Math.round(255 * Math.max(0, u * 1.6 - 0.6)), Math.round(255 * Math.max(0, u * 2 - 1.4) * 2.5)].map(v => Math.min(255, v));
      if (y < 10 && [-1, 0, 1].some(d => mark.has(w + d))) rgb = mark.get([w, w - 1, w + 1].find(k => mark.has(k)));
      const fy = Math.pow(1 - y / H, 2) * fmax; if ([100, 500, 1000, 2000].some(g => Math.abs(fy - g) < fmax / H * 1.5 * (1 - y / H) * 2) && w % 6 < 2) rgb = [90, 90, 90];
      px[o] = rgb[0]; px[o + 1] = rgb[1]; px[o + 2] = rgb[2];
    }
  }
  const crc = (() => { const T = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
    return b => { let c = 0xffffffff; for (const v of b) c = T[(c ^ v) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }; })();
  const chunk = (t, d) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]), cr = Buffer.alloc(4); cr.writeUInt32BE(crc(td)); return Buffer.concat([l, td, cr]); };
  const ih = Buffer.alloc(13); ih.writeUInt32BE(W, 0); ih.writeUInt32BE(H, 4); ih[8] = 8; ih[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', deflateSync(px)), chunk('IEND', Buffer.alloc(0))]);
}
