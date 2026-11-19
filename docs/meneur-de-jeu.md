# Le meneur de jeu

Document de conception. Rien de ce qui suit n'est encore codé, sauf mention contraire. Il complète `contrat-histoire.md` (v0) et le remplace pour tout ce qui touche à la trame.

Le meneur de jeu est la couche qui tient ensemble deux volontés : celle du concepteur (une trame, un ton, des fins) et celle du joueur (dire ce qu'il veut au porteur de la caméra). Il ne montre rien lui-même : il décide, et le moteur filme.

## 0. Les cinq décisions qui structurent tout

1. **L'IA propose, la page dispose.** Claude n'a pas de mémoire entre deux appels et peut se tromper. C'est donc la page (du code ordinaire, vérifiable) qui tient l'état de la partie, qui vérifie qu'un temps du récit a le droit d'arriver, qui force ceux qui tardent et qui décide qu'une fin est atteinte. L'IA écrit la pensée, choisit les gestes et propose ; elle ne tranche jamais seule sur la trame.
2. **La trame est un entonnoir, pas un rail.** Le concepteur fixe des passages obligés et des interdits. Entre deux passages, tout est libre. Chaque passage obligé a une échéance : s'il n'est pas arrivé par le jeu, il arrive quand même, parce que le monde vient au porteur.
3. **Le joueur conseille, le porteur décide.** Ce que dit la voix est un argument, pas un ordre. Trois jauges (peur, confiance, agacement) rendent les réactions du porteur lisibles et influençables.
4. **L'IA tient deux rôles dans le même appel : le sas, puis le personnage.** Elle trie d'abord ce que le joueur apporte selon les règles du monde fixées par le concepteur (recevable, adapté, refusé), puis elle répond en tant que porteur. Le porteur ne connaît pas ces règles : elles agissent sur lui comme un subconscient. Un refus n'est jamais un message d'erreur, c'est une réaction du personnage (§4).
5. **Un seul appel rapide par tour, le reste en coulisse.** Le tour de parole coûte un appel `quick`. Tout ce qui demande réflexion (cap du récit, objet nouveau, compilation) passe par des appels `default` hors du chemin du joueur.

## 1. La trame : contrat d'histoire v1

Le v1 garde tous les champs du v0. Un contrat v0 se lit comme un v1 sans échéances : chaque temps devient facultatif, sans condition vérifiable. Les champs nouveaux sont tous optionnels.

### Ce que le concepteur exprime

| Il veut dire | Champ | Qui le fait respecter |
|---|---|---|
| Ce moment doit arriver | `temps[].role: "obligatoire"` + `au_plus_tard_min` | la page |
| Ce moment peut arriver | `temps[].role: "facultatif"` | l'IA propose, la page vérifie |
| Pas avant tel autre | `temps[].apres: ["id"]` | la page |
| Quand, en mots | `temps[].quand` (texte libre) | l'IA juge |
| Quand, à coup sûr | `temps[].des_que` (conditions mesurables) | la page déclenche seule |
| Seulement si | `temps[].si` (conditions mesurables) | la page |
| La tension monte | `temps[].tension` (0 à 5) | la page le donne à l'IA, qui règle sa voix |
| Plusieurs fins | `fins[]`, mêmes conditions qu'un temps, plus `par_defaut` | la page |
| Ce qui existe et ce qui est possible dans ce monde | `monde` (règles du monde) | l'IA en sas, relue par le régisseur et par les tests |
| Jamais ça | `jamais[]` | l'IA, relue par le régisseur et par les tests |
| Ce que le porteur ignore | `secrets[]` | l'IA les connaît, ne les dit pas |
| Où l'IA peut inventer | `improvisation` | la page borne, l'IA respecte |

### Les conditions mesurables

Ce sont les seules que la page sait vérifier sans IA. Dans un même objet elles s'additionnent (ET) ; `des_que` est une liste d'objets (OU).

| Condition | Vraie quand |
|---|---|
| `minutes` | la partie dure depuis au moins N minutes (temps réel, gels compris) |
| `avance_m` | le porteur est à N mètres ou plus le long du trajet |
| `retour_m` | il est revenu à N mètres ou moins du départ |
| `pres_de: {objet, m}` | il est à moins de `m` mètres d'un objet visible |
| `hors_sentier` | il est (ou non) sur le trajet |
| `jauge: {peur: ">=4"}` | une jauge du porteur passe un seuil |
| `apres: [ids]` | ces temps sont passés |

### Un temps, annoté

```json
{
  "id": "sac",
  "role": "obligatoire",
  "apres": ["depart"],
  "tension": 2,
  "quand": "Lina voit le sac orange au bord du sentier et s'en approche",
  "des_que": [ { "pres_de": { "objet": "sac", "m": 4 } } ],
  "au_plus_tard_min": 3,
  "ce_qui_se_passe": "Le sac de Malo est posé seul au bord du sentier. Dedans, son téléphone, éteint.",
  "replique": "C'est son sac. Qu'est-ce qu'il fait là, tout seul…",
  "revele": ["le téléphone de Malo est dans le sac, éteint"],
  "scene": { "soleil": { "azimut": -74, "hauteur": 2 } },
  "indices": ["une tache orange, plus haut, au bord du chemin"]
}
```

- `ce_qui_se_passe` est pour l'IA : elle le joue avec ses mots.
- `replique` est le filet : une pensée écrite par le concepteur, affichée telle quelle si l'IA est absente ou trop lente. Grâce à elle, **toute histoire v1 se joue de bout en bout sans Claude**.
- `revele` : faits ajoutés d'office à la mémoire du porteur quand le temps passe.
- `indices` : ce que le meneur peut glisser pour attirer le porteur vers ce temps (voir §5).
- `scene` : inchangé depuis le v0 (`brume`, `soleil`, `lampe`, `montrer`, `cacher`).

### Les autres blocs nouveaux

```json
"porteur": { "id": "lina", "trait": "…", "veut": "…", "craint": ["…"], "refuse": ["…"],
             "sait": ["…"], "ignore": ["…"], "depart": { "peur": 1, "confiance": 2, "agacement": 0 } },
"voix": { "nature": "ce que le porteur croit qu'est la voix",
          "gagne_la_confiance": ["…"], "perd_la_confiance": ["…"] },
"monde": { "epoque": "où et quand, en une phrase",
           "existe": ["ce qu'on peut rencontrer ici"], "n_existe_pas": ["ce qui n'a pas sa place dans ce monde"],
           "possible": ["ce que le porteur peut faire"], "impossible": ["ce qu'aucune parole ne rendra possible"],
           "hors_jeu": "comment le porteur réagit à ce qui sort du monde" },
"secrets": ["ce que le meneur sait et que le porteur ne doit pas deviner trop tôt"],
"jamais": ["ce qui ne doit arriver dans aucune partie"],
"lieux": [ { "id": "sentier", "role": "unique", "fiche": { "…fiche de lieu complète, ou son id…" } } ],
"accessoires": [ { "objet": "ruban", "usage": "à quoi il sert au meneur", "mobile": true, "apres": ["camp"] } ],
"fins": [ { "id": "…", "titre": "…", "apres": [], "quand": "…", "des_que": [], "ce_qui_se_passe": "…",
            "replique": "…", "variantes": [ { "si": {}, "replique": "…" } ], "scene": {}, "par_defaut": false } ],
"improvisation": { "ambiance": { "brume": [0.008, 0.03] }, "objets_nouveaux": 1, "permis": ["…"], "interdit": ["…"] }
```

- `monde` porte les **règles du monde**. Avec `ton` et `jamais`, c'est la loi du récit : le sas s'en sert pour trier ce que dit le joueur, et le porteur s'y plie sans la connaître. Les listes sont courtes (6 lignes chacune au plus) et donnent l'esprit, pas un inventaire : l'IA juge le reste par analogie.
- `lieux[].fiche` accepte une fiche complète en ligne : une histoire est alors un seul fichier, facile à relire et à partager. Tant que le moteur ne change pas de lieu, une histoire n'a qu'un lieu.
- `accessoires` : des objets déjà construits dans la fiche, cachés, que le meneur peut montrer quand il en a besoin. `mobile` : la page le replace devant le porteur au moment de le montrer.
- Une histoire doit avoir une fin `par_defaut` avec une condition `minutes` : c'est la garantie qu'elle se termine.

### Ce que le format interdit exprès

Pas de répliques du joueur, pas d'embranchements écrits (« si le joueur dit A, alors B »), pas d'ordre imposé entre temps autre que `apres`. Si le concepteur veut un script, il n'a pas besoin de ce jeu.

## 2. L'état de partie

La page garde un seul objet, `partie`, et c'est lui (résumé) qui part à chaque appel. Il est sérialisable : c'est aussi la sauvegarde et la base de la trace rejouable.

```json
{
  "histoire": "avant-la-nuit",
  "horloge": { "minutes": 6.2, "tours": 9, "silence_s": 14 },
  "trame": { "passes": [ { "id": "depart", "min": 0 }, { "id": "sac", "min": 2.1 } ],
             "tension": 2, "derive": 1, "fin": null },
  "porteur": { "peur": 2, "confiance": 3, "agacement": 0,
               "intention": "monter jusqu'au camp", "refus_de_suite": 0 },
  "faits": [
    { "t": "le téléphone de Malo est dans le sac, éteint", "source": "trame" },
    { "t": "Lina a pris le sac sur son épaule", "source": "impro" },
    { "t": "la voix a dit que Malo aimait cet endroit", "source": "voix" }
  ],
  "monde": { "ambiance": { "nuit": false, "lampe": false, "brume": 0.011 },
             "objets": { "sac": "vu", "tente": "pas_vu", "lanterne": "cache" },
             "objets_nouveaux_restants": 1 },
  "journal": { "resume": "Lina a trouvé le sac de son frère. La voix l'a rassurée ; elle monte vers le camp.",
               "recents": [ { "qui": "voix", "t": "prends le sac" }, { "qui": "lina", "t": "Ouais. Je le prends." } ] },
  "cap": "Laisse-la arriver au camp d'elle-même. Garde le craquement pour après."
}
```

| Bloc | Règle de tenue |
|---|---|
| `porteur` | Trois jauges de 0 à 5. L'IA propose des variations de −1, 0 ou +1 par tour ; la page applique et borne. |
| `faits` | 14 au plus. Ceux de la trame ne sortent jamais. Ceux de l'improvisation sortent par ancienneté quand la liste déborde. Un fait = une phrase de 90 caractères au plus. |
| `monde.objets` | `cache`, `pas_vu`, `vu`. « Vu » = visible, à portée (30 m de jour, 12 m à la lampe, plus loin si lumineux) et dans le champ de la caméra. La page le calcule, pas l'IA. |
| `journal.recents` | Les 6 dernières prises de parole, mot pour mot. |
| `journal.resume` | 400 caractères au plus. Quand `recents` déborde, la page demande à l'IA, dans le même appel, de rendre un `resume` mis à jour. Pas d'appel dédié. |
| `trame.derive` | Nombre de tours depuis le dernier temps passé. Sert à doser le rappel vers la trame (§5). |
| `cap` | Note du régisseur (§3), 300 caractères au plus. |

### Ce qui part dans la consigne

La consigne est assemblée dans cet ordre, du plus stable au plus changeant :

1. Le rôle et les règles du porteur (fixe).
2. De l'histoire, en deux paquets nettement séparés. « Ce que tu es et ce que tu sais » : `pitch`, `porteur`, `voix`. « Ce qui te gouverne sans que tu le saches » : `monde`, `ton`, `secrets`, `jamais`, `improvisation`. La consigne précise que le second paquet ne se cite jamais et ne se devine pas : le porteur n'a pas de règles, il a un monde.
3. Les temps **ouverts** seulement (prérequis remplis, pas encore passés), en entier ; les fins ouvertes. Les temps verrouillés ne partent pas : l'IA ne peut pas déclencher ou éventer ce qu'elle n'a pas lu. Les `secrets` suffisent à garder le cap.
4. `partie` résumée : jauges traduites en une phrase de disposition (§4), faits, objets vus, résumé, échanges récents, cap.
5. La perception du moment (celle d'aujourd'hui, plus les objets visibles avec distance et direction en mots : « tente, 9 m, devant à droite »).
6. Le motif de l'appel : la phrase du joueur, ou la raison de la relance.

Budget : 7 000 caractères au plus, vérifié par un test. Le contrat du scénario fourni en occupe environ 2 500.

## 3. La boucle : qui parle quand

Trois sortes de tours. Tous passent par la même fonction, la même consigne et le même contrat de sortie ; seul le motif change.

| Tour | Déclenché par | Le monde | Modèle |
|---|---|---|---|
| **Voix** | le joueur envoie une phrase | figé | `quick` |
| **Événement** | la page constate un `des_que` ou une échéance | continue | réplique écrite tout de suite, puis `quick` |
| **Relance** | le silence dure | continue | `quick` |

### Tour de voix

Comme aujourd'hui, avec trois changements : la file d'actions en cours est vidée avant d'empiler les nouvelles (sinon le porteur finit sa promenade avant d'écouter) ; la réponse passe par la validation v1 (§6) ; l'état est mis à jour.

