# Fiche de lieu (version 0)

Une fiche de lieu est le seul texte que l'IA écrit pour créer un environnement. Elle ne décrit jamais de géométrie : elle choisit un kit, le règle, et pose l'ambiance. Le moteur fait le reste à partir de la graine.

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
| `kit` | oui | `foret` ou `dunes`. Prévus : `rue`, `village`, `interieur`, `littoral`. |
| `foret.densite` | oui | 0 à 1. Part de cellules occupées par un arbre. |
| `foret.rochers` | oui | 0 à 1 et plus. Abondance des blocs de grès. |
| `foret.feuillage` | oui | 0 à 1,5. Densité de la canopée. |
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

Surfaces : `sol`, `trajet`, `rochers`, `arbres` et `perches` (`{ "a", "b", "part" }` : deux écorces et la part de la première). Une forme d'objet peut aussi nommer une recette dans `matiere` (par exemple `"matiere": "planches"`). Une recette inconnue retombe sur celle du kit.

Une recette s'évalue toujours dans le même ordre. Tous les champs sont facultatifs.

| Champ | Sens |
|---|---|
| `base` | Nom d'une recette dont on hérite ; les champs donnés la complètent. |
| `espace` | `sol` (motifs posés sur le plan, pour le sol et le trajet) ou `volume` (motifs dans la matière, pour rochers, troncs, objets). |
| `couleur` | Couleur de base, `#rrggbb`. |
| `nuance` | Seconde couleur par plages : `couleur`, `force`, `echelle`, `seuils`, `fbm`, `decalage`. |
| `taches` | Jusqu'à quatre couches : `couleur`, `force`, `echelle` (nombre ou `[x, y, z]`, anisotrope), `seuils`, `fbm`, `decalage`, `biais` et `hauteur` (plus présentes vers une hauteur, comme le pied noirci d'un bouleau), `creux` (la tache est en creux), `sous_motif` (peinte avant le motif), `sur_motif` (seulement sur les éléments du motif). `#000000` assombrit : humidité, salissures. |
| `motif` | `type` : `feuilles` (litière de cellules, `palette`, `couverture`, `taille`), `rides` (vent sur le sable), `fissures` (écorce : `seuils`, `profondeur`, `fines`, `assombrit`), `planches` (`joint`, `longueur`), `paves` (`joint`, `decalage_rangs`, `bombe`). Communs : `echelle`, `couleur` (joints, fond des fissures), `opacite`, `inclinaison`, `palette` (`[{ "couleur", "part" }]`). |
| `variation`, `grain` | Modulation de la couleur, grande et fine : `echelle`, `force`. |
| `mousse` | Mousse ou lichen : `couleur`, `force`, `echelle`, `seuils`, `fbm`, `dessus` (seuils sur l'orientation vers le ciel, limite décalée par `pente_bruit`, `pente_echelle`), `cote` (seuils vers le côté humide), `hauteur` (seuils sur la hauteur au-dessus du sol), `grain`, `adoucit` (efface le relief). |
| `salissure` | Le pied s'assombrit : `force`, `hauteur` en mètres. |
| `relief` | `motif` (profondeur du motif et des creux), `bosses` (deux bruits `{ echelle, force, fbm }`), `inclinaison` (facettes des feuilles), `grain` (`{ echelle, force }`). |
| `brillance` | Reflet spéculaire, 0 à 1. |

Le moteur borne chaque valeur avant usage. Limites : 24 recettes par lieu, 12 recettes dans une fiche.

## Décrire un monde

Le bouton « Décrire un monde » fige l'image et ouvre le micro quand la page y a droit, sinon le clavier. La description part à Claude avec ce format et ses plages ; la réponse passe par `validerFiche` dans `src/main.js`, qui borne chaque valeur et jette les champs inconnus, puis le lieu est chargé et ajouté à « Lieu suivant ». Les six derniers mondes décrits sont gardés dans le navigateur.

Quand la demande sort des kits existants (une ville, un château), Claude choisit l'ambiance la plus proche et le dit dans `note`, affichée en sous-titre. Sans Claude, un lexique de mots-clés compose la fiche.

## Ce qui manque à la version 0

- **Plan du lieu.** Un graphe de points d'intérêt (clairière, ruine, carrefour) reliés par des chemins, pour que le récit puisse dire « va à la ruine ».
- **Objets posés.** Un banc, une voiture, une porte : des éléments nommés que le récit peut désigner et que le moteur sait placer.
- **Personnages visibles.** Silhouettes d'autres protagonistes.
- **Sources de lumière** autres que le soleil et la lampe : lampadaires, fenêtres, feu.
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
