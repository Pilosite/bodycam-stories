# Fiche de lieu (version 0, vocabulaire générique en cours)

Une fiche de lieu est le seul texte que l'IA écrit pour créer un environnement. Elle compose le lieu avec un vocabulaire générique (relief, trajet, sols, semis d'éléments répétés, objets uniques, horizon, lumière) et pose l'ambiance. Le moteur fait le reste à partir de la graine. Les kits `foret` et `dunes` existent encore, avec leurs arbres et rochers en dur ; le kit `nu` n'a rien de prédéfini.

Les fiches vivent dans `scenes/*.json`. Le build les embarque toutes dans la page, par ordre alphabétique.

## Exemple

```json
{
  "version": 0,
  "id": "grands-avaux-nuit",
  "titre": "Le même sentier, de nuit, à la lampe du téléphone",
  "inspiration": "Forêt des Grands Avaux, Champcueil, après la tombée du jour",
  "graine": 4821,
  "kit": "foret",
  "foret": { "densite": 0.7, "rochers": 1, "feuillage": 1 },
  "ambiance": {
    "saison": "automne",
    "meteo": "clair",
    "soleil": { "azimut": 120, "hauteur": -10 },
    "lampe": true,
    "brume": 0.02
  },
  "camera": { "profil": "bodycam-poitrine", "hauteur": 1.36, "champ": 125 },
  "histoire": { "pitch": "…", "protagonistes": [], "temps": [] }
}
```

## Champs

| Champ | Lu par le moteur | Sens |
|---|---|---|
| `id`, `titre` | oui | Identifiant et libellé. Le titre est donné au porteur comme nom du lieu. |
| `inspiration` | transmis à l'IA | Le lieu réel ou imaginaire qui sert de référence. Sert au ton du récit, pas à la géométrie. |
| `graine` | oui | Entier. Même graine, même monde. |
| `kit` | oui | `nu` (rien de prédéfini : tout vient de `relief`, `trajet`, `surfaces`, `semis`, `objets`, `lointain`), `foret` ou `dunes`. Une fiche sans `kit` qui fournit des `semis` est un monde nu. |
| `relief`, `trajet` | oui | Forme du sol et du chemin, voir plus bas. Lus pour `nu` et `foret` ; les dunes gardent leur relief. |
| `semis` | oui | Éléments répétés (immeubles, voitures, tombes, arbres…), voir plus bas. |
| `foret.densite` | oui | 0 à 1. Part de cellules occupées par un arbre. |
| `foret.rochers` | oui | 0 à 1 et plus. Abondance des blocs de grès. |
| `foret.feuillage` | oui | 0 à 1,5. Densité de la canopée. |
| `foret.houppier` | oui | `voute` (feuillus et pins, feuillage haut et commun) ou `cone` (conifères : un cône de feuillage par arbre, vert sombre). Réglages : `houppier_bas`, `houppier_rayon` en mètres. |
| `foret.perches` | oui | 0 à 1. Part de jeunes troncs fins. |
| `dunes.rochers` | oui | Abondance des blocs dans le sable, 0 par défaut. |
| `ambiance.saison` | oui | `ete`, `automne`, `hiver`. Couleur et densité des feuilles. |
| `ambiance.meteo` | oui | `clair` ou `voile` (soleil laiteux, ombres douces). |
| `ambiance.soleil` | oui | `azimut` et `hauteur` en degrés. Une hauteur négative donne la nuit. |
| `ambiance.lampe` | oui | Lampe du téléphone. Allumée par défaut la nuit. |
| `ambiance.brume` | oui | Densité de brume par mètre. 0,002 désert, 0,011 matin, 0,03 épais. |
| `camera.hauteur` | oui | Hauteur de la caméra en mètres. |
| `camera.profil`, `camera.champ` | pas encore | Type de capteur et champ de vision. Aujourd'hui fixes : bodycam, 125°. |
| `histoire` | transmis à l'IA | Récit attaché au lieu, voir `contrat-histoire.md`. |

