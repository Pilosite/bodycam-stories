/* The harvest in the page (ADR 0011, P17, P23): at the end of a session and on « Copy journal », one record is built
   (core/harvest.js, CORE.harvestRecord) and kept, after a one-line notice the player answers once:
   - in the artifact's shared store when the page has one: the same `db` capability the scene bank uses (capacite("db") in
     src/main.js, src/constructeur.js creerBanque), collection `harvest`, one document per session (id = the record's id),
     the record built with `strip`: the player's sentences are replaced by their class, because by default every signed-in
     viewer of the artifact can read shared documents (docs/creator-kit.md, "The harvest");
   - always in this browser's storage (`bodycam-harvest`, the full record, capped: oldest dropped), so it can be copied;
   - nowhere else. Nothing is sent to any other place.
   « Harvest » (debug panel, tools menu) lists the kept records with a button that copies them all (JSON), which
   `node tools/harvest.mjs` reads. Records build only after the player said "Keep"; "Don't keep" is remembered and stops all.
   No import: the build embeds it as HARVEST. English in code, keys and labels. */

export const HARVEST_STORE = { collection: 'harvest', localKey: 'bodycam-harvest', consentKey: 'bodycam-harvest-consent', max: 20, bytes: 1500000 };
export const NOTICE = { text: "This session's journal is kept to improve the game.", keep: 'Keep', drop: "Don't keep" };

/* The browser list after adding (or replacing) one record: newest last, capped in count and in bytes, oldest dropped. Pure. */
export function keepRecords(list, rec, { max = HARVEST_STORE.max, bytes = HARVEST_STORE.bytes } = {}) {
  const out = (Array.isArray(list) ? list : []).filter(r => r && r.id && r.id !== rec.id).concat([rec]);
  while (out.length > max) out.shift();
  while (out.length > 1 && JSON.stringify(out).length > bytes) out.shift();
  if (JSON.stringify(out).length > bytes && out[0].journal) out[0] = Object.assign({}, out[0], { journal: Object.assign({}, out[0].journal, { text: null, cut: 'journal not kept: browser storage cap' }) });
  return out;
}
/* A session's record id, valid as a document id ([a-z0-9_-]). */
export function recordId(parts, t = Date.now()) {
  return (parts.filter(Boolean).map(p => String(p).toLowerCase().replace(/[^a-z0-9]+/g, '-')).join('-').replace(/^-+|-+$/g, '').slice(0, 48) + '-' + Number(t).toString(36)).replace(/^-/, '');
}

