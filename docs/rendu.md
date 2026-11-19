# Pistes de rendu

Objectif : pouvoir filmer n'importe quel endroit du monde, réel ou inventé, de façon crédible, sur un téléphone. Classées par état.

## En place

**Path tracing progressif.** Un échantillon de lumière par pixel et par passe, accumulé. À l'arrêt l'image devient nette en quelques secondes.

**Reprojection temporelle.** En mouvement, chaque pixel retrouve où il était dans l'image précédente grâce à sa distance, stockée avec la couleur. L'image reste nette pendant la marche au lieu de repartir de zéro. Les zones qui se découvrent sont bruitées un instant, ce qui ressemble à de la compression vidéo.

**Résolution adaptative.** En mouvement, le moteur mesure le temps d'une image et choisit parmi quatre résolutions, sans descendre sous la moitié : en dessous, il préfère perdre des images par seconde, parce qu'une vidéo saccadée reste crédible et qu'une vidéo pixelisée ne l'est pas. À l'arrêt il repasse en pleine résolution, par bandes, sans bloquer l'interface.

**Feuillage à deux échelles.** Près de la caméra, des feuilles individuelles dans une grille. Au loin, un milieu statistique : la feuille est tirée au sort selon la densité. Même aspect moyen, coût borné.

**Capteur.** Fisheye 125°, exposition automatique avec inertie, halo, netteté forcée, grain et bruit de couleur qui montent avec le gain, macroblocs, coins sombres, dérive de la main, balancement de la marche.

**Nuit.** La lampe du téléphone n'éclaire qu'un cône de quelques mètres, le reste tombe au noir. C'est le cas le plus favorable : moins de monde à rendre crédible, et le bruit devient un bruit de capteur.

## À faire ensuite

**1. Images clés préparées sur le trajet du récit.** C'est le gain principal, et il vient directement de la règle « le joueur ne pilote jamais ». Le récit sait où le porteur va aller. Pendant le gel et les pauses, le moteur calcule à l'avance des vues grand-angle nettes le long du trajet, tous les mètres environ. La marche devient la lecture de ces vues, raccordées par reprojection. Le regard libre du joueur reste possible si chaque vue couvre plus large que l'écran (220° ou une sphère complète). Coût mémoire à maîtriser : une vue en demi-flottant pèse environ 2 Mo à la résolution actuelle.

**2. Sol proche et sous-bois.** Ce qui trahit le plus aujourd'hui. Fougères, ronces, branches tombées, cailloux : la même grille que la canopée, plaquée sur le terrain.

**3. Kit rue et village.** Façades en volumes simples, fenêtres et volets en matière, trottoir, chaussée, lampadaires comme sources de lumière. Plus régulier qu'une forêt, donc plus simple à tracer. Le village français d'abord : pierre, crépi, tuiles.

**4. Matières précalculées au chargement.** Écorce, sol, grès sont recalculés à chaque rayon. Les cuire une fois dans des textures au démarrage diviserait le coût des matières, toujours sans asset.

**5. Champ lointain en panorama.** L'horizon (lisière, toits, relief) calculé une fois par lieu dans une image panoramique, le tracé ne s'occupant que des trente premiers mètres.

## Le monde entier

**Lieux réels.** Des coordonnées donnent une fiche de lieu sans écriture humaine :

- l'occupation du sol (forêt, culture, bâti, sable, eau) choisit le kit ;
- le relief ouvert donne le terrain ;
- OpenStreetMap donne chemins, routes, emprises de bâtiments, cours d'eau ;
- latitude, date et heure donnent le soleil.

Ce qui manque à ces données, c'est tout ce qui fait moins de dix mètres. C'est le travail des kits.

**Lieux inventés.** L'IA écrit la fiche à partir du récit : « un château », « une station-service la nuit ». Elle ne peut demander que ce qu'un kit sait faire, d'où l'importance d'élargir les kits avant d'élargir l'imagination.

**Bibliothèque de kits visée**, par ordre de rendement (crédibilité obtenue par effort) : dunes (fait), forêt (fait), lande et prairie, rue de nuit, village, littoral, intérieur éclairé à la lampe, montagne, neige.

## Écarté pour l'instant

- **Images générées par IA** comme fonds ou textures. Efficace, mais contraire à la règle du code seul et difficile à garder cohérent quand la caméra bouge.
- **Photogrammétrie et nuages de points.** Ce sont des assets.
- **Débruitage par réseau de neurones.** Trop lourd pour un téléphone, et le bruit sert la crédibilité.
- **WebGPU.** À reconsidérer pour les kits à maillage (bâtiments), quand la couverture mobile sera vérifiée.

## Ce qui n'est pas mesuré

Aucune de ces pistes n'a été chronométrée sur un vrai téléphone. Avant d'investir dans la piste 1, mesurer sur l'appareil de référence : temps d'une image de mouvement à chaque résolution, temps d'une passe fixe, mémoire disponible.
