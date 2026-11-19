# bodycam-proc

Jeu narratif mobile vu à travers une caméra-piéton. Le monde est généré par code, sans aucun asset, et doit passer pour une vidéo filmée par quelqu'un avec un téléphone moyen. Une IA fait vivre l'histoire ; le joueur regarde et parle au porteur de la caméra.

Nom de travail : `bodycam-proc`. Toine n'a pas encore choisi le vrai nom.

## Le triptyque (la boussole de Toine)

Tout choix de moteur se juge sur ces trois points, ensemble :

1. **N'importe quel monde, par procédure.** Toute demande (une ville, une montagne, un intérieur) doit se fabriquer par code à partir d'une description écrite par l'IA. Rien de prédéfini : ni kit, ni objet, ni paysage en dur. Si une demande échoue, on élargit le vocabulaire, on n'ajoute pas un cas particulier.
2. **Un coût indépendant de la complexité.** Un monde dix fois plus riche ne doit pas coûter dix fois plus à afficher. Le budget par image est fixe ; c'est la finesse qui s'adapte, pas la fluidité.
3. **Le parti pris vidéo de téléphone sert à tricher.** Résolution modeste, grain, compression, exposition, bougé : ces défauts font le réalisme et cachent les raccourcis du moteur. On les exploite exprès.

Pour y arriver, on s'autorise à sortir des approches de rendu classiques. Voir `docs/moteur-v3.md`.

## Règles du projet

1. **Crédibilité, pas qualité.** On ne cherche pas de beaux graphismes, on cherche l'impression que quelqu'un filme la réalité. Une image sale et crédible vaut mieux qu'une image propre et synthétique. Tout arbitrage se tranche avec cette règle.
2. **Le joueur ne pilote jamais le personnage.** Il regarde librement autour de la caméra et il parle au porteur, dans sa tête, pendant que le monde se fige. C'est le récit (IA ou script) qui décide des déplacements et des événements.
3. **Rien n'est prédéfini, l'IA interprète.** Le moteur est un accélérateur : il fournit un vocabulaire (kits de paysage, formes de base, matières, lumière, actions du porteur, temps du récit) et l'IA traduit n'importe quelle demande dans ce vocabulaire. On n'ajoute jamais un objet en dur (pas de « cabane », pas de « lapin ») : on élargit le vocabulaire.
4. **Code seulement.** Pas de texture, de modèle, de photo ni de son importés. Les données ouvertes (cartes, relief) sont admises comme entrée, pas les médias.
5. **Mobile, portrait, navigateur.** WebGL2, une seule page autonome en sortie.

## Commandes

```bash
npm install                     # Playwright, pour les captures
npm run build                   # assemble src/ + scenes/ + histoires/ en dist/index.html
npm test                        # meneur de jeu, sans navigateur ni Claude
node tools/partie.mjs demi-tour # une partie d'« Avant la nuit » jouée dans la page, captures dans out/meneur/
node tools/shot.mjs out/vue.png '{"still":true,"nohud":true,"nowalk":true}' 10 270 480
```

`tools/shot.mjs` documente toutes les options de test en tête de fichier. Sans GPU, Chrome calcule en logiciel : compter environ 10 s par passe en 270 × 480. Regarder l'image produite avant de conclure qu'un changement de shader est bon.

## Organisation

- `src/shaders/pathtrace.frag` : le lanceur de rayons et sa lumière. Le monde lui-même (relief et trajet réglables, arbres, grès, semis, canopée, dunes, ciel, lointain, eau) est dans `src/shaders/monde.glsl`, les matières dans `recette.glsl`, l'accumulation dans `reprojection.glsl` : le build les insère (`#include "…"`) dans `pathtrace.frag` et dans les shaders du moteur v3 (`v3_*`), qui sèment le même monde. Les variantes `SEMIS` et `NU` ne concernent que le lanceur de rayons ; `monde.glsl` les vaut 0 par défaut.
- `src/shaders/camera.frag` : le capteur (fisheye, exposition, grain, compression, coins sombres).
- `src/main.js` : boucle de rendu, reprojection temporelle, porteur de la caméra, voix dans sa tête, API `window.balade`.
- `src/meneur.js` : le meneur de jeu (`docs/meneur-de-jeu.md`), module pur sans DOM, testé par `npm test` (`tests/`). Le build l'embarque avec `histoires/*.json`. Essai sur artefact : `docs/essai-meneur.md`.
- `src/constructeur.js` et `src/atelier.js` : constructeur de scènes (description → plan → fiche → contrôle → relecture en image → banque de scènes), voir `docs/constructeur.md`.
- `src/matieres.json` : bibliothèque de recettes de matière (sol, sentier, grès, écorces…), évaluées par `recette()` dans le shader.
- `ref/` : vues de référence gelées ; `tools/vues.mjs` et `tools/compare.mjs` pour rendre et comparer.
- `scenes/*.json` : fiches de lieu embarquées dans la page, format décrit dans `docs/fiche-de-lieu.md`.
- `histoires/*.json` : contrats d'histoire, format décrit dans `docs/contrat-histoire.md`.
- `docs/` : principes, formats, pistes de rendu. À lire avant de toucher au moteur.

