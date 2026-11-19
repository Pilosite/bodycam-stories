# Moteur v3 : on ne trace plus, on sème

Document de conception, suivi du compte rendu de l'essai n° 1 (en fin de document). Il tire les leçons de l'essai v2 (`moteur-v2.md`) et répond au triptyque de `CLAUDE.md`.

## Ce que les essais ont appris

- **Le moteur actuel** part de chaque pixel et cherche le monde (lancer de rayons). Chaque rayon interroge toute la scène des centaines de fois : le coût monte avec la richesse du monde. Mesuré sur le téléphone de Toine (Mali-G77) : 15 images par seconde sur le sentier, 12 avec une maison et un lapin, à 238 × 430.
- **L'essai v2** (tourner des panoramiques, puis projeter des points) a montré deux choses. Projeter des points donne presque la même image, 5 à 10 fois plus vite en rendu logiciel. Mais le « tournage » repose encore sur le lancer de rayons : sur téléphone il aurait environ cinq fois trop de retard sur la marche.

Conclusion : afficher des points est la bonne idée ; les obtenir en lançant des rayons est le goulot.

## L'idée : inverser le sens

Le monde est déjà décrit par des données simples : un relief, des semis d'éléments faits de formes, des volumes de feuillage, des matières en recettes. On n'a pas besoin de le chercher pixel par pixel : **on peut le semer directement**.

> Chaque image, la carte graphique dessine un nombre FIXE de grains (disons 400 000). Chaque grain calcule lui-même, à partir de son numéro et de la fiche du lieu, où il se pose dans le monde : sur le sol, sur un tronc, sur une façade, sur une feuille. Le test de profondeur fait le tri de ce qui est devant.

- **Coût indépendant de la complexité, par construction.** Le budget de grains est fixe. Un monde plus riche ne reçoit pas plus de grains, ils se répartissent autrement. Aucune étape ne parcourt la scène.
- **N'importe quel monde.** Tout ce qui s'écrit en relief + semis + volumes + matières se sème. C'est exactement le vocabulaire générique de la refonte (`refonte-monde-generique.md`) : la fiche que l'IA écrit devient directement le programme de semis.
- **La vidéo de téléphone couvre les coutures.** Les grains sont répartis au hasard et changent à chaque image : ce qui reste de pointillé devient du grain de capteur, lissé par l'accumulation dans le temps que le moteur fait déjà.

### Où vont les grains

La répartition suit le regard et le trajet : beaucoup de grains près de la caméra, de moins en moins au loin, de façon que chaque zone de l'écran en reçoive à peu près autant. Le lointain (horizon, ciel) reste un calcul par direction, presque gratuit. Le sol peut être un simple maillage qui suit le relief : il ne coûte rien et ne laisse aucun trou.

### Matières et lumière, comptées par pixel

- **Matière.** Le grain n'emporte que « quel élément, quel point dessus ». La recette de matière (`recette()`, déjà écrite) s'évalue ensuite une seule fois par pixel de l'écran : coût fixe.
- **Soleil.** Les mêmes grains, semés une seconde fois vus du soleil, donnent la carte des ombres. Coût fixe aussi.
- **Lumière d'ambiance.** C'est elle qui fait le réel, et c'est la partie lente. Elle est rangée dans le monde (une grille grossière le long du trajet) et calculée en fond par le lanceur de rayons actuel, qui garde ce rôle : il n'affiche plus rien, il mesure la lumière, quand le téléphone a du temps (gel, pauses). En attendant qu'elle arrive, une approximation suffit.
- **Lampe la nuit.** Par pixel, comme aujourd'hui.

### Les trois horloges

1. **L'affichage**, à chaque image : semer, ombrer, passer le capteur. Budget fixe.
2. **La lumière d'ambiance**, en fond, à son rythme.
3. **Le récit**, qui annonce où l'on va, pour que la lumière soit prête avant.

## Ce qui peut casser

| Risque | Parade | Comment le savoir |
|---|---|---|
| Trous et pointillé de près | Grains plus gros près de la caméra, sol en maillage, accumulation dans le temps | Essai n° 1 |
| Lumière moins juste que le lancer de rayons | Carte d'ombres + ambiance rangée dans le monde, comparées à `ref/` | Essai n° 1, côte à côte |
| Formes fondues ou bosselées (rochers, animaux) | Grain posé sur la forme simple puis déplacé le long de sa normale | Essai n° 1 sur les grès |
| Feuillage | Chaque grain est une feuille : c'est le cas le plus naturel | Essai n° 1 |
| Deux moteurs à tenir d'accord (semeur et lanceur de rayons) | Ils lisent la même fiche ; le lanceur sert de référence et de mesure de lumière | Tests de non-régression |


## Essai n° 1 fait (19 novembre 2026) : la forêt semée

