// Faux Claude et fausse base, pour éprouver le constructeur de monde sans le vrai Claude ni la vraie base.
// fauxSample, fausseBase, fauxStockage : pour Node (tests/constructeur.test.mjs).
// installerFauxClaude : injecté dans la page par Playwright (tools/constructeur-essai.mjs) ; il doit tout contenir lui-même.

/* Un faux « sample » scripté : chaque appel rend l'entrée suivante du script.
   Objet : la réponse JSON ; { erreur: "code" } : un rejet ; une chaîne : une réponse illisible (invalid_json). */
export function fauxSample(script, { images = false } = {}) {
  const appels = [];
  const repondre = (consigne, opts = {}) => {
    appels.push({ consigne, opts });
    if (opts.signal && opts.signal.aborted) return Promise.reject({ code: 'cancelled', message: 'arrêté' });
    const r = script[appels.length - 1];
    if (r === undefined) return Promise.reject({ code: 'upstream_error', message: 'script épuisé' });
    if (typeof r === 'string') return Promise.reject({ code: 'invalid_json', message: 'illisible', text: r });
    if (r && r.erreur) return Promise.reject({ code: r.erreur, message: r.erreur });
    return Promise.resolve(JSON.parse(JSON.stringify(r)));
  };
  const sample = (c, o) => repondre(c, o).then(r => ({ text: JSON.stringify(r), truncated: false, modelTierApplied: 'default' }));
  sample.json = repondre;
  sample.limits = async () => Object.assign({ maxPromptBytes: 262144 }, images ? { images: { maxCount: 5, maxInputBytes: 2e7, mediaTypes: ['image/jpeg', 'image/png'] } } : {});
  sample.appels = appels;
  return sample;
}

/* Une base en mémoire avec la forme de la capacité « db » : collection(...).doc(id).set/get/delete, onSnapshot. */
export function fausseBase({ refuser = false } = {}) {
  const docs = new Map(), abonnes = new Set();
  const snap = col => { const d = [...docs].filter(([k]) => k.startsWith(col + '/')).map(([k, v]) => ({ id: k.slice(col.length + 1), exists: true, data: () => JSON.parse(JSON.stringify(v)), metadata: { fromCache: false, hasPendingWrites: false } }));
    return { docs: d, size: d.length, empty: !d.length, docChanges: () => [], metadata: { fromCache: false, hasPendingWrites: false } }; };
  const notifier = () => setTimeout(() => abonnes.forEach(a => a.next(snap(a.col))), 0);
  const base = {
    collection(col) {
      return {
        path: col,
        doc(id) { const k = col + '/' + id; return {
          id, path: k,
          async set(v) { if (refuser) throw { code: 'invalid_argument', message: 'refusé' }; if (JSON.stringify(v).length > 262144) throw { code: 'invalid_argument', message: 'trop gros' }; docs.set(k, JSON.parse(JSON.stringify(v))); notifier(); },
          async get() { return { id, exists: docs.has(k), data: () => docs.get(k), metadata: { fromCache: false } }; },
          async delete() { docs.delete(k); notifier(); } }; },
        onSnapshot(next, error) { const a = { col, next, error }; abonnes.add(a); setTimeout(() => next(snap(col)), 0); return () => abonnes.delete(a); },
      };
    },
    ecrireBrut(k, v) { docs.set(k, v); notifier(); }, lireBrut: k => docs.get(k), tic: () => new Promise(r => setTimeout(r, 10)),
  };
  return base;
}
export function fauxStockage() { const m = new Map(); return { getItem: k => m.has(k) ? m.get(k) : null, setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) }; }

/* Pour la page : window.claude avec use("sample"), use("db") (persistée dans localStorage « faux-db », pour survivre au
   rechargement), use("dictation") absente. cfg = { script: [réponses], images: bool, db: bool, latence: ms, latences: { indice: ms } }.
   Chaque appel est noté dans window.__fauxClaude.appels, avec pour chaque image : type, taille, et luminosité moyenne
   (l'image est décodée dans la page : on vérifie qu'elle est réelle et non noire). Le script continue après un rechargement. */