Un champ inconnu est ignoré. Un champ absent prend sa valeur par défaut.

## Règles d'écriture pour l'IA

- Décrire un lieu par ce qu'un kit sait faire. Ce qui n'entre dans aucun kit va dans `inspiration` et dans le récit, pas dans des champs inventés.
- Rester dans les plages indiquées. Le moteur borne les valeurs, mais une fiche hors plage est une fiche ratée.
- Une fiche par lieu. Un changement d'heure ou de météo dans le même lieu est un changement d'ambiance, pas une nouvelle fiche.

## Relief et trajet

Le sol est une somme d'ondulations, plus une pente générale le long du trajet ; le trajet (sentier, rue, allée) est une bande autour d'un axe qui serpente plus ou moins. Sans ces champs, la forêt garde exactement son relief et son sentier d'origine.

```json
"relief": { "amplitude": 2.5, "echelle": 260, "pente": -0.28, "niveler": true },
"trajet": { "sinuosite": 0, "largeur": 9, "creux": 0.16, "bord": "net" }
```

| Champ | Plage | Sens |
|---|---|---|
| `relief.amplitude` | 0 à 12 m | Hauteur des ondulations. 0 plat, 1,5 la forêt, 3 à 6 des collines. Défaut 0,8 en monde nu. |
| `relief.echelle` | 20 à 600 m | Longueur d'onde des ondulations (150 = la forêt). |
| `relief.pente` | -0,35 à 0,35 | Pente générale le long de l'axe z (celui du trajet). 0,28 : rue de San Francisco. Négatif : on descend en avançant. |
| `relief.niveler` | oui / non | Le trajet et ses abords restent de niveau en travers (une rue). Par défaut en monde nu dès que le trajet fait 3 m. |
| `trajet.sinuosite` | 0 à 2 | 0 rue droite, 1 sentier de forêt. |
| `trajet.largeur` | 0,6 à 30 m | Largeur de la surface `trajet` (la chaussée). |
| `trajet.creux` | 0 à 0,4 m | Le trajet est plus bas que le sol : 0,15 avec `bord: net` donne une bordure de trottoir. |
| `trajet.bord` | `net`, `irregulier` | Limite franche (rue) ou mangée par le sol (sentier). |

Ces formules existent en double, dans le shader et dans `src/main.js` (`terrainH`, `pathX`) : la caméra, les objets et les collisions utilisent la version JS. `balade.sol(x, z)` renvoie la hauteur et l'axe calculés.

## Semis : des éléments répétés, définis par la fiche

Une couche de semis répète un **élément** sur une grille, un élément par cellule, avec des variations tirées de la graine. L'élément est un assemblage de formes, exactement comme un objet. C'est ainsi qu'on fait une rue d'immeubles, des voitures garées, des réverbères, des tombes, des arbres d'une essence quelconque.

```json
{ "id": "maisons", "cellule": [6.6, 12], "trajet": { "rangee": true, "min": 6, "cote": "deux" },
  "densite": 1, "hauteur": [0.85, 1.3], "teinte": 0.12, "palette": ["#d8bf72", "#94b2c6", "#c4826f"],
  "formes": [ { "f": "boite", "p": [0, 4.6, -0.65], "taille": [6.4, 9.2, 10.5], "couleur": "palette", "matiere": "victorienne" } ] }
```

