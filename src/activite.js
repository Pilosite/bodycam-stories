/* Le panneau d'activité (docs/activite.md) : ce que la page fait pendant que Claude réfléchit, écrit dans un petit langage.
   Module pur, sans DOM : chaque ligne vient d'une structure réelle (la phrase analysée par les fonctions du meneur, l'état de
   l'appel, un événement du journal, une action de la file). Aucun nom de modèle ici : tout vient des données.
   Une ligne : { k, t } ; k est le signe de tête : '>' la phrase, ' ' une analyse locale, '~' un appel en cours,
   '<' ce que Claude rend, '·' une décision du meneur, '!' un garde-fou, '▶' une action qui s'exécute, '✓' une action finie. */

const r1 = v => (Math.round(v * 10) / 10).toFixed(1);
const r2 = v => (Math.round(v * 100) / 100).toFixed(2);
const court = (s, n = 60) => { s = String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
const L = (k, t) => ({ k, t });

/* Ce que la page comprend de la phrase, avant Claude. M : les fonctions du meneur (MENEUR) ; bib : la bibliothèque de modèles. */
export function analyser(texte, M, bib) {
  const out = [L('>', 'hear "' + court(texte, 80) + '"')];
  if (!M) return out;
  const t = String(texte || '');
  if (M.estStop && M.estStop(t)) { out.push(L(' ', 'stop       : queue cleared, no wait')); return out; }
  const od = M.ordreDemande ? M.ordreDemande(t) : null;
  if (od) {
    out.push(L(' ', 'order      : ' + (od.ordre === 'avant' ? 'go → make' : 'make → go')));
    const d = od.deplacement;
    out.push(L(' ', 'go         : ' + (d.type === 'rejoindre' ? 'reach ' + d.objet : d.type === 'marcher' ? (d.metres < 0 ? 'back up ' + r1(-d.metres) : 'walk ' + r1(d.metres)) + ' m'
      : 'move' + (d.metres ? ' ' + r1(d.metres) + ' m' : ', free spot ≥ 4 m')) + (od.demiTour ? ' · turn around' : '')));
  }
  const tm = bib && M.modeleDe ? M.modeleDe(bib, t, { transforme: true }) : null;
  const m = !tm && bib && M.modeleDe ? M.modeleDe(bib, t) : null;
  if (tm) out.push(L(' ', 'shape      : model(' + tm.id + ') from the last thing asked'));
  if (m) {
    const fm = M.formesModele ? M.formesModele(m.modele, t) : null;
    let l = 'make       : model(' + m.id + ')';
    if (fm) {
      l += ' ' + court(String(fm.raison).split(' (')[0], 24) + ' → ' + r2(fm.envergure) + ' m';
      if (fm.facteur !== 1) l += ' ×' + r1(fm.facteur);
      const ex = M.exploitDe ? M.exploitDe(bib) : null;
      if (ex && M.palierExploit) { const p = M.palierExploit(fm.facteur, ex); if (p !== 'normal') l += ' (' + (p === 'demesure' ? 'outsized' : p) + ')'; }
    }
    out.push(L(' ', l));
    const mo = m.modele || {}, c = [];
    if (mo.origine === 'corps') { c.push('crouch'); if (fm && M.dureeEffort && M.exploitDe) c.push('effort ' + r1(M.dureeEffort(fm.facteur, M.exploitDe(bib))) + ' s'); }
    if (mo.ou) c.push('place ' + mo.ou);
    if (c.length) out.push(L(' ', 'body       : ' + c.join(' · ')));
  }
  if (M.secoursCorps && !(od && od.ordre === 'avant')) {
    const im = M.secoursCorps(t, null, []).filter(a => a.type === 'posture');
    if (im.length) out.push(L(' ', 'right now  : posture ' + r2(im[0].hauteur)));
  }
  if (out.length === 1) out.push(L(' ', 'nothing local : asking Claude'));
  return out;
}

/* L'état de l'appel en cours, réécrit sur place (la durée tourne). */
export function ligneAppel(qui, secondes) { return L('~', court(qui, 14).padEnd(10) + ' … ' + r1(secondes) + ' s'); }

/* Un événement du journal du meneur, ou null (ceux qui ne disent rien au joueur). */
export function ligneEvenement(e) {
  if (!e || typeof e !== 'object') return null;
  const x = e;
  switch (x.type) {
    case 'pensee': return x.texte ? L('<', 'thought    "' + court(x.texte, 70) + '"') : null;
    case 'sas': return L('<', 'gate       ' + (x.verdict || '?') + (x.regle ? ' · ' + court(x.regle, 30) : ''));
    case 'geste_immediat': return L('▶', 'right now  : ' + (x.actions || []).join(', '));
    case 'sequence': return L('·', 'sequence   ' + (x.remis_en_ordre ? 'reordered to match the sentence' : (x.de || []).join(' → ')));
    case 'demande_tenue': return L('!', 'guard      request kept : model(' + x.modele + ')');
    case 'exploit': return L('·', 'exploit    ×' + r1(x.facteur) + ' ' + (x.palier === 'demesure' ? 'outsized' : x.palier || '') + (x.corps ? ' · effort ' + r1(x.effort_s) + ' s' : ''));
    case 'exploit_corrige': return L('!', 'guard      other material refused → body');
    case 'apercu_jete': return L('!', 'guard      preview dropped');
    case 'pensee_jetee': return L('!', 'guard      thought dropped');
    case 'modele': return L('·', 'model      ' + x.id + (x.envergure ? ' → ' + r2(x.envergure) + ' m' : '') + (x.raison ? ' (' + court(String(x.raison).split(' (')[0], 22) + ')' : ''));
    case 'echelle': return L('·', 'scale      ×' + r1(x.facteur) + ' · ' + court(x.raison, 34));
    case 'pose_corrigee': return L('!', 'guard      place ' + (x.de || '?') + ' → ' + x.vers);
    case 'objet_cree': return L('<', 'build      ' + x.id + ' "' + court(x.nom, 28) + '" ' + x.formes + ' shapes · ' + r2(x.envergure) + ' m');
    case 'objet_recycle': return L('·', 'recycle    ' + x.id + ' (engine budget)');
    case 'suite_programmee': return L('<', 'follow-up  ' + x.etapes + ' steps over ' + Math.round(x.duree_s) + ' s');
    case 'faconnage': return L('·', 'shaping    ' + x.id + (x.chercher ? ' · fetch ' + x.chercher : '') + (x.attendu ? ' (expected)' : ''));
    case 'degout': return L('·', 'disgust    ' + (x.palier || '') + ' ' + r2(x.intensite) + (x.nausee ? ' · nausea' : ''));
    case 'cadrage': return L('·', 'frame      ' + x.id);
    case 'stop': return L('!', 'stop       queue cleared');
    case 'docile': return L('!', 'debug      page completes the answer');
    case 'cede': return L('·', 'gives in   does it anyway');
    case 'objet_refuse': case 'objet_rate': return L('!', 'build      failed');
    default: return null;
  }
}

/* Une action de la file, telle qu'elle s'exécute. */
export function ligneAction(a) {
  if (!a || typeof a !== 'object') return null;
  const deg = v => Math.round(v * 57.3) + '°';
  switch (a.type) {
    case 'marcher': return 'walk ' + r1(Math.abs(a.rest || 0)) + ' m';
    case 'marche': return 'walk ' + r1(a.metres || 0) + ' m';
    case 'tourner': return 'turn ' + deg(a.rest || 0);
    case 'posture': return 'posture ' + (a.h < 0.7 ? 'crouched' : 'standing');
    case 'regarder': return 'look ' + deg(a.pitch || 0);
    case 'effort': return 'effort ' + r1(a.secondes || a.rest || 0) + ' s';
    case 'penser': return 'think "' + court(a.texte, 30) + '"';
    case 'poser': return 'place ' + (a.ref || '');
    case 'faconner': return 'shape ' + (a.objet || '');
    case 'ramasser': return 'pick up';
    case 'viser': return 'aim ' + (a.objet || '');
    case 'zoom': return 'zoom ×' + r1(a.z || 1);
    case 'attendre': return 'wait';
    default: return String(a.type || '?');
  }
}
/* Une barre de progression en texte : u de 0 à 1. */
export function barre(u, n = 8) { const k = Math.max(0, Math.min(n, Math.round(u * n))); return '█'.repeat(k) + '░'.repeat(n - k); }
