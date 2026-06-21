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
  };
}
