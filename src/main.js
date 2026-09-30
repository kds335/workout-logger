import { createStore, inspectBackup } from './store.js';
import { createStorage } from './storage.js';
import { renderApp, renderRoutines, renderSession, renderCardio, renderHistory, renderCalendar, fmtTime } from './ui.js';
import { createDeadlineTimer, createElapsedTimer } from './timer.js';
import { lastEntryFor, buildDayHistory } from './history.js';
import { DEFAULT_EXERCISES, REST_SEC, CARDIO_TYPE } from './presets.js';
import { dateKey, buildMonth } from './calendar.js';

const store = createStore();
if (store.listExercises().length === 0) store.seedExercises(DEFAULT_EXERCISES);
if (!store.listExercises().some((e) => e.type === CARDIO_TYPE)) {
  store.seedExercises(DEFAULT_EXERCISES.filter((e) => e.type === CARDIO_TYPE));
}
const root = document.querySelector('#app');
const activityStorage = createStorage();
const ACTIVITY_KEY = 'workout-logger/activity/v1';
const saved = activityStorage.load(ACTIVITY_KEY, {}) || {};
let activeSessionId = store.getSession(saved.activeSessionId) ? saved.activeSessionId : null;
let tab = activeSessionId ? 'session' : 'routines';
let creatingRoutine = false;
let editingRoutineId = null;
let restSec = [60, 90, 120, 180].includes(saved.restSec) ? saved.restSec : REST_SEC;
let restTimer = activeSessionId && Number.isFinite(saved.rest?.deadlineAt)
  ? createDeadlineTimer(0, { snapshot: saved.rest }) : null;
let restTotal = Number.isFinite(saved.restTotal) ? saved.restTotal : restSec;
let restTarget = Number.isFinite(saved.restTarget) ? saved.restTarget : restSec;
let lastLoggedExercise = saved.lastLoggedExercise || null;
let drafts = activeSessionId && saved.drafts && typeof saved.drafts === 'object' ? saved.drafts : {};
const today = new Date();
let calMonth = { year: today.getFullYear(), month: today.getMonth() };
let selectedDay = null;
let cardio = null;
let cardioSelectedId = null;
let cardioMode = saved.cardioMode === 'stop' ? 'stop' : 'count';
let cardioTargetSec = Number.isFinite(saved.cardioTargetSec) && saved.cardioTargetSec >= 60 ? saved.cardioTargetSec : 1800;
const savedCardio = saved.cardio;
if (savedCardio && typeof savedCardio.id === 'string' && !store.listCardioSessions().some((item) => item.id === savedCardio.id)
    && /^\d{4}-\d{2}-\d{2}$/.test(savedCardio.date)
    && ['count', 'stop'].includes(savedCardio.mode) && Number.isFinite(savedCardio.targetSec) && savedCardio.targetSec >= 60
    && store.listExercises().some((e) => e.id === savedCardio.exerciseId && e.type === CARDIO_TYPE)) {
  cardio = { ...savedCardio, timer: createElapsedTimer({ snapshot: savedCardio.timer }) };
  cardioSelectedId = cardio.exerciseId;
  cardioMode = cardio.mode;
  cardioTargetSec = cardio.targetSec;
  if (!activeSessionId) tab = 'cardio';
}

let toastTimeout;
function notify(message) {
  let toast = document.querySelector('#app-notice');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'app-notice';
    toast.className = 'app-notice';
    toast.setAttribute('role', 'status');
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.hidden = false;
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => { toast.hidden = true; }, 5000);
}

function safeHandlers(handlers) {
  return Object.fromEntries(Object.entries(handlers).map(([name, handler]) => [name, (...args) => {
    try { return handler(...args); }
    catch (error) { notify(`변경을 저장하지 못했어요. ${error.message || '저장 공간을 확인하고 다시 시도해 주세요.'}`); }
  }]));
}

let activitySaveFailed = false;
function persistActivity() {
  try {
    activityStorage.save(ACTIVITY_KEY, {
      activeSessionId, restSec, rest: restTimer?.snapshot() ?? null,
      restTotal, restTarget, lastLoggedExercise, drafts, cardioMode, cardioTargetSec,
      cardio: cardio ? { id: cardio.id, exerciseId: cardio.exerciseId, date: cardio.date,
        mode: cardio.mode, targetSec: cardio.targetSec, timer: cardio.timer.snapshot() } : null,
    });
    activitySaveFailed = false;
  } catch {
    if (!activitySaveFailed) notify('진행 상태를 저장하지 못했어요. 저장 공간을 확인하고 백업해 주세요.');
    activitySaveFailed = true;
  }
}

