# Les bruitages

Le projet n'avait aucun son. Premier usage, demandé par Toine pour la démo : « des petits bruits de flatulence sur la petite crotte et un énorme bruit de flatulence sur la grosse, pour vraiment le réalisme ». Pendant l'effort accroupi (§20 de `meneur-de-jeu.md`), avant que la chose tombe, on entend : deux ou trois petits bruits brefs et aigus pour une petite chose ; pour une chose démesurée, un bruit énorme, long, grave, qui gronde, part en vibrato, cale, repart, finit de façon ridicule, et fait saturer le micro du téléphone.

Comme pour l'image, rien n'est propre à une chose dans le code : un bruitage est une **recette en données** (`src/bruitages.json`), faite de couches d'un petit vocabulaire, et ce qui varie avec la démesure est dans le **modèle** (`src/modeles.json`, `exploit.bruit`).

## Le module

`src/son.js`, embarqué par `tools/build.mjs` comme `SON` (les recettes et les prises comme `BRUITAGES`) :

- **pur** (testé par `tests/son.test.mjs`, sans navigateur) : `planExploit` (quels bruits pour une démesure), `caler` (les placer dans le geste), `planChute` (la chute d'une chose selon sa masse), `partition` (courbes de hauteur et d'amplitude, 1000 points par seconde), `synthese` (la source en échantillons, crête 1, sans continu) ;
- **la couche qui joue**, sur n'importe quel `BaseAudioContext` : `voixBruit` (source → formants → saturation douce → gain borné) et `chaine` (prise micro de téléphone → volume général → limiteur → plafond doux → sortie) ; `creerSons` (le lecteur de la page) ; `rendreHorsLigne` (essais, `OfflineAudioContext`).

Tout aléa dérive de la graine du monde et d'un compteur (un par geste, un par chute) : deux bruits ne sont jamais identiques, mais un même geste se rejoue à l'identique.

## Le vocabulaire des recettes

