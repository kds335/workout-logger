import { createStore } from './store.js';
import { renderApp, renderRoutines, renderSession, renderHistory, renderCalendar } from './ui.js';
import { createRestTimer } from './timer.js';
import { lastEntryFor, groupSessionsByDate } from './history.js';
import { DEFAULT_EXERCISES, REST_SEC } from './presets.js';
import { dateKey, buildMonth } from './calendar.js';

const store = createStore();
// 첫 실행: 운동이 하나도 없으면 기본 운동기구를 미리 채움
if (store.listExercises().length === 0) store.seedExercises(DEFAULT_EXERCISES);
const root = document.querySelector('#app');
let tab = 'routines';
let activeSessionId = null;
let creatingRoutine = false;
let editingRoutineId = null;
let restTimer = null;
let restTotal = 0;
let restInterval = null;
let restTarget = REST_SEC; // 현재 휴식의 목표초(±조절 반영) — 세트 기록용
let lastLoggedExercise = null;
const _now = new Date();
let calMonth = { year: _now.getFullYear(), month: _now.getMonth() };
let selectedDay = null;

function getActiveRoutine() {
  const sess = activeSessionId ? store.getSession(activeSessionId) : null;
  if (!sess || !sess.routineId) return null;
  return store.listRoutines().find((r) => r.id === sess.routineId) ?? null;
}
function buildLastEntries() {
  const sessions = store.listSessions().filter((s) => s.id !== activeSessionId);
  const map = {};
  for (const ex of store.listExercises()) {
    const e = lastEntryFor(sessions, ex.id);
    if (e) map[ex.id] = e;
  }
  return map;
}
function currentTimerView() {
  if (!restTimer) return null;
  const pct = restTotal ? Math.round((restTimer.remaining / restTotal) * 100) : 0;
  return { remaining: restTimer.remaining, pct };
}
function startRest(sec) {
  restTimer = createRestTimer(sec);
  restTotal = sec;
  restTarget = sec;
  clearInterval(restInterval);
  restInterval = setInterval(() => {
    restTimer.tick(1);
    if (restTimer.isDone) { beepAndBuzz(); stopRest(); }
    render();
  }, 1000);
  render();
}
function stopRest() {
  clearInterval(restInterval);
  restInterval = null;
  restTimer = null;
}
function beepAndBuzz() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    osc.frequency.value = 880;
    osc.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.25);
  } catch {}
  if (navigator.vibrate) navigator.vibrate(400);
}

function render() {
  renderApp(root, { tab });
  root.querySelectorAll('[data-tab]').forEach((b) =>
    b.addEventListener('click', () => { tab = b.dataset.tab; render(); })
  );
  const screen = root.querySelector('#screen');
  if (tab === 'session') {
    renderSession(screen, {
      session: activeSessionId ? store.getSession(activeSessionId) : null,
      routine: getActiveRoutine(),
      exercises: store.listExercises(),
      lastEntries: buildLastEntries(),
      timer: currentTimerView(),
      restSec: REST_SEC,
      handlers: {
        onLogSet(exId, set) {
          lastLoggedExercise = exId;
          store.logSet(activeSessionId, exId, { ...set, restSec: REST_SEC });
          render();
        },
        onStartRest() { startRest(REST_SEC); },
        onAdjustRest(delta) {
          if (!restTimer) return;
          restTimer.add(delta);
          restTotal = Math.max(restTotal, restTimer.remaining); // 링 비율 100% 넘지 않게
          restTarget = Math.max(0, restTarget + delta);
          if (lastLoggedExercise) store.updateLastSetRest(activeSessionId, lastLoggedExercise, restTarget);
          render();
        },
        onSkipRest() { stopRest(); render(); },
        onFinish() { activeSessionId = null; stopRest(); tab = 'history'; render(); },
      },
    });
  } else if (tab === 'history') {
    const exercises = store.listExercises();
    const routines = store.listRoutines();
    renderHistory(screen, {
      groups: groupSessionsByDate(store.listSessions()),
      routineName: (id) => routines.find((r) => r.id === id)?.name ?? '자유 운동',
      exerciseName: (id) => exercises.find((e) => e.id === id)?.name ?? '(삭제됨)',
    });
  } else if (tab === 'routines') {
    renderRoutines(screen, {
      routines: store.listRoutines(),
      exercises: store.listExercises(),
      creatingRoutine,
      editingRoutine: editingRoutineId ? store.listRoutines().find((r) => r.id === editingRoutineId) ?? null : null,
      handlers: {
        onStart(routineId) {
          const sess = store.startSession({ routineId, date: dateKey(new Date()) });
          activeSessionId = sess.id;
          tab = 'session';
          render();
        },
        onAddExercise(data) { store.addExercise(data); render(); },
        onSeedDefaults() { store.seedExercises(DEFAULT_EXERCISES); render(); },
        onNewRoutine() { creatingRoutine = true; editingRoutineId = null; render(); },
        onEditRoutine(id) { editingRoutineId = id; creatingRoutine = false; render(); },
        onDeleteRoutine(id) { store.removeRoutine(id); render(); },
        onCancelRoutine() { creatingRoutine = false; editingRoutineId = null; render(); },
        onSaveRoutine({ name, exerciseIds }) {
          const byId = new Map(store.listExercises().map((e) => [e.id, e]));
          const items = exerciseIds
            .map((id) => byId.get(id))
            .filter(Boolean)
            .map((ex) => ({ exerciseId: ex.id, targetSets: 3 }));
          if (editingRoutineId) store.updateRoutine(editingRoutineId, { name, items });
          else store.addRoutine({ name, items });
          creatingRoutine = false;
          editingRoutineId = null;
          render();
        },
      },
    });
  } else if (tab === 'calendar') {
    const routines = store.listRoutines();
    renderCalendar(screen, {
      month: buildMonth(calMonth.year, calMonth.month),
      sessionDates: new Set(store.listSessions().filter((s) => s.logs.length > 0).map((s) => s.date)),
      schedule: store.listSchedule(),
      routines,
      routineName: (id) => routines.find((r) => r.id === id)?.name ?? '(삭제됨)',
      selectedDay,
      handlers: {
        onPrevMonth() {
          const m = calMonth.month - 1;
          calMonth = m < 0 ? { year: calMonth.year - 1, month: 11 } : { year: calMonth.year, month: m };
          render();
        },
        onNextMonth() {
          const m = calMonth.month + 1;
          calMonth = m > 11 ? { year: calMonth.year + 1, month: 0 } : { year: calMonth.year, month: m };
          render();
        },
        onSelectDay(dk) { selectedDay = selectedDay === dk ? null : dk; render(); },
        onAssign(dk, routineId) { store.setSchedule(dk, routineId); render(); },
      },
    });
  }
}

render();
window.__store = store;
