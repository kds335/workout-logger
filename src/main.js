import { createStore } from './store.js';
import { renderApp, renderRoutines, renderSession, renderHistory } from './ui.js';
import { createRestTimer } from './timer.js';
import { lastEntryFor, totalVolume } from './history.js';
import { DEFAULT_EXERCISES } from './presets.js';

const store = createStore();
// 첫 실행: 운동이 하나도 없으면 기본 운동기구를 미리 채움
if (store.listExercises().length === 0) store.seedExercises(DEFAULT_EXERCISES);
const root = document.querySelector('#app');
let tab = 'routines';
let activeSessionId = null;
let creatingRoutine = false;
let restTimer = null;
let restTotal = 0;
let restInterval = null;

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
      handlers: {
        onLogSet(exId, set) { store.logSet(activeSessionId, exId, set); render(); },
        onStartRest(restSec) { startRest(restSec); },
        onFinish() { activeSessionId = null; stopRest(); tab = 'history'; render(); },
      },
    });
  } else if (tab === 'history') {
    const exercises = store.listExercises();
    const routines = store.listRoutines();
    renderHistory(screen, {
      sessions: store.listSessions(),
      routineName: (id) => routines.find((r) => r.id === id)?.name ?? '자유 운동',
      exerciseName: (id) => exercises.find((e) => e.id === id)?.name ?? '(삭제됨)',
      volumeOf: (s) => totalVolume(s),
    });
  } else if (tab === 'routines') {
    renderRoutines(screen, {
      routines: store.listRoutines(),
      exercises: store.listExercises(),
      creatingRoutine,
      handlers: {
        onStart(routineId) {
          const sess = store.startSession({ routineId, date: new Date().toISOString().slice(0, 10) });
          activeSessionId = sess.id;
          tab = 'session';
          render();
        },
        onAddExercise(data) { store.addExercise(data); render(); },
        onSeedDefaults() { store.seedExercises(DEFAULT_EXERCISES); render(); },
        onNewRoutine() { creatingRoutine = true; render(); },
        onCancelRoutine() { creatingRoutine = false; render(); },
        onCreateRoutine({ name, exerciseIds }) {
          const byId = new Map(store.listExercises().map((e) => [e.id, e]));
          const items = exerciseIds
            .map((id) => byId.get(id))
            .filter(Boolean)
            .map((ex) => ({ exerciseId: ex.id, targetSets: 3, restSec: ex.defaultRestSec }));
          store.addRoutine({ name, items });
          creatingRoutine = false;
          render();
        },
      },
    });
  }
}

render();
window.__store = store;
