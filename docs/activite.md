# Le panneau d'activité

Pendant que Claude réfléchit (5 à 8 s, l'objet vers 12 s), une colonne à droite (PC paysage seulement ; masquée en portrait ou sous 760 px) montre ce que la page fait. Interrupteur « Activité : oui/non » dans « Plus » (oui par défaut). Lignes produites par `src/activite.js` (pur, testé par `tests/activite.test.mjs`), affichées par le bloc « panneau d'activité » de `src/main.js` (10 mises à jour par seconde au plus, seulement entre une phrase et 4 s après la fin de ce qu'elle déclenche).

**Grammaire** : `<horodatage s> <signe> <verbe> <détails>`. Signes : `>` la phrase entendue ; (espace) ce que la page comprend seule, avant Claude (`ordreDemande`, `modeleDe`, `formesModele`, `palierExploit`, `dureeEffort`) ; `~` un appel en cours et sa durée qui tourne (interprète, accessoiriste) ; `<` ce que Claude rend (sas, pensée, fabrique, suite) ; `·` une décision du meneur (modèle, échelle, séquence, exploit, façonnage, cadrage) ; `!` un garde-fou (pose corrigée, autre matière refusée, demande tenue) ; `▶` une action de la file qui s'exécute ; `✓` finie.

```
0.0 > entendre "déplace-toi et fais une crotte de 20 kg"
0.0   ordre      : aller → faire
0.0   faire      : modele(crotte) 20 kg → 0.92 m ×6.6 (démesuré)
0.1 ~ interprète … 4.2 s
6.3 < pensée     "Vingt kilos ? … Bon."
6.3 ! garde-fou  pose dessous → derriere
7.0 ▶ marcher 1.3 m ×4
9.8 ▶ effort 9.5 s ████░░░░
```

Vrai : tout le contenu (analyse locale, état des appels, journal du meneur via `surEvenement`, file d'actions lue sur `queue[0]`). Habillage : la frappe rapide, le curseur, l'estompage des anciennes lignes. Pas de flux de la réponse affiché : la pensée devient une ligne `<` quand elle s’affiche (y compris l’aperçu `onPensee` du meneur s’il arrive, puisqu’il passe par la même pensée).