| Clé | Ce que c'est |
|---|---|
| `couches` | Sources mêlées. `impulsions` : des lèvres qui vibrent, une impulsion par période (ouverture douce, fermeture sèche ; `ouverture`, `claquement`, `jitter` de période, `shimmer` d'amplitude, `irregularite` = impulsions ratées). `bruit` : bruit blanc filtré (`filtre` : `passe_bande`, `passe_bas`, `passe_haut` ; `hz` fixe ou `hz_rapport` à la hauteur ; `decroit_s`). `onde` : `sinus`, `carre`, `scie`, à `rapport` × la hauteur. `prise` : un enregistrement embarqué, étiré et transposé sur la partition (voir plus bas). `suit: "impulsions"` : la couche ne sonne qu'à l'ouverture. `gain` de chaque couche. |
| `hauteur` | `glisse` (octaves sur la durée), `vibrato` (`hz`, `profondeur`, `croissance` : il grandit au fil du bruit), `instabilite` (dérive lente aléatoire, `instabilite_hz`), `chute_initiale` (la hauteur part de `rapport` × et retombe en `duree_s` : un coup). |
| `amplitude` | `attaque_s`, `relache_s`, `tremble` ; ou `forme: "percussion"` (`chute_s` ou `chute_rapport` × durée, rebonds `rebond_s`, `rebond_g`). |
| `rates` | Ça cale : silence, la hauteur s'effondre juste avant, puis ça repart à `reprise` × la hauteur. `par_s` (nombre par seconde × `rates` du bruit, au moins sa partie entière), `duree_s`. |
| `fins` | Des fins nommées, choisies par le plan : `duree_s`, `montee` (octaves, en fin de bruit), `niveau`, `pop` (un dernier claquement), `bulles` (après un `silence_s`, des petits éclats). |
| `formants` | Crêtes de résonance (`hz`, `q`, `gain_db`), au plus 5. |
| `saturation` | Saturation douce, multipliée par la force du bruit. |
| `echelle` | Pour un bruitage qui suit la masse (la chute) : `masse_ref_kg`, `hauteur_hz` et `exposant_hauteur`, `duree_s` et `exposant_duree`, `force` et `exposant_force`, `distance_ref_m`, rebonds sous `rebond_sous` kg. |

`micro` (toute la sortie y passe) : passe-haut et passe-bas (un micro de téléphone perd le grave), présence, compression légère, **écrêtage quand c'est fort** (linéaire sous `seuil`, saturé au-dessus, après une `pousse`), réverbération courte de plein air. `sortie` : volume général (0,5 ; borné à 0,8 dans le code), `baisse` quand le joueur parle, limiteur (−3 dB, ratio 20) et plafond doux (0,9). Le gain d'un bruit est borné à 0,9.

Deux recettes aujourd'hui : `flatulence` (impulsions + souffle qui suit l'ouverture + onde grave + prise) et `chute` (onde qui retombe vite + bruit d'impact étouffé + rebonds pour ce qui est léger). Un pas, un souffle, une branche qui casse s'écriraient de même, sans code.

## L'exploit : `exploit.bruit` dans le modèle

La démesure (§20 : le facteur d'échelle de la chose, en paliers normal < 1,6 ≤ gros < 4 ≤ démesuré) choisit le palier ; la place du facteur dans le palier (`facteur`, en log) règle durée et hauteur : plus démesuré, plus long et plus grave. Par palier : `nombre` de bruits, `duree_s` et `hauteur_hz` (du bas au haut du palier), `force`, `rates`, `fin`, `vibrato`, `prises` (et `prise_part` : la part de la prise face à la synthèse), et `avant` pour les bruits qui précèdent le principal (plus courts, plus aigus, plus faibles). Graine 4821, compteur 1 :

| | facteur | palier | bruits | principal | hauteur | force (gain) | fin | effort (s) |
|---|---|---|---|---|---|---|---|---|
| petite | 0,85 | normal | 2 ou 3 × 0,15–0,3 s | 0,24 s | 225–260 Hz | 0,13–0,17 (0,12–0,15) | sec | 3 |
| grosse | 3,5 | gros | 2 courts + 1 | 1,4 s | 106 Hz | 0,49 (0,44) | bulle | 3,7 + 3,7 |
| 5 kg | 4,1 | démesuré | 2 courts + 1 | 2,9 s | 76 Hz | 0,86 (0,77) | ridicule | 1,7 + 2 + 4,5 |
| énorme | 5,8 | démesuré | 2 courts + 1 | 3,8 s | 58 Hz | 0,95 (0,86) | ridicule | 1,9 + 2,1 + 5,4 |
| 20 kg | 6,6 | démesuré | 2 courts + 1 | 4,2 s | 52 Hz | 0,98 (0,89) | ridicule | 2 + 2,1 + 5,8 |

**Le calage** (`caler`, appelé par la page sur les gestes que `gesteExploit` marque `exploit: {palier, facteur}`) : le principal va dans le dernier effort, après le dernier souffle (`ecart_voix_s` = 1,3 s : on ne pète pas sur « Hhhnn… »), et finit `marge_pose_s` (0,25 s) avant la pose, c'est-à-dire juste avant que la chose tombe ; les bruits d'avant vont dans les efforts précédents, entre les souffles ; le dernier effort s'allonge pour contenir le principal, les autres raccourcissent (au moins assez pour leurs bruits) : l'effort total reste proche de celui du §20 (20 kg : 9,9 s au lieu de 9,5). Pour la petite, pas de souffle : deux ou trois petits bruits espacés dans les 3 s d'effort, puis la pose.

## Les prises : de vrais enregistrements, transformés

Exception assumée et limitée aux bruitages (comme les photos de l'ouverture) : quatre courtes prises libres, embarquées en données dans `src/bruitages.json` (`prises`, PCM 8 bits non signé, 11 025 Hz, base64 ; 62 Ko en tout, 5,2 s), toutes tirées d'**un seul** fichier de Wikimedia Commons :

- *425594 ylearkisto farts-pieruja.wav* (« Different kind of real farts », 1986), **Yle Arkisto** (archives de la radiotélévision publique finlandaise), publié sur Freesound (son 425594), versé sur Commons par l'utilisateur Zache. Licence **CC BY 3.0** (https://creativecommons.org/licenses/by/3.0/). Page : https://commons.wikimedia.org/wiki/File:425594_ylearkisto_farts-pieruja.wav. Extraits (début dans l'original) : `breve_aigue` (34,45 s, 0,48 s, ~190 Hz), `breve_ronde` (80,37 s, 0,45 s, ~158 Hz), `longue_chantante` (199,0 s, 2,03 s, ~160 Hz), `grondement` (166,53 s, 1,29 s, ~68 Hz). Modifications : mono, rééchantillonnage, 8 bits, découpe, fondus de 10 ms, puis, dans la page, étirement, transposition, ratés, fin, mélange à la synthèse et saturation.

Aucune prise en domaine public ni CC0 n'a été trouvée dans les catégories *Flatulence* et *Flatulence of humans* de Commons (les autres fichiers sont en CC BY-SA 3.0 ou 4.0, ou GFDL) ; la seule en CC BY a été retenue. Le crédit est affiché dans « Plus » sous les boutons.

La couche `prise` lit l'enregistrement par grains de 60 ms (fenêtre de Hann, recouvrement de moitié, un peu de flou de position) : la position avance pour que la prise entière dure le temps du bruit (une prise de 0,45 s jouée en 0,2 s pour la petite, de 1,3 s étirée sur 4 s pour l'énorme), et la lecture de chaque grain suit la hauteur de la partition divisée par la hauteur de la prise (`hz`) : la petite est jouée plus vite et plus aiguë, deux ou trois fois avec d'autres tirages ; l'énorme est descendue d'environ une demi-octave à une octave, étirée, et superposée à la couche grave de la synthèse, avec les ratés et la fin de la partition. Sans prise (palier qui n'en désigne pas, données absentes), la synthèse seule joue ; `out/son/enorme-synthese-seule.wav` permet de comparer.

