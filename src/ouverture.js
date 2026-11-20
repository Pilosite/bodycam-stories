// Ouverture de démo : « Quel monde veux-tu filmer ? ». Une demande qui correspond à une préparation enregistrée
// (ouvertures/*.json : requêtes, sources, constats réellement faits) est rejouée en accéléré pendant que le moteur compile et
// rend le lieu derrière ; une autre demande part dans la vraie chaîne du constructeur (atelier.js), en temps réel.
// Rien n'est inventé : le rejeu ne montre que le journal enregistré, et la traduction et le contrôle sont calculés sur la
// fiche embarquée au moment même. La mention « rejeu accéléré » est un réglage (docs/ouverture.md).
// Partie pure (normaliser, correspond, programme, traduction) testée par tests/ouverture.test.mjs ; creerOuverture touche au DOM.

export function normaliser(t) {
  return String(t == null ? '' : t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

/* Le rejeu qui répond à une demande : il faut au moins un mot requis (le lieu ou « forêt ») et deux mots en tout. */
export function correspond(texte, rejeux) {
  const t = ' ' + normaliser(texte) + ' ';
  let mieux = null, score = 0;
  for (const r of Array.isArray(rejeux) ? rejeux : []) {
    if (!r || r.type !== 'rejeu') continue;
    const a = m => t.includes(' ' + normaliser(m) + ' ') || (normaliser(m).length > 5 && t.includes(normaliser(m)));
    const req = (r.motsRequis || []).filter(a).length, n = (r.mots || []).filter(a).length;
    if (!req || n < 2 || (r.motsExclus || []).some(a)) continue;   // « Champcueil la nuit » n'est pas ce qui a été préparé
    const s = n + 2 * req;
    if (s > score) { score = s; mieux = r; }
  }
  return mieux;
}

/* Hasard reproductible (tests) ou Math.random. */
export function alea(graine) { let s = (graine >>> 0) || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

/* Ce que la fiche dit, en vocabulaire du moteur, avec ses vraies valeurs. Une ligne : [rubrique, texte]. */
export function traduction(f) {
  const L = [], a = f.ambiance || {}, so = a.soleil || {}, fo = f.foret || {};
  const v = x => String(x).replace('.', ',');
  const kit = f.kit === 'dunes' ? 'dunes' : f.kit === 'nu' || (!f.kit && Array.isArray(f.semis)) ? 'nu' : 'foret';
  if (kit === 'foret') {
    L.push(['relief', f.relief ? `amplitude ${v(f.relief.amplitude ?? 0.8)} m, échelle ${v(f.relief.echelle ?? 150)} m` : 'ondulations de la forêt (≈ 1,5 m sur 150 m), sentier sinueux']);
    L.push(['semis', `arbres : densité ${v(fo.densite ?? 0.7)} — pins, chênes, bouleaux`]);
    L.push(['semis', `perches (jeunes châtaigniers) ${v(fo.perches ?? 1)}, blocs de grès ${v(fo.rochers ?? 1)}`]);
    L.push(['semis', `canopée ${v(fo.feuillage ?? 1)}${fo.houppier === 'cone' ? ', conifères en cône' : ', voûte de feuillus'}`]);
    L.push(['matières', 'sentier-sable, litiere, gres, gres-patine, ecorce-chene, ecorce-pin, ecorce-bouleau, ecorce-chataignier']);
  } else if (kit === 'dunes') L.push(['relief', 'dunes, rides de vent']);
  else {
    if (f.relief) L.push(['relief', `amplitude ${v(f.relief.amplitude ?? 0.8)} m`]);
    for (const s of f.semis || []) L.push(['semis', `${s.nom || s.id}, cellule ${(s.cellule || []).join(' × ')} m`]);
    if (f.surfaces) L.push(['matières', Object.values(f.surfaces).join(', ')]);
  }
  L.push(['saison', a.saison || 'automne']);
  if (so.hauteur !== undefined) L.push(['lumière', `soleil à ${v(so.hauteur)}° au-dessus de l'horizon, azimut ${v(so.azimut)}° par rapport au sentier${so.hauteur < 10 && so.hauteur >= 0 ? ' : lumière rasante, rougie' : ''}`]);
  if (a.brume !== undefined) L.push(['air', `brume ${v(a.brume)} par mètre`]);
  if (a.brume_basse) L.push(['air', `brume au sol ${v(a.brume_basse.densite)} sur ${v(a.brume_basse.hauteur)} m, éclairée par le soleil`]);
  L.push(['caméra', `bodycam à ${v((f.camera && f.camera.hauteur) || 1.36)} m, ${((f.camera && f.camera.champ) || 125)}°`]);
  return L;
}

/* Le programme du rejeu : une suite d'événements datés (secondes), aux durées un peu irrégulières comme en direct.
   Les durées de chaque étape viennent du journal ; chaque élément reçoit sa part, tirée au hasard (±40 %). */
export function programme(r, f, hasard = Math.random, controle = null) {
  const ev = [], jit = (d, k = .4) => d * (1 - k + 2 * k * hasard());
  let t = 0;
  const etape = (id, titre, duree, items, rendre) => {
    ev.push({ t, type: 'etape', id, titre });
    t += jit(.3, .5);
    const n = items.length, poids = items.map(() => .4 + hasard() * 1.2), somme = poids.reduce((a, b) => a + b, 0) || 1;
    items.forEach((it, i) => { ev.push(Object.assign({ t, type: 'ligne', etape: id }, rendre(it, i))); t += jit(duree) * poids[i] / somme; });
    ev.push({ t, type: 'fin-etape', id }); t += jit(.25, .6);
  };
  ev.push({ t: 0, type: 'pense', texte: r.comprendre.texte });
  t = jit(r.comprendre.duree, .2);
  etape('recherche', 'Recherche', r.recherche.duree, r.recherche.requetes, q => ({ genre: 'requete', texte: q }));
  etape('lecture', 'Lecture des sources', r.lecture.duree, r.lecture.sources, s => ({ genre: 'source', texte: s.titre, domaine: s.domaine, etat: s.etat, pourquoi: s.pourquoi || '' }));
  etape('constats', 'Ce que j\'en retiens', r.constats.duree, r.constats.liste, c => ({ genre: 'constat', texte: c.texte, source: c.source, reglage: c.reglage }));
  etape('traduction', 'Traduction en vocabulaire du moteur', r.traduction.duree, traduction(f), ([k, x]) => ({ genre: 'valeur', cle: k, texte: x }));
  const lignes = controle ? (controle.lignes.length ? controle.lignes.filter(l => l.niveau !== 'info').slice(0, 3).map(l => (l.niveau === 'erreur' ? 'erreur : ' : 'à noter : ') + l.texte) : []) : [];
  etape('controle', 'Contrôle', r.controle.duree, [r.controle.texte, ...lignes, controle ? (controle.ok ? 'passage libre, rien de bloquant' : 'des erreurs : voir le constat') : 'contrôle indisponible'], x => ({ genre: 'controle', texte: x }));
  ev.push({ t, type: 'monde' });
  t += r.fondu.duree;
  ev.push({ t, type: 'fin' });
  return ev;
}

/* ------------------------------------------------------------------ interface (DOM)
   deps : { rejeux, fiches, C (constructeur), appliquer(fiche), pret(timeoutMs) → Promise, attendreGPU(),
            construire(texte) (vraie chaîne), mention (bool), dicteeDispo (Promise<bool>), dicter(el), arreterDictee(),
            surDebut(texte, rejeu), surFin(fiche), etat() → texte de l'étape en cours, hasard } */
export function creerOuverture(deps) {
  const d = document, $ = id => d.getElementById(id);
  const racine = d.createElement('section');
  racine.id = 'ouverture'; racine.className = 'ouv'; racine.setAttribute('aria-labelledby', 'ouv-q'); racine.hidden = true;
  racine.innerHTML = `<div class="ouv-cadre">
  <header class="ouv-marque">
    <p class="ouv-nom">Bodycam Stories</p>
    <p class="ouv-concept">Génération procédurale complète par intelligence artificielle</p>
    <p class="ouv-expl">Tu décris un monde. Une IA l'écrit, le moteur le fabrique entièrement par code, sans image ni modèle 3D, et le filme comme une caméra-piéton. Puis tu parles à celui qui la porte.</p>
  </header>
  <p class="ouv-sur"><span class="ouv-pt"></span>CAM 07 · nouveau tournage</p>
  <h1 id="ouv-q" class="ouv-q">Quel monde veux-tu filmer ?</h1>
  <form id="ouv-form" class="ouv-form" autocomplete="off">
    <label class="ouv-vh" for="ouv-txt">Décris le monde</label>
    <textarea id="ouv-txt" rows="2" maxlength="600" enterkeyhint="send" placeholder="Un lieu, une saison, une heure…"></textarea>
    <div class="ouv-actions"><button type="button" id="ouv-dicter" class="ghost" hidden aria-pressed="false">Micro</button><button type="submit" id="ouv-go">Filmer</button></div>
  </form>
  <div class="ouv-sugg"><span>Essaie :</span> <button type="button" id="ouv-sugg" class="ouv-chip"></button></div>
  <div id="ouv-demande" class="ouv-demande" hidden></div>
  <div id="ouv-pense" class="ouv-pense" hidden></div>
  <ol id="ouv-log" class="ouv-log" aria-live="polite"></ol>
  <p id="ouv-mention" class="ouv-mention" hidden></p>
</div>
<button type="button" id="ouv-passer" class="ghost ouv-passer">Passer</button>`;
  d.body.appendChild(racine);
  const txt = $('ouv-txt'), log = $('ouv-log'), rejeux = deps.rejeux || [];
  const sugg = (rejeux.find(r => r.suggestion) || {}).suggestion || '';
  $('ouv-sugg').textContent = sugg; $('ouv-sugg').parentNode.hidden = !sugg;
  let mention = !!deps.mention, timers = [], enCours = false, fini = false;

  function afficherMention(r) {
    const m = $('ouv-mention');
    m.hidden = !(mention && r);
    if (r) m.textContent = 'Rejeu accéléré d\'une génération enregistrée' + (r.enregistre ? ' le ' + r.enregistre.split('-').reverse().join('/') : '') + ' · recherche réelle, durées raccourcies';
  }
  $('ouv-sugg').onclick = () => {                       // la suggestion s'écrit dans le champ, comme tapée ; on garde la main pour envoyer
    if (enCours) return;
    txt.value = ''; let i = 0; const s = sugg;
    const tape = () => { txt.value = s.slice(0, ++i); if (i < s.length) timers.push(setTimeout(tape, 14 + 30 * Math.random())); else txt.focus(); };
    tape();
  };
  txt.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('ouv-form').requestSubmit(); } });
  Promise.resolve(deps.dicteeDispo).then(ok => { if (ok) $('ouv-dicter').hidden = false; }).catch(() => {});
  $('ouv-dicter').onclick = () => { if ($('ouv-dicter').getAttribute('aria-pressed') === 'true') deps.arreterDictee && deps.arreterDictee(); else deps.dicter && deps.dicter(txt); };
  $('ouv-form').addEventListener('submit', e => { e.preventDefault(); const t = txt.value.trim(); if (!t) { txt.focus(); return; } envoyer(t); });
  $('ouv-passer').onclick = () => terminer(null, true);

  function li(cls, html) { const x = d.createElement('li'); x.className = cls; x.innerHTML = html; log.appendChild(x); x.scrollIntoView({ block: 'end', behavior: 'smooth' }); return x; }
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
  const ETAT = { lu: 'lu', illisible: 'illisible', refuse: 'accès refusé', extrait: 'extrait de recherche' };

  function envoyer(t) {
    if (enCours) return; enCours = true;
    deps.arreterDictee && deps.arreterDictee();
    racine.classList.add('ouv-travail');
    $('ouv-demande').hidden = false; $('ouv-demande').textContent = t;
    const r = correspond(t, rejeux);
    const f = r && (deps.ficheDe ? deps.ficheDe(r) : (deps.fiches || []).find(x => x.id === r.fiche || x.id === r.ficheSecours));
    if (deps.surDebut) deps.surDebut(t, !!(r && f));
    if (r && f) return rejouer(r, f);
    afficherMention(null);
    // Pas de rejeu : la vraie chaîne du constructeur, en temps réel, suivie dans son chantier.
    $('ouv-pense').hidden = false; $('ouv-pense').textContent = 'Je prépare ce monde pour de vrai : compte quelques minutes. Tu peux suivre la fabrication.';
    timers.push(setTimeout(() => terminer(null, false, true), 2200));
  }

  function rejouer(r, f) {
    afficherMention(r);
    deps.appliquer(f);                                  // le moteur compile et rend derrière, pendant le rejeu
    let controle = null;
    try { controle = deps.C ? deps.C.controler(f, null, { recettes: deps.recettes }) : null; } catch (_) { controle = null; }
    const ev = programme(r, f, deps.hasard || Math.random, controle);
    const blocs = {};
    for (const e of ev) timers.push(setTimeout(() => jouer(e, blocs), e.t * 1000));
  }

  function jouer(e, blocs) {
    if (fini) return;
    if (e.type === 'pense') { $('ouv-pense').hidden = false; $('ouv-pense').textContent = e.texte; return; }
    if (e.type === 'etape') {
      const x = li('ouv-etape en-cours', `<div class="ouv-et"><span class="ouv-roue" aria-hidden="true"></span><span class="ouv-titre">${esc(e.titre)}</span><span class="ouv-compte"></span></div><ul class="ouv-items"></ul>`);
      blocs[e.id] = { x, ul: x.querySelector('.ouv-items'), n: 0 };
      return;
    }
    const b = blocs[e.etape || e.id];
    if (e.type === 'ligne' && b) {
      const it = d.createElement('li'); it.className = 'ouv-it ouv-' + e.genre;
      if (e.genre === 'requete') it.innerHTML = `<span class="ouv-k">cherche</span> ${esc(e.texte)}`;
      else if (e.genre === 'source') it.innerHTML = `<span class="ouv-dom">${esc(e.domaine)}</span> <span class="ouv-src">${esc(e.texte)}</span> <span class="ouv-etat ouv-${esc(e.etat)}">${esc(ETAT[e.etat] || e.etat)}${e.pourquoi ? ' · ' + esc(e.pourquoi) : ''}</span>`;
      else if (e.genre === 'constat') it.innerHTML = `<span class="ouv-c">${esc(e.texte)}</span><span class="ouv-r">→ ${esc(e.reglage)}</span>`;
      else if (e.genre === 'valeur') it.innerHTML = `<span class="ouv-k">${esc(e.cle)}</span> ${esc(e.texte)}`;
      else it.textContent = e.texte;
      b.ul.appendChild(it); b.n++;
      const c = b.x.querySelector('.ouv-compte'); if (e.genre === 'requete' || e.genre === 'source') c.textContent = b.n;
      it.scrollIntoView({ block: 'end', behavior: 'smooth' });
      return;
    }
    if (e.type === 'fin-etape' && b) { b.x.classList.remove('en-cours'); b.x.classList.add('fait'); return; }
    if (e.type === 'monde') {
      const x = li('ouv-etape en-cours', `<div class="ouv-et"><span class="ouv-roue" aria-hidden="true"></span><span class="ouv-titre">Le monde se construit</span><span class="ouv-compte"></span></div>`);
      // Le fondu attend la première image du moteur, borné par la page (quelques secondes : au-delà, il part sur ce qui est prêt).
      // Pendant l'attente, l'étape en cours (deps.etat) : une progression vraie, pas une roue sans fin.
      const c = x.querySelector('.ouv-compte'), suivi = setInterval(() => { if (deps.etat) c.textContent = deps.etat(); }, 200);
      if (deps.etat) c.textContent = deps.etat();
      Promise.resolve(deps.pret ? deps.pret(6000) : null).catch(() => {}).then(() => { clearInterval(suivi); c.textContent = ''; if (fini) return; x.classList.remove('en-cours'); x.classList.add('fait'); racine.classList.add('ouv-fondu');
        timers.push(setTimeout(() => terminer(e.fiche), 2400)); });
      return;
    }
  }

  function terminer(fiche, passe, constructeur) {
    if (fini) return; fini = true;
    timers.forEach(clearTimeout); timers = [];
    racine.classList.add('ouv-fondu');
    setTimeout(() => { racine.hidden = true; racine.remove(); d.body.classList.remove('ouverture-on'); }, passe ? 300 : 900);
    if (deps.surFin) deps.surFin({ passe: !!passe, constructeur: !!constructeur, texte: $('ouv-demande').textContent });
  }

  return {
    ouvrir() { racine.hidden = false; d.body.classList.add('ouverture-on'); setTimeout(() => { try { txt.focus({ preventScroll: true }); } catch (_) {} }, 60); },
    mention(on) { mention = !!on; const m = $('ouv-mention'); if (m && m.textContent) m.hidden = !mention; return mention; },
    dictee(on) { const b = $('ouv-dicter'); if (b) { b.setAttribute('aria-pressed', String(!!on)); b.textContent = on ? 'J\'écoute' : 'Micro'; } },
    envoyer: t => { txt.value = t; envoyer(t); },
    ouvert: () => !fini && !racine.hidden
  };
}