function captureDrafts() {
  root.querySelectorAll('[data-ex]').forEach((card) => {
    const weight = card.querySelector('.in-weight');
    const reps = card.querySelector('.in-reps');
    if (weight && reps) drafts[card.dataset.ex] = { weight: weight.value, reps: reps.value };
  });
}
root.addEventListener('input', (event) => {
  if (event.target.matches('.in-weight, .in-reps')) { captureDrafts(); persistActivity(); }
});

function getActiveRoutine() {
  const sess = store.getSession(activeSessionId);
  return store.listRoutines().find((r) => r.id === sess?.routineId) ?? null;
}
function buildLastEntries() {
  const sessions = store.listSessions().filter((s) => s.id !== activeSessionId);
  return Object.fromEntries(store.listExercises().map((ex) => [ex.id, lastEntryFor(sessions, ex.id)]));
}
function currentTimerView() {
  if (!restTimer) return null;
  return { remaining: restTimer.remaining, pct: restTotal ? Math.min(100, Math.round(restTimer.remaining / restTotal * 100)) : 0 };
}

let audioContext;
function unlockAudio() {
  try {
    audioContext ??= new (window.AudioContext || window.webkitAudioContext)();
    audioContext.resume().catch(() => {});
  } catch { /* Audio is optional. Elapsed time never depends on it. */ }
}
function beepAndBuzz() {
  try {
    if (audioContext?.state === 'running') {
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      gain.gain.value = 0.12;
      oscillator.frequency.value = 880;
      oscillator.connect(gain).connect(audioContext.destination);
      oscillator.start();
      oscillator.stop(audioContext.currentTime + 0.25);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
    }
  } catch {}
  navigator.vibrate?.(400);
}

function startRest(seconds) {
  unlockAudio();
  restTimer = createDeadlineTimer(seconds);
  restTotal = seconds;
  restTarget = seconds;
  persistActivity();
}
function stopRest() {
  restTimer = null;
  persistActivity();
}
function cardioDisplaySec() {
  const elapsed = cardio?.timer.elapsedSec ?? 0;
  return cardioMode === 'count' ? Math.max(0, cardioTargetSec - elapsed) : elapsed;
}
function startCardioTimer() {
  unlockAudio();
  cardio = {
    id: `cardio-${globalThis.crypto?.randomUUID?.() ?? Date.now() + '-' + Math.random().toString(36).slice(2)}`,
    exerciseId: cardioSelectedId, date: dateKey(new Date()), mode: cardioMode,
    targetSec: cardioTargetSec, timer: createElapsedTimer(),
  };
  cardio.timer.start();
  persistActivity();
  render();
}
function finishCardio(automatic = false) {
  if (!cardio) return;
  const durationSec = cardio.mode === 'count' ? Math.min(cardio.timer.elapsedSec, cardio.targetSec) : cardio.timer.elapsedSec;
  if (!automatic && durationSec === 0 && !window.confirm('아직 1초가 지나지 않았어요. 기록 없이 종료할까요?')) return;
  if (durationSec > 0) {
    // Persist an id before starting so reloading between these writes cannot duplicate a record.
    try {
      store.addCardioSession({ id: cardio.id, exerciseId: cardio.exerciseId, durationSec, date: cardio.date });
    } catch {
      cardio.timer.pause();
      cardio.saveFailed = true;
      persistActivity();
      if (tab === 'cardio') render();
      notify('유산소 기록을 저장하지 못했어요. 공간을 확보한 뒤 ‘마치고 기록’을 다시 눌러주세요.');
      return;
    }
  }
  cardio = null;
  cardioSelectedId = null;
  persistActivity();
  if (tab === 'cardio' || tab === 'history') render();
  else {
    const nav = root.querySelector('[data-tab="cardio"]');
    nav?.querySelector('.tab-status')?.remove();
    if (tab === 'calendar') {
      // Do not rebuild the calendar while the user is composing a note.
      for (const item of store.listCardioSessions()) {
        const cell = root.querySelector(`[data-day="${item.date}"]`);
        if (cell && !cell.classList.contains('did')) {
          cell.classList.add('did');
          cell.querySelector('.cal-marks')?.insertAdjacentHTML('afterbegin', '<i class="mk-did"></i>');
        }
      }
    }
  }
  notify(durationSec > 0 ? `유산소 ${fmtTime(durationSec)} 기록을 저장했어요.` : '유산소를 종료했어요.');
}

