# Bodycam Stories : les principes, et la preuve de concept à faire

Ce document pose ce que la démo satirique du 20 novembre illustrait, ce qui y était vrai, ce qui y était mis en scène, et ce qu'une vraie preuve de concept doit démontrer. Il est écrit à partir d'une demande orale de Toine dont la fin a été coupée : les points marqués « à trancher » attendent sa réponse.

## 1. L'idée en une phrase

Un jeu où le monde n'est pas programmé puis animé par de l'IA, mais **tenu par de l'IA puis contraint par un moteur** : le joueur dit ce qu'il veut, des modèles décident de ce qui arrive, et un langage intermédiaire fermé traduit cette décision en image, en son et en récit, dans un budget fixe.

## 2. Les cinq principes

### 2.1 Le renversement

Un jeu classique est un monde déterministe dans lequel on glisse un peu d'indéterminé (un dialogue généré, une quête aléatoire). Ici, l'indéterminé est l'état de base : rien de ce qui arrive n'est écrit d'avance. Le déterminisme ne disparaît pas, il change de place. Il n'est plus dans le contenu (les objets, les scènes, les répliques), il est dans **les lois** : un vocabulaire fermé, un budget par image, des bornes physiques, une graine. Le moteur ne sait pas ce qu'est une cabane ; il sait ce qu'est une forme, une matière, un poids, une place libre.

Conséquence pratique, déjà tenue dans le dépôt : on n'ajoute jamais un cas particulier. Quand une demande échoue, on élargit le vocabulaire ou on ajoute une donnée, jamais un `if` sur un nom d'objet.

### 2.2 Le parti pris bodycam est ce qui rend ça tenable

Un monde où tout peut arriver est injouable et impossible à calculer si le joueur le pilote librement. Le cadre le referme sans le dire :

- **On ne dirige personne.** On parle à quelqu'un qui porte la caméra. Entre la demande et le monde, il y a un personnage avec un corps, un caractère et des limites. C'est lui qui absorbe l'imprécision des modèles : une demande mal comprise devient une personne qui comprend de travers, râle, hésite. L'erreur devient du jeu.
- **Un seul point de vue, subjectif.** Le monde n'a besoin d'exister que là où la caméra regarde, à la finesse qu'une caméra-piéton restitue.
- **Une image de téléphone.** Grain, compression, exposition, bougé : ces défauts font le réalisme et couvrent les raccourcis du rendu.
- **Le temps appartient au récit.** Le personnage met du temps à agir ; ce temps est celui dont les modèles ont besoin pour réfléchir.

### 2.3 Un langage intermédiaire, seul canal entre les modèles et le monde

Aucun modèle ne touche le moteur directement. Tout ce qu'une IA veut faire arriver passe par des énoncés d'un langage intermédiaire (le « PDL » de la démo, à faire pour de bon). Ses propriétés, toutes vérifiables :