export function createHarvest({ core, db = null, storage = null, doc = null, onError = () => {} }) {
  const S = { consent: null, pending: new Map(), db: null, notice: null, panel: null };
  try { S.consent = storage ? storage.getItem(HARVEST_STORE.consentKey) : null; } catch (_) {}
  Promise.resolve(db).then(d => { S.db = d || null; if (S.consent === 'keep') for (const r of S.pending.values()) share(r); }).catch(() => {});

  const readLocal = () => { try { const v = JSON.parse((storage && storage.getItem(HARVEST_STORE.localKey)) || '[]'); return Array.isArray(v) ? v : []; } catch (_) { return []; } };
  const writeLocal = rec => { if (!storage) return false; try { storage.setItem(HARVEST_STORE.localKey, JSON.stringify(keepRecords(readLocal(), rec))); return true; } catch (e) { onError('local', e); return false; } };
  async function share(entry) {
    if (!S.db) return false;
    try { await S.db.collection(HARVEST_STORE.collection).doc(entry.shared.id).set(JSON.parse(JSON.stringify(entry.shared))); return true; }
    catch (e) { onError('shared', e); return false; }
  }
  function keep(entry) { writeLocal(entry.full); share(entry); }

  /* One session's journal → its record, kept if the player agreed; the same id replaces the earlier record of the session. */
  function collect(journal, { gaps = [], meta = {} } = {}) {
    if (S.consent === 'drop' || !journal) return null;
    let full, shared;
    try {
      full = core.harvestRecord(journal, { gaps, meta, now: new Date().toISOString() });
      if (!full.turns && !full.asked_not_doable.length && !full.improvised.length) return null;   // nothing was played
      shared = core.harvestRecord(journal, { gaps, meta, strip: true, now: full.created });
    } catch (e) { onError('build', e); return null; }
    const entry = { full, shared };
    if (S.consent === 'keep') keep(entry);
    else { S.pending.set(full.id, entry); notice(); }
    return full;
  }
  function answer(v) {
    S.consent = v; try { storage && storage.setItem(HARVEST_STORE.consentKey, v); } catch (_) {}
    if (v === 'keep') for (const e of S.pending.values()) keep(e);
    S.pending.clear();
    if (S.notice) { S.notice.remove(); S.notice = null; }
  }
  /* The one-line notice, shown the first time a record is ready, until answered. */
  function notice() {
    if (!doc || S.notice || S.consent) return;
    const n = doc.createElement('div'); n.id = 'harvest-notice';
    n.setAttribute('style', 'position:fixed;left:12px;right:12px;bottom:calc(env(safe-area-inset-bottom,0px) + 12px);z-index:40;display:flex;gap:8px;align-items:center;flex-wrap:wrap;background:rgba(10,12,9,.92);border:1px solid rgba(243,240,232,.24);border-radius:10px;padding:8px 10px;font:400 12px/1.4 system-ui,sans-serif;color:#f3f0e8');
    const t = doc.createElement('span'); t.textContent = NOTICE.text; t.style.flex = '1 1 200px'; n.appendChild(t);
    for (const [label, v, ghost] of [[NOTICE.keep, 'keep', false], [NOTICE.drop, 'drop', true]]) { const b = doc.createElement('button'); b.type = 'button'; b.textContent = label; if (ghost) b.className = 'ghost'; b.onclick = () => answer(v); n.appendChild(b); }
    doc.body.appendChild(n); S.notice = n;
  }
  /* « Harvest »: the kept records and one button that copies them all. */
  function panel() {
    if (!doc) return;
    if (S.panel) { S.panel.remove(); S.panel = null; return; }
    const box = doc.createElement('div'); box.id = 'harvest-panel';
    box.setAttribute('style', 'position:fixed;inset:auto 12px 12px 12px;max-height:60vh;z-index:41;display:flex;flex-direction:column;gap:8px;background:rgba(10,12,9,.94);border:1px solid rgba(243,240,232,.24);border-radius:12px;padding:10px;font:400 11px/1.45 ui-monospace,monospace;color:#f3f0e8;user-select:text;-webkit-user-select:text');
    const pre = doc.createElement('pre'); pre.setAttribute('style', 'margin:0;overflow:auto;white-space:pre-wrap;flex:1');
    const R = readLocal();
    pre.textContent = [`harvest · ${R.length} record(s) kept in this browser${S.db ? ' · shared store: collection ' + HARVEST_STORE.collection + ' (player sentences stripped)' : ' · no shared store here'} · consent: ${S.consent || 'not asked yet'}${S.pending.size ? ' · ' + S.pending.size + ' waiting for the notice' : ''}`,
      ...R.slice().reverse().map(r => `${r.id} · ${r.mode} · ${String(r.created || '').slice(0, 16)} · ${r.turns} turns · not doable ${r.asked_not_doable.length} · improvised ${r.improvised.length} · slow or doubtful ${r.slow_or_doubtful.length}`)].join('\n');
    const row = doc.createElement('div'); row.setAttribute('style', 'display:flex;gap:8px;flex-wrap:wrap');
    const copy = doc.createElement('button'); copy.type = 'button'; copy.textContent = 'Copy all';
    copy.onclick = async () => { const t = JSON.stringify(readLocal(), null, 1); try { await doc.defaultView.navigator.clipboard.writeText(t); copy.textContent = 'Copied'; } catch (_) { pre.textContent = t; } setTimeout(() => { copy.textContent = 'Copy all'; }, 1500); };
    const close = doc.createElement('button'); close.type = 'button'; close.className = 'ghost'; close.textContent = 'Close'; close.onclick = () => panel();
    row.append(copy, close);
    if (S.consent) { const c = doc.createElement('button'); c.type = 'button'; c.className = 'ghost'; c.textContent = S.consent === 'keep' ? 'Stop keeping' : 'Keep from now on'; c.onclick = () => { answer(S.consent === 'keep' ? 'drop' : 'keep'); panel(); panel(); }; row.append(c); }
    box.append(pre, row); doc.body.appendChild(box); S.panel = box;
  }
  return { collect, answer, panel, list: readLocal, consent: () => S.consent, pending: () => [...S.pending.keys()], shared: () => !!S.db };
}
