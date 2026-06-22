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

// 부위 순서대로 그룹핑. PART_ORDER에 없는 type은 뒤에, type 없으면 '기타'.
const PART_ORDER = ['가슴', '등', '어깨', '삼두', '이두', '하체', '복근'];
function groupByPart(exercises) {
  const groups = new Map();
  for (const ex of exercises) {
    const part = ex.type || '기타';
    if (!groups.has(part)) groups.set(part, []);
    groups.get(part).push(ex);
  }
  const order = [...PART_ORDER, ...[...groups.keys()].filter((p) => !PART_ORDER.includes(p))];
  return order.filter((p) => groups.has(p)).map((p) => [p, groups.get(p)]);
}

export function renderRoutines(el, { routines, exercises, creatingRoutine, handlers }) {
  if (creatingRoutine) {
    renderRoutineForm(el, { exercises, handlers });
    return;
  }
  el.innerHTML = `
    <h1>루틴</h1>
    <div id="routine-list"></div>
    <button class="btn-primary" id="add-routine" style="margin-top:12px">+ 루틴 만들기</button>
    <button class="btn-primary" id="add-exercise" style="margin-top:8px;background:var(--surface-2);color:var(--text)">+ 운동(기구) 직접 추가</button>
    <button class="btn-primary" id="seed-default" style="margin-top:8px;background:var(--surface-2);color:var(--text)">기본 운동 불러오기</button>
    <div id="exercise-count" class="dim" style="margin-top:12px;font-size:13px"></div>
  `;
  const list = el.querySelector('#routine-list');
  if (routines.length === 0) {
    list.innerHTML = `<p class="dim">아직 루틴 없음. "루틴 만들기"로 운동을 골라 첫 루틴을 만들어봐.</p>`;
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
    const type = window.prompt('부위 (가슴/등/어깨/삼두/이두/하체/복근/기타)', '가슴') || '기타';
    const rest = Number(window.prompt('기본 휴식초', '90')) || 90;
    handlers.onAddExercise({ name, type, defaultRestSec: rest });
  });
  el.querySelector('#seed-default').addEventListener('click', () => handlers.onSeedDefaults());
  el.querySelector('#add-routine').addEventListener('click', () => handlers.onNewRoutine());
}

function renderRoutineForm(el, { exercises, handlers }) {
  el.innerHTML = `
    <h1>새 루틴</h1>
    <input id="r-name" type="text" placeholder="루틴 이름 (예: 가슴날)"
      style="width:100%;padding:12px;font-size:16px;border-radius:10px;border:1px solid var(--surface-2);background:var(--surface);color:var(--text);box-sizing:border-box">
    <div id="ex-pick" style="margin-top:14px"></div>
    <div style="display:flex;gap:8px;margin-top:16px">
      <button class="btn-primary" id="cancel-routine" style="flex:1;background:var(--surface-2);color:var(--text)">취소</button>
      <button class="btn-primary" id="create-routine" style="flex:2">만들기</button>
    </div>
  `;
  const pick = el.querySelector('#ex-pick');
  if (exercises.length === 0) {
    pick.innerHTML = `<p class="dim">등록된 운동이 없음. 먼저 "기본 운동 불러오기"를 눌러줘.</p>`;
  } else {
    pick.innerHTML = groupByPart(exercises)
      .map(
        ([part, list]) => `
      <div class="label" style="margin:10px 0 4px">${part}</div>
      ${list
        .map(
          (ex) => `
        <label class="setrow" style="display:flex;align-items:center;gap:10px;cursor:pointer">
          <input type="checkbox" class="ex-check" value="${ex.id}" style="width:20px;height:20px;flex:0 0 auto">
          <span>${ex.name}</span>
        </label>`
        )
        .join('')}`
      )
      .join('');
  }

  el.querySelector('#cancel-routine').addEventListener('click', () => handlers.onCancelRoutine());
  el.querySelector('#create-routine').addEventListener('click', () => {
    const name = el.querySelector('#r-name').value.trim();
    const exerciseIds = [...el.querySelectorAll('.ex-check:checked')].map((c) => c.value);
    if (!name) { window.alert('루틴 이름을 적어줘.'); return; }
    if (exerciseIds.length === 0) { window.alert('운동을 하나 이상 골라줘.'); return; }
    handlers.onCreateRoutine({ name, exerciseIds });
  });
}