## Conventions

- Les formules de terrain et de sentier existent en double, en GLSL et en JS (`terrainH`, `pathX`). Toute modification se fait des deux côtés.
- Les paramètres d'un objet de cellule (`arbreA`, `percheB`, `blocGres`…) sont des fonctions de `monde.glsl`, lues par le lanceur de rayons et par le semeur v3 : on change la fonction, jamais une copie.
- Un objet par cellule de grille (arbres, perches, rochers, éléments de semis). Chaque objet reste à l'intérieur de sa cellule avec une marge, sinon le lancer de rayons saute par-dessus.
- En rendu logiciel, tout code présent dans `map()` coûte à chaque pas de rayon, même jamais exécuté. Ce qui ne sert qu'à certains mondes passe par une variante fixe du shader (`#define SEMIS`, `#define NU`, choisies par `progMonde`), jamais par du code généré.
- Pas d'accent grave ni de `${` dans les shaders : le build les insère dans des gabarits JS.
- Les champs des fiches sont en français, sans accents dans les clés.
- Tout aléa du monde dérive de la graine. Même fiche, même monde.
- Une matière s'ajoute en recette (données), jamais en code GLSL. `recette()` ne doit avoir qu'un seul appel dans le shader : chaque appel supplémentaire est déplié par le compilateur.
- Après un changement de rendu : `node tools/vues.mjs out/vues && node tools/compare.mjs`, puis regarder la planche.

## État au 19 novembre 2026

Fait : forêt (sentier, grès, pins, chênes, bouleaux, canopée), dunes, jour, soleil voilé, nuit à la lampe, capteur bodycam, reprojection temporelle pour rester net en mouvement, porteur autonome qui se promène, voix dans sa tête avec Claude ou lexique de secours, contrat d'histoire minimal porté par la fiche, bouton « Décrire un monde » (voix ou clavier, Claude écrit la fiche).

Non vérifié : les performances sur un vrai téléphone. Tous les tests ont tourné en rendu logiciel. La seule mesure réelle est une capture de Toine sur son Samsung, avec l'ancienne version.

Faiblesses connues : sol proche de la caméra, pas de sous-bois, rochers trop lisses de près, feuilles de canopée en disques, pas d'intérieur, pas de lumière ponctuelle, pas de son.

Chantier en cours : `docs/refonte-monde-generique.md`. Étapes 1 (référence gelée) et 2 (matières en recettes) faites ; étape 3 commencée : semis génériques, relief et trajet réglables, kit `nu`, motifs `fenetres` et `marquage` (fiches 06 à 08 de `scenes/`, copiées de `essais/san-francisco.json`, `village-nuit.json`, `cimetiere.json`). Reste : réécrire arbres et rochers en semis. Les kits `foret` et `dunes` et les objets en formes sont des étapes, pas la cible : la cible est un vocabulaire générique (relief, semis, matières, volumes) dans lequel la forêt elle-même n'est qu'une fiche.

Essai du moteur v2 (« tourner, puis projeter ») : bouton « Moteur v2 », option `v2` ; résultats dans `docs/moteur-v2.md`, poses comparées par `node tools/v2essai.mjs out/v2`.

Essai n° 1 du moteur v3 (« on ne trace plus, on sème ») : bouton « Moteur v3 », option `v3` ; compte rendu dans `docs/moteur-v3.md`, planche et test du triptyque par `node tools/v3essai.mjs out/v3`. Le semeur ne connaît pas encore les semis, le relief réglable ni le kit nu : sur ces fiches le bouton est désactivé et la page reste sur le lanceur de rayons (`v3Refus` dans `src/main.js`, liste dans `docs/moteur-v3.md`).

Ouverture de démo (« Quel monde veux-tu filmer ? », rejeu accéléré d'une préparation réellement faite, `ouvertures/*.json`, mention éteinte par défaut) et arrivée immobile dans un lieu : `docs/ouverture.md`, `node tools/ouverture.mjs`.

Autres pistes : `docs/rendu.md` et `docs/contrat-histoire.md`.
