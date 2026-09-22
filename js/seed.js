/**
 * Données initiales : les 4 séances du programme + la première entrée
 * d'historique (perfs connues au 22/09/2026).
 *
 * mode "kg" -> la charge est le poids sur la barre / la machine
 * mode "bw" -> poids du corps ; la colonne poids sert au lest (0 = à vide)
 */

export const SEED_DATE = '2026-09-22';

const defs = [
  {
    id: 's1',
    name: 'Pecs + Biceps',
    exercises: [
      { id: 'e-bench',        name: 'Bench',                  mode: 'kg', sets: [[75, 8], [75, 9], [75, 9]] },
      { id: 'e-bench-incl',   name: 'Bench incliné',          mode: 'kg', sets: [[17.5, 12], [17.5, 12], [17.5, 11]] },
      { id: 'e-pec-fly',      name: 'Pec fly',                mode: 'kg', sets: [[40, 10], [40, 9], [40, 7]] },
      { id: 'e-curl-pupitre', name: 'Curl pupitre EZ',        mode: 'kg', sets: [[30, 10], [30, 10], [30, 9]] },
      { id: 'e-bayesian',     name: 'Bayesian curl',          mode: 'kg', sets: [[15, 12], [15, 12], [15, 15]] }
    ]
  },
  {
    id: 's2',
    name: 'Dos + Triceps',
    exercises: [
      { id: 'e-traction',     name: 'Tractions',              mode: 'bw', sets: [[0, 3], [0, 2], [0, 1]] },
      { id: 'e-rowing',       name: 'Rowing',                 mode: 'kg', sets: [[30, 10], [30, 8], [30, 8]] },
      { id: 'e-pull-over',    name: 'Pull over',              mode: 'kg', sets: [[40, 10], [40, 10], [40, 8]] },
      { id: 'e-dips',         name: 'Dips lestés (chaîne)',   mode: 'bw', sets: [[null, 7], [null, 5], [null, 5]], note: 'Lest : chaîne (poids à préciser)' },
      { id: 'e-ext-corde',    name: 'Extension poulie corde', mode: 'kg', sets: [[20, 10], [20, 9], [20, 8]] },
      { id: 'e-overhead-uni', name: 'Overhead unilatéral',    mode: 'kg', sets: [[15, 10], [15, 10], [15, 10]] }
    ]
  },
  {
    id: 's3',
    name: 'Épaules + Avant-bras',
    exercises: [
      { id: 'e-militaire',    name: 'Bench militaire Smith',  mode: 'kg', sets: [[40, 11], [40, 9], [40, 6]] },
      { id: 'e-elev-lat',     name: 'Élévations latérales',   mode: 'kg', sets: [[12.5, 13], [12.5, 12], [12.5, 11]] },
      { id: 'e-oiseau',       name: 'Tirage oiseau poulie',   mode: 'kg', sets: [[40, 12], [40, 12], [40, 11]] },
      { id: 'e-curl-halt',    name: 'Curl haltères',          mode: 'kg', sets: [[12, 8], [12, 8], [12, 7]] },
      { id: 'e-reverse-curl', name: 'Reverse curl',           mode: 'kg', sets: [[20, 12], [20, 12], [20, 11]] }
    ]
  },
  {
    id: 's4',
    name: 'Legs',
    exercises: [
      { id: 'e-pendulum',     name: 'Pendulum squat',         mode: 'kg', sets: [[10, 10], [10, 9]] },
      { id: 'e-leg-curl',     name: 'Leg curl',               mode: 'kg', sets: [[40, 12], [40, 12], [40, 12]] },
      { id: 'e-leg-ext',      name: 'Leg extension',          mode: 'kg', sets: [[45, 12], [45, 10], [45, 10]] },
      { id: 'e-calves',       name: 'Mollets (calf raise)',   mode: 'kg', sets: [[15, 12], [15, 12], [15, 12]] }
    ]
  }
];

/** Construit l'état initial complet : structure + première ligne d'historique. */
export function buildSeedState() {
  const sessions = defs.map((s) => ({
    id: s.id,
    name: s.name,
    exercises: s.exercises.map((e) => ({
      id: e.id,
      name: e.name,
      mode: e.mode,
      defaultSets: e.sets.length
    }))
  }));

  const logs = defs.map((s) => ({
    id: 'log-' + s.id + '-seed',
    sessionId: s.id,
    date: SEED_DATE,
    note: 'Perfs de départ (reprises du suivi papier).',
    entries: s.exercises.map((e) => ({
      exerciseId: e.id,
      name: e.name,
      mode: e.mode,
      note: e.note || '',
      sets: e.sets.map(([weight, reps]) => ({ weight, reps }))
    }))
  }));

  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    sessions,
    logs
  };
}
