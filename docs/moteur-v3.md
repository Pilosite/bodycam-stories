# Moteur v3 : on ne trace plus, on sème

Document de conception. Rien de ce qui suit n'est construit. Il tire les leçons de l'essai v2 (`moteur-v2.md`) et répond au triptyque de `CLAUDE.md`.

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

## Essai n° 1 (à faire)

Semer la forêt actuelle (fiche 0) : sol, troncs, grès, feuillage, objets en formes ; carte d'ombres ; recettes par pixel ; capteur inchangé. Comparer aux vues de `ref/`, et mesurer sur le téléphone les images par seconde selon le budget de grains. Réussi si l'image passe pour la même vidéo et si la cadence ne bouge pas quand on double la densité d'arbres.
