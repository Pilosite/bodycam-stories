// Mesures de taille d'un shader GLSL, partagées par tools/ombrage-taille.mjs et tools/programmes.mjs.
// pretraiter : le texte que garde une variante ; deplie : la même mesure, fonctions recopiées à chaque appel et boucles à borne
// fixe recopiées autant de fois, comme le fait FXC (Direct3D). Des mesures relatives, pas Direct3D.
// Préprocesseur réduit : #define objet, #undef, #if/#ifdef/#ifndef/#elif/#else/#endif. Les macros numériques sont substituées.
export function pretraiter(src) {
  const M = {}, out = [], pile = [];
  const actif = () => pile.every(x => x.on);
  const evalue = e => {
    e = e.replace(/defined\s*\(\s*(\w+)\s*\)|defined\s+(\w+)/g, (_, a, b) => (a || b) in M ? '1' : '0')
      .replace(/\b[A-Za-z_]\w*\b/g, k => k in M ? '(' + M[k] + ')' : '0');
    try { return !!Function('return (' + e + ')')(); } catch { return false; }
  };
  for (const l of src.replace(/\/\*[\s\S]*?\*\//g, ' ').split('\n')) {
    const m = l.match(/^\s*#\s*(\w+)\s*(.*)$/);
    if (m) {
      const [, d, r0] = m, r = r0.replace(/\/\/.*$/, '').trim();
      if (d === 'ifdef' || d === 'ifndef') { const v = (r in M) === (d === 'ifdef'); pile.push({ on: v, fait: v }); }
      else if (d === 'if') { const v = actif() && evalue(r); pile.push({ on: v, fait: v }); }
      else if (d === 'elif') { const t = pile[pile.length - 1]; t.on = !t.fait && evalue(r); t.fait = t.fait || t.on; }
      else if (d === 'else') { const t = pile[pile.length - 1]; t.on = !t.fait; t.fait = true; }
      else if (d === 'endif') pile.pop();
      else if (!actif()) continue;
      else if (d === 'define') { const [, k, v = ''] = r.match(/^(\w+)\s*(.*)$/); M[k] = v.trim(); }
      else if (d === 'undef') delete M[r];
      continue;
    }
    if (!actif()) continue;
    out.push(l.replace(/\/\/.*$/, '').replace(/\b[A-Z_][A-Z0-9_]*\b/g, k => /^-?[\d.]+$/.test(M[k] || '') ? M[k] : k));
  }
  return out.join('\n');
}
const fermant = (t, i, o, c) => { let n = 0; for (let j = i; j < t.length; j++) { if (t[j] === o) n++; else if (t[j] === c && --n === 0) return j; } return t.length - 1; };
export function deplie(src, prof) {
  const F = {}, re = /^[ \t]*(?:highp\s+|mediump\s+)?(\w+)\s+(\w+)\s*\(([^()]*)\)\s*\{/gm; let m;
  while ((m = re.exec(src))) { if (['if', 'for', 'while', 'return', 'else'].includes(m[1])) continue; const a = m.index + m[0].length - 1, b = fermant(src, a, '{', '}'); F[m[2]] = src.slice(a + 1, b); re.lastIndex = b; }
  const memo = {};
  const coutF = n => memo[n] ?? (memo[n] = (memo[n] = 0, cout(F[n])));
  if (prof) {                                                  // profil : combien de fois chaque fonction est recopiée, et ce qu'elle pèse en tout
    const appels = {}, propre = {};
    for (const f in F) { const a = {}; propre[f] = cout(F[f], a, 1); appels[f] = a; }
    const n = { main: 1 }, ordre = [], vu = new Set();
    const visite = f => { if (vu.has(f)) return; vu.add(f); for (const g in appels[f] || {}) visite(g); ordre.push(f); };
    visite('main'); ordre.reverse();
    for (const f of ordre) for (const g in appels[f] || {}) n[g] = (n[g] || 0) + (n[f] || 0) * appels[f][g];
    const par = f => ordre.filter(g => appels[g] && appels[g][f]).map(g => [g, (n[g] || 0) * appels[g][f]]).filter(x => x[1] > 0).sort((a, b) => b[1] - a[1]);
    return ordre.map(f => ({ f, copies: n[f] || 0, propre: propre[f], total: (n[f] || 0) * propre[f], par: par(f) })).sort((a, b) => b.total - a.total);
  }
  function cout(t, A, mul = 1) {
    let total = 0, i = 0;
    const re2 = /\bfor\s*\(|\b([A-Za-z_]\w*)\s*\(/g; let x;
    while ((x = re2.exec(t))) {
      total += t.slice(i, x.index).replace(/\s+/g, '').length;
      if (!x[1]) {                                            // boucle : en-tête, puis corps recopié autant de fois que la borne fixe le dit
        const p = x.index + x[0].length - 1, q = fermant(t, p, '(', ')'), h = t.slice(p + 1, q);
        const b = h.match(/(\w+)\s*=\s*(-?\d+)\s*;\s*\w+\s*(<=|<)\s*(\d+)\s*;/); const k = b ? Math.max(1, +b[4] - +b[2] + (b[3] === '<=' ? 1 : 0)) : 1;
        let s = q + 1; while (/\s/.test(t[s])) s++;
        let e = t[s] === '{' ? fermant(t, s, '{', '}') : t.indexOf(';', s); if (e < s) e = t.length - 1;
        total += cout(h, A, mul) + k * cout(t.slice(s, e + 1), A, mul * k); i = Math.max(e + 1, x.index + 1); re2.lastIndex = i;
      } else { total += x[0].replace(/\s+/g, '').length; if (F[x[1]] !== undefined) { if (A) A[x[1]] = (A[x[1]] || 0) + mul; else total += coutF(x[1]); } i = x.index + x[0].length; }
    }
    return total + t.slice(i).replace(/\s+/g, '').length;
  }
  return F.main !== undefined ? coutF('main') : -1;
}

