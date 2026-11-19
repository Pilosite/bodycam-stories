# Référence gelée

Quatre vues rendues avec le moteur **avant** la refonte générique (étape 1 de `docs/refonte-monde-generique.md`). Toute étape de la refonte se compare à elles : si une couche générique rend moins bien, c'est elle qui doit s'améliorer.

| Vue | Ce qu'elle montre |
|---|---|
| `a-sentier.png` | sentier de sable, feuilles éparses, bloc de grès proche |
| `b-troncs.png` | écorces de pin et de chêne, perches, litière, grès |
| `c-litiere.png` | litière, mousse, grès moussu, bord du sentier |
| `d-dunes.png` | sable ridé par le vent (fiche des dunes) |

Les réglages (position, regard, passes, taille) sont dans `vues.json`.

```bash
npm run build
node tools/vues.mjs out/vues                       # rend l'état courant (4 vues en parallèle, ~5 min sans GPU)
node tools/compare.mjs ref out/vues out/comp.png   # écarts chiffrés et planche référence | essai | écart
```

Le path tracing est bruité : deux rendus du même code ne sont jamais identiques. Le plancher de bruit, mesuré en rendant deux fois le code de référence, est noté dans `bruit.txt`. Une différence au niveau du plancher ne veut rien dire ; c'est la colonne `ecart_flou4` (écart après flou 4×4, où le bruit s'efface) qui révèle un vrai changement d'image.

Ne regeler (`node tools/vues.mjs ref`) que si l'on change volontairement le rendu de référence, et le dire dans le commit.
