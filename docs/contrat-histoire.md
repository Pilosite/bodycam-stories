# Contrat d'histoire (version 0)

> Le format v1 (trame, monde, secrets, fins) est décrit dans `meneur-de-jeu.md` §1. Depuis le 19 novembre 2026 (§13), le contrat cadre aussi ce que le porteur fait et ce qui s'ensuit : voir « Ce que le porteur fait, et ses suites » en fin de document.

Le contrat d'histoire est l'accord entre trois parties : l'auteur, qui raconte ce qu'il veut voir vivre ; l'IA de récit, qui le fait vivre ; le moteur, qui le montre. C'est l'équivalent d'un donjon textuel piloté par IA, sauf que la sortie n'est pas du texte : ce sont des intentions que le moteur filme.

## Les trois moments

1. **Écriture.** Un auteur décrit son histoire en langage libre : « ça se passe dans un château, il y a un gardien qui ment, à minuit la cour s'éclaire ». Une IA compile ce texte en contrat : lieux, protagonistes, temps du récit. L'auteur relit et corrige le contrat, pas du code.
2. **Vie.** Pendant la partie, l'IA de récit reçoit le contrat, ce que le porteur perçoit et ce que le joueur vient de dire. Elle répond par une pensée, des actions, et parfois un changement du monde.
3. **Trace.** Chaque échange et chaque temps déclenché sont consignés. Une partie peut être rejouée, reprise ou partagée.

## Format

```json
{
  "version": 0,
  "id": "chateau-minuit",
  "titre": "La cour à minuit",
  "pitch": "Une nuit dans un château fermé au public. Le gardien a laissé entrer Sam, sans dire pourquoi.",
  "ton": "inquiet, concret, jamais de surnaturel montré de face",
  "porteur": { "id": "sam", "trait": "curieux, parle pour se rassurer", "sait": ["le gardien s'appelle Loïc"], "ignore": ["Loïc a coupé les caméras"] },
  "protagonistes": [
    { "id": "loic", "role": "gardien", "veut": "que Sam trouve quelque chose à sa place", "ment_sur": "la raison de sa présence" }
  ],
  "lieux": [
    { "fiche": "chateau-cour", "role": "départ" },
    { "fiche": "chateau-cave", "role": "révélation" }
  ],
  "temps": [
    { "id": "lumiere", "quand": "Sam traverse la cour ou minuit sonne", "ce_qui_se_passe": "une fenêtre s'allume à l'étage", "scene": { "brume": 0.02 } },
    { "id": "porte", "quand": "après lumiere, si Sam s'approche de la tour", "ce_qui_se_passe": "la porte de la cave est ouverte", "lieu": "chateau-cave" }
  ],
  "fins": [
    { "id": "sortie", "quand": "Sam quitte le château avant porte" },
    { "id": "cave", "quand": "Sam descend" }
  ],
  "limites": { "duree_minutes": 15, "interdits": ["violence montrée", "personnes réelles"] }
}
```

## Ce que l'IA de récit reçoit et rend

Entrée, à chaque prise de parole du joueur :

- le contrat (ou la partie utile) ;
- les temps déjà passés ;
- la perception du porteur : lieu, position, cap, obstacle devant, jour ou nuit, lampe, brume ;
- les derniers échanges ;
- la phrase du joueur.

Sortie, un objet JSON :

```json
{
  "pensee": "Bon. À gauche, alors. J'aime pas trop ce coin.",
  "actions": [ { "type": "tourner", "degres": -90 }, { "type": "marcher", "metres": 10 } ],
  "scene": { "brume": 0.03 },
  "temps": "bruit"
}
```

| Champ | Sens |
|---|---|
| `pensee` | Ce que le porteur se dit, à la première personne, une ou deux phrases. Affiché en sous-titre, plus tard dit à voix haute. |
| `actions` | Six au plus, exécutées dans l'ordre : `tourner` (degrés, négatif à gauche), `marcher` (mètres), `regarder` (degrés, positif vers le haut), `attendre` (secondes). |
| `scene` | Facultatif. Change l'ambiance du lieu courant : `brume`, `soleil`, `lampe`. |
| `temps` | Facultatif. Identifiant du temps du récit que ce moment déclenche. Le moteur applique alors son `scene`. |

Le moteur borne toutes les valeurs et ignore ce qu'il ne connaît pas. Une réponse invalide retombe sur le lexique de secours (gauche, droite, avance, regarde en haut…).

## Ce qui est en place

- La fiche de lieu peut porter un champ `histoire` (pitch, protagonistes, temps). Il est transmis à l'IA avec la liste des temps passés.
- Les temps déclenchés appliquent leur `scene`.
- `balade.histoire()` rend la trace : temps passés et échanges.
- Exemple jouable : `scenes/02-grands-avaux-nuit.json`.

## Ce qui reste à construire

- **Le compilateur d'histoire** : texte libre de l'auteur vers contrat, avec relecture.
- **Le changement de lieu** en cours de récit (`temps.lieu`).
- **Les protagonistes visibles**, et leurs voix.
- **Le metteur en scène autonome** : aujourd'hui l'IA ne parle que si le joueur parle. Il faut qu'elle prenne aussi la main seule, à intervalles, pour faire avancer le récit et faire monologuer le porteur.
- **La préparation à l'avance** : puisque le récit choisit le trajet, il doit l'annoncer au moteur quelques secondes avant, pour que les images soient prêtes (voir `rendu.md`).
- **La voix** : dictée pour le joueur, voix de synthèse pour le porteur.
- **La trace rejouable** : horodatage et poses, pour rejouer une partie à l'identique.

## Ce que le porteur fait, et ses suites (19 novembre 2026)

Le porteur fait ce que la voix demande (`meneur-de-jeu.md` §13) ; ce qu'il fait apparaît à l'image et peut avoir des suites. Ce que le concepteur écrit pour cadrer cela :

| Champ | Sens |
|---|---|
| `monde.possible` | Ce qu'une personne ordinaire peut faire ici, de ses mains et de son corps, et ce qu'elle peut fabriquer avec ce qu'elle trouve. Plus c'est large, plus le joueur est libre. |
| `monde.impossible` | Ce qui sort du monde (pouvoirs, magie). Ne pas y mettre un geste ordinaire : « faire apparaître par la seule parole » est impossible, « faire un feu avec du bois mort » ne l'est pas. |
| `porteur.refuse` | Lu désormais comme « ce qui lui coûte » : il le fait quand même, en le disant. Seul le caractère `retif` le fait vraiment refuser. |
| `limites.interdits` | Les seules limites de registre : le sas refuse ce qui y figure. Rien d'autre n'est censuré (un geste trivial ou grossier est fait). |
| `improvisation.objets_nouveaux` | Nombre de choses nouvelles par partie (6 au plus), plafonné par les places libres du moteur (8 objets, 64 formes, fiche comprise). |
| `consequences.peut_degenerer`, `jusqu_ou`, `exclu` | En mots : ce qui peut s'emballer, jusqu'où, ce qui n'arrive jamais. Lus par le personnage et par l'accessoiriste. |
| `consequences.ambiance` | Plages permises aux suites (`brume: [min, max]`, `lampe: true` pour l'autoriser). À défaut, celles de `improvisation.ambiance`. |
| `consequences.duree_max_s`, `etapes_max` | Bornes d'une suite (300 s et 8 étapes au plus). |
| `consequences.fins` | Les fins qu'une suite peut ouvrir (aucune par défaut). |
| `consequences.permis` | `false` : aucun geste n'a de suite. |
| `reglages.CARACTERE` | `"retif"` pour revenir au porteur qui peut refuser. |