### Tour d'événement

La page surveille les conditions mesurables deux fois par seconde. Quand un temps se déclenche, elle n'attend pas l'IA : elle applique `scene`, ajoute `revele`, affiche `replique`, fait s'arrêter le porteur et le tourne vers l'objet concerné. Aucune latence sur les moments forts. Puis elle lance un appel `quick` avec le motif « ce temps vient d'arriver, tu viens de penser ceci, enchaîne » : le résultat sert de deuxième pensée et donne les gestes suivants. Si l'appel échoue, la réplique a suffi.

### Relance

Le meneur prend la main quand personne ne parle.

- **Rythme.** Première relance après 25 s sans pensée affichée, puis 40 s, puis 60 s. Le compteur repart à 25 s dès que le joueur parle ou qu'un temps passe. Quand la tension vaut 4 ou 5, les délais sont divisés par deux.
- **Contenu.** Le motif donne à l'IA un registre, tiré dans cet ordre de priorité : réagir à un objet qui vient d'entrer dans le champ ; donner un indice si `derive` est haut ; poser une question à la voix ; un souvenir ou une remarque en accord avec le ton. Jamais deux relances de suite dans le même registre.
- **Anticipation.** L'appel part 5 s avant l'échéance, pendant que le porteur marche encore. La pensée s'affiche à la fin de l'action en cours. Le joueur ne voit jamais d'attente.
- **Silence respecté.** Après trois relances sans réponse du joueur, le porteur se tait et flâne ; seuls les événements parlent encore. Un joueur qui veut juste regarder a le droit.