| Champ | Plage | Sens |
|---|---|---|
| `cellule` | 1,5 à 30 m, nombre ou `[a, b]` | Taille de la cellule. En rangée : `[longueur le long du trajet, profondeur]`. Sinon `[x, z]`. |
| `trajet.rangee` | oui / non | **Rangée** : la grille suit le trajet (même sinueux) ; les éléments s'alignent à partir de `min` mètres de l'axe, sur une ou plusieurs rangées jusqu'à `max`, et font face au trajet. Sans rangée : grille libre, et `min`/`max` est l'écart permis à l'axe (par défaut : hors du trajet). |
| `trajet.min`, `trajet.max`, `trajet.cote` | m ; `deux`, `gauche`, `droite` | Bande d'écart à l'axe du trajet, et de quel côté. |
| `rotation` | degrés | Rotation de la grille libre. |
| `densite` | 0 à 1 | Part des cellules occupées. |
| `groupes`, `groupes_echelle` | 0 à 1 ; 5 à 400 m | Regroupe les éléments en îlots d'environ cette taille. |
| `oriente`, `cap`, `tourne` | `trajet`, `aleatoire`, `fixe` ; degrés | Face au trajet (défaut des rangées), au hasard (défaut des grilles libres), ou au cap donné ; `tourne` ajoute un aléa de cap. |
| `echelle`, `hauteur` | `[min, max]`, 0,2 à 4 et 0,3 à 3 | Taille de chaque élément, et étirement en hauteur seul (immeubles de 2 à 4 étages). |
| `penche` | 0 à 25 degrés | Légère inclinaison au hasard (tombes, poteaux). |
| `teinte` | 0 à 1 | Variation de couleur par élément. |
| `palette` | 8 couleurs au plus | Chaque élément tire une couleur ; ses formes y puisent avec `"couleur": "palette"`. |
| `desordre` | 0 à 1 | Part du jeu laissé dans la cellule qui sert à décaler l'élément au hasard. |
| `pose` | `pente` | L'élément suit la pente du sol (voitures) ; sinon il reste vertical, posé au niveau de son centre (immeubles en gradins). |
| `formes` | 6 au plus | Même schéma que `objets[].formes`. Repère de l'élément : y = 0 au sol, +z = la face qui regarde le trajet (en rangée), x le long du trajet. |

Règles :

- **L'élément tient dans sa cellule** avec une marge de 8 cm, sinon le lancer de rayons sauterait par-dessus. Le moteur réduit l'échelle d'un élément trop grand. Pour des immeubles mitoyens : longueur de cellule = largeur de façade (il reste 16 cm entre deux).
- Une boîte qui touche le sol descend d'elle-même sous terre : sur une pente, sa base ne flotte pas (on voit un soubassement).
- Les matières des formes, recettes comprises, sont évaluées dans le repère de l'élément : les fenêtres et les planches suivent la façade, et chaque élément a ses propres taches.
- `degage` d'un objet écarte aussi les éléments de semis.
- Limites : 4 couches, 6 formes par élément. Une couche coûte une évaluation par pas de rayon ; une fiche sans semis ne coûte rien de plus.

Exemples complets : `essais/san-francisco.json`, `essais/village-nuit.json`, `essais/cimetiere.json`.

## Objets : des formes, pas un catalogue

Le moteur ne connaît aucun objet. La fiche les construit en assemblant des formes : `boite`, `boule`, `cylindre`, `cone`, `capsule`, `toit`. Chaque forme a un centre `p` (mètres, y = 0 au sol, +z = face avant), une `taille` entière, un `cap`, une inclinaison `penche`, une `couleur`, une `matiere` (`mat`, `bois`, `pierre`, `metal`, `verre`, `pelage`, `tissu`, `tuile`, `lumineux`), et peut se fondre dans ses voisines avec `lisse`. Un objet se place par `devant` et `cote` le long du trajet, écarte les arbres avec `degage`, et peut être caché puis montré par un temps du récit (`"scene": {"montrer": ["id"]}`).

Limites : 8 objets, 24 formes par objet, 64 formes en tout. Exemple complet : `scenes/05-maison-lapin.json`.

## Matières : des recettes, pas du code

Aucune matière n'est écrite dans le shader. Le sol, le sentier, le grès et les écorces sont des **recettes** : des données que le moteur évalue une fois par impact. La bibliothèque de départ est `src/matieres.json` (`litiere`, `sentier-sable`, `gres`, `gres-patine`, `sable-dunes`, `ecorce-chene`, `ecorce-pin`, `ecorce-bouleau`, `ecorce-chataignier`, et pour aller au-delà de la forêt `planches`, `paves`, `crepi`). Une fiche peut en ajouter ou en remplacer avec `matieres`, puis dire quelle surface prend quelle recette avec `surfaces`.

