# PDL, le langage intermédiaire (notation d'affichage)

**Ce que c'est.** Le PDL (« Procedural Diaphasic Language ») illustre un format d'échange compact entre modèles, et entre modèles et moteur : un flux de jetons qu'une IA aurait inventé pour parler à des systèmes et à d'autres IA. Ni JSON, ni YAML, ni code, ni langue humaine. **C'est une notation d'affichage générée à partir de données réelles** ; le moteur lit toujours la fiche JSON, et aucun modèle n'écrit ce flux pendant la démo.

**D'où viennent les jetons.** `src/pdl.js` (pur, déterministe, testé par `tests/pdl.test.mjs`) : même donnée → mêmes jetons.
- Un jeton = sigle de classe + clé (2 signes, empreinte du chemin dans la donnée) + valeur compacte. Nombre : quantifié au centième, en base 62 (`ˉ` si négatif) ; texte : 3 signes de lexique (empreinte) ; vrai/faux : `◐`/`○`.
- Classes : `◆` lieu, `△` relief, `▽` trajet, `◇` flore, `◐` lumière, `▤` matière, `≋` air, `◎` caméra, `●` personnage, `◈` demande, `⇢` action, `∴` histoire.
- Une trame : en-tête `▣<sigle><n° base 36>`, jetons, somme de contrôle `∴<2 signes>` ; les trames d'une fiche sont liées par `⇢`.
- Poids (« attention ») de 1 à 3 : premier jeton d'une trame et grands nombres plus forts, affichés plus blancs et plus gras.
- Chaque jeton garde sa traduction en clair (`traduire` : « ◆k3Ab = lieu · soleil.hauteur : 4 »), montrée au survol et dans la ligne de légende.

**Tokens comptés.** Sur ce qui s'affiche : un token par jeton, plus l'en-tête, la somme et chaque liaison ; face au même contenu en JSON compact, compté à caractères / 4. Le gain est donc une illustration (un vrai tokenizer couperait les glyphes autrement).

**Où on le voit.**
- Ouverture, étape « Écriture en PDL » : à gauche une ligne serrée par trame ; à droite (PC) le panneau « PDL · langage intermédiaire » où les trames s'écrivent par paquets de 1 à 3 jetons, certains qui se corrigent, curseur, légende, compteur. Le réseau d'agents suit le même rejeu (une seule horloge) : Haiku → web → Haiku (requêtes, une par nœud), Haiku → Sonnet (sources), Sonnet → JEV → Opus (constats, puis transmission groupée au début du PDL), Opus → moteur (paquets de jetons). Toute impulsion passe par `rayon()` : émetteur rouge, récepteur vert clignotant puis vert doux, terminé gris clair.
- Pendant le jeu (panneau d'activité) : après l'analyse locale, une trame `◈` de la demande (`trameDemande`), une trame `⇢` des actions à la réponse (`trameActions`) ; les lignes lisibles passent en second plan. Si la demande touche au personnage (chose répugnante, démesure, effort, aller chercher, façonner), un bloc persona : trame `●` des vrais réglages issus de la recherche de l'ouverture (`ouvertures/*.json`, `personnage.reglages`) et une ligne « réaction attendue · traducteur » calculée par `reactionAttendue` (pure) ; la pensée dite ensuite y est reliée (filet rouge). La régie de gauche a une ligne « Traduction · PDL » qui s'allume quand une trame est produite.

**Les « JEV ».** Les traducteurs instantanés du schéma (entre Sonnet et Opus) : dans nos notes, « JEV » ; le terme technique retenu est **dLLM**, modèle de langage à diffusion (ex. Mercury d'Inception, plus de 1 000 tokens/s), qui génère tout un passage d'un coup au lieu de jeton par jeton. C'est une mise en scène : rien de tel ne tourne dans la page.