Construit, en mode expérimental : bouton « Moteur v3 », option de test `v3` (options détaillées en tête du bloc « moteur v3 » de `src/main.js`). Le mode par défaut et le v2 restent intacts (vue `a-sentier` du mode par défaut : écart après flou 1,71, au plancher de bruit de `ref/bruit.txt`).

### Ce qui est fait

- **Code partagé.** Le monde n'existe qu'une fois. `pathtrace.frag` est découpé, sans changer son calcul, en `monde.glsl` (aléa, relief, familles d'objets, objets de la fiche, canopée, ciel, lointain), `recette.glsl` (matières) et `reprojection.glsl` (accumulation) ; le build les insère (`#include "…"`, une fois par shader). Les paramètres d'un objet de cellule sont des fonctions (`arbreA`, `brancheA`, `percheB`, `axeB`, `blocGres`, `blocLocal`, `blocForme`) que `sdTreeA`, `sdTreeB`, `sdRock` appellent, et que le semeur appelle aussi : un arbre semé tombe là où le lanceur de rayons le voit, par construction.
- **Le semeur** (`v3_grains.vert`). Un sommet par grain, `gl_VertexID` et la graine de l'image, aucun tampon. Budget fixe : 300 000 grains vus de la caméra (option `grains`), 180 000 vus du soleil. Le budget est partagé entre familles au prorata de la surface apparente qu'elles demandent (aire de l'objet / aire de sa cellule), pas de leur nombre : une forêt plus dense remplit mieux ses grains, elle n'en reçoit pas plus.
  - Troncs, branches, perches, blocs : le grain tire un point du sol (cap dans le champ, distance en progression géométrique, donc une densité en 1/d² qui suit la taille apparente), prend l'objet de la cellule, puis un point sur la face tournée vers la caméra (cylindre, capsule de branche, ellipsoïde). Les blocs sont posés sur l'ellipsoïde puis ramenés sur la forme bosselée par deux pas de Newton sur `blocForme`. Le côté du grain est réglé pour couvrir l'objet environ 3 fois (`v3k`) ; sur un tronc, il ne dépasse pas le diamètre et reste dans la silhouette (un tronc lointain plus fin qu'un pixel est dessiné une image sur deux ou trois : l'accumulation en fait un trait fin, au lieu de l'épaissir).
  - Feuilles : le grain tire une direction de l'écran et une distance dans la tranche de canopée, et prend la feuille de la cellule de 30 cm où il tombe, avec les tirages de `foliage()` (position, couleur, normale). Une feuille proche est touchée presque à chaque image ; une lointaine rarement, et elle est alors agrandie (1,8 fois au plus).
  - Objets de la fiche (`uShapes`) : objet tiré selon sa taille apparente (calculée par la page), forme selon son aire, grain posé sur la boîte englobante puis ramené sur la forme par Newton sur `sdPrim`. La maison et le lapin de la fiche 05 apparaissent.
  - Le sol est un maillage polaire de 36 864 triangles centré sur la caméra (pas logarithmique : 3 cm près des pieds, 30 m au loin), qui suit `terrainH`. Aucun trou.
- **Tampon G** (`v3_gbuf.frag`) : coordonnées de recette dans le repère de l'objet (comme `info` dans le lanceur de rayons), élément, normale, distance. Un grain couvre quelques pixels ; ses coordonnées varient d'un pixel à l'autre le long de la surface, pour que l'écorce ou la litière ne soient pas peintes en carrés.
- **Une passe plein écran** (`v3_ombrage.frag`) : même choix de recette que `render()`, un seul appel à `recette()`. Soleil : carte d'ombres semée vue du soleil (1024 × 652 pour ce soleil à 21°, texels carrés de 11 cm, perches semées en traits d'un texel), direction tirée dans le disque solaire à chaque image (la pénombre vient de l'accumulation), canopée par sa transmittance statistique (`canopyT`). Hors de la carte, une part statistique de soleil passe entre les troncs. Ambiance : un échantillon cosinus par pixel et par image, ciel atténué par la canopée et par la futaie (statistique), sol éclairé en dessous, pied assombri (distance à l'objet de la cellule, trois familles). La fonction `ambiance()` est l'endroit où brancher l'ambiance rangée dans le monde. Ciel et lointain : calcul par direction, comme avant.
- **Sortie** au format de l'accumulation (couleur, distance) : reprojection en marche (25 % d'image neuve), accumulation à l'arrêt (64 images au plus, décalage sous-pixel), bloom, exposition, `camera.frag` inchangés. Les grains sont re-tirés à chaque image.
- **Mesurer** : en v3, images/s en marche, ms par image, budget de grains par famille, détail des trois passes (à l'arrêt, synchronisé).
- `tools/v3essai.mjs` : la planche et le test du triptyque.

### Ce qu'on voit (planche `out/v3-planche.png`, rendu logiciel 270 × 480)

Rangée 1 : `ref/` (lanceur de rayons, 24 passes) ; rangée 2 : v3, 16 images accumulées ; rangée 3 : v3 en marche après 2 m, 5 m, et le corps tourné de 60°.

- **Placement : exact.** Mêmes arbres, mêmes perches, mêmes blocs, mêmes branches, au même endroit dans les trois vues. Les écorces, la litière, le sentier, la mousse sont les mêmes recettes et se confondent.
- **Ombres : justes, un peu plus douces.** Vérifié pixel à pixel contre une marche de rayons vers le soleil (outil de mise au point retiré du code) : la carte et le lancer de rayons s'accordent, sauf sur un demi-texel au bord des troncs. Les ombres de v3 sont plus nombreuses et plus douces que celles de `ref/` : le lanceur de rayons, borné en pas, manque des arbres lointains (ses ombres proches sont plus nettes et plus rares), alors que la carte les a tous ; et la pénombre (même rayon de disque solaire que le lanceur) s'accumule sur 16 images au lieu de 24 passes.
- **Ambiance : réglée à l'œil.** L'approximation donnait une image trop douce (ombres trop claires) ; un facteur global de 0,65 (`v3amb`) remet les percentiles de luminance au niveau de `ref/` (5 %, 50 % et 95 % à 8 niveaux près sur 255). C'est un réglage, pas une mesure de lumière.
- **Feuillage : ce qui trahit le plus.** À l'arrêt, la canopée est plus floue que les feuilles nettes du lanceur de rayons (les feuilles lointaines, rarement touchées, s'accumulent en taches). En marche, elle devient des confettis de 2 à 5 pixels qui changent à chaque image. Les petites branches de la canopée (`foliage`, grille de 1,5 m) ne sont pas semées.
- **Objets de la fiche.** La maison et le lapin sont là, mais un mur pris de face n'est pas entièrement couvert à chaque image : en accumulant, on voit à travers (les arbres qui traversent la maison, cachés par le lanceur de rayons, transparaissent). Les fusions douces (« lisse ») ne sont pas suivies. Le mur est plus sombre qu'avec le lanceur de rayons.
- **Au loin,** à l'horizon, une bande de brume plus claire que dans `ref/` sur certaines vues : les troncs plus fins qu'un pixel y sont dessinés une image sur trois.

