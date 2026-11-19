// Rend les vues de référence décrites dans ref/vues.json, en parallèle.
// Usage : node tools/vues.mjs dossier [passes]
//   node tools/vues.mjs ref          gèle (ou regèle) la référence
//   node tools/vues.mjs out/essai    rend l'état courant, à comparer avec tools/compare.mjs
// Chaque vue part des options communes still, nohud, nowalk : image figée, sans interface, porteur immobile.
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { cpus } from 'node:os';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const cfg = JSON.parse(readFileSync(join(root, 'ref/vues.json'), 'utf8'));
const [,, dir = 'out/vues', passes = String(cfg.passes)] = process.argv;
mkdirSync(join(root, dir), { recursive: true });

const run = v => new Promise((ok, ko) => {
  const opts = JSON.stringify({ still: true, nohud: true, nowalk: true, ...v.options });
  const p = spawn('node', [join(root, 'tools/shot.mjs'), join(dir, v.nom + '.png'), opts, passes, String(cfg.largeur), String(cfg.hauteur), '600'], { cwd: root, stdio: ['ignore', 'pipe', 'inherit'] });
  let out = ''; p.stdout.on('data', d => out += d);
  p.on('close', c => c === 0 ? ok(v.nom + ' : ' + (JSON.parse(out.split('\n')[0]).secondes) + ' s') : ko(new Error(v.nom + ' : échec (' + c + ')\n' + out)));
});
const queue = cfg.vues.slice(); const n = Math.max(1, Math.min(queue.length, cpus().length));
await Promise.all(Array.from({ length: n }, async () => { while (queue.length) console.log(await run(queue.shift())); }));
