// Ouverture de démo : « Quel monde veux-tu filmer ? ». Une demande qui correspond à une préparation enregistrée
// (ouvertures/*.json : requêtes, sources, constats réellement faits) est rejouée en accéléré pendant que le moteur compile et
// rend le lieu derrière ; une autre demande part dans la vraie chaîne du constructeur (atelier.js), en temps réel.
// Rien n'est inventé : le rejeu ne montre que le journal enregistré, et la traduction et le contrôle sont calculés sur la
// fiche embarquée au moment même. La mention « rejeu accéléré » est un réglage, allumé par défaut (docs/ouverture.md, W3).
// En direct (briefs/conception-v2.md, W1, W2, W5) : une demande sans rejeu part dans le studio de conception (core/studio.js) ;
// le journal défilant, le réseau d'agents et le panneau du langage sont alors tirés de ses événements de création, un à un :
// qui travaille, ce qui a été trouvé, quelles lignes viennent d'être écrites. Aucun nœud sans agent réel derrière.
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

/* PDL, « Procedural Diaphasic Language » : la fiche réelle et les réglages réels du personnage, transcrits en notation serrée
   (une ligne par idée). C'est un affichage : le moteur lit la fiche JSON, pas cette notation (docs/ouverture.md).
   Rend { lignes, donnees (le même contenu, en objet), tokens, json, gain } ; tokens ≈ caractères / 4, sur les deux textes. */
export function pdl(f, perso, lieu, enc) {
  const n = x => typeof x === 'number' ? String(+x.toFixed(3)).replace(/^(-?)0\./, '$1.') : String(x);
  const mot = x => String(x).split(',')[0].trim().replace(/\s+/g, '.');
  const L = [], D = {}, ajoute = (cle, val, ligne) => { D[cle] = val; L.push(ligne); };
  const a = f.ambiance || {}, so = a.soleil || {}, fo = f.foret || {}, co = lieu && lieu.coordonnees;
  const kit = f.kit === 'dunes' ? 'dunes' : f.kit === 'nu' || (!f.kit && Array.isArray(f.semis)) ? 'nu' : 'foret';
  const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  const mois = MOIS.find(m => (f.inspiration || '').toLowerCase().includes(m));
  ajoute('lieu', { kit, rochers: kit === 'foret' ? fo.rochers ?? 1 : undefined, coordonnees: co, saison: a.saison || 'automne', mois, soleil: { hauteur: so.hauteur, azimut: so.azimut } },
    `@lieu ${kit}${kit === 'foret' && (fo.rochers ?? 1) ? '.gres' : ''}${co ? ` ${n(co[0])}N ${n(co[1])}E` : ''} · ${a.saison || 'automne'}${mois ? '.' + mois.slice(0, 3) : ''}${so.hauteur !== undefined ? ` · ☼${n(so.hauteur)}° az${n(so.azimut)}` : ''}`);
  const R = f.relief;
  if (R) ajoute('relief', R, `~relief ondul ${n(R.amplitude ?? .8)}m/${n(R.echelle ?? 150)}m${R.bosses ? ` · bosses ${n(R.bosses.hauteur)}m/${n(R.bosses.echelle)}m` : ''}${R.buttes ? ` · buttes ${n(R.buttes.hauteur)}m/${n(R.buttes.echelle)}m part${n(R.buttes.part)}` : ''}`);
  const T = f.trajet, pa = f.parcours || {};
  if (T) ajoute('trajet', Object.assign({ type: pa.type, pas: pa.pas }, T), `~trajet ${pa.type || 'sentier'} l${n(T.largeur ?? 1.5)} sinu${n(T.sinuosite ?? 1)}${T.creux !== undefined ? ' creux' + n(T.creux) : ''}${T.bord ? ' bord:' + T.bord : ''}${pa.pas ? ' pas' + n(pa.pas) : ''}`);
  if (kit === 'foret') {
    const H = fo.houppiers || {}, esp = o => Object.values(o || {}).map(h => ({ nom: h.nom, hauteur: h.hauteur, largeur: h.largeur }));
    const txt = l => l.map(h => `${mot(h.nom)} h${(h.hauteur || []).map(n).join('-')} l${n(h.largeur)}`).join(' | ');
    const ar = esp(H.arbres), pe = esp(H.perches);
    ajoute('arbres', { densite: fo.densite ?? .7, especes: ar }, `+arbres d${n(fo.densite ?? .7)}${ar.length ? ' · ' + txt(ar) : ''}`);
    ajoute('perches', { part: fo.perches ?? 1, especes: pe }, `+perches ${n(fo.perches ?? 1)}${pe.length ? ' · ' + txt(pe) : ''}`);
    const tr = fo.trouee;
    ajoute('gres', { rochers: fo.rochers ?? 1, feuillage: fo.feuillage ?? 1, trouee: tr }, `+gres ${n(fo.rochers ?? 1)} · feuillage ${n(fo.feuillage ?? 1)}${tr ? ` · trouee→${tr.vers} ${n(tr.longueur)}×${n(tr.largeur)}` : ''}`);
  }
  (f.semis || []).forEach((x, i) => ajoute('semis' + i, { id: x.id, nom: x.nom, cellule: x.cellule, densite: x.densite, formes: (x.formes || []).length },
    `+${x.id || 'semis'} ${(x.cellule || []).map(n).join('×')} d${n(x.densite ?? 1)} ×${(x.formes || []).length}f`));
  const S = f.surfaces;
  if (S) {
    const v = x => typeof x === 'object' ? `${x.a}/${x.b} ${n(x.part)}` : x;
    ajoute('surfaces', S, `%${Object.entries(S).map(([k, x]) => k + ' ' + v(x)).join(' · ')}`);
  }
  ajoute('air', { meteo: a.meteo, brume: a.brume, brume_basse: a.brume_basse, trouble: a.atmosphere && a.atmosphere.trouble },
    `☁${a.meteo || 'clair'}${a.brume !== undefined ? ' · brume ' + n(a.brume) : ''}${a.brume_basse ? ` · brume.sol ${n(a.brume_basse.densite)}/${n(a.brume_basse.hauteur)}m` : ''}${a.atmosphere && a.atmosphere.trouble !== undefined ? ' · trouble ' + n(a.atmosphere.trouble) : ''}`);
  const c = f.camera || {};
  ajoute('camera', { profil: c.profil, hauteur: c.hauteur || 1.36, champ: c.champ || 125 }, `◎cam ${c.profil || 'bodycam'} ${n(c.hauteur || 1.36)}m ${n(c.champ || 125)}°`);
  const P = perso;
  if (P) {
    const id = P.id || 'perso', j = x => [].concat(x || []).join(',');
    ajoute('personnage', P, `#${id} ${P.genre || ''}${P.age || ''} ${P.pays || ''}${P.annee || ''}${P.seule ? ' seule' : ''}${P.metier ? ' · ' + P.metier : ''} · ton:${j(P.ton)} · peur:${P.peur ?? 0}`);
    if (P.vocabulaire || P.humour) L.push(`#${id}.voix ${P.vocabulaire || ''}${P.humour ? ' · humour:' + P.humour : ''}`);
    if (P.sait) L.push(`#${id}.sait ${j(P.sait)}`);
    if (P.tenue || P.poches) L.push(`#${id}.porte ${[].concat(P.tenue || []).join('+')}${P.poches ? ' · poches:' + j(P.poches) : ''}`);
    if (P.camera) L.push(`#${id}.cam ${P.camera}`);
  }
  const json = Math.ceil(JSON.stringify(D).length / 4);
  if (enc && enc.trames) {                                 // le flux de jetons (src/pdl.js) : un token par jeton, en-tête et somme
    const E = enc.trames(D);
    return { lignes: E.trames.map(t => t.texte), trames: E.trames, donnees: D, tokens: E.tokens, json, gain: Math.round(100 * (1 - E.tokens / json)) };
  }
  const tokens = Math.ceil(L.join('\n').length / 4);
  return { lignes: L, donnees: D, tokens, json, gain: Math.round(100 * (1 - tokens / json)) };
}

/* Le programme du rejeu : une suite d'événements datés (secondes), aux durées un peu irrégulières comme en direct.
   Les durées de chaque étape viennent du journal ; chaque élément reçoit sa part, tirée au hasard (±40 %).
   Les requêtes partent en rafale (petite part chacune) ; sources et constats défilent tous (compteurs), mais seuls quelques-uns
   s'affichent (« montre ») : 3 sources, les constats marqués « vitrine ». */