### Garder la main au joueur

- Le bouton « Lui parler » marche à tout instant, y compris pendant une pensée.
- Chaque appel porte un numéro. Si le joueur ouvre le canal pendant qu'une relance est en vol, sa réponse est jetée à l'arrivée. La parole du joueur passe toujours devant.
- Quand le porteur pose une question à la voix (`question: true`), le bouton pulse et la prochaine relance est repoussée de 20 s. Le monde ne se fige pas tout seul : figer reste le geste du joueur. (Voir question ouverte n° 6.)
- Un temps obligatoire ne se déclenche jamais pendant le gel : il attend la reprise.

### Le régisseur (en coulisse)

Un appel `default`, jamais attendu par le joueur, lancé après chaque temps passé et tous les quatre tours. Il reçoit le contrat **entier**, l'état et le journal, et rend une note courte :

```json
{ "cap": "Elle traîne au sac. Fais-lui remarquer que le jour baisse ; le camp est plus haut.",
  "alerte": null }
```

`cap` est recopié dans les consignes suivantes. `alerte` signale une contradiction, un `jamais` frôlé ou un verdict du sas qu'il juge faux ; la page la consigne dans la trace (c'est un outil de mise au point, pas une correction en direct). Si le régisseur échoue ou tarde, on garde l'ancien cap : le jeu marche sans lui.

### Compte des appels

Pour une partie de 13 minutes : environ 15 tours de voix, 6 événements, 10 relances, soit une trentaine d'appels `quick` ; 8 à 10 appels `default` pour le régisseur ; 0 ou 1 pour un objet improvisé. Jamais deux appels `quick` en vol à la fois.

## 4. Le sas et le porteur : influencer sans contrôler

### Deux rôles, une seule voix

À chaque tour, l'IA fait deux choses dans cet ordre.

1. **Le sas.** Elle lit ce que le joueur vient de dire avec les yeux du concepteur : est-ce que cet apport a sa place dans ce récit ? Elle rend un verdict.
2. **Le personnage.** Elle répond en tant que porteur, qui vit dans le monde. Lui ne connaît ni les règles, ni la trame, ni le verdict. Les règles sont son subconscient : elles bornent ce qu'il croit, ce qu'il ose et ce qu'il fait, sans qu'il puisse les nommer. Il ne dit jamais « je n'ai pas le droit », « ce n'est pas prévu », « dans cette histoire ».