export function installerFauxClaude(cfg) {
  const lireLS = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch (_) { return d; } };
  const ecrireLS = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (_) {} };
  const etat = window.__fauxClaude = { appels: lireLS('faux-appels', []) };
  const pause = ms => new Promise(r => setTimeout(r, ms));
  async function mesurer(blob) {
    try { const bm = await createImageBitmap(blob), c = document.createElement('canvas'); c.width = 32; c.height = Math.max(1, Math.round(32 * bm.height / bm.width));
      const x = c.getContext('2d'); x.drawImage(bm, 0, 0, c.width, c.height); const d = x.getImageData(0, 0, c.width, c.height).data; let s = 0, v = 0;
      for (let i = 0; i < d.length; i += 4) { const l = (d[i] + d[i + 1] + d[i + 2]) / 3; s += l; v += l * l; } const n = d.length / 4;
      return { type: blob.type, octets: blob.size, largeur: bm.width, hauteur: bm.height, moyenne: +(s / n).toFixed(1), ecart: +Math.sqrt(Math.max(0, v / n - (s / n) ** 2)).toFixed(1) };
    } catch (e) { return { type: blob && blob.type, octets: blob && blob.size, erreur: String(e) }; }
  }
  const sample = async (input, opts = {}) => {
    const i = lireLS('faux-curseur', 0); ecrireLS('faux-curseur', i + 1);
    const images = opts.images ? await Promise.all([].concat(opts.images).map(mesurer)) : [];
    const appel = { i, consigne: String(input).slice(0, 200000), longueur: String(input).length, modelTier: opts.modelTier, images, t: Date.now() };
    etat.appels.push(appel); ecrireLS('faux-appels', etat.appels.map(a => Object.assign({}, a, { consigne: a.consigne.slice(0, 2000) })));
    const lat = (cfg.latences && cfg.latences[i]) || cfg.latence; if (lat) await pause(lat);
    if (opts.signal && opts.signal.aborted) throw { code: 'cancelled', message: 'arrêté' };
    const r = cfg.script[i];
    if (r === undefined) throw { code: 'upstream_error', message: 'script épuisé' };
    if (typeof r === 'string') throw { code: 'invalid_json', message: 'illisible', text: r };
    if (r && r.erreur) throw { code: r.erreur, message: r.erreur };
    return { text: JSON.stringify(r), truncated: false, modelTierApplied: opts.modelTier || 'default' };
  };
  const sampleNs = Object.freeze(Object.assign((i, o) => sample(i, o), { json: (i, o) => sample(i, o).then(r => JSON.parse(r.text)),
    limits: async () => Object.assign({ maxPromptBytes: 262144 }, cfg.images ? { images: { maxCount: 5, maxInputBytes: 2e7, mediaTypes: ['image/jpeg', 'image/png', 'image/webp'] } } : {}) }));
  const abonnes = new Set();
  const lireDb = () => lireLS('faux-db', {});
  const snap = col => { const all = lireDb(), d = Object.keys(all).filter(k => k.startsWith(col + '/')).sort().map(k => ({ id: k.slice(col.length + 1), exists: true, data: () => JSON.parse(JSON.stringify(all[k])), metadata: { fromCache: false, hasPendingWrites: false } }));
    return { docs: d, size: d.length, empty: !d.length, docChanges: () => [], metadata: { fromCache: false, hasPendingWrites: false } }; };
  const notifier = () => setTimeout(() => abonnes.forEach(a => a.next(snap(a.col))), 20);
  const db = Object.freeze({ collection: col => ({ path: col,
    doc: id => ({ id, path: col + '/' + id,
      set: async v => { await pause(30); const all = lireDb(); all[col + '/' + id] = JSON.parse(JSON.stringify(v)); ecrireLS('faux-db', all); etat.ecritures = (etat.ecritures || 0) + 1; notifier(); },
      get: async () => { const all = lireDb(); return { id, exists: !!all[col + '/' + id], data: () => all[col + '/' + id], metadata: { fromCache: false } }; },
      delete: async () => { await pause(30); const all = lireDb(); delete all[col + '/' + id]; ecrireLS('faux-db', all); notifier(); } }),
    onSnapshot: (next, error) => { const a = { col, next, error }; abonnes.add(a); setTimeout(() => next(snap(col)), 50); return () => abonnes.delete(a); } }) });
  window.claude = Object.freeze({ use: async nom => { await pause(20); return nom === 'sample' ? sampleNs : nom === 'db' && cfg.db ? db : null; } });
}
