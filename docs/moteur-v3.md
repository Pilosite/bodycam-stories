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

## Le v3 rend tous les mondes (branche `v3monde`, 19 novembre 2026)

Le semeur sème maintenant tout le vocabulaire du lanceur de rayons : `v3Refus()` (`src/main.js`) ne refuse plus aucune fiche (elle rend toujours "" ; elle reste le point d'entrée si un jour une fiche demande ce que le semeur ne sait pas faire, et la liste ci-dessous redeviendrait la sienne). Les huit fiches de `scenes/` sont rendues par le v3, côte à côte avec le lanceur de rayons : `node tools/v3monde.mjs` (planche `out/v3monde-planche.png`).

| Ce que demande la fiche | Refus d'avant | Comment le semeur le rend |
|---|---|---|
| `semis[]` | semis | `semeS` (`v3_grains.vert`, variante `FORMES`) : le grain tire un point du sol dans un cap élargi du rayon de l'élément, prend l'élément de la cellule par `semisGrille`/`semisElem` (les mêmes fonctions que `sdSemis`, dans `monde.glsl`), une forme selon son aire, un point sur sa face vue. La matière est retrouvée par `sdSemis` dans l'ombrage, comme `objId()` dans le lanceur de rayons (palette, `gInst`). Le budget est partagé au prorata de la surface que demande chaque couche |
| formes (objets et semis) | — | grains découpés : un grain posé sur une forme est un carré du plan tangent ; chaque pixel retrouve son point dans le repère de la forme et le fragment est jeté hors de la forme (`v3_gbuf.frag`, `FORMES`). Les arêtes restent nettes même avec de gros grains |
| `kit: "dunes"`, `kit: "nu"` | dunes, monde nu | aucune famille d'arbres : le budget va aux blocs et aux semis ; le sable ridé est une recette du sol, cuite dans le tapis |
| `relief`, `trajet` réglés | relief ou trajet réglé | uniformes `uRel`, `uTraj`, `uCreux` partout (sol, grains, proches, tapis) ; le cap semé (`v3Cap`) est calculé sur les directions réelles de l'image |
| nuit, lampe | nuit, lampe | `lampe()` dans `v3_ombrage.frag`, même cône et même chute que `lightSurf()` ; son ombre est cherchée dans le tampon G (`lampeOmbre`, six lectures) ; la lampe dans la brume ; fenêtres allumées par la recette |
| `foret.houppier: "cone"` | conifères en cône | le cœur de feuillage est semé (`semeA`, paramètre ≥ 1) et ombré par `matCone` ; de près, il est dans la boîte du tronc (`v3_proches`). Aucune fiche de `scenes/` ne l'utilise : pas vérifié en image sur cette branche |
| `lointain.eau` | eau à l'horizon | `eauLoin()` pour le ciel vu vers le bas ; le maillage du sol s'arrête à 150 m quand l'eau est à l'horizon |

### Plus de transparence de près

La plainte n° 1 : de près, on voyait à travers les rochers, les troncs, la maison et les petits objets, et les surfaces fourmillaient. Cause : une surface proche demande à l'écran bien plus de grains que n'en reçoit son élément, et un grain ne peut pas grandir sans limite (taille de point plafonnée par la puce, grain qui déborde de la silhouette). Le remède est générique, sans cas particulier par objet :

- **Les éléments proches sont dessinés « vers l'avant », pas semés** (`v3_proches.vert` et `.frag`). Pour une fenêtre fixe de cellules autour de la caméra, chaque élément est rastérisé en boîte englobante (une grille de 5 × 5 carreaux par face, répartis à angles égaux pour suivre le fisheye), puis chaque pixel de la boîte cherche la surface exacte le long de son rayon avec la distance du lanceur de rayons (`sdPrim` et le repère de l'élément, `blocForme`, `sdTreeA`, `sdTreeB`) : 20 pas au plus, la normale par quatre évaluations dans la même boucle, et la profondeur exacte (`gl_FragDepth`). Ce qui est dessiné en boîte n'est pas semé (`procheA`, `procheP`, `procheB`, `procheS`). Fenêtre : toutes les formes des objets de la fiche, 5 × 5 cellules de blocs, 3 × 3 cellules d'arbres (tronc et cœur des conifères), 5 × 5 de perches, et pour chaque couche de semis les cellules qui couvrent une dizaine de mètres (2 de part et d'autre au plus). Au dernier pas, un rayon rasant resté tout près de la surface compte comme touché : pas de pixel troué à la silhouette. Coût : borné par la fenêtre (≤ 900 sommets par emplacement, une marche de 24 évaluations au plus par pixel couvert), il ne dépend pas de la richesse de la fiche ; option `v3proches:false` pour revenir aux grains.
- **Au-delà de la fenêtre**, les formes restent semées en grains découpés, assez grands pour couvrir l'élément à chaque image (recouvrement `v3kf` = 2,4).
- **Damier en marche** : il n'est plus appliqué à moins de 1,5 m. Une surface si proche change d'échelle d'une image à l'autre quand on marche ; les blocs de 8 × 8 pixels relus dans l'historique formaient un damier visible sur un tronc ou un mur.
- **Anneau sombre du ciel** en levant les yeux : le maillage du sol gardait, des triangles dont un sommet est derrière la caméra, un coin qui recouvrait le ciel. Tout fragment d'un tel triangle est jeté (`vOk`, `v3_sol.vert`). Vérifié : `out/ciel/main-foret-12.png` (main, l'anneau) contre `out/ciel/foret-12.png`.

Preuves (`node tools/v3gros.mjs out/v3gros`, qualité mobile comme sur le téléphone, 270 × 480 en rendu logiciel) : pour chaque vue, 8 images accumulées à l'arrêt (`-arret`), une image neuve sans historique ni damier (`-seule`, le pire cas), et une image prise pendant un recul de 60 cm (`-marche`). Vues : tronc à 0,5 m, bloc de grès à 1 m, mur de la maison de la fiche 05 à 2 m (pose calculée sur la boîte du mur), objet de 20 cm vu à 1,5 m, façade de San Francisco à 2 m, maison du village la nuit à la lampe, mur du cimetière, et une pièce fermée (quatre murs et un plafond autour de la caméra). Sur toutes, aucune surface pleine ne laisse voir le ciel ou ce qui est derrière, à l'arrêt comme en marche ; dans l'image neuve, il reste le bruit d'un seul échantillon de lumière par pixel (soleil, ambiance), que l'accumulation lisse. Avec la page de main, la même pose devant la maison montrait des trous noirs dans le mur et un objet de 20 cm déformé (`PAGE=… node tools/v3gros.mjs`).