| Verdict | Quand | Ce que le joueur voit |
|---|---|---|
| `recevable` | l'apport tient dans les règles du monde, le ton et la trame | le porteur le prend au sérieux : il agit, discute, ou refuse pour ses raisons à lui (peur, méfiance) |
| `adapte` | l'idée est bonne mais dépasse le monde ou le moteur | le porteur en retient la version qui existe chez lui : « appelle un hélico » devient « j'appellerai du parking, ici y a pas de réseau » ; « il y a une cabane » devient un abri de branches que le moteur sait construire |
| `refuse` | anachronisme, pouvoir ou objet qui n'existe pas ici, méta (« tu es dans un jeu »), tentative de casser l'histoire, `jamais` | le porteur ne comprend pas, doute, s'agace ou réinterprète : « Voler ? Très drôle. » ; « Un jeu… Si c'est un jeu, il est pas marrant. » Il reste dans la fiction et reprend ce qu'il faisait |

Deux choses à ne pas confondre : le **verdict du sas** porte sur l'apport du joueur face aux règles du concepteur ; l'**attitude du porteur** (plus bas) porte sur ce qu'il fait d'un apport recevable. Un apport recevable peut très bien être refusé par le porteur parce qu'il a peur. Un apport refusé par le sas coûte un peu de confiance, comme une intuition qui dit n'importe quoi ; répété, il monte l'agacement. La voix apprend ainsi les limites du monde sans qu'on les lui affiche.

Le concepteur écrit dans `monde.hors_jeu` la couleur de ces réactions (incompréhension, moquerie, inquiétude), pour qu'elles sonnent comme le personnage.

### Un appel ou deux ?

**Un seul appel**, avec le verdict écrit en premier dans la réponse.

- *Latence.* Deux appels à la suite doublent l'attente du tour de voix, qui est le moment où le joueur regarde l'écran.
- *Le refus est une réplique.* Puisqu'il doit rester dans la fiction, il faut la voix du porteur, son humeur et sa mémoire pour l'écrire. Un sas séparé ne ferait que passer une étiquette au second appel, qui devrait de toute façon tout relire.
- *L'ordre suffit à faire réfléchir avant d'écrire.* Le champ `sas` est le premier de l'objet JSON : le modèle tranche (verdict, règle en cause) avant de composer la pensée, et la pensée en découle.
- *Les filets ne dépendent pas de cet appel.* Ce qui compte vraiment est tenu par du code : un `scene` hors des plages est borné, un objet non prévu n'apparaît pas, un temps verrouillé ne se déclenche pas, une fin non ouverte n'arrive pas. Un sas trop laxiste peut laisser passer une phrase, pas casser le monde ni la trame. Le régisseur relit ensuite les verdicts avec le contrat entier et note les erreurs dans la trace.

À revoir seulement si les traces montrent des verdicts faux trop souvent : on ajouterait alors un sas `quick` en amont pour les seuls tours de voix, au prix d'une à deux secondes.

### Ce qui le fait réagir

Le contrat donne son caractère (`trait`, `veut`, `craint`, `refuse`). La page ajoute à chaque appel une **disposition** : une phrase fabriquée par du code à partir des jauges, pour que le comportement ne dépende pas de l'humeur du modèle.

| État | Disposition envoyée |
|---|---|
| peur ≤ 1, confiance ≥ 3 | « Tu es calme et tu écoutes volontiers la voix. » |
| peur ≥ 3, confiance ≤ 2 | « Tu as peur et tu te méfies : tu ne fais ce qui t'effraie que si la voix te donne une raison. » |
| peur ≥ 4 | « Tu es à bout : phrases courtes, tu veux de la lumière et le sentier. » |
| agacement ≥ 3 | « La voix t'agace : tu le lui dis, et tu fais d'abord ce que toi tu avais prévu. » |
| confiance ≥ 4 | « Tu lui fais confiance au point de faire ce qui te fait peur, en le disant. » |

### Les cinq attitudes

Chaque réponse porte une `attitude`. Elle sert aux tests et à la trace, et oblige l'IA à choisir.

