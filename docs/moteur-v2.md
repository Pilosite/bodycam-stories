# Moteur v2 : tourner, puis projeter

Document de conception. Rien de ce qui suit n'est construit ni mesuré. Il remplace à terme la piste 1 de `rendu.md` (images clés), qu'il généralise.

## Le but, redit

Une vidéo de téléphone, pas un jeu vidéo. Photoréaliste au sens « on croit que quelqu'un a filmé ça », sur un téléphone, dans le navigateur, et entièrement procédural : aucun asset, tout monde demandé par le récit doit pouvoir être fabriqué.

## Ce que disent les références

**Unrecord (2023), le jeu bodycam qui a fait douter Internet.** Les analyses convergent : ce n'est pas la géométrie qui trompe, c'est la caméra et la lumière.

- Fisheye marqué, halo fort autour des zones claires, ciel cramé en blanc (plage dynamique faible).
- La caméra suit le corps avec un retard, elle ne « vise » pas.
- Lumière surtout couverte, peu d'ombres directes dures : c'est le cas le plus facile à rendre crédible.
- La compression des extraits viraux cachait les défauts ; la démo en haute qualité « fait jeu ». Une image trop propre trahit.

Conséquence pour nous : nos principes 1 et 2 sont les bons. La résolution modeste et la compression sont des alliées, pas des compromis.