function refreshTimers() {
  if (restTimer?.isDone) {
    stopRest();
    root.querySelector('[data-timer="rest"]')?.remove();
    beepAndBuzz();
    notify('휴식이 끝났어요. 다음 세트를 시작하세요.');
  }
  const rest = currentTimerView();
  const restElement = root.querySelector('[data-timer="rest"]');
  if (rest && restElement) {
    const time = restElement.querySelector('.t');
    if (time) time.textContent = fmtTime(rest.remaining);
    restElement.querySelector('.rest-progress')?.style.setProperty('--progress', `${rest.pct}%`);
  }
  if (cardio?.mode === 'count' && !cardio.saveFailed && cardio.timer.elapsedSec >= cardio.targetSec) {
    beepAndBuzz();
    finishCardio(true);
  }
  const ring = root.querySelector('[data-timer="cardio"]');
  if (cardio && ring) {
    const time = ring.querySelector('.t');
    if (time) time.textContent = fmtTime(cardioDisplaySec());
    if (cardioMode === 'count') {
      const pct = Math.min(100, cardioDisplaySec() / cardioTargetSec * 100);
      ring.style.background = `radial-gradient(closest-side, var(--bg) 79%, transparent 80%), conic-gradient(var(--accent) ${pct}%, var(--surface-2) 0)`;
    }
  }
}

