// Profil du dépliage d'un shader : quelles fonctions pèsent, combien de fois chacune est recopiée (sites d'appel × boucles).
// Usage : node tools/profil.mjs fichier.frag "DEF=1 AUTRE=0" [n]   (fichier dans src/shaders, inclusions résolues)
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pretraiter, deplie } from './deplie.mjs';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = f => readFileSync(join(root, 'src/shaders', f), 'utf8');
const inclure = (src, vus = new Set()) => src.replace(/^#include "([\w.-]+)"\s*$/gm, (_, f) => { if (vus.has(f)) return ''; vus.add(f); return inclure(read(f).trimEnd(), vus); });
const [, , fic, defs = '', n = '25'] = process.argv;
const d = defs.split(/\s+/).filter(Boolean).map(x => '#define ' + x.replace('=', ' ')).join('\n');
const src = inclure(read(fic).trimEnd()).replace('\n', '\n' + d + '\n');
const pp = pretraiter(src), tot = deplie(pp);
console.log(fic, defs, ': déplié', tot);
for (const r of deplie(pp, true).slice(0, +n)) console.log(r.f.padEnd(22), 'copies', String(r.copies).padStart(5), ' propre', String(r.propre).padStart(6), ' total', String(r.total).padStart(8), (100 * r.total / tot).toFixed(1) + ' %');
if (process.env.QUI) for (const r of deplie(pp, true)) if (process.env.QUI.split(',').includes(r.f)) console.log('  ' + r.f + ' (' + r.copies + ' copies) ← ' + r.par.map(([g, k]) => g + ' ' + k).join(', '));
