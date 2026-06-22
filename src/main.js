import { createStore } from './store.js';
import { renderApp, renderRoutines } from './ui.js';

const store = createStore();
const root = document.querySelector('#app');
let tab = 'routines';
let activeSessionId = null;

function render() {
  renderApp(root, { tab });
  root.querySelectorAll('[data-tab]').forEach((b) =>
    b.addEventListener('click', () => { tab = b.dataset.tab; render(); })
  );
  const screen = root.querySelector('#screen');
  if (tab === 'routines') {
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