1. **Fermé.** Un vocabulaire typé et fini : lieu, relief, lumière, matière, forme, corps, action, son, fait de récit, règle. Ce qui n'est pas dans le vocabulaire ne s'écrit pas.
2. **Multimodal par construction.** Un même énoncé décrit une intention ; le moteur en tire l'image, le son et la trace dans le récit. Une chose de 20 kg qui tombe est une forme, un bruit dont la hauteur suit la masse, et un fait dont le personnage se souviendra.
3. **Partiel et incrémental.** Un énoncé modifie le monde, il ne le redécrit pas. Il peut arriver par morceaux et commencer à s'exécuter avant d'être fini.
4. **Validé avant d'être exécuté.** Chaque énoncé est vérifié, borné (taille, nombre de formes, distance) et rattaché au budget. Un énoncé invalide n'est jamais exécuté tel quel.
5. **Réparable.** Le moteur complète ce qui manque et corrige ce qui déborde, selon la demande du joueur, qui fait foi. Un refus du modèle ne casse pas la promesse faite au joueur.
6. **Déterministe à l'exécution.** Même énoncé, même graine, même résultat. L'indéterminé est dans la décision, pas dans son rendu : une partie se rejoue à partir de son journal d'énoncés.
7. **Compact.** Peu de jetons, pour qu'un petit modèle rapide puisse l'écrire et qu'un gros puisse en préparer beaucoup d'avance.
8. **Porteur de règles.** Il exprime aussi des conséquences (« au-delà de tel seuil, tel effet d'ambiance »), pour que le monde réagisse sans qu'un modèle soit rappelé.

### 2.4 Plusieurs vitesses de pensée

Un seul gros modèle appelé à chaque phrase donne 5 à 8 secondes de silence. La réponse n'est pas un modèle plus rapide, c'est une hiérarchie de temps, chaque étage parlant le même langage intermédiaire :

| Étage | Délai | Qui | Rôle |
|---|---|---|---|
| Réflexe | moins de 100 ms | la page, sans modèle | reconnaître la demande, lancer le geste probable, garder le monde cohérent |
| Traduction | 0,2 à 0,8 s | petits modèles très rapides | phrase du joueur → intention ; intention → réplique du personnage ; tri de ce qui est recevable |
| Mise en scène | 2 à 8 s | modèle intermédiaire | la réaction complète : choses nouvelles, conséquences, ton |
| Fond | 10 s à plusieurs minutes, en continu | gros modèle | la trame, les embranchements, ce qui se prépare |

Les étages rapides ne sont pas des versions appauvries des lents : ils **piochent dans ce que les lents ont préparé**.

### 2.5 L'anticipation : générer les possibles autour du présent

Un jeu procédural à la Minecraft fabrique le terrain autour du joueur avant qu'il y arrive. Ici, c'est l'histoire qu'on fabrique d'avance. Le modèle de fond entretient en permanence une **frontière de possibles** : pour l'état présent, les quelques directions vers lesquelles le joueur va probablement aller, chacune préparée sous forme d'énoncés prêts à exécuter (lieux, événements, réactions du personnage, embranchements). Quand le joueur parle, l'étage de traduction cherche d'abord dans cette frontière. S'il trouve, la réponse est immédiate et de la qualité du gros modèle. S'il ne trouve pas, l'étage de mise en scène improvise, et le fond rattrape.

Ce qui est préparé et jamais joué est jeté. Ce qui est joué invalide une partie de la frontière, qui se recalcule.

## 3. Ce qui était vrai dans la démo, et ce qui était mis en scène

| Élément | Statut |
|---|---|
| Monde décrit par une fiche, fabriqué par code, sans image ni modèle 3D | vrai |
| On parle au personnage, il agit de lui-même | vrai |
| Vocabulaire générique : aucun nom d'objet dans le code, tout en données | vrai, vérifié par des tests |
| La page tient la demande même si le modèle répond à côté | vrai |
| La page agit avant la réponse du modèle quand elle sait quoi faire | vrai, mais par motifs de mots, pas par un modèle |
| Bruits, effort, dégoût, conséquences réglés par des données | vrai |
| Recherche sur le lieu et le personnage | réellement faite, puis rejouée en accéléré |
| PDL | **affichage seulement** : le moteur lit du JSON, la notation est générée après coup |
| Réseau Haiku / Sonnet / JEV / Opus | **mise en scène** : un seul modèle répond pendant le jeu |
| Régie d'agents à gauche | illustration branchée sur de vrais signaux |
| Le profil de Sam influence ce qu'elle dit | à moitié : il colore la banque de phrases, pas la consigne du modèle |
| Anticipation de l'histoire | **absente** |
| Monde « n'importe lequel » | une forêt réglée à la main, d'autres scènes plus pauvres |

La preuve de concept consiste à faire passer les lignes en gras du côté « vrai ».

## 4. La preuve de concept

### 4.1 Ce qu'elle doit démontrer

Quatre affirmations, chacune avec une mesure :

1. **Le langage intermédiaire est réel.** Le moteur n'accepte plus rien d'autre. Mesure : 100 % de ce qui change le monde passe par lui ; une partie entière se rejoue à l'identique depuis son journal.
2. **N'importe quelle demande raisonnable aboutit.** Mesure : sur une liste de 50 demandes jamais vues, écrite par quelqu'un d'autre que nous, la part qui donne quelque chose de lisible à l'écran et de cohérent, sans retouche du code.
3. **Les vitesses de pensée tiennent.** Mesure : délai entre la fin de la phrase et la première réaction visible (cible : moins de 0,5 s), et délai jusqu'à la réaction complète (cible : moins de 3 s en médiane), avec de vrais modèles de tailles différentes.
4. **L'anticipation sert.** Mesure : part des demandes servies depuis la frontière préparée, et écart de qualité et de délai entre une demande anticipée et une demande improvisée.

Plus une contrainte permanente : **le budget par image ne dépend pas de ce qui est demandé.**

### 4.2 Le périmètre proposé

Un seul lieu au départ (la forêt), un personnage (Sam), dix à quinze minutes de jeu libre, sur PC. On ne cherche pas la variété des mondes dans cette étape : on cherche à prouver la chaîne complète sur un terrain qu'on connaît.

Quatre lots, dans cet ordre :

1. **Le langage, pour de bon.** Spécification écrite (grammaire, types, bornes, sémantique de chaque énoncé), un valideur, un exécuteur, un journal. Les fiches, les gestes, les objets, les sons et les faits de récit existants sont réexprimés dedans. Rien d'autre n'entre dans le moteur.
2. **Les étages.** Un étage de traduction qui écrit des intentions dans ce langage, un étage de mise en scène qui écrit la réaction, branchés sur de vrais modèles de tailles différentes, avec repli de l'un sur l'autre. Le profil du personnage entre dans leurs consignes.
3. **Le fond.** Un modèle qui tourne en continu, tient la trame (ce qui s'est passé, ce qui est en tension, ce qui peut arriver) et alimente la frontière de possibles. Un cache, une règle d'invalidation, des compteurs.
4. **La mesure.** Le banc des 50 demandes, les délais, la part d'anticipé, le rejeu. Un panneau qui montre ces chiffres en direct remplace le réseau d'agents décoratif : la même image, mais vraie.

### 4.3 Ce qu'on ne fait pas dans cette étape

Plusieurs mondes, le multijoueur, la sauvegarde longue, un vrai moteur de son, des personnages secondaires, le téléphone. Chacun est une suite possible ; aucun n'est nécessaire à la preuve.

## 5. À trancher

1. **La fin de la demande.** La phrase s'arrêtait sur « prévoir que le joueur va finir par arriver là-dedans, et donc… ». La section 2.5 est mon interprétation ; elle est à confirmer ou corriger.
2. **Les modèles disponibles.** L'artefact n'appelle aujourd'hui qu'un seul modèle, sans choix de taille. Les étages demandent d'en appeler plusieurs. Soit la page sort de l'artefact (une application avec sa propre clé), soit on simule les étages avec un seul modèle et des consignes de longueurs différentes, ce qui prouve l'architecture mais pas les délais.
3. **Le langage : lisible ou opaque.** Une notation lisible par un humain se met au point plus vite. Une notation en jetons denses coûte moins cher à écrire pour un modèle. On peut avoir les deux (une forme canonique, deux écritures), au prix d'un peu de travail.
4. **Le ton.** La démo était une farce. Le prototype peut garder ce ton ou viser un récit sérieux ; ça change le contenu du banc d'essai, pas l'architecture.
