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
