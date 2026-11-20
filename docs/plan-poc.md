# Plan d'action : la preuve de concept, version sérieuse

Suite de `docs/poc-principes.md`. Même démonstration que la démo du 20 novembre, sans la farce : une histoire courte et tenue, conçue d'avance dans ses fondations, jouée par un moteur où rien n'est écrit dans le détail.

## 1. Ce qu'on livre

Une expérience de dix à quinze minutes, sur PC, qu'on peut mettre entre les mains de quelqu'un sans rien lui expliquer, et un tableau de mesures qui prouve les quatre affirmations de `poc-principes.md` (langage réel, demandes libres qui aboutissent, vitesses de pensée, anticipation utile).

## 2. L'histoire : « La tournée de Louis »

### 2.1 Le principe

Une histoire « préchauffée » : ce qui est conçu d'avance, ce sont les fondations (un lieu, deux personnes, une question, trois temps, des fins possibles). Tout le reste, ce que Sam dit, ce qu'elle trouve en chemin, ce qui arrive quand le joueur demande quelque chose d'imprévu, est décidé pendant la partie.

### 2.2 Les fondations

- **Le lieu.** La forêt des Grands Avaux à Champcueil, un matin de novembre, du lever du soleil à la pleine lumière. On le connaît, il est déjà réglé.
- **Sam.** Trente ans, élagueuse, sèche et drôle, peu peureuse. Elle connaît les arbres, pas cette forêt-ci.
- **Louis.** Son frère, garde forestier. Il n'est pas rentré de sa tournée il y a trois semaines. On a rendu ses affaires à Sam, dont sa caméra-piéton.
- **Le joueur.** La voix à l'autre bout de la caméra. Louis faisait ses tournées avec quelqu'un en ligne qui regardait le flux et lui parlait ; Sam rallume la caméra, et il y a encore quelqu'un. Elle ne sait pas qui. Le joueur non plus n'a pas à le décider tout de suite. C'est ce qui fonde, dans la fiction, le fait qu'on lui parle et qu'on ne la dirige pas.
- **La question.** Que faisait Louis ici, et pourquoi sa dernière tournée s'arrête-t-elle au milieu ?
- **L'objet.** La caméra : sa batterie baisse, c'est l'horloge de la partie.

### 2.3 Les trois temps

1. **Le sentier.** Sam hésite à entrer. On apprend à lui parler, à lui faire regarder, avancer, toucher. Premières traces de Louis : ses marques de peinture sur les troncs, qu'elle sait lire mieux que nous (c'est son métier).
2. **La platière.** Le terrain s'ouvre. Louis s'arrêtait là : on trouve ce qu'il y a laissé. Un choix de direction, que le joueur propose et que Sam discute.
3. **L'affût.** Ce que Louis regardait. La partie se ferme sur ce qu'on en fait.

### 2.4 Les fins

Trois familles, pas trois scènes écrites : Sam comprend et reprend la tournée ; Sam comprend et éteint la caméra ; la batterie meurt avant. Laquelle arrive, et sous quelle forme, dépend de ce qui s'est dit.

### 2.5 Ce que Louis regardait

**À trancher.** Je propose quelque chose de discret et de vrai plutôt qu'un drame : il suivait, seul et sans le dire, quelque chose de fragile que cette forêt abrite, et sa tournée s'arrête parce qu'il a choisi de rester le regarder. L'histoire est alors celle d'un deuil qui se transforme en relais. Une version policière (des coupes illégales qu'il documentait) marche aussi, avec un ton plus tendu. Le moteur est le même.

### 2.6 Pourquoi cette histoire démontre les principes

| Principe | Où on le voit |
|---|---|
| Le renversement | Le joueur peut demander n'importe quoi à Sam (grimper, appeler, bâtir un repère, faire du feu, rebrousser chemin) ; rien n'est prévu, et l'histoire tient quand même |
| Le parti pris bodycam | Sam refuse, discute, a du chagrin ; la batterie ; on ne voit que ce qu'elle regarde |
| Le langage intermédiaire | Un geai qui alarme, la brume qui se lève, une marque sur un tronc : chaque événement est un énoncé qui donne à la fois l'image, le son et un fait retenu par le récit |
| Les vitesses de pensée | Elle réagit tout de suite, répond en une seconde, et ce qu'elle trouve à la platière a été pensé pendant qu'elle marchait |
| L'anticipation | À chaque temps, le fond a préparé les trois ou quatre directions probables ; on mesure combien de fois le joueur y va |

## 3. Les lots

Six lots. Les lots 1 et 2 partent ensemble ; 3 et 4 dépendent de 1 ; 5 court tout du long ; 6 ferme.