### Chiffres (rendu logiciel SwiftShader, 4 cœurs partagés avec d'autres tâches, 270 × 480)

La machine était chargée (charge moyenne 6 à 8 sur 4 cœurs) : d'un passage à l'autre, le même cas varie du simple au double. Les cas sont donc repris en alternance (`node tools/v3essai.mjs out/v3 mesures 4 v3`) et on compare des médianes prises au même moment. Temps de calcul d'une image en marche, synchronisé, à résolution égale (270 × 480, niveau de résolution du moteur actuel fixé à la pleine résolution) :

| Cas | v3, médiane (4 tours alternés) | v3, meilleur tour | Moteur actuel, médiane (3 tours) | Moteur actuel, tour le plus calme |
|---|---|---|---|---|
| Forêt (fiche 0) | 1 082 ms | 1 057 ms | 4 201 ms | 4 143 ms |
| Forêt plus dense (densite 1, rochers 1,5, feuillage 1,5) | 1 092 ms | 1 026 ms | 4 236 ms | 4 093 ms |
| 05-maison-lapin (8 + 6 formes) | 1 101 ms | 1 022 ms | 4 348 ms | 4 203 ms |

- **Le coût du v3 ne bouge pas avec la richesse**, à la précision de la mesure (± 15 %). Ce n'est pas tout à fait « par construction » : un grain tombé dans une cellule vide s'arrête tôt, donc une forêt plus dense fait travailler un peu plus de grains jusqu'au bout ; le budget (300 000) reste la borne. Un passage isolé, au calme, a donné 563 ms pour la forêt et 997 ms pour la forêt dense : je ne sais pas dire si c'était le bruit de la machine ou ce surcoût.
- **Le v3 est environ 4 fois plus rapide** que le moteur actuel en marche, à résolution égale, en rendu logiciel. Le moteur actuel varie peu lui aussi ici : en marche, ses pas de rayon sont plafonnés, ce qui borne déjà son coût ; sur le téléphone il passait de 15 à 12 images/s avec la maison et le lapin.
- **Le budget** : 300 000 grains vus de la caméra (arbres 126 k, perches 58 k, blocs 31 k, feuilles 84 k ; 36 k pour les objets quand la fiche en a), 180 000 vus du soleil, 36 864 triangles de sol.
- **Détail par passe** (« Mesurer », à l'arrêt, synchronisé, machine chargée) : carte d'ombres 178 ms, tampon G 346 ms, matière et lumière 375 ms. En rendu logiciel, la passe plein écran (recette, deux transmittances de canopée, ombre, ambiance) pèse autant que tout le semis.
- **Le panneau « Mesurer »** fonctionne en v3 (images/s en marche sur l'horloge réelle, ms par image, budget par famille, détail par passe). Aucune perte de contexte WebGL pendant les essais.

### Ce qui n'est pas vérifié

- **Le téléphone.** Tout a tourné en rendu logiciel, où le coût est surtout celui des sommets et des passes plein écran. Sur un GPU mobile, 300 000 points de quelques pixels, un maillage de 37 000 triangles, un tampon G de deux textures RGBA32F (bande passante) et une carte de profondeur sont des charges ordinaires, mais rien n'est mesuré. Le bouton « Mesurer » en v3 donne la réponse.
- La précision : le tampon G est en RGBA32F (`EXT_color_buffer_float`) ; un appareil qui ne rend qu'en 16 bits flottants n'a pas été essayé.
- La nuit et la lampe (hors périmètre : la lampe est ignorée en v3), les dunes, les conifères en cône (le cœur de feuillage n'est pas semé), le lointain en montagnes.
- Le temps de compilation des shaders sur mobile (le shader d'ombrage inclut tout `recette()`).

### Suite proposée

1. Mesurer sur le téléphone de Toine, avec « Mesurer » en v3, à 150 000, 300 000 et 600 000 grains (`grains`).
2. Le feuillage : semer les branches de la canopée ; essayer des grains ronds ou des disques orientés ; une part du budget réservée aux feuilles proches.
3. Les objets : un recouvrement plus fort pour les faces planes, et suivre les fusions douces par deux pas de Newton sur l'objet entier.
4. L'ambiance rangée dans le monde, branchée dans `ambiance()`, à la place du facteur réglé à l'œil.

## Ce que le semeur ne sait pas encore rendre (fusion avec la branche `semis`, 19 novembre 2026)

Le lanceur de rayons a reçu le vocabulaire de monde générique (`docs/refonte-monde-generique.md`, étape 3). Le semeur partage le même `monde.glsl` et la même `recette.glsl` (relief et trajet réglés par uniformes, nouveaux motifs de matière), mais il ne sème pas encore ce vocabulaire. Sur une fiche qui en a besoin, le bouton « Moteur v3 » est désactivé (« Moteur v3 · pas ici », la raison en infobulle) et la page reste sur le lanceur de rayons ; si le v3 était actif, il se coupe, et revient de lui-même sur la prochaine fiche qu'il sait rendre. Le test est `v3Refus()` dans `src/main.js`, dans cet ordre :

| Ce que demande la fiche | Raison affichée | Ce qu'il manque au semeur |
|---|---|---|
| `semis[]` (au moins une couche) | semis | semer les éléments d'une couche (grille, rangée le long du trajet, formes de l'élément), avec `gInst` et la palette |
| `kit: "dunes"` | dunes | jamais essayé avec le semeur : sable ridé, rochers épars des dunes, part du budget sans arbres |
| `kit: "nu"` (ou une fiche sans kit qui a des semis) | monde nu | un monde sans arbres ni canopée n'a jamais été essayé avec le semeur ; il vient en pratique avec des semis |
| `relief` ou `trajet` différents de la forêt d'origine | relief ou trajet réglé | le maillage du sol suit `terrainH`, mais la répartition des grains (`v3Cap`, distances) et la pente le long de z (`uYTop`) n'ont pas été revues ; pas de pas réduit près d'un bord de trottoir |
| nuit, ou lampe allumée | nuit, lampe | la lampe du téléphone ; les fenêtres allumées (`uNuit`) passent par la recette, mais sans lampe ni lumière ponctuelle |
| `foret.houppier: "cone"` | conifères en cône | le cœur de feuillage des conifères n'est pas semé |
| `lointain.eau` | eau à l'horizon | `eauLoin()` n'est pas appelée par `v3_ombrage.frag` |

Le lointain en montagnes ou collines, lui, est rendu (calcul par direction, comme le ciel). Ce que la fusion a changé dans le semeur, sans changer ce qu'il rend sur la forêt : les uniformes de relief et de trajet (`uRel`, `uTraj`, `uCreux`) sont passés par `v3Monde`, la largeur du trajet vient de `uTraj` comme dans `render()`, et `recette()`/`matProp()` ont leur nouvelle signature (émission, normale dans le repère de la forme). Les fiches 01, 03 et 05 de `scenes/` restent rendues par le v3 ; 02 (nuit), 04 (dunes) et 06 à 08 (semis, kit nu) ne le sont pas. Une ambiance changée en cours d'histoire (lampe allumée) refait le même test.
