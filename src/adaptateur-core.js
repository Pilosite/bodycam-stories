/* Engine adapter sketch (docs/pdl-spec.md §12): how the page would implement the executor of core/ with what exists today.
   NOT WIRED. The build does not embed this file and nothing calls it; ENABLED stays false until the M2 lot wires the page.
   What is here: the mapping table as data, and the pure translations that are trivially safe (in-place acts to the
   meneur's action objects, PDL shapes to the accessoiriste's formes). No DOM, no engine import. */

export const ENABLED = false;

/* executor call → existing call in src/main.js / src/meneur.js / src/son.js; gap: what the engine still lacks. */
export const MAPPING = [
  { call: 'go', engine: 'none (enqueue marcher + planTrajet is free walking)', gap: 'stations and transitions' },
  { call: 'look', engine: "enqueue([{type:'viser', objet}]) ; regarder {vers:'soleil'} ; regarder {degres}", gap: 'dir:* other than sun' },
  { call: 'turn', engine: "enqueue([{type:'tourner', degres}])", gap: null },
  { call: 'posture', engine: "enqueue([{type:'posture', hauteur}])", gap: null },
  { call: 'touch', engine: "enqueue([{type:'cadrer', objet, sur_place:true}, {type:'posture', hauteur:0.5}])", gap: 'hand contact' },
  { call: 'take', engine: 'MENEUR.ramassage (part of chercher)', gap: 'take a given thing in place' },
  { call: 'shape', engine: "enqueue([{type:'faconner', objet}]) + objetMeneur({op:'faconner', etapes})", gap: 'steps are not in PDL v0' },
  { call: 'wait', engine: "enqueue([{type:'attendre', secondes}])", gap: null },
  { call: 'stop', engine: "executer({type:'stop'})", gap: null },
  { call: 'say', engine: 'penser(texte) + direVoix(texte)', gap: 'tone, second speaker' },
  { call: 'placeThing', engine: "objetMeneur({op:'creer', objet:{id, nom, formes}})", gap: null },
  { call: 'changeThing', engine: "objetMeneur({op:'modifier', id, echelle, decale, vacille})", gap: null },
  { call: 'removeThing', engine: "objetMeneur({op:'retirer', id})", gap: null },
  { call: 'playSound', engine: 'jouerBruit(plan) from a recipe of src/bruitages.json', gap: 'recipes for the pack cues (jay alarm, beep, rustle)' },
  { call: 'setPlace', engine: 'patchScene({ambiance:{brume, lampe, soleil:{hauteur}, meteo}})', gap: null },
  { call: 'setCamera', engine: 'none', gap: 'degrade, shake and off in camera.frag' },
  { call: 'setSpeech', engine: 'voixP volume + couperPensee budget', gap: 'whisper voice' },
  { call: 'startScene', engine: 'applyFiche / patchScene', gap: 'scene table in the pack' },
  { call: 'endStory', engine: "executer({type:'fin', id, titre, replique})", gap: null },
];

/* An in-place act of PDL → the meneur's action objects (validerActions accepts them). null when there is no direct match. */
export function toEngineActions(op, args) {
  switch (op) {
    case 'turn': return [{ type: 'tourner', degres: Math.round(args.degrees) }];
    case 'posture': return [{ type: 'posture', hauteur: args.height }];
    case 'wait': return [{ type: 'attendre', secondes: args.seconds }];
    case 'look':
      if (args.thing) return [{ type: 'viser', objet: args.thing }];
      if (args.target === 'dir:sun') return [{ type: 'regarder', vers: 'soleil' }];
      if (typeof args.pitch === 'number') return [{ type: 'regarder', degres: Math.round(args.pitch) }];
      return null;
    case 'touch': return [{ type: 'cadrer', objet: args.thing, sur_place: true }, { type: 'posture', hauteur: 0.5 }];
    case 'shape': return [{ type: 'faconner', objet: args.thing }];
  }
  return null;
}

/* PDL shapes (English keys) → the formes of the existing vocabulary (creerMonde, validerForme). */
const SHAPE = { box: 'boite', ball: 'boule', cylinder: 'cylindre', cone: 'cone', capsule: 'capsule', roof: 'toit' };
export function toFormes(shapes) {
  return shapes.map(s => Object.assign({ f: SHAPE[s.shape], p: s.p, taille: s.size, couleur: s.color || '#777777', matiere: s.material || 'mat' },
    s.yaw !== undefined ? { cap: s.yaw } : {}, s.tilt ? { penche: s.tilt } : {}, s.round !== undefined ? { arrondi: s.round } : {}, s.smooth !== undefined ? { lisse: s.smooth } : {}));
}
