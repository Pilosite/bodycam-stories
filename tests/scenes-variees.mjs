// Cinq demandes variées et la réponse qu'un Claude appliqué pourrait rendre (plan et fiche), écrites à la main avec les
// consignes du constructeur. Elles servent d'échantillonneur simulé : tests/constructeur.test.mjs vérifie qu'elles passent la
// validation et le contrôle et qu'elles donnent des lieux distincts ; tools/constructeur-variete.mjs les fait passer par la
// chaîne dans la page et capture le résultat. Ce n'est pas le vrai Claude : c'est la preuve que le vocabulaire suffit.

const B = (p, taille, couleur, matiere, x = {}) => Object.assign({ f: 'boite', p, taille, couleur, matiere }, x);

export const VARIEES = [
  { nom: 'ruelle',
    demande: 'Une ruelle étroite de vieille ville italienne, fin de matinée sous un ciel voilé : façades ocre à volets verts, pavés, quelques scooters garés, un porche au bout.',
    plan: { titre: 'Ruelle de vieille ville', lieu: 'ruelle pavée entre de hautes façades', depart: 'deux murs de façades serrées qui montent hors du cadre, la ruelle pavée au milieu',
      repete: [{ quoi: 'immeubles ocre à volets', ou: 'deux', distance_au_trajet_m: 2.1 }, { quoi: 'scooters', ou: 'droite', distance_au_trajet_m: 1.6 }], unique: [{ quoi: 'porche voûté', devant_m: 38, cote_m: 0 }] },
    fiche: { titre: 'Ruelle de vieille ville', inspiration: 'une ruelle du centre historique de Gênes', graine: 4417, kit: 'nu',
      relief: { amplitude: 0.6, echelle: 200, pente: 0.05, niveler: true }, trajet: { sinuosite: 0.25, largeur: 3.2, creux: 0.03, bord: 'net' },
      surfaces: { sol: 'paves', trajet: 'paves' },
      matieres: { facade_ocre: { base: 'crepi', couleur: 'forme', motif: { type: 'fenetres', largeur: 0.85, hauteur: 1.6, pas: 2.4, etage: 3.2, allege: 0.9, cadre: 0.08, rdc: 3, allumees: 0.05, couleur: '#2f4a3a', cadre_couleur: '#e0d4bc' } } },
      ambiance: { saison: 'ete', meteo: 'voile', soleil: { azimut: 20, hauteur: 40 }, brume: 0.012 },
      semis: [
        { id: 'immeubles', nom: 'immeubles ocre à volets verts', cellule: [6, 9], trajet: { rangee: true, min: 2.1, cote: 'deux' }, densite: 1, hauteur: [1, 1.35], teinte: 0.15,
          palette: ['#c98f52', '#d6a35e', '#b9734a', '#d8b27a', '#c4a27c'], formes: [
            B([0, 6.5, 0], [5.8, 13, 8.6], 'palette', 'facade_ocre'),
            B([0, 13.15, 0.3], [5.9, 0.3, 8.4], '#7a5a44', 'tuile'),
            B([1.4, 1.2, 4.32], [1.3, 2.3, 0.06], '#3a2a20', 'planches') ] },
        { id: 'scooters', nom: 'scooters garés contre le mur', cellule: [5, 0.9], trajet: { rangee: true, min: 1.15, cote: 'droite' }, densite: 0.45, tourne: 4, oriente: 'trajet',
          palette: ['#c23a2e', '#e8e4da', '#3a5a7a', '#2a2a2a'], formes: [
            B([0, 0.55, 0], [1.6, 0.5, 0.5], 'palette', 'metal', { arrondi: 0.15 }),
            B([0.65, 0.95, 0], [0.12, 0.8, 0.12], '#222222', 'metal'),
            B([0.5, 0.25, 0], [0.45, 0.45, 0.12], '#151515', 'mat', { arrondi: 0.2 }),
            B([-0.5, 0.25, 0], [0.45, 0.45, 0.12], '#151515', 'mat', { arrondi: 0.2 }) ] },
        { id: 'linge', nom: 'linge et pots aux fenêtres', cellule: [6, 0.5], trajet: { rangee: true, min: 1.95, cote: 'gauche' }, densite: 0.6, palette: ['#e8e2d4', '#9fb4c8', '#c45a4a', '#e0c070'],
          formes: [ B([0.6, 5.2, 0], [1.6, 0.9, 0.04], 'palette', 'tissu'), B([-1.4, 8.4, 0], [1.2, 0.7, 0.04], 'palette', 'tissu') ] } ],
      objets: [ { id: 'porche', nom: 'porche voûté au bout de la ruelle', devant: 38, cote: 0, formes: [
        B([-2.4, 4, 0], [1.6, 8, 1.4], '#b98a5a', 'facade_ocre'), B([2.4, 4, 0], [1.6, 8, 1.4], '#b98a5a', 'facade_ocre'),
        B([0, 10, 0], [6.4, 4, 1.4], '#b98a5a', 'facade_ocre'), { f: 'cylindre', p: [0, 7.6, 0], taille: [3.4, 1.4, 1.6], penche: [90, 0], couleur: '#b98a5a', matiere: 'facade_ocre' } ] } ] } },

  { nom: 'chalet',
    demande: 'Un chalet en bois au bord d\'un pré, face à une grande montagne enneigée, juste avant le lever du soleil ; des sapins, un tas de bûches, une fenêtre allumée.',
    plan: { titre: 'Chalet à l\'aube', depart: 'le sentier dans le pré, le chalet à droite à 18 m, la montagne qui ferme l\'horizon', unique: [{ quoi: 'chalet', devant_m: 18, cote_m: 7 }, { quoi: 'tas de bûches', devant_m: 13, cote_m: 2.5 }] },
    fiche: { titre: 'Chalet à l\'aube', inspiration: 'un chalet d\'alpage en Valais face à un sommet', graine: 2207, kit: 'nu',
      relief: { amplitude: 3.5, echelle: 170, pente: 0.05 }, trajet: { sinuosite: 0.7, largeur: 1.3, creux: 0.07, bord: 'irregulier' },
      surfaces: { sol: 'herbe', trajet: 'terre' },
      lointain: { hauteur: 26, decoupe: 0.8, neige: 0.7, couleur: '#6f7280', couleur_bas: '#2d3a33' },
      ambiance: { saison: 'ete', meteo: 'clair', soleil: { azimut: 80, hauteur: 2 }, brume: 0.007 },
      semis: [
        { id: 'sapins', nom: 'sapins en bosquets', cellule: [7, 7], rotation: 15, trajet: { min: 6 }, densite: 0.45, groupes: 0.75, groupes_echelle: 45, hauteur: [0.8, 1.5], teinte: 0.2,
          formes: [ { f: 'cylindre', p: [0, 0.8, 0], taille: [0.35, 1.6, 0.35], couleur: '#3a2a1e', matiere: 'bois' }, { f: 'cone', p: [0, 4.2, 0], taille: [3, 6.8, 3], couleur: '#1d2e22', matiere: 'tissu' } ] },
        { id: 'piquets', nom: 'piquets de clôture', cellule: [3, 1], trajet: { rangee: true, min: 1.4, cote: 'gauche' }, densite: 0.85, tourne: 6, penche: 5,
          formes: [ { f: 'cylindre', p: [0, 0.6, 0], taille: [0.12, 1.2, 0.12], couleur: '#5a4a3a', matiere: 'bois' }, B([0, 0.9, 0], [2.9, 0.06, 0.04], '#6a5a48', 'bois') ] } ],
      objets: [
        { id: 'chalet', nom: 'chalet en bois sur soubassement de pierre', devant: 18, cote: 7, cap: -25, formes: [
          B([0, 0.6, 0], [7, 1.2, 6], '#8a857c', 'pierre'), B([0, 2.6, 0], [7, 2.8, 6], '#6a4a32', 'planches'),
          { f: 'toit', p: [0, 4.9, 0], taille: [8.4, 2, 7.6], couleur: '#4a4744', matiere: 'tuile' },
          B([-2, 1.75, 3.02], [0.9, 2, 0.05], '#3a2818', 'bois'), B([1.4, 2.7, 3.02], [1.1, 0.9, 0.05], '#f2bf66', 'lumineux'),
          B([2.6, 5.4, 1], [0.5, 1.4, 0.5], '#6a6058', 'pierre') ] },
        { id: 'buches', nom: 'tas de bûches contre le chalet', devant: 13, cote: 2.6, formes: [
          { f: 'cylindre', p: [0, 0.25, 0], taille: [0.5, 2.2, 0.5], penche: [0, 90], couleur: '#7a5a3a', matiere: 'bois' },
          { f: 'cylindre', p: [0, 0.25, 0.5], taille: [0.5, 2.2, 0.5], penche: [0, 90], couleur: '#6a4a30', matiere: 'bois' },
          { f: 'cylindre', p: [0, 0.68, 0.25], taille: [0.5, 2.2, 0.5], penche: [0, 90], couleur: '#80603e', matiere: 'bois' } ] } ] } },

  { nom: 'plage',
    demande: 'Une plage de sable en fin d\'après-midi, la mer à l\'horizon, des parasols de couleur, un poste de secours en bois.',
    plan: { titre: 'Plage en fin d\'après-midi', depart: 'le sable clair, des parasols à droite, la mer qui fait l\'horizon', unique: [{ quoi: 'poste de secours', devant_m: 24, cote_m: -5 }] },
    fiche: { titre: 'Plage en fin d\'après-midi', inspiration: 'une plage de la côte atlantique en août', graine: 812, kit: 'nu',
      relief: { amplitude: 0.3, echelle: 90, pente: -0.14 }, trajet: { sinuosite: 0.2, largeur: 2.5, creux: 0.02, bord: 'irregulier' },
      matieres: { 'sable-plage': { base: 'sable-dunes', couleur: '#d8c6a2', motif: { type: 'rides', echelle: 30, deformation: 6, couleur: '#cbb893', opacite: 0.1, inclinaison: 0.04 } },
        'sable-tasse': { base: 'sable-plage', couleur: '#c9b28a', brillance: 0.15 } },
      surfaces: { sol: 'sable-plage', trajet: 'sable-tasse' },
      lointain: { hauteur: 0.1, decoupe: 0, couleur: '#6d8f99', couleur_bas: '#5d7f89', eau: '#3d6b78' },
      ambiance: { saison: 'ete', meteo: 'clair', soleil: { azimut: -95, hauteur: 14 }, brume: 0.005 },
      semis: [
        { id: 'parasols', nom: 'parasols de couleur', cellule: [6, 6], rotation: 10, trajet: { min: 3, max: 16, cote: 'droite' }, densite: 0.55, groupes: 0.4, groupes_echelle: 25, tourne: 30, penche: 6,
          palette: ['#d23c32', '#2f6fb0', '#f0c43a', '#ece6da', '#2f9a7a'], formes: [
            { f: 'cylindre', p: [0, 1.1, 0], taille: [0.06, 2.2, 0.06], couleur: '#e8e4dc', matiere: 'metal' },
            { f: 'cone', p: [0, 2.25, 0], taille: [2.2, 0.5, 2.2], couleur: 'palette', matiere: 'tissu' },
            B([0.9, 0.2, 0.8], [0.7, 0.06, 1.7], 'palette', 'tissu') ] } ],
      objets: [ { id: 'poste', nom: 'poste de secours en bois sur pilotis', devant: 24, cote: -5, formes: [
        { f: 'cylindre', p: [-1, 1, -1], taille: [0.18, 2, 0.18], couleur: '#8a7a66', matiere: 'bois' }, { f: 'cylindre', p: [1, 1, -1], taille: [0.18, 2, 0.18], couleur: '#8a7a66', matiere: 'bois' },
        { f: 'cylindre', p: [-1, 1, 1], taille: [0.18, 2, 0.18], couleur: '#8a7a66', matiere: 'bois' }, { f: 'cylindre', p: [1, 1, 1], taille: [0.18, 2, 0.18], couleur: '#8a7a66', matiere: 'bois' },
        B([0, 3, 0], [2.6, 2, 2.6], '#e8e2d6', 'planches'), { f: 'toit', p: [0, 4.4, 0], taille: [3, 0.9, 3], couleur: '#c23a2e', matiere: 'tuile' },
        B([0, 3.2, 1.32], [1.6, 0.8, 0.05], '#1d2328', 'verre'), { f: 'cylindre', p: [1.1, 5.6, 0], taille: [0.05, 2.4, 0.05], couleur: '#dddddd', matiere: 'metal' },
        B([1.5, 6.3, 0], [0.7, 0.45, 0.02], '#d23c32', 'tissu') ] } ] } },

  { nom: 'cimetiere-nuit',
    demande: 'Un vieux cimetière la nuit, on avance à la lampe entre les tombes ; une chapelle au fond avec un vitrail éclairé, une bougie sur une tombe.',
    plan: { titre: 'Cimetière, la nuit', depart: 'l\'allée de gravier, les tombes de part et d\'autre dans le cercle de la lampe', unique: [{ quoi: 'chapelle', devant_m: 26, cote_m: 4.5 }, { quoi: 'bougie', devant_m: 7, cote_m: -2.4 }] },
    fiche: { titre: 'Cimetière, la nuit', inspiration: 'un cimetière de village breton', graine: 1313, kit: 'nu',
      relief: { amplitude: 1, echelle: 110, pente: 0.04 }, trajet: { sinuosite: 0.2, largeur: 2.2, creux: 0.04, bord: 'net' },
      surfaces: { sol: 'herbe', trajet: 'gravier' },
      ambiance: { saison: 'automne', meteo: 'voile', soleil: { azimut: 120, hauteur: -10 }, lampe: true, brume: 0.005 },
      lointain: { hauteur: 3, decoupe: 0.3, couleur: '#14171a', couleur_bas: '#0e1112' },
      semis: [
        { id: 'tombes', nom: 'tombes de granit', cellule: [2.3, 3], trajet: { min: 1.9, max: 12 }, densite: 0.85, oriente: 'fixe', cap: 180, tourne: 6, penche: 4, teinte: 0.3, desordre: 0.15,
          formes: [ B([0, 0.5, -1], [0.8, 1, 0.16], '#8e8b84', 'beton', { arrondi: 0.03 }), B([0, 0.13, 0], [0.95, 0.26, 1.9], '#77746d', 'pierre') ] },
        { id: 'croix', nom: 'croix de pierre', cellule: [6, 6], trajet: { min: 3, max: 14 }, densite: 0.3, oriente: 'fixe', cap: 180, tourne: 8, penche: 5,
          formes: [ B([0, 0.9, 0], [0.18, 1.8, 0.16], '#9a968e', 'pierre'), B([0, 1.35, 0], [0.8, 0.16, 0.16], '#9a968e', 'pierre'), B([0, 0.1, 0], [0.6, 0.2, 0.6], '#6e6b64', 'pierre') ] },
        { id: 'ifs', nom: 'ifs taillés', cellule: [9, 9], trajet: { min: 5 }, densite: 0.3, groupes: 0.5, hauteur: [0.8, 1.3],
          formes: [ { f: 'capsule', p: [0, 2.4, 0], taille: [1.8, 4.6, 1.8], couleur: '#121c14', matiere: 'tissu' } ] } ],
      objets: [
        { id: 'chapelle', nom: 'chapelle de pierre au vitrail éclairé', devant: 26, cote: 4.5, degage: 4, formes: [
          B([0, 3, 0], [5, 6, 8], '#8b8577', 'pierre'), { f: 'toit', p: [0, 7, 0], taille: [8.4, 2.4, 5.6], couleur: '#2f3236', matiere: 'tuile' },
          B([0, 4.2, 4.02], [1.1, 1.8, 0.05], '#d88a3a', 'lumineux'), B([0, 1.2, 4.02], [1.3, 2.4, 0.06], '#2a2018', 'bois'),
          B([0, 8.6, 3.6], [0.25, 1.4, 0.2], '#8b8577', 'pierre'), B([0, 8.9, 3.6], [0.8, 0.2, 0.2], '#8b8577', 'pierre') ] },
        { id: 'bougie', nom: 'bougie dans un photophore sur une tombe', devant: 7, cote: -2.4, formes: [
          B([0, 0.13, 0], [1, 0.26, 2], '#6e6b64', 'pierre'), { f: 'cylindre', p: [0, 0.4, 0.4], taille: [0.12, 0.28, 0.12], couleur: '#ffcc77', matiere: 'lumineux', vacille: 0.6 } ] } ] } },

  { nom: 'entrepot',
    demande: 'L\'intérieur d\'un grand entrepôt abandonné, la nuit, éclairé seulement à la lampe : piliers de béton, caisses empilées, quelques néons encore allumés.',
    plan: { titre: 'Entrepôt abandonné', depart: 'l\'allée de béton entre deux rangs de piliers, le plafond au-dessus, le fond noir', impossible: ['un vrai intérieur fermé : murs en rangée, plafond en objets, au-dessus du trajet'] },
    fiche: { titre: 'Entrepôt abandonné', inspiration: 'un entrepôt de docks désaffecté', graine: 6060, kit: 'nu',
      relief: { amplitude: 0, echelle: 300, pente: 0, niveler: true }, trajet: { sinuosite: 0, largeur: 4, creux: 0, bord: 'net' },
      surfaces: { sol: 'beton', trajet: 'beton' },
      ambiance: { saison: 'automne', meteo: 'voile', soleil: { azimut: 120, hauteur: -10 }, lampe: true, brume: 0.004 },
      semis: [
        { id: 'murs', nom: 'murs de brique à hautes fenêtres', cellule: [8, 1], trajet: { rangee: true, min: 7, cote: 'deux' }, densite: 1,
          formes: [ B([0, 3.5, 0], [8, 7, 0.8], '#6a4a3a', 'brique') ] },
        { id: 'piliers', nom: 'piliers de béton', cellule: [8, 1], trajet: { rangee: true, min: 2.6, cote: 'deux' }, densite: 1,
          formes: [ B([0, 3.5, 0], [0.5, 7, 0.5], '#8a867e', 'beton') ] },
        { id: 'caisses', nom: 'caisses et palettes empilées', cellule: [3, 3], trajet: { min: 3.6, max: 6 }, densite: 0.5, tourne: 20, teinte: 0.2,
          formes: [ B([0, 0.5, 0], [1.2, 1, 1.2], '#7a6040', 'planches'), B([0.1, 1.4, 0.1], [1, 0.8, 1], '#6a5034', 'planches'), B([0, 0.07, 0], [1.3, 0.14, 1.3], '#8a7050', 'bois') ] },
        { id: 'neons', nom: 'néons suspendus', cellule: [16, 1], trajet: { rangee: true, min: 1.2, cote: 'gauche' }, densite: 0.5,
          formes: [ B([0, 6.4, 0], [1.6, 0.1, 0.18], '#dfeeff', 'lumineux') ] } ],
      objets: [
        { id: 'plafond', nom: 'toit de l\'entrepôt', devant: 40, cote: 0, oriente: 'trajet', formes: [
          B([-20, 7.2, 0], [40, 0.4, 16], '#3a3836', 'beton'), B([20, 7.2, 0], [40, 0.4, 16], '#3a3836', 'beton') ] },
        { id: 'fond', nom: 'mur du fond et grande porte', devant: 58, cote: 0, formes: [
          B([0, 3.5, 0], [16, 7, 0.6], '#5a4034', 'brique'), B([0, 2.2, 0.32], [4, 4.4, 0.06], '#3a4248', 'metal') ] } ] } },
];
