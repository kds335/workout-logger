import { createStore } from './store.js';
import { renderApp, renderRoutines, renderSession } from './ui.js';
import { createRestTimer } from './timer.js';
import { lastEntryFor } from './history.js';

const store = createStore();
const root = document.querySelector('#app');
let tab = 'routines';
let activeSessionId = null;
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
  } else if (tab === 'routines') {
    renderRoutines(screen, {
      routines: store.listRoutines(),
      exercises: store.listExercises(),
      handlers: {
        onStart(routineId) {
          const sess = store.startSession({ routineId, date: new Date().toISOString().slice(0, 10) });
          activeSessionId = sess.id;
          tab = 'session';
          render();
        },
        onAddExercise(data) { store.addExercise(data); render(); },
        onAddRoutine() {
          const name = window.prompt('루틴 이름?');
          if (!name) return;
          const exs = store.listExercises();
          if (exs.length === 0) { window.alert('운동을 먼저 추가해.'); return; }
          const picked = window.prompt(
            '포함할 운동 번호 쉼표로 (예: 1,3)\n' + exs.map((e, i) => `${i + 1}. ${e.name}`).join('\n')
          );
          if (!picked) return;
          const items = picked.split(',').map((s) => {
            const ex = exs[Number(s.trim()) - 1];
            return ex ? { exerciseId: ex.id, targetSets: 3, restSec: ex.defaultRestSec } : null;
          }).filter(Boolean);
          store.addRoutine({ name, items });
          render();
        },
      },
    });
  }
}

render();
window.__store = store;
