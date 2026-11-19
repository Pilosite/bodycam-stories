# Constructeur de scènes (résumé)

On décrit un lieu, en une ligne ou en dix ; Claude en fait une scène, la page la contrôle, la regarde, la corrige, et la range dans la banque de scènes, d'où on la rejoue. Le détail (consignes, contrôle, capture, format des documents, erreurs) est dans `docs/constructeur-de-monde.md`.

## Où

- `src/constructeur.js` : module pur, testé par `npm test` (validation, retouches bornées, contrôle sans image, chaîne, banque).
- `src/atelier.js` : l'interface de la banque et du chantier.
- `src/main.js`, bloc « constructeur de monde » : appliquer une fiche, capturer les vues, vignettes ; `mondeLexique` (secours sans Claude).
- `tests/scenes-variees.mjs` : cinq demandes et les fiches qu'un Claude appliqué pourrait rendre (ruelle, chalet à l'aube, plage, cimetière de nuit, entrepôt). Elles servent d'échantillonneur simulé.

## La chaîne

description → **plan** (`default`) → **fiche** (`complex`) → **validation** (bornes et limites du format ; ce qui est jeté est redit à Claude) → **contrôle** sans image (champ du téléphone en portrait, portée de la lampe et de la brume, masquages, passage barré, budgets) → **repérage** : trois vues capturées dans la page (autant que `limits().images.maxCount` en accepte) → **relecture** (`complex`, images + constat ; rend une retouche bornée, refusée et redite si elle dépasse) → deux tours au plus, la meilleure version gardée → vignette → **banque**.

Sans images (`limits().images` absent), la relecture se fait sur le seul constat, et seulement s'il y a à redire. Sans Claude (hors artefact, ou refus), `mondeLexique` compose une fiche par mots-clés (forêt, désert, plage, montagne, rue, ruelle, village, cimetière, intérieur, heure, météo), passée par le même contrôle et la même banque.

Le contrôle reconnaît maintenant un **porche** (on passe entre ses piliers : chaque partie basse est jugée seule) et un **plafond** (une forme qui couvre tout le trajet au-dessus de 2,1 m est « au-dessus du trajet », pas « flottante »).

## La banque

Capacité `db`, collection `scenes`, un document par scène ; sinon `localStorage` « bodycam-banque ». Enregistrer, lister (plus récent d'abord), renommer, retoucher, dupliquer, régénérer, supprimer (en deux temps), charger. Les fiches embarquées (`scenes/*.json`) sont listées sous « Scènes du jeu », en lecture seule (jouer, dupliquer et modifier) ; leur vignette est prise la première fois qu'on y passe et gardée dans le navigateur (« bodycam-vignettes »).

## L'interface

- Rangée du bas : **Lui parler**, **Scènes**, **Plus**. « Plus » ouvre au-dessus les autres commandes : Jouer l'histoire, Décrire un monde, Mesurer, Suivi du téléphone, Qualité, Moteurs v2 et v3, Debug. Les interrupteurs laissent le menu ouvert pour qu'on voie leur nouvel état ; Échap ou un toucher ailleurs le ferme.
- « Scènes » : tiroir en bas sur téléphone, panneau de 410 px à droite sur ordinateur. En tête, « Nouvelle scène » (champ de texte ; « Dicter » seulement si la dictée existe et seulement quand on le touche), puis le chantier (étapes, temps, texte de l'étape, vues envoyées, « Arrêter »), puis « Mes scènes » et « Scènes du jeu ».
- « Décrire un monde » ouvre la banque sur le champ de description.

## Vérifier

```bash
npm test                                          # 64 tests, dont les cinq demandes variées
npm run build
node tools/constructeur-variete.mjs               # les cinq demandes dans la page, téléphone 390 × 780 tactile puis ordinateur 1280 × 800
node tools/constructeur-variete.mjs --lexique     # les mêmes, sans Claude
node tools/constructeur-essai.mjs                 # la chaîne avec erreurs, arrêt, rechargement, retouche, migration
```

Captures dans `out/variete/` et `out/variete-lexique/`.

## À déclarer à la publication

```js
capabilities: { sample: { images: true }, db: {}, dictation: {}, tts: {} }
```

`db: { rules: [ { path: "scenes", read: "view", write: "admin" } ] }` si seuls l'auteur et ses éditeurs doivent écrire dans la banque.

## Ce que le vocabulaire ne sait pas encore

- Eau proche : la mer n'existe que sous l'horizon (`lointain.eau`) et ne se voit que si le sol descend vers elle (pente -0,1 à -0,15, lointain très bas : c'est maintenant dit à Claude) ; même ainsi ce n'est qu'une bande à l'horizon. Une rive, des vagues, un bassin se font en sol sombre et brillant.
- Intérieur : il se compose (murs en rangée, plafond en objets, lampe et formes lumineuses), mais sans lumière ponctuelle les néons ne font que briller ; une pièce de maison (meubles, portes, fenêtres vues de l'intérieur) coûte vite les 64 formes d'objets.
- Pas de texte, de personnage, de mouvement, de falaise, de pont ni d'escalier.
- Ce n'est pas vérifié avec le vrai Claude : durée, qualité des fiches de `complex`, coût des images, comportement réel de `db`.
