# Ouverture de démo

Pour présenter le concept sans attendre cinq minutes de génération : la page s'ouvre sur « Quel monde veux-tu filmer ? ». Une demande qui correspond à une préparation enregistrée est **rejouée en accéléré** (22 à 30 s) pendant que le moteur compile le lieu derrière, un programme à la fois, sans rien rendre ; on fond ensuite sur le monde. Une autre demande part dans la vraie chaîne du constructeur (`atelier.js`), en temps réel.

## Ce qui est rejoué, et ce qui ne l'est pas

- Le rejeu ne montre **que** ce qui a été réellement fait : `ouvertures/*.json` est le journal d'une vraie séance de recherche (requêtes tapées, pages lues, pages illisibles ou refusées, constats tirés, chacun relié au réglage qu'il justifie). On n'y ajoute rien d'inventé ; une nouvelle préparation donne un nouveau journal.
- Sources : titre et domaine seulement. Aucun texte recopié. Seule exception à la règle 4 (« code seulement ») : les vignettes de photos de l'étape « Photos du lieu » (ci-dessous), limitées à l'écran d'ouverture.
- L'écriture en PDL et le contrôle sont **calculés dans la page** sur la fiche embarquée (`pdl()` de `src/ouverture.js`, `controler()` du constructeur) : les valeurs affichées sont celles qui sont rendues.
- Seules les durées sont raccourcies. Elles sont un peu irrégulières (±40 % autour des durées du journal), les lignes arrivent au fil de l'eau.
- Dès l'ouverture, la fiche de la suggestion est appliquée en coulisse et tout ce que demande la première image se compile pendant la question et le rejeu, un programme à la fois (capteur et halo, semeur, socle de l'ombrage, formes, puis la variante complète : `prechauffer` et la file `COMP` de `src/main.js`, `docs/moteur-v3.md`, « Lancement sans gel »). Le moteur ne rend rien derrière l'ouverture : le rejeu ne saccade pas.
- À la fin du rejeu, le moteur se réveille ; le fondu part dès la première image (`pretOuverture`). L'attente est bornée à 5 s (`CFG.ouvAttente`) : au-delà, on fond sur ce qui est prêt. Pendant l'attente, la ligne « Le monde se construit » affiche l'étape en cours (compilation de tel programme, première image). `balade.ouvertureMesure()` rend l'attente mesurée.

## Défilé (20 novembre 2026) : étapes, personnage, PDL, réseau d'agents

Ordre : comprendre la demande (avec ses repères en puces) → **le lieu** (recherche, photos, ce que j'en retiens) → **le personnage** (recherche, ce que j'en retiens) → **écriture en PDL** → contrôle → le monde se construit. Rejeu de 22 à 30 s (tests). Chaque étape porte une phrase d'apport pour un spectateur non technique (`apport` dans le journal), une barre de progression, un compteur. Les requêtes partent en rafale, toutes affichées en grille de puces ; sources et constats défilent tous dans les compteurs, mais n'en montrent que quelques-uns (3 sources, les constats marqués `vitrine`), le reste en « +N ». Les étapes de recherche se replient une fois finies.

- **Personnage.** Sam a 30 ans (suggestion et repères). La section `personnage` du journal est une vraie recherche web du 20 novembre 2026 (6 requêtes, 10 pages dont 5 lues, 2 refusées, 1 illisible, 2 extraits ; 7 constats, chacun relié à un réglage) et ses `reglages` (ton, peur, vocabulaire, humour, savoir-faire, tenue, poches, caméra). Ces réglages sont des données du journal, affichées dans le rejeu : **la voix de Sam ne les lit pas encore** (`src/main.js` garde sa propre consigne).
- **PDL, « Procedural Diaphasic Language ».** L'étape « Écriture en PDL » montre `pdl()` (`src/ouverture.js`, fonction pure) : la fiche embarquée et les réglages du personnage transcrits en notation serrée, une ligne par idée. Le compteur « N tokens · même contenu en JSON : M · −X % » est calculé pour de bon (caractères / 4) sur les deux textes du même contenu (`donnees`, en JSON compact). **C'est un affichage** : le moteur ne lit pas le PDL, il lit la fiche JSON ; aucun LLM n'écrit ce PDL pendant le rejeu. La phrase de titre (« une notation pensée pour qu'un LLM décrive un monde, un son et une histoire en très peu de tokens ») décrit une intention, pas une fonction du moteur.
- **Réseau d'agents** (colonne de droite, PC) : 15 nœuds « haiku » (recherche), 5 « sonnet » (analyse), 2 « opus » (écriture PDL), reliés par des arêtes où filent des impulsions ; chaque allumage suit un événement du rejeu (requête, photo, source, constat, ligne de PDL), compteurs requêtes · sources · tokens. Il se réduit en bandeau quand les photos arrivent, et les nœuds opus rougissent à l'étape PDL. **C'est une mise en scène de la démo** : le rejeu illustre une répartition du travail entre modèles ; il ne mesure pas ce qui tourne réellement (la séance enregistrée a été faite par un seul agent).

