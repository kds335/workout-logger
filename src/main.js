import { createStore } from './store.js';
import { renderApp, renderRoutines, renderSession, renderCardio, renderHistory, renderCalendar, fmtTime } from './ui.js';
import { createRestTimer } from './timer.js';
import { lastEntryFor, buildDayHistory } from './history.js';
import { DEFAULT_EXERCISES, REST_SEC, CARDIO_TYPE } from './presets.js';
import { dateKey, buildMonth } from './calendar.js';

const store = createStore();
// 첫 실행: 운동이 하나도 없으면 기본 운동기구를 미리 채움
if (store.listExercises().length === 0) store.seedExercises(DEFAULT_EXERCISES);
// 유산소는 나중에 추가된 기능 — 기존 사용자도 유산소 기구가 하나도 없으면 한 번 채움
if (!store.listExercises().some((e) => e.type === CARDIO_TYPE)) {
  store.seedExercises(DEFAULT_EXERCISES.filter((e) => e.type === CARDIO_TYPE));
}
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

// 유산소 상태
let cardioSelectedId = null;      // 고른 기구 id (null = 기구 고르기 화면)
let cardioMode = 'count';         // 'count'(카운트다운) | 'stop'(스톱워치)
let cardioTargetSec = 30 * 60;    // 카운트다운 목표(기본 30분)
let cardioRunning = false;
let cardioPaused = false;
let cardioElapsed = 0;            // 경과초
let cardioInterval = null;

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
// 매초 tick엔 전체 re-render 대신 링/숫자만 갱신 → 입력칸이 안 날아가서 휴식 중에도 키보드 유지·다음 세트 입력 가능
function updateTimerView() {
  const view = currentTimerView();
  const ring = root.querySelector('.timer-ring');
  if (!ring || !view) return;
  ring.style.background = `radial-gradient(closest-side, var(--bg) 79%, transparent 80%), conic-gradient(var(--accent) ${view.pct}%, var(--surface-2) 0)`;
  const t = ring.querySelector('.t');
  if (t) t.textContent = fmtTime(view.remaining);
}
function startRest(sec) {
  restTimer = createRestTimer(sec);
  restTotal = sec;
  restTarget = sec;
  clearInterval(restInterval);
  restInterval = setInterval(() => {
    restTimer.tick(1);
    if (restTimer.isDone) { beepAndBuzz(); stopRest(); render(); return; }
    updateTimerView();
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

// ── 유산소 타이머 ──
function cardioDisplaySec() {
  return cardioMode === 'count' ? Math.max(0, cardioTargetSec - cardioElapsed) : cardioElapsed;
}
function updateCardioView() {
  const ring = root.querySelector('.timer-ring');
  const t = ring && ring.querySelector('.t');
  if (!t) return;
  t.textContent = fmtTime(cardioDisplaySec());
  if (cardioMode === 'count') {
    const pct = cardioTargetSec ? Math.round((cardioDisplaySec() / cardioTargetSec) * 100) : 0;
    ring.style.background = `radial-gradient(closest-side, var(--bg) 79%, transparent 80%), conic-gradient(var(--accent) ${pct}%, var(--surface-2) 0)`;
  }
}
function cardioTick() {
  if (cardioPaused) return;
  cardioElapsed += 1;
  if (cardioMode === 'count' && cardioElapsed >= cardioTargetSec) { beepAndBuzz(); finishCardio(); return; }
  updateCardioView();
}
function startCardioTimer() {
  cardioRunning = true;
  cardioPaused = false;
  cardioElapsed = 0;
  clearInterval(cardioInterval);
  cardioInterval = setInterval(cardioTick, 1000);
  render();
}
function stopCardioTimer() {
  clearInterval(cardioInterval);
  cardioInterval = null;
  cardioRunning = false;
  cardioPaused = false;
  cardioElapsed = 0;
}
function finishCardio() {
  // 카운트다운: 목표 도달=목표시간, 조기종료=경과만큼. 스톱워치: 경과.
  const durationSec = cardioMode === 'count' ? Math.min(cardioElapsed, cardioTargetSec) : cardioElapsed;
  if (durationSec > 0 && cardioSelectedId) {
    store.addCardioSession({ exerciseId: cardioSelectedId, durationSec, date: dateKey(new Date()) });
  }
  stopCardioTimer();
  cardioSelectedId = null; // 기구 고르기로 복귀
  render();
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
          updateTimerView();
        },
        onSkipRest() { stopRest(); render(); },
        onFinish() { activeSessionId = null; stopRest(); tab = 'history'; render(); },
      },
    });
  } else if (tab === 'cardio') {
    const machines = store.listExercises().filter((e) => e.type === CARDIO_TYPE);
    const selected = machines.find((m) => m.id === cardioSelectedId) || null;
    const view = !cardioSelectedId ? 'pick' : cardioRunning ? 'run' : 'setup';
    const exName = (id) => store.listExercises().find((e) => e.id === id)?.name ?? '(삭제됨)';
    renderCardio(screen, {
      machines,
      view,
      selectedId: cardioSelectedId,
      machineName: selected ? selected.name : '',
      mode: cardioMode,
      targetSec: cardioTargetSec,
      displaySec: cardioDisplaySec(),
      pct: cardioTargetSec ? Math.round((cardioDisplaySec() / cardioTargetSec) * 100) : 0,
      paused: cardioPaused,
      recent: store.listCardioSessions().slice(0, 15),
      exerciseName: exName,
      handlers: {
        onPick(id) { cardioSelectedId = id; render(); },
        onUnpick() { cardioSelectedId = null; render(); },
        onSetMode(m) { cardioMode = m; render(); },
        onSetTarget(sec) { cardioTargetSec = Math.max(60, sec); render(); },
        onAdjustTarget(delta) { cardioTargetSec = Math.max(60, cardioTargetSec + delta); render(); },
        onStart() { startCardioTimer(); },
        onPauseResume() { cardioPaused = !cardioPaused; render(); },
        onFinish() { finishCardio(); },
        onDeleteRecent(id) { store.removeCardioSession(id); render(); },
      },
    });
  } else if (tab === 'history') {
    const exercises = store.listExercises();
    const routines = store.listRoutines();
    renderHistory(screen, {
      groups: buildDayHistory(store.listSessions(), store.listCardioSessions()),
      routineName: (id) => routines.find((r) => r.id === id)?.name ?? '자유 운동',
      exerciseName: (id) => exercises.find((e) => e.id === id)?.name ?? '(삭제됨)',
      noteFor: (dk) => store.getNote(dk),
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
        onExport() {
          const dump = store.exportData();
          const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `workout-backup-${dateKey(new Date())}.json`;
          document.body.appendChild(a);
          a.click();
          a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        },
        onImport(file) {
          const reader = new FileReader();
          reader.onload = () => {
            let data;
            try { data = JSON.parse(reader.result); }
            catch { window.alert('불러오기 실패: 올바른 백업 파일이 아니야.'); return; }
            const merge = window.confirm(
              '복원 방식을 골라줘.\n\n확인 = 지금 데이터에 합치기 (기존 유지, 안전)\n취소 = 전체 덮어쓰기 (현재 기기 데이터 삭제)'
            );
            const mode = merge ? 'merge' : 'replace';
            if (mode === 'replace' && !window.confirm('정말 전체 덮어쓸까? 현재 기기에 저장된 내용은 사라져.')) return;
            const r = store.importData(data, mode);
            window.alert(`복원 완료 — 운동 ${r.exercises} · 루틴 ${r.routines} · 기록 ${r.sessions}개`);
            render();
          };
          reader.onerror = () => window.alert('파일을 읽지 못했어.');
          reader.readAsText(file);
        },
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
      sessionDates: new Set([
        ...store.listSessions().filter((s) => s.logs.length > 0).map((s) => s.date),
        ...store.listCardioSessions().map((c) => c.date),
      ]),
      schedule: store.listSchedule(),
      notes: store.listNotes(),
      todayKey: dateKey(new Date()),
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
        onSaveNote(dk, text) { store.setNote(dk, text); render(); },
      },
    });
  }
}

render();
window.__store = store;
