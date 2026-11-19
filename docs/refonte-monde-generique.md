# Refonte : un monde générique, pas un kit forêt

## Pourquoi

Toine veut que le moteur réponde à n'importe quelle demande (« une maison dans les bois avec un lapin », « un château », « une rue la nuit ») avec la richesse et la crédibilité de la forêt actuelle. Deux essais n'ont pas suffi :

- **Les kits** (`foret`, `dunes`) : crédibles, mais prédéfinis. L'IA ne peut que choisir dans une liste.
- **Les objets en formes de base** (`objets[].formes`) : libres, mais pauvres. Une maison en huit boîtes passe de loin ; un monde entier fait de boîtes ne passe pas.

La cible : l'IA interprète la demande et la traduit en monde, sans réinventer le moteur à chaque fois. Le moteur est un accélérateur de rendu et d'interactions bodycam.

## Ce qui rend la forêt crédible

Quatre mécanismes, aujourd'hui écrits en dur pour la forêt dans `src/shaders/pathtrace.frag` :

| Mécanisme | Dans le code actuel | Ce qu'il apporte |
|---|---|---|
| Relief et chemin | `terrainH`, `pathX` | Un sol qui ondule, un trajet lisible |
| Semis | `sdTreeA`, `sdTreeB`, `sdRock` : une grille tournée, un élément par cellule, tiré de la graine | Des milliers d'éléments sans les poser un par un |
| Matières calculées | `matGround`, `matRock`, `barkPat`, `matBark` | Irrégularités, salissures, mousse du côté humide |
| Volumes diffus | `canopyDens`, `foliage`, `canopyT` | Feuillage détaillé de près, statistique au loin, ombres tachetées |

La lumière (`lightSurf`, `Li`, `shadeLeaf`) et le capteur (`camera.frag`) sont déjà génériques.

## La cible : quatre couches que l'IA règle

La fiche de lieu version 1 ne nomme plus de kit. Elle décrit :

1. **`relief`** : une somme de composantes (ondulation, crêtes, plateau, creux le long du trajet), chacune avec amplitude et échelle. Plus un ou plusieurs **trajets** (sentier, rue, couloir) avec largeur et matière.
2. **`semis[]`** : des couches de répartition. Chaque couche a une taille de cellule, une densité, un écart au trajet, une variation de taille, un masque de regroupement, et un **élément** : soit un gabarit paramétré (fût conique avec branches, bloc arrondi, volume droit avec toit), soit un assemblage de formes comme `objets[].formes`. L'IA définit l'élément, le moteur le répète.
3. **`matieres{}`** : des recettes. Couleur de base, grain, motif (planches, plaques, pavés, rides, feuilles), fissures, salissure vers le bas, mousse ou lichen selon l'orientation, humidité. Chaque surface (sol, trajet, élément de semis, forme d'objet) pointe vers une recette.
4. **`volumes[]`** : des tranches de milieu diffus. Hauteur basse et haute, densité, taille et forme de l'élément (feuille, brin, flocon), couleurs, translucidité. La canopée, un sous-bois, de l'herbe, de la pluie sont le même mécanisme.

S'y ajoutent ce qui existe déjà : `ambiance`, `objets` (pour l'unique, pas pour le répété), `histoire`.

## Le test de réussite

**La forêt actuelle se réécrit en données dans ce vocabulaire et rend la même image.** Tant que ce n'est pas vrai, le vocabulaire est trop pauvre. Quand c'est vrai, `foret` et `dunes` disparaissent du shader et deviennent deux fiches parmi d'autres.

Deuxième test : une fiche « rue de village français » écrite par Claude, sans toucher au moteur, donne une image qu'on prendrait pour une vidéo de téléphone.

## Avancement

- **Étape 1, fait.** Quatre vues gelées dans `ref/` (trois de forêt, une de dunes), avec `tools/vues.mjs` pour les rendre et `tools/compare.mjs` pour mesurer l'écart. Voir `ref/README.md`.
- **Étape 2, fait.** `matGround`, `matRock`, `barkPat` et `matBark` ont disparu du shader. Un seul évaluateur, `recette()`, lit des recettes dans la texture `uMats`. Les neuf matières de la forêt et des dunes sont maintenant des données dans `src/matieres.json`, à côté de trois recettes nouvelles (`planches`, `paves`, `crepi`). Une fiche peut en ajouter (`matieres`), dire quelle surface prend laquelle (`surfaces`), et une forme d'objet peut en nommer une. Format : `docs/fiche-de-lieu.md`. Les écarts mesurés sur les vues de référence sont au niveau du bruit (`ref/bruit.txt`).
- Leçon de compilation : chaque appel de fonction est déplié par le compilateur. `recette()` n'est appelée qu'à un seul endroit de `render()`, et les quatre évaluations du relief passent par une boucle. Avec cinq appels, le contexte WebGL était perdu en rendu logiciel. Garder cette règle pour `sdSemis` à l'étape 3.

## Ordre de travail proposé

1. **Geler une référence.** Rendre trois vues de la forêt actuelle avec `tools/shot.mjs` et les garder dans `ref/`. Toute étape se compare à elles.
2. **Matières en recettes.** Remplacer `matGround`, `matRock`, `barkPat` par un seul évaluateur de recette piloté par des paramètres (texture de données, comme `uShapes`). Vérifier contre la référence.
3. **Semis génériques.** Un seul `sdSemis(couche)` à la place de `sdTreeA`, `sdTreeB`, `sdRock`. Garder la règle « un élément par cellule, avec marge ».
4. **Volumes génériques.** `canopyDens`, `foliage`, `canopyT` prennent leurs paramètres d'une liste de tranches. Ajouter une tranche basse : c'est le sous-bois qui manque aujourd'hui.
5. **Relief en composantes.** Attention au doublon JS de `terrainH` : le générer depuis la même description.
6. **Fiche version 1** et réécriture de la forêt et des dunes en données. Supprimer `uKit`.
7. **Boucle de correction.** L'IA doit voir ce qu'elle a généré : capturer l'image, la renvoyer à Claude avec la demande, appliquer les retouches. Sans cette boucle, un monde généré n'atteindra pas le niveau de la forêt, qui a été réglée à la main image par image.
8. **Interactions.** Éléments qui bougent (le lapin s'enfuit), sources de lumière ponctuelles, changement de lieu en cours de récit.

## Contraintes à respecter

- **Coût.** Chaque rayon évalue la scène des centaines de fois. Une couche de semis coûte une évaluation par pas ; viser quatre couches au plus. Les recettes de matière ne s'évaluent qu'une fois par impact, elles peuvent être riches.
- **Une seule compilation.** Les paramètres passent par des uniformes ou des textures de données, jamais par du code de shader généré, pour qu'un nouveau monde ne recompile rien sur le téléphone.
- **Bornes.** Tout ce que l'IA écrit est borné par le moteur avant usage (voir `validerFiche`).
- **Crédibilité avant richesse.** Si une couche générique rend moins bien que son équivalent en dur, c'est le générique qui doit s'améliorer, pas la référence qui doit baisser.

## Ce qui n'est pas mesuré

Les performances sur un vrai téléphone. Avant l'étape 3, chronométrer sur l'appareil de Toine : la généricité ajoute des lectures de texture dans la boucle la plus chaude.
