// Assemble src/ en une seule page autonome : dist/index.html (aucune dépendance, publiable telle quelle).
// Usage : node tools/build.mjs
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundleCore } from './bundle-core.mjs';
import { loadPack, loadLibrary } from './pack-check.mjs';
import { compilePack, parseSource } from '../core/source.js';
import { canonicalJSON, hashString } from '../core/world.js';

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
const constructeurJs = embarquer('LUMIERE', 'src/lumiere.js') + '\n' + embarquer('CONSTRUCTEUR', 'src/constructeur.js') + '\n' + embarquer('ATELIER', 'src/atelier.js') + '\n' + embarquer('VOIX', 'src/voix.js') + '\n' + embarquer('ECHELLE', 'src/echelle.js') + '\n' + embarquer('ACTIVITE', 'src/activite.js') + '\n' + embarquer('PDL', 'src/pdl.js')
  + '\n' + embarquer('SON', 'src/son.js') + `\nconst BRUITAGES=${JSON.stringify(JSON.parse(read('src/bruitages.json'))).replace(/<\//g, '<\\/')};`;   // SON : les bruitages (src/son.js), recettes et prises en données   // VOIX : la voix du personnage
// L'ouverture de démo (src/ouverture.js) et les journaux de préparation qu'elle rejoue (ouvertures/*.json) : objets OUVERTURE et OUVERTURES.
const ouvFiles = readdirSync(join(root, 'ouvertures')).filter(f => f.endsWith('.json')).sort();
// Un journal qui nomme ses photos (« photos » : ouvertures/photos/<nom>.json, vignettes et crédits, docs/ouverture.md) les reçoit en « vignettes ».
const ouvJournal = f => { const r = JSON.parse(read('ouvertures/' + f)); if (r.photos) r.vignettes = JSON.parse(read('ouvertures/photos/' + r.photos + '.json')); return r; };
const ouvertureJs = embarquer('OUVERTURE', 'src/ouverture.js') + `\nconst OUVERTURES=${JSON.stringify(ouvFiles.map(ouvJournal)).replace(/<\//g, '<\\/')};`;
// Story mode (M2, src/story.js): the narrative core (core/, bundled as CORE), the compiled packs of stories/ (STORY_PACKS),
// the engine adapter (ADAPTER), the model port served by code (REFLEX, REFLEXES), the page's model port (MODELPORT: home node,
// host's model, M3) and the page glue (STORY).
const esc = o => JSON.stringify(o).replace(/<\//g, '<\\/');
function storyPack(id) {
  const dir = join(root, 'stories', id), pack = loadPack(dir), c = compilePack(pack, loadLibrary(join(root, 'patterns')));
  if (c.errors.length) throw new Error('stories/' + id + ': ' + JSON.stringify(c.errors.slice(0, 3)));
  const M = pack.manifest, speakers = {};
  for (const [f, t] of Object.entries(pack.texts)) if (f.startsWith('characters/')) { const d = parseSource(t, { file: f }); if (d.meta && d.meta.name) speakers[d.meta.id || d.id] = d.meta.name; }
  const version = hashString(canonicalJSON({ manifest: M, texts: pack.texts, place: pack.place, stations: pack.stations, beats: pack.beats, lines: pack.lines }));   // the harvest records it (ADR 0011 §4)
  return { id, version, title: M.title, langs: M.languages, carrier: M.carrier, scene: c.scene, principles: c.principles, place: pack.place, stations: pack.stations.stations,
    anchors: M.anchors ? JSON.parse(read(join('stories', id, M.anchors))) : {}, endings: (pack.beats && pack.beats.endings) || [], speakers };
}
const storyIds = readdirSync(join(root, 'stories')).filter(d => !d.startsWith('_') && !d.startsWith('.') && existsSync(join(root, 'stories', d, 'pack.json'))).sort();
const STORY_PACKS = Object.fromEntries(storyIds.map(id => [id, storyPack(id)]));
// The trailer mode (src/trailer.js, briefs/trailer.md): the player (TRAILER) and the scripts of the packs that have one
// (stories/<id>/trailer.json, TRAILER_SCRIPTS), checked here: a script with an error stops the build.
const { loadTrailer } = await import('../src/trailer.js');
const TRAILER_SCRIPTS = {};
for (const id of storyIds) {
  const f = join(root, 'stories', id, 'trailer.json'); if (!existsSync(f)) continue;
  const { script, errors } = loadTrailer(JSON.parse(readFileSync(f, 'utf8')));
  if (errors.length) throw new Error('stories/' + id + '/trailer.json: ' + JSON.stringify(errors.slice(0, 3)));
  TRAILER_SCRIPTS[id] = script;
}
const storyJs = bundleCore(root) + '\n' + embarquer('ADAPTER', 'src/adaptateur-core.js') + '\n' + embarquer('REFLEX', 'src/reflex-model.js') + '\n' + embarquer('MODELPORT', 'src/model-port.js') + '\n' + embarquer('STORY', 'src/story.js')
  + '\n' + embarquer('TRAILER', 'src/trailer.js') + '\n' + embarquer('HARVEST', 'src/harvest.js')
  + `\nconst REFLEXES=${esc(JSON.parse(read('src/reflexes.json')))};\nconst STORY_PACKS=${esc(STORY_PACKS)};\nconst TRAILER_SCRIPTS=${esc(TRAILER_SCRIPTS)};`;
if (/<\/script/i.test(storyJs.replace(/<\\\//g, ''))) throw new Error('story mode: </script> in the embedded code');
// The engine build: a hash of everything the page runs, recorded by the harvest with each session (ADR 0011 §4).
const ENGINE_BUILD = hashString(meneurJs + constructeurJs + ouvertureJs + storyJs + js);
const html = read('src/index.html').replace('__MAIN_JS__', () => meneurJs + '\n' + constructeurJs + '\n' + ouvertureJs + '\n' + storyJs + `\nconst ENGINE_BUILD=${JSON.stringify(ENGINE_BUILD)};` + '\n</script>\n<script>\n' + js);
mkdirSync(join(root, 'dist'), { recursive: true });
writeFileSync(join(root, 'dist/index.html'), html);
// Variante pour un artefact claude.ai : la page y est enveloppée à la publication, donc sans doctype, html, head ni body.
const body = html.replace(/<!DOCTYPE html>\s*<html[^>]*>\s*<head>\s*/i, '').replace(/<meta charset[^>]*>\s*/i, '').replace(/<meta name="viewport"[^>]*>\s*/i, '<meta name="claude:viewport-fit-sides" content="cover">\n')
  .replace(/<\/head>\s*<body>\s*/i, '').replace(/<\/body>\s*<\/html>\s*$/i, '');
writeFileSync(join(root, 'dist/artefact.html'), body);
console.log(`dist/index.html : ${(html.length / 1024).toFixed(1)} Ko, ${scenes.length} fiches (${sceneFiles.join(', ')}), ${histoires.length} histoires, ${storyIds.length} story packs (${storyIds.join(', ')}), ${Object.keys(TRAILER_SCRIPTS).length} trailer(s)`);
