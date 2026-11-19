// Assemble src/ en une seule page autonome : dist/index.html (aucune dépendance, publiable telle quelle).
// Usage : node tools/build.mjs
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = p => readFileSync(join(root, p), 'utf8');

const shaders = {
  VS: 'fullscreen.vert',
  FS_PT: 'pathtrace.frag',
  FS_DOWN: 'bloom_down.frag',
  FS_BLUR: 'bloom_blur.frag',
  FS_CAM: 'camera.frag',
};

// Toutes les fiches de scenes/ sont embarquées, par ordre alphabétique ; un JSON invalide arrête le build.
const sceneFiles = readdirSync(join(root, 'scenes')).filter(f => f.endsWith('.json')).sort();
const scenes = sceneFiles.map(f => JSON.parse(read('scenes/' + f)));

let js = read('src/main.js');
for (const [name, file] of Object.entries(shaders)) {
  const src = read('src/shaders/' + file).trimEnd();
  if (src.includes('`') || src.includes('${')) throw new Error(file + ' : accent grave ou ${ interdit dans un shader');
  js = js.replace(`__SHADER_${name}__`, () => '`' + src + '`');
}
js = js.replace('__SCENES__', () => JSON.stringify(scenes));
js = js.replace('__MATIERES__', () => JSON.stringify(JSON.parse(read('src/matieres.json'))));
if (/__SHADER_|__SCENES__|__MATIERES__/.test(js)) throw new Error('Un marqueur de build est resté dans main.js');

const html = read('src/index.html').replace('__MAIN_JS__', () => js);
mkdirSync(join(root, 'dist'), { recursive: true });
writeFileSync(join(root, 'dist/index.html'), html);
console.log(`dist/index.html : ${(html.length / 1024).toFixed(1)} Ko, ${scenes.length} fiches (${sceneFiles.join(', ')})`);
