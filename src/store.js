import { createStorage } from './storage.js';

export const STORAGE_KEY = 'workout-logger/state/v1';

const emptyState = () => ({ exercises: [], routines: [], sessions: [] });

export function createStore({
  storage = createStorage(),
  genId = () => crypto.randomUUID(),
} = {}) {
  const state = { ...emptyState(), ...storage.load(STORAGE_KEY, emptyState()) };
  const persist = () => storage.save(STORAGE_KEY, state);

  return {
    getState: () => state,

    addExercise({ name, type = '기타', defaultRestSec = 90 }) {
      const ex = { id: genId(), name, type, defaultRestSec };
      state.exercises.push(ex);
      persist();
      return ex;
    },
    listExercises: () => state.exercises,
    updateExercise(id, patch) {
      const ex = state.exercises.find((e) => e.id === id);
      if (!ex) return null;
      Object.assign(ex, patch);
      persist();
      return ex;
    },
    removeExercise(id) {
      const i = state.exercises.findIndex((e) => e.id === id);
      if (i === -1) return false;
      state.exercises.splice(i, 1);
      persist();
      return true;
    },

    addRoutine({ name, items = [] }) {
      const r = { id: genId(), name, items };
      state.routines.push(r);
      persist();
      return r;
    },
    listRoutines: () => state.routines,
    updateRoutine(id, patch) {
      const r = state.routines.find((x) => x.id === id);
      if (!r) return null;
      Object.assign(r, patch);
      persist();
      return r;
    },
    removeRoutine(id) {
      const i = state.routines.findIndex((x) => x.id === id);
      if (i === -1) return false;
      state.routines.splice(i, 1);
      persist();
      return true;
    },

    startSession({ routineId = null, date }) {
      const sess = { id: genId(), date, routineId, logs: [] };
      state.sessions.push(sess);
      persist();
      return sess;
    },
    logSet(sessionId, exerciseId, { weight, reps }) {
      const sess = state.sessions.find((x) => x.id === sessionId);
      if (!sess) return null;
      let log = sess.logs.find((l) => l.exerciseId === exerciseId);
      if (!log) {
        log = { exerciseId, sets: [] };
        sess.logs.push(log);
      }
      log.sets.push({ weight, reps });
      persist();
      return sess;
    },
    getSession: (id) => state.sessions.find((x) => x.id === id) ?? null,
    listSessions: () => [...state.sessions].reverse(),
  };
}