## Dans la page

- **Le contexte audio** naît au premier geste du joueur (n'importe quel appui ou touche, l'envoi d'une phrase, l'interrupteur) et reprend s'il est suspendu ; sans Web Audio, ou s'il est refusé, rien ne casse : la chronologie vit quand même (la caméra tremble, le journal note).
- **« Sons : oui/non »** dans « Plus », allumé par défaut, mémorisé (`bodycam-sons`), distinct de « Voix » ; option de page `sons`. Le son est coupé quand la page est cachée (`visibilitychange`), et baisse (×0,25) quand le joueur parle (monde figé).
- **Synchronisation** : les bruits sont portés par les efforts de la file ; chacun part quand le temps écoulé de son effort atteint son instant, donc il suit les arrêts du monde. La synthèse est faite à l'arrivée du geste (quelques dizaines de ms pour 4 s), pas au moment de jouer.
- **Le tremblé** d'effort (§20) est modulé par l'enveloppe des bruits en cours (force comprise) : le gros bruit secoue le téléphone, plus vite et plus fort.
- **La voix ne couvre pas le gros bruit** : une pensée qui arrive pendant un bruit de plus de 0,8 s est affichée mais dite à sa fin (journal : `voix_differee_s`) ; les souffles ne tombent jamais pendant un bruit (calage).
- **La chute** : ce qui sort du corps tombe à la fin de l'effort : le coup sourd part à ce moment, que la chose soit déjà arrivée de l'accessoiriste ou non (le meneur met sa masse estimée dans `exploit.masse` : le volume de ses formes, une demi-tonne par m³). Une autre chose demandée fait son coup en arrivant au sol (posée à la place réservée au geste), sa distance au porteur réduisant la force.
- **Journal** : `window.balSons` (chaque plan avec ses souffles et sa pose, chaque bruit joué avec son instant, `audio` vrai s'il a réellement sonné) ; `window.sons.etat()`.

## Vérification (personne n'a écouté)

- `npm test` : `tests/son.test.mjs` (petite contre énorme : nombre, durée, hauteur, force ; reproductibilité par la graine et variété ; bornes de gain ; ratés et fin ridicule dans la partition ; calage : dans les efforts, jamais sur un souffle, le principal en dernier et juste avant la pose ; chute selon la masse et la distance ; lecteur sans Web Audio).
- `node tools/son.mjs` : rendu hors ligne dans Chrome par la même chaîne Web Audio, `out/son/*.wav` (petite × 3 graines, 5 kg, énorme, 20 kg, énorme en synthèse seule, chutes de 200 g, 5 kg, 40 kg), un spectrogramme par fichier (`*.png`, 0 à 4 kHz en échelle racine, 60 dB ; repères : blanc = un bruit, bleu = un souffle, rouge = la chute) et `mesures.json`. Mesures (graine 4821) : RMS du bruit principal −24 à −25 dBFS pour la petite, −14,4 à −15 pour 5 kg, énorme, 20 kg ; crête −8,4 dBFS pour les démesurées (plafond, le micro écrête) ; fondamentale mesurée 179–229 Hz pour la petite, 68 Hz (5 kg), 48 Hz (énorme), 53 Hz (20 kg). Les spectrogrammes montrent ce qui est voulu : harmoniques serrées qui glissent et ondulent, trois ratés (colonnes noires) sur 20 kg, la montée puis les bulles à la fin, la chute après.
- `node tools/demo.mjs` vérifie aussi les bruits de la petite et de l'énorme, leurs instants, la chute, et qu'aucune pensée n'est dite pendant le gros bruit (`out/demo/sons.json`).

Pas vérifié : l'oreille (rien n'a été écouté ici : les WAV sont là pour ça), un vrai téléphone (latence, volume, haut-parleur qui perd le grave : sur un haut-parleur de téléphone l'énorme sera surtout ses harmoniques et sa saturation), Safari (`webkitAudioContext` est prévu, pas essayé).
