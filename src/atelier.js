// Atelier : l'interface de la banque de scènes et du constructeur de monde (panneau ou tiroir, chantier en cours).
// Ne connaît le moteur que par ce que main.js lui passe (deps) ; la logique est dans src/constructeur.js (C).
// Pas d'alert, confirm ni prompt (inertes dans un artefact) ; tout le texte venu de la banque passe par textContent.
// Voir docs/constructeur-de-monde.md.

export function creerAtelier(deps) {
  const C = deps.C, $ = id => document.getElementById(id), el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt !== undefined) e.textContent = txt; return e; };
  const panneau = $('banque'), liste = $('banque-liste'), chantierEl = $('chantier'), puce = $('chantier-puce');
  let banque = null, docs = [], ouvert = null, courante = null, job = null, alerte = '', dicteeOn = false, voulue = deps.sceneVoulue || null;
  const embarquees = (deps.embarquees || []).map((f, i) => ({ id: 'embarquee-' + (f.id || i), titre: f.titre || f.id, description: f.inspiration || '', fiche: f, vignette: '', cree: 0, modifie: 0, source: 'embarquee', historique: [], lectureSeule: true, index: i }));
  const date = t => { if (!t) return 'Scène du jeu'; const d = new Date(t), p = v => String(v).padStart(2, '0'); return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`; };
  const SOURCE = { claude: 'Claude', lexique: 'sans Claude', migration: 'ancienne version', copie: 'copie', import: 'importée', embarquee: 'du jeu' };

  /* ---------------------------------------------------------------- banque */
  function brancher(db) {
    if (banque) banque.fermer();
    banque = C.creerBanque({ db, stockage: deps.stockage, surChangement: l => { docs = l; rendre(); retrouver(); }, surEtat: e => { if (e.alerte !== undefined) { alerte = e.alerte; rendreEtat(); } } });
    banque.migrer().then(n => { if (n) deps.dire && deps.dire(n + ' scène(s) reprise(s) de l\'ancienne version'); }).catch(() => {});
    rendreEtat();
  }
  function retrouver() {                                             // la scène choisie à la visite précédente, dès qu'elle est là
    if (!voulue || !banque) return;
    const d = docs.find(x => x.id === voulue) || embarquees.find(x => x.id === voulue);
    if (d) { voulue = null; setTimeout(() => { courante = d.id; deps.appliquer(d.fiche, d); rendre(); }, 0); }
  }
  brancher(null);                                                    // tout de suite en local ; la base partagée arrive plus tard, ou jamais
  Promise.resolve(deps.db).then(db => { if (db) brancher(db); }).catch(() => {});

  /* ---------------------------------------------------------------- panneau */
  function ouvrir(o = {}) { panneau.hidden = false; document.body.classList.add('banque-ouverte'); $('lieu').setAttribute('aria-expanded', 'true'); rendre(); puce.hidden = true;
    setTimeout(() => { if (o.nouvelle) { panneau.scrollTop = 0; $('banque-desc').focus(); } else $('banque-fermer').focus(); }, 30); }
  function fermer() { panneau.hidden = true; document.body.classList.remove('banque-ouverte'); $('lieu').setAttribute('aria-expanded', 'false'); if (dicteeOn && deps.arreterDictee) deps.arreterDictee(); rendrePuce(); }
  $('banque-fermer').onclick = () => { fermer(); $('lieu').focus(); };
  panneau.addEventListener('keydown', e => { if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); fermer(); $('lieu').focus(); } });
  puce.onclick = ouvrir;
  $('banque-nouvelle').addEventListener('submit', e => { e.preventDefault(); const t = $('banque-desc').value.trim(); if (!t) { $('banque-desc').focus(); return; } if (creer(t)) $('banque-desc').value = ''; });
  if (deps.dicteeDispo) Promise.resolve(deps.dicteeDispo).then(ok => { $('banque-dicter').hidden = !ok; }).catch(() => {});
  $('banque-dicter').onclick = () => { if (dicteeOn) deps.arreterDictee(); else deps.dicter($('banque-desc')); };
  function dictee(on) { dicteeOn = on; $('banque-dicter').setAttribute('aria-pressed', String(on)); $('banque-dicter').textContent = on ? 'J\'écoute' : 'Dicter'; }

  function rendreEtat() {
    const m = banque ? banque.mode() : 'memoire';
    $('banque-mode').textContent = m === 'db' ? 'Banque partagée' : m === 'local' ? 'Sur cet appareil' : 'Pour cette visite';
    $('banque-alerte').textContent = alerte; $('banque-alerte').hidden = !alerte;
  }
  function vignette(d) {
    const b = el('div', 'carte-vignette'); b.setAttribute('aria-hidden', 'true');
    const src = d.vignette || (d.lectureSeule && deps.vignettes && deps.vignettes(d.id));   // scène du jeu : vignette prise quand on y est passé
    if (src) { const im = el('img'); im.alt = ''; im.src = src; b.append(im); }
    else { const a = (d.fiche && d.fiche.ambiance) || {}, nuit = a.soleil && a.soleil.hauteur < -1; b.classList.add(nuit ? 'nuit' : 'jour'); }
    return b;
  }
  function rendre() {
    if (panneau.hidden) return;
    const tous = [...docs, ...embarquees], focusId = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.id : null;
    liste.replaceChildren();
    const groupe = t => { const g = el('li', 'groupe', t); g.setAttribute('aria-hidden', 'true'); liste.append(g); };
    groupe('Mes scènes' + (docs.length ? ' (' + docs.length + ')' : ''));
    if (!docs.length) liste.append(el('li', 'vide', 'Aucune scène créée pour l\'instant. Décris un lieu ci-dessus : Claude l\'écrit, le moteur le rend, Claude le relit.'));
    for (const d of tous) {
      if (d === embarquees[0]) groupe('Scènes du jeu');
      const li = el('li', 'carte' + (courante === d.id ? ' courante' : '') + (ouvert === d.id ? ' ouverte' : '')), b = el('button', 'carte-tete');
      b.type = 'button'; b.dataset.id = d.id; b.setAttribute('aria-expanded', String(ouvert === d.id));
      const txt = el('div', 'carte-txt'); txt.append(el('strong', '', d.titre), el('span', 'carte-meta', (d.lectureSeule ? 'Scène du jeu' : date(d.modifie) + ' · ' + (SOURCE[d.source] || d.source)) + (courante === d.id ? ' · en cours' : '')));
      if (d.description) txt.append(el('span', 'carte-desc', d.description));
      b.append(vignette(d), txt);
      b.onclick = () => { ouvert = ouvert === d.id ? null : d.id; rendre(); };
      li.append(b);
      if (ouvert === d.id) li.append(actions(d));
      liste.append(li);
    }
    if (focusId) { const f = liste.querySelector(`[data-id="${CSS.escape(focusId)}"]`); if (f) f.focus(); }
  }
  function actions(d) {
    const box = el('div', 'carte-actions'), ligne = el('div', 'row gauche'), occupe = !!job;
    const bouton = (txt, f, cls) => { const b = el('button', cls || 'ghost', txt); b.type = 'button'; b.onclick = f; ligne.append(b); return b; };
    const jouer = bouton('Jouer ici', () => choisir(d), ''); if (occupe) { jouer.disabled = true; jouer.title = 'Une scène est en fabrication'; }
    const formulaire = (label, valeur, ok, place) => {          // un champ en ligne, à la place d'un prompt()
      const f = el('form', 'carte-form'), i = el('input'), go = el('button', '', ok.txt);
      i.type = 'text'; i.value = valeur || ''; i.placeholder = place || ''; i.setAttribute('aria-label', label); i.maxLength = 1500; go.type = 'submit';
      const non = el('button', 'ghost', 'Annuler'); non.type = 'button'; non.onclick = () => { f.remove(); };
      f.append(i, go, non); f.addEventListener('submit', e => { e.preventDefault(); ok.f(i.value.trim()); });
      box.querySelectorAll('.carte-form').forEach(x => x.remove()); box.append(f); setTimeout(() => i.focus(), 20);
    };
    if (!d.lectureSeule) {
      bouton('Retoucher', () => formulaire('Retouche', '', { txt: 'Retoucher', f: t => { if (t) retoucher(d.id, t); } }, 'plus de brouillard, rapproche la maison…')).disabled = occupe;
    }
    bouton('Dupliquer et modifier', () => formulaire('La même, mais…', '', { txt: 'Dupliquer', f: t => dupliquer(d, t) }, 'la même, mais sous la neige (vide : copie)')).disabled = occupe;
    if (!d.lectureSeule) {
      bouton('Renommer', () => formulaire('Nouveau titre', d.titre, { txt: 'Renommer', f: t => { if (t) renommer(d.id, t); } }));
      if (d.description && d.source !== 'migration') bouton('Régénérer', () => regenerer(d)).disabled = occupe;
      const sup = bouton('Supprimer', () => {
        if (sup.dataset.confirme) { supprimer(d.id); return; }
        sup.dataset.confirme = '1'; sup.textContent = 'Confirmer la suppression'; sup.classList.add('danger');
        setTimeout(() => { if (sup.isConnected) { delete sup.dataset.confirme; sup.textContent = 'Supprimer'; sup.classList.remove('danger'); } }, 5000);
      });
    }
    box.append(ligne);
    if (d.historique && d.historique.length) {
      const det = el('details', 'carte-hist'); det.append(el('summary', '', 'Historique (' + d.historique.length + ')'));
      const ul = el('ul'); for (const h of d.historique.slice().reverse()) ul.append(el('li', '', date(h.t) + ' · ' + h.type + (h.note !== undefined && h.note !== null ? ' · note ' + h.note + '/10' : '') + (h.consigne ? ' · « ' + h.consigne + ' »' : '') + (h.chemins && h.chemins.length ? ' · ' + h.chemins.join(', ') : '') + (h.texte ? ' · ' + h.texte : '')));
      det.append(ul); box.append(det);
    }
    return box;
  }
  function choisir(d) {
    if (job) return;
    courante = d.id; deps.appliquer(d.fiche, d); deps.dire && deps.dire(d.titre, true);
    try { deps.stockage && deps.stockage.setItem('bodycam-scene', d.id); } catch (_) {}
    if (matchMedia('(max-width: 759px)').matches) fermer(); else rendre();
  }
  async function renommer(id, titre) { try { await banque.modifier(id, d => { d.historique.push({ t: Date.now(), type: 'renommer', texte: d.titre + ' → ' + titre }); d.titre = titre.slice(0, 80); d.fiche.titre = d.titre; return d; }); } catch (e) { alerte = 'Renommage impossible.'; rendreEtat(); } }
  async function supprimer(id) {
    try { await banque.supprimer(id); if (courante === id) courante = null; ouvert = null; rendre(); deps.dire && deps.dire('Scène supprimée', true); }
    catch (e) { alerte = 'Suppression refusée par la banque (' + (e && e.code) + ').'; rendreEtat(); }
  }

  /* ---------------------------------------------------------------- chantier : une fabrication à la fois */
  const ETAPES = [['plan', 'Plan'], ['fiche', 'Scène'], ['retouche', 'Retouche'], ['controle', 'Contrôle'], ['capture', 'Repérage'], ['relecture', 'Relecture'], ['banque', 'Banque']];
  function lancer(titre, entree, apres, ecoute) {
    if (job && job.termine) { clearInterval(job.minuteur); job = null; }
    if (job) { alerte = 'Une scène est déjà en fabrication : attends la fin ou arrête-la.'; rendreEtat(); ouvrir(); return false; }
    const ctl = new AbortController();
    job = { titre, entree, apres, ctl, t0: Date.now(), etape: 'plan', texte: 'Je commence…', fait: new Set(), vues: [], erreur: null, fini: false, tour: 0, ecoute: ecoute || null };
    if (entree.base || !deps.sample()) job.etape = entree.base ? 'retouche' : 'fiche';
    deps.occupe && deps.occupe(true); rendreChantier(); rendre(); rendrePuce();
    job.minuteur = setInterval(() => { const t = chantierEl.querySelector('.chantier-temps'); if (t) t.textContent = Math.round((Date.now() - job.t0) / 1000) + ' s'; rendrePuce(); }, 1000);   // l'horloge seule : les boutons restent en place
    executer(job);
    return true;
  }
  async function executer(j) {
    const sample = deps.sample();
    let images = false;
    if (sample && sample.limits && !deps.sansImages) { try { const l = await sample.limits(); images = l && l.images && l.images.maxCount > 0 && (l.images.mediaTypes || ['image/jpeg']).includes('image/jpeg') ? l.images.maxCount : 0; } catch (_) { images = 0; } }
    j.images = images;
    try {
      const r = await C.construire(j.entree, { sample, images, moteur: deps.moteur, signal: j.ctl.signal, alea: Math.random,
        etape: info => { if (j !== job) return; (j.etapes = j.etapes || []).push(info.etape); if (j.etape !== info.etape) j.fait.add(j.etape); j.etape = info.etape; j.texte = info.texte; if (info.tour) j.tour = info.tour; if (info.vues) j.vues = info.vues; rendreChantier(); rendrePuce(); if (j.ecoute) try { j.ecoute(info); } catch (_) {} },
        journal: x => { (j.journal = j.journal || []).push(x); if (j.ecoute) try { j.ecoute({ etape: x.etape, texte: `${x.etape} : ${x.ok ? 'réponse' : 'échec' + (x.code ? ' (' + x.code + ')' : '')} en ${(x.ms / 1000).toFixed(1)} s`, ms: x.ms, ok: x.ok }); } catch (_) {} } });
      j.fait.add(j.etape); j.etape = 'banque'; j.texte = 'Vignette et enregistrement…'; rendreChantier();
      let vg = '';
      const v0 = (r.vues || []).find(v => v && v.vignette && v.moyenne > 2);
      if (v0) vg = v0.vignette;
      else if (deps.moteur.capturer) { try { const c = await deps.moteur.capturer(C.choisirVues(r.fiche, deps.moteur.geo(), 1), { signal: j.ctl.signal, vite: true }); if (c[0] && c[0].moyenne > 2) vg = c[0].vignette; } catch (e) { if (e && e.code === 'cancelled') throw e; } }
      const doc = await j.apres(r, vg);
      courante = doc.id; ouvert = doc.id;
      deps.appliquer(doc.fiche, doc);
      try { deps.stockage && deps.stockage.setItem('bodycam-scene', doc.id); } catch (_) {}
      j.fait.add('banque'); j.fini = true; j.doc = doc;
      j.texte = (r.erreur ? 'Gardée sans relecture complète : ' + (C.MESSAGES_ERREUR[r.erreur.code] || r.erreur.message) + ' ' : '') + 'Scène enregistrée' + (r.notes.length ? ` (note ${r.notes.map(n => n.note).join(' → ')}/10)` : '') + '.' + (r.fiche.note ? ' ' + r.fiche.note : '');
      deps.dire && deps.dire(doc.titre + (r.fiche.note ? '. ' + r.fiche.note : ''));
    } catch (e) {
      const code = e && e.code || 'upstream_error';
      if (code === 'not_granted' && !j.relance) {                     // Claude refusé pour cette page : le lexique de secours prend le relais
        deps.oublierClaude && deps.oublierClaude(); clearInterval(j.minuteur); job = null; j.relaye = true;
        const n = lancer(j.titre, j.entree, j.apres, j.ecoute); if (n) { job.relance = true; job.texte = C.MESSAGES_ERREUR.not_granted; } return;
      }
      j.erreur = { code, etape: e && e.etape, message: C.MESSAGES_ERREUR[code] || (e && e.message) || 'Erreur.' };
      j.texte = code === 'cancelled' ? 'Arrêté. Rien n\'a été enregistré.' : 'Échec' + (e && e.etape ? ' (' + e.etape + ')' : '') + ' : ' + j.erreur.message;
      { const d = docs.find(x => x.id === courante) || embarquees.find(x => x.id === courante); if (d) deps.appliquer(d.fiche, d); }   // on revient à la scène d'avant
    } finally {
      clearInterval(j.minuteur); j.ms = Date.now() - j.t0;
      if (j.relaye) return;
      if (job === j) { job.termine = true; deps.occupe && deps.occupe(false); rendreChantier(); rendre(); rendrePuce();
        if (!j.erreur) setTimeout(() => { if (job === j) { job = null; rendreChantier(); rendrePuce(); } }, 8000); }
      deps.surFin && deps.surFin(j);
    }
  }
  function rendreChantier() {
    if (!job) { chantierEl.hidden = true; chantierEl.replaceChildren(); return; }
    const j = job; chantierEl.hidden = false; chantierEl.replaceChildren();
    const tete = el('div', 'chantier-tete'); tete.append(el('strong', '', j.titre), el('span', 'chantier-temps', Math.round((Date.now() - j.t0) / 1000) + ' s'));
    const etapes = el('ol', 'chantier-etapes');
    for (const [k, nom] of ETAPES) {
      if (k === 'plan' && (j.entree.base || !deps.sample())) continue;
      if (k === 'retouche' && !j.entree.retouche) continue;
      if ((k === 'capture') && !j.images) continue;
      const li = el('li', j.erreur && j.etape === k ? 'echec' : j.fait.has(k) ? 'fait' : j.etape === k && !j.termine ? 'actif' : '', nom + (k === 'relecture' && j.tour ? ' ' + j.tour + '/2' : ''));
      if (j.etape === k && !j.termine) li.setAttribute('aria-current', 'step');
      etapes.append(li);
    }
    const txt = el('p', 'chantier-texte', j.texte);
    chantierEl.append(tete, etapes, txt);
    if (j.vues && j.vues.length) { const r = el('div', 'chantier-vues'); for (const v of j.vues) if (v && v.url) { const im = el('img'); im.src = v.url; im.alt = v.legende || 'vue capturée'; r.append(im); } chantierEl.append(r); }
    const row = el('div', 'row gauche');
    if (!j.termine) { const b = el('button', 'ghost', 'Arrêter'); b.type = 'button'; b.onclick = () => j.ctl.abort(); row.append(b); }
    else if (j.erreur) {
      if (j.erreur.code !== 'cancelled') { const b = el('button', '', 'Réessayer'); b.type = 'button'; b.onclick = () => { job = null; lancer(j.titre, j.entree, j.apres); }; row.append(b); }
      const f = el('button', 'ghost', 'Fermer'); f.type = 'button'; f.onclick = () => { job = null; rendreChantier(); rendrePuce(); rendre(); }; row.append(f);
    } else { const f = el('button', 'ghost', 'Fermer'); f.type = 'button'; f.onclick = () => { job = null; rendreChantier(); rendrePuce(); }; row.append(f); }
    chantierEl.append(row);
  }
  function rendrePuce() {
    if (!job || !panneau.hidden) { puce.hidden = true; return; }
    const nom = (ETAPES.find(x => x[0] === job.etape) || [0, job.etape])[1];
    puce.hidden = false; puce.textContent = job.erreur ? 'Scène : échec, voir' : job.termine ? 'Scène prête : ' + (job.doc ? job.doc.titre : '') : `Fabrication · ${nom}${job.etape === 'relecture' && job.tour ? ' ' + job.tour + '/2' : ''} · ${Math.round((Date.now() - job.t0) / 1000)} s`;
  }

  /* ---------------------------------------------------------------- les quatre fabrications */
  const enregistrerNouveau = (description, source, parent, extraHist) => async (r, vg) => {
    const id = C.nouvelId(r.fiche.titre);
    const doc = C.docDepuis({ id, description, fiche: r.fiche, vignette: vg, source: r.source === 'lexique' ? 'lexique' : source, parent, historique: [...(extraHist || []), ...r.historique, ...(r.notes.length ? [] : [])] });
    await banque.enregistrer(doc); return banque.get(id) || doc;
  };
  /* o (conception studio, src/conception.js): { titre: the creator's sentence when the description carries research findings,
     etape(info): each step of the chain, as the studio's environment stage reports it }. */
  function creer(description, o = {}) { const t = o.titre || description; return lancer('« ' + t.slice(0, 60) + (t.length > 60 ? '…' : '') + ' »', { description }, enregistrerNouveau(description, 'claude', null), o.etape); }
  function retoucher(id, texte) {
    const d = banque.get(id); if (!d) return false;
    return lancer('Retouche : « ' + texte.slice(0, 50) + ' »', { description: d.description, base: d.fiche, retouche: texte, id: d.id }, async (r, vg) => {
      await banque.modifier(id, x => { x.fiche = Object.assign({}, r.fiche, { id }); x.titre = r.fiche.titre || x.titre; x.vignette = vg || x.vignette; x.historique.push(...r.historique); return x; });
      return banque.get(id);
    });
  }
  function dupliquer(d, texte) {
    const base = d.fiche, desc = d.description || d.titre;
    if (!texte) {                                                     // copie simple, sans Claude
      const id = C.nouvelId(d.titre), doc = C.docDepuis({ id, description: desc, fiche: Object.assign({}, base, { titre: d.titre + ' (copie)' }), vignette: d.vignette, source: 'copie', parent: d.lectureSeule ? null : d.id, historique: [{ t: Date.now(), type: 'copie', texte: 'copie de ' + d.titre }] });
      banque.enregistrer(doc).then(() => { ouvert = id; rendre(); }); return true;
    }
    return lancer('Copie : « ' + texte.slice(0, 50) + ' »', { description: desc, base, retouche: texte }, enregistrerNouveau(desc, 'copie', d.lectureSeule ? null : d.id, [{ t: Date.now(), type: 'copie', texte: 'copie de ' + d.titre }]));
  }
  function regenerer(d) {
    return lancer('Régénération : ' + d.titre, { description: d.description, id: d.id }, async (r, vg) => {
      await banque.modifier(d.id, x => { x.fiche = Object.assign({}, r.fiche, { id: d.id }); x.titre = r.fiche.titre || x.titre; x.vignette = vg || x.vignette; x.historique.push({ t: Date.now(), type: 'regeneration' }, ...r.historique); return x; });
      return banque.get(d.id);
    });
  }

  return { ouvrir, fermer, rafraichir: rendre, basculer: () => (panneau.hidden ? ouvrir() : fermer()), creer, retoucher, regenerer, dupliquer, choisir: id => { const d = docs.find(x => x.id === id) || embarquees.find(x => x.id === id); if (d) choisir(d); return !!d; },
    dictee, banque: () => banque, docs: () => docs, job: () => job, attendre: () => new Promise(ok => { const t = setInterval(() => { if (!job || job.termine) { clearInterval(t); ok(job); } }, 200); }) };
}
