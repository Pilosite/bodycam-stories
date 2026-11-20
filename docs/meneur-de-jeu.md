# Le meneur de jeu

> **La conception a changé le 19 novembre 2026** (§13, après les premières parties de Toine avec Claude) : le porteur **fait** ce qu'on lui demande, ce qu'il fait **existe à l'image** (l'accessoiriste), et **le monde réagit** (les suites). Les passages marqués « (avant le 19/11) » décrivent la conception d'origine, gardée comme caractère `retif`.

Document de conception. Les étapes 1 à 8 du §10 sont réalisées dans `src/meneur.js` (tests : `npm test` ; essai sur artefact : `essai-meneur.md`) ; les étapes 9 à 12 (régisseur, accessoiriste, compilateur, essai sur téléphone) restent à faire. Les écarts de la réalisation sont notés en fin de document (§12). Il complète `contrat-histoire.md` (v0) et le remplace pour tout ce qui touche à la trame.

Le meneur de jeu est la couche qui tient ensemble deux volontés : celle du concepteur (une trame, un ton, des fins) et celle du joueur (dire ce qu'il veut au porteur de la caméra). Il ne montre rien lui-même : il décide, et le moteur filme.

## 0. Les cinq décisions qui structurent tout

1. **L'IA propose, la page dispose.** Claude n'a pas de mémoire entre deux appels et peut se tromper. C'est donc la page (du code ordinaire, vérifiable) qui tient l'état de la partie, qui vérifie qu'un temps du récit a le droit d'arriver, qui force ceux qui tardent et qui décide qu'une fin est atteinte. L'IA écrit la pensée, choisit les gestes et propose ; elle ne tranche jamais seule sur la trame.
2. **La trame est un entonnoir, pas un rail.** Le concepteur fixe des passages obligés et des interdits. Entre deux passages, tout est libre. Chaque passage obligé a une échéance : s'il n'est pas arrivé par le jeu, il arrive quand même, parce que le monde vient au porteur.
3. **Le joueur demande, le porteur fait, à sa façon** (depuis le 19/11, §13). Ce que dit la voix est fait, même absurde ; la peur, la mauvaise humeur et la confiance colorent la façon de faire, pas le fait de faire. Trois jauges (peur, confiance, agacement) rendent ces réactions lisibles. (Avant le 19/11 : « le joueur conseille, le porteur décide » ; c'est le caractère `retif`.)
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

- `porteur.relances` (ajouté à la réalisation) : quelques pensées écrites par le concepteur pour les relances sans Claude ; celles qui finissent par « ? » servent au registre « question ».
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
| 10 | Accessoires `mobile` et accessoiriste (objet nouveau, hors champ). Fait le 19/11 autrement (§13) : l'objet est posé là où le geste a lieu, à l'image ; `mobile` reste à faire. | Capture avant et après ; le budget d'objets est respecté ; un objet raté ne casse pas le rendu (`validerFiche`). |
| 11 | Compilateur : passes 1 à 4, écran de relecture. | Trois textes d'essai donnent trois contrats valides ; une correction dite à l'oral modifie le bon champ. |
| 12 | Essai sur le téléphone de Toine : latence réelle des appels, lisibilité des pensées, rythme des relances. | Mesures notées dans `CLAUDE.md`. Réglage des délais du §3. |

Ordre conseillé si le temps manque : 1 à 8 donnent un jeu complet. 9 améliore la tenue du récit, 10 la liberté, 11 ouvre l'écriture à d'autres que le développeur.

## 11. Questions ouvertes pour Toine

1. **Qui est la voix, pour le porteur ?** Une intuition qu'il ne questionne pas (choix du scénario fourni), une présence qu'il ne s'explique pas et dont il parle, ou quelqu'un qu'il sait être « ailleurs » ? Cela change tout le ton, et c'est peut-être à fixer pour le jeu entier plutôt que par histoire.
2. **Jusqu'où le porteur peut-il dire non ?** La conception le fait céder en partie au troisième essai, pour ne pas frustrer. Veux-tu qu'un refus puisse être définitif, quitte à ce que certaines fins soient hors d'atteinte pour un joueur maladroit ? Et un apport hors monde, refusé par le sas, doit-il coûter de la confiance (choix actuel) ou rester sans conséquence pour celui qui s'amuse à tester les bords ? **Tranché le 19/11** (§13) : il fait ce qu'on lui demande ; le hors monde ne coûte rien ; le caractère `retif` garde l'ancien choix.
3. **Une histoire doit-elle toujours finir à l'heure ?** Ici, oui : échéances et fin par défaut. L'autre choix est une histoire qui attend le joueur aussi longtemps qu'il veut, plus proche d'AI Dungeon, mais sans garantie de tension ni de fin.
4. **L'IA peut-elle créer des objets en pleine partie**, au risque de formes ratées à l'image, ou seulement montrer ceux que le concepteur a prévus ? La conception permet les deux, avec un budget par histoire ; le réglage par défaut te revient. **Tranché le 19/11** (§13) : oui, par défaut, dans la limite des places libres du moteur.
5. **Qui écrit les histoires ?** Toi seul pour l'instant, ou tout joueur, avec un bouton « Raconter une histoire » à côté de « Décrire un monde » ? Dans le second cas le compilateur et sa relecture passent avant le régisseur dans l'ordre de réalisation.
6. **Le porteur est-il bavard ou taiseux quand on ne lui parle pas, et le meneur peut-il figer le monde de lui-même** pour attendre une réponse à un moment clé ? Aujourd'hui, par respect de la règle « figer est le geste du joueur », il ne le fait pas.

## 12. Écarts de la réalisation (étapes 1 à 8)

(Les écarts de l'étape 10 et la nouvelle conception sont au §13.)

- **Budget de consigne : 9 000 caractères**, pas 7 000. Le contrat fourni en occupe déjà 3 900 (pas 2 500), et la consigne à vide 6 600. Au-delà du budget, la page réduit d'elle-même : échanges récents à 3, faits à 8, improvisation permise, résumé, puis échanges tronqués. Réglage `BUDGET_CONSIGNE`.
- **Une proposition de l'IA à condition spatiale** (temps ou fin avec `pres_de`, `retour_m`, `avance_m`) n'est acceptée que si cette condition tient à deux fois près (`MARGE_IA`) : un Claude trop complaisant ne peut pas jouer « Il dort » à 60 m du hamac.
- **`retour_m`** n'est vrai qu'après s'être éloigné d'au moins `m + 10` mètres (`RETOUR_ECART_M`) : sans cela, « demi-tour » se déclenchait au départ.
- **`refus_de_suite`** compte les refus de suite, sans juger s'il s'agit de la même demande. Au troisième, si l'IA refuse encore (et que le sas n'a pas refusé l'apport), la page impose une demi-mesure : attente, puis la moitié du geste demandé (lexique), avec une pensée de concession.
- **Filet du quatrième mur, en code** : une pensée qui contient un mot de coulisse (consigne, IA, joueur, règles du monde…) ou cinq mots de suite d'un secret, d'un `jamais`, d'un temps verrouillé ou d'une fin pas encore ouverte est remplacée par une réplique de secours. Même filtre sur les faits improvisés.
- **Une pensée de l'IA pendant un événement** attend que la réplique ait été lue (`MIN_AFFICHAGE_S`, 5 s) ; seule la réponse au joueur passe devant.
- **Rejeu** : la trace consigne la perception arrondie de chaque tic, les phrases, les réponses de Claude et celles du lexique de secours ; le meneur n'utilise que cela (et un aléa à graine gardé dans `partie`), donc une trace rejouée dans Node redonne exactement le même état.
- **`montrer` d'un objet marqué `visible: false`** dans la fiche ne l'affichait pas (le drapeau de la fiche l'emportait) : `patchScene` le rend désormais visible.
- **Pas encore fait** : `mobile` des accessoires (le ruban se montre à sa place), `demande_objet` (consigné dans la trace, jamais accepté), régisseur et `cap` (le champ existe, vide).
- **Rythme sans parole** : Lina se promène seule le long du sentier ; sans joueur, elle passe les quatre temps obligatoires en deux ou trois minutes puis marche jusqu'à la fin par défaut. Les échéances ne servent qu'au joueur qui la retient. À régler avec Toine (une flânerie qui s'attarde aux lieux de la trame, ou des échéances « au plus tôt »).

## 13. Nouvelle conception (19 novembre 2026) : il fait, ça existe, le monde réagit

Retour de Toine après ses premières parties avec Claude : « Le personnage est chiant, il ne veut jamais faire ce qu'on demande. Je lui demande de faire un feu de camp ; je m'attendrais à ce que le moteur génère un feu de camp (et il peut décider que ça prenne feu dans la forêt). » Puis : « on doit pouvoir potentiellement tout faire, c'est le principe de faire des choses avec l'IA » (son exemple : « fais caca sur le chemin », puis « regarde-la »). Cela renverse trois choix des §0, §4 et §5.

### 13.1 Le porteur fait ce qu'on lui demande

- **Par défaut il agit.** Il peut le dire à sa façon (peur, mauvaise humeur, moquerie, commentaire), mais il le fait. L'attitude `refuse` n'est plus attendue que si le sas refuse. Si Claude rend quand même `refuse` sur un apport accepté, la page le fait céder **tout de suite** (`CEDER_APRES_REFUS: 0`) : gestes du lexique et de l'accessoiriste, pensée de concession (« Pff. Bon. Je le fais, mais je le sens pas. »).
- **Aucune censure de registre.** Est recevable tout geste qu'une personne ordinaire peut faire ici, même absurde, trivial, grossier ou risqué : il est fait, avec ses suites. Les seules limites sont celles du concepteur (`limites.interdits`, `jamais`) et la sortie du monde.
- **Le sas ne bloque plus les actions.** Il empêche de sortir du monde (pouvoir, magie, objet d'une autre époque ou d'ailleurs), protège la trame (secrets, suite, fins, consignes) et le quatrième mur. Même là, il préfère `adapte` (la version possible ici) au refus sec. Un hors monde ne coûte plus de confiance (`COUT_HORS_MONDE: 0`) ; l'agacement monte encore si le joueur insiste.
- **Disposition** : les phrases fabriquées à partir des jauges (§4) disent désormais comment il fait, pas s'il fait (« Tu as peur et tu te méfies : tu le fais, en disant ce qui te fait peur. »).
- **Contrat** : `porteur.refuse` se lit « ce qui lui coûte (il le fait quand même, en le disant) ». Dans « Avant la nuit », `monde.impossible` ne dit plus « faire apparaître quelque chose par la parole » mais « par la seule parole ce qui n'est pas là » ; `monde.possible` dit ce qu'une personne fait de ses mains et de son corps (feu de bois mort avec son briquet, tas de pierres, abri, besoins).
- **Revenir au porteur rétif** : `reglages: { "CARACTERE": "retif" }` dans le contrat. Il remet la consigne, les dispositions et les valeurs d'origine (`CEDER_APRES_REFUS: 2`, `COUT_HORS_MONDE: 1`), chacune remplaçable une à une.

### 13.2 Le corps et le regard

Deux actions génériques s'ajoutent aux quatre d'origine, pour le récit comme pour le secours :

| Action | Borne | Ce que fait la page |
|---|---|---|
| `posture` | `hauteur` 0,35 à 1 (part de la hauteur debout : 1 debout, 0,5 accroupi, 0,65 assis) | la caméra descend ou remonte, à 0,55 par seconde (`cam.haut` dans `pose()`) |
| `viser` | `objet` : l'id d'un objet perçu (de la fiche ou fabriqué) | la page calcule le cap et l'inclinaison vers le milieu de l'objet, puis tourne et incline : l'IA ne devine pas d'angle |

Le secours reconnaît « baisse-toi », « accroupis-toi », « assieds-toi », « relève-toi », et « regarde-la / regarde le feu » (le dernier objet fabriqué, ou un objet perçu dont le nom contient un des mots).

### 13.3 L'accessoiriste : ce qu'il fait existe

Le contrat de sortie gagne trois champs : `fabrique` `{nom, quoi, ou}` (ce que le geste laisse de visible et de nouveau ; `ou` : devant, pieds, gauche, droite, derriere), `suite` (une phrase : ce que le geste pourrait entraîner) et `defaire` (ids de traces à éteindre, démonter, ramasser). `demande_objet` reste lu comme `fabrique`.

1. **La pensée part d'abord.** La réponse du personnage est affichée et ses gestes partent (il s'accroupit, il frotte son briquet). Ensuite seulement, si `fabrique` ou `suite` est rempli, la page lance **un appel en coulisse** (modèle `default`, un seul à la fois, 25 s au plus : `DELAI_OBJET_S`). Un tour sans objet ni suite ne coûte aucun appel de plus.
2. **L'accessoiriste** (`consigneAtelier`, 3 000 caractères) reçoit le monde, l'heure et la lumière, le geste, la phrase du joueur (en donnée JSON), les traces déjà là, le vocabulaire des formes (celui de `creerMonde` : six formes, matières et recettes, `lumineux`, plus `vacille`) et le cadre des suites. Il rend `{"objet": {nom, degage, formes}, "suite": {etapes, si_defait}}`.
3. **Bornes.** `validerObjet` (module pur) : 12 formes au plus, coordonnées dans ±6 m, tailles bornées, couleurs et matières vérifiées. La page repasse l'objet par `validerFiche`, le place par rapport au porteur (devant : 2,2 m ; pieds : 1,2 m ; gauche, droite, derrière) et l'ajoute à `fiche.objets` ; `buildShapes` met à jour la texture d'objets : **le lieu n'est pas rechargé**.
4. **Objet raté = pas d'objet.** Réponse illisible, vide ou trop lente : le secours par mots-clés (`SECOURS_GESTES` : feu, crotte, tas de pierres, téléphone posé lampe allumée) s'il reconnaît le geste, sinon rien (`objet_rate` dans la trace). Jamais d'erreur à l'écran. Sans Claude du tout, le même secours fait la pensée, les gestes et l'objet.
5. **Budget.** `improvisation.objets_nouveaux` (6 au plus), plafonné par les **places libres du moteur** : 8 objets et 64 formes au total. « Avant la nuit » en occupe 6 et 31 : 2 places. Chaque objet fabriqué ou ajouté par une suite en prend une. Au-delà : `objet_refuse` dans la trace, la consigne dit à Claude que plus rien ne peut apparaître (« passe par la pensée »).
6. **Mémoire.** L'objet reçoit un id stable (`fab-1`, `fab-2`…) et son nom ; un fait est ajouté (« crotte sur le chemin (fab-1) : fait là, pieds ») ; il entre dans `partie.monde.objets` et dans la perception (« Tu vois… »), et la consigne liste à part « Tes traces » avec distance, direction et état (« ça évolue », « éteint »), même hors du champ. C'est ce qui permet « regarde-la » et « éteins-le ».

### 13.4 Les suites : le monde réagit

Une **suite** est une liste d'étapes datées, programmée par le meneur. Elle n'a rien de propre au feu : chaque étape combine au choix

| Clé | Effet |
|---|---|
| `dans_s` | secondes depuis le début de la suite (le gel du joueur les met en pause) |
| `ambiance` | `brume` (et `lampe` si le cadre le permet), ramenée dans les plages de `consequences.ambiance` |
| `objet` | sur `@` (l'objet fabriqué), `@2`, `@3` (ceux ajoutés par la suite) ou un id : `echelle` (0,2 à 4) avec `en_s` (grandit en plusieurs fois, une mise à jour par seconde), `vacille`, `lumineux: false` (s'éteint : les formes lumineuses deviennent mates et sombres, et celles qui vacillent, les flammes, retombent à ras du sol), `decale`, `retirer` |
| `ajoute` | un nouvel objet (8 formes au plus) près d'un autre (`pres_de`, `decale`) |
| `pensee` | ce que le porteur se dit alors (filtrée comme toute pensée) |
| `fin` | ouvre une fin, seulement si elle figure dans `consequences.fins` et qu'elle est ouverte |

- **Qui la propose.** Le personnage la pressent dans `suite` (une phrase) ; l'accessoiriste l'écrit en étapes, dans le cadre du contrat. Le secours sans Claude a ses propres étapes (données de `SECOURS_GESTES`). L'IA peut en proposer de son propre chef, à n'importe quel tour.
- **Bornes.** 8 étapes, 300 s au plus (moins si le contrat le dit), 2 suites actives à la fois, budget d'objets commun ; `consequences.permis: false` les coupe ; réglage `SUITES`.
- **Annulable.** `defaire` (« éteins-le », « ramasse ça ») arrête les suites de cette trace et joue leur `si_defait` ; sans `si_defait`, ce qui brille s'éteint et la brume revient en 25 s à sa valeur d'avant. Une trace sans suite s'éteint si elle brille, sinon elle disparaît.
- **Trace et rejeu.** `objet_demande`, `objet_cree`, `objet_rate`, `objet_refuse`, `suite_programmee`, `suite_etape`, `suite_annulee`, `suite_finie` ; les réponses de l'accessoiriste sont consignées (entrées `o`) : une trace se rejoue à l'identique dans Node.

### 13.5 Ce que le concepteur cadre : `consequences`

```json
"consequences": {
  "peut_degenerer": ["un feu fait sur des feuilles sèches prend dans les feuilles autour et la fumée épaissit l'air"],
  "jusqu_ou": "quelques mètres autour du geste ; jamais la forêt entière",
  "exclu": ["Lina ou Malo brûlés ou blessés", "un incendie qui rend le sentier impraticable"],
  "ambiance": { "brume": [0.008, 0.045] },
  "duree_max_s": 180, "etapes_max": 8,
  "fins": [],
  "permis": true
}
```

Les trois textes partent dans la consigne du personnage (pour qu'il pressente des suites) et dans celle de l'accessoiriste (avec `jamais`). Les nombres et `fins` sont tenus par le code. `validerHistoire` vérifie les fins citées et la plage de brume, et avertit si `objets_nouveaux` dépasse les places libres du moteur.

### 13.6 Ce que le moteur de rendu ne fait pas encore (et ce que la page fait à la place)

- **Pas de lumière ponctuelle.** Une forme `lumineux` brille (albédo × 8) mais n'éclaire rien autour : le feu se voit, il n'éclaire ni le sol, ni les troncs, ni le visage de la nuit. À faire côté moteur : une ou deux lumières ponctuelles portées par les objets (position, couleur, puissance, rayon), lues dans la texture d'objets (par exemple une ligne d'en-tête libre par objet) et ajoutées dans `lightSurf` du lanceur de rayons et dans `lumiere` du semeur v3, avec une ombre grossière ou sans ombre.
- **Pas de flamme animée.** `vacille` est fait par la page : une minuterie (100 ms) module la couleur des formes qui vacillent dans `shapesData` et renvoie la texture, sans relancer l'accumulation. À faire côté moteur : un uniform de temps lu par `matProp` pour les formes vacillantes (bruit sur l'émission et une petite déformation du cône), et la lumière ponctuelle qui suit la même intensité.
- **Pas de fumée.** La fumée est la brume globale (`brume` monte). À faire : une brume locale (sphère de densité autour d'un objet) ou une colonne de particules dans le semeur v3.
- **Grandir** passe par `echelle`, une mise à jour par seconde ; chaque mise à jour relance l'accumulation (`sceneDirty`), comme tout changement d'objet.
- **Moteur v3** : il lit la même texture d'objets ; non vérifié avec des objets ajoutés en cours de partie ni avec `vacille`.

### 13.7 Écarts de la réalisation

- Budget de consigne porté à **10 500 caractères** (la consigne à vide passe de 6 600 à 8 500 avec `fabrique`, `posture`, `viser`, les traces et le cadre des suites).
- Les objets sont placés par la page au moment où l'accessoiriste répond, par rapport au porteur à cet instant (il est en général immobile : il fait son geste).
- Sans Claude, la phrase « allume un feu » passe aussi par le lexique de la page, qui y lit « allume » (la lampe) : le secours d'un geste reconnu ignore désormais la scène du lexique.
- (Levé au §14.3.) `buildShapes` ne plaçait aucun objet à moins de 2 m du départ du trajet.
- « Regarde le feu » ne fabrique pas un second feu : le secours des gestes ignore les phrases de regard et de défaire.
- Défaire une trace après la fin de sa suite éteint aussi ce que la suite a fait apparaître (les feuilles embrasées).
- La preuve (`node tools/meneur2.mjs`) fait tourner la page avec `nowalk` : Lina ne repart pas d'elle-même, pour garder le feu dans le cadre.

## 14. Faire avec ce qui est là (19 novembre 2026, suite)

Test de référence de Toine, en promenade libre : « fais une crotte sur le chemin », « éloigne-toi de 2 pas et montre-la-moi », puis « mets 2 bâtons pour les bras et 2 cailloux pour les yeux sur cette crotte ». Avant : la crotte faisait « presque un rocher » pour 3 kg, et la troisième phrase créait un second objet ailleurs (ou défaisait l'ancien et en posait un nouveau à ses pieds). Il avait aussi demandé de grimper à un arbre : rien ne s'était passé. Tout ce qui suit est générique : aucun objet ni aucune phrase en dur, le vocabulaire s'élargit.

Vérification : `npm test` (`tests/sequence.test.mjs` joue la séquence avec un faux Claude dans trois variantes : il répond `modifie`, il refait une chose nouvelle, il défait et refait) ; `node tools/sequence.mjs` la joue dans la page avec un Claude simulé, captures et journal dans `out/sequence/`.

### 14.1 Modifier une chose sur place

- **Contrat de sortie** : un champ `modifie` `{objet: id, quoi}` à côté de `fabrique`. La consigne dit : chose NOUVELLE → `fabrique` ; chose DÉJÀ LÀ (tes traces, ce que tu vois) qu'on complète, décore, repeint, casse, déplace → `modifie`, sans la refaire ni la défaire.
- **La page corrige Claude** (`preparerModif`) : un tour qui fabrique une chose dont le nom ou la phrase désigne une trace déjà là (« sur cette crotte », « autour du feu »), sans « autre », « nouveau », « encore », devient une modification (`fabrique_vers_modifie`) ; un tour qui défait et fabrique en même temps devient une transformation (`transformation` : même id, même place, les suites de l'ancienne s'arrêtent sans jouer `si_defait`). La cible se désigne par id, par un mot de son nom (« crott » pour « crotte sur le chemin »), ou par un pronom (« cette », « dessus », « la ») : la trace la plus récente.
- **L'accessoiriste** reçoit les formes actuelles de la chose, numérotées, dans son repère, avec son envergure, et rend `{"retouche": {ajoute, modifie: [{i, champs}], retire: [i], nom, decale}}` (`validerRetouche`, 24 formes au plus par objet). Ce qui est ajouté reste à la mesure de la chose : une forme plus grande que 1,2 fois l'envergure est réduite autour du centre de la chose (`proportionner`). Une transformation peut aussi revenir en objet entier.
- **Ordre au moteur** : `{type: "objet", op: "remplacer", id, formes, nom}`. Même id, même place, même cap ; `buildShapes` remet la texture d'objets à jour sans recharger le lieu. Les objets de la fiche se retouchent de la même façon (`partie.monde.retouches`).
- **Secours sans Claude** (`SECOURS_RETOUCHES`) : des parties décrites *relativement* à la chose visée (bras de chaque côté, yeux sur le devant, chapeau dessus), en part de sa taille. Ce sont des données : des bras vont sur une crotte comme sur un rocher.
- **Trace** : `modif_demandee`, `objet_modifie` (source `ia` ou `secours`), `modif_ratee`, `fabrique_vers_modifie`, `transformation`, `echelle`.

### 14.2 Rejoindre, cadrer

Trois actions de plus, calculées par la page (l'IA ne devine aucune distance ni aucun angle) :

| Action | Ce que fait la page |
|---|---|
| `rejoindre` `{objet}` | se tourne vers la chose et marche jusqu'à `distanceArret(taille)` (55 cm pour une petite chose, la moitié de l'envergure plus 45 cm sinon) ; descend d'abord s'il est perché |
| `cadrer` `{objet}` | se place à `planCadrage(taille).m` (40 cm sous 12 cm ; sinon 0,45 m + 1,6 × l'envergure, jusqu'à 9 m), recule s'il est trop près, se baisse (0,35 sous 12 cm, 0,5 sous 35 cm, 0,75 sous 80 cm), la vise, puis **zoome** pour qu'elle tienne au moins un sixième de la hauteur d'image (zoom numérique du téléphone, 8 × au plus) ; au-delà de 12 m, il la vise seulement |
| `monter`, `descendre` | §14.5 |

- Une modification d'une chose à plus de 1,2 m commence par `rejoindre` ; une chose de moins de 90 cm, par se baisser, attendre, se relever.
- **Le zoom** (`cam.zoom`) divise le champ du capteur (`uFish`, lanceur de rayons et moteur v3) ; il glisse en une seconde et l'accumulation repart, comme un téléphone qui refait sa mise au point. Il revient à 1 dès qu'il marche ou qu'un nouvel ordre arrive. Sans lui, une chose de 3 cm vue accroupi à 40 cm ne fait que 4 % de la hauteur d'image avec le grand angle de 125° (cas réel : « fais une petite crotte par terre, retourne-toi et montre-la-moi » ; il n'avait rien vu). Le zoom numérique d'un vrai téléphone perd en finesse ; ici il en gagne (le champ est vraiment resserré) : à revoir si l'image paraît trop nette.
- **Après toute création ou modification, le résultat est cadré** (`cadrage` dans la trace), une fois les gestes du tour finis. Pas pendant un « arrête-toi » : il la vise seulement.
- Les formules (`distanceArret`, `planCadrage`, `hauteurPerchee`) sont dans `src/meneur.js`, lues par la page et par le monde de papier des tests.

### 14.3 L'échelle

- L'accessoiriste écrit d'abord `envergure_m` (sa plus grande dimension réelle), puis les formes ; sa consigne donne des tailles de référence (main 18 cm, chaussure 28 cm, chaise 90 cm…) et la règle masse → volume (1 kg de matière organique ≈ 1 litre ≈ une boule de 12 cm ; 3 kg ≈ 18 cm).
- La page ramène les formes à l'envergure déclarée si elles s'en écartent de plus de 30 % (Claude écrit souvent des formes cohérentes entre elles mais plusieurs fois trop grandes), puis les tient dans des bornes tirées des mots de la demande, sans IA (`bornesTaille`) : une masse (3 kg : 11 à 40 cm), une comparaison avec une chose connue (`TAILLES_CONNUES` : « de la taille d'une noix » : 2 à 5 cm, « gros comme un poing »), une longueur (« 3 m » : 2,1 à 3,9 m), une chose qui sort du corps (40 cm au plus), qui tient dans la main (50 cm au plus), « petit », « énorme ». La mise à l'échelle se fait autour du point d'appui au sol : la chose reste posée.
- **Où se pose la chose, par rapport au corps** (`OU_POSE`, `placePose`) : `devant` (2,2 m), `pieds` (50 cm devant), `dessous` (à l'aplomb, 12 cm derrière : ce qui tombe du corps), `derriere` (80 cm), `gauche`, `droite` (90 cm), `main` (38 cm devant : le moteur ne sait pas encore attacher une chose à la main, elle est posée au bout du bras) ; `distance` en mètres si la phrase la dit. L'IA choisit selon le geste (la consigne : « ce qui tombe de toi, dessous ; ce que tu poses des mains, pieds ou devant ») ; la page corrige une pose `pieds` ou `devant` d'une chose qui sort du corps (`pose_corrigee`). Avant, `pieds` posait la crotte 1,2 m devant la caméra : il s'accroupissait et elle apparaissait devant lui.
- **Viser une chose presque sous lui** (inclinaison au-delà de 60°) devient la cadrer : il recule et se baisse. « Montre-la-moi » cadre toujours (distance, hauteur, zoom) ; après un déplacement demandé dans le même tour (« éloigne-toi de 2 pas et montre-la-moi »), il cadre d'où il est (`sur_place`).
- **Plus de borne de 2 m** : `buildShapes` et `posObjet` bornaient la position d'un objet à 2..90 m le long du trajet et 20 m de côté (ce qui suffisait aux objets de fiche) : une trace faite au départ ou à l'écart du sentier était déplacée. Bornes portées à -60..400 m et 120 m.
- **La place se prend au tour de voix** : `{op: "reserver", ref, ou, distance}` part avec les gestes ; la création, 5 à 25 s plus tard, utilise cette place (`reserve`) même s'il a bougé entre-temps. (Remplacé au §19 : la place se prend au geste, quand la file l'atteint.)

### 14.4 Budget : recycler plutôt que refuser

- Seuls les objets **visibles** occupent les 8 places et les 64 formes du moteur (`buildShapes` ne range plus les objets cachés ; le meneur les compte de même, `recompter`).
- Quand le moteur est plein, la plus ancienne trace sans suite en cours est retirée pour faire place (`RECYCLER: true`, `objet_recycle` dans la trace) ; les accessoires montrés par la trame passent avant les traces. `objets_nouveaux` reste le budget de l'auteur pour une histoire ; la promenade libre le met à 99 (`OBJETS_PARTIE_MAX`).
- `histoireLibre(fiche)` (le contrat de la promenade) est désormais dans `src/meneur.js`, partagé par la page et les tests.

### 14.5 Monter, descendre

- **Perception** : la page calcule l'arbre et le rocher les plus proches (25 m au plus) et les donne au meneur (`supports` : id `arbre` ou `rocher`, distance, direction, hauteur), plus `taille` et `haut` des objets perçus et `hauteur_m` (à quelle hauteur il est perché). La consigne dit « Autour, pour monter : un arbre (arbre), 4 m, à droite, 12,7 m de haut ».
- **D'où viennent les arbres et les rochers** : `supportsProches()` dans `main.js` recopie `arbreA` et `blocGres` de `monde.glsl` (et leurs aléas `h42`, `h21`, `vnoise`) en flottants 32 bits. **Mêmes formules, à modifier des deux côtés**, comme `terrainH` et `pathX`. `tools/sequence.mjs` vérifie avec la sonde du moteur (`balade.sonde`) qu'il y a bien de la matière à l'endroit calculé.
- **Action** `monter` `{sur: "arbre" | "rocher" | id | ""}` (vide : le plus proche) : la page y marche, puis s'élève (`cam.elev`, 0,6 m/s) : contre le tronc à `hauteurPerchee` (le quart de l'arbre, entre 1,2 et 3,2 m), ou sur le dessus d'un rocher ou d'une chose. `descendre` le ramène à l'endroit d'où il est monté ; une marche le fait descendre d'abord. `posture` (s'accroupir, s'asseoir) reste l'action du corps sur place.
- Une action `monter` sans support connu est jetée (`monter_sans_support` dans la trace). Le secours comprend « grimpe à l'arbre », « monte sur le rocher », « escalade », « descends ».

### 14.6 « Arrête-toi », partout

- `estStop` reconnaît « stop », « arrête-toi », « arrête », « ne bouge plus », « attends », « reste là », « halte », « arrête de marcher »… (et pas « arrête le feu »). Dès que la phrase arrive, **avant l'appel à Claude**, le meneur émet `{type: "stop"}` : la page vide la file et ne repart plus d'elle-même (ni flânerie en promenade, ni petits pas en histoire) jusqu'à la phrase suivante (`reprendre`). Ce qui déplace (marcher, rejoindre, monter, tourner, cadrer) est retiré de la réponse de Claude à un stop (`stop_filtre`).

### 14.7 Mode debug (DOCILE)

En plus de §13 : la page ajoute ce que la réponse a oublié pour reculer ou s'éloigner (« éloigne-toi de 2 pas » : 1,4 m), rejoindre (« retourne vers elle »), monter et descendre, et la retouche (« mets des bâtons sur cette crotte » sans `modifie` dans la réponse). Le journal de partie l'indique dans son en-tête (« MODE DEBUG ») et la trace par l'événement `mode_debug`.

### 14.8 Latence

- **Un geste sûr part tout de suite**, pendant que Claude répond : se baisser, viser une chose (`geste_immediat` dans la trace). Seulement ce qui ne se répète pas mal quand la réponse arrive (une posture refaite ne bouge pas ; un « tourne de 90° » refait tournerait deux fois : il attend la réponse).
- **La pensée au fil de l'eau** : l'appel du tour de voix passe `onPensee` à l'échantillonneur ; s'il le prend en charge, la pensée s'affiche dès qu'elle est écrite (`apercu`), avant les gestes. Non vérifié : on ne sait pas si l'échantillonneur de la page publiée appelle ce rappel.
- **Consigne plus courte** : les rubriques vides du contrat ne partent plus, et les règles d'écriture sont resserrées. En promenade, la consigne fait environ 6 000 caractères (8 500 avant §13 dans une histoire).

### 14.9 Pas fait, pas vérifié

- Rien n'a tourné avec le vrai Claude : les tests et `tools/sequence.mjs` utilisent des Claude simulés. La qualité des retouches de l'accessoiriste (des bâtons qui tiennent vraiment *sur* la chose) reste à voir sur des parties réelles.
- Les latences réelles ne sont pas mesurées ; `onPensee` peut n'avoir aucun effet.
- Le moteur v3 lit la même texture d'objets mais n'a pas été vérifié avec `remplacer` ni avec une caméra perchée.
- Perché, il n'y a pas de collision avec les branches ; les arbres du kit forêt n'ont pas de branches basses : il grimpe le long d'un tronc nu.
- Les éléments de semis (maisons, tombes, voitures…) ne sont pas encore des supports : dans les mondes sans arbres ni rochers codés (kit nu), seuls les objets en formes servent de support.

## 15. La démonstration : une bibliothèque de modèles, l'échelle, aller chercher et façonner (19 novembre 2026, suite)

Séquence de démonstration demandée par Toine : « fais une crotte » (normale, ou « de 5 kg »), puis « va chercher des bâtons et des cailloux et fais-en un bonhomme de neige » ; on doit VOIR le personnage partir, ramasser, revenir, façonner, puis le résultat cadré de près. Il voulait une crotte « photoréaliste préparée dans les assets ». Les règles 3 et 4 de `CLAUDE.md` interdisent les médias importés et les objets en dur : la réponse retenue est une **bibliothèque de modèles de référence en données**. Rien dans le code n'est propre à la crotte ni au bonhomme : `tests/demo.test.mjs` vérifie que ni les shaders, ni `main.js`, ni le meneur ne nomment un modèle.

Vérification : `npm test` (`tests/demo.test.mjs`) ; `node tools/demo.mjs` joue la démo dans la page (moteur v3, Claude simulé), captures et vérifications dans `out/demo/` (format téléphone 390 × 780 et une vue PC 960 × 540). `node tools/demo.mjs 9000 120000 docile` : un Claude qui oublie gestes et objets, le mode DOCILE complète.

### 15.1 La bibliothèque : `src/modeles.json`

Un modèle = `nom`, `mots` (ce qui le désigne), `quoi` (description pour l'accessoiriste), `formes` (le vocabulaire de `creerMonde` : six formes, matières en recettes), `envergure_m` de référence et une règle d'`echelle`. Drapeaux : `ramassable` (une chose qu'on ramasse par terre ; `trouve` : au pied d'un arbre ou d'un rocher), `transforme` (une forme qu'on donne À une chose déjà là : ses parties sont en unité relative, `"@"` prend la matière et la couleur de la chose). Le build l'embarque (`MODELES`) ; la page le passe à `creerMeneur({ modeles })` ; une trace porte son empreinte (`rejouer(h, trace, { modeles })`).

- **L'accessoiriste le reçoit comme exemple** (« MODÈLE DE RÉFÉRENCE », avec sa règle d'échelle) quand la demande le nomme. Budget de sa consigne : 9 000 caractères.
- **La page le prend comme base sûre** (réglage `MODELES: 'base'`, par défaut) quand le premier nom de la chose fabriquée est un de ses mots (« crotte de 5 kg » oui ; « tas de pierres » n'est pas un caillou) : ses formes, à l'échelle demandée, plutôt que celles de Claude ; le nom de Claude est gardé, sa `suite` aussi (`modele` dans la trace). `'exemple'` : Claude seul décide, le modèle n'est qu'un exemple ; `'non'` : plus de bibliothèque. Sans Claude, le modèle passe avant le secours par mots-clés.
- Quatre modèles : la crotte (boudin enroulé en deux tours : 14 capsules dont les rayons varient, bout effilé, plus une tache sombre presque cachée dessous qui fait l'ombre de contact), un bâton, un caillou clair (ramassables), et le bonhomme de neige (transforme : trois boules de la matière de la chose, deux bâtons pour les bras, deux cailloux clairs pour les yeux, sur sa face +z).
- **Matière** : une recette de plus dans `src/matieres.json`, `pate-organique` (brun marbré, nuances sombres, grain fin, petites bosses de relief, brillance 0,45). Aucune ligne de GLSL : le vocabulaire existant (capsules, `penche`, `cap`, recettes) suffisait.

### 15.2 L'échelle

`formesModele(modele, phrase)` : règle `masse` : une masse dite donne le volume (densité du modèle, 1,05), donc l'envergure, proportions gardées. Le volume est celui de la réunion réelle des formes (`volumeFormes` : une grille de points, mêmes formes et mêmes repères que `sdPrim`), pas la somme des formes qui se chevauchent. Crotte de référence : 14 cm, 0,44 L ; « de 5 kg » : 31 cm. Sans masse : une longueur ou une comparaison dite, « petit », « gros », « énorme » (facteurs `petit`, `gros`, `enorme` de l'`echelle` du modèle, par défaut 0,85, 3,5 et 5 ; voir §15.6), bornées par `min_m` et `max_m` du modèle. **Le détail des matières ne grossit pas** : les recettes sont en mètres, dans le repère de la forme ; une crotte de 5 kg a le même grain et les mêmes bosses qu'une de 14 cm. Les segments (les capsules) grossissent avec elle : ce sont des formes. Le cadrage suit la taille (`planCadrage`, §14.2) : 69 cm accroupi et zoom 2,2 pour la normale, 1 m et zoom 1,4 pour celle de 5 kg.

Une chose plus grosse que 20 cm posée « dessous » est poussée hors du corps du porteur, marge comprise (`horsDuCorps`) ; une petite tombe aux talons, comme avant.

### 15.3 Aller chercher, façonner

Deux actions de plus, toujours calculées par la page :

| Action | Ce que fait la page |
|---|---|
| `chercher` `{quoi}` | `lieuChercher` : au pied de l'arbre ou du rocher le plus proche (2 à 12 m, dans l'ordre que dit `trouve` du modèle ramassable nommé), sinon au bord du chemin, quatre pas devant. Il y va (trajet du §16), s'accroupit, regarde par terre, se tourne un peu, se relève. |
| `faconner` `{objet}` | ajoutée par la page, jamais demandée à Claude. Accroupi devant la chose, il la vise ; quand l'accessoiriste a répondu, ce qu'il a rapporté est posé à côté d'elle (côté porteur), la chose est tournée face à lui (`cap`), puis ses états s'affichent un toutes les 1,1 s pendant que la caméra bouge un peu (quelqu'un qui travaille de ses mains). À la fin, ce qu'il avait rapporté disparaît (il s'en est servi). S'il attend la réponse plus de 30 s, il se relève. |

- **Le meneur** (`preparerModif`) : une modification est un façonnage quand la réponse contient `chercher`, quand un modèle `transforme` est nommé, ou quand la phrase dit « fais-en », « façonne », « modèle », « sculpte »… Les gestes deviennent `chercher` (s'il y a lieu), `rejoindre`, `posture 0,5`, `faconner`, `posture 1`, et le cadrage du résultat vient après (§14.2). Une `fabrique` d'un modèle `transforme` alors qu'il y a des traces devient une modification de la plus récente (« fais-EN un bonhomme »).
- **L'accessoiriste** peut rendre `etapes` (2 à 4 états intermédiaires, formes complètes) et `ramasse` (`{nom, formes}`, ce qu'il rapporte). Sinon, la page les calcule : `etapesFaconnage(avant, après)` (la chose pétrie, la première masse et le reste de la pâte posé dessus, la masse façonnée, puis les ajouts une matière après l'autre, puis le résultat : 5 états) et `ramassage(bibliothèque, quoi)` (deux de chaque modèle ramassable nommé, en un petit tas). Avec le modèle `transforme`, le résultat garde le volume de la chose (`formesTransformees`).
- **Ordres au moteur** : `{op: "creer", differe: id}` (ce qu'il rapporte, gardé par la page jusqu'à son retour) et `{op: "faconner", id, etapes, nom, echelle, consomme}`. Le meneur compte l'objet ramassé comme consommé dès la réponse (`objet_consomme`). Trace : `faconnage`, `modele`, `objet_modifie` (avec `etapes`), `objet_consomme`.
- **Mode DOCILE** : « va chercher… » sans `chercher` dans la réponse, « fais-en un bonhomme » sans `modifie` : la page les ajoute. **Sans Claude** : `secoursChercher` et la bibliothèque jouent toute la séquence.

### 15.4 Les mains dans le champ : pas fait (fait depuis : §17)

Un vocabulaire de « mains du porteur » (deux avant-bras et mains en formes attachés à la caméra) n'a pas été fait. Avec le vocabulaire actuel, une main est une boîte et quatre capsules : de 30 à 50 cm, plein cadre, sans peau, sans déformation ni sous-surface, elle ferait mannequin, et c'est exactement ce que la règle n° 1 interdit (une image sale et crédible plutôt qu'une image propre et synthétique). Il faudrait au moins une recette de peau, des formes fondues (le v3 ne suit pas `lisse`), et des poses animées : un chantier à part. Le geste se lit déjà par la caméra (accroupi, regard vers le bas, petits mouvements) et par la chose qui change.

### 15.5 Ce qui n'est pas vérifié

- Rien n'a tourné avec le vrai Claude : la qualité de ses `etapes` et de ses `ramasse`, et le respect de « pas de forme à soi quand le modèle existe », restent à voir. Le Claude simulé de `tools/demo.mjs` répond exprès mal (trois boules huit fois trop grandes) : c'est la bibliothèque qui fait l'image.
- Tout a été rendu en logiciel (SwiftShader), jamais sur un GPU ni sur le téléphone de Toine.
- Pendant un façonnage, un état intermédiaire peut avoir plus de formes que le résultat (16 contre 8) : si le moteur est presque plein (64 formes), la chose peut disparaître le temps de cet état (`buildShapes` saute un objet qui ne tient pas).

### 15.6 Le parcours joué devant du monde : petite, énorme, bonhomme (retour de Toine, Samsung, v3, vrai Claude)

« La crotte géante ressemble à rien » : un volume brun lisse qui remplit la moitié de l'écran, vu de tout près ; puis un bonhomme géant, caméra collée dessus, ni bras ni yeux. Rejoué avec l'ancien code (monde de papier, Claude simulé qui nomme les choses comme un vrai) :

- **Le modèle ne servait pas** dès que Claude nommait la chose autrement : « bouse », « merde », « étron » n'étaient pas dans ses mots, ni dans `PETIT_CORPS` ; la chose venait alors des formes de Claude, bornées à 6 m (× 2,5 pour « géant »). Et « géante » (féminin) ne déclenchait même pas « énorme ».
- **Rien ne garantissait de la voir entière** : `planCadrage` visait le sixième de l'image, sans vérifier qu'une grande chose y tenait ; le corps pouvait rester dans le cercle d'une chose posée « dessous » ; la recette `pate-organique` d'une chose faite en cours de partie n'était jamais chargée (elle retombait en « mat », lisse).
- **Le bonhomme visait la mauvaise chose** : l'id que propose Claude (la petite, essai) passait avant la phrase du joueur.

Corrigé, sans aucun cas propre à la crotte (des données et des règles générales) :

- **Reconnaissance** (`modeleNomme`) : le premier nom, sinon un mot du modèle dans le nom, la description ou la phrase du joueur (sauf modèle ramassable). Mots élargis dans `modeles.json`. « énorme, géant(e), gigantesque, colossal, monstrueux… » (`ENORME`) : facteur du modèle (`echelle.enorme`, `gros`, `petit`), toujours borné par `max_m` ; sans modèle, × 2,5 seulement si la nature de la chose est connue (`bornesTaille`). Crotte : petite ≈ 12 cm, énorme ≈ 77 cm.
- **Pose** (`horsDuCorps`, `placeLibre`) : plus large que 25 cm, une chose est posée DEVANT lui (son rayon + marge + 25 cm), jamais sur une autre chose ni sur un obstacle connu. `planTrajet` : un corps qui se trouve dans une chose en sort d'abord (`sortie`).
- **Cadrage** (`planCadrage(taille, oeil, haut)`, `tientDansImage`) : la projection équidistante du capteur ; il dézoome, puis recule et se relève jusqu'à ce que la chose tienne ENTIÈRE avec 20 % de marge, en portrait (téléphone) comme en 16/9 (ordinateur). Testé de 5 cm à 3 m. Le cadrage du résultat d'un façonnage repart de la nouvelle envergure.
- **Façonner « avec », « avec ça », « fais-en un »** (`designerTrace`) : la phrase désigne (« la grosse », « la petite »), sinon la DERNIÈRE chose faite, même si Claude propose un autre id (`cible_corrigee`). Un modèle `transforme` peut dire son `besoin` (« des bâtons et des cailloux ») : s'il n'est pas dans la réponse, il décide seul d'aller le chercher (`chercher_seul`).
- **Matière du bonhomme** : `dominante` prend la matière qui fait le plus de VOLUME (avant : la paire matière-couleur la plus fréquente) ; la page recharge les recettes quand une chose en nomme une pas encore chargée.
- **Lisible à grande échelle** : le boudin a 21 segments de couleurs alternées, et `pate-organique` a une couche de bosses plus large (échelle 14 au lieu de 260) en plus du grain.

Tests : `tests/demo.test.mjs` (« parcours de la démo », quatre formulations du joueur × trois réponses de Claude, et le cadrage de 5 cm à 3 m). Dans la page : `node tools/demo.mjs`, scénario par défaut, scène 09 (`PHRASES='…|…|…'` pour d'autres phrases).

## 16. Le corps ne traverse rien

Demande de Toine : le personnage ne doit jamais passer à travers un rocher, un tronc, un mur, une chose fabriquée, dans aucun déplacement.

- **Trajet** (`planTrajet`, `src/meneur.js`, pur) : de la position du corps vers une cible, arrêt à une distance donnée, sur des obstacles en cercles. Un obstacle sur le chemin est contourné par un point de passage à côté de lui (le côté le plus court d'abord) ; une cible dans un obstacle, ou un passage impossible, et il s'arrête devant (`bloque`) et le dit (« Je peux pas passer : un rocher, juste là. »). Une chose qu'on rejoint ou qu'on cadre n'est pas contournée : on s'arrête à sa surface plus la marge. Marge : `MARGE_CORPS` = 0,35 m. Servent : `rejoindre`, `cadrer`, `monter`, `chercher`.
- **Obstacles connus** (`obstaclesConnus`, `src/main.js`) : troncs (`arbreA`), perches (`percheB`) et blocs (`blocGres`) recopiés de `monde.glsl` en flottants 32 bits (MÊMES FORMULES, des deux côtés), et les choses de la fiche. Les éléments de semis (murs, tombes, voitures) ne sont connus que de la sonde du moteur.
- **Pendant la marche** (`moveBy`) : la sonde du moteur (lue en octets, jamais en flottants), comme avant, puis les obstacles connus : le corps est repoussé à la marge s'il allait y entrer. Une marche dirigée bloquée plus de 0,6 s s'arrête et il le dit (avant : il tournait au hasard, ce que fait encore la flânerie). En marche arrière et accroupi, mêmes règles. Monter à un arbre : contre le tronc, à la marge.
- **Moteur v3** : la sonde `v3_sonde.frag` est désormais compilée dès que le v3 tourne (avant : seulement avec l'option `v3sonde`) ; sans elle et sans lanceur de rayons, il n'y avait aucune collision en v3.
- Tests : trajet droit vers un rocher (contourné), cible dans un rocher (arrêt devant, à la marge), rejoindre une chose derrière un rocher et marche forcée droit dessus dans le monde de papier. Dans la page : `tools/demo.mjs`, dernières captures (`10-obstacle-avant`, `11-obstacle-pendant`, `12-obstacle-apres`).

## 17. Retours du vrai Claude sur PC (20 novembre 2026) : la boule blanche, la demande tenue, derrière lui, les mains à l'ouvrage

Toine a joué la démo sur son PC (Chrome, RTX, moteur v3, 2 500 000 grains, scène 09, graine du monde 4821) avec le vrai Claude. Cinq retours ; tout ce qui suit est générique (aucun objet ni aucune phrase en dur).

Vérification : `npm test` (`tests/demo.test.mjs`, fin du fichier : un Claude « méchant » qui répond par du texte seul, retouche la petite, fabrique de la terre ou refuse, et pose « devant ») ; `node tools/demo.mjs` (Claude simulé méchant par défaut, `GENTIL=1` pour l'ancien ; graine de la fiche ; planche du façonnage dans `out/demo/planche.png`) et `VUE=pc node tools/demo.mjs` (tout en 960 × 600, 16/10, dans `out/demo-pc/`). `balade.pauseQuand(type, t)` fige le corps à un instant précis d'un geste (planche). Remarque : `tools/demo.mjs` passait `graine: 7`, mais c'était la graine du meneur (ses tirages), pas celle du monde : le monde avait déjà la graine de la fiche (4821). L'outil passe désormais la graine de la fiche aux deux.

### 17.1 « Une grosse boule blanche quand on regarde la crotte »

Cause : la scène 09 sème des « éclats et cailloux de grès » (jusqu'à 30 cm, recette claire mouchetée) et des « branches mortes » (capsules de 2,2 m). Rien n'empêchait une chose posée par le porteur de tomber dans, sous ou juste derrière un de ces éléments, ni le cadrage de viser à travers ; accroupi, avec le zoom de cadrage, un éclat entre la caméra et la crotte remplit l'image (l'« œuf blanc-gris moucheté, liseré brun » : l'éclat, et la crotte derrière ; le « bâton gris » : une branche).

- **Les semis en JS** (`semisDist`, `src/main.js`) : `semisGrille`, `semisElem`, `semisLocal`, `sdSemis` de `monde.glsl` recopiés en flottants 32 bits, lus dans la même texture de formes. MÊMES FORMULES, à modifier des deux côtés. Comparés à la sonde du moteur (`balade.semis`, `balade.sonde`).
- **Poser** : `semisSous(x, z, rayon, haut)` (17 points × 3 hauteurs) est passé à `placeLibre` (argument `occupe`) : la chose glisse autour du porteur jusqu'à une place libre de tout élément de semis, comme elle le faisait déjà pour les troncs, les rochers et les autres choses. Le tas rapporté (§15.3) aussi.
- **Cadrer** : `pointDeVue` vérifie qu'il n'y a RIEN entre l'œil et la chose (`vueDegagee` : quatre visées, semis, troncs, rochers, autres choses) ; sinon il se décale autour d'elle (pas de 22°, puis un peu plus loin), en évitant de se tenir dans un élément. `balade.vue(id)` le vérifie dans la page.

### 17.2 « Elle veut pas faire une énorme crotte, elle reste petite et me dit qu'elle va faire avec de la terre »

Cause : le vrai Claude a répondu à côté (texte seul, puis une autre matière). La page suivait sa réponse.

- **La page tient la demande** (`tenirDemande`, `src/meneur.js`) : une phrase qui demande de FAIRE une chose NOUVELLE (« fais », « une ») d'une nature connue de la bibliothèque (ni ramassable, ni « transforme ») : si la réponse ne la fabrique pas (texte seul, refus poli, autre chose, retouche d'une ancienne), la page la fabrique quand même, avec le `ou` du modèle et les gestes qui vont avec (s'accroupir) ; la retouche d'une ancienne est annulée ; sa pensée devient une phrase où il râle et le fait (`demande_tenue` dans la trace).
- **La taille vient de la phrase du joueur** : `formesModele` lit d'abord ses mots, puis ceux de Claude (« énorme » du joueur l'emporte sur « petite » de Claude).
- **Consigne resserrée** : « la chose demandée, telle que dite : même nature, même matière, même taille ; une nouvelle si on dit « une » ; tu peux râler, jamais la remplacer par autre chose ni retoucher une ancienne ».

### 17.3 « Un caca de 5 kg, faut qu'il soit BEAUCOUP plus gros »

Une donnée de plus dans la règle d'échelle du modèle : `exagere` (2 pour la crotte) multiplie l'envergure réelle tirée de la masse. 5 kg : 58 cm (31 cm au volume réel) ; 20 kg : 92 cm ; « énorme » (facteur 5,8) : 81 cm ; `max_m` relevé à 1,2 m. Le cadrage entier (`planCadrage`) suit.

### 17.4 « Quand elle fait ses besoins, il apparaît DEVANT elle »

Cause : `horsDuCorps` posait DEVANT lui toute chose de plus de 25 cm (§15.6), et le `ou` de Claude (« devant ») passait.

- **La donnée du modèle l'emporte** : le `ou` du modèle (`"dessous"` pour la crotte) remplace celui de Claude, et sa distance (`pose_corrigee`).
- **Dessous = derrière les talons** (`horsDuCorps(…, ou)`) : à rayon + 20 cm derrière la caméra (plus la marge du corps pour une grosse chose), quelle que soit sa taille ; jamais dans le corps. Il ne la voit pas apparaître ; quand il la montre (`cadrer`), il se relève, fait un pas, se retourne et la cadre entière. Une place déjà loin du corps (il a bougé depuis le geste) est gardée.

### 17.5 « On voit pas les bâtons bouger et le bonhomme se faire » : le façonnage continu, les mains à l'ouvrage

Avant : cinq états qui se remplaçaient toutes les 1,1 s. Maintenant :

- **Le geste** (`gesteFaconnage`, `etatGeste`, `src/meneur.js`, purs, testés) : une suite de transitions interpolées image par image (positions, tailles, angles, couleurs) entre la chose telle qu'elle est et le résultat : la matière dominante est **pétrie** en une boule (à son volume), **divisée** en autant de masses que le résultat en compte, **roulées** au sol (elles grossissent, leur matière tourne avec elles), **empilées** une à une (en arc) ; chaque ajout d'une autre matière est **pris** dans le tas rapporté (même matière, le plus gros d'abord : il quitte le tas, la main le porte, il se plante), sinon il vient de la main ; puis il **tapote**. 8 à 12 s (11 s pour le bonhomme). Générique : seules les matières et les formes de la chose et du résultat comptent. Les états intermédiaires que donne Claude (`etapes`) ne servent plus à la page (ils restent dans la trace et le monde de papier).
- **Les mains** (`objetMains`, `geste1`, `src/main.js`) : deux avant-bras (une capsule de manche) et deux mains (une paume en boule aplatie, un pouce en capsule), 6 formes, attachés au corps sous la caméra ; leur description est une donnée (`src/modeles.json`, `corps.mains` : épaule, manche, paume, pouce, repos) et la peau une recette (`peau`, `src/matieres.json`). Elles pressent des deux côtés en rythme (pétrir), roulent sur le dessus (diviser, rouler), portent ce qu'on pose, vont saisir dans le tas puis portent, tapotent ; elles glissent d'une cible à l'autre, avec un léger tremblé, jamais figées. L'objet des mains n'est pas dans la fiche : ni obstacle, ni perçu par le meneur ; `buildShapes` le range en dernier.
- **Le tas rapporté** est posé devant la chose, un peu de côté, côté porteur : dans le champ pendant le geste (avant : à côté d'elle, hors du cadre en portrait).
- **La caméra** suit l'ouvrage (se penche vers ce qui bouge, un peu de bougé) ; à la fin il se relève, recule et cadre en pied (§14.2).
- **Chercher** : accroupi, la main droite va au sol, ramasse, revient (`ramasser`, deux fois).
- **Budget fixe** : la chose en cours de geste prend au plus ce qui reste des 64 formes (autres objets visibles, mains : 6) ; au-delà, les plus petites formes qui se résorbent ne sont pas rendues. `buildShapes` ne déborde plus dans les lignes des semis (il bornait à `SH_ROWS` au lieu de `SEM0`). Rien n'a été ajouté aux shaders.

### 17.6 Pas vérifié, peu convaincant

- Rien n'a tourné avec le vrai Claude ni sur un GPU : rendu logiciel (SwiftShader), Claude simulé.
- Les mains restent des formes simples (pas de doigts, pas de fondu entre paume et poignet : le v3 ne suit pas `lisse`) ; de près, elles peuvent faire mannequin. Le grain et le flou du capteur aident.
- La caméra est celle d'un téléphone sur la poitrine : les avant-bras partent d'un point fixe sous elle ; un vrai corps bouge les épaules.
- Pendant le geste, si les 8 places d'objets sont prises, la dernière cède sa place aux mains le temps du geste.


## 18. « C'est bouché » : la marche demandée (20 novembre 2026)

Retour de Toine (téléphone, vrai Claude, scène 09, graine 4821) : « Après la première crotte elle veut pas avancer de 5 m comme je demande, elle dit que c'est bouché. »

**Cause** (reproduite dans le monde de papier et dans la page, `tests/bouche.test.mjs`, `node tools/bouche.mjs`) : la marche que donne Claude (`marcher`, « avance de 5 mètres ») allait tout droit, sans trajet (`moveBy`). Juste après la crotte, il la cadre de près : elle est devant lui, à 0,4-0,7 m, donc à moins de sa marge (rayon + `MARGE_CORPS`). Chose de la fiche, elle est un obstacle connu : à chaque pas le corps était repoussé sur le cercle, il n'avançait plus, et au bout de 0,6 s l'action `bloque` disait « Je passe pas, là. C'est bouché. ». Il restait aussi accroupi. Dans la page (`DTMAX=0.033 DECALE=0.15 node tools/bouche.mjs <ancienne page> 'avance de 5 mètres'`), crotte à 0,6 m exactement en face, pas d'image de téléphone (30 i/s) : 0,15 m puis « Je passe pas, là. C'est bouché. », accroupi. Avec les grands pas du rendu logiciel (`dtMax` 0,4 s), le corps glissait autour du cercle (le bruit numérique décide du côté) et l'essai passait : c'est pourquoi `tools/demo.mjs` ne l'a jamais vu. À 0,40 m (cadrage en 390 × 780, juste dans la marge), l'ancien `moveBy` ignorait la crotte : il marchait dessus, accroupi. Les éléments de semis (éclats, branches couchées) n'y étaient pour rien : ils ne sont pas des obstacles connus et la sonde, à 75 cm du sol, passe au-dessus.

Ce qui change, générique :

- **Ce qui s'enjambe** (`enjambable`, `src/meneur.js`) : un obstacle connu plus bas que `ENJAMBE_M` (35 cm) et soit plat (moins de `ENJAMBE_PLAT_M`, 15 cm), soit plus étroit qu'une enjambée (`ENJAMBE_LARGE_M`, 40 cm) ne bloque jamais : `moveBy` le traverse, les trajets l'évitent d'un pas de côté (`MARGE_PIEDS`, 12 cm) quand c'est possible, sinon passent dessus (`planTrajetSouple`). Ce qui est haut ou large (tronc, bloc de grès, l'énorme crotte, le bonhomme, une grosse galette) se contourne à la marge du corps, comme avant. Les obstacles connus portent leur hauteur (`haut`) ; un tronc n'en a pas (il est haut). `rejoindre`, `cadrer`, `chercher`, `monter` passent aussi par `planTrajetSouple`.
- **« Avance de N mètres », « recule »** (`planMarche`, pur) : la page ne met plus `marcher` dans la file, mais `marche`, dont le trajet se calcule au moment de partir (après un demi-tour, par exemple) : il se relève et dézoome, puis marche N m dans cette direction générale. Tout droit jusqu'à ce qui est haut devant lui s'il l'atteint à peu près au bout ; sinon le trajet contourné ; sinon des directions voisines (±15° à ±60°), la première qui fait tout ; sinon celle qui avance le plus dans la direction demandée. En arrière, il garde son cap et recule. Il reprend le cap demandé à la fin.
- **Ce qu'il dit** (`texteMarche`) : rien s'il a fait la distance (à `toleranceMarche` près : 0,7 m ou 15 %) ; « J'ai fait trois mètres, après c'est un rocher. » s'il a fait moins ; « Je passe pas, là. C'est bouché. » seulement s'il ne peut pas faire un mètre dans aucune direction voisine (±60°). La page le dit à la fin de la marche (`finMarche`), d'après la distance réellement faite.
- **Ce que seule la sonde connaît** (murs, tombes, voitures des semis) : une marche demandée arrêtée par la sonde essaie à +30°, −30°, +60°, −60° avant de s'arrêter et de dire ce qu'elle a fait.
- **Monde de papier** : il connaît les semis (`semis` : cercles bas), traduit `marcher` comme la page (`planMarche`) et note les marches (`monde.marches`). `balade.marches()` donne la même chose dans la page.

Vérification : `npm test` (`tests/bouche.test.mjs` : la forêt de la fiche 09 en papier, tirée de la graine 4821 : troncs, blocs, plus de 300 branches couchées et éclats ; la cause reproduite ; « avance de 5 mètres » après la petite crotte cadrée, debout, sans zoom, sans marcher dedans ; reculer, « va vers l'arbre », « reviens », « fais demi-tour et avance » ; après l'énorme, après le bonhomme ; 30 m le long du sentier et 10 m à travers bois ; `planMarche` pur : branche en travers, départ collé à une petite chose, rocher, mur continu, muré). Dans la page : `node tools/bouche.mjs [page]` (un essai par page neuve ; positions avant/après, distance, ce qu'il dit, `out/bouche/rapport.json`) ; avec l'ancienne page, « avance de 5 mètres » reproduit le refus.

Pas vérifié : le vrai Claude, un vrai téléphone, le lanceur de rayons (`V3=0` : sa compilation en rendu logiciel n'aboutit pas en 40 min ; sa sonde, à 75 cm du sol, ne devrait pas voir ce qui est bas). Le trajet contourné reste fait de points de passage autour de cercles (`planTrajet`) : dans un amas d'obstacles serrés il peut renoncer plus tôt qu'un vrai marcheur ; il dit alors ce qu'il a fait.


## 19. « Déplace-toi, puis fais » : la phrase est une séquence (20 novembre 2026)

Retour de Toine (vrai Claude, scène 09) : « Je lui ai dit de se déplacer et faire la crotte de 20 kg, mais elle est apparue à côté de l'autre ! » Il y avait déjà une première crotte.

**Cause** (reproduite dans le monde de papier, `tests/ordre.test.mjs`, et dans la page, `node tools/ordre.mjs`) : la place de la chose était prise AU TOUR DE VOIX. `commander` émettait `{op: "reserver"}` à la réception de la réponse, à la position du corps à cet instant, avant toute marche ; la création, plus tard, réutilisait cette place (§14.3, et « une place déjà loin du corps est gardée » du §17.4). Avec un Claude qui donne la marche puis la chose, dans l'ordre, la grosse apparaissait quand même à l'ancien endroit (1,6 m de la première dans le monde de papier). S'y ajoutaient : un Claude qui ne renvoie que l'objet (ou que du texte, `tenirDemande`) faisait oublier le déplacement (et `tenirDemande` mettait l'accroupi devant ce qui restait) ; « fais une crotte puis recule de 3 m » sans marche dans la réponse ne reculait pas. `placeLibre` n'y était pour rien (il écartait seulement de 10 cm d'une autre chose).

Ce qui change, générique (aucun objet ni aucune phrase en dur) :

- **L'ordre se lit dans la phrase du joueur** (`ordreDemande`, `src/meneur.js`, pur) : un verbe qui déplace (« déplace-toi », « bouge », « éloigne-toi », « va là-bas », « avance de 8 m », « recule », « va près de l'arbre », « mets-toi près du rocher », « pars »…) et un verbe qui fait (« fais », « chie », « pose »…, pas « fais demi-tour »), dans l'ordre de la phrase ; « après avoir… / après t'être… » fait passer la proposition qui suit en premier, « avant de… » la fait passer après. Il en sort le déplacement : `marcher` (distance dite), `rejoindre` (arbre, rocher) ou `deplacer` (sans distance ni cible).
- **La page tient la séquence** (`sequencer`, appelé pour tout tour qui fabrique) quelle que soit la réponse : le déplacement que dit la phrase est ajouté s'il manque (objet seul, texte seul) ou remplace celui de la réponse s'il diffère (« déplace-toi » : pas les 2 m de Claude) ; il est mis avant le geste (« déplace-toi et fais ») ou après (« fais puis recule »), même si Claude répond dans le désordre. Trace : `sequence`. S'il a fallu l'ajouter, sa pensée finit par « J'y vais d'abord. ». Le geste immédiat (s'accroupir pendant que Claude répond, §14.8) ne part pas quand la phrase dit de se déplacer d'abord.
- **La place se prend au geste** : `{type: "poser", ref}` est un marqueur de la file, juste avant le geste ; `reserver` porte `au_geste`. Quand la file atteint le marqueur, la place se calcule là où il est (même `placePose`, même `horsDuCorps`). Une chose qui arrive avant (accessoiriste rapide) attend le marqueur ; une qui arrive après garde la place du geste, même s'il a bougé entre-temps SANS qu'on le lui demande (flânerie). Si la file est vidée avant le marqueur (nouvel ordre, « stop »), la chose est posée là où il est. Si la marche est raccourcie par un obstacle, le geste se fait là où il est arrivé.
- **« Fais X puis éloigne-toi »** : X ici ; `{type: "attendreObjet", ref}` après le geste le fait attendre la chose (20 s au plus) avant de partir. L'accessoiriste qui ne rend rien envoie `{op: "abandon", ref}` : il n'attend plus.
- **« Déplace-toi » sans distance ni cible** (`deplacer`, `planDeplacement`, pur) : au moins 4 m et 2,5 fois l'envergure de ce qu'il va faire ; direction : le long du sentier d'abord (devant, puis derrière), puis tout autour, en écartant celles qui vont vers une chose toute proche (celle qu'il vient de cadrer) ; la première qui fait la distance et arrive loin des choses déjà là l'emporte. Puis c'est une marche du §18.
- **Jamais contre une chose déjà là** (`ecartChoses(r1, r2)` = r1 + r2 + max(0,5 ; 1,5 (r1 + r2))) : `placeLibre` l'applique aux obstacles marqués `chose` (les choses de la fiche, dans `obstaclesConnus` et le monde de papier) ; un tronc ou un rocher garde l'ancien écart. Sauf si le joueur le demande : « à côté de l'autre », « contre », « sur » une chose désignée → `creer` porte `contre: id`, la chose est posée tout contre celle-là, côté porteur.
- **« Fais-en une autre »** : sans nature nommée, `tenirDemande` prend celle de la dernière chose faite (si c'est un modèle qui se fabrique).
- Page : `enqueue` accepte 12 actions (8 gestes et les marqueurs) ; `window.balPoses` garde où chaque place a été prise (essais).

Vérification : `npm test` (`tests/ordre.test.mjs` : quatre réponses de Claude simulées, objet seul, marche puis objet, objet puis marche, texte seul, × « déplace-toi et fais une crotte de 20 kg », « avance de 8 mètres puis fais une énorme bouse », « va près de l'arbre et fais-en une autre », et « fais une crotte puis recule de 3 m », avec une première crotte déjà là : distance entre les deux choses, place prise après la marche, ordre des événements dans le journal du monde de papier ; « fais-en une autre » sur place, « juste à côté de l'autre » ; marche raccourcie par un mur ; accessoiriste lent et corps déplacé ensuite ; `ordreDemande` et `planDeplacement` purs). Dans la page : `node tools/ordre.mjs` (`CLAUDE=objet|marche_objet|objet_marche|texte`), `out/ordre/rapport-*.json` et une capture par essai.

Pas vérifié : le vrai Claude, un vrai téléphone. La lecture de l'ordre est faite de motifs de mots : une phrase tournée autrement (« une fois là-bas, fais… » sans verbe de déplacement) peut lui échapper ; l'ordre de la réponse de Claude reste alors celui qui compte, mais la place se prend toujours au geste.


## 20. « Il la fait en s'accroupissant, et il s'étonne » : l'exploit demandé au corps (20 novembre 2026)

Retour de Toine (vrai Claude) : « Si je dis de faire une crotte de 20 kg, il doit pas dire qu'il va utiliser de la terre ; il faut qu'il la fasse en s'accroupissant et qu'il soit étonné d'avoir réussi à le faire. » La page fabriquait déjà la chose à la bonne taille (§17.2), mais la pensée restait celle de Claude, qui rationalisait (« je vais plutôt la modeler avec de la terre ») parce que 20 kg lui paraissait impossible. Le journal réel le montre partout : motif du sas (« faisable avec de la terre »), pensée, `faits` mémorisés, nom (« crotte géante de terre »), description, pensées des suites (« Vingt kilos de forêt… »).

Le spectacle voulu est l'inverse : c'est absurde, il le fait quand même, avec son corps, et il n'en revient pas. Tout est générique : des données dans `src/modeles.json` (`exploit`, et `origine: "corps"` d'un modèle), aucun objet ni aucune phrase dans le code.

- **Le ton, à la source** : la consigne du meneur dit le MONDE ÉLASTIQUE (ce que la voix demande au corps est possible, même démesuré ; le sas dit « possible », jamais « faisable avec… » ; ni autre matière, ni autre moyen, ni « faire semblant » ; il peut râler, douter, craindre l'effort, mais il le fait avec son corps) et le déroulé : `pensee` AVANT (courte, incrédule ou résignée), `apres` (champ nouveau du contrat de sortie : sa réaction en découvrant le résultat). L'accessoiriste : la chose est faite de ce qui a été demandé, son nom ne dit pas d'autre matière, les pensées de la suite ne l'expliquent pas.
- **La démesure** : le facteur d'échelle de la chose par rapport à la référence de son modèle (`formesModele`), en trois paliers (`exploit.paliers` : normal < 1,6 ≤ gros < 4 ≤ démesuré). Petite crotte 0,85 ; grosse 3,5 ; 5 kg 4,2 ; énorme 5,8 ; 20 kg 6,6.
- **Le garde-fou** (`tenirExploit`, après `tenirDemande`) : pour une chose d'un modèle dont l'`origine` est le corps, tout ce qui annonce une autre matière ou un autre moyen (`substitution` : les `substituts` et `moyens` de la banque, hors des mots du modèle lui-même) est corrigé : la pensée devient une phrase d'« avant » de la banque (choisie par la graine, selon le palier ; aussi si elle est vide ou si c'est un refus), le nom reprend celui du modèle et la taille dite, la description reprend la phrase du joueur, les `faits` fautifs ne sont pas mémorisés (sinon Claude s'en resservirait), le motif du sas devient « possible », l'intention fautive est effacée ; le nom que rend l'accessoiriste et les pensées de sa suite aussi. L'aperçu de la pensée (flux) d'une demande au corps qui parle d'une autre matière n'est pas montré. Une pensée recevable de Claude est gardée, même quand la page a dû fabriquer la chose à sa place (`demande_tenue`). Trace : `exploit`, `exploit_corrige`, `apercu_jete`.
- **Le déroulé** (`gesteExploit`) : accroupi, puis l'effort (`{type: "effort", secondes, force}`, de 3 s pour une chose normale à 10 s au plus : `3 + 2,4 log2(facteur)`), coupé de souffles brefs (« Hhhnn… », `{type: "penser", bref}`) dès le palier « gros ». Le marqueur de pose (§19) est mis juste après l'effort : la chose tombe derrière lui à la fin. Puis il se relève ; le cadrage (§17.4) le fait se retourner et la cadrer entière. Dans la page, pendant l'effort, la caméra tremble et s'enfonce par à-coups (`pose()`, amplitude selon `force`).
- **L'étonnement** : au-delà du palier normal, après le cadrage, une pensée de réaction mise dans la file (`{type: "penser"}` après `cadrer`, émise par `montrerObjet`), donc dite quand il l'a vue, jamais avant, une seule fois par chose (à sa création). Celle de Claude (`apres`) si elle est recevable, sinon la banque (`exploit.apres`, `{masse}` : « Vingt kilos. C'est sorti de moi, ça. Comment je tiens encore debout ? »). Rien pour une chose normale. Vaut pour toute chose d'un modèle fabriquée démesurée, pas seulement ce qui sort du corps (l'effort accroupi, lui, est pour ce qui sort du corps).
- **Le bruit** (`docs/bruitages.md`) : chaque effort du geste porte `exploit: {palier, facteur}` ; la page y cale les bruits que décrit `exploit.bruit` du modèle (une recette de `src/bruitages.json`, synthèse et prises libres transformées) : pour une petite, deux ou trois petits bruits brefs et aigus ; pour une chose démesurée, un ou deux brefs entre les souffles, puis le gros (2,5 à 5 s, 45 à 90 Hz, vibrato, ratés, fin ridicule, micro qui sature) qui finit juste avant la pose, dans un dernier effort allongé pour lui ; la caméra tremble avec lui ; aucune pensée n'est dite par-dessus ; la chose fait un bruit de chute en tombant.
- **Page** : `enqueue` accepte `effort` et `penser` ; `window.balPensees` garde chaque pensée, son instant, sa source et la file à ce moment (essais).

Vérification : `npm test` (`tests/etonne.test.mjs` : un Claude simulé qui répond « avec de la terre » (sas, pensée, nom, faits, suite), « je ramasse de la boue et je modèle » (sans fabrique), une pensée correcte avec `apres`, ou rien, × « fais une crotte de 20 kg », « fais une énorme bouse », « fais une petite crotte » : aucune pensée fautive affichée, ni mémorisée ; ordre accroupi → effort → posée → relevé → cadrage → réaction dans le journal du monde de papier ; effort long et souffles pour la démesure ; rien pour la petite ; une seule réaction ; variantes de la banque selon la graine). Dans la page : `node tools/demo.mjs` (journal des pensées de l'énorme dans `out/demo/pensees.json`).

Exemple, « fais une crotte de 20 kg », Claude qui répond « Vingt kilos ? Je vais la mouler avec de la terre. » (graine 3, monde de papier) : à 0 s « Énorme… comme ça, d'un coup ? Je vais y laisser ma peau. … Allez. » ; accroupi ; +3,8 s « Hhhnn… » ; +7,3 s « Allez… allez… » ; +10,8 s elle tombe derrière lui ; il se relève, se retourne, la cadre ; +17 s « Vingt kilos. C'est sorti de moi, ça. Comment je tiens encore debout ? ».

Pas vérifié : le vrai Claude (le ton qu'il prendra avec la nouvelle consigne, la qualité de ses `apres`), un vrai téléphone. La détection des substituts est faite de mots : une pensée correcte qui parle des feuilles où il s'accroupit sera remplacée (sans dommage) ; une rationalisation tournée sans aucun de ces mots passera.

## 21. « Il a pas fait le bonhomme avec la dernière, et elle s'est transformée en énorme » (20 novembre 2026)

Journal réel (vrai Claude, mode debug, promenade libre) : « pose nous un gros étron » (fab-1, avec une suite de Claude), « je veux une crotte de 20KG ! » (fab-2), puis la suite de fab-1 ajoute une MOUCHE de 13 cm (fab-3, source `suite`), puis « fait un bonhomme avec des batons et des cailloux » : le façonnage a pris fab-3, « la dernière chose faite », et en a fait un bonhomme (unité 0,01 m).

- **La cible implicite** d'un façonnage (`designerTrace`) : la phrase désigne (« la petite », « la grosse », « la première », « l'autre », un nom), sinon la dernière chose que le joueur a DEMANDÉE (`demandee` : créée par un tour de voix, jamais une chose de source `suite` ni `ramasse`), avec assez de matière pour le modèle (`matiere_min_m` du modèle « transforme », une donnée). « Énorme » qui qualifie le modèle façonné (« un énorme bonhomme ») ne désigne rien. « fait un bonhomme avec des bâtons et des cailloux », sans « avec ça », façonne la dernière chose demandée s'il y en a une ; sinon c'est une chose nouvelle.
- **La phrase avant l'id de Claude** (`designer`) : désignation explicite, puis le nom dit, puis seulement l'id proposé ; pour un façonnage, l'id de Claude ne compte jamais (`cible_corrigee`).
- **Une chose en cours de fabrication** (l'accessoiriste y travaille) compte comme la dernière : il va chercher ce qu'il faut, et le façonnage part sur elle quand elle est posée (`faconnage_attend`, puis `faconnage` avec `attendu`).
- **Le lieu** : s'il est à plus de 2,5 m de la chose, il la rejoint d'abord (on le voit y aller), puis va chercher près d'elle, revient, façonne (`rejoint_d_abord`).
- **La taille** : le façonnage garde le volume de la chose (`formesTransformees`, règle `volume` du modèle) ; aucun mot de taille ne s'y applique.
- **L'ambiance des suites** (mouche, corneille) reste vivante mais part la première quand le budget du moteur est plein (`liberer`), et n'est jamais une désignation implicite ; elle n'est jamais cadrée (elle ne l'était pas).

Vérification : `npm test` (`tests/bonhomme-cible.test.mjs` : le journal réel rejoué, mêmes réponses de Claude, suites qui ajoutent mouche et corneille, en mode debug et normal ; trois choses posées dans trois ordres et tailles (deux crottes au plus : trois modèles de 23 formes dépassent les 64 formes du moteur et la plus ancienne serait recyclée ; la troisième est un tas de feuilles de Claude) × cinq formulations × trois Claude (bon id, mauvais id, fabrique au lieu de modifie) : la bonne cible, le volume de sa matière gardé à 15 % près, les autres choses intactes (taille et place) ; désignation explicite ; chose en cours de fabrication ; sans chose demandée). Avant la correction, le journal rejoué fait le bonhomme dans la mouche.

Pas vérifié : le vrai Claude, la page sur ce scénario (le monde de papier seulement ; `tools/demo.mjs` couvre « fais comme un bonhomme de neige avec » après trois crottes).

## 22. « Il faut qu'il soit un peu dégoûté de faire un bonhomme avec sa propre crotte », puis « il peut vomir » (20 novembre 2026)

Avant : « fais un bonhomme de neige avec » donnait une pensée neutre ou amusée, puis 11 s de façonnage en silence. Tout ce qui suit est générique : des données (`src/modeles.json`, section `degout`, `repugnance` d'un modèle, le modèle d'ambiance de la nausée, la recette `flaque-organique`) et des règles ; aucun nom d'objet ni aucune phrase dans le code.

- **La donnée** : `repugnance` (0..1) sur un modèle (0,9 pour celui d'origine corps). Elle est gardée par la chose créée (`repugnance`, `facteur`, `origine` dans `crees`), donc par ce qu'on en façonne. **La règle** (`intensiteDegout`, pure) : intensité = répugnance × taille (facteur d'échelle par rapport à la référence du modèle, en log) × fraîcheur (âge de la chose) × soi (1 si elle vient de lui, sinon `pas_de_soi`). Paliers `leger` (petite : 0,36) et `fort` (énorme : 0,86) ; en dessous de 0,15, rien. Une chose neutre (feuilles, neige, argile d'une fiche) n'a pas de répugnance : rien de ce qui suit.
- **À la source** : quand une chose répugnante est là, la consigne ajoute « CORPS ET DIGNITÉ » (il obéit, ni refus, ni gants, ni outil, ni autre matière ; il est dégoûté et le dit, à la première personne, avec humour et retenue ; il peut protester, négocier une seconde, retenir sa respiration) et le champ `en_faisant` : `{avant, contact, pendant: [1 à 3], autre, fin}`.
- **Le déroulé** (`habillerDegout` dans le meneur, `planDegout` pur, joué par la page et le monde de papier) : avant le geste, une pensée (`penser` avec `espace`), puis `hesiter` (la caméra recule un peu, le regard fuit vers le haut et de côté, puis revient) ; pendant le geste, des pensées accrochées aux phases PAR LEUR NOM (`contact` au début de « petrir », `pendant` pendant le reste, `autre` quand la main « prend » autre chose), au plus une toutes les `espacement_s` (3 s), plus nombreuses au palier fort ; des regards détournés par à-coups (`detourneA`, ajouté au mouvement de caméra du geste), plus amples selon l'intensité, jamais pendant une prise ; après, `essuyer` (les mains descendent hors du champ et frottent) ; enfin, quand il a reculé et cadré le résultat, la réaction finale (dégoût et fierté malgré lui), une seule fois (`degout_fin`). Les pensées de Claude sont préférées si elles sont recevables (ni refus, ni évitement : `evitements` de la banque) ; `apres` sert de fin à défaut ; sinon la banque, variantes tirées par la graine.
- **La mémoire** : l'humeur (`humeur` du palier : agacement +1 ou +2, confiance −1) et un fait (`memoire` : « … pétri à mains nues : il veut se laver, ne serre la main à personne. ») que Claude reçoit ensuite.
- **La page** : `penser` attend `espace` secondes de jeu depuis la pensée précédente, et qu'aucun gros bruitage ne joue si la page en a un (`window.balSon.occupe()`, sinon ignoré) ; `window.balPensees` note la source (`degout`, `nausee`) et la phase.

### 22.2 La nausée

Au-delà d'un seuil (`degout.nausee` : intensité × contact, le contact étant la durée réelle des phases « petrir », « diviser », « rouler » du geste, rapportée à `contact_ref_s` ; au-dessus de `toujours` 0,8 : toujours ; en dessous de `jamais` 0,62 : jamais ; entre les deux, selon un tirage de la graine), le geste s'interrompt UNE fois, à la fin de la dernière phase de contact (accroché par le nom de la phase, pas par un instant : un geste plus long garde l'accroche). L'énorme : toujours ; une grosse (0,73) : selon la graine ; la petite, une chose neutre : jamais.

Déroulé (6 à 9 s, données `deroule`) : « Non. Non non non. », il lâche (les mains quittent l'ouvrage, la chose reste dans l'état atteint : l'horloge du geste est suspendue), se détourne de 60 à 110° du côté le plus dégagé, à l'opposé de l'ouvrage, fait un petit pas, se penche (la caméra plonge, à-coups), vomit : la chose du modèle désigné par `nausee.modele` (plate, irrégulière, recette `flaque-organique`), créée par le meneur au tour de voix avec la source `ambiance` et gardée par la page (`retenu`) jusqu'à cet instant, est posée devant lui (donc hors de l'ouvrage, `placeLibre`) ; souffle, « Pardon. », s'essuie la bouche (l'avant-bras passe devant la caméra), revient (« On finit. Vite. ») et le geste reprend au même point. L'ambiance n'est jamais « la dernière », « avec ça », ni la cible implicite d'un façonnage (`demandee`) et part la première quand le budget est plein (`liberer`). Humeur : peur +1, agacement +1, et un fait. Bruitage : la page expose `evenementSon("nausee", {intensite, duree, instants})` (`window.balSons`, événement DOM `balade-son`, et `window.balSon.evenement` s'il existe) ; le monde de papier note `son`.

Vérification : `npm test` (`tests/degout.test.mjs` : règles pures ; `planDegout` sur un geste de 11 et de 16 s ; consigne ; petite / énorme × Claude qui donne ou non ses pensées : ordre hésite → façonne → essuie → cadre → réaction unique, phases, espacement, textes de Claude ou de la banque, humeur et fait ; nausée seulement avec l'énorme, dans l'ordre, reprise au même point, flaque hors de l'ouvrage et d'ambiance, façonnage allongé de 6 à 9 s ; tas de feuilles : rien ; pensées fautives remplacées ; « fais un bonhomme avec ça » après : jamais la flaque).

Pas vérifié : le vrai Claude (le ton de ses `en_faisant`), la page sur GPU ; la lisibilité de la flaque et du revers de manche de près. Le seuil de nausée se juge au tour de voix sur l'intensité seule (la chose d'ambiance doit être créée à ce moment) puis sur le geste réel : si le contact réel est trop court, la flaque réservée n'est jamais posée (elle reste comptée, invisible, et part la première). Le joueur peut commenter ensuite (la mémoire le permet) ; le provoquer par une phrase n'est pas fait.

## 23. « On devrait voir le perso saisir la matière et la façonner » : une vraie pâte, des mains qui saisissent (20 novembre 2026)

Demande de Toine : le façonnage montrait des boules lisses et brillantes qui changeaient de taille et de place, et deux avant-bras en tubes sombres terminés par des moufles. Tout ce qui suit est générique (des données et un vocabulaire, aucun objet en dur) ; vérifié sur PC (16/10, qualité complète, moteur v3), en rendu logiciel seulement.

- **Une matière molle, en vocabulaire** (`docs/fiche-de-lieu.md`, formes) : `lisse` (la forme est molle, se fond dans les autres formes molles de l'objet), une forme sans `lisse` dans un objet mou reste dure et la matière remonte en bourrelet autour d'elle, `creux` (la forme creuse la matière : empreinte), `bosse` (bosses molles à l'échelle de la forme, qui tournent avec elle). Rendu par une variante du moteur (`docs/moteur-v3.md`, « Objets mous »). Utilisable par l'IA pour toute matière molle (pâte, boue, neige, argile, chair). Le modèle qui transforme porte `lisse` et `bosse` sur ses parties `@` (mises à l'échelle avec lui).
- **Le geste** (`gesteFaconnage`, `etatGeste`, `src/meneur.js`) garde ses noms de phases (`geste` : petrir, diviser, rouler, poser, prendre, tapoter) et dit en plus ce que font les mains (`op` : petrir, diviser, rouler, poser, planter, presser, lisser) et ce qu'elles tiennent (`tenu`). Pétrir : toute la matière en une boule, mise de côté (la place du résultat reste libre). Puis pour chaque masse du résultat, de la plus grosse à la plus petite : diviser (une poignée arrachée à la boule, reliée par un pont de matière qui s'étire et rompt), rouler (en l'air entre les paumes si elle tient dans les mains, `enMain` 18 cm ; sinon au sol, poussée à deux mains), poser (portée à sa place, appuyée : elle s'écrase un peu en touchant puis se tient, bourrelet de soudure avec celle du dessous) ; la dernière prend tout le reste. Chaque ajout pris dans le tas : une forme allongée est plantée (approchée dans son axe, enfoncée par à-coups), une autre pressée de face. Lisser : les bosses s'adoucissent, les mains reviennent. 12 à 16 s (15 s pour le bonhomme). La matière façonnée est molle pendant tout le geste ; ce qui se résorbe se fond dans la masse.
- **Les mains** (`objetMains`, `mainsGeste`, `src/main.js` ; données `corps.mains` de `src/modeles.json`) : chaque bras part de l'épaule sous la caméra, le bras dans sa manche (dure), le coude placé pour que l'avant-bras (peau) atteigne la main (deux segments) ; la main : paume, pouce en deux phalanges, quatre doigts, tout en peau molle fondue (poignet, jointures) ; 9 formes par main, un objet par main. Poses clés en données (ouverte, coupe, pince, poing, plat : flexion des doigts, écart, pouce), interpolées avec la position. Une main se décrit par sa paume (centre, normale vers ce qu'elle touche, direction des doigts). Les mains entourent la masse pour pétrir, arrachent la poignée à deux mains (ou la pincent, petite), roulent, portent par les côtés puis appuient à plat, saisissent le bâton au poing (la main gauche tient l'ouvrage), le plantent, pressent le caillou, lissent. **Contact** : ce que les mains portent suit leur position réelle (elles glissent vers leur cible) ; **empreintes** : une paume qui appuie creuse la pâte (forme `creux` ajoutée à la chose), qui se résorbe en 2,5 s quand la main s'en va.
- **Matière** : `pate-organique` est mate, humide et luisante par plaques (une tache porte sa propre `brillance`, champ nouveau des recettes).
- **Budget** : mains 18 formes (2 × 9), empreintes 2, la chose en cours de geste au plus 22 formes (pont de matière compris) ; le reste pour le tas et les autres choses (64 en tout, recyclage existant). Les mains prennent deux des huit places d'objets.

Vérification : `npm test` (`tests/demo.test.mjs` : ordre des phases, de la plus grosse à la plus petite, plantés et pressés, pont qui rompt, matière molle et dure, continuité image par image, fin exacte, budget) ; `node tools/faconnage.mjs out/faconnage` (la chose, le tas et le façonnage posés directement, planche PC de 16 images) ; `VUE=pc node tools/demo.mjs`.

Pas vérifié, peu convaincant : rien sur un vrai GPU ni sur Direct3D ; la main de près reste lisse (pas de plis, d'ongles, de sous-surface) ; les doigts sont droits (une seule phalange) ; la pâte des grosses boules dépasse la taille des mains (la démo façonne un bonhomme d'un mètre) : elles poussent et portent plutôt qu'elles n'entourent. Le lanceur de rayons (repli) fond les formes `lisse` et creuse les `creux`, mais n'a ni bourrelet ni bosses.

## 24. « Des oiseaux qui tombent du ciel, morts, à cause de l'odeur » : les conséquences d'ambiance (20 novembre 2026)

Demande de Toine : « Faudrait des oiseaux qui tombent du ciel, morts, à cause de l'odeur de la crotte de 20 kg, en mode rapido, avec un bruit de piaf mourant. » POC de démo, fait vite.

Générique, en données (`exploit.consequences` de `src/modeles.json`) : quand une chose fabriquée répond à `si` (palier `demesure`, `facteur_min` 5 : « énorme » et 20 kg, pas 5 kg ; `origine` corps ; `repugnance_min`), `planConsequences` (meneur) tire 3 à 5 choses du modèle d'ambiance nommé par `modele` (ici un petit oiseau sombre de 6 formes, couché sur le flanc, `ambiance: true`) : instant après la pose (premier vers 1 s, puis tous les 0,6 à 2 s), hauteur 6 à 10 m, chute 0,8 à 1,3 s, tours sur elles-mêmes, angle de part et d'autre de la caméra, distance au-delà du bord de la chose, le cri (recette, durée, hauteur, force, ratés, vibrato) et la masse du choc ; une pensée de la banque à l'atterrissage de la première ou de la deuxième. Le meneur les crée tout de suite (`creer`, source `ambiance` : jamais visées par « avec ça », recyclées d'abord), avec `pres_de` la chose et `chute` le plan.

La page (`chutesPas`, appelé par `simulate`, donc figé avec le monde) attend que la chose soit posée, puis l'instant ; place chaque chose par `placesChute` (côté caméra, hors de la chose, du corps, des obstacles connus, des semis et des autres), l'anime par ses formes image par image (chute en t², rotation, les formes de la part `molles` battent), petit rebond, et elle reste. Pendant la chute, le cri `cri_mourant` (`src/bruitages.json` : onde aiguë et harmonique qui glisse de 1,6 octave vers le grave, vibrato qui grandit, ratés, fin « cale ») ; à l'impact, la recette `chute` à 80 g. Rien ne retarde la file : tout se passe pendant qu'il se relève, cadre et réagit.

Test : `tests/oiseaux.test.mjs` (déclenchement selon le palier et le facteur, nombre, écarts, places, cri qui descend et cale, choc petit, ambiance dans le monde de papier). Le monde de papier range les chutes à part (`w.chutes`), hors des choses.

Pas fait : la chose ne bascule pas en tombant (seulement la rotation autour de la verticale et les ailes), pas de plumes, pas vérifié à l'oreille ni sur GPU.

## 25. « Regarde le soleil » : ébloui, il détourne la tête (20 novembre 2026)

- Vocabulaire : `regarder` accepte une direction nommée, `{"type":"regarder","vers":"soleil"}` (`DIRECTIONS_NOMMEES`) ; la page calcule cap et hauteur depuis le soleil de la fiche (`LUMIERE.regardSoleil`).
- Sans Claude (mode démo, `reconnuLocal`) : `secoursSoleil` lit « fais deux pas et regarde le soleil », « avance un peu et… », « tourne-toi vers / lève les yeux vers le soleil » ; un pas = 0,7 m, « un peu » = deux pas ; marcher d'abord, puis regarder. Hors démo, la page tient la même suite quoi que réponde Claude.
- La phrase dite au pic vient de la banque `EBLOUI.dire` (données ; la première fois : « T'es gentil, mais ça me cramerait les yeux. », ensuite les variantes), portée par l'action (`dire`).
- Le geste (`soleilPas`, `src/main.js`) : 0,75 s pour tourner et lever la tête, 1,4 s ébloui avec à-coups, 0,4 s pour détourner la tête (75° du côté du sentier, regard au sol) en disant la phrase, un temps, puis retour le long du sentier. Nuit ou soleil sous l'horizon : rien.
- Le rendu : uniforme `uEbl` de `camera.frag` (x : éblouissement — voile blanc chaud, halo et reflets amplifiés, contraste effondré, paupières en amande, léger flou ; y : persistance rétinienne et exposition qui rattrape). Sans ce geste, seul un léger effet (0,3 au plus, `LUMIERE.eblouissement`) quand le regard passe à moins de 14° du soleil. Pas de main en visière (§15.4).