function exportBackup(filename = `workout-backup-${dateKey(new Date())}.json`) {
  const blob = new Blob([JSON.stringify(store.exportData(), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function importBackup(file) {
  let data, summary;
  try { data = JSON.parse(await file.text()); summary = inspectBackup(data); }
  catch (error) { window.alert(`불러오기 실패: ${error.message}`); return; }
  const dialog = document.createElement('dialog');
  dialog.className = 'backup-dialog';
  dialog.setAttribute('aria-labelledby', 'backup-title');
  dialog.innerHTML = `<h2 id="backup-title">백업 불러오기</h2>
    <p>운동 ${summary.exercises}개 · 루틴 ${summary.routines}개<br>근력 기록 ${summary.sessions}개 · 유산소 ${summary.cardioSessions}개</p>
    <p class="dim">합치기는 현재 기록을 유지하고 없는 기록만 추가해요.</p>
    <button class="btn-primary" data-mode="merge" autofocus>기존 기록에 합치기</button>
    <button class="btn-primary secondary" data-mode="replace">이 백업으로 전체 교체</button>
    <button class="btn-primary secondary" id="backup-cancel">취소</button>`;
  document.body.appendChild(dialog);
  dialog.addEventListener('close', () => dialog.remove());
  dialog.querySelector('#backup-cancel').onclick = () => dialog.close();
  dialog.querySelectorAll('[data-mode]').forEach((button) => {
    button.onclick = () => {
      const mode = button.dataset.mode;
      if (mode === 'replace') {
        if (activeSessionId || cardio) { window.alert('진행 중인 운동을 종료한 다음 전체 교체해 주세요. 합치기는 지금도 가능해요.'); return; }
        if (!window.confirm('현재 기록을 백업 파일의 내용으로 전체 교체할까요? 교체 전 복구용 백업도 다운로드합니다.')) return;
        exportBackup(`workout-before-restore-${dateKey(new Date())}.json`);
      }
      try {
        const result = store.importData(data, mode);
        dialog.close();
        render();
        notify(`불러오기 완료 · 루틴 ${result.routines}개 · 근력 기록 ${result.sessions}개`);
      } catch (error) { window.alert(`복원하지 못했어요: ${error.message}`); }
    };
  });
  dialog.showModal();
}

function render({ capture = true } = {}) {
  if (capture) captureDrafts();
  const scrollY = window.scrollY;
  renderApp(root, { tab, activeSession: !!activeSessionId, cardioRunning: !!cardio });
  root.querySelectorAll('[data-tab]').forEach((button) => button.addEventListener('click', () => {
    captureDrafts();
    persistActivity();
    tab = button.dataset.tab;
    render({ capture: false });
    window.scrollTo(0, 0);
  }));
  const screen = root.querySelector('#screen');
  if (tab === 'session') {
    renderSession(screen, {
      session: store.getSession(activeSessionId), routine: getActiveRoutine(), exercises: store.listExercises(),
      lastEntries: buildLastEntries(), timer: currentTimerView(), restSec,
      handlers: safeHandlers({
        onLogSet(exerciseId, set) {
          captureDrafts();
          try { store.logSet(activeSessionId, exerciseId, { ...set, restSec }); }
          catch { notify('세트를 저장하지 못했어요. 저장 공간을 확인하고 다시 완료를 눌러주세요.'); return; }
          lastLoggedExercise = exerciseId;
          delete drafts[exerciseId];
          startRest(restSec);
          render({ capture: false });
        },
        onUpdateSet(exerciseId, index, set) { store.updateSet(activeSessionId, exerciseId, index, set); render(); notify('세트를 수정했어요.'); },
        onRemoveSet(exerciseId, index) {
          const sets = store.getSession(activeSessionId)?.logs.find((log) => log.exerciseId === exerciseId)?.sets ?? [];
          const removesRestTarget = exerciseId === lastLoggedExercise && index === sets.length - 1;
          store.removeSet(activeSessionId, exerciseId, index);
          if (removesRestTarget) { lastLoggedExercise = null; stopRest(); }
          render(); notify('세트를 삭제했어요.');
        },
        onSetRestSec(seconds) { restSec = seconds; persistActivity(); render(); },
        onAdjustRest(delta) {
          if (!restTimer) return;
          const nextTarget = Math.max(0, restTarget + delta);
          if (lastLoggedExercise) store.updateLastSetRest(activeSessionId, lastLoggedExercise, nextTarget);
          restTimer.add(delta);
          restTotal = Math.max(restTotal, restTimer.remaining);
          restTarget = nextTarget;
          persistActivity();
          refreshTimers();
        },
        onSkipRest() { stopRest(); render(); },
        onFinish() {
          if (!window.confirm('운동을 마칠까요? 완료한 세트는 이미 저장되어 있어요.')) return;
          const session = store.getSession(activeSessionId);
          if (session && !session.logs.some((log) => log.sets.length)) store.removeSession(session.id);
          activeSessionId = null;
          lastLoggedExercise = null;
          drafts = {};
          stopRest();
          tab = 'history';
          render({ capture: false });
          window.scrollTo(0, 0);
          notify('운동 기록을 저장했어요.');
        },
      }),
    });
    root.querySelectorAll('[data-ex]').forEach((card) => {
      const draft = drafts[card.dataset.ex];
      if (!draft) return;
      card.querySelector('.in-weight').value = draft.weight ?? '';
      card.querySelector('.in-reps').value = draft.reps ?? '';
    });
  } else if (tab === 'cardio') {
    const machines = store.listExercises().filter((e) => e.type === CARDIO_TYPE);
    renderCardio(screen, {
      machines, view: !cardioSelectedId ? 'pick' : cardio ? 'run' : 'setup', selectedId: cardioSelectedId,
      machineName: machines.find((machine) => machine.id === cardioSelectedId)?.name ?? '',
      mode: cardioMode, targetSec: cardioTargetSec, displaySec: cardioDisplaySec(),
      pct: cardioTargetSec ? Math.min(100, Math.round(cardioDisplaySec() / cardioTargetSec * 100)) : 0,
      paused: cardio ? !cardio.timer.running : false, recent: store.listCardioSessions().slice(0, 15),
      exerciseName: (id) => store.listExercises().find((e) => e.id === id)?.name ?? '(삭제됨)',
      handlers: safeHandlers({
        onPick(id) { cardioSelectedId = id; render(); },
        onUnpick() { cardioSelectedId = null; render(); },
        onSetMode(mode) { cardioMode = mode; persistActivity(); render(); },
        onSetTarget(seconds) { cardioTargetSec = Math.max(60, seconds); persistActivity(); render(); },
        onAdjustTarget(delta) { cardioTargetSec = Math.max(60, cardioTargetSec + delta); persistActivity(); render(); },
        onStart: startCardioTimer,
        onPauseResume() {
          if (!cardio) return;
          if (cardio.saveFailed) { notify('완료한 기록이 저장을 기다리고 있어요. ‘마치고 기록’을 다시 눌러주세요.'); return; }
          refreshTimers();
          if (!cardio) return;
          if (cardio.timer.running) cardio.timer.pause();
          else { unlockAudio(); cardio.timer.resume(); }
          persistActivity();
          render();
        },
        onFinish() { finishCardio(); },
        onDeleteRecent(id) { store.removeCardioSession(id); render(); },
      }),
    });
  } else if (tab === 'history') {
    renderHistory(screen, {
      groups: buildDayHistory(store.listSessions(), store.listCardioSessions()),
      routineName: (id) => store.listRoutines().find((r) => r.id === id)?.name ?? '자유 운동',
      exerciseName: (id) => store.listExercises().find((e) => e.id === id)?.name ?? '(삭제됨)',
      noteFor: (day) => store.getNote(day),
    });
  } else if (tab === 'routines') {
    renderRoutines(screen, {
      routines: store.listRoutines(), exercises: store.listExercises(), creatingRoutine,
      activeRoutineName: activeSessionId ? getActiveRoutine()?.name ?? '진행 중인 운동' : null,
      editingRoutine: store.listRoutines().find((r) => r.id === editingRoutineId) ?? null,
      handlers: safeHandlers({
        onResume() { tab = 'session'; render(); window.scrollTo(0, 0); },
        onStart(routineId) {
          if (activeSessionId) {
            tab = 'session'; render(); window.scrollTo(0, 0);
            notify('진행 중인 운동을 먼저 마쳐 주세요.'); return;
          }
          activeSessionId = store.startSession({ routineId, date: dateKey(new Date()) }).id;
          drafts = {};
          lastLoggedExercise = null;
          tab = 'session';
          persistActivity();
          render();
          window.scrollTo(0, 0);
        },
        onAddExercise(data) { store.addExercise(data); render(); },
        onSeedDefaults() { store.seedExercises(DEFAULT_EXERCISES); render(); },
        onExport() { exportBackup(); }, onImport: importBackup,
        onNewRoutine() { creatingRoutine = true; editingRoutineId = null; render(); },
        onEditRoutine(id) {
          if (getActiveRoutine()?.id === id) { notify('진행 중인 루틴은 운동을 마친 뒤 수정해 주세요.'); return; }
          editingRoutineId = id; creatingRoutine = false; render();
        },
        onDeleteRoutine(id) {
          if (getActiveRoutine()?.id === id) { notify('진행 중인 루틴은 운동을 마친 뒤 삭제해 주세요.'); return; }
          store.removeRoutine(id); render();
        },
        onCancelRoutine() { creatingRoutine = false; editingRoutineId = null; render(); },
        onSaveRoutine({ name, exerciseIds }) {
          const previous = store.listRoutines().find((r) => r.id === editingRoutineId);
          const items = exerciseIds.filter((id) => store.listExercises().some((e) => e.id === id))
            .map((id) => previous?.items.find((item) => item.exerciseId === id) ?? { exerciseId: id, targetSets: 3 });
          if (editingRoutineId) store.updateRoutine(editingRoutineId, { name, items });
          else store.addRoutine({ name, items });
          creatingRoutine = false; editingRoutineId = null; render();
        },
      }),
    });
  } else if (tab === 'calendar') {
    renderCalendar(screen, {
      month: buildMonth(calMonth.year, calMonth.month),
      sessionDates: new Set([...store.listSessions().filter((s) => s.logs.length > 0).map((s) => s.date), ...store.listCardioSessions().map((c) => c.date)]),
      schedule: store.listSchedule(), notes: store.listNotes(), todayKey: dateKey(new Date()),
      routines: store.listRoutines(), routineName: (id) => store.listRoutines().find((r) => r.id === id)?.name ?? '(삭제됨)', selectedDay,
      handlers: safeHandlers({
        onPrevMonth() { const d = new Date(calMonth.year, calMonth.month - 1); calMonth = { year: d.getFullYear(), month: d.getMonth() }; render(); },
        onNextMonth() { const d = new Date(calMonth.year, calMonth.month + 1); calMonth = { year: d.getFullYear(), month: d.getMonth() }; render(); },
        onSelectDay(day) { selectedDay = selectedDay === day ? null : day; render(); },
        onAssign(day, routineId) { store.setSchedule(day, routineId); render(); },
        onSaveNote(day, text) { store.setNote(day, text); render(); notify('메모를 저장했어요.'); },
      }),
    });
  }
  window.scrollTo(0, scrollY);
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) { captureDrafts(); persistActivity(); }
  else refreshTimers();
});
window.addEventListener('pagehide', () => { captureDrafts(); persistActivity(); });
window.addEventListener('pageshow', refreshTimers);
// Only painting relies on intervals. Time comes from saved timestamps.
setInterval(refreshTimers, 250);
render({ capture: false });
refreshTimers();
window.__store = store;