```json
"matieres": {
  "gres-rouge": { "base": "gres", "couleur": "#a0705a", "mousse": { "force": 0.3 } }
},
"surfaces": { "rochers": "gres-rouge", "arbres": { "a": "ecorce-pin", "b": "ecorce-pin" } }
```

Surfaces : `sol`, `trajet`, `rochers`, `arbres` et `perches` (`{ "a", "b", "part" }` : deux écorces et la part de la première). Une forme d'objet ou d'élément de semis peut aussi nommer une recette dans `matiere` (par exemple `"matiere": "planches"`). Une recette inconnue retombe sur celle du kit. Recettes ajoutées pour les lieux bâtis : `asphalte`, `chaussee` (asphalte et axe en tirets), `dalles` (trottoir), `beton`, `brique`, `bardage`, `facade` (enduit percé de fenêtres), `terre`, `gravier`. Le monde nu prend par défaut `herbe` et `asphalte`.

Une recette s'évalue toujours dans le même ordre. Tous les champs sont facultatifs.

| Champ | Sens |
|---|---|
| `base` | Nom d'une recette dont on hérite ; les champs donnés la complètent. |
| `espace` | `sol` (motifs posés sur le plan, pour le sol et le trajet) ou `volume` (motifs dans la matière, pour rochers, troncs, objets). |
| `couleur` | Couleur de base, `#rrggbb`, ou `"forme"` : la couleur de la forme qui porte la recette (avec une palette de semis, chaque maison garde sa couleur sous la même recette). |
| `nuance` | Seconde couleur par plages : `couleur`, `force`, `echelle`, `seuils`, `fbm`, `decalage`. |
| `taches` | Jusqu'à quatre couches : `couleur`, `force`, `echelle` (nombre ou `[x, y, z]`, anisotrope), `seuils`, `fbm`, `decalage`, `biais` et `hauteur` (plus présentes vers une hauteur, comme le pied noirci d'un bouleau), `creux` (la tache est en creux), `sous_motif` (peinte avant le motif), `sur_motif` (seulement sur les éléments du motif). `#000000` assombrit : humidité, salissures. |
| `motif` | `type` : `feuilles` (litière de cellules, `palette`, `couverture`, `taille`), `rides` (vent sur le sable), `fissures` (écorce : `seuils`, `profondeur`, `fines`, `assombrit`), `planches` (`joint`, `longueur`, `couchees` pour un bardage), `paves` (`joint`, `decalage_rangs`, `bombe` ; `echelle: [x, y, z]` pour des briques), `fenetres`, `marquage` (ci-dessous). Communs : `echelle`, `couleur` (joints, fond des fissures, vitre, peinture), `opacite`, `inclinaison`, `palette` (`[{ "couleur", "part" }]`). |
| `variation`, `grain` | Modulation de la couleur, grande et fine : `echelle`, `force`. |
| `mousse` | Mousse ou lichen : `couleur`, `force`, `echelle`, `seuils`, `fbm`, `dessus` (seuils sur l'orientation vers le ciel, limite décalée par `pente_bruit`, `pente_echelle`), `cote` (seuils vers le côté humide), `hauteur` (seuils sur la hauteur au-dessus du sol), `grain`, `adoucit` (efface le relief). |
| `salissure` | Le pied s'assombrit : `force`, `hauteur` en mètres. |
| `relief` | `motif` (profondeur du motif et des creux), `bosses` (deux bruits `{ echelle, force, fbm }`), `inclinaison` (facettes des feuilles), `grain` (`{ echelle, force }`). |
| `brillance` | Reflet spéculaire, 0 à 1. |

Motif `fenetres` (faces verticales seulement) : une grille d'étages mesurée depuis la base de l'élément. `largeur` et `hauteur` d'une fenêtre, `pas` entre deux fenêtres (centrées sur la face), `etage`, `allege` (hauteur du bas de fenêtre), `cadre` (largeur du chambranle), `rdc` (hauteur d'un rez-de-chaussée à vitrines, 0 = aucun), `allumees` (part des fenêtres qui s'allument et émettent la nuit, un peu au crépuscule), `couleur` (vitre), `cadre_couleur`, `lumiere`. Le relief du motif (`relief.motif`) enfonce les vitres.

Motif `marquage` (sol) : peinture mesurée depuis l'axe du trajet. `axe` (`simple`, `double`, `aucun`), `largeur` du trait, `tiret` et `intervalle` (0 = trait continu), `bords` (écart des deux lignes de rive), `passages` (période des passages piétons, en mètres), `couleur`. La peinture est usée par plaques.

Le moteur borne chaque valeur avant usage. Limites : 24 recettes par lieu, 12 recettes dans une fiche.

## Lointain : l'horizon

`lointain` décrit ce qu'on voit au-dessus des arbres : une chaîne de montagnes ou des collines, calculée par direction du regard et non tracée (coût négligeable). `eau` (`#rrggbb` ou `true`) pose une mer, une baie ou un lac sous l'horizon, là où les rayons ne touchent rien : reflet du ciel, vagues, éclats du soleil. Au bout d'une rue qui descend, c'est la baie. `hauteur` est l'angle des plus hauts sommets en degrés (collines 3 à 6, montagne 8 à 15, haute montagne vue de la vallée 18 à 30), `decoupe` la finesse des crêtes (0 à 1), `neige` la part enneigée (0 à 1), `couleur` la roche, `couleur_bas` les contreforts. Exemple : `essais/chalet-mont-blanc.json`.

Limite : c'est un décor de fond. On ne peut pas y marcher, et le terrain proche reste celui du kit. Les sols `herbe` et `neige` existent en recettes.

## Décrire un monde

Le bouton « Décrire un monde » fige l'image et ouvre le micro quand la page y a droit, sinon le clavier. La description part à Claude avec ce format et ses plages ; la réponse passe par `validerFiche` dans `src/main.js`, qui borne chaque valeur et jette les champs inconnus, puis le lieu est chargé et ajouté à « Lieu suivant ». Les six derniers mondes décrits sont gardés dans le navigateur.

Claude compose le lieu dans le vocabulaire générique (kit `nu`, relief, trajet, semis) ; ce qu'il ne peut pas montrer, il le dit dans `note`, affichée en sous-titre. Sans Claude, un lexique de mots-clés compose la fiche : forêt et désert comme avant, et pour `ville`, `rue`, `village`, `cimetière` un monde nu fait de quelques éléments de semis génériques.

## Ce qui manque à la version 0

- **Plan du lieu.** Un graphe de points d'intérêt (clairière, ruine, carrefour) reliés par des chemins, pour que le récit puisse dire « va à la ruine ».
- **Objets posés.** Un banc, une voiture, une porte : des éléments nommés que le récit peut désigner. Les semis répètent, mais un élément de semis ne peut pas encore être désigné par le récit.
- **Personnages visibles.** Silhouettes d'autres protagonistes.
- **Sources de lumière** autres que le soleil et la lampe : un lampadaire ou une fenêtre allumée brillent, mais n'éclairent la rue que par la lumière indirecte, faiblement et avec du bruit.
- **Raccord entre lieux.** Passer de la forêt au village sans coupure.

## Piloter une fiche depuis la console

```js
balade.fiches()                     // identifiants des fiches embarquées
balade.lieu(1)                      // charge la deuxième
balade.fiche({ kit: "dunes", graine: 99, ambiance: { soleil: { azimut: 10, hauteur: 6 } } })
balade.ambiance({ brume: 0.04, lampe: true })
balade.agir([{ type: "tourner", degres: -90 }, { type: "marcher", metres: 12 }])
balade.dire("va voir derrière le rocher")
balade.percevoir()                  // ce que le porteur perçoit, tel que l'IA le reçoit
```
