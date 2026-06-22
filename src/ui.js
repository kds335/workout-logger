const TABS = [
  { id: 'routines', label: '루틴' },
  { id: 'session', label: '운동' },
  { id: 'history', label: '기록' },
];

export function renderApp(root, { tab }) {
  root.innerHTML = `
    <main class="screen" id="screen"></main>
    <nav class="tabbar">
      ${TABS.map(
        (t) => `<button data-tab="${t.id}" class="${t.id === tab ? 'active' : ''}">${t.label}</button>`
      ).join('')}
    </nav>
  `;
  const screen = root.querySelector('#screen');
  screen.innerHTML = `<h1>${TABS.find((t) => t.id === tab).label}</h1><p class="dim">곧 채워짐</p>`;
}

function fmtTime(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function renderSession(el, { session, routine, exercises, lastEntries, timer, handlers }) {
  if (!session) {
    el.innerHTML = `<h1>운동</h1><p class="dim">루틴 탭에서 "시작"을 눌러 운동을 시작해.</p>`;
    return;
  }
  const nameOf = (id) => exercises.find((e) => e.id === id)?.name ?? '(삭제됨)';
  const ringStyle = timer
    ? `background: radial-gradient(closest-side, var(--bg) 79%, transparent 80%), conic-gradient(var(--accent) ${
        timer.pct
      }%, var(--surface-2) 0);`
    : '';

  el.innerHTML = `
    <h1>운동 중</h1>
    ${timer ? `<div class="timer-ring" style="${ringStyle}"><div class="t">${fmtTime(timer.remaining)}</div></div><p class="dim" style="text-align:center">휴식 중</p>` : ''}
    <div id="exercises"></div>
    <button class="btn-primary" id="finish" style="margin-top:16px;background:var(--surface-2);color:var(--text)">운동 종료</button>
  `;

  const wrap = el.querySelector('#exercises');
  const items = routine ? routine.items : session.logs.map((l) => ({ exerciseId: l.exerciseId, restSec: 90 }));
  wrap.innerHTML = items
    .map((it) => {
      const log = session.logs.find((l) => l.exerciseId === it.exerciseId);
      const sets = log ? log.sets : [];
      const last = lastEntries[it.exerciseId];
      const lastHint = last
        ? `저번(${last.date}): ${last.sets.map((s) => `${s.weight}kg×${s.reps}`).join(', ')}`
        : '저번 기록 없음';
      return `
      <div class="card" data-ex="${it.exerciseId}" data-rest="${it.restSec}">
        <div style="font-size:18px;font-weight:800;margin-bottom:6px">${nameOf(it.exerciseId)}</div>
        <div class="last-hint">${lastHint}</div>
        ${sets.map((s, i) => `<div class="setrow done"><span class="n">${i + 1}</span> ${s.reps}회 <span class="kg">${s.weight} kg ✓</span></div>`).join('')}
        <div class="set-input">
          <input type="number" inputmode="decimal" placeholder="kg" class="in-weight">
          <input type="number" inputmode="numeric" placeholder="회" class="in-reps">
        </div>
        <button class="btn-primary log-set">세트 완료</button>
      </div>`;
    })
    .join('');

  wrap.querySelectorAll('[data-ex]').forEach((card) => {
    const exId = card.dataset.ex;
    const restSec = Number(card.dataset.rest) || 90;
    card.querySelector('.log-set').addEventListener('click', () => {
      const weight = Number(card.querySelector('.in-weight').value);
      const reps = Number(card.querySelector('.in-reps').value);
      if (!weight || !reps) return;
      handlers.onLogSet(exId, { weight, reps });
      handlers.onStartRest(restSec);
    });
  });
  el.querySelector('#finish').addEventListener('click', () => handlers.onFinish());
}

export function renderHistory(el, { sessions, routineName, exerciseName, volumeOf }) {
  el.innerHTML = `<h1>기록</h1><div id="hist"></div>`;
  const hist = el.querySelector('#hist');
  if (sessions.length === 0) {
    hist.innerHTML = `<p class="dim">아직 운동 기록 없음.</p>`;
    return;
  }
  hist.innerHTML = sessions
    .map((s) => {
      const lines = s.logs
        .map((l) => `${exerciseName(l.exerciseId)} — ${l.sets.map((x) => `${x.weight}×${x.reps}`).join(', ')}`)
        .join('<br>');
      return `
      <div class="card">
        <div class="label">${s.date}</div>
        <div style="font-size:17px;font-weight:800;margin:4px 0">${routineName(s.routineId)}</div>
        <div class="dim" style="font-size:13px;margin-bottom:8px">총 볼륨 ${volumeOf(s)} kg</div>
        <div style="font-size:14px;line-height:1.6">${lines || '<span class="dim">기록 없음</span>'}</div>
      </div>`;
    })
    .join('');
}

export function renderRoutines(el, { routines, exercises, handlers }) {
  el.innerHTML = `
    <h1>루틴</h1>
    <div id="routine-list"></div>
    <button class="btn-primary" id="add-routine" style="margin-top:12px">+ 루틴 추가</button>
    <button class="btn-primary" id="add-exercise" style="margin-top:8px;background:var(--surface-2);color:var(--text)">+ 운동(기구) 추가</button>
    <div id="exercise-count" class="dim" style="margin-top:12px;font-size:13px"></div>
  `;
  const list = el.querySelector('#routine-list');
  if (routines.length === 0) {
    list.innerHTML = `<p class="dim">아직 루틴 없음. 운동을 먼저 추가하고 루틴을 만들어봐.</p>`;
  } else {
    list.innerHTML = routines
      .map(
        (r) => `
      <div class="card">
        <div class="label">${r.items.length}개 기구</div>
        <div style="font-size:18px;font-weight:800;margin:4px 0 10px">${r.name}</div>
        <button class="btn-primary" data-start="${r.id}">시작</button>
      </div>`
      )
      .join('');
  }
  el.querySelector('#exercise-count').textContent = `등록된 운동 ${exercises.length}개`;

  list.querySelectorAll('[data-start]').forEach((b) =>
    b.addEventListener('click', () => handlers.onStart(b.dataset.start))
  );
  el.querySelector('#add-exercise').addEventListener('click', () => {
    const name = window.prompt('운동(기구) 이름?');
    if (!name) return;
    const type = window.prompt('종류 (머신/덤벨/케이블/기타)', '머신') || '기타';
    const rest = Number(window.prompt('기본 휴식초', '90')) || 90;
    handlers.onAddExercise({ name, type, defaultRestSec: rest });
  });
  el.querySelector('#add-routine').addEventListener('click', () => handlers.onAddRoutine());
}