### Lot 0 : décisions (bloquant, voir section 6)

Où tourne le prototype et avec quels modèles ; ce que regardait Louis ; langue de l'interface.

### Lot 1 : le langage intermédiaire

- Une spécification écrite : types, grammaire, bornes, sens de chaque énoncé, avec des exemples.
- Un valideur, un exécuteur, un journal ; le rejeu d'une partie depuis son journal.
- Tout ce qui existe est réexprimé dedans : lieu, choses, gestes, sons, faits de récit, règles de conséquence.
- Le moteur n'accepte plus rien d'autre.
- **Fini quand :** une partie de dix minutes se rejoue à l'identique ; un énoncé invalide est toujours réparé ou refusé, jamais exécuté tel quel ; aucun nom de chose dans le code.

### Lot 2 : l'histoire

- La bible : les fondations ci-dessus, détaillées (deux pages), plus la voix de Sam.
- La trame, exprimée dans le contrat d'histoire qui existe déjà (`docs/contrat-histoire.md`) : temps, faits, tensions, fins.
- Le lieu réglé pour elle : la platière, l'affût, la lumière qui monte.
- Le banc d'essai : 50 demandes écrites par quelqu'un d'autre que nous, dans le ton de l'histoire.
- **Fini quand :** on joue les trois temps de bout en bout avec le moteur actuel, même lentement.

### Lot 3 : les étages de modèles

- Traduction (petit modèle rapide) : phrase du joueur → intention ; intention → réplique de Sam.
- Mise en scène (modèle intermédiaire) : la réaction complète, les choses nouvelles.
- Repli d'un étage sur l'autre ; le profil de Sam dans leurs consignes.
- **Fini quand :** première réaction en moins de 0,5 s et réaction complète en moins de 3 s en médiane, mesurées.

### Lot 4 : le fond et l'anticipation

- Un modèle qui tient la trame en continu et prépare la frontière des possibles, en énoncés prêts.
- Cache, invalidation, compteurs.
- **Fini quand :** on sait dire, sur dix parties, quelle part des demandes a été servie depuis ce qui était préparé, et ce que ça change au délai.

### Lot 5 : la mesure

- Le banc des 50 demandes, rejouable d'une commande.
- Les délais par étage, la part d'anticipé, le coût par image, relevés pendant le jeu.
- Le panneau du réseau d'agents reste, branché sur ces vrais chiffres.

### Lot 6 : la finition

- Ouverture sobre, sans mise en scène de préparation : on entre dans l'histoire.
- La farce (modèles, phrases, bruitages) sort de la partie principale et reste dans un bac à sable à part. Les mécanismes génériques qu'elle a fait naître restent : effort, émotion du corps, conséquences d'ambiance, façonnage, mains.
- Une vidéo de trois minutes et une page de résultats.

## 4. Ce qu'on garde du travail fait

Le moteur de rendu, la lumière, la forêt, le personnage qui agit seul, la pose et le cadrage des choses, les déplacements, la bibliothèque de modèles et de matières, le synthétiseur de bruitages, la voix, l'ouverture comme coquille, le panneau d'activité, le mode « la page agit avant la réponse ».

## 5. Les risques

1. **Les modèles.** Sans accès à plusieurs tailles de modèles, les lots 3 et 4 ne prouvent que l'architecture. C'est la première décision.
2. **Le langage trop ambitieux.** Le piège est d'en faire un langage général. Il doit couvrir cette histoire et les 50 demandes, pas plus.
3. **Les demandes libres.** « N'importe quoi » se heurtera au vocabulaire de formes actuel (pas d'intérieur, pas de créature articulée, pas de feu). Le banc dira où élargir en premier.
4. **Le rendu sur le PC cible.** Le temps de chargement et la finesse de l'image ne sont pas réglés ; il manque toujours une mesure du banc d'essai intégré.
5. **Le ton.** Une histoire sobre supporte moins bien les maladresses qu'une farce. La voix de Sam doit être écrite avec soin avant de brancher les modèles.

## 6. À trancher avant de lancer

1. **Où tourne le prototype.** Dans l'artefact (un seul modèle, étages simulés) ou dans une application à part avec sa clé (vrais étages, vrais délais) ? Je recommande la seconde pour les lots 3 et 4, en gardant l'artefact pour montrer.
2. **Ce que regardait Louis** (section 2.5) : la version discrète ou la version policière.
3. **La langue.** L'illustration est en anglais. Le jeu lui-même : français, anglais, ou les deux ?
4. **L'ordre.** Je propose de lancer tout de suite les lots 1 et 2 en parallèle, qui ne dépendent d'aucune des décisions ci-dessus sauf la deuxième.