**Le splatting gaussien (3DGS).** C'est la technique qui donne aujourd'hui du photoréalisme en temps réel sur téléphone, dans le navigateur, en WebGL2 (Spark de World Labs, rendu natif dans three.js depuis r186). Le principe : la scène n'est pas des triangles mais un nuage de petites taches colorées, déjà éclairées. Le coût par image ne dépend plus de la complexité du monde ni de la lumière. Sa limite : les taches viennent toujours d'une **capture** (photos d'un lieu réel) ou d'un modèle génératif. Je n'ai trouvé personne qui les fabrique par code, dans le navigateur.

**Le lancer de rayons par pixel (notre moteur actuel, façon Shadertoy).** Procédural par nature, lumière juste, mais chaque image recalcule tout. Les travaux connus (nuages de Horizon, Lottes « GPU Unchained ») s'en sortent tous de la même façon : calculer peu de pixels par image et reconstruire le reste à partir des images passées.

**WebGPU.** Disponible sur iOS 26 et sur Chrome Android (environ 78 % des appareils d'après une seule source), pas encore sur Firefox Android. Trop tôt pour en faire la base ; à garder en option pour accélérer la cuisson.

## L'idée

Notre moteur fait deux métiers avec un seul outil : **éclairer le monde** (lent, c'est ce qui fait le réel) et **le montrer 30 fois par seconde** (doit être rapide). Séparons-les.

> Le path tracer devient le caméraman d'un tournage qu'on ne voit pas. Ce qu'il capte n'est pas une image mais un nuage de points éclairés. Le téléphone ne fait ensuite que projeter ce nuage, comme un splatting, sauf que la « capture » est notre monde procédural.

C'est du splatting sans capture : la photogrammétrie d'un lieu qui n'existe pas.

### 1. Le tournage (lent, en tâche de fond)

Le path tracer actuel, inchangé dans son principe. Il rend déjà, pour chaque pixel, une couleur et une distance (`gT`, gardée pour la reprojection). Un pixel avec sa distance, c'est un point dans le monde. Au lieu de viser l'écran, on le fait tourner :

- **en panoramique** (toute la sphère, ou 220°) depuis des positions le long du trajet que le récit a annoncé ;
- **en avance** : pendant le chargement, pendant le gel (le joueur parle), pendant les pauses du porteur ;
- **en plusieurs couches par point** : la lumière du soleil et du ciel, déjà calculée (le coûteux), et à côté la couleur propre et l'orientation de la surface (pour ce qui change en direct : la lampe).

Chaque point sait à quelle distance il a été vu : un point filmé de près est fin, un point lointain est gros. Le détail suit tout seul le trajet du récit.

### 2. La projection (rapide, à chaque image)

Dessiner les points proches de la caméra comme de petites taches, avec test de profondeur. C'est la partie que tout téléphone sait faire : son coût est fixe, quelques centaines de milliers de points, quelle que soit la richesse du monde ou de la lumière.

- **La lampe du téléphone** s'applique ici, par point (couleur propre × orientation × cône). La nuit redevient le cas facile.
- **Ce qui bouge** (le lapin qui s'enfuit, une porte) : un petit lancer de rayons limité à la boîte de l'objet, composé par la profondeur.
- **Les trous** (ce qu'aucun point ne couvre encore) : on ne les cache pas, on les habille. Un codec vidéo qui découvre une zone affiche des blocs flous pendant quelques images ; c'est exactement ce défaut qu'on montre, le temps que le tournage rattrape. La reprojection actuelle fait déjà cela en petit.

### 3. Le capteur (inchangé)

`camera.frag` passe par-dessus, comme aujourd'hui. Le grain, les macroblocs et le flou de mouvement cachent le pointillisme du nuage. À ajouter, par ordre de rendement : flou de bougé dans les virages, obturateur roulant, mise au point qui hésite, stabilisation qui ondule, blocs de compression qui grossissent avec le mouvement, et **le son** (pas, souffle, vent, frottement du micro), qui compte autant que l'image pour croire à une vidéo.

## Pourquoi ça colle au jeu

- **Le joueur ne pilote pas.** Le récit connaît le trajet avant lui : on sait où tourner d'avance. Aucun autre jeu n'a ce luxe.
- **Le regard libre** est couvert par le panoramique.
- **Le gel paie le calcul** (principe 5) : parler au personnage, c'est laisser le tournage prendre de l'avance.
- **Procédural intact.** Les recettes de matière, les semis, les fiches : tout reste, c'est ce que le path tracer filme. La refonte générique continue de servir.
- **Le monde peut devenir riche.** Le coût d'affichage ne dépend plus du nombre de couches de semis ni de la complexité des matières : seul le tournage ralentit.

## Ce qui peut casser

| Risque | Parade | Comment le savoir |
|---|---|---|
| Le tournage ne suit pas la marche sur un téléphone | Peu de passes par point, affinées par recouvrement ; le récit ralentit ou fait une pause ; résolution du tournage adaptée | Chronométrer un panoramique sur le téléphone de Toine |
| Mémoire | Ne garder que les points proches du trajet ; un panoramique d'un demi-million de points pèse environ 16 Mo | Compter |
| Trous visibles en tournant la tête ou derrière un tronc | Deux points de vue décalés par position ; blocs de codec en attendant | Essai n° 1 ci-dessous |
| Reflets, brillance (dépendent du point de vue) | Recalculés à la projection, par point ; nos matières sont mates | À l'œil |
| Changement d'ambiance (la brume monte, la nuit tombe) | Brume et lampe à la projection ; un changement de soleil relance le tournage, masqué par l'exposition qui s'adapte | À l'œil |
| L'aspect « nuage de points » de près | Taille de tache selon la distance de capture ; grain du capteur | Essai n° 1 |

## Les trois essais, du moins cher au plus cher

1. **Le projecteur seul (un à deux jours).** Prendre l'image nette que le moteur produit déjà à l'arrêt, avec sa distance, en faire un nuage, et marcher deux mètres en ne projetant que ce nuage. On voit tout de suite les trous, le grain du nuage, et la vitesse. Si le résultat ne passe pas pour une vidéo, on arrête là et on garde le moteur actuel.
2. **Le tournage panoramique** depuis trois positions sur le sentier, puis une marche entière de 10 m en projection seule, comparée à la même marche avec le moteur actuel (`ref/` sert de juge pour l'image fixe).
3. **La mesure sur téléphone** : images par seconde de la projection, secondes par panoramique. C'est elle qui décide.

## Essai n° 2 fait (19 novembre 2026) : le projecteur

Construit, en mode expérimental (bouton « Moteur v2 », option de test `v2`). Le mode actuel reste le défaut, inchangé (vue `a-sentier` : écart après flou 1,7, au niveau du plancher de bruit).

**Ce qui est fait.**
- *Tournage* : `pathtrace.frag` reçoit `uMode = 2`, qui ne change que la génération du rayon (sphère complète, équirectangulaire, axes du monde). Même shader, mêmes recettes, un seul appel à `render()`. Panoramique 1024 × 512 (524 288 points), 4 passes accumulées, qualité « arrêt » (`uQ = 1`) par défaut, couleur + distance en RGBA32F. Points de tournage sur le sentier (`pathX`, hauteur d'œil), tous les 2,5 m, le plus urgent d'abord, en avance dans le sens de la marche ; tournage par bandes de lignes, 12 ms par image au plus.
- *Projection* : `gl.POINTS`, `gl_VertexID` + `texelFetch`, aucun tampon de sommets. Même fisheye équidistant que la caméra, test de profondeur, taille du point = distance de capture × π/H ÷ distance actuelle (×1,25, allongée en tangentiel). Les 3 panoramiques les plus proches ; à égalité de profondeur, le plus proche gagne (décalage de 3 % par rang). Sortie au format de l'accumulation : bloom, exposition et `camera.frag` inchangés.
- *Ciel* : passe plein écran qui relit le ciel du panoramique le plus proche dans la direction du pixel ; ailleurs, un trou.
- *Trous* : **remplissage par dilatation de 2 px** (fond le plus lointain des voisins), signalé ; `v2fill: 0, v2trous: true` les montre en magenta.
- *Mesure* : le panneau « Mesurer » donne, en mode v2, images/s en marche, ms de projection, points dessinés, secondes par panoramique (et de calcul pur), passes et qualité.
- `tools/v2essai.mjs` rend les mêmes poses avec les deux moteurs (départ, regard tourné de 58°, 2 m et 5 m de marche).

**Ce qu'on voit** (planche `out/v2-planche.png`, rendu logiciel 270 × 480).
- Géométrie et lumière : justes. Même sentier, mêmes ombres de troncs, même rocher, à pose égale on confond presque les deux.
- Pointillisme : le sol et le rocher proches deviennent granuleux dès qu'on s'approche (2 m) ; les points carrés se voient sur les surfaces lisses.
- Canopée : les feuilles hautes, captées de loin, deviennent des carrés sombres qui flottent devant le ciel. C'est le défaut le plus visible.
- Trous : peu nombreux avec trois panoramiques autour du porteur : des liserés derrière les troncs et au bord du rocher, à 2 m et 5 m. Avec un seul panoramique (tournage en retard), non mesuré ici.
- Bords : couleur moyennée (fond + objet) placée à une seule distance : léger halo aux silhouettes.
- La qualité « mouvement » (`v2q: 0`) perd les ombres des arbres (ombres trop courtes en pas) : le tournage doit être en qualité « arrêt ».

**Chiffres, rendu logiciel (SwiftShader, 4 cœurs), 270 × 480.**
- Image du moteur actuel en marche (pleine résolution, qualité mouvement) : 2,6 à 5 s.
- Image en projection (1,57 million de points, 3 panoramiques) : 0,3 à 0,6 s, soit 5 à 10 fois moins.
- Un panoramique 1024 × 512 × 4 passes, qualité arrêt : 180 à 260 s de calcul (300 s de mur en tâche de fond) ; qualité mouvement : 150 à 165 s. En logiciel, la qualité arrêt ne coûte que 1,3 fois plus.

**Estimation pour le Mali-G77, à vérifier avec le bouton.** À partir des mesures de Toine (2 M pixels/s en qualité mouvement, 0,23 M pixels/s en passe fixe) : un panoramique 4 passes coûte environ 1 s en qualité mouvement (sans ombres d'arbres) et **environ 9 s en qualité arrêt**. Le porteur marche à 1,35 m/s : un panoramique tous les 2,5 m laisse 1,9 s. Le tournage ne suit pas la marche d'un facteur 5, sauf à tourner pendant les gels et les pauses, ou à réduire (512 × 256, 2 passes, plus d'espacement). La projection, elle, devrait tenir : 1,6 million de points par image est banal pour un GPU mobile, mais les gros points proches coûtent en remplissage.

## Ce que je ne sais pas

- Si un téléphone moyen tourne un panoramique en moins de quelques secondes. Tout le pari est là, et aucune recherche ne le dit : il faut mesurer.
- Si les trous habillés en compression passent à l'œil ou agacent.
- La part de WebGPU utile (cuisson par calcul parallèle) une fois Firefox Android couvert.

## Sources

- Unrecord : PC Gamer, Digital Trends, LevelUp (2023).
- Splatting sur le web et le mobile : Spark (World Labs, sparkjs.dev), three.js r186, WebSplatter (arXiv 2602.03207), Mobile-4DGS, LODGE.
- Reconstruction temporelle : « Optimisations for Real-Time Volumetric Cloudscapes » (arXiv 1609.05344) ; T. Lottes, « GPU Unchained » (NVScene 2015).
- WebGPU : web.dev « WebGPU supported in major browsers », notes de Safari 26.