export function programme(r, f, hasard = Math.random, controle = null, enc = null) {
  const ev = [], jit = (d, k = .4) => d * (1 - k + 2 * k * hasard());
  let t = 0;
  const POIDS = { requete: .22, source: 1, constat: 1, pdl: 1, valeur: 1, controle: 1, bilan: .6 };
  const etape = (id, titre, duree, items, rendre, opts = {}) => {
    ev.push({ t, type: 'etape', id, titre, apport: opts.apport || '', replie: !!opts.replie });
    t += jit(.3, .5);
    const L = items.map(rendre), n = L.length, poids = L.map(x => (POIDS[x.genre] || 1) * (.4 + hasard() * 1.2)), somme = poids.reduce((a, b) => a + b, 0) || 1;
    L.forEach((x, i) => { ev.push(Object.assign({ t, type: 'ligne', etape: id, i, n }, x)); t += jit(duree) * poids[i] / somme; });
    ev.push({ t, type: 'fin-etape', id }); t += jit(.25, .6);
  };
  const vitrine = l => { const v = l.some(c => c.vitrine); return (c, i) => v ? !!c.vitrine : i < 4; };
  ev.push({ t: 0, type: 'pense', texte: r.comprendre.texte, reperes: r.comprendre.reperes || [] });
  t = jit(r.comprendre.duree, .2);
  const recherche = (rq, sources) => [...rq.map(q => ['q', q]), ...sources.map((s, i) => ['s', s, i])];
  const rendreRech = ([k, x, i]) => k === 'q' ? { genre: 'requete', texte: x }
    : { genre: 'source', texte: x.titre, domaine: x.domaine, etat: x.etat, pourquoi: x.pourquoi || '', montre: i < 6 };
  etape('recherche', 'Le lieu · recherche', r.recherche.duree + r.lecture.duree, recherche(r.recherche.requetes, r.lecture.sources), rendreRech, { apport: r.recherche.apport });
  const V = r.vignettes && Array.isArray(r.vignettes.photos) && r.vignettes.photos.length ? r.vignettes : null;
  if (V) {
    // Photos du lieu (Wikimedia Commons) : les vignettes arrivent par rafales, 80 à 200 ms d'écart, chacune « en lecture » un
    // court instant avant que son observation (ou « hors sujet ») ne s'écrive. Environ 3 s en tout.
    ev.push({ t, type: 'etape', id: 'photos', titre: 'Le lieu · photos', apport: V.apport || 'Les photos montrent ce que les textes oublient : la couleur du sable, la mousse sur les blocs, la lumière. Une photo gardée appuie un réglage.' });
    t += jit(.25, .5);
    const rq = V.requetes || [], nm = Math.min(rq.length, V.requetesMontrees ?? rq.length);
    rq.slice(0, nm).forEach(q => { ev.push({ t, type: 'ligne', etape: 'photos', genre: 'requete', texte: q, ou: 'Commons' }); t += jit(.08, .4); });
    if (rq.length > nm) { ev.push({ t, type: 'ligne', etape: 'photos', genre: 'requete', texte: `… et ${rq.length - nm} autres`, ou: 'Commons' }); t += jit(.08, .4); }
    let fin = t;
    V.photos.forEach((p, i) => {
      ev.push({ t, type: 'ligne', etape: 'photos', genre: 'photo', photo: p.id, garde: !p.ecartee });
      const lu = t + jit(p.ecartee ? .3 : .48, .35);
      ev.push({ t: lu, type: 'photo-lue', etape: 'photos', photo: p.id, garde: !p.ecartee });
      fin = Math.max(fin, lu + (p.ecartee ? .15 : .4));
      t += .08 + .12 * hasard();
      if (i % 4 === 3) t += jit(.22, .4);                  // une petite pause entre deux rafales
    });
    t = Math.max(t, fin);
    ev.push({ t, type: 'fin-etape', id: 'photos' }); t += jit(.15, .5);
  }
  const vl = vitrine(r.constats.liste);
  etape('constats', 'Le lieu · ce que j\'en retiens', r.constats.duree, r.constats.liste, (c, i) => ({ genre: 'constat', texte: c.texte, source: c.source, reglage: c.reglage, photo: c.photo || null, montre: vl(c, i) }), { apport: r.constats.apport });
  const P = r.personnage;
  if (P) {
    etape('personnage', 'Le personnage · recherche', P.duree, recherche(P.requetes, P.sources), rendreRech, { apport: P.apport });
    const vp = vitrine(P.constats);
    etape('p-constats', 'Le personnage · ce que j\'en retiens', P.constats_duree, P.constats, (c, i) => ({ genre: 'constat', texte: c.texte, source: c.source, reglage: c.reglage, montre: vp(c, i) }), { apport: P.constats_apport });
  }
  const X = pdl(f, P && P.reglages, r.comprendre, enc);
  let cumul = 0;
  const lignesPdl = X.trames ? X.trames.map(tr => { cumul += tr.n + 1; return { genre: 'pdl', texte: tr.texte, trame: tr, tok: Math.min(cumul, X.tokens) }; })
    : X.lignes.map(l => { cumul += Math.ceil((l.length + 1) / 4); return { genre: 'pdl', texte: l, tok: Math.min(cumul, X.tokens) }; });
  lignesPdl.push({ genre: 'bilan', texte: `${X.tokens} tokens · même contenu en JSON : ${X.json} · −${X.gain} %`, tok: X.tokens, json: X.json, gain: X.gain });
  const pd = r.pdl || {};
  etape('pdl', 'Écriture en PDL', pd.duree ?? r.traduction.duree, lignesPdl, x => x, { apport: pd.apport || 'PDL, « Procedural Diaphasic Language » : le langage intermédiaire des modèles. La fiche et le personnage deviennent un flux de jetons que des traducteurs temps réel convertissent pour le moteur.' });
  const lignes = controle ? (controle.lignes.length ? controle.lignes.filter(l => l.niveau !== 'info').slice(0, 3).map(l => (l.niveau === 'erreur' ? 'erreur : ' : 'à noter : ') + l.texte) : []) : [];
  etape('controle', 'Contrôle', r.controle.duree, [r.controle.texte, ...lignes, controle ? (controle.ok ? 'passage libre, rien de bloquant' : 'des erreurs : voir le constat') : 'contrôle indisponible'], x => ({ genre: 'controle', texte: x }), { apport: r.controle.apport });
  if (V) ev.push({ t, type: 'credits' });                  // le détail des crédits des photos, en fin de rejeu
  ev.push({ t, type: 'monde' });
  t += r.fondu.duree;
  ev.push({ t, type: 'fin' });
  return ev.sort((a, b) => a.t - b.t);                     // les lectures de photos se chevauchent : tri stable par date
}

/* ------------------------------------------------------------------ interface (DOM)
   deps : { rejeux, fiches, C (constructeur), appliquer(fiche), pret(timeoutMs) → Promise, attendreGPU(),
            construire(texte) (vraie chaîne), mention (bool), dicteeDispo (Promise<bool>), dicter(el), arreterDictee(),
            surDebut(texte, rejeu), surFin(fiche), etat() → texte de l'étape en cours, hasard,
            studio(texte, surEvenement) → Promise du résultat, ou null (studio éteint) ; studioData (src/studio.json) } */
