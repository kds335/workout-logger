import { createStorage } from './storage.js';

export const STORAGE_KEY = 'workout-logger/state/v1';

const emptyState = () => ({ exercises: [], routines: [], sessions: [], schedule: {}, notes: {} });

// 백업 파일(또는 raw state)을 안전한 state 모양으로 정규화. 이상한 값은 버림.
function normalizeState(payload) {
  const raw = payload && typeof payload === 'object'
    ? (payload.state && typeof payload.state === 'object' ? payload.state : payload)
    : {};
  const arr = (v) => (Array.isArray(v) ? v.filter((x) => x && typeof x === 'object' && x.id) : []);
  const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
  return {
    exercises: arr(raw.exercises),
    routines: arr(raw.routines),
    sessions: arr(raw.sessions),
    schedule: obj(raw.schedule),
    notes: obj(raw.notes),
  };
}
// id 기준 합집합 — 기존이 우선(같은 id면 안 덮음)
function mergeById(existing, incoming) {
  const have = new Set(existing.map((x) => x.id));
  return existing.concat(incoming.filter((x) => !have.has(x.id)));
}

// crypto.randomUUID는 secure context(https/localhost)에서만 존재.
// 폰에서 http://192.168.x 로 열면 비보안이라 undefined → 폴백 사용.
const defaultGenId = () =>
  (globalThis.crypto?.randomUUID
    ? crypto.randomUUID()
    : 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10));

export function createStore({
  storage = createStorage(),
  genId = defaultGenId,
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
    seedExercises(presets) {
      const have = new Set(state.exercises.map((e) => e.name));
      const added = [];
      for (const p of presets) {
        if (have.has(p.name)) continue;
        const ex = { id: genId(), name: p.name, type: p.type ?? '기타', defaultRestSec: p.defaultRestSec ?? 90 };
        state.exercises.push(ex);
        have.add(p.name);
        added.push(ex);
      }
      if (added.length) persist();
      return added;
    },
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
      // 이 루틴 가리키던 달력 스케줄 비움(고아 방지)
      for (const date of Object.keys(state.schedule)) {
        if (state.schedule[date] === id) delete state.schedule[date];
      }
      persist();
      return true;
    },

    setSchedule(date, routineId) {
      if (routineId) state.schedule[date] = routineId;
      else delete state.schedule[date];
      persist();
    },
    getSchedule: (date) => state.schedule[date] ?? null,
    listSchedule: () => state.schedule,

    // 그날 총평 메모. 빈 문자열이면 지움.
    setNote(date, text) {
      const t = (text ?? '').trim();
      if (t) state.notes[date] = t;
      else delete state.notes[date];
      persist();
    },
    getNote: (date) => state.notes[date] ?? null,
    listNotes: () => state.notes,

    startSession({ routineId = null, date }) {
      const sess = { id: genId(), date, routineId, logs: [] };
      state.sessions.push(sess);
      persist();
      return sess;
    },
    logSet(sessionId, exerciseId, { weight, reps, restSec }) {
      const sess = state.sessions.find((x) => x.id === sessionId);
      if (!sess) return null;
      let log = sess.logs.find((l) => l.exerciseId === exerciseId);
      if (!log) {
        log = { exerciseId, sets: [] };
        sess.logs.push(log);
      }
      log.sets.push(restSec === undefined ? { weight, reps } : { weight, reps, restSec });
      persist();
      return sess;
    },
    // 운동 중 휴식 ±조절 시 방금 기록한 세트의 휴식초를 갱신
    updateLastSetRest(sessionId, exerciseId, restSec) {
      const sess = state.sessions.find((x) => x.id === sessionId);
      if (!sess) return;
      const log = sess.logs.find((l) => l.exerciseId === exerciseId);
      if (!log || log.sets.length === 0) return;
      log.sets[log.sets.length - 1].restSec = restSec;
      persist();
    },
    getSession: (id) => state.sessions.find((x) => x.id === id) ?? null,
    listSessions: () => [...state.sessions].reverse(),

    // ── 백업/복원 ──
    // 전체 데이터를 파일로 내보낼 스냅샷. app/버전 표식 포함.
    exportData() {
      return {
        app: 'workout-logger',
        v: 1,
        state: JSON.parse(JSON.stringify(state)),
      };
    },
    // payload = 파일에서 파싱한 객체. mode 'merge'(기본, 기존 유지하며 합침) | 'replace'(전체 덮기)
    // 반환: 반영 후 개수 요약
    importData(payload, mode = 'merge') {
      const inc = normalizeState(payload);
      if (mode === 'replace') {
        state.exercises = inc.exercises;
        state.routines = inc.routines;
        state.sessions = inc.sessions;
        state.schedule = inc.schedule;
        state.notes = inc.notes;
      } else {
        state.exercises = mergeById(state.exercises, inc.exercises);
        state.routines = mergeById(state.routines, inc.routines);
        state.sessions = mergeById(state.sessions, inc.sessions);
        state.schedule = { ...inc.schedule, ...state.schedule }; // 기존 우선
        state.notes = { ...inc.notes, ...state.notes };
      }
      persist();
      return {
        exercises: state.exercises.length,
        routines: state.routines.length,
        sessions: state.sessions.length,
      };
    },
  };
}