Objets fabriqués en cours de partie (`objetMeneur`, ajoutés à la fiche après le début de la scène) : `buildShapes` remet à jour le nombre de formes (`S.objRows`) que `v3Proches()` relit à chaque image ; l'objet est donc dessiné en boîte dès l'image suivante, quelle que soit sa taille. Vues `noix06` et `noix16` de `tools/v3gros.mjs` : un objet de 3 formes de 3 à 10 cm (« crotte de la taille d'une noix »), créé sur le sentier une fois la scène lancée, vu accroupi à 0,74 m et debout à 1,66 m : plein et net, à l'arrêt, en image neuve et en qualité complète (`out/v3gros-complet/noix16-arret.png`). Une forme minuscule posée au sol est prolongée sous terre par `ancrer()` (2 m) : sa boîte est haute, mais la marche du pixel trouve la surface au-dessus du sol. Le cas signalé sur Intel Arc (objet invisible à ses pieds) n'est pas reproduit en rendu logiciel ; le cadrage (objet hors du champ) est traité ailleurs.

Ce qui reste :
- Au-delà de la fenêtre des proches (une dizaine de mètres), les éléments sont en grains : dans le cimetière, les tombes à 15-30 m, dans la brume, ont des bords hauts flous à l'arrêt (le lanceur de rayons ne les montre d'ailleurs presque pas : il les perd dans la brume).
- Branches et feuilles restent en grains, même de près (pas des surfaces pleines).
- Le coût des proches sur téléphone n'est pas mesuré : en pire cas (fiche à quatre couches de semis aux petites cellules et 64 formes d'objets), plusieurs centaines de milliers de sommets en plus des grains.

## Vers 30 images par seconde sur téléphone (branche `v3perf`, 19 novembre 2026)

Point de départ, mesuré par Toine (Mali-G77, Chrome, qualité mobile, 252 × 456 en interne, écran 432 × 781) : 15,9 images/s en marche, environ 63 ms par image, dont déplacement 7,6 ms, rendu du monde 42,6 ms, capteur et écran 10,9 ms. À l'arrêt : passe plein écran matière et lumière ≈ 24 ms, tampon G « sol seul » ≈ 13 ms. Objectif : 33 ms tout compris, sans perdre la ressemblance avec `ref/`. Rien de ce qui suit n'est mesuré sur le téléphone : seul le rendu logiciel (SwiftShader) était disponible, où les proportions diffèrent (semis cher, pixels bon marché). Les gains sur Mali sont des estimations ; le bouton Mesurer est fait pour les vérifier.

### Ce qui a changé, poste par poste