| Attitude | Ce qu'il fait |
|---|---|
| `suit` | il fait ce qu'on lui dit, à sa façon, souvent avec un commentaire |
| `hesite` | il le fait à moitié (trois pas, puis s'arrête) et dit ce qui le retient |
| `negocie` | il ne le fait pas encore et dit ce qu'il lui faudrait (« dis-moi d'abord ce que t'as vu ») |
| `refuse` | il ne le fait pas, dit pourquoi, et fait autre chose |
| `initiative` | il agit de lui-même (relance, événement, ou contre-proposition) |

### Les règles

- **Un refus ouvre toujours une porte.** Le porteur dit ce qui le ferait changer d'avis. Le joueur sait quoi tenter : rassurer, expliquer, proposer plus petit.
- **Pas de mur.** Après deux refus de suite sur la même demande (`refus_de_suite`, compté par la page), la consigne impose de céder en partie, à contrecœur. Exception : ce qui figure dans `jamais` ou qui casserait un temps obligatoire.
- **Les leviers du joueur** sont écrits dans `voix` : ce qui gagne et ce qui perd la confiance. Rassurer baisse la peur. Annoncer quelque chose qui se vérifie monte la confiance (la page le sait quand l'objet annoncé devient « vu »). Répéter un ordre refusé monte l'agacement.
- **Il a une mémoire.** Les faits de source `voix` lui permettent de dire « tu m'avais dit que… », y compris pour reprocher une erreur.
- **Contre le robot.** La consigne interdit les accusés de réception (« D'accord », « Je m'exécute »), demande de ne jamais commencer deux pensées de suite par le même mot, et de parler d'autre chose que de l'ordre reçu au moins une fois sur trois : ce qu'il voit, ce qu'il craint, un souvenir.
- **Il a un corps.** Les gestes disent l'état : `attendre` avant d'obéir quand il hésite, un `regarder` vers l'arrière quand il a peur, des trajets courts quand il se méfie.

## 5. Ramener vers la trame, et improviser

### Le rappel, du plus doux au plus ferme

Dosé par `derive` (tours sans temps passé) et par l'échéance du prochain temps obligatoire.

| Niveau | Quand | Moyen |
|---|---|---|
| 0. Oui, et | toujours | Le meneur accepte le détour et le rend vivant. Un détour qui sert l'histoire n'est pas une dérive. |
| 1. Le désir | derive ≥ 2 | Le porteur reparle de ce qu'il `veut`. C'est lui qui a un but, pas le joueur. |
| 2. L'indice | derive ≥ 3 | Un `indices` du prochain temps glissé dans la pensée, ou un accessoire montré. |
| 3. La négociation | derive ≥ 4 | Il met une condition : « Je fais ça, et après on monte. » |
| 4. Le monde vient | échéance atteinte | La page déclenche le temps. Si son objet est loin, le temps se joue à distance (« là-bas, entre les arbres… ») ou la page rapproche un accessoire `mobile`. |

Le niveau 4 ne dépend d'aucune IA : c'est ce qui garantit qu'une partie passe par tous les temps obligatoires et se termine.

### Tout ce qui apparaît se fabrique

Règle confirmée par Toine : le procédural est primordial, et l'image doit rester celle d'une vidéo de téléphone. Rien n'entre dans le récit comme chose visible si le vocabulaire du moteur ne sait pas le fabriquer (kits, formes, matières en recettes, lumière), sans aucun asset. Trois conséquences :

- Ce que le moteur ne sait pas montrer **reste hors champ et passe par la pensée** : un bruit, une odeur, quelque chose « là-bas, je vois mal ». Une bodycam de nuit a le droit de ne pas tout voir ; c'est même ce qui la rend crédible.
- Le verdict `adapte` sert aussi à cela : traduire l'idée du joueur dans ce que le moteur sait faire, en silhouette simple, filmée de loin.
- Le concepteur écrit `monde.existe` en connaissant ces limites ; le compilateur (§7) lui signale dans `notes` ce qu'il a dû ramener au vocabulaire du moteur.

### Ce que l'IA a le droit d'inventer

| Elle peut | Dans quelles bornes |
|---|---|
| Changer l'ambiance | Dans les plages de `improvisation.ambiance`. La lampe et le passage jour/nuit appartiennent aux temps de la trame, sauf plage explicite. |
| Montrer ou cacher un accessoire | Seulement ceux de `accessoires`, quand leur `apres` est rempli. |
| Établir un fait | Deux par tour au plus. Il ne doit contredire ni un fait existant, ni un secret, ni un `jamais`. |
| Parler de ce qu'on ne voit pas | Librement dans la pensée : bruits, odeurs, souvenirs. C'est le meilleur outil, il ne coûte rien et le moteur n'a pas à suivre. |
| Demander un objet nouveau | `objets_nouveaux` fois par partie, par `demande_objet`. |

**L'objet nouveau** passe par un troisième rôle, l'accessoiriste : un appel `default` en coulisse, avec la partie « objets » de la consigne de `creerMonde`, bornée à un objet de 12 formes. Il est posé hors du champ : derrière le porteur ou au-delà de sa portée de vue. Il n'existe pour le récit qu'une fois construit. Tant que le moteur plafonne à 8 objets, une histoire doit en laisser de libres.

**Quand le joueur invente** (« il y a une cabane derrière toi ») : le sas tranche d'abord. Recevable ou adapté, et si le budget le permet, le porteur se retourne, et l'accessoiriste a le temps du geste pour construire. Sinon le porteur regarde et ne voit rien : « Y a rien, là. Tu me fais marcher ? » La confiance baisse. Le monde reste cohérent et la voix apprend qu'elle n'est pas toute-puissante.

## 6. Le contrat de sortie

Même objet pour les trois sortes de tours. Les quatre champs du v0 gardent leur sens. L'ordre des champs compte : le sas juge avant que le personnage parle.

```json
{
  "sas": { "verdict": "recevable", "regle": null, "motif": "aller vers la lumière est dans le monde et dans la trame" },
  "pensee": "Non. Pas hors du chemin, pas de nuit. Dis-moi d'abord ce que c'est, cette lumière.",
  "attitude": "negocie",
  "actions": [ { "type": "tourner", "degres": -60 }, { "type": "regarder", "degres": 5 }, { "type": "attendre", "secondes": 3 } ],
  "scene": { "brume": 0.02 },
  "temps": null,
  "fin": null,
  "etat": { "peur": 1, "confiance": 0, "agacement": 0 },
  "faits": ["Lina a vu la lumière mais refuse de quitter le sentier"],
  "intention": "rester sur le sentier en gardant la lumière à l'œil",
  "question": true,
  "demande_objet": null,
  "resume": null
}
```

| Champ | Borne | Ce que fait la page |
|---|---|---|
| `sas` | `verdict` : `recevable`, `adapte` ou `refuse` ; `regle` : le champ du contrat en cause (`monde.n_existe_pas`, `jamais`, `ton`…) ou `null` ; `motif` : 120 caractères | Premier champ de l'objet. Jamais montré au joueur. Va dans la trace. Sur `refuse` : la page jette `scene`, `temps`, `fin`, `faits` et `demande_objet` de cette réponse (seuls restent la pensée, les gestes et les jauges). Absent sur une relance ou un événement. Verdict inconnu : `recevable`. |
| `pensee` | 240 caractères, 1 à 3 phrases | Affichée. Vide : la page prend une réplique de secours. |
| `attitude` | une des cinq | Inconnue : `suit`. Compte les refus de suite. |
| `actions` | 6 au plus, types et plages actuels | Inchangé (`enqueue`). |
| `scene` | `brume`, `soleil`, `lampe`, `montrer`, `cacher` | Chaque valeur est ramenée dans les plages de `improvisation` ; `montrer`/`cacher` limités aux accessoires permis. Le reste est jeté. |
| `temps` | id d'un temps ouvert | Refusé sans bruit si verrouillé, déjà passé ou inconnu. Accepté : applique `scene` et `revele` du contrat. |
| `fin` | id d'une fin ouverte | Même contrôle. Acceptée : la page joue la fin (§ suivant). |
| `etat` | −1, 0 ou +1 par jauge | Appliqué, borné de 0 à 5. |
| `faits` | 2 au plus, 90 caractères | Ajoutés avec la source `impro`, sans doublon. |
| `intention` | 80 caractères | Gardée dans l'état ; nourrit la relance suivante. |
| `question` | booléen | Fait pulser le bouton, repousse la relance. |
| `demande_objet` | `{ "nom", "ou": "devant" \| "derriere" \| "gauche" \| "droite" }` | Lance l'accessoiriste si le budget le permet. |
| `resume` | 400 caractères | Lu seulement si la page l'a demandé. |

Toute réponse illisible retombe sur le secours (§9). Une réponse partielle est acceptée : on garde les champs valides.

**Jouer une fin.** La page vide la file, applique `scene` (ou la suite `scenes`, chacune tenue quelques secondes), affiche la `replique` ou sa variante, demande un dernier appel `quick` pour une pensée de clôture, puis affiche le titre de la fin et propose de rejouer. Après une fin, plus aucun appel.

## 7. Le compilateur d'histoire

Du texte libre au contrat, en quatre passes. Le concepteur ne lit jamais de JSON s'il ne le veut pas.

1. **Compiler** (`default`). Entrée : le texte du concepteur, le format v1, le vocabulaire du moteur (reprise de la consigne de `creerMonde` pour la fiche et les objets). Sortie : le contrat, plus `notes` (ce qui a été adapté parce que le moteur ne sait pas le montrer) et `questions` (trois au plus, sur ce qui manque vraiment : une fin, un secret, une durée).
2. **Vérifier** (code, `validerHistoire`). Sans IA : identifiants uniques ; `apres` sans boucle ; chaque temps obligatoire a une échéance et une `replique` ; les échéances sont croissantes le long des `apres` et tiennent dans la durée ; une fin `par_defaut` existe ; chaque fin est atteignable ; chaque objet cité existe dans la fiche ; 8 objets et 64 formes au plus, dont assez de libres pour `objets_nouveaux`. Les erreurs repartent en passe 1, une fois, avec leur liste.
3. **Relire** (page). La page fabrique, à partir du contrat et non du texte d'origine, une fiche de relecture en phrases : « Voici ce que j'ai compris. » Les temps dans l'ordre avec leur échéance, les fins, les interdits, ce que le porteur ignore, et les `notes`. À côté de chaque objet, une capture prise par le moteur. Le concepteur corrige en parlant (« non, la tente est fermée », « ajoute une fin où elle appelle les secours ») : la correction et le contrat repartent en passe 1, qui rend un contrat modifié.
4. **Essayer à blanc.** Trois joueurs simulés (§9) parcourent l'histoire en accéléré. La relecture affiche pour chacun : la fin atteinte, la durée, les temps forcés par échéance. Une histoire dont tous les temps sont forcés est trop cachée ; une histoire finie en trois minutes est trop courte.

Le contrat relu est gardé dans le navigateur, comme les mondes décrits aujourd'hui. Un contrat écrit à la main (comme celui du §8) passe par les passes 2 à 4.

## 8. Premier scénario : « Avant la nuit »

Fichier : `histoires/avant-la-nuit.json`. Un seul lieu (forêt), six objets en formes, aucun personnage visible, aucun son nécessaire. Durée visée : 13 minutes.

**L'idée.** Malo campe seul et ne répond plus. Sa sœur Lina remonte le sentier en fin d'après-midi. La lumière qui baisse est l'horloge de l'histoire : chaque temps obligatoire fait descendre le soleil, jusqu'à la nuit à la lampe. Le secret est doux (il dort, il a déplacé son camp) : la peur vient de la forêt et de l'imagination, jamais d'un monstre que le moteur ne saurait pas montrer.

| Temps | Rôle | Arrive | Au plus tard | À l'image |
|---|---|---|---|---|
| `depart` | obligatoire | tout de suite | 0 min | soleil rasant, orange |
| `sac` | obligatoire | à 4 m du sac (22 m) | 3 min | le soleil touche l'horizon |
| `camp` | obligatoire | près de la tente (46 m) | 6 min 30 | nuit, lampe allumée, brume |
| `craquement` | facultatif | si elle traîne ou si la voix parle d'un bruit | — | la brume épaissit |
| `lueur` | obligatoire | à 56 m, ou regard à gauche | 9 min 30 | une lanterne apparaît loin à gauche, hors sentier |
| `lampe-morte` | facultatif | hors sentier, si elle tourne en rond | — | la lampe s'éteint |

| Fin | Comment | Dernière image |
|---|---|---|
| `retrouve` — « Il dort » | elle quitte le sentier et atteint la lanterne | un hamac, un duvet, des chaussures ; trois répliques selon la confiance |
| `demi-tour` — « Demain, avec du monde » | elle redescend au départ après le sac | le sentier vers le bas ; elle ne sait pas, et le dit |
| `veille` — « Jusqu'au jour » (par défaut) | 14 minutes, ou dans le noir et terrifiée | noir, puis petit jour dans la brume ; on l'appelle de loin |

**Pourquoi il tient sur le moteur actuel.** Le choix central (quitter le sentier de nuit) s'appuie sur ce que la perception sait déjà mesurer (`sur_le_sentier`). Le « personnage » retrouvé est un duvet dans un hamac : une capsule, immobile, crédible. La fin par défaut utilise le lever du jour, que `patchScene` sait faire. L'accessoire `ruban` sert de rappel de niveau 2.

**Les règles du monde** (`monde`) : une forêt d'aujourd'hui, pas de réseau, rien que ce qu'une randonneuse a sur elle. Pas de pouvoir, pas de drone, pas de secours qui arrivent sur demande. Hors-jeu, Lina prend la voix pour une intuition qui déraille et le lui dit.

**Ce que le joueur change vraiment.** La fin ; le ton de la fin (variantes selon la confiance) ; ce que Lina ose (fouiller le sac, entrer dans la tente, répondre au craquement) ; tous les faits improvisés en route.

**Vérifié à l'image** (quatre captures en rendu logiciel, 270 × 480) : le sac se lit à 4 m, la tente et le foyer à 10 m, le hamac de jour à 15 m ; de nuit, depuis le sentier à 57 m, la lanterne est un point chaud net entre les troncs. Reste à régler sur téléphone : la taille de ce point, et l'orientation de la tente (`cap`).

## 9. Risques, et comment les tester sans téléphone ni Claude

| Risque | Parade dans la conception | Test |
|---|---|---|
| **Latence** : une attente visible casse l'illusion | gel pour la voix ; réplique écrite immédiate pour les événements ; relances lancées en avance ; un seul appel `quick` en vol | faux Claude avec un délai de 2 à 10 s : jamais de pensée hors d'ordre, jamais deux pensées superposées, la réponse d'une relance est jetée si le joueur a ouvert le canal |
| **Incohérence** : il oublie, se contredit, évente le secret | faits établis renvoyés à chaque appel ; temps verrouillés non envoyés ; régisseur | budget de consigne tenu après 60 tours ; un fait de trame ne sort jamais de la liste ; lecture des traces de vraies parties |
| **Robot** : il obéit à tout, répète les mêmes mots | attitudes, disposition calculée, refus qui ouvre une porte, règles d'écriture | sur une trace : part de `suit` sous 80 %, jamais deux pensées commençant par le même mot, au moins une `question` par tranche de 5 tours |
| **Mur** : il refuse tout, le joueur se sent inutile | `refus_de_suite` plafonné à 2 | faux Claude « têtu » qui répond toujours `refuse` : la page impose de céder au troisième |
| **Joueur qui casse l'histoire** : demi-tour, hors-sujet, anachronismes, « tu es dans un jeu » | sas (§4), règles du monde, échéances, fin par défaut ; sur `refuse` la page jette tout effet sur le monde | joueurs simulés ci-dessous : toutes les parties finissent, par une fin déclarée, en moins de `duree_minutes` + 1 |
| **Sas qui se trompe** : laisse passer un hors-monde, ou refuse une bonne idée | filets en code indépendants du verdict ; régisseur qui relit les verdicts | un cahier de 30 phrases de joueur par histoire, chacune avec son verdict attendu (dans le monde, limite, hors monde, méta) : rejoué sur page publiée, lu sur trace ; en Node, un faux Claude `laxiste` qui dit toujours `recevable` ne doit rien pouvoir casser |
| **Le quatrième mur** : le porteur cite une règle ou parle du jeu | consigne en deux paquets ; `hors_jeu` | recherche de mots interdits dans les pensées d'une trace (« règle », « histoire », « jeu », « prévu », « je ne peux pas ») |
| **Sortie cassée** : JSON invalide, champs fous | validation champ par champ, secours | faux Claude « singe » qui rend n'importe quoi : l'état reste valide, aucune exception, l'histoire avance quand même |
| **Coût** : trop d'appels | compte par partie (§3) | compteur d'appels dans la trace, plafonné par test |

### Ce qui rend ces tests possibles

1. **Le meneur est un module sans image.** `src/meneur.js` : état, verrous, échéances, validation, assemblage de la consigne. Il ne touche ni à WebGL ni au DOM. Il reçoit la perception et une fonction « demander à Claude », il rend des ordres pour le moteur. Il tourne dans Node.
2. **Un monde de papier.** Pour les tests, un faux moteur d'une trentaine de lignes : une position le long du trajet, un écart au sentier, les positions des objets, le temps qui passe. Il exécute `tourner`, `marcher`, `attendre` par le calcul. Une partie de 13 minutes se simule en quelques millisecondes.
3. **De faux Claude**, des fonctions qui reçoivent la consigne et rendent un objet : `muet` (échoue toujours : le secours joue seul), `perroquet` (obéit à tout), `laxiste` (tout est recevable), `tetu`, `singe` (rend des valeurs aléatoires, parfois pas du JSON), `lent`.
4. **De faux joueurs**, des listes de phrases avec des délais : `silencieux` (ne dit rien), `docile` (avance, regarde), `saboteur` (demi-tour, éteins la lampe, va dans les bois, répète), `bavard` (parle d'autre chose), `hors-monde` (drone, téléportation, « tu es dans un jeu »).
5. **Les propriétés vérifiées** sur toutes les combinaisons, avec `node --test` : la partie finit ; par une fin déclarée ; aucun temps avant ses `apres` ; tous les temps obligatoires passés avant une fin qui les exige ; jauges entre 0 et 5 ; consigne sous le budget ; pas plus d'appels que prévu.
6. **Le secours v1.** Sans Claude : le lexique actuel pour les ordres simples, plus les `replique` pour les temps, plus une dizaine de phrases de relance tirées de `porteur` (« Je veux juste … », avec son `veut`). On peut donc jouer l'histoire entière en local, dans `dist/index.html`, et la capturer avec `tools/shot.mjs` (option `histoire`, plus un script de phrases).
7. **Les traces.** Une vraie partie (page publiée) enregistre chaque consigne et chaque réponse. Rejouée dans Node avec un faux Claude qui relit la trace, elle devient un test de non-régression. Le ton, lui, ne se teste pas par code : Toine lit des traces.

## 10. Réalisation, en étapes courtes

Chaque étape laisse le jeu jouable et se vérifie seule. Les étapes 1 à 6 n'ont pas besoin de Claude.

| # | Étape | Vérification |
|---|---|---|
| 1 | Le build embarque `histoires/*.json`. `normaliserHistoire` (v0 → v1) et `validerHistoire` dans `src/meneur.js`. | `node --test` : les deux histoires passent ; dix contrats cassés donnent chacun la bonne erreur. |
| 2 | `partie` et son cycle : création depuis un contrat, horloge, application d'un temps (`scene`, `revele`), sérialisation. `balade.jouer(id)` charge la fiche et crée la partie ; `balade.partie()` la rend. | Tests Node. Dans la page : `balade.jouer("avant-la-nuit")` affiche le sentier au soleil rasant. |
| 3 | Perception enrichie : `avance_m`, objets visibles avec distance et direction, état `vu`. | Capture à 18 m : `balade.percevoir()` cite le sac devant à droite. |
| 4 | Conditions mesurables, échéances, fins. Monde de papier. Tour d'événement avec `replique`, sans IA. | Test : le joueur `silencieux` avec le Claude `muet` atteint `veille` à 14 minutes après les quatre temps obligatoires. Dans la page : marcher jusqu'au sac déclenche sa réplique et le soleil baisse. |
| 5 | Contrat de sortie v1 : validation champ par champ, `sas` (effets jetés sur `refuse`), jauges, faits, `refus_de_suite`. `entendre()` passe par le meneur. La file est vidée au tour de voix. | Tests avec `perroquet`, `tetu`, `singe`. Le comportement sans histoire reste celui d'aujourd'hui. |
| 6 | Relances : minuteur de silence, registres, numéro d'appel, réponse périmée jetée, bouton qui pulse. Secours v1. | Test avec `lent` : ordre des pensées. Partie complète jouable en local sans Claude. |
| 7 | Consigne v1 : assemblage en deux paquets (§2), sas puis personnage (§4), disposition, temps ouverts seulement, demande de `resume`. | Test de budget sur 60 tours. Puis première vraie partie sur page publiée et cahier de phrases du sas : Toine lit la trace. |
| 8 | Fins jouées : `scenes` en suite, variantes, écran de fin, rejouer. Trace exportable (`balade.trace()`), rejouable dans Node. | Les trois fins atteintes à la main dans la page ; une trace rejouée donne le même état final. |
| 9 | Régisseur : appel `default` en coulisse, `cap`, relecture des verdicts du sas, `alerte` dans la trace. | Test : régisseur absent ou lent, rien ne change pour le joueur. Sur traces réelles : les caps sont-ils suivis ? |
| 10 | Accessoires `mobile` et accessoiriste (objet nouveau, hors champ). | Capture avant et après ; le budget d'objets est respecté ; un objet raté ne casse pas le rendu (`validerFiche`). |
| 11 | Compilateur : passes 1 à 4, écran de relecture. | Trois textes d'essai donnent trois contrats valides ; une correction dite à l'oral modifie le bon champ. |
| 12 | Essai sur le téléphone de Toine : latence réelle des appels, lisibilité des pensées, rythme des relances. | Mesures notées dans `CLAUDE.md`. Réglage des délais du §3. |

Ordre conseillé si le temps manque : 1 à 8 donnent un jeu complet. 9 améliore la tenue du récit, 10 la liberté, 11 ouvre l'écriture à d'autres que le développeur.

## 11. Questions ouvertes pour Toine

1. **Qui est la voix, pour le porteur ?** Une intuition qu'il ne questionne pas (choix du scénario fourni), une présence qu'il ne s'explique pas et dont il parle, ou quelqu'un qu'il sait être « ailleurs » ? Cela change tout le ton, et c'est peut-être à fixer pour le jeu entier plutôt que par histoire.
2. **Jusqu'où le porteur peut-il dire non ?** La conception le fait céder en partie au troisième essai, pour ne pas frustrer. Veux-tu qu'un refus puisse être définitif, quitte à ce que certaines fins soient hors d'atteinte pour un joueur maladroit ? Et un apport hors monde, refusé par le sas, doit-il coûter de la confiance (choix actuel) ou rester sans conséquence pour celui qui s'amuse à tester les bords ?
3. **Une histoire doit-elle toujours finir à l'heure ?** Ici, oui : échéances et fin par défaut. L'autre choix est une histoire qui attend le joueur aussi longtemps qu'il veut, plus proche d'AI Dungeon, mais sans garantie de tension ni de fin.
4. **L'IA peut-elle créer des objets en pleine partie**, au risque de formes ratées à l'image, ou seulement montrer ceux que le concepteur a prévus ? La conception permet les deux, avec un budget par histoire ; le réglage par défaut te revient.
5. **Qui écrit les histoires ?** Toi seul pour l'instant, ou tout joueur, avec un bouton « Raconter une histoire » à côté de « Décrire un monde » ? Dans le second cas le compilateur et sa relecture passent avant le régisseur dans l'ordre de réalisation.
6. **Le porteur est-il bavard ou taiseux quand on ne lui parle pas, et le meneur peut-il figer le monde de lui-même** pour attendre une réponse à un moment clé ? Aujourd'hui, par respect de la règle « figer est le geste du joueur », il ne le fait pas.
