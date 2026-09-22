/**
 * Programme type donné à chaque nouveau compte : 4 séances, historique vide.
 * Aucune perf personnelle ici : ce fichier est public.
 *
 * mode "kg" -> la charge est le poids sur la barre / la machine
 * mode "bw" -> poids du corps ; la colonne poids sert au lest (0 = à vide)
 */

const TEMPLATE = [
  {
    id: 's1',
    name: 'Pecs + Biceps',
    exercises: [
      ['e-bench', 'Bench', 'kg', 3],
      ['e-bench-incl', 'Bench incliné', 'kg', 3],
      ['e-pec-fly', 'Pec fly', 'kg', 3],
      ['e-curl-pupitre', 'Curl pupitre EZ', 'kg', 3],
      ['e-bayesian', 'Bayesian curl', 'kg', 3]
    ]
  },
  {
    id: 's2',
    name: 'Dos + Triceps',
    exercises: [
      ['e-traction', 'Tractions', 'bw', 3],
      ['e-rowing', 'Rowing', 'kg', 3],
      ['e-pull-over', 'Pull over', 'kg', 3],
      ['e-dips', 'Dips lestés (chaîne)', 'bw', 3],
      ['e-ext-corde', 'Extension poulie corde', 'kg', 3],
      ['e-overhead-uni', 'Overhead unilatéral', 'kg', 3]
    ]
  },
  {
    id: 's3',
    name: 'Épaules + Avant-bras',
    exercises: [
      ['e-militaire', 'Bench militaire Smith', 'kg', 3],
      ['e-elev-lat', 'Élévations latérales', 'kg', 3],
      ['e-oiseau', 'Tirage oiseau poulie', 'kg', 3],
      ['e-curl-halt', 'Curl haltères', 'kg', 3],
      ['e-reverse-curl', 'Reverse curl', 'kg', 3]
    ]
  },
  {
    id: 's4',
    name: 'Legs',
    exercises: [
      ['e-pendulum', 'Pendulum squat', 'kg', 2],
      ['e-leg-curl', 'Leg curl', 'kg', 3],
      ['e-leg-ext', 'Leg extension', 'kg', 3],
      ['e-calves', 'Mollets (calf raise)', 'kg', 3]
    ]
  }
];

/** État de départ d'un nouveau compte : le programme, sans historique. */
export function buildTemplateState() {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    sessions: TEMPLATE.map((s) => ({
      id: s.id,
      name: s.name,
      exercises: s.exercises.map(([id, name, mode, defaultSets]) => ({ id, name, mode, defaultSets }))
    })),
    logs: [],
    cardio: []
  };
}
