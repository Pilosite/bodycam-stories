# Ouverture de démo

Pour présenter le concept sans attendre cinq minutes de génération : la page s'ouvre sur « Quel monde veux-tu filmer ? ». Une demande qui correspond à une préparation enregistrée est **rejouée en accéléré** (15 à 25 s) pendant que le moteur compile et rend le lieu derrière ; on fond ensuite sur le monde. Une autre demande part dans la vraie chaîne du constructeur (`atelier.js`), en temps réel.

## Ce qui est rejoué, et ce qui ne l'est pas

- Le rejeu ne montre **que** ce qui a été réellement fait : `ouvertures/*.json` est le journal d'une vraie séance de recherche (requêtes tapées, pages lues, pages illisibles ou refusées, constats tirés, chacun relié au réglage qu'il justifie). On n'y ajoute rien d'inventé ; une nouvelle préparation donne un nouveau journal.
- Sources : titre et domaine seulement. Aucun texte recopié, aucune image importée (règle 4).
- La traduction en vocabulaire et le contrôle sont **calculés dans la page** sur la fiche embarquée (`traduction()` de `src/ouverture.js`, `controler()` du constructeur) : les valeurs affichées sont celles qui sont rendues.
- Seules les durées sont raccourcies. Elles sont un peu irrégulières (±40 % autour des durées du journal), les lignes arrivent au fil de l'eau, sans barre de progression.
- Le fondu attend une vraie image du moteur (`attendreImage`) : si le GPU est lent, la ligne « Le monde se construit » reste le temps qu'il faut.

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
npm test                                  # dont tests/ouverture.test.mjs : correspondance, programme 15-25 s, valeurs de la fiche, tenue du journal
npm run build
node tools/ouverture.mjs                  # téléphone 390 × 780 puis ordinateur 1280 × 800 ; --mention pour la variante avec mention
```

Captures dans `out/ouverture/` : question, suggestion tapée, milieu du rejeu, traduction, fondu, monde, arrivée 15 s après (position inchangée, phrase affichée).

## Ajouter un rejeu

Faire réellement la préparation (recherche, fiche), en noter le journal dans `ouvertures/<lieu>.json` au même format, avec la date (`enregistre`). Ne jamais compléter un journal avec des étapes non faites.
