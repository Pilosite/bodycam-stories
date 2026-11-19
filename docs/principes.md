# Principes

## Ce qu'on fabrique

Une narration photoréaliste en caméra portée : on suit quelqu'un qui filme, comme s'il tournait un TikTok avec un téléphone un peu fatigué. Le joueur ne joue pas ce personnage. Il est une voix dans sa tête.

## Les cinq principes de rendu

1. **La caméra avant le monde.** On croit à une image parce qu'elle a les défauts d'un capteur : ciel cramé, exposition qui met une demi-seconde à s'adapter, grain qui vit, fisheye, coins sombres, compression, main qui tremble. Ces défauts coûtent presque rien à calculer et ils masquent la simplicité du décor.
2. **La lumière fait le réel.** Elle est calculée physiquement (path tracing : soleil, ciel, un rebond, feuilles translucides), jamais peinte à la main. Une géométrie simple sous une lumière juste passe pour une photo ; l'inverse ne passe jamais.
3. **L'IA décrit, le moteur fabrique.** L'IA écrit une fiche de lieu. Chaque kit (forêt, dunes, demain rue, intérieur) sait produire un lieu crédible à partir de quelques paramètres et d'une graine. La créativité vient des combinaisons, la crédibilité vient des kits.
4. **Le monde se génère là où le récit va.** Rien n'existe tant que le porteur n'y va pas. Comme c'est le récit qui choisit le trajet, le moteur connaît la suite avant le joueur et peut la préparer.
5. **Le gel paie le calcul.** Quand le monde se fige pour que le joueur parle, l'image a le temps de devenir nette et l'IA a le temps de décider la suite. Le temps mort devient un moment de jeu.

## La boucle de jeu

1. **Il marche.** Le porteur avance seul, selon le récit. L'image est celle d'une vidéo : un peu bruitée, vivante.
2. **Le joueur regarde.** Il tourne le regard librement autour de la caméra. Il ne déplace rien.
3. **Le monde se fige.** Le joueur ouvre le canal et parle. L'image s'affine.
4. **Il pense à voix basse.** Le porteur réagit en une ou deux phrases, à la première personne.
5. **Il agit, et le monde suit.** Il tourne, avance, lève la caméra. Ce qu'il imagine peut changer le lieu (la brume monte, la lampe faiblit) ou déclencher un temps de l'histoire.

Variante prévue : la dissociation, une vue détachée du corps pour voir où il se trouve, sans pouvoir agir davantage.

## Ce qu'on ne fait pas

- Pas de commande directe du personnage.
- Pas de médias importés.
- Pas de course à la résolution : un rendu interne modeste, agrandi et traité par le capteur, est plus crédible qu'un 1080p trop propre.
