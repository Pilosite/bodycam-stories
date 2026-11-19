# Démarrer dans Claude Code

## Ce que contient ce kit

- **Le moteur tel qu'il tourne aujourd'hui** : `src/` (shaders, boucle de rendu, voix dans la tête, description de monde), `scenes/` (cinq fiches de lieu), `dist/index.html` (la page assemblée, celle de la démo en ligne).
- **Les règles du projet** : `CLAUDE.md`, lu automatiquement par Claude Code.
- **Les explications** : `docs/principes.md` (ce qu'on cherche), `docs/fiche-de-lieu.md` et `docs/contrat-histoire.md` (les formats que l'IA écrit), `docs/rendu.md` (pistes de rendu), `docs/refonte-monde-generique.md` (le chantier suivant).
- **Les outils** : `tools/build.mjs` (assemblage), `tools/shot.mjs` (capture sans écran pour vérifier un rendu).

## Mise en route

```bash
unzip bodycam-proc.zip && cd bodycam-proc
git init && git add -A && git commit -m "Moteur bodycam procédural : état initial"
npm install
npx playwright install chromium     # une fois, pour les captures
npm run build
```

Ouvrir `dist/index.html` dans Chrome pour voir le moteur. La voix et la génération par Claude ne marchent que dans la page publiée sur claude.ai ; en local, un lexique de mots-clés les remplace.

Vérifier un rendu :

```bash
node tools/shot.mjs out/vue.png '{"still":true,"nohud":true,"nowalk":true}' 10 270 480
```

## Où on en est

Fait et vérifié en image : forêt, nuit à la lampe, dunes, netteté en mouvement, porteur autonome, ordres simples, monde décrit par mots-clés, objets composés de formes (exemple : `scenes/05-maison-lapin.json`).

Écrit mais jamais exécuté pour de vrai : les réponses de Claude dans la page (voix dans la tête, description de monde) et la dictée.

Jamais mesuré : les performances sur téléphone.

## Avancement de la refonte

Étapes 1 et 2 faites : référence dans `ref/`, matières en recettes (`src/matieres.json`). Suite : étape 3, semis génériques.

## Le chantier suivant

Toine veut que n'importe quelle demande donne un monde aussi crédible que la forêt, sans rien de prédéfini. Le plan est dans `docs/refonte-monde-generique.md`.

Première demande à faire à Claude Code :

> Lis CLAUDE.md et docs/refonte-monde-generique.md. Commence par l'étape 1 (référence gelée), puis l'étape 2 (matières en recettes). Après chaque étape, rends les trois vues de référence avec tools/shot.mjs, compare-les aux images de ref/ et montre-moi le résultat avant de continuer.