Toutes les optimisations ne concernent que la qualité mobile (sauf les lectures différées, partout). Chacune se coupe par une option (`CFG`, ou dans l'adresse sur le téléphone : `index.html#v3&v3tapis=0`), et le bouton Mesurer les coupe tour à tour pendant la marche.

| Poste | Avant | Après | Option pour revenir |
|---|---|---|---|
| Attente de la puce à chaque image | `v3Sync()` en fin de `v3Image` : le processeur attend que la puce ait tout fini, la puce attend ensuite les ordres de l'image suivante | aucune (sauf mesure) ; `V3.ms` devient l'intervalle entre deux images | `v3sync` |
| Sonde de collision | `readPixels` bloquant toutes les 120 ms, à chaque image près d'un obstacle | lecture différée (PBO + `fenceSync`), réponse 1 à 3 images plus tard ; près d'un obstacle on sonde 12 cm devant, là où l'on sera | `sondeSync` |
| Obstacles devant (meneur, 2 fois par seconde) | trois sondes bloquantes | trois lectures différées, la dernière réponse arrivée | `sondeSync` |
| Exposition automatique | `readPixels` bloquant du halo toutes les 180 ms | lecture différée | `expoSync` |
| Maillage du sol | 192 × 96 quadrilatères sur tout le tour, 6 sommets calculés par quadrilatère (110 592 sommets, 5 `terrainH` chacun) | sommets partagés (tampon d'indices, rangés secteur par secteur), secteurs limités au cap utile : environ 80 secteurs vers l'avant, ≈ 8 000 sommets distincts | `v3solPlein` |
| Matière du sol | `recette()` par pixel et par image (litière, sentier, bord du trajet, mousse, relief) | **tapis du sol** : cuite dans des textures ancrées au monde, lue en 2 lectures filtrées (4 au fondu entre niveaux) | `v3tapis` |
| Ombre de la canopée au sol (`canopyT` vers le soleil) | 6 pas × 2 bruits 3D par pixel et par image | cuite dans le même tapis (moyenne de 4 tirages, sans bruit) | `v3tapis` |
| Troncs, perches, rochers, objets en marche | tout recalculé à chaque image | **damier** : blocs de 8 × 8 pixels ombrés une image sur deux, l'autre relit l'historique reprojeté ; part d'image neuve 1 − (1 − a)² pour la même réponse dans le temps | `v3damier` |
| Accumulation | RGBA32F, lue texel par texel | RGBA16F filtrable : moitié moins d'octets écrits par l'ombrage, relus par la reprojection et le capteur | `v3acc32` |
| Capteur (`camera.frag`) | 7 lectures bilinéaires faites à la main = 28 `texelFetch` RGBA32F + halo | 7 lectures filtrées par la puce + halo (8 en tout) ; même calcul, même image | `capteur4` |

### Le tapis du sol

Au sol, la matière ne dépend que du point du monde (recette du sol, trajet, mousse, relief) : rien ne justifie de la recalculer à chaque pixel de chaque image. `v3_tapis.frag` la cuit dans deux tableaux de textures RGBA8 (racine de l'albédo et brillance ; inclinaison du relief, émission, transmittance de la canopée vers le soleil), 7 niveaux de 512 × 512 texels, texel de 1 cm au niveau 0 doublé à chaque niveau (fenêtres de ±2,5 m à ±160 m autour de la caméra). Mémoire : 14,7 Mo.

- **Générique** : c'est le même code que l'ombrage (même choix de recette, même fondu du trajet, un seul appel à `recette()`) ; toute recette de sol, y compris écrite par l'IA, est cuite pareil. La cuisson est refaite quand ce dont elle dépend change (graine, recettes, relief, trajet, soleil, canopée).
- **Tapis roulant** : chaque niveau est un tore (le texel du monde I est rangé en I mod N). Quand la caméra avance, seules les bandes de 16 texels qui entrent dans la fenêtre sont cuites. En marche à 1,35 m/s et 30 images/s, cela fait en moyenne ≈ 4 600 texels par image tous niveaux confondus (4 % des pixels de l'image), en bandes ; tourner la tête ne coûte rien (la fenêtre suit la position, pas le regard).
- **Par tranches** : au premier remplissage (ou après un saut de plus d'une demi-fenêtre), un niveau se cuit par lignes dans un budget de 32 768 texels par image (`v3tapisBudget`), soit 56 images pour tout le tapis. Tant qu'un niveau n'est pas prêt, l'ombrage revient à `recette()` pour ses pixels : l'image est la même, seulement plus lente pendant deux secondes.
- **Niveau choisi** par la taille du pixel au sol (distance, angle rasant), comme un niveau de mipmap, avec un fondu entre deux niveaux ; `v3tapisBias` (−0,5) penche vers le plus fin. Un niveau grossier contient des échantillons de la recette fixés au monde : au loin, le sol ne scintille plus quand on marche.
- **Ce qui se voit** : rien à l'arrêt ni en marche sur la planche (`out/v3perf-planche.png`, `node tools/v3perf.mjs`). Écart moyen après flou 5 × 5 entre v3 mobile avant et après : 2,2 (a-sentier), 1,7 (b-troncs), 2,8 (c-litière), 2,7 (marche, 2 m), sur 255 ; à `ref/`, l'écart reste le même qu'avant (13,6 contre 13,7 ; 13,1 contre 13,3 ; 15,4 contre 15,0). Pas de couture visible entre niveaux, pas de saut quand le tapis avance. Le premier plan à moins de 1 m est légèrement plus doux (texel de 1 cm filtré pour un pixel de 0,6 cm) : caché par le grain et la compression du capteur.

### Opérations par pixel, avant et après (qualité mobile)

Comptées dans le code pour les recettes de la forêt (un « bruit 2D » = 4 hachages, un « bruit 3D » = 8 ; « lectures » = lectures de texture).

| Passe, pixel | Avant | Après |
|---|---|---|
| Ombrage, sol de litière | ≈ 16 bruits 2D + 1 Voronoï 3 × 3 (≈ 82 hachages), ≈ 45 lectures de `uMats` ; `canopyT` soleil : 12 bruits 3D ; `canopyT` ambiance : 12 bruits 3D ; `pres()` × 2 ; 4 lectures de carte d'ombres ; 2 lectures G ; 4 lectures de reprojection (RGBA32F) | 2 lectures filtrées du tapis (4 au fondu) ; `canopyT` ambiance, `pres()`, ombres, G inchangés ; reprojection en RGBA16F |
| Ombrage, sentier | ≈ 25 bruits 2D + Voronoï ; au bord du trajet, fbm du bord (5 bruits) et deux recettes | idem sol : 2 à 4 lectures |
| Ombrage, tronc de pin | ≈ 8 bruits 3D (nuance, fissures, relief par différences finies : 4 appels de `recetteH`, grain, mousse), ≈ 50 lectures de `uMats`, plus la lumière | à l'arrêt : inchangé ; en marche : la moitié des blocs ne fait que 4 lectures de reprojection |
| Cuisson du tapis, par texel cuit | — | une recette de sol + 4 `canopyT` (≈ 48 bruits 3D) ; ≈ 4 % des pixels par image en marche |
| Capteur, par pixel de l'écran | 28 `texelFetch` RGBA32F (448 octets) + 1 lecture du halo, 7 hachages | 7 lectures filtrées RGBA16F + 1, 7 hachages |
| Tampon G, sol | 110 592 sommets × 5 `terrainH` | ≈ 8 000 sommets distincts × 5 `terrainH` (plus les reprises du cache de sommets) |

Rendu logiciel (b-troncs, à l'arrêt, attente réelle, même machine) : ombrage 197 ms sans tapis, 160 ms avec. SwiftShader paie environ 120 à 160 ms fixes pour toute passe plein écran (une passe vide en coûte autant) : sur la part qui dépend du calcul, le tapis en enlève plus de la moitié. Par un découpage du shader (`v3prof`), `recette()` représente ≈ 60 % de la part variable de l'ombrage et le sol les deux tiers de `recette()` ; la lumière (`canopyT`, `pres`) pèse peu en rendu logiciel. Cuisson : 6,8 ms pour 10 000 texels, soit la moitié du coût d'un pixel ombré. Capteur seul à 270 × 480 : 15,8 ms au lieu de 18,2.

### Estimation honnête sur Mali-G77

| Poste mesuré par Toine | Avant | Estimation après | Pourquoi, et ce qui est incertain |
|---|---|---|---|
| Déplacement (sonde) | 7,6 ms | < 0,5 ms | presque tout était de l'attente (quatre pixels de calcul) ; sûr |
| Attente de fin d'image | cachée dans « rendu » | 2 à 8 ms gagnés | le processeur prépare l'image suivante pendant que la puce finit ; dépend de l'aller-retour de Chrome sur Android, inconnu |
| Ombrage | ≈ 24 ms | ≈ 12 à 15 ms | sol (souvent la moitié de l'image) sans `recette()` ni `canopyT` soleil, damier sur les troncs. Incertain : le shader garde tout le code de `recette()` (pour les troncs) ; si Mali est limité par le nombre de registres plutôt que par le calcul, le gain sera moindre |
| Tampon G, sol | ≈ 13 ms (avec la synchronisation) | 1 à 3 ms gagnés | le maillage était probablement déjà bon marché ; ce qui reste est sans doute le vidage et l'aller-retour de lecture |
| Capteur, écran | 10,9 ms | 3 à 8 ms | le temps ne suivait pas la taille de l'écran : une bonne part est sans doute l'attente du tampon d'affichage ou la lecture de synchronisation elle-même. La ligne « Capteur » de Mesurer (passe seule, sur une cible hors écran, aller-retour retranché) tranchera |

Total estimé : 38 à 45 ms par image, soit 22 à 26 images/s. Les 30 images/s ne sont probablement pas encore atteintes ; les quatre premières lignes de Mesurer (« une optimisation coupée à la fois ») diront lesquelles comptent vraiment sur ce téléphone.

### Le bouton Mesurer en v3

En plus de ce qu'il affichait : images/s en marche avec chaque optimisation coupée tour à tour (3 s chacune) et le nombre de texels cuits par image ; ombrage avec et sans tapis à l'arrêt ; coût de la cuisson pour 10 000 texels (attente sur la couche du tapis cuite en dernier, lue en octets) ; passes seules, médiane de 7, avec l'aller-retour d'une lecture à vide mesuré à part : capteur (sur une cible de la taille de l'écran), capteur à 4 lectures, halo et exposition, sonde bloquante. Pour comparer à la main : `#v3&v3tapis=0`, `#v3&v3damier=0`, `#v3&sondeSync=1&expoSync=1&v3sync=1`.

### Suite proposée

1. Mesurer sur le téléphone (bouton Mesurer en v3, qualité mobile) et lire les lignes « une optimisation coupée à la fois » et « passes seules ».
2. Si l'ombrage reste lourd : sortir `recette()` du shader d'ombrage dans une passe « matière » à part (troncs, rochers, objets), pour que la passe de lumière, plus petite, occupe mieux la puce ; et calculer l'ambiance (`canopyT` dans une direction tirée, `pres`) à demi-résolution.
3. Si le capteur reste à 10 ms quelle que soit la taille : c'est l'attente de l'affichage, pas le shader ; ne plus la compter, ou alléger la composition (canvas sans `preserveDrawingBuffer`, déjà le cas).
4. Le même tapis pour les semis au sol plats (marquage, pavés) quand le semeur saura les semer.

## Fidélité de la forêt (branche `fidelite`, 19 novembre 2026)

But : la forêt des Grands Avaux (Champcueil) en automne, en qualité complète sur PC, pour une démo. Tout est générique : recettes en données, sous-bois en couches de `semis`, trois mots de vocabulaire en plus. Le fragment `essais/champcueil-sous-bois.json` (à fusionner dans la fiche 09) porte les réglages ; `scenes/01` n'est pas modifiée.

### Constats sur le lieu (recherche, sans image importée)

1. Blocs de grès arrondis, émoussés, gris clair à beige (sable de quartz cimenté), en chaos et en platières (dalles plates au sommet, mares temporaires).
2. Surface patinée : croûtes brunes, grises et noires, surtout dans les creux et sous les surplombs ; lichens en mosaïques vert-gris et jaune orangé, d'autres gris-brun qui se fondent dans la pierre ; mousse et algue verte côté humide et au pied.
3. Sentiers de sable blanc presque pur (95 à 99 % de silice), tassé, tenu par les racines des pins.
4. Pin sylvestre : haut du tronc orangé à saumon, en fines écailles ; bas gris-brun, en grosses plaques séparées de sillons profonds.
5. Bouleau verruqueux : blanc lisse et un peu brillant, taches noires avec crevasses, pied qui noircit et se fissure en vieillissant.
6. Chênes (pédonculé, pubescent), taillis de châtaignier en cépées (un châtaignier à cinq troncs est signalé sur le parcours), pinèdes.
7. Fougère aigle : grandes frondes triangulaires, brunes à rousses en automne, qui se couchent sur le sol.
8. Lande à callune et bruyère cendrée sur les platières, colonisée par les bouleaux.
9. Litière (observation commune, non sourcée) : feuilles de chêne et de châtaignier rousses, de bouleau jaunes, aiguilles, branches mortes.

### Ce qui a changé

| Écart (rendu avant) | Correction générique |
|---|---|
| Litière en polygones jointifs (Voronoï), plate | Motif `feuilles` avec `forme` > 0 : de vraies feuilles en fuseau, plus larges à la base, une part lobée (`lobes`), qui se recouvrent (la feuille du dessus parmi les neuf cellules voisines), bords relevés ; bosses du sol en relief de matière. Recette `litiere-automne`. |
| Grès lisse, taches en camouflage | `gres-fontainebleau` : patine sombre plus forte vers le haut, rosettes de lichen pâle, lichen vert, petits creux sombres, bosses à deux échelles et grain de surface (relief de matière, sans toucher à la forme). `gres-eclat` (sans mousse) pour les cailloux. |
| Sentier gris uniforme | `sable-blanc` : sable blanc tassé, traînées plus claires, humus en bordure, quelques feuilles. |
| Troncs identiques d'un arbre à l'autre | `foret.variete` (0 à 1) : chaque arbre décale les motifs de son écorce et prend sa teinte (`troncVar`, `recette.glsl`, les deux moteurs). 0 par défaut : rien ne change. |
| Pin aux fissures en vers, sans orangé | `ecorce-pin-sylvestre` : fissures étirées en hauteur, orangé par plaques au-dessus de 3,5 m. |
| Bouleau à pied gris uniforme | `ecorce-bouleau-verruqueux` : lenticelles, taches noires, pied noir crevassé irrégulier. |
| Aucun sous-bois | Quatre couches de `semis` : fougère aigle (5 frondes + une couchée, `boite` mince découpée en peigne), callune (5 rameaux dressés en éventail), branches mortes (4 capsules couchées), éclats de grès à demi enterrés. |

Vocabulaire ajouté (`fiche-de-lieu.md`) : `dents` sur une forme (découpe en peigne le long de x, contour en fuseau : `sdPrim` dans `monde.glsl`, le type porte 8 × dents) ; `forme` et `lobes` du motif `feuilles` ; `foret.variete`. Les vues de `ref/` ne bougent pas : écart après flou entre main et cette branche, même pose, même machine, 1,60 sur `b-troncs` (plancher de bruit 1,53) ; aucune fiche de `scenes/` n'utilise les nouveaux champs.

### L'ombrage n'a plus `sdSemis`

Sur Direct3D, l'ombrage ne compilait plus avec `sdSemis` déplié (main, variante `SEMO`). Le semeur (`semeS`) et les proches (`v3_proches.frag`) écrivent maintenant dans le tampon G le point dans le repère de l'élément et la forme touchée (code 6 + (6 × couche + forme + 0,5) / 48) ; l'ombrage (`semisPix`) ne retrouve que la cellule et ses deux tirages (`semisH`, `semisH2`, partagés avec `semisElem`) : ni boucle sur les formes, ni `terrainH`, ni `cleared`. Taille de l'ombrage traduit par ANGLE (rendu logiciel, sans tapis) : variante à semis 509 736 caractères sur main, 477 079 ici ; variante sans semis 450 728 sur main, 457 688 ici (peigne et `troncVar`).

### Ce qui coûte

Rien de neuf par image en dehors des recettes, évaluées une fois par pixel : la litière superposée parcourt neuf cellules comme le Voronoï d'avant ; le grès a deux bosses et un grain (sa première version, avec des creux en relief, faisait tomber Chrome en rendu logiciel sur un bloc plein écran : allégée). Les couches de semis entrent dans le budget fixe de grains. En qualité mobile, le sol passe par le tapis (cuit une fois). Rien n'est mesuré sur un vrai GPU.

### Ce qu'on voit, et ce qui trahit encore

Planches (`tools/fidelite.mjs` puis `tools/fidelite-planche.mjs`, qualité complète, 6 images accumulées, rendu logiciel) : sept poses PC 1280 × 800 (sentier à z 0, 22, 40, 56, sol, rocher, marche) et huit en portrait 450 × 800 (gros plans à 1 m : sol, rocher, bouleau, pin, haut du pin, chêne ; sentier ; marche). Mieux : la litière (des feuilles, plus des pavés), le sable blanc, le grès (moins de camouflage, lichens, patine), le bouleau (noir au pied, lenticelles), le pin orangé en hauteur, les troncs qui ne se ressemblent plus, les branches mortes et les éclats de grès qui cassent le sol nu. Trahit encore : de près, la fougère (des plans raides découpés en peigne, qui se lisent comme de la vannerie) et la callune (boules hérissées sombres) ; le grès reste une ellipsoïde lisse de silhouette, avec un liseré sombre au bord ; l'écorce du pin à 1 m a des plaques molles ; feuilles de la canopée en points (hors de ce lot).

## Échelle de l'ombrage (branche `echelle`, 19 novembre 2026)

Sur un PC Windows (Chrome, RTX 5070, ANGLE → Direct3D 11, compilateur FXC), la variante complète de l'ombrage ne finissait pas de se compiler : la page restait sur « La préparation du moteur dure anormalement… en attente : v3 ombrage », et Chrome est tombé au moins une fois. Quelle que soit la cause, la page ne doit plus jamais rester sur un écran d'attente : c'est la finesse qui s'adapte (triptyque, point 2).

### Deux tailles d'ombrage

- **Le socle** : `v3_ombrage.frag` compilé avec `#define SOCLE` (variante fixe, gardes `#ifdef SOCLE` dans `v3_ombrage.frag` et `recette.glsl`, aucun code généré, `recette()` toujours appelée une seule fois). Il garde le soleil et la carte d'ombres, la canopée, l'ambiance, le ciel (aube comprise), la brume uniforme, la matière en recette et la lampe. Il coupe : tapis, semis en détail (la forme touchée suffit, à l'échelle moyenne de sa couche), atmosphère (brume basse, rebord) et rais, ombre de la lampe, eau à l'horizon, lointain, cœur de feuillage des conifères (une teinte), assombrissement au pied des troncs (`pres`), normale des formes par différences (la normale du monde), et dans `recette()` : relief de matière par différences finies, feuilles superposées et lobées (le Voronoï d'origine les remplace), fenêtres et marquage, la quatrième tache, et le bruit en volume passe de quatre à deux octaves (même moyenne : les seuils des recettes restent justes).
- **La variante complète** : celle d'avant, choisie par la fiche et la qualité (`TAPIS`, `SEMO`, `ATMO`, `RAIS`).

Tailles (`node tools/ombrage-taille.mjs`, et `node tools/ombrage-taille.mjs d1a02e0^1` pour l'ombrage qui se compilait sur ce PC) ; « déplié » recopie chaque fonction à chaque appel et chaque boucle à borne fixe autant de fois, comme le fait FXC ; SPIR-V : traduction d'ANGLE en rendu logiciel. Ce sont des mesures relatives, pas Direct3D.

| Variante | source après inclusions | déplié | SPIR-V |
|---|---|---|---|
| socle | 73 104 | 315 290 | 318 707 |
| complète, forêt (sans semis ni atmosphère) | 73 088 | 966 725 | 485 051 |
| complète, fiche 09 sur PC (S1 A1 R10) | 73 089 | 1 007 645 | 534 957 |
| complète, fiche 09 sur téléphone (T1 S1 A1) | 73 088 | 996 737 | 541 749 |
| ancien ombrage qui compilait sur le PC (`d1a02e0^1`) | 59 225 | 968 045 | 506 617 |

Le source envoyé est le même texte pour toutes les variantes (le préprocesseur trie) ; une fois déplié, le socle fait le tiers de l'ancien ombrage qui marchait. Le gros de l'écart : le relief de matière (quatre évaluations de `recetteH`, chacune avec ses taches et ses fissures), les octaves de bruit et `pres`.

### Au démarrage, et à chaque fiche ou qualité

`v3Ombrage()` (`src/main.js`) et l'automate pur `src/echelle.js` (testé par `tests/echelle.test.mjs`) :

1. Les six programmes du semeur, puis le socle ; la première image est dessinée dès que le socle est prêt.
2. La variante complète voulue se compile en arrière-plan (`lancer()`/`fini()`, sans bloquer) pendant l'écran d'ouverture, ou, hors ouverture, au calme : pas avant 12 s après la première image (`OMB.calme`, option `ombrageCalme`), ni pendant la frappe ou un dialogue ; la ligne d'état dit alors discrètement « IMAGE COMPLÈTE… ». Le tapis du sol (qualité mobile) va avec elle. Prête, elle remplace le socle à chaud : `V3.n = 0`, comme un mouvement, l'historique reprojeté se fond dans la nouvelle image en quelques images, sans éclair.
3. Délai (`DELAI_OMBRAGE`, 40 s) compté sur la compilation RÉELLE de la variante (`e.cours`) : ni pendant qu'une autre compilation est en vol (la file n'en compile qu'une à la fois), ni pendant l'écran d'ouverture, ni page cachée. Dépassé : on reste au socle sans message, la file est libérée, mais la compilation continue en fond et la variante sert si elle finit. Erreur de compilation : on reste au socle.
4. Mémoire `localStorage` `bodycam-ombrage`, par signature (réglages de la variante + empreinte du source entier : un shader modifié se retente de lui-même) : « en cours » avant le lancement, « ok » et la durée à la réussite, « echec » (délai, erreur, interrompu). Une signature encore « en cours » au chargement suivant devient « echec (interrompu) » ; la perte du contexte WebGL la note « interrompu » tout de suite ; une fermeture normale de la page (`pagehide` : rechargement, onglet fermé) l'oublie. Seuls « interrompu » et « erreur » interdisent durablement la variante sur cette machine ; un « délai », même mémorisé par une ancienne version de la page, ne l'empêche pas d'être retentée au chargement suivant.
5. Changement de fiche ou de qualité : si la variante complète voulue est déjà compilée, elle sert tout de suite ; sinon le socle (déjà compilé) sert, et la montée recommence.

Le message « La préparation du moteur dure anormalement » ne peut plus venir que du semeur ou du socle. Remise à zéro : « Plus » → « Image complète : réessayer » (visible seulement s'il y a un échec mémorisé ; efface la mémoire et recharge), ou `balade.reessayerOmbrage()`. Diagnostic (trois touches sur le chrono REC, et l'écran d'erreur) : ombrage en service, durées de compilation du socle et de la complète, mémoire. `balade.ombrage()` rend le même état.

Options : `ombrage` = `"socle"` (rester au socle), `"plein"` (attendre la complète avant la première image : le comportement d'avant, par défaut quand `window.__CFG` existe, pour ne pas changer les captures de référence), `"echelle"` (défaut de la page) ; `ombrageJamais` (échec simulé), `ombrageDelai` (ms).

### Vérifié en rendu logiciel (`node tools/ombrage-essai.mjs out/ombrage`, fiche 09, 640 × 400, qualité complète)

- `plein.png` : comportement d'avant (première image après la complète). `socle.png` : la même pose au socle, une forêt crédible, plus plate : ni brume basse éclairée ni rais (le contre-jour est plus clair et plus net), grès sans relief de matière, litière en Voronoï au lieu de feuilles lobées, pas d'assombrissement au pied des blocs.
- Montée (`ombrage: "echelle"`) : socle en service à 0,4 s, première image ; la complète se lance après elle, prête en 15,6 s (SwiftShader), en service sans éclair ; `montee-apres.png` est identique à `plein.png`. Mémoire : « ok, 15,6 s ».
- Échec simulé (`ombrageJamais`, délai 20 s) : reste au socle, pas de message, pas d'écran d'attente (`echec-page.png`, l'interface normale) ; mémoire « échec (délai) », bouton de remise à zéro visible.
- Rechargement pendant la compilation (« en cours » en mémoire) : au chargement suivant, « échec (interrompu) », aucun nouvel essai, socle, bouton visible (`recharge-page.png`).

Non vérifié : rien n'a tourné sur Direct3D ni sur un vrai GPU. SwiftShader compile le socle « en 0,0 s » (la compilation y est différée au premier dessin) : les durées n'y disent rien de FXC. On ne sait pas si le socle passe sur le PC concerné ; il est trois fois plus petit déplié que l'ombrage qui y passait. Sans `KHR_parallel_shader_compile`, la compilation de la complète bloque la page le temps qu'elle dure (le délai ne peut pas l'interrompre) ; la mémoire protège quand même des plantages.

## Arbres habités et relief (branche `arbres`, 20 novembre 2026)

Retour sur téléphone de la fiche 09 (Champcueil à l'aube) : « les arbres sont trop dépouillés et ça manque d'un peu de relief ». Les troncs étaient des poteaux à trois branches sous une canopée de confettis (`feuillage` 0,45 : à 0,7 la canopée statistique éteignait le soleil rasant), et le sol presque plat là où le lieu réel est un chaos de buttes gréseuses.

### Houppiers (`foret.houppiers`, variante `HOUPPIER` du semeur)

Un port par écorce (arbres a et b, perches a et b), décrit par des nombres que l'IA écrit pour n'importe quel arbre (`fiche-de-lieu.md`, « Houppiers ») : hauteur du houppier sur le tronc, largeur, profil ovale ou en plateau, charpentières (nombre, montée, retombée), rameaux, masses de feuillage (taille, remplissage, taille des feuilles, trois couleurs). `monde.glsl` calcule la charpente (`charpente`, `rameau`, `masse`, tirages de la cellule de l'arbre) ; `v3_grains.vert` (`semeHoup`) y pose les grains :

- bois : les deux segments de chaque charpentière et ses rameaux, en cylindres vus de face comme les branches d'avant ;
- feuillage : chaque masse est faite de quatre bouquets séparés (le ciel passe entre eux), semés surtout sur leur face vue ; la feuille est fixée au monde (cellule de la taille d'une feuille, présente ou non, couleur et orientation tirées de la cellule), les trouées suivent un bruit à l'échelle du bouquet avec un seuil franc (paquets denses, vides francs), le bord de la silhouette s'effiloche ;
- vue du soleil, les mêmes feuilles et les mêmes trouées : la carte d'ombres laisse passer les rais entre les masses, pas à travers un voile ;
- vue de la caméra, chaque feuille lit son ombre dans la carte d'ombres de l'image (`texelFetch`, déjà semée) : à l'ombre, sa normale est couchée perpendiculaire au soleil (l'ombrage ne lui donne plus que l'ambiance) et sa couleur un peu relevée (la lumière qui traverse les feuilles voisines). Rien n'est ajouté à `v3_ombrage.frag` : la feuille passe par le `shadeLeaf` existant (code 5) ;
- `v3_gbuf.frag` découpe la feuille d'un houppier en ellipse allongée, tournée par feuille (les feuilles de la canopée d'avant restent rondes).

Le budget de grains ne change pas : l'aire du houppier (bois et masses, `aireHoup`, même estimation en JS `aireHoupJS`) entre dans le partage entre familles ; avec des houppiers, plus de feuilles de canopée semées (`fF` = 0). Le lanceur de rayons ne connaît pas les houppiers (trois branches et canopée d'avant).

Fiche 09 : pin sylvestre (houppier en plateau dans le dernier tiers, vert sombre, tronc nu dessous), chêne sessile (charpentières montantes, masses rousses clairsemées), bouleau (ramure retombante, feuilles jaunes rares), jeune hêtre marcescent (feuilles rousses dès le bas). `feuillage` passe à 0,2 : la canopée statistique ne double plus l'ombre des masses.

### Bosses et buttes (`relief.bosses`, `relief.buttes`, variante `RELIEF`)

`reliefDetail` (`monde.glsl`, et la même formule dans `src/main.js`, au bit près : bruit de valeur sur un réseau entier haché en entiers non signés, `Math.imul` côté JS) ajoute à `terrainH` des bosses (deux octaves tournées, creux et bosses de 0,5 à 2 m sur 5 à 20 m) et des buttes (un bruit lent passé par un seuil doux : flanc puis plateau, au second plan). Le trajet garde une part réglable de chacun (le sentier monte et descend, passe entre les buttes), et `trajet.creux` va jusqu'à 1,2 m (sentier encaissé entre deux talus). Le porteur, les objets et la sonde suivent : tout passe par `terrainH`. Le pas du lanceur de rayons (`terK`) et le plafond `yTop` tiennent compte de la pente et de la hauteur ajoutées.

Variante compilée seulement si la fiche en demande (`RELIEF`) : semeur, sol, proches, tapis du sol, sonde, lanceur de rayons. **Pas l'ombrage** : il garde le `terrainH` d'origine (Direct3D). Ce qu'il calcule faux sur le relief ajouté : la hauteur au-dessus du sol d'un bloc de grès (salissure et lichens au pied, décalés de la hauteur de la bosse), l'assombrissement près des troncs et des blocs (`pres`, qui n'existe pas au socle), et la hauteur de la canopée statistique hors de la carte d'ombres.

### Taille de l'ombrage

`node tools/ombrage-taille.mjs`, avant (main 564cab0) et après : actif, déplié et SPIR-V identiques pour les quatre variantes (socle 35 740 / 315 290 / 318 707 ; fiche 09 PC 38 708 / 1 007 645 / 534 957 ; fiche 09 mobile 39 483 / 996 737 / 541 749). Seul le source envoyé grossit (+6,3 k caractères : les sections `#if HOUPPIER` et `#if RELIEF` de `monde.glsl`, retirées par le préprocesseur).

### Feuilles lisibles de près (20 novembre 2026, suite)

De près (moins de 10 m), les bouquets se lisaient comme des boules de pop-corn brun tachées de noir : chaque grain tombait n'importe où sur la coque du bouquet, à la taille du grain, et la coque se remplissait ; à l'ombre (le devant d'un bouquet en contre-jour est à l'ombre de son propre arrière), la normale couchée éteignait toute lumière.

- **Une feuille par cellule du monde, dessinée entière** (`semeHoup`, `v3_grains.vert`). Le grain prend la cellule (côté `taille`) où il tombe ; la place de la feuille dans la cellule, sa longueur (0,6 à 1,5 fois `taille`), son orientation, sa couleur et sa présence (trouées, jours, bord) ne dépendent que de la cellule : tous les grains qui y tombent dessinent la même feuille, au même endroit, d'une image à l'autre. De près, plusieurs grains par feuille sont inutiles : on en garde six en moyenne (`s²/taille²`).
- **Limbe en fuseau** (`v3_gbuf.frag`) : pointu aux deux bouts, plus large vers la base, tourné, et aminci quand on le voit de biais (`|n·v|`, porté par `vDy.z`).
- **Au loin**, une feuille de moins de 3 à 9 pixels est agrandie (jusqu'à 1,7 fois) et arrondie : la masse reste pleine, comme avant.
- **Translucidité en contre-jour** : une feuille à l'ombre dans la carte d'ombres, vue du côté opposé au soleil, garde une part de lumière transmise qui décroît avec l'épaisseur de feuillage traversée (lue dans la carte, `exp(-e/0,9 m)`). Rien n'est ajouté à `v3_ombrage.frag` : la normale de la feuille est inclinée pour que `shadeLeaf` (terme de transmission chaud existant) donne cette part.
- **Contour déchiqueté** (bruit à deux échelles), plus de feuilles dans l'épaisseur du bouquet.
- **`inegal`** (nouveau champ d'un port, 0 par défaut : rien ne change) : un arbre sur quatre presque nu, les autres plus ou moins garnis, bouquets de tailles et de remplissages inégaux, petits jours dans chaque bouquet ; quelques feuilles isolées tiennent toujours (3 % des cellules). Fiche 09 : pin 0,2, chêne 0,85 (feuilles 0,68), bouleau 0,9, hêtre 0,5.

Images (`node tools/arbres.mjs`, `MARCHE=7` pour sept images de marche) : avant `out/apres5/`, après `out/apres7/` (face, dos, haut, pieds, tel-face, tel-haut, marche-pc-1 à 7, marche-tel-1 à 7). De près, on lit des feuilles rousses orientées, translucides en contre-jour, le ciel et les rameaux entre elles ; à mi-distance, des arbres inégaux, certains presque nus ; les pins gardent leurs masses.

Vérifications (rendu logiciel) : marche de 3 m en PC et téléphone, sept images de suite : sol suivi (caméra = `terrainH` JS + hauteur d'œil ; vue des pieds à l'échelle de la litière), feuilles fixes dans le monde, pas de scintillement des houppiers, mais en marche les feuilles lointaines sont des carrés de 1 à 2 pixels (pointillé visible au téléphone). Fiches 01, 04, 06 contre 564cab0, mêmes poses, même machine : écarts après flou 1,46 à 2,15 sur la 01, pour un plancher de bruit (même code rendu deux fois) de 1,69 à 2,11 ; 0,37 à 0,73 sur les 04 et 06. Lanceur de rayons sur la fiche 09 : rend (trois branches, relief, sans houppiers). Taille de l'ombrage : actif, déplié et SPIR-V inchangés pour les quatre variantes (source +11 caractères de commentaire).

## Soleil bleu (branche `soleil`, 20 novembre 2026)

Sur un PC (Chrome, Direct3D 11, qualité complète, fiche 09), le disque du soleil s'affichait bleu vif. Reproduit en rendu logiciel en imposant l'exposition du capteur (`node tools/aube.mjs dossier vues plein-soleil` avec `SZ=30 EXPO=6`, option `expoFixe`) : ce n'était pas Direct3D mais l'exposition, plus haute sur ce PC. Cause : dans `camera.frag`, la courbe en S `mix(c,c*c*(3-2c),.3)` recevait des valeurs au-dessus de 1 ; au-delà de 2 environ (après gamma), elle devient négative. Le rouge du disque, le plus fort, s'éteignait d'abord, puis le vert : il restait le bleu (pixels mesurés à 0, 92, 255).

- Capteur : tout ce qui dépasse le blanc part vers le blanc (écrêtage d'un photosite saturé, `smoothstep(1,3,max)`), et la courbe en S ne voit plus que [0, 1]. Le disque est blanc, le halo blanc chaud ; les hautes lumières moyennement surexposées ne sont plus assombries par la courbe.
- Robustesse : entrées du capteur nettoyées (`sain()` : +inf → très clair, NaN → noir), disque plafonné à 100 dans `skyCol`, `ca` bornée avant `pow` dans `skyAtmo`. L'ombrage écrêtait déjà à [0, 60] et nettoyait les NaN. Option `v3acc16` : accumulation en RGBA16F réel en qualité complète (`ACC16=1` dans `tools/aube.mjs`) : même image.
- Taille de l'ombrage : déplié +42 à +84, SPIR-V +277 (deux `min`/`clamp` dans `monde.glsl`).
- Fiches 01 et 02 (nuit) en v3 : identiques à l'œil (écart après flou 1,98 et 0,59, dans le bruit). Rien n'est vérifié sur Direct3D.

## Bougé au lieu de pixels (branche `pixel`, 20 novembre 2026)

Retour sur téléphone (fiche 09, qualité mobile) : net à l'arrêt, « ça pixellise au déplacement ». Reproduit pas à pas (`node tools/pixel.mjs dossier`, image de 33 ms, marche 1,4 m/s, rotation 60°/s, les deux ; écran 360 × 651 à ×3, interne 252 × 456, capteur 315 × 570 agrandi ×3,43 par le navigateur ; planches par `tools/pixel-planche.mjs`).

- **Cause** : les grains (feuilles des houppiers surtout, troncs et branches fines) sont des carrés à bord franc de 2 à 4 pixels internes. À l'arrêt, le décalage sous-pixel et l'accumulation les anticrénèlent ; en marche, il n'y a ni décalage ni historique à leur bord (l'historique d'un autre objet, le ciel derrière la feuille, est rejeté par la distance), et la netteté du capteur (`c+=(c-cn)*.7`) accentue encore ces marches. Agrandis ×3,43, ce sont les « gros pixels ». Le damier n'y est pour rien (`v3damier:false` : même image), l'agrandissement final et la reprojection sont déjà bilinéaires.
- **Correction** (`camera.frag`, `flouCapteur` dans `src/main.js`) : en mouvement, les quatre lectures qui servaient à la netteté se placent le long du déplacement de chaque pixel pendant l'image (point du monde par la distance de l'accumulation, revu depuis la pose de l'image précédente, obturateur d'un tiers d'image, 8 pixels au plus, 0,65 pixel au moins, un peu en travers) et adoucissent au lieu d'accentuer ; macroblocs un peu plus marqués. Part du bougé `uFlou` : monte en une image, retombe en un quart de seconde à l'arrêt. Aucune lecture de texture en plus (la distance vient de la lecture centrale), rien dans l'ombrage (`ombrage-taille` identique). Qualité mobile seulement (option `flou`).
- **PC** : le défaut existe (feuilles en marches d'un pixel en marche) mais à un pixel d'écran, sans agrandissement : laissé tel quel.

## Lancement sans gel (branche `gel`, 20 novembre 2026)

Retours sur le PC de Toine (Chrome dans la vue web de l'application Claude Code, Windows, RTX, ANGLE → Direct3D 11, FXC) : « gros freeze » de toute l'application au lancement ; « le monde se construit » qui dure « des plombes » ; « ça rame » (106 ms par image à 2 500 000 grains, regard dans les houppiers). Diagnostic relevé sur sa machine : socle compilé en 31,1 s, variante complète en échec au délai de 45 s. Le processus graphique de Chromium est partagé par toute l'application : une compilation longue, plusieurs à la fois, ou une image trop lourde la figent entière. Rien ici n'a tourné sur Direct3D : tout est réduit par construction et mesuré indirectement.

### Tous les programmes, mesurés (`node tools/programmes.mjs`, `node tools/profil.mjs`)

`tools/programmes.mjs` ouvre la page (fiche 09, qualité PC et mobile, option `DEMO=1 REJEU=1` pour l'ouverture), intercepte chaque compilation (moment, sources), et donne pour chaque programme le source, le « déplié » (`tools/deplie.mjs` : chaque appel recopié, chaque boucle à borne fixe déroulée, comme FXC) et le SPIR-V d'ANGLE, plus les lectures synchrones. `tools/profil.mjs fichier "DEFINES"` dit quelles fonctions pèsent et d'où viennent leurs copies. Règle de trois tirée du PC de Toine : environ 10 000 caractères dépliés par seconde de FXC.

| Programme (fiche 09) | déplié avant | après |
|---|---|---|
| ombrage complet, PC (S1 A1 R10) | 1 007 729 | 77 187 |
| ombrage complet, mobile (T1 S1 A1) | 996 821 | 77 361 |
| ombrage socle | 315 332 | 33 822 |
| proches (fragment) | 613 675 | 31 118 |
| proches (sommets) | 37 563 | 20 469 |
| semeur, tampon G et ombre (HOUPPIER RELIEF, sommets) | 151 268 (×2) | 61 791 (×2) |
| semeur FORMES (sommets) | 46 670 (×2) | 33 868 (×2) |
| sol (sommets) | 19 284 | 10 509 |
| tapis du sol (mobile) | 1 000 773 | 35 222 |
| sonde (RELIEF) | 306 323 | 17 097 |
| capteur, halo, exposition | 7 772, 206 + 1 042, 435 | inchangés |
| lanceur de rayons (variante 0) | 213 236 375 | 6 795 835 |

Programmes de la première image (capteur, halo, exposition, sol, semeur ×2, proches, socle) : ≈ 1 280 000 dépliés avant, ≈ 240 000 après. Le lanceur de rayons était compilé au chargement en qualité mobile avec `v3` (`compilerPT(0)`), alors qu'il ne servait pas : plus maintenant. Il reste énorme, mais le PC ne le compile qu'à la demande.

### Ce qui a été restructuré (même calcul, même image)

- **`uZ`** (`monde.glsl`) : uniforme jamais écrite par la page, donc 0, mais inconnue du compilateur. Une boucle au corps lourd va jusqu'à `N+uZ` et ne se déroule plus : bruits `fbm`/`fbm3`, Voronoï, `canopyT`, marche des proches (24 pas), rais, normales par différences, recette (`k<nr`), tapis.
- **Un seul site d'appel** par fonction lourde : `bruit2`/`bruit3` (n octaves, n = 1 rend `vnoise` exact) ; dans `recette()`, tous les bruits sont tirés dans une boucle par un seul `rN` (`rSlot` : 16 emplacements, nuance, taches, motif, variation, grain, mousse, grain du relief) ; `recetteH` de même (8 emplacements) ; `matProp` un appel de chaque bruit ; `reliefDetail` un seul `bruitR` (il est dans `terrainH`, appelé partout) ; le semeur n'appelle `semeHoup` qu'une fois (semeA et semeB le demandent) ; les deux pas de Newton des blocs ne font qu'un `formeBloc` ; l'ombrage n'appelle `canopyT` qu'une fois (feuille, soleil, ambiance).
- Vérifié contre main, même pose, même machine (`out/img-main`, `out/img-main2` pour le plancher de bruit, `out/img-fin`, 400 × 250, 6 images, qualité complète) : écart moyen après flou 4 × 4 de 2,14 (plancher 1,42) sur la 09, 2,10 (1,89) sur la 01, 1,71 (0,85) sur la 06 ; aucune dérive de la moyenne par zone (moins de 1/255). Le reste de l'écart vient de l'ordre des tirages (`cosDir` avant `canopyT`) et des feuilles proches moins recouvertes : il a l'aspect du bruit, sans structure.

### Ordonnancement

- **Une compilation à la fois** (`COMP`, `compLibre` dans `src/main.js`) : au plus un programme en vol, au moins une image entre deux lancements, aucune interrogation (`LINK_STATUS`, uniformes) avant `COMPLETION_STATUS_KHR`. Les gros (ombrage, tapis, lanceur de rayons) attendent aussi 0,9 s sans frappe, que le joueur ne parle pas au porteur (`frozen`) et que la page ait le focus. Ordre : capteur, halo, exposition (`postPret`, plus compilés de façon bloquante au chargement), sol, semeur, ombre, proches, socle (première image), variantes FORMES (`v3Formes`), variante complète, tapis. `compTout` : l'ancien comportement.
- **Ouverture** : la fiche de la suggestion est appliquée en coulisse ; pendant la question et le rejeu, `frame()` compile (`prechauffer`) au lieu de rendre ; la variante complète se lance aussi pendant l'ouverture. Fin du rejeu : fondu dès la première image, attente bornée à 5 s (`docs/ouverture.md`).
- Plus de lecture bloquante pendant les trois premières images (`v3premieres` pour la remettre). Journal de `tools/programmes.mjs` : « readPixels synchrone × 6 » avant, aucune après.

### Charge de rendu

- **Temps de la puce par passe** (`EXT_disjoint_timer_query_webgl2`, lu sans attendre) : ombre, sol, proches, grains, tapis, ombrage, halo, capteur ; passes comptées par image (le diagnostic signale une passe doublée).
- **Régulateur** (`REG`) : cible 18 ms en qualité complète, 33 ms en mobile (`cibleMs`), mesurée par la puce quand elle le dit, sinon par l'intervalle entre images. Une seconde au-dessus de 110 % : un niveau plus bas ; trois secondes sous 65 % : un niveau plus haut. Niveaux, dans l'ordre : feuilles proches moins recouvertes et plus petites à l'écran, grains ×0,75 → ×0,32, pas des rais (lus dans `uAtmo2.z`, borne `RAIS`), résolution interne ×0,85 puis ×0,7. Coupé dans les captures d'essai (`regulateur`).
- **Feuilles proches** (`semeHoup`, `uFeuilG`) : tous les grains d'une cellule dessinent la même feuille ; au-delà de 16 pixels, on n'en garde que 60 % (3,6 grains par feuille au lieu de 6 : la feuille est dessinée à 97 % des images au lieu de 99,7 %), et une feuille ne dépasse pas 128 pixels de long (à 480 de haut). `balade.remplissage()` et `node tools/remplissage.mjs` comptent les fragments des grains de la caméra (tramés et gardés).
- **Montée progressive** : 20 % du budget de grains à la première image, plein budget à la dixième. **Repos** : page cachée, rien ; sans le focus, dix images par seconde au plus et aucun gros programme lancé.
- **Diagnostic** (trois touches sur REC) : durée de chaque compilation, plus longue image des dix premières secondes, temps de la puce par passe, état du régulateur.

### Ce qui n'est pas vérifié, ce qui reste gros

Rien n'a tourné sur Direct3D ni sur un vrai GPU : le déplié est une estimation de ce que fait FXC, et la règle des 10 000 caractères par seconde vient d'une seule mesure. On ne sait pas si ANGLE ou FXC déroulent quand même une boucle à borne `N+uZ` (ils ne le peuvent pas sans connaître `uZ`). Le plus gros restant : la variante complète (77 000), le semeur à houppiers compilé deux fois (tampon G et ombre, 62 000 chacun : même source de sommets), le lanceur de rayons (6,8 millions, compilé seulement s'il sert). En rendu logiciel, une compilation n'a lieu qu'au premier dessin : les durées mesurées ici ne disent rien de FXC.