## Photos du lieu (exception assumée à « code seulement »)

À la demande de l'auteur, le rejeu montre aussi qu'on va chercher des photos du lieu : entre « Lecture des sources » et « Ce que j'en retiens », une étape **Photos du lieu** montre les vignettes : sur PC (fenêtre large et couchée, `LARGE` dans `src/ouverture.js`, la cible de la démo), dans une planche à droite du journal, en mosaïque de 4 colonnes aux vignettes plus grandes, la colonne étant réservée dès le début du rejeu ; au téléphone, dans une bande qui défile dans le journal. Elles arrivent par rafales (80 à 200 ms d'écart, irrégulier), chacune un peu de travers, « en lecture » (cadre clair, balayage) puis avec son observation écrite dessous ; trois sont écartées (grisées, « hors sujet » et la raison) : c'est le vrai tri de la recherche. Les photos qui appuient un constat y restent épinglées (petite vignette cerclée de rouge à côté du constat), jusqu'à la traduction en réglages et au-delà, dans le journal. Une ligne de crédit est sous la bande ; le détail (titre, auteur, licence, lien vers la page Commons) est au survol de chaque vignette et dans « Crédits des photos » en fin de rejeu.

- **Vraies photos, vraie recherche.** Recherche faite le 20 novembre 2026 sur Wikimedia Commons (API de recherche, une requête à la fois), en complément de la séance du 19 : requêtes, photos gardées et écartées, observations sont dans `ouvertures/photos/champcueil.json` ; les observations sont aussi parmi les constats du journal (`ouvertures/champcueil.json`, source « commons.wikimedia.org (photo) », champ `photo`). Chaque photo a été regardée ; aucune observation n'est tirée d'autre chose que l'image.
- **Licences libres seulement** (CC BY, CC BY-SA, CC0, domaine public), aucune image d'un autre site, aucun lien à chaud : les vignettes sont embarquées en `data:image/jpeg;base64` (176 × 132, JPEG qualité 56, 3,9 à 6,4 Ko chacune ; 88 Ko en base64 pour les 12 ; la page grossit d'environ 102 Ko). Chaque vignette est une adaptation (recadrée en 4:3 et réduite) ; pour les BY-SA, elle reste sous la même licence.
- **Jamais dans le monde rendu.** Les photos n'illustrent que la recherche, à l'écran d'ouverture ; le moteur ne les lit pas. Le build les joint au journal (`vignettes`) quand celui-ci les nomme (`"photos": "champcueil"`).
- **Pas de saccade** : les vignettes sont décodées (`img.decode()`) dès le début du rejeu ; animations en `transform` et `opacity` ; la bande défile par `translate3d`, une seule lecture de mise en page. L'étape dure 3 à 4 s ; le rejeu s'allonge de 3,7 s en moyenne (le moteur a d'autant plus de temps pour compiler).
- La vraie chaîne du constructeur (demande sans rejeu) ne montre pas de photos.

| Observation | Photo (Wikimedia Commons) | Auteur | Licence |
|---|---|---|---|
| gros bloc gris troué, sentier de terre brune | [Forêt départementale des Grands Avaux - Essonne - Septembre 2020 01.jpg](https://commons.wikimedia.org/wiki/File:Forêt_départementale_des_Grands_Avaux_-_Essonne_-_Septembre_2020_01.jpg) | GrandCelinien | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) |
| blocs arrondis, mousse vive sur le dessus | [Forêt départementale des Grands Avaux - Essonne - Septembre 2020 03.jpg](https://commons.wikimedia.org/wiki/File:Forêt_départementale_des_Grands_Avaux_-_Essonne_-_Septembre_2020_03.jpg) | GrandCelinien | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) |
| écartée : le village, pas la forêt | [Champcueil-façade-Notre-Dame.jpg](https://commons.wikimedia.org/wiki/File:Champcueil-façade-Notre-Dame.jpg) | JC Allin | [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/) |
| tapis de bogues de châtaignes | [Forêt départementale des Grands Avaux - Essonne - Septembre 2020 02.jpg](https://commons.wikimedia.org/wiki/File:Forêt_départementale_des_Grands_Avaux_-_Essonne_-_Septembre_2020_02.jpg) | GrandCelinien | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) |
| grès clair taché de lichen, marches en rondins | [Forêt départementale des Grands Avaux - Essonne - Septembre 2020 05.jpg](https://commons.wikimedia.org/wiki/File:Forêt_départementale_des_Grands_Avaux_-_Essonne_-_Septembre_2020_05.jpg) | GrandCelinien | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) |
| platière : dalle à fleur de sol, mare, herbes | [Butte greseuse télégraphe.jpg](https://commons.wikimedia.org/wiki/File:Butte_greseuse_télégraphe.jpg) | Théo Vansteenkeste | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) |
| écartée : « Trois Pignons » : une maison à Provins | [Maison Trois Pignons Provins 3.jpg](https://commons.wikimedia.org/wiki/File:Maison_Trois_Pignons_Provins_3.jpg) | Chabe01 | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) |
| contre-jour bas entre les feuillus, sable nu | [Nainville-les-roches - escalade bloc.jpg](https://commons.wikimedia.org/wiki/File:Nainville-les-roches_-_escalade_bloc.jpg) | Altivagus | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) |
| pins espacés, haut du tronc orangé | [Fontainebleau forest.jpeg](https://commons.wikimedia.org/wiki/File:Fontainebleau_forest.jpeg) | Andy Cassrol | [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/) |
| écartée : un tableau de 1872 | [Narcisse-virgile diaz de la peña, la foresta di fontainebleau in autunno, 1872.jpg](https://commons.wikimedia.org/wiki/File:Narcisse-virgile_diaz_de_la_peña,_la_foresta_di_fontainebleau_in_autunno,_1872.jpg) | Sailko (photo d'un tableau de Diaz de la Peña, 1872) | [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) |
| futaie de pins, sol d'aiguilles, un bouleau | [Forest of Trois Pignons - 01.jpg](https://commons.wikimedia.org/wiki/File:Forest_of_Trois_Pignons_-_01.jpg) | DarDarCH | [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) |
| bouleau jaune, lointain bleu de brume | [Foret Fontainebleau automne 01.jpg](https://commons.wikimedia.org/wiki/File:Foret_Fontainebleau_automne_01.jpg) | Patrick Giraud (téléversé par Calips sur fr.wikipedia) | [CC BY-SA 1.0](https://creativecommons.org/licenses/by-sa/1.0/) |

Toutes : recadrées et réduites. Ce que les photos contredisent ou ajoutent : le sentier des Grands Avaux est souvent de terre brune, pas de sable (la fiche garde le sable) ; le sol est couvert de bogues de châtaignes ; la platière est une dalle plate avec une mare ; le haut orangé des pins n'est pas rendu ; les photos des Grands Avaux sont de septembre (feuillage vert), l'automne vient de Fontainebleau. Une nouvelle préparation qui veut des photos refait la recherche et note un nouveau fichier `ouvertures/photos/<lieu>.json` au même format (`tests/ouverture.test.mjs` vérifie auteur, licence libre reconnue, page source, adaptation, et le poids : 9 Ko par vignette, 100 Ko en tout).

## Réglages

| Réglage | Par défaut | Où |
|---|---|---|
| Démarrer sur l'ouverture | **oui** dans la page ouverte par une personne ; non dans les outils de capture (`window.__CFG`) | `CFG.demo`, `#demo`, ou `localStorage["bodycam-demo"]="0"` pour l'éteindre ; « Passer » la saute ; « Plus » → « Démo » la relance |
| Mention « Rejeu accéléré d'une génération enregistrée le … » | **éteinte** | « Plus » → « Mention rejeu » (mémorisé dans `bodycam-demo-mention`), ou `CFG.demoMention` |

La mention est éteinte par défaut à la demande de l'auteur (première démo, cercle proche). **Devant tout autre public, rallumez-la** : sans elle, rien à l'écran ne dit que la préparation montrée est un enregistrement et non un calcul en direct. Le contenu, lui, reste toujours celui de la séance réelle.

## Correspondance demande → rejeu

`correspond()` : au moins un mot requis (`motsRequis` : le lieu, ou « forêt »/« bois ») et deux mots du journal en tout, et aucun mot exclu (`motsExclus` : nuit, hiver, plage, ville…, ce qui n'a pas été préparé). « Champcueil la nuit » part donc dans la vraie chaîne. La suggestion cliquable s'écrit dans le champ comme tapée ; on l'envoie soi-même.

Le rejeu de Champcueil débouche sur `scenes/09-champcueil-aube.json` (`fiche`), à défaut sur `scenes/01-grands-avaux.json` (`ficheSecours`).

## Arrivée dans un lieu

Hors histoire, le personnage ne part plus se promener en arrivant : il regarde autour de lui sur place (actions `tourner`, `regarder`, aucun pas) et pense une phrase choisie par la graine (« Qu'est-ce que je fous là ? »…), lue par `window.voix` si elle existe. Il ne flâne que si on le lui dit (« promène-toi », « fais ta vie »). Les outils de capture (`window.__CFG`) gardent l'ancien comportement, sauf option `arrivee`.

## Vérifier

```bash
npm test                                  # dont tests/ouverture.test.mjs : correspondance, programme 15-25 s (sans photos), photos (licences, poids, rafales), valeurs de la fiche, tenue du journal
npm run build
node tools/ouverture.mjs                  # téléphone 390 × 780 puis ordinateur 1280 × 800 ; --mention pour la variante avec mention
```

Captures dans `out/ouverture/` : question, suggestion tapée, rafale de vignettes, observations, épinglage près des constats, milieu du rejeu, traduction, fondu, monde, arrivée 15 s après (position inchangée, phrase affichée).

## Ajouter un rejeu

Faire réellement la préparation (recherche, fiche), en noter le journal dans `ouvertures/<lieu>.json` au même format, avec la date (`enregistre`). Ne jamais compléter un journal avec des étapes non faites.