const MOTEUR = ['image', 'audio', 'story'];
const LARGE = '(min-width: 1000px) and (min-aspect-ratio: 5/4)';   // démo sur PC : planche de photos à côté du journal
export function creerOuverture(deps) {
  const d = document, $ = id => d.getElementById(id);
  const racine = d.createElement('section');
  racine.id = 'ouverture'; racine.className = 'ouv'; racine.setAttribute('aria-labelledby', 'ouv-q'); racine.hidden = true;
  racine.innerHTML = `<div class="ouv-cadre">
  <header class="ouv-marque">
    <p class="ouv-surtitre"><span class="ouv-pt"></span>REC · prototype</p>
    <p class="ouv-nom">BODYCAM<br><span>STORIES</span></p>
    <p class="ouv-concept">From prompt to multimodal procedural generation</p>
    <p class="ouv-expl">Un <b>moteur de jeu génératif</b>. Rien n'est programmé d'avance&nbsp;: tu demandes n'importe quoi, l'IA l'improvise et le moteur le rend, à l'image, au son et dans l'histoire.</p>
    <ol class="ouv-chaine" aria-label="Du texte au jeu">
      <li><svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 5h16v11H10l-4 4v-4H4z"/><path d="M8 9h5"/><path d="M8 12.5h8"/></svg><b>Prompt</b><i>tu dis ce que tu veux</i></li>
      <li class="ouv-fl" aria-hidden="true">→</li>
      <li><svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/></svg><b>IA</b><i>elle improvise, sans script</i></li>
      <li class="ouv-fl" aria-hidden="true">→</li>
      <li><svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 8V5h3M21 8V5h-3M3 16v3h3M21 16v3h-3"/><path d="M6 16l4-6 3 4 2-2.5 3 4.5"/><circle cx="16.5" cy="8.5" r="1.3"/></svg><b>Image</b><i>générée par code, en direct</i></li>
      <li class="ouv-fl ouv-plus" aria-hidden="true">+</li>
      <li><svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12v0M7.5 9v6M11 6v12M14.5 9.5v5M18 7.5v9M21 11v2"/></svg><b>Son</b><i>voix et bruitages</i></li>
      <li class="ouv-fl ouv-plus" aria-hidden="true">+</li>
      <li><svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 4h10l4 4v12H5z"/><path d="M15 4v4h4"/><path d="M8.5 12h7M8.5 15.5h5"/></svg><b>Histoire</b><i>elle s'écrit pendant que tu joues</i></li>
    </ol>
  </header>
  <p class="ouv-sur"><span class="ouv-pt"></span>CAM 07 · nouveau tournage</p>
  <h1 id="ouv-q" class="ouv-q">Quel monde veux-tu filmer ?</h1>
  <form id="ouv-form" class="ouv-form" autocomplete="off">
    <label class="ouv-vh" for="ouv-txt">Décris le monde</label>
    <textarea id="ouv-txt" rows="2" maxlength="900" enterkeyhint="send" placeholder="Un lieu, une saison, une heure…"></textarea>
    <div class="ouv-actions"><button type="button" id="ouv-dicter" class="ghost" hidden aria-pressed="false">Micro</button><button type="submit" id="ouv-go">Filmer</button></div>
  </form>
  <div class="ouv-sugg"><button type="button" id="ouv-sugg" class="ouv-chip">Prompt démo</button></div>
  <div id="ouv-demande" class="ouv-demande" hidden></div>
  <div id="ouv-pense" class="ouv-pense" hidden></div>
  <ol id="ouv-log" class="ouv-log" aria-live="polite"></ol>
  <p id="ouv-mention" class="ouv-mention" hidden></p>
</div>
<button type="button" id="ouv-passer" class="ghost ouv-passer">Passer</button>`;
  d.body.appendChild(racine);
  // L'intro : un faux cadre vidéo (REC, minutage, viseur, neige) et un bouton « Launch » ; noir, blanc, rouge. Le clic sert aussi
  // de premier geste (son), puis une coupure de signal amène l'accueil.
  const intro = d.createElement('div'); intro.className = 'ouv-intro'; intro.id = 'ouv-intro';
  intro.innerHTML = `<div class="ouv-ecran">
    <div class="ouv-neige" aria-hidden="true"></div><div class="ouv-lignes" aria-hidden="true"></div>
    <div class="ouv-hud ouv-hg"><span class="ouv-pt"></span>REC <span id="ouv-tc">00:00:00:00</span></div>
    <div class="ouv-hud ouv-hd">CAM 07 · 1080p · 30 i/s</div>
    <div class="ouv-hud ouv-bg">SIGNAL · EN ATTENTE</div>
    <div class="ouv-hud ouv-bd"><span class="ouv-bat"><i></i></span> 82 %</div>
    <div class="ouv-mire" aria-hidden="true"></div>
    <div class="ouv-centre">
      <p class="ouv-i-nom">BODYCAM<br><span>STORIES</span></p>
      <p class="ouv-i-sous">From prompt to multimodal procedural generation</p>
      <button type="button" id="ouv-launch" class="ouv-launch"><span class="ouv-pt"></span>Launch</button>
    </div>
  </div><div class="ouv-coupe" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i></div>`;
  racine.appendChild(intro);
  { const t0 = Date.now(), tc = $('ouv-tc'), z = n => String(n).padStart(2, '0');
    const iv = setInterval(() => { if (!intro.isConnected) { clearInterval(iv); return; } const ms = Date.now() - t0, s = Math.floor(ms / 1000);
      tc.textContent = z(Math.floor(s / 3600)) + ':' + z(Math.floor(s / 60) % 60) + ':' + z(s % 60) + ':' + z(Math.floor(ms % 1000 / 33.4)); }, 67);
    const lancer = () => { if (intro.classList.contains('ouv-part')) return; intro.classList.add('ouv-part'); racine.classList.add('ouv-arrive');
      try { deps.surLancement && deps.surLancement(); } catch (_) {}
      setTimeout(() => { intro.remove(); racine.classList.remove('ouv-arrive'); try { $('ouv-txt').focus({ preventScroll: true }); } catch (_) {} }, 1150); };
    $('ouv-launch').onclick = lancer;
    intro.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); lancer(); } }); }
  const txt = $('ouv-txt'), log = $('ouv-log'), rejeux = deps.rejeux || [];
  const sugg = (rejeux.find(r => r.suggestion) || {}).suggestion || '';
  $('ouv-sugg').parentNode.hidden = !sugg;                 // le bouton « Prompt démo » écrit la demande dans le champ ; elle n'est pas affichée d'avance
  let mention = !!deps.mention, timers = [], enCours = false, fini = false;

  function afficherMention(r) {
    const m = $('ouv-mention');
    m.hidden = !(mention && r);
    if (r) m.textContent = 'Rejeu accéléré d\'une génération enregistrée' + (r.enregistre ? ' le ' + r.enregistre.split('-').reverse().join('/') : '') + ' · recherche réelle, durées raccourcies';
  }
  $('ouv-sugg').onclick = () => {                       // la suggestion s'écrit dans le champ, comme tapée ; on garde la main pour envoyer
    if (enCours) return;
    txt.value = ''; let i = 0; const s = sugg;
    const grandir = () => { txt.style.height = 'auto'; txt.style.height = Math.min(txt.scrollHeight + 2, 260) + 'px'; };
    const tape = () => { i = Math.min(s.length, i + 1 + (Math.random() < 0.35 ? 1 : 0)); txt.value = s.slice(0, i); grandir(); if (i < s.length) timers.push(setTimeout(tape, 6 + 16 * Math.random())); else txt.focus(); };
    tape();
  };
  txt.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); $('ouv-form').requestSubmit(); } });
  Promise.resolve(deps.dicteeDispo).then(ok => { if (ok) $('ouv-dicter').hidden = false; }).catch(() => {});
  $('ouv-dicter').onclick = () => { if ($('ouv-dicter').getAttribute('aria-pressed') === 'true') deps.arreterDictee && deps.arreterDictee(); else deps.dicter && deps.dicter(txt); };
  $('ouv-form').addEventListener('submit', e => { e.preventDefault(); const t = txt.value.trim(); if (!t) { txt.focus(); return; } envoyer(t); });
  $('ouv-passer').onclick = () => terminer(null, true);
  $('ouv-passer').hidden = true;                          // pas de bouton visible (il trahirait le rejeu) : Échap passe l'ouverture
  d.addEventListener('keydown', function echap(e) { if (!racine.isConnected) { d.removeEventListener('keydown', echap); return; } if (e.key === 'Escape') terminer(null, true); });

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
    const vivant = deps.studio ? deps.studio(t, ev => surEvenement(ev)) : null;
    if (vivant) return vivre(vivant);
    // Pas de rejeu : la vraie chaîne du constructeur, en temps réel, suivie dans son chantier.
    $('ouv-pense').hidden = false; $('ouv-pense').textContent = 'Je prépare ce monde pour de vrai : compte quelques minutes. Tu peux suivre la fabrication.';
    timers.push(setTimeout(() => terminer(null, false, true), 2200));
  }

  function rejouer(r, f) {
    afficherMention(r);
    deps.appliquer(f);                                  // le moteur compile et rend derrière, pendant le rejeu
    let controle = null;
    try { controle = deps.C ? deps.C.controler(f, null, { recettes: deps.recettes }) : null; } catch (_) { controle = null; }
    const ev = programme(r, f, deps.hasard || Math.random, controle, deps.PDL || null);
    const blocs = {};
    // Les vignettes sont décodées tout de suite (img.decode), bien avant leur passage : rien ne se décode pendant la rafale.
    const V = r.vignettes && Array.isArray(r.vignettes.photos) ? r.vignettes : null;
    if (V) {
      blocs.vg = {};
      for (const p of V.photos) {
        const im = new Image(); im.alt = p.titre || ''; im.decoding = 'async'; im.src = p.donnees || '';
        if (im.decode) im.decode().catch(() => {});
        blocs.vg[p.id] = { p, im };
      }
      blocs.V = V;
      blocs.large = !!(window.matchMedia && matchMedia(LARGE).matches);
      if (blocs.large) racine.classList.add('ouv-large');   // colonne des photos réservée dès le début : pas de saut de mise en page
    }
    if (blocs.large) {                                    // colonne de droite : le réseau d'agents, puis la mosaïque de photos dessous
      blocs.droite = d.createElement('div'); blocs.droite.className = 'ouv-droite';
      racine.querySelector('.ouv-cadre').appendChild(blocs.droite);
      blocs.res = creerReseau(blocs.droite);
    }
    for (const e of ev) timers.push(setTimeout(() => jouer(e, blocs), e.t * 1000));
  }

  function jouer(e, blocs) {
    if (fini) return;
    if (e.type === 'pense') { const p = $('ouv-pense'); p.hidden = false; p.textContent = e.texte;
      if (e.reperes && e.reperes.length) { const u = d.createElement('span'); u.className = 'ouv-reperes'; u.innerHTML = e.reperes.map(x => `<i>${esc(x)}</i>`).join(''); p.appendChild(u); }
      return; }
    if (e.type === 'etape') {
      const x = li('ouv-etape en-cours' + (e.replie ? ' replie' : ''), `<div class="ouv-et"><span class="ouv-roue" aria-hidden="true"></span><span class="ouv-titre">${esc(e.titre)}</span><span class="ouv-compte"></span></div>${e.apport ? `<p class="ouv-apport">${esc(e.apport)}</p>` : ''}<span class="ouv-barre" aria-hidden="true"><i></i></span><ul class="ouv-items"></ul>`);
      blocs[e.id] = { x, ul: x.querySelector('.ouv-items'), n: 0, cpt: {}, lus: 0, queue: {} };
      if (blocs.res) reseauEtape(blocs.res, e.id, blocs);
      return;
    }
    const b = blocs[e.etape || e.id];
    if (e.type === 'ligne' && e.genre === 'photo' && b) { vignette(e, b, blocs); return; }
    if (e.type === 'photo-lue') { vignetteLue(e, blocs); return; }
    if (e.type === 'credits') { credits(blocs); return; }
    if (e.type === 'ligne' && b) {
      if (blocs.res) reseauLigne(blocs.res, e);
      if (e.n) b.x.querySelector('.ouv-barre i').style.transform = `scaleX(${((e.i + 1) / e.n).toFixed(3)})`;
      if (e.etape !== 'photos' && (e.genre === 'requete' || e.genre === 'source' || e.genre === 'constat')) {
        b.cpt[e.genre] = (b.cpt[e.genre] || 0) + 1; if (e.genre === 'source' && e.etat === 'lu') b.lus++;
        const NOM = { requete: 'requête', source: 'source', constat: 'constat' }, pl = (k, v) => v + ' ' + NOM[k] + (v > 1 ? 's' : '');
        b.x.querySelector('.ouv-compte').textContent = Object.entries(b.cpt).map(([k, v]) => pl(k, v) + (k === 'source' ? ` (${b.lus} lues)` : '')).join(' · ');
        if (e.genre !== 'requete' && !e.montre) {          // pas affichée : le compteur monte, une ligne « +N » la résume
          let q = b.queue[e.genre]; if (!q) { q = b.queue[e.genre] = d.createElement('li'); q.className = 'ouv-it ouv-plus'; q.n = 0; b.ul.appendChild(q); }
          q.n++; q.textContent = `+${q.n} ${NOM[e.genre]}${q.n > 1 ? 's' : ''}`; return;
        }
      }
      const it = d.createElement('li'); it.className = 'ouv-it ouv-' + e.genre;
      if (e.genre === 'requete' && e.etape !== 'photos') {   // les requêtes partent en rafale : une grille serrée de puces
        if (!b.grille) { b.grille = d.createElement('li'); b.grille.className = 'ouv-it ouv-grille'; b.ul.insertBefore(b.grille, b.ul.firstChild); }
        const q = d.createElement('span'); q.className = 'ouv-q-puce'; q.textContent = e.texte; b.grille.appendChild(q); b.n++; return;
      }
      if (e.genre === 'pdl') {
        b.x.querySelector('.ouv-compte').textContent = e.tok + ' tokens'; b.n++;
        if (!e.trame) { it.innerHTML = ''; b.ul.appendChild(it); taper(it, e.texte); return; }
        // à gauche, la trame en ligne serrée ; à droite (PC), le panneau d'aperçu où elle s'écrit jeton par jeton
        it.classList.add('ouv-pdl-j'); b.ul.appendChild(it);
        const ap = blocs.apercu;
        ecrireTrame(ap ? ap.flux : it, e.trame, ap, blocs.res, ap ? it : null);
        it.scrollIntoView({ block: 'end', behavior: 'smooth' });
        return;
      }
      if (e.genre === 'bilan') {
        it.innerHTML = `<span class="ouv-k">PDL</span><b>${e.tok}</b> tokens <span class="ouv-k">· JSON</span>${e.json} <span class="ouv-gain">−${e.gain} %</span><span class="ouv-jauge"><i style="transform:scaleX(${(e.tok / e.json).toFixed(3)})"></i></span>`;
        b.ul.appendChild(it); b.x.querySelector('.ouv-compte').textContent = `${e.tok} tokens · −${e.gain} %`; it.scrollIntoView({ block: 'end', behavior: 'smooth' });
        if (blocs.apercu) blocs.apercu.fin = true, blocs.apercu.cpt.innerHTML = `<b>${e.tok}</b> PDL tokens · JSON ${e.json} · <span class="ouv-gain">−${e.gain} %</span>`;
        return;
      }
      if (e.genre === 'requete') it.innerHTML = `<span class="ouv-k">cherche${e.ou ? ' · ' + esc(e.ou) : ''}</span> ${esc(e.texte)}`;
      else if (e.genre === 'source') it.innerHTML = `<span class="ouv-dom">${esc(e.domaine)}</span> <span class="ouv-src">${esc(e.texte)}</span> <span class="ouv-etat ouv-${esc(e.etat)}">${esc(ETAT[e.etat] || e.etat)}${e.pourquoi ? ' · ' + esc(e.pourquoi) : ''}</span>`;
      else if (e.genre === 'constat') it.innerHTML = `<span class="ouv-c">${esc(e.texte)}</span><span class="ouv-r">→ ${esc(e.reglage)}</span>`;
      else if (e.genre === 'valeur') it.innerHTML = `<span class="ouv-k">${esc(e.cle)}</span> ${esc(e.texte)}`;
      else it.textContent = e.texte;
      const ph = e.genre === 'constat' && e.photo && blocs.vg && blocs.vg[e.photo];
      if (ph && !ph.p.ecartee) {                         // la photo qui appuie ce constat y reste épinglée
        const pin = ph.im.cloneNode(); pin.className = 'ouv-epingle'; pin.title = creditDe(ph.p); pin.alt = '';
        it.classList.add('avec-photo'); it.prepend(pin);
        if (ph.carte) ph.carte.classList.add('epinglee');
      }
      b.ul.appendChild(it); b.n++;
      for (const q of Object.values(b.queue)) b.ul.appendChild(q);   // le « +N » reste en bas de l'étape
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

  /* Vignettes de photos (ouvertures/photos/*.json) : une bande qui défile en transform, chaque carte un peu de travers,
     « en lecture » (cadre et balayage) puis son observation, ou grisée « hors sujet ». Animations en transform et opacity. */
  function taper(el, texte) { let i = 0; const pas = () => { if (fini) return; i = Math.min(texte.length, i + 4); el.textContent = texte.slice(0, i); if (i < texte.length) timers.push(setTimeout(pas, 14)); }; pas(); }

  /* Réseau d'agents (colonne de droite, PC) : une mise en scène de la répartition du travail entre modèles — Haiku tirent les
     requêtes une à une, Sonnet récupèrent les sources et en tirent les constats, des traducteurs instantanés (petits modèles
     très rapides, « JEV » dans nos notes : dLLM, modèles de langage à diffusion) passent chaque constat en langage
     intermédiaire, Opus écrivent le PDL, que le moteur rend (image, son, histoire). Il ne mesure rien de ce qui tourne :
     une seule horloge, celle du rejeu ; chaque impulsion suit une ligne écrite à gauche (ou un paquet de jetons de PDL).
     Toute impulsion passe par rayon() : l'émetteur s'allume en rouge avant le départ et pendant l'émission, le récepteur
     clignote en vert à l'arrivée puis reste vert doux le temps de traiter, puis « terminé » (gris clair, jamais noir). */
  const NS = 'http://www.w3.org/2000/svg';
  const motCle = t => (String(t).split(/\s+/).find(w => w.length > 3) || String(t)).slice(0, 14);
  const trad = j => j.s + ' = ' + j.cle + ' : ' + j.val;
  function creerReseau(hote) {
    const W = 520, H = 322, rang = (n, y, m) => Array.from({ length: n }, (_, i) => ({ x: m + (W - 2 * m) * (n > 1 ? i / (n - 1) : .5), y }));
    const R = { h: rang(15, 42, 78), s: rang(5, 106, 120), t: rang(4, 158, 170), o: rang(2, 214, 220), m: rang(3, 292, 170),
      n: { q: 0, s: 0, t: 0 }, kq: 0, ks: 0, kc: 0, kt: 0, flux: [], ar: {} };
    const el = d.createElement('div'); el.className = 'ouv-reseau';
    const lignes = [], ligne = (a, b, cle) => { lignes.push([a, b, cle]); };
    R.h.forEach((p, i) => ligne(p, R.s[i % 5], 'h' + i + 's' + (i % 5)));
    R.s.forEach((p, i) => ligne(p, R.t[i % 4], 's' + i + 't' + (i % 4)));
    R.t.forEach((p, k) => R.o.forEach((q, j) => ligne(p, q, 't' + k + 'o' + j)));
    R.o.forEach((p, j) => R.m.forEach((q, k) => ligne(p, q, 'o' + j + 'm' + k)));
    let svg = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" aria-hidden="true"><g class="ouv-ar">`;
    R.h.forEach(p => { svg += `<line class="web" x1="${p.x}" y1="${p.y - 8}" x2="${p.x}" y2="6"/>`; });
    lignes.forEach(([a, b]) => { svg += `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"/>`; });
    svg += '</g><g class="ouv-chaud">';
    lignes.forEach(([a, b, k]) => { svg += `<line data-k="${k}" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"/>`; });
    svg += '</g>';
    const noeud = (p, r, cls) => `<circle class="ouv-nd ${cls}" cx="${p.x}" cy="${p.y}" r="${r}" style="transform-origin:${p.x}px ${p.y}px"/>`;
    const mc = (p, r, cls) => `<text class="ouv-mc ${cls}" x="${p.x}" y="${p.y + r + 11}" text-anchor="middle"></text>`;
    R.h.forEach(p => svg += noeud(p, 6, 'h')); R.s.forEach(p => svg += noeud(p, 10, 's') + mc(p, 10, 's'));
    R.t.forEach(p => svg += noeud(p, 5, 't') + mc(p, 5, 't')); R.o.forEach(p => svg += noeud(p, 14, 'o') + mc(p, 14, 'o'));
    R.m.forEach((p, i) => svg += `<rect class="ouv-nd m" x="${p.x - 9}" y="${p.y - 9}" width="18" height="18" rx="2" style="transform-origin:${p.x}px ${p.y}px"/><text class="ouv-mn" x="${p.x + 15}" y="${p.y + 4}">${MOTEUR[i]}</text>`);
    svg += `<text x="4" y="10">web</text><text x="4" y="46">haiku × 15</text><text x="4" y="110">sonnet × 5</text>`
      + `<text x="4" y="156" class="ouv-tr">JEV × 4</text><text x="4" y="168" class="ouv-tr2">dLLM · instant</text><text x="4" y="218">opus × 2</text>`
      + `<text x="4" y="296">engine</text><g class="ouv-imp"></g><g class="ouv-eti"></g></svg>`;
    el.innerHTML = `<p class="ouv-planche-t">Agent network</p>${svg}<p class="ouv-leg"><span><i class="h"></i>research</span> · <span><i class="s"></i>analysis</span> · <span><i class="t"></i>instant translation</span> · <span><i class="o"></i>PDL writing</span> · <span><i class="em"></i>sends</span> <span><i class="re"></i>receives</span> <span><i class="fa"></i>done</span></p><p class="ouv-etat-r"></p>`;
    hote.appendChild(el);
    R.el = el; R.svg = el.querySelector('svg'); R.imp = el.querySelector('.ouv-imp'); R.eti = el.querySelector('.ouv-eti'); R.rc = el.querySelector('.ouv-etat-r');
    R.nd = { h: [...el.querySelectorAll('.ouv-nd.h')], s: [...el.querySelectorAll('.ouv-nd.s')], t: [...el.querySelectorAll('.ouv-nd.t')], o: [...el.querySelectorAll('.ouv-nd.o')], m: [...el.querySelectorAll('.ouv-nd.m')] };
    R.mc = { s: [...el.querySelectorAll('.ouv-mc.s')], t: [...el.querySelectorAll('.ouv-mc.t')], o: [...el.querySelectorAll('.ouv-mc.o')] };
    R.cn = { s: [0, 0, 0, 0, 0], t: [0, 0, 0, 0], o: [0, 0] };
    for (const x of el.querySelectorAll('.ouv-chaud line')) R.ar[x.dataset.k] = { el: x, n: 0 };
    R.cpt = () => {
      const now = performance.now(); R.flux = R.flux.filter(f => now - f[0] < 1500);
      const debit = Math.round(R.flux.reduce((a, f) => a + f[1], 0) / 1.5), actifs = R.svg.querySelectorAll('.ouv-nd.emet,.ouv-nd.recoit').length;
      R.rc.innerHTML = `<b>${debit}</b> tok/s · <b>${actifs}</b> active agents · ${R.n.q} queries · ${R.n.s} sources · ${R.n.t} PDL tokens`;
    };
    R.cpt();
    return R;
  }
  /* L'état d'un nœud : « emet » (rouge) et « recoit » (vert, clignote à l'arrivée) se posent pour ms (Infinity sans ms) et ne
     font que s'allonger ; ensuite reste « fait » (gris clair). */
  function poser(c, cls, ms) {
    if (!c) return;
    const k = '_' + cls, fin = ms ? performance.now() + ms : Infinity;
    if (cls === 'recoit') { c.classList.remove('flash'); c.getBoundingClientRect(); c.classList.add('flash'); }
    c.classList.add('fait');
    if (c.classList.contains(cls) && (c[k] || 0) >= fin) return;
    clearTimeout(c[k + 't']); c[k] = fin; c.classList.add(cls);
    if (ms) { c[k + 't'] = setTimeout(() => { c.classList.remove(cls); c[k] = 0; }, ms); timers.push(c[k + 't']); }
  }
  function finir(c) { if (!c) return; for (const cls of ['emet', 'recoit']) { clearTimeout(c['_' + cls + 't']); c['_' + cls] = 0; c.classList.remove(cls); } c.classList.add('fait'); }
  function impulsion(R, a, b, ms = 550, cls = '') {          // un point qui file le long d'une arête, en transform
    const c = d.createElementNS(NS, 'circle'); c.setAttribute('r', cls === 'g' ? '3.4' : '2.6'); c.setAttribute('cx', a.x); c.setAttribute('cy', a.y);
    if (cls) c.setAttribute('class', cls);
    c.style.transform = 'translate(0,0)'; c.style.transitionDuration = ms + 'ms'; R.imp.appendChild(c);
    requestAnimationFrame(() => requestAnimationFrame(() => { c.style.transform = `translate(${b.x - a.x}px,${b.y - a.y}px)`; c.style.opacity = '.25'; }));
    timers.push(setTimeout(() => c.remove(), ms + 100));
  }
  /* La seule façon de lancer une impulsion : de (rang a, n° ia) vers (rang b, n° ib) ; 'web' = hors du graphe, au-dessus d'un Haiku.
     Émetteur rouge dès le départ et pendant l'émission ; récepteur vert clignotant à l'arrivée, vert doux pendant garde ms. */
  function rayon(R, a, ia, b, ib, ms = 500, cls = '', garde = 900, puis) {
    const web = { x: R.h[a === 'web' ? ib : ia] ? R.h[a === 'web' ? ib : ia].x : 0, y: 6 };
    const ea = a === 'web' ? null : R.nd[a][ia], eb = b === 'web' ? null : R.nd[b][ib];
    poser(ea, 'emet', ms + 120);
    impulsion(R, a === 'web' ? web : R[a][ia], b === 'web' ? web : R[b][ib], ms, cls);
    if (ea && eb) trafic(R, a + ia + b + ib);
    timers.push(setTimeout(() => { poser(eb, 'recoit', garde); R.cpt(); if (puis) puis(); }, ms));
  }
  function trafic(R, k) { const a = R.ar[k]; if (!a) return; a.n++; a.el.style.opacity = Math.min(.85, .1 + a.n * .07).toFixed(2); }
  function etiquette(R, p, txt, dx = 9) {                   // une étiquette fugace : monte et s'efface (transform, opacity)
    const t = d.createElementNS(NS, 'text'); t.setAttribute('x', p.x + dx); t.setAttribute('y', p.y - 9); t.textContent = txt; R.eti.appendChild(t);
    timers.push(setTimeout(() => t.remove(), 1200));
  }
  function compte(R, rang, i, v) { R.cn[rang][i] += v; R.mc[rang][i].textContent = R.cn[rang][i]; }
  function debit(R, tok) { R.flux.push([performance.now(), tok]); }
  // Sonnet → JEV → Opus : le constat passe par un traducteur instantané (bref), qui le réémet vers un Opus
  function parJev(R, s, o, ms, cls, garde) {
    const t = s % 4;
    rayon(R, 's', s, 't', t, ms, cls, 260, () => { compte(R, 't', t, 1); rayon(R, 't', t, 'o', o, Math.round(ms * .6), cls, garde); });
  }
  function reseauEtape(R, id, blocs) {
    if (id === 'photos') R.el.classList.add('bandeau');      // les photos arrivent : le réseau se réduit en bandeau au-dessus
    if (id === 'pdl') {
      R.el.classList.remove('bandeau'); R.el.classList.add('pdl');
      // transmission groupée : tout ce que les Sonnet ont retenu part vers les Opus, par les traducteurs
      R.s.forEach((p, i) => R.o.forEach((q, j) => timers.push(setTimeout(() => parJev(R, i, j, 360, 'g', 2000), 70 * i + 40 * j))));
      timers.push(setTimeout(() => R.nd.o.forEach(c => poser(c, 'recoit')), 900));   // les Opus écrivent jusqu'au contrôle
      etiquette(R, R.o[0], 'context → opus', 18);
      if (blocs && blocs.planche) blocs.planche.classList.add('ouv-replie');   // les photos ont servi : place à l'aperçu du PDL
      if (blocs && blocs.droite && !blocs.apercu) blocs.apercu = creerApercu(blocs.droite);
    } else R.el.classList.remove('pdl');
    if (id === 'controle') {
      R.o.forEach((p, j) => R.m.forEach((q, k) => rayon(R, 'o', j, 'm', k, 420 + 90 * k, '', 1400)));
      timers.push(setTimeout(() => R.nd.o.forEach(finir), 900));
    }
    R.cpt();
  }
  function reseauLigne(R, e) {
    if (e.genre === 'requete' || e.genre === 'photo') {     // un Haiku tire la requête : aller vers le web, retour
      const i = R.kq++ % 15;
      rayon(R, 'h', i, 'web', i, 340, '', 0, () => rayon(R, 'web', 0, 'h', i, 340, '', 700));
      if (e.genre === 'requete') etiquette(R, R.h[i], motCle(e.texte));
      if (e.genre === 'requete' && e.etape !== 'photos') R.n.q++;
      debit(R, Math.ceil(String(e.texte || '').length / 4) + 6);
    } else if (e.genre === 'source') {                       // le résultat converge vers un Sonnet
      const i = R.ks++, h = i % 15, s = h % 5;
      rayon(R, 'h', h, 's', s, 480, '', 1500); compte(R, 's', s, 1); etiquette(R, R.s[s], '+1 source', 13);
      R.n.s++; debit(R, Math.ceil(String(e.texte || '').length / 4) + 40);
    } else if (e.genre === 'constat') {                      // un constat écrit à gauche = un Sonnet qui émet, via un JEV
      const s = R.kc++ % 5; parJev(R, s, s % 2, 320, '', 800);
      debit(R, Math.ceil(String(e.texte || '').length / 4));
    } else if (e.genre === 'pdl' && !e.trame) { const i = R.kt++ % 2; rayon(R, 'o', i, 'm', i % 3, 300, '', 500); if (e.tok) R.n.t = e.tok; }
    else if (e.genre === 'bilan') { etiquette(R, R.o[1], e.tok + ' tok', 18); R.n.t = e.tok; }
    R.cpt();
  }
  function reseauJeton(R, k, n) {                           // un paquet de jetons : un Opus l'écrit, le moteur le reçoit
    const o = k % 2, m = R.kt++ % 3;
    compte(R, 'o', o, n); rayon(R, 'o', o, 'm', m, 300, '', 600);
    if (k % 4 === 3) etiquette(R, R.o[o], n * 4 + ' tok', 18);
    R.n.t += n; debit(R, n * 4); R.cpt();
  }

  /* Aperçu du PDL (colonne de droite) : les trames s'écrivent jeton par jeton pendant que les Opus travaillent. */
  function creerApercu(hote) {
    const el = d.createElement('div'); el.className = 'ouv-apercu';
    el.innerHTML = '<p class="ouv-planche-t">PDL · intermediate language</p><div class="ouv-flux"></div><p class="ouv-pdl-leg"></p><p class="ouv-pdl-cpt"></p>';
    hote.appendChild(el);
    return { el, flux: el.querySelector('.ouv-flux'), leg: el.querySelector('.ouv-pdl-leg'), cpt: el.querySelector('.ouv-pdl-cpt'), n: 0 };
  }
  /* Une trame qui s'écrit : paquets de 1 à 3 jetons (réglés par la trame, pas de hasard), quelques jetons qui se corrigent,
     un curseur ; la ligne de légende traduit en clair les derniers jetons. gauche : la ligne serrée du journal, s'il y en a une. */
  function ecrireTrame(hote, tr, ap, R, gauche) {
    const bloc = d.createElement(ap ? 'div' : 'span'); bloc.className = 'ouv-trame'; hote.appendChild(bloc);
    const sp = (cls, t) => { const x = d.createElement('span'); x.className = cls; x.textContent = t; return x; };
    bloc.appendChild(sp('ouv-tj ent', tr.entete));
    const cur = sp('ouv-cur', ''); bloc.appendChild(cur);
    let leg = ap && ap.leg, cpt = ap && ap.cpt;
    if (!ap) { leg = sp('ouv-pdl-leg', ''); hote.appendChild(leg); }
    if (gauche) gauche.textContent = tr.entete;
    let i = 0, k = 0;
    const pas = () => {
      if (fini) return;
      const lot = tr.jetons.slice(i, i + 1 + (tr.jetons.length + i) % 3);
      for (const j of lot) {
        const x = sp('ouv-tj p' + j.poids, j.s); x.title = trad(j); bloc.insertBefore(x, cur);
        if ((i * 7 + tr.n) % 6 === 0 && j.s.length > 3) {    // le jeton « se corrige » : une valeur fausse, puis la bonne
          x.textContent = j.s.slice(0, -2) + '▖▝'; x.classList.add('faux');
          timers.push(setTimeout(() => { x.textContent = j.s; x.classList.remove('faux'); x.classList.add('corr'); }, 160));
        }
        if (gauche) gauche.textContent += ' ' + j.s;
        i++;
      }
      if (leg) leg.textContent = lot.slice(-2).map(trad).join('   ');
      if (ap) { ap.n += lot.length; cpt.textContent = ap.n + ' tokens'; }
      if (R) reseauJeton(R, k++, lot.length);
      if (i < tr.jetons.length) timers.push(setTimeout(pas, 45));
      else { bloc.insertBefore(sp('ouv-tj som', tr.somme), cur); cur.remove(); if (gauche) gauche.textContent += ' ' + tr.somme; if (ap) ap.flux.appendChild(sp('ouv-lien', '⇢')); }
    };
    pas();
  }

  const creditDe = p => `${p.titre} · ${p.auteur} · ${p.licence} · Wikimedia Commons · recadrée et réduite`;
  function vignette(e, b, blocs) {
    const ph = blocs.vg && blocs.vg[e.photo]; if (!ph) return;
    if (!b.bande) {
      // Fenêtre large et couchée (démo sur PC) : une planche à côté du journal, vignettes plus grandes en mosaïque ;
      // sinon (téléphone), une bande qui défile dans le journal.
      b.large = !!blocs.large;
      const it = d.createElement(b.large ? 'aside' : 'li'); it.className = b.large ? 'ouv-planche' : 'ouv-it ouv-photos';
      if (b.large) it.setAttribute('aria-label', 'Photos du lieu');
      const V = blocs.V, uniq = a => [...new Set(a)];
      it.innerHTML = `${b.large ? '<p class="ouv-planche-t">Photos du lieu · Wikimedia Commons</p>' : ''}<div class="ouv-bande"><div class="ouv-rail"></div></div><p class="ouv-credit">Photos : Wikimedia Commons, ${esc(uniq(V.photos.map(p => p.auteur.replace(/ \(.*$/, ''))).join(', '))} · ${esc(uniq(V.photos.map(p => p.licence)).join(', '))} · recadrées et réduites, détail en fin de rejeu</p>`;
      if (b.large) { (blocs.droite || racine.querySelector('.ouv-cadre')).appendChild(it); blocs.planche = it; }
      else b.ul.appendChild(it);
      b.bande = it.querySelector('.ouv-bande'); b.rail = it.querySelector('.ouv-rail'); b.nv = 0; b.largeur = 0;
      if (!b.large) it.scrollIntoView({ block: 'end', behavior: 'smooth' });
    }
    const c = d.createElement('figure'); c.className = 'ouv-vg lecture';
    c.style.setProperty('--r', ((e.garde ? 1 : -1) * (0.6 + 2.2 * ((b.nv * 0.618) % 1)) * (b.nv % 2 ? 1 : -1)).toFixed(2) + 'deg');
    c.title = creditDe(ph.p);
    c.innerHTML = '<div class="ouv-vg-img"></div><figcaption></figcaption>';
    c.firstChild.appendChild(ph.im);
    b.rail.appendChild(c); ph.carte = c; b.nv++;
    b.x.querySelector('.ouv-compte').textContent = b.nv + ' photo' + (b.nv > 1 ? 's' : '');
    if (b.large) return;                                // la mosaïque ne défile pas
    if (!b.pas) { b.pas = c.offsetWidth + 10; b.largeur = b.bande.clientWidth; }   // une seule lecture de mise en page
    const dx = Math.max(0, b.nv * b.pas - 10 - b.largeur);
    b.rail.style.transform = `translate3d(${-dx}px,0,0)`;
  }
  function vignetteLue(e, blocs) {
    const ph = blocs.vg && blocs.vg[e.photo]; if (!ph || !ph.carte) return;
    const c = ph.carte, cap = c.querySelector('figcaption');
    c.classList.remove('lecture'); c.classList.add(e.garde ? 'lue' : 'ecartee');
    const texte = e.garde ? ph.p.observation : 'hors sujet · ' + (ph.p.pourquoi || '');
    let i = 0; const pas = () => { if (fini) return; i = Math.min(texte.length, i + 3); cap.textContent = texte.slice(0, i); if (i < texte.length) timers.push(setTimeout(pas, 24)); };
    pas();
  }
  function credits(blocs) {
    if (!blocs.V) return;
    const it = d.createElement('li'); it.className = 'ouv-it ouv-credits';
    it.innerHTML = `<details><summary>Crédits des photos (${blocs.V.photos.length})</summary><ul>${blocs.V.photos.map(p =>
      `<li><a href="${esc(p.page)}" target="_blank" rel="noopener">${esc(p.titre)}</a> · ${esc(p.auteur)} · ${esc(p.licence)}, recadrée et réduite</li>`).join('')}</ul></details>`;
    const blocP = Object.values(blocs).find(x => x && x.bande);
    if (blocs.planche) { const p = d.createElement('div'); p.className = 'ouv-credits'; p.innerHTML = it.innerHTML; blocs.planche.appendChild(p); return; }
    (blocP ? blocP.ul : log).appendChild(it);
  }

  /* ------------------------------------------------------------------ en direct : le studio de conception (core/studio.js)
     Chaque événement de création (étape, agent, palier, instrument, genre, état, latence, lignes écrites) devient une ligne du
     journal à gauche ; à droite (PC), le réseau ne dessine que les agents qui ont vraiment été appelés, et le panneau du langage
     montre les lignes de source au moment où elles arrivent. */
  const V = { blocs: {}, on: false, n: { appels: 0, constats: 0, lignes: 0 }, ouverts: {}, finis: new Set(), vus: {} };
  const ETATS_FIN = ['done', 'failed', 'skipped', 'repaired', 'fallback'];
  const MOT = { failed: 'échec', skipped: 'ignorée', fallback: 'repli', repaired: 'réparée' };
  function vivre(promesse) {
    V.on = true; V.t0 = Date.now();
    const m = $('ouv-mention'); m.hidden = false; m.textContent = 'En direct · les agents du studio travaillent pour de vrai ; rien n\'est rejoué';
    $('ouv-pense').hidden = false; $('ouv-pense').textContent = 'Le studio lit la demande…';
    V.data = deps.studioData || { stages: [] };
    if (window.matchMedia && matchMedia(LARGE).matches) {
      racine.classList.add('ouv-large');
      V.blocs.droite = d.createElement('div'); V.blocs.droite.className = 'ouv-droite'; racine.querySelector('.ouv-cadre').appendChild(V.blocs.droite);
      V.res = creerReseauVivant(V.blocs.droite);
      V.apercu = creerApercu(V.blocs.droite); V.apercu.el.querySelector('.ouv-planche-t').textContent = 'Source · the lines as they are written';
    }
    promesse.then(r => {
      if (fini) return;
      const x = li('ouv-etape en-cours', `<div class="ouv-et"><span class="ouv-roue" aria-hidden="true"></span><span class="ouv-titre">Le monde se construit</span><span class="ouv-compte"></span></div>`);
      const c = x.querySelector('.ouv-compte'), suivi = setInterval(() => { if (deps.etat) c.textContent = deps.etat(); }, 200);
      if (!r) { clearInterval(suivi); c.textContent = 'le studio s\'est arrêté'; timers.push(setTimeout(() => terminer(null, false, false, true), 1600)); return; }
      Promise.resolve(deps.pret ? deps.pret(6000) : null).catch(() => {}).then(() => { clearInterval(suivi); c.textContent = ''; if (fini) return; x.classList.remove('en-cours'); x.classList.add('fait'); racine.classList.add('ouv-fondu');
        timers.push(setTimeout(() => terminer(null, false, false, true), 1400)); });
    }, () => { if (!fini) terminer(null, false, false, true); });
  }
  const etapeDe = id => ((V.data && V.data.stages) || []).find(s => s.id === id) || { id, title: {}, role: '' };
  function blocVivant(id) {
    if (V.blocs[id]) return V.blocs[id];
    const st = etapeDe(id), titre = (st.title || {}).fr || (st.title || {}).en || id;
    const x = li('ouv-etape en-cours', `<div class="ouv-et"><span class="ouv-roue" aria-hidden="true"></span><span class="ouv-titre">${esc(titre)}</span><span class="ouv-compte"></span></div><p class="ouv-apport">${esc(st.role || '')}${st.tier ? ' · ' + esc(st.tier) + (st.instrument ? ' · ' + esc(st.instrument) : '') : ''}</p><ul class="ouv-items"></ul>`);
    return (V.blocs[id] = { x, ul: x.querySelector('.ouv-items'), n: 0, cpt: {}, plus: null });
  }
  function itemVivant(b, cls, html) {
    const it = d.createElement('li'); it.className = 'ouv-it ' + cls; it.innerHTML = html;
    if (b.n >= 7 && !/ouv-fort/.test(cls)) {                      // au-delà de sept lignes : un compteur « +N »
      if (!b.plus) { b.plus = d.createElement('li'); b.plus.className = 'ouv-it ouv-plus'; b.plus.k = 0; b.ul.appendChild(b.plus); }
      b.plus.k++; b.plus.textContent = '+' + b.plus.k; return null;
    }
    b.ul.appendChild(it); b.n++; if (b.plus) b.ul.appendChild(b.plus);
    it.scrollIntoView({ block: 'end', behavior: 'smooth' }); return it;
  }
  function compteVivant(b) {
    const C = b.cpt, L = [];
    if (C.requete) L.push(C.requete + ' requête' + (C.requete > 1 ? 's' : ''));
    if (C.constat) L.push(C.constat + ' constat' + (C.constat > 1 ? 's' : ''));
    if (C.ligne) L.push(C.ligne + ' ligne' + (C.ligne > 1 ? 's' : ''));
    if (C.ms) L.push((C.ms / 1000).toFixed(1) + ' s');
    b.x.querySelector('.ouv-compte').textContent = L.join(' · ');
  }
  function lignesApercu(lignes, agent) {
    V.n.lignes += lignes.length;
    if (V.res) V.res.cpt();
    if (!V.apercu) return;
    for (const l of lignes) {
      const x = d.createElement('div'); x.className = 'ouv-trame'; x.innerHTML = `<span class="ouv-tj ent">${esc(agent)}</span>`;
      const t = d.createElement('span'); t.className = 'ouv-tj p2'; x.appendChild(t); V.apercu.flux.appendChild(x); taper(t, l);
    }
    while (V.apercu.flux.children.length > 40) V.apercu.flux.firstChild.remove();
    V.apercu.cpt.textContent = V.n.lignes + ' lines of source written';
  }
  function surEvenement(e) {
    if (fini || !V.on || !e || !e.stage) return;
    if (V.res) reseauVivant(V.res, e);
    const b = blocVivant(e.stage), appel = e.latency_ms !== undefined;
    if (e.status === 'pending') { V.ouverts[e.stage] = (V.ouverts[e.stage] || 0) + 1; V.n.appels++; }
    else if (appel && (e.status === 'done' || e.status === 'failed')) V.ouverts[e.stage] = Math.max(0, (V.ouverts[e.stage] || 0) - 1);
    if (appel) b.cpt.ms = (b.cpt.ms || 0) + e.latency_ms;
    if (e.status === 'writing') {
      b.cpt.ligne = (b.cpt.ligne || 0) + e.wrote.length; V.vus[e.agent] = true; lignesApercu(e.wrote, e.agent);
      if (!b.courante) b.courante = itemVivant(b, 'ouv-pdl-j ouv-fort', '');
      if (b.courante) b.courante.textContent = e.wrote[e.wrote.length - 1];
      compteVivant(b); return;
    }
    if (e.stage === 'understand' && e.status === 'done' && e.wrote) {
      const kv = Object.fromEntries(e.wrote.map(l => /^(\w+):\s*(.*)$/.exec(l)).filter(Boolean).map(m => [m[1], m[2]]));
      const p = $('ouv-pense'); p.textContent = [kv.where, kv.when, kv.who].filter(Boolean).join(' · ') || 'Demande lue.';
      const u = d.createElement('span'); u.className = 'ouv-reperes'; u.innerHTML = ['kind', 'player', 'powers'].filter(k => kv[k]).map(k => `<i>${esc(k + ' : ' + kv[k])}</i>`).join(''); p.appendChild(u);
    }
    if (e.kind === 'query' && e.text && !appel && (e.status === 'done' || (e.status === 'pending' && e.instrument === 'search'))) {
      if (!b.grille) { b.grille = d.createElement('li'); b.grille.className = 'ouv-it ouv-grille'; b.ul.insertBefore(b.grille, b.ul.firstChild); }
      const q = d.createElement('span'); q.className = 'ouv-q-puce'; q.textContent = (e.instrument === 'search' ? 'web · ' : '') + e.text; b.grille.appendChild(q);
      b.cpt.requete = (b.cpt.requete || 0) + 1;
    } else if (e.kind === 'finding' && e.status === 'done' && e.text && !appel) {
      V.n.constats++; b.cpt.constat = (b.cpt.constat || 0) + 1;
      itemVivant(b, 'ouv-constat', `<span class="ouv-c">${esc(e.text)}</span><span class="ouv-r">→ ${esc(e.supports || '')} · source : ${esc(e.source || '')}</span>`);
    } else if (e.kind === 'build' && e.status === 'step' && e.text) itemVivant(b, 'ouv-valeur', `<span class="ouv-k">${esc(e.step || 'étape')}</span> ${esc(e.text)}`);
    else if (e.kind === 'question' && e.status === 'done' && e.text && !appel) itemVivant(b, 'ouv-constat ouv-fort', `<span class="ouv-c">? ${esc(e.text)}</span><span class="ouv-r">→ à toi de répondre, à l'arrivée</span>`);
    else if (e.kind === 'check' && e.text && e.status !== 'pending') itemVivant(b, 'ouv-controle' + (e.status === 'done' ? '' : ' ouv-fort'), esc((e.status === 'done' ? '' : (MOT[e.status] || e.status) + ' : ') + e.text) + (e.wrote && e.status !== 'done' ? `<br><span class="ouv-k">${esc(e.wrote.slice(0, 3).join(' · '))}</span>` : ''));
    else if (appel && e.status === 'done' && e.wrote && e.wrote.length) {
      b.courante = null;
      if (!V.vus[e.agent] && e.kind !== 'finding') { lignesApercu(e.wrote.slice(0, 24), e.agent); b.cpt.ligne = (b.cpt.ligne || 0) + e.wrote.length; }
      if (e.kind !== 'finding') itemVivant(b, 'ouv-pdl-j', `<span class="ouv-k">${esc(e.agent)} · ${e.wrote.length} lignes · ${(e.latency_ms / 1000).toFixed(1)} s</span> ${esc(e.wrote.slice(0, 2).join('  '))}`);
    } else if (MOT[e.status] && e.text) itemVivant(b, 'ouv-controle ouv-fort', `<span class="ouv-k">${esc(e.agent)} · ${MOT[e.status]}</span> ${esc(e.text)}`);
    const fin = e.stage === 'check' ? (e.status === 'done' && /files/.test(e.text || '')) || e.status === 'fallback' : ETATS_FIN.includes(e.status) && !V.ouverts[e.stage];
    if (fin) { b.x.classList.remove('en-cours'); b.x.classList.add('fait'); V.finis.add(e.stage); }
    compteVivant(b);
  }
  /* Le réseau en direct : un nœud par agent réellement appelé, rangé par palier (fast, mid, large, code), relié aux agents des
     étapes qu'il lit (src/studio.json, after). Rouge tant qu'il travaille, vert à la réponse, gris ensuite ; pointillé rouge
     s'il a échoué. Un rang « web » n'apparaît que si une recherche a vraiment eu lieu ; le moteur reçoit le lieu construit. */
  function creerReseauVivant(hote) {
    const W = 520, H = 300, RANGS = { search: 26, fast: 78, mid: 140, large: 202, code: 262 };
    const el = d.createElement('div'); el.className = 'ouv-reseau ouv-vivant';
    el.innerHTML = `<p class="ouv-planche-t">Agent network · live</p><svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" aria-hidden="true"><g class="ouv-ar"></g><g class="ouv-nds"></g><g class="ouv-imp"></g><g class="ouv-eti"></g>`
      + `<text x="4" y="${RANGS.fast + 4}">fast</text><text x="4" y="${RANGS.mid + 4}">mid</text><text x="4" y="${RANGS.large + 4}">large</text><text x="4" y="${RANGS.code + 4}">code</text></svg>`
      + `<p class="ouv-leg"><span><i class="em"></i>working</span> <span><i class="re"></i>answered</span> <span><i class="fa"></i>done</span> · tiers by role, no model names</p><p class="ouv-etat-r"></p>`;
    hote.appendChild(el);
    const R = { el, svg: el.querySelector('svg'), ar: el.querySelector('.ouv-ar'), nds: el.querySelector('.ouv-nds'), imp: el.querySelector('.ouv-imp'), eti: el.querySelector('.ouv-eti'), rc: el.querySelector('.ouv-etat-r'),
      RANGS, nodes: {}, parRang: {}, aretes: {} };
    R.cpt = () => {
      const act = Object.values(R.nodes).filter(n => n.c.classList.contains('emet')).length;
      R.rc.innerHTML = `<b>${act}</b> active agent${act > 1 ? 's' : ''} · <b>${V.n.appels}</b> calls · ${V.n.constats} findings · ${V.n.lignes} lines written · ${Math.round((Date.now() - (V.t0 || Date.now())) / 1000)} s`;
    };
    R.cpt(); R.tic = setInterval(() => { if (fini || !el.isConnected) { clearInterval(R.tic); return; } R.cpt(); }, 1000);
    return R;
  }
  function noeudVivant(R, agent, rang, nom) {
    if (R.nodes[agent]) return R.nodes[agent];
    const k = (R.parRang[rang] = (R.parRang[rang] || 0) + 1) - 1, x = 92 + (k % 6) * 72, y = R.RANGS[rang] + (k >= 6 ? 14 : 0);
    const forme = d.createElementNS(NS, rang === 'code' ? 'rect' : 'circle');
    if (rang === 'code') { forme.setAttribute('x', x - 8); forme.setAttribute('y', y - 8); forme.setAttribute('width', 16); forme.setAttribute('height', 16); forme.setAttribute('rx', 2); }
    else { forme.setAttribute('cx', x); forme.setAttribute('cy', y); forme.setAttribute('r', rang === 'large' ? 12 : rang === 'mid' ? 9 : 6); }
    forme.setAttribute('class', 'ouv-nd ' + (rang === 'large' ? 'o' : rang === 'mid' ? 's' : rang === 'code' ? 'm' : 'h')); forme.style.transformOrigin = x + 'px ' + y + 'px';
    const t = d.createElementNS(NS, 'text'); t.setAttribute('x', x); t.setAttribute('y', y + 22); t.setAttribute('text-anchor', 'middle'); t.setAttribute('class', 'ouv-mc'); t.textContent = nom;
    R.nds.appendChild(forme); R.nds.appendChild(t);
    if (rang === 'search' && R.parRang.search === 1) { const tx = d.createElementNS(NS, 'text'); tx.setAttribute('x', 4); tx.setAttribute('y', R.RANGS.search + 4); tx.textContent = 'web'; R.nds.appendChild(tx); }
    return (R.nodes[agent] = { c: forme, x, y, agent });
  }
  function reseauVivant(R, e) {
    if (e.status === 'writing') return;                              // the lines go to the language panel; the node says its total at the end
    const rang = e.instrument === 'search' ? 'search' : e.tier === 'code' || e.instrument === 'code' ? 'code' : R.RANGS[e.tier] ? e.tier : 'mid';
    const nom = rang === 'search' ? 'search' : e.agent.replace(/^research\./, '').replace(/\.repair$/, ' ⟲');
    const n = noeudVivant(R, rang === 'search' ? 'web.' + e.agent : e.agent, rang, nom);
    if (e.status === 'pending') {
      poser(n.c, 'emet');
      for (const a of etapeDe(e.stage).after || []) for (const m of Object.values(R.nodes)) {   // ce que l'agent lit : les agents des étapes d'avant
        if (m === n || !(m.agent === a || m.agent.startsWith(a + '.') || (a === 'environment' && m.agent === 'builder'))) continue;
        const k = m.agent + '>' + n.agent;
        if (!R.aretes[k]) { const l = d.createElementNS(NS, 'line'); for (const [p, v] of [['x1', m.x], ['y1', m.y], ['x2', n.x], ['y2', n.y]]) l.setAttribute(p, v); R.ar.appendChild(l); R.aretes[k] = l; }
        impulsion(R, m, n, 520);
      }
    } else if (ETATS_FIN.includes(e.status) && (e.latency_ms !== undefined || e.status !== 'done')) {
      finir(n.c);
      if (e.status === 'failed' || e.status === 'fallback') n.c.classList.add('ko');
      else { poser(n.c, 'recoit', 900); if (e.wrote && e.wrote.length) etiquette(R, n, e.wrote.length + ' lines', 12); }
      if (e.agent === 'builder' && e.status === 'done') {             // le lieu construit part vers le moteur, qui le compile
        const m = noeudVivant(R, 'engine', 'code', 'engine'); impulsion(R, n, m, 600, 'g'); poser(m.c, 'recoit', 1500);
      }
    } else if (e.kind === 'finding' && e.text) etiquette(R, n, '+1 finding', 12);
    R.cpt();
  }

  function terminer(fiche, passe, constructeur, studio) {
    if (fini) return; fini = true;
    timers.forEach(clearTimeout); timers = [];
    racine.classList.add('ouv-fondu');
    setTimeout(() => { racine.hidden = true; racine.remove(); d.body.classList.remove('ouverture-on'); }, passe ? 300 : 900);
    if (deps.surFin) deps.surFin({ passe: !!passe, constructeur: !!constructeur, studio: !!studio || V.on, texte: $('ouv-demande').textContent });
  }

  return {
    ouvrir() { racine.hidden = false; d.body.classList.add('ouverture-on'); setTimeout(() => { try { ($('ouv-launch') || txt).focus({ preventScroll: true }); } catch (_) {} }, 60); },
    mention(on) { mention = !!on; const m = $('ouv-mention'); if (m && m.textContent) m.hidden = !mention; return mention; },
    dictee(on) { const b = $('ouv-dicter'); if (b) { b.setAttribute('aria-pressed', String(!!on)); b.textContent = on ? 'J\'écoute' : 'Micro'; } },
    envoyer: t => { txt.value = t; envoyer(t); },
    vivant: () => V.on ? { etapes: Object.keys(V.blocs).filter(k => k !== 'droite'), finies: [...V.finis], agents: V.res ? Object.keys(V.res.nodes) : [], appels: V.n.appels, constats: V.n.constats, lignes: V.n.lignes } : null,
    ouvert: () => !fini && !racine.hidden
  };
}
