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
  FS_EXPO: 'expo.frag',
  FS_CAM: 'camera.frag',
  VS_V2PTS: 'v2_points.vert',      // moteur v2 (essai) : projection des panoramiques
  FS_V2PTS: 'v2_points.frag',
  FS_V2CIEL: 'v2_ciel.frag',
  FS_V2TROUS: 'v2_trous.frag',
  VS_V3GRAINS: 'v3_grains.vert',   // moteur v3 (essai) : le semeur
  VS_V3SOL: 'v3_sol.vert',
  FS_V3GBUF: 'v3_gbuf.frag',
  FS_V3OMBRE: 'v3_ombre.frag',
  FS_V3OMBRAGE: 'v3_ombrage.frag',
  FS_V3TAPIS: 'v3_tapis.frag',     // moteur v3 : le tapis du sol (matière cuite)
  FS_V3SONDE: 'v3_sonde.frag',     // sonde de collision (distance au décor), sans le lanceur de rayons
  VS_V3PROCHES: 'v3_proches.vert', // moteur v3 : éléments proches dessinés en boîtes, la forme cherchée par pixel
  FS_V3PROCHES: 'v3_proches.frag',
};

// Code GLSL partagé : une ligne #include "fichier.glsl" est remplacée par le fichier (src/shaders/), une seule fois par shader.
function inclure(src, file, vus = new Set()) {
  return src.replace(/^#include "([\w.-]+)"\s*$/gm, (_, f) => {
    if (vus.has(f)) return '// ' + f + ' déjà inclus';
    vus.add(f);
    return inclure(read('src/shaders/' + f).trimEnd(), f, vus);
  });
}

// Toutes les fiches de scenes/ sont embarquées, par ordre alphabétique ; un JSON invalide arrête le build.
const sceneFiles = readdirSync(join(root, 'scenes')).filter(f => f.endsWith('.json')).sort();
const scenes = sceneFiles.map(f => JSON.parse(read('scenes/' + f)));

let js = read('src/main.js');
for (const [name, file] of Object.entries(shaders)) {
  const src = inclure(read('src/shaders/' + file).trimEnd(), file);
  if (src.includes('`') || src.includes('${')) throw new Error(file + ' : accent grave ou ${ interdit dans un shader');
  js = js.replace(`__SHADER_${name}__`, () => '`' + src + '`');
}
js = js.replace('__SCENES__', () => JSON.stringify(scenes));
js = js.replace('__MATIERES__', () => JSON.stringify(JSON.parse(read('src/matieres.json'))));
if (/__SHADER_|__SCENES__|__MATIERES__/.test(js)) throw new Error('Un marqueur de build est resté dans main.js');

// Le meneur de jeu (src/meneur.js, module pur) et les histoires : un premier script, avant main.js, qui définit MENEUR et HISTOIRES.
const histFiles = readdirSync(join(root, 'histoires')).filter(f => f.endsWith('.json')).sort();
const histoires = histFiles.map(f => JSON.parse(read('histoires/' + f)));
const meneurSrc = read('src/meneur.js');
const exports = [...meneurSrc.matchAll(/^export\s+(?:async\s+)?(?:function\*?|const|let|class)\s+([A-Za-z_$][\w$]*)/gm)].map(m => m[1]);
if (/^\s*import\s/m.test(meneurSrc) || /<\/script/i.test(meneurSrc)) throw new Error('src/meneur.js : pas d\'import ni de </script>');
const meneurJs = `const MENEUR=(function(){"use strict";\n${meneurSrc.replace(/^export\s+/gm, '')}\nreturn {${exports.join(',')}};\n})();\nconst HISTOIRES=${JSON.stringify(histoires).replace(/<\//g, '<\\/')};\nconst MODELES=${JSON.stringify(JSON.parse(read('src/modeles.json'))).replace(/<\//g, '<\\/')};`;   // bibliothèque de modèles de référence (§15) : des données
// Le constructeur de monde (src/constructeur.js, module pur) et son interface (src/atelier.js) : même enveloppe, objets CONSTRUCTEUR et ATELIER.
function embarquer(nom, fichier) {
  const src = read(fichier);
  const noms = [...src.matchAll(/^export\s+(?:async\s+)?(?:function\*?|const|let|class)\s+([A-Za-z_$][\w$]*)/gm)].map(m => m[1]);
  if (/^\s*import\s/m.test(src) || /<\/script/i.test(src)) throw new Error(fichier + ' : pas d\'import ni de </script>');
  return `const ${nom}=(function(){"use strict";\n${src.replace(/^export\s+/gm, '')}\nreturn {${noms.join(',')}};\n})();`;
}
const constructeurJs = embarquer('CONSTRUCTEUR', 'src/constructeur.js') + '\n' + embarquer('ATELIER', 'src/atelier.js');
const html = read('src/index.html').replace('__MAIN_JS__', () => meneurJs + '\n' + constructeurJs + '\n</script>\n<script>\n' + js);
mkdirSync(join(root, 'dist'), { recursive: true });
writeFileSync(join(root, 'dist/index.html'), html);
// Variante pour un artefact claude.ai : la page y est enveloppée à la publication, donc sans doctype, html, head ni body.
const body = html.replace(/<!DOCTYPE html>\s*<html[^>]*>\s*<head>\s*/i, '').replace(/<meta charset[^>]*>\s*/i, '').replace(/<meta name="viewport"[^>]*>\s*/i, '<meta name="claude:viewport-fit-sides" content="cover">\n')
  .replace(/<\/head>\s*<body>\s*/i, '').replace(/<\/body>\s*<\/html>\s*$/i, '');
writeFileSync(join(root, 'dist/artefact.html'), body);
console.log(`dist/index.html : ${(html.length / 1024).toFixed(1)} Ko, ${scenes.length} fiches (${sceneFiles.join(', ')}), ${histoires.length} histoires`);
