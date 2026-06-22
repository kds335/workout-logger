const TABS = [
  { id: 'routines', label: '루틴' },
  { id: 'session', label: '운동' },
  { id: 'history', label: '기록' },
  { id: 'calendar', label: '달력' },
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

  // 휴식초 = 운동의 현재 defaultRestSec 라이브, 폴백 item.restSec → 90
  const restOf = (id, fallback) =>
    exercises.find((e) => e.id === id)?.defaultRestSec ?? fallback ?? 90;

  el.innerHTML = `
    <h1>운동 중</h1>
    ${timer ? `
      <div class="timer-ring" style="${ringStyle}"><div class="t">${fmtTime(timer.remaining)}</div></div>
      <p class="dim" style="text-align:center">휴식 중</p>
      <div style="display:flex;gap:8px;justify-content:center;margin-top:8px">
        <button class="btn-primary" id="rest-minus" style="flex:1;background:var(--surface-2);color:var(--text)">−15초</button>
        <button class="btn-primary" id="rest-skip" style="flex:1;background:var(--surface-2);color:var(--text)">건너뛰기</button>
        <button class="btn-primary" id="rest-plus" style="flex:1;background:var(--surface-2);color:var(--text)">+15초</button>
      </div>` : ''}
    <div id="exercises"></div>
    <button class="btn-primary" id="finish" style="margin-top:16px;background:var(--surface-2);color:var(--text)">운동 종료</button>
  `;

  if (timer) {
    el.querySelector('#rest-minus').addEventListener('click', () => handlers.onAdjustRest(-15));
    el.querySelector('#rest-plus').addEventListener('click', () => handlers.onAdjustRest(15));
    el.querySelector('#rest-skip').addEventListener('click', () => handlers.onSkipRest());
  }

  const wrap = el.querySelector('#exercises');
  const items = routine ? routine.items : session.logs.map((l) => ({ exerciseId: l.exerciseId }));
  wrap.innerHTML = items
    .map((it) => {
      const log = session.logs.find((l) => l.exerciseId === it.exerciseId);
      const sets = log ? log.sets : [];
      const last = lastEntries[it.exerciseId];
      const lastHint = last
        ? `저번(${last.date}): ${last.sets.map((s) => `${s.weight}kg×${s.reps}`).join(', ')}`
        : '저번 기록 없음';
      return `
      <div class="card" data-ex="${it.exerciseId}" data-rest="${restOf(it.exerciseId, it.restSec)}">
        <div style="font-size:18px;font-weight:800;margin-bottom:6px">${nameOf(it.exerciseId)} <span class="dim" style="font-size:13px;font-weight:400">휴식 ${restOf(it.exerciseId, it.restSec)}초</span></div>
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

export function renderRoutines(el, { routines, exercises, creatingRoutine, editingRoutine, handlers }) {
  if (creatingRoutine || editingRoutine) {
    renderRoutineForm(el, { exercises, editing: editingRoutine, handlers });
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
        <div style="display:flex;gap:8px">
          <button class="btn-primary" data-start="${r.id}" style="flex:2">시작</button>
          <button class="btn-primary" data-edit="${r.id}" style="flex:1;background:var(--surface-2);color:var(--text)">수정</button>
          <button class="btn-primary" data-del="${r.id}" style="flex:1;background:var(--surface-2);color:var(--text)">삭제</button>
        </div>
      </div>`
      )
      .join('');
  }
  el.querySelector('#exercise-count').textContent = `등록된 운동 ${exercises.length}개`;

  list.querySelectorAll('[data-start]').forEach((b) =>
    b.addEventListener('click', () => handlers.onStart(b.dataset.start))
  );
  list.querySelectorAll('[data-edit]').forEach((b) =>
    b.addEventListener('click', () => handlers.onEditRoutine(b.dataset.edit))
  );
  list.querySelectorAll('[data-del]').forEach((b) =>
    b.addEventListener('click', () => {
      if (window.confirm('이 루틴을 삭제할까?')) handlers.onDeleteRoutine(b.dataset.del);
    })
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

function renderRoutineForm(el, { exercises, editing, handlers }) {
  const checkedIds = editing ? new Set(editing.items.map((it) => it.exerciseId)) : new Set();
  el.innerHTML = `
    <h1>${editing ? '루틴 수정' : '새 루틴'}</h1>
    <input id="r-name" type="text" placeholder="루틴 이름 (예: 가슴날)" value="${editing ? editing.name : ''}"
      style="width:100%;padding:12px;font-size:16px;border-radius:10px;border:1px solid var(--surface-2);background:var(--surface);color:var(--text);box-sizing:border-box">
    <p class="dim" style="font-size:12px;margin:8px 2px 0">휴식초는 운동마다 설정 — 모든 루틴·세션에 같이 적용됨.</p>
    <div id="ex-pick" style="margin-top:8px"></div>
    <div style="display:flex;gap:8px;margin-top:16px">
      <button class="btn-primary" id="cancel-routine" style="flex:1;background:var(--surface-2);color:var(--text)">취소</button>
      <button class="btn-primary" id="create-routine" style="flex:2">${editing ? '저장' : '만들기'}</button>
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
        <div class="setrow" style="display:flex;align-items:center;gap:10px">
          <label style="display:flex;align-items:center;gap:10px;flex:1;cursor:pointer">
            <input type="checkbox" class="ex-check" value="${ex.id}" ${checkedIds.has(ex.id) ? 'checked' : ''} style="width:20px;height:20px;flex:0 0 auto">
            <span>${ex.name}</span>
          </label>
          <input type="number" inputmode="numeric" class="rest-in" data-ex="${ex.id}" value="${ex.defaultRestSec}" aria-label="휴식초"
            style="width:64px;padding:6px;text-align:right;border-radius:8px;border:1px solid var(--surface-2);background:var(--surface);color:var(--text)">
          <span class="dim" style="font-size:12px">초</span>
        </div>`
        )
        .join('')}`
      )
      .join('');
  }

  // 휴식초 입력 변경 → 운동 기본값 갱신(전역)
  el.querySelectorAll('.rest-in').forEach((inp) =>
    inp.addEventListener('change', () => {
      const sec = Number(inp.value);
      if (sec > 0) handlers.onSetRest(inp.dataset.ex, sec);
    })
  );

  el.querySelector('#cancel-routine').addEventListener('click', () => handlers.onCancelRoutine());
  el.querySelector('#create-routine').addEventListener('click', () => {
    const name = el.querySelector('#r-name').value.trim();
    const exerciseIds = [...el.querySelectorAll('.ex-check:checked')].map((c) => c.value);
    if (!name) { window.alert('루틴 이름을 적어줘.'); return; }
    if (exerciseIds.length === 0) { window.alert('운동을 하나 이상 골라줘.'); return; }
    handlers.onSaveRoutine({ name, exerciseIds });
  });
}

const MONTH_GRID_HEAD = ['일', '월', '화', '수', '목', '금', '토'];

// month = { year, month, weeks } (calendar.buildMonth 결과)
// sessionDates = Set/배열(운동한 dateKey), schedule = { dateKey: routineId }
// routineName = (id) => 이름, selectedDay = dateKey|null
export function renderCalendar(el, { month, sessionDates, schedule, routineName, routines, selectedDay, handlers }) {
  const worked = sessionDates instanceof Set ? sessionDates : new Set(sessionDates);
  const title = `${month.year}년 ${month.month + 1}월`;

  el.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between">
      <button class="btn-primary" id="cal-prev" style="width:48px;background:var(--surface-2);color:var(--text)">◀</button>
      <h1 style="margin:0">${title}</h1>
      <button class="btn-primary" id="cal-next" style="width:48px;background:var(--surface-2);color:var(--text)">▶</button>
    </div>
    <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px;margin-top:12px">
      ${MONTH_GRID_HEAD.map((d) => `<div class="dim" style="text-align:center;font-size:12px;padding:4px 0">${d}</div>`).join('')}
      ${month.weeks
        .flat()
        .map((cell) => {
          if (!cell) return `<div></div>`;
          const did = worked.has(cell.dateKey);
          const rid = schedule[cell.dateKey];
          const sel = cell.dateKey === selectedDay;
          return `
          <button class="cal-cell" data-day="${cell.dateKey}"
            style="aspect-ratio:1;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;gap:2px;padding:4px 2px;border-radius:8px;border:1px solid ${sel ? 'var(--accent)' : 'transparent'};background:var(--surface);color:var(--text);font-size:13px;overflow:hidden">
            <span>${cell.day}${did ? ' <span style="color:var(--accent)">●</span>' : ''}</span>
            ${rid ? `<span style="font-size:9px;line-height:1.1;color:var(--accent);text-align:center;word-break:keep-all">${routineName(rid)}</span>` : ''}
          </button>`;
        })
        .join('')}
    </div>
    <div id="cal-panel" style="margin-top:14px"></div>
  `;

  el.querySelector('#cal-prev').addEventListener('click', () => handlers.onPrevMonth());
  el.querySelector('#cal-next').addEventListener('click', () => handlers.onNextMonth());
  el.querySelectorAll('.cal-cell').forEach((b) =>
    b.addEventListener('click', () => handlers.onSelectDay(b.dataset.day))
  );

  const panel = el.querySelector('#cal-panel');
  if (selectedDay) {
    const [, m, d] = selectedDay.split('-');
    const cur = schedule[selectedDay];
    panel.innerHTML = `
      <div class="card">
        <div class="label">${Number(m)}/${Number(d)} 예정 루틴</div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:8px">
          ${routines.length === 0 ? '<span class="dim">루틴이 없음. 루틴 탭에서 먼저 만들어줘.</span>' : ''}
          ${routines
            .map(
              (r) => `<button class="btn-primary cal-assign" data-rid="${r.id}"
                style="flex:0 0 auto;${cur === r.id ? '' : 'background:var(--surface-2);color:var(--text)'}">${r.name}</button>`
            )
            .join('')}
          ${cur ? `<button class="btn-primary" id="cal-clear" style="flex:0 0 auto;background:var(--surface-2);color:var(--text)">지우기</button>` : ''}
        </div>
      </div>`;
    panel.querySelectorAll('.cal-assign').forEach((b) =>
      b.addEventListener('click', () => handlers.onAssign(selectedDay, b.dataset.rid))
    );
    const clear = panel.querySelector('#cal-clear');
    if (clear) clear.addEventListener('click', () => handlers.onAssign(selectedDay, null));
  }
}
