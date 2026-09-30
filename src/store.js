import { createStorage } from './storage.js';

export const STORAGE_KEY = 'workout-logger/state/v1';

const emptyState = () => ({ exercises: [], routines: [], sessions: [], schedule: {}, notes: {}, cardioSessions: [] });

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isText = (v) => typeof v === 'string' && v.trim().length > 0;
const isNonnegative = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0;
const isPositiveInteger = (v) => Number.isSafeInteger(v) && v > 0;
const isDate = (v) => {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const date = new Date(`${v}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === v;
};
const check = (condition, field) => {
  if (!condition) throw new Error(`백업 데이터 형식이 올바르지 않습니다: ${field}`);
};
function cleanName(name, label) {
  if (!isText(name)) throw new Error(`${label} 이름을 입력해 주세요.`);
  return name.trim();
}
function validateSet({ weight, reps, restSec }) {
  if (!isNonnegative(weight)) throw new Error('무게는 0 이상의 숫자로 입력해 주세요.');
  if (!isPositiveInteger(reps)) throw new Error('횟수는 1 이상의 정수로 입력해 주세요.');
  if (restSec !== undefined && !isNonnegative(restSec)) throw new Error('휴식 시간은 0 이상의 숫자로 입력해 주세요.');
}

// 잘못된 파일을 빈 state로 바꾸지 않는다. 모든 중첩 데이터를 검증한 후 복사한다.
// 삭제된 운동/루틴의 과거 기록도 있으므로 참조 id의 현재 존재 여부는 요구하지 않는다.
function normalizeState(payload) {
  check(isObject(payload), '파일');
  const wrapped = 'state' in payload || 'app' in payload || 'v' in payload;
  if (wrapped) check(payload.app === 'workout-logger' && payload.v === 1, '앱 또는 백업 버전');
  const raw = wrapped ? payload.state : payload;
  check(isObject(raw), 'state');
  const result = {};
  for (const key of ['exercises', 'routines', 'sessions', 'cardioSessions']) {
    const items = key === 'cardioSessions' && raw[key] === undefined ? [] : raw[key];
    check(Array.isArray(items), key);
    const ids = new Set();
    for (const item of items) {
      check(isObject(item) && isText(item.id), `${key}.id`);
      check(!ids.has(item.id), `${key}.id 중복`);
      ids.add(item.id);
    }
    result[key] = items;
  }
  for (const exercise of result.exercises) {
    check(isText(exercise.name), 'exercises.name');
    check(exercise.type === undefined || typeof exercise.type === 'string', 'exercises.type');
    check(exercise.defaultRestSec === undefined || isNonnegative(exercise.defaultRestSec), 'exercises.defaultRestSec');
  }
  for (const routine of result.routines) {
    check(isText(routine.name) && Array.isArray(routine.items), 'routines.items');
    for (const item of routine.items) {
      check(isObject(item) && isText(item.exerciseId) && isPositiveInteger(item.targetSets), 'routines.items');
      check(item.restSec === undefined || isNonnegative(item.restSec), 'routines.items.restSec');
    }
  }
  for (const session of result.sessions) {
    check(isDate(session.date), 'sessions.date');
    check(session.routineId == null || isText(session.routineId), 'sessions.routineId');
    check(Array.isArray(session.logs), 'sessions.logs');
    const loggedExercises = new Set();
    for (const log of session.logs) {
      check(isObject(log) && isText(log.exerciseId) && Array.isArray(log.sets), 'sessions.logs');
      check(!loggedExercises.has(log.exerciseId), 'sessions.logs.exerciseId 중복');
      loggedExercises.add(log.exerciseId);
      for (const set of log.sets) {
        check(isObject(set), 'sessions.logs.sets');
        validateSet(set);
      }
    }
  }
  for (const cardio of result.cardioSessions) {
    check(isText(cardio.exerciseId) && isDate(cardio.date) && isNonnegative(cardio.durationSec), 'cardioSessions');
  }
  for (const key of ['schedule', 'notes']) {
    const entries = raw[key] === undefined ? {} : raw[key];
    check(isObject(entries), key);
    for (const [date, value] of Object.entries(entries)) {
      check(isDate(date) && typeof value === 'string' && (key !== 'schedule' || isText(value)), key);
    }
    result[key] = entries;
  }
  return JSON.parse(JSON.stringify(result));
}
function summarize(state) {
  return {
    exercises: state.exercises.length,
    routines: state.routines.length,
    sessions: state.sessions.length,
    cardioSessions: state.cardioSessions.length,
    sets: state.sessions.reduce((total, session) => total + session.logs.reduce((n, log) => n + log.sets.length, 0), 0),
    schedule: Object.keys(state.schedule).length,
    notes: Object.keys(state.notes).length,
  };
}
export function inspectBackup(payload) {
  return summarize(normalizeState(payload));
}
// id 기준 합집합 — 기존이 우선(같은 id면 안 덮음)
function mergeById(existing, incoming) {
  const have = new Set(existing.map((x) => x.id));
  return existing.concat(incoming.filter((x) => {
    if (have.has(x.id)) return false;
    have.add(x.id);
    return true;
  }));
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
  // 저장이 성공한 다음에만 현재 상태를 바꿔 용량 부족 시 재시도가 가능하게 한다.
  const commit = (next) => {
    storage.save(STORAGE_KEY, next);
    Object.assign(state, next);
  };
  const saveRecord = (collection, current, next) => {
    storage.save(STORAGE_KEY, {
      ...state,
      [collection]: state[collection].map((item) => item === current ? next : item),
    });
    Object.assign(current, next);
  };
  const saveSessionLogs = (session, logs) => {
    storage.save(STORAGE_KEY, {
      ...state,
      sessions: state.sessions.map((item) => item === session ? { ...session, logs } : item),
    });
    session.logs = logs;
  };

  return {
    getState: () => state,

    addExercise({ name, type = '기타', defaultRestSec = 90 }) {
      const ex = { id: genId(), name: cleanName(name, '운동'), type, defaultRestSec };
      commit({ ...state, exercises: [...state.exercises, ex] });
      return ex;
    },
    listExercises: () => state.exercises,
    seedExercises(presets) {
      const have = new Set(state.exercises.map((e) => e.name));
      const added = [];
      for (const p of presets) {
        const name = cleanName(p.name, '운동');
        if (have.has(name)) continue;
        const ex = { id: genId(), name, type: p.type ?? '기타', defaultRestSec: p.defaultRestSec ?? 90 };
        have.add(name);
        added.push(ex);
      }
      if (added.length) commit({ ...state, exercises: [...state.exercises, ...added] });
      return added;
    },
    updateExercise(id, patch) {
      const ex = state.exercises.find((e) => e.id === id);
      if (!ex) return null;
      const changes = { ...patch };
      if ('name' in changes) changes.name = cleanName(changes.name, '운동');
      saveRecord('exercises', ex, { ...ex, ...changes });
      return ex;
    },
    removeExercise(id) {
      if (!state.exercises.some((e) => e.id === id)) return false;
      commit({ ...state, exercises: state.exercises.filter((e) => e.id !== id) });
      return true;
    },

    addRoutine({ name, items = [] }) {
      const r = { id: genId(), name: cleanName(name, '루틴'), items };
      commit({ ...state, routines: [...state.routines, r] });
      return r;
    },
    listRoutines: () => state.routines,
    updateRoutine(id, patch) {
      const r = state.routines.find((x) => x.id === id);
      if (!r) return null;
      const changes = { ...patch };
      if ('name' in changes) changes.name = cleanName(changes.name, '루틴');
      saveRecord('routines', r, { ...r, ...changes });
      return r;
    },
    removeRoutine(id) {
      if (!state.routines.some((x) => x.id === id)) return false;
      // 이 루틴 가리키던 달력 스케줄 비움(고아 방지)
      const schedule = Object.fromEntries(Object.entries(state.schedule).filter(([, routineId]) => routineId !== id));
      commit({ ...state, routines: state.routines.filter((x) => x.id !== id), schedule });
      return true;
    },

    setSchedule(date, routineId) {
      const schedule = { ...state.schedule };
      if (routineId) schedule[date] = routineId;
      else delete schedule[date];
      commit({ ...state, schedule });
    },
    getSchedule: (date) => state.schedule[date] ?? null,
    listSchedule: () => state.schedule,

    // 그날 총평 메모. 빈 문자열이면 지움.
    setNote(date, text) {
      const t = (text ?? '').trim();
      const notes = { ...state.notes };
      if (t) notes[date] = t;
      else delete notes[date];
      commit({ ...state, notes });
    },
    getNote: (date) => state.notes[date] ?? null,
    listNotes: () => state.notes,

    startSession({ routineId = null, date }) {
      const sess = { id: genId(), date, routineId, logs: [] };
      commit({ ...state, sessions: [...state.sessions, sess] });
      return sess;
    },
    logSet(sessionId, exerciseId, { weight, reps, restSec }) {
      const sess = state.sessions.find((x) => x.id === sessionId);
      if (!sess) return null;
      if (!isText(exerciseId)) throw new Error('기록할 운동을 선택해 주세요.');
      validateSet({ weight, reps, restSec });
      const set = restSec === undefined ? { weight, reps } : { weight, reps, restSec };
      const log = sess.logs.find((l) => l.exerciseId === exerciseId);
      const logs = log
        ? sess.logs.map((item) => item === log ? { ...log, sets: [...log.sets, set] } : item)
        : [...sess.logs, { exerciseId, sets: [set] }];
      saveSessionLogs(sess, logs);
      return sess;
    },
    updateSet(sessionId, exerciseId, index, { weight, reps }) {
      const sess = state.sessions.find((x) => x.id === sessionId);
      const log = sess?.logs.find((l) => l.exerciseId === exerciseId);
      if (!log || !Number.isInteger(index) || index < 0 || index >= log.sets.length) return null;
      validateSet({ weight, reps });
      const set = { ...log.sets[index], weight, reps };
      const sets = log.sets.map((item, i) => i === index ? set : item);
      saveSessionLogs(sess, sess.logs.map((item) => item === log ? { ...log, sets } : item));
      return set;
    },
    removeSet(sessionId, exerciseId, index) {
      const sess = state.sessions.find((x) => x.id === sessionId);
      const log = sess?.logs.find((l) => l.exerciseId === exerciseId);
      if (!log || !Number.isInteger(index) || index < 0 || index >= log.sets.length) return false;
      const sets = log.sets.filter((_, i) => i !== index);
      const logs = sets.length
        ? sess.logs.map((item) => item === log ? { ...log, sets } : item)
        : sess.logs.filter((item) => item !== log);
      saveSessionLogs(sess, logs);
      return true;
    },
    removeSession(id) {
      if (!state.sessions.some((session) => session.id === id)) return false;
      commit({ ...state, sessions: state.sessions.filter((session) => session.id !== id) });
      return true;
    },
    // 운동 중 휴식 ±조절 시 방금 기록한 세트의 휴식초를 갱신
    updateLastSetRest(sessionId, exerciseId, restSec) {
      const sess = state.sessions.find((x) => x.id === sessionId);
      if (!sess) return;
      const log = sess.logs.find((l) => l.exerciseId === exerciseId);
      if (!log || log.sets.length === 0) return;
      if (!isNonnegative(restSec)) throw new Error('휴식 시간은 0 이상의 숫자로 입력해 주세요.');
      const sets = log.sets.map((set, index) => index === log.sets.length - 1 ? { ...set, restSec } : set);
      saveSessionLogs(sess, sess.logs.map((item) => item === log ? { ...log, sets } : item));
    },
    getSession: (id) => state.sessions.find((x) => x.id === id) ?? null,
    listSessions: () => [...state.sessions].reverse(),

    // ── 유산소: 시간만 기록(무게/세트 없음) ──
    addCardioSession({ id = genId(), exerciseId, durationSec, date }) {
      if (!isText(id)) throw new Error('유산소 기록 식별자가 올바르지 않습니다.');
      const existing = state.cardioSessions.find((item) => item.id === id);
      if (existing) return existing;
      if (!isText(exerciseId) || !isNonnegative(durationSec) || !isDate(date)) throw new Error('유산소 운동과 시간을 확인해 주세요.');
      const c = { id, exerciseId, durationSec, date };
      commit({ ...state, cardioSessions: [...state.cardioSessions, c] });
      return c;
    },
    listCardioSessions: () => [...state.cardioSessions].reverse(),
    removeCardioSession(id) {
      if (!state.cardioSessions.some((x) => x.id === id)) return false;
      commit({ ...state, cardioSessions: state.cardioSessions.filter((x) => x.id !== id) });
      return true;
    },

    // ── 백업/복원 ──
    inspectBackup,
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
      if (mode !== 'merge' && mode !== 'replace') throw new Error('지원하지 않는 복원 방식입니다.');
      const inc = normalizeState(payload);
      const next = mode === 'replace' ? inc : {
        exercises: mergeById(state.exercises, inc.exercises),
        routines: mergeById(state.routines, inc.routines),
        sessions: mergeById(state.sessions, inc.sessions),
        cardioSessions: mergeById(state.cardioSessions, inc.cardioSessions),
        schedule: { ...inc.schedule, ...state.schedule }, // 기존 우선
        notes: { ...inc.notes, ...state.notes },
      };
      commit(next);
      return summarize(state);
    },
  };
}
