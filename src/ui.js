import { CARDIO_TYPE } from './presets.js';

const TABS = [
  { id: 'routines', label: '루틴' },
  { id: 'session', label: '운동' },
  { id: 'cardio', label: '유산소' },
  { id: 'history', label: '기록' },
  { id: 'calendar', label: '달력' },
];

export function renderApp(root, { tab, activeSession = false, cardioRunning = false }) {
  root.innerHTML = `
    <main class="screen" id="screen"></main>
    <nav class="tabbar" aria-label="주 메뉴">
      ${TABS.map(
        (t) => `<button data-tab="${t.id}" class="${t.id === tab ? 'active' : ''}" ${t.id === tab ? 'aria-current="page"' : ''}>${t.label}${(t.id === 'session' && activeSession) || (t.id === 'cardio' && cardioRunning) ? '<span class="tab-status">진행 중</span>' : ''}</button>`
      ).join('')}
    </nav>
  `;
  const screen = root.querySelector('#screen');
  screen.innerHTML = `<h1>${TABS.find((t) => t.id === tab).label}</h1><p class="dim">곧 채워짐</p>`;
}

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])
  );
}

export function fmtTime(sec) {
  sec = Number(sec);
  sec = Number.isFinite(sec) ? Math.max(0, Math.floor(sec)) : 0;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function renderSession(el, { session, routine, exercises, lastEntries, timer, restSec, handlers }) {
  if (!session) {
    el.innerHTML = `<h1>운동</h1><div class="card empty-state"><h2>어떤 운동을 할까요?</h2><p class="dim">루틴 탭에서 운동할 루틴의 ‘운동 시작’을 눌러주세요.</p></div>`;
    return;
  }
  const nameOf = (id) => exercises.find((e) => e.id === id)?.name ?? '(삭제됨)';
  const items = [...(routine?.items ?? [])];
  for (const log of session.logs) {
    if (!items.some((it) => it.exerciseId === log.exerciseId)) items.push({ exerciseId: log.exerciseId });
  }
  const totalSets = session.logs.reduce((total, log) => total + log.sets.length, 0);
  const totalTarget = items.reduce((total, it) => total + (Number(it.targetSets) || 0), 0);

  el.innerHTML = `
    <div class="session-heading">
      <div class="label">진행 중 · ${escapeHtml(session.date)}</div>
      <h1>${escapeHtml(routine?.name || '자유 운동')}</h1>
      <p class="session-summary">${items.length}개 운동 · <strong>${totalSets}${totalTarget ? ` / ${totalTarget}` : ''}세트 완료</strong></p>
    </div>
    <p class="background-hint">화면을 꺼도 경과 시간은 반영돼요. 알림음은 기기에 따라 제한될 수 있어요.</p>
    ${timer ? `
      <div class="rest-bar" data-timer="rest" aria-label="세트 사이 휴식">
        <div class="rest-heading"><span>휴식 중</span><span class="t" role="timer" aria-label="남은 휴식 시간">${fmtTime(timer.remaining)}</span></div>
        <div class="rest-progress" style="--progress:${timer.pct}%" aria-hidden="true"></div>
        <div class="rest-actions">
          <button class="btn-secondary" id="rest-minus" aria-label="휴식 15초 줄이기">−15초</button>
          <button class="btn-secondary" id="rest-plus" aria-label="휴식 15초 늘리기">+15초</button>
          <button class="btn-secondary" id="rest-skip">휴식 끝내기</button>
        </div>
      </div>` : ''}
    <div class="rest-preference"><label for="rest-duration">세트 완료 후 휴식</label><select id="rest-duration">${[60, 90, 120, 180].map((sec) => `<option value="${sec}" ${sec === restSec ? 'selected' : ''}>${sec < 60 ? `${sec}초` : `${Math.floor(sec / 60)}분${sec % 60 ? ` ${sec % 60}초` : ''}`}</option>`).join('')}</select></div>
    <div id="exercises"></div>
    <p class="save-hint">완료한 세트는 이 기기에 자동 저장돼요.</p>
    <button class="btn-primary btn-secondary" id="finish">운동 마치기 · ${totalSets}세트</button>
  `;

  if (timer) {
    el.querySelector('#rest-minus').addEventListener('click', () => handlers.onAdjustRest(-15));
    el.querySelector('#rest-plus').addEventListener('click', () => handlers.onAdjustRest(15));
    el.querySelector('#rest-skip').addEventListener('click', () => handlers.onSkipRest());
  }
  el.querySelector('#rest-duration').addEventListener('change', (event) => handlers.onSetRestSec(Number(event.target.value)));

  const wrap = el.querySelector('#exercises');
  wrap.innerHTML = items
    .map((it, itemIndex) => {
      const log = session.logs.find((l) => l.exerciseId === it.exerciseId);
      const sets = log ? log.sets : [];
      const last = lastEntries?.[it.exerciseId];
      const previous = sets.at(-1) || last?.sets[0];
      const lastHint = last
        ? `지난 기록 (${last.date}) · ${last.sets.map((s) => `${s.weight}kg × ${s.reps}회`).join(' / ')}`
        : '첫 기록이에요. 맨몸 운동은 0kg으로 입력하세요.';
      return `
      <section class="card exercise-card" data-ex="${escapeHtml(it.exerciseId)}" aria-labelledby="exercise-${itemIndex}">
        <div class="exercise-heading"><h2 id="exercise-${itemIndex}">${escapeHtml(nameOf(it.exerciseId))}</h2><span class="exercise-progress${it.targetSets && sets.length >= it.targetSets ? ' complete' : ''}">${sets.length}${it.targetSets ? ` / ${escapeHtml(it.targetSets)}` : ''}세트</span></div>
        <div class="last-hint">${escapeHtml(lastHint)}</div>
        <div class="completed-sets">${sets.map((s, i) => `<div class="completed-set" data-set-index="${i}"><div class="setrow done"><span class="n" aria-label="${i + 1}세트">${i + 1}</span><span class="setval">${escapeHtml(s.weight)}<small>kg</small> × ${escapeHtml(s.reps)}<small>회</small></span><button type="button" class="set-edit" aria-expanded="false" aria-label="${escapeHtml(nameOf(it.exerciseId))} ${i + 1}세트 수정">수정</button><button type="button" class="set-remove" aria-label="${escapeHtml(nameOf(it.exerciseId))} ${i + 1}세트 삭제">삭제</button></div></div>`).join('')}</div>
        <form class="set-entry" novalidate>
          <div class="set-input">
            <label>무게 <span class="dim">kg</span><input type="number" min="0" step="any" inputmode="decimal" enterkeyhint="next" placeholder="0" class="in-weight" aria-label="${escapeHtml(nameOf(it.exerciseId))} 무게 kg" value="${previous ? escapeHtml(previous.weight) : ''}"></label>
            <label>반복 <span class="dim">회</span><input type="number" min="1" step="1" inputmode="numeric" enterkeyhint="done" placeholder="횟수" class="in-reps" aria-label="${escapeHtml(nameOf(it.exerciseId))} 반복 횟수" value="${previous ? escapeHtml(previous.reps) : ''}"></label>
          </div>
          <p class="input-error" role="alert" hidden></p>
          ${previous ? `<p class="input-hint">${sets.length ? '직전 세트' : '지난 첫 세트'}를 채웠어요. 무게·횟수를 바꿔 기록하세요.</p>` : ''}
          <button type="submit" class="btn-primary log-set">${sets.length + 1}세트 완료</button>
        </form>
      </section>`;
    })
    .join('');

  wrap.querySelectorAll('[data-ex]').forEach((card) => {
    const exId = card.dataset.ex;
    const form = card.querySelector('.set-entry');
    clearSetErrorOnInput(form);
    form.querySelector('.in-weight').addEventListener('keydown', (event) => {
      if (event.key === 'Enter') { event.preventDefault(); form.querySelector('.in-reps').focus(); }
    });
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const set = readSetInputs(form, '.in-weight', '.in-reps');
      if (set) handlers.onLogSet(exId, set);
    });
    card.querySelectorAll('[data-set-index]').forEach((row) => {
      const index = Number(row.dataset.setIndex);
      const set = session.logs.find((log) => log.exerciseId === exId).sets[index];
      row.querySelector('.set-remove').addEventListener('click', () => {
        if (window.confirm(`${nameOf(exId)} ${index + 1}세트 (${set.weight}kg × ${set.reps}회)를 삭제할까요?`)) handlers.onRemoveSet(exId, index);
      });
      row.querySelector('.set-edit').addEventListener('click', (event) => {
        const existing = row.querySelector('.set-editor');
        if (existing) { existing.remove(); event.currentTarget.setAttribute('aria-expanded', 'false'); return; }
        event.currentTarget.setAttribute('aria-expanded', 'true');
        row.insertAdjacentHTML('beforeend', `<form class="set-editor" novalidate><div class="set-input"><label>무게 kg<input class="edit-weight" type="number" inputmode="decimal" min="0" step="any" value="${escapeHtml(set.weight)}"></label><label>반복 회<input class="edit-reps" type="number" inputmode="numeric" min="1" step="1" value="${escapeHtml(set.reps)}"></label></div><p class="input-error" role="alert" hidden></p><div class="set-editor-actions"><button type="button" class="btn-secondary edit-cancel">취소</button><button type="submit" class="btn-primary">수정 저장</button></div></form>`);
        const editor = row.querySelector('.set-editor');
        clearSetErrorOnInput(editor);
        editor.querySelector('.edit-weight').focus();
        editor.querySelector('.edit-cancel').addEventListener('click', () => { editor.remove(); row.querySelector('.set-edit').setAttribute('aria-expanded', 'false'); row.querySelector('.set-edit').focus(); });
        editor.addEventListener('submit', (editEvent) => {
          editEvent.preventDefault();
          const changed = readSetInputs(editor, '.edit-weight', '.edit-reps');
          if (changed) handlers.onUpdateSet(exId, index, { ...set, ...changed });
        });
      });
    });
  });
  el.querySelector('#finish').addEventListener('click', () => handlers.onFinish());
}

function clearSetErrorOnInput(form) {
  form.addEventListener('input', () => {
    form.querySelectorAll('[aria-invalid]').forEach((input) => input.removeAttribute('aria-invalid'));
    const error = form.querySelector('.input-error');
    error.hidden = true;
    error.textContent = '';
  });
}

function readSetInputs(form, weightSelector, repsSelector) {
  const weightInput = form.querySelector(weightSelector);
  const repsInput = form.querySelector(repsSelector);
  const weight = Number(weightInput.value);
  const reps = Number(repsInput.value);
  const weightValid = weightInput.value.trim() !== '' && Number.isFinite(weight) && weight >= 0;
  const repsValid = repsInput.value.trim() !== '' && Number.isInteger(reps) && reps > 0;
  weightInput.setAttribute('aria-invalid', String(!weightValid));
  repsInput.setAttribute('aria-invalid', String(!repsValid));
  const error = form.querySelector('.input-error');
  error.hidden = weightValid && repsValid;
  error.textContent = !weightValid ? '무게는 0 이상의 숫자로 입력하세요. 맨몸 운동은 0kg이에요.' : !repsValid ? '반복 횟수는 1 이상의 정수로 입력하세요.' : '';
  if (!weightValid || !repsValid) { (!weightValid ? weightInput : repsInput).focus(); return null; }
  return { weight, reps };
}

// 유산소 탭. view: 'pick'(기구 고르기) | 'setup'(모드·시간 설정) | 'run'(타이머).
const CARDIO_PRESET_MIN = [10, 15, 20, 30, 40, 45, 60];
export function renderCardio(el, {
  machines, view, selectedId, machineName, mode, targetSec,
  displaySec, pct, paused, recent, exerciseName, handlers,
}) {
  if (machines.length === 0) {
    el.innerHTML = `<h1>유산소</h1><p class="dim">유산소 기구가 없음. 루틴 탭에서 "기본 운동 불러오기"를 누르면 추가돼.</p>`;
    return;
  }
  let body = '';
  if (view === 'pick') {
    body = `
      <div class="label" style="margin-bottom:10px">기구 고르기</div>
      <div class="cardio-grid">
        ${machines.map((m) => `<button class="cardio-pick${m.id === selectedId ? ' on' : ''}" data-mid="${escapeHtml(m.id)}">${escapeHtml(m.name)}</button>`).join('')}
      </div>`;
  } else if (view === 'setup') {
    body = `
      <div class="card">
        <div class="label">${escapeHtml(machineName)}</div>
        <div class="seg" style="margin:12px 0 4px">
          <button class="seg-btn${mode === 'count' ? ' on' : ''}" data-mode="count" aria-pressed="${mode === 'count'}">카운트다운</button>
          <button class="seg-btn${mode === 'stop' ? ' on' : ''}" data-mode="stop" aria-pressed="${mode === 'stop'}">스톱워치</button>
        </div>
        ${mode === 'count' ? `
          <div class="cardio-time num">${fmtTime(targetSec)}</div>
          <div class="chip-row" style="justify-content:center;margin:8px 0 6px">
            ${CARDIO_PRESET_MIN.map((mn) => `<button class="pill${targetSec === mn * 60 ? ' on' : ''}" data-min="${mn}">${mn}분</button>`).join('')}
          </div>
          <div class="chip-row" style="justify-content:center;margin-bottom:14px">
            <button class="pill" data-adj="-60">−1분</button>
            <button class="pill" data-adj="60">+1분</button>
          </div>` : `<p class="dim" style="text-align:center;margin:16px 0">시작하면 0부터 시간이 올라가.</p>`}
        <div class="chip-row" style="gap:8px">
          <button class="btn-primary" id="cardio-back" style="flex:1;background:var(--surface-2);color:var(--text)">← 기구</button>
          <button class="btn-primary" id="cardio-start" style="flex:2">시작</button>
        </div>
      </div>`;
  } else {
    const ring = mode === 'count'
      ? `background: radial-gradient(closest-side, var(--bg) 79%, transparent 80%), conic-gradient(var(--accent) ${pct}%, var(--surface-2) 0);`
      : '';
    body = `
      <div class="card" style="text-align:center">
        <div class="label">${escapeHtml(machineName)} · ${mode === 'count' ? '남은 시간' : '경과 시간'}</div>
        <div class="timer-ring" data-timer="cardio" style="${ring};margin:18px auto"><div class="t" role="timer">${fmtTime(displaySec)}</div></div>
        <p class="timer-state${paused ? ' paused' : ''}">${paused ? '일시정지 중' : '시간 측정 중'}</p>
        <p class="input-hint">화면을 꺼도 경과 시간은 반영돼요. 알림음은 기기에 따라 제한될 수 있어요.</p>
        <div class="chip-row" style="gap:8px;margin-top:6px">
          <button class="btn-primary" id="cardio-pause" style="flex:1;background:var(--surface-2);color:var(--text)">${paused ? '재개' : '일시정지'}</button>
          <button class="btn-primary" id="cardio-finish" style="flex:2">마치고 기록</button>
        </div>
      </div>`;
  }
  const recentHtml = recent.length ? `
    <div class="label" style="margin:22px 0 8px">최근 유산소</div>
    ${recent.map((c) => `
      <div class="card cardio-log">
        <div style="flex:1">
          <div style="font-weight:800">${escapeHtml(exerciseName(c.exerciseId))}</div>
          <div class="hist-meta">${escapeHtml(c.date)} · ${fmtTime(c.durationSec)}</div>
        </div>
        <button class="ord-btn cardio-del" data-cid="${escapeHtml(c.id)}" aria-label="${escapeHtml(c.date)} ${escapeHtml(exerciseName(c.exerciseId))} 기록 삭제">✕</button>
      </div>`).join('')}` : '';
  el.innerHTML = `<h1>유산소</h1>${body}${recentHtml}`;

  if (view === 'pick') {
    el.querySelectorAll('.cardio-pick').forEach((b) =>
      b.addEventListener('click', () => handlers.onPick(b.dataset.mid))
    );
  } else if (view === 'setup') {
    el.querySelectorAll('.seg-btn').forEach((b) =>
      b.addEventListener('click', () => handlers.onSetMode(b.dataset.mode))
    );
    el.querySelectorAll('[data-min]').forEach((b) =>
      b.addEventListener('click', () => handlers.onSetTarget(Number(b.dataset.min) * 60))
    );
    el.querySelectorAll('[data-adj]').forEach((b) =>
      b.addEventListener('click', () => handlers.onAdjustTarget(Number(b.dataset.adj)))
    );
    el.querySelector('#cardio-back').addEventListener('click', () => handlers.onUnpick());
    el.querySelector('#cardio-start').addEventListener('click', () => handlers.onStart());
  } else {
    el.querySelector('#cardio-pause').addEventListener('click', () => handlers.onPauseResume());
    el.querySelector('#cardio-finish').addEventListener('click', () => handlers.onFinish());
  }
  el.querySelectorAll('.cardio-del').forEach((b) =>
    b.addEventListener('click', () => {
      if (window.confirm('이 유산소 기록을 지울까?')) handlers.onDeleteRecent(b.dataset.cid);
    })
  );
}

// groups = groupSessionsByDate 결과: [{ date, volume, routineIds, logs }]
// 카드 탭하면 그날 내용 펼침/접힘(기본 접힘).
// noteFor = (dateKey) => 그날 총평 문자열|없으면 falsy
const WEEKDAY_KO = ['일', '월', '화', '수', '목', '금', '토'];
function fmtDayLabel(dateKey) {
  const [y, m, d] = dateKey.split('-').map(Number);
  const wd = WEEKDAY_KO[new Date(y, m - 1, d).getDay()];
  return `${m}월 ${d}일 <span class="dim" style="font-weight:600">(${wd})</span>`;
}
export function renderHistory(el, { groups, routineName, exerciseName, noteFor = () => null }) {
  el.innerHTML = `<h1>기록</h1><div id="hist"></div>`;
  const hist = el.querySelector('#hist');
  if (groups.length === 0) {
    hist.innerHTML = `<p class="dim">아직 운동 기록 없음.</p>`;
    return;
  }
  hist.innerHTML = groups
    .map((day, i) => {
      const names = day.routineIds.map(routineName).join(', ');
      const note = noteFor(day.date);
      const rows = day.logs
        .map((l) => {
          const chips = l.sets
            .map((x) => `<span class="set-chip">${escapeHtml(x.weight)}<small>kg</small>×${escapeHtml(x.reps)}</span>`)
            .join('');
          return `<div class="hist-ex">
            <div class="hist-ex-name">${escapeHtml(exerciseName(l.exerciseId))}</div>
            <div class="hist-ex-sets">${chips}</div>
          </div>`;
        })
        .join('');
      const cardio = day.cardio || [];
      const cardioRows = cardio
        .map(
          (c) => `<div class="hist-ex">
            <div class="hist-ex-name">${escapeHtml(exerciseName(c.exerciseId))}</div>
            <div class="hist-ex-sets"><span class="set-chip cardio">🏃 ${fmtTime(c.durationSec)}</span></div>
          </div>`
        )
        .join('');
      const exCount = day.logs.length;
      const totalSets = day.logs.reduce((n, l) => n + l.sets.length, 0);
      const meta = [
        exCount ? `운동 ${exCount} · 세트 ${totalSets} · 볼륨 ${day.volume.toLocaleString()}kg` : '',
        cardio.length ? `유산소 ${cardio.length}` : '',
      ].filter(Boolean).join(' · ');
      return `
      <div class="card hist-card" data-hist="${i}">
        <button type="button" class="hist-head" aria-expanded="false" aria-controls="history-detail-${i}">
          <div style="flex:1">
            <div class="hist-date">${fmtDayLabel(day.date)}</div>
            ${names ? `<div class="hist-routine">${escapeHtml(names)}</div>` : ''}
            <div class="hist-meta">${meta}</div>
          </div>
          <span class="hist-caret">▾</span>
        </button>
        <div class="hist-detail" id="history-detail-${i}">
          ${rows}
          ${cardioRows}
          ${note ? `<div class="hist-note"><span class="label">총평</span>${escapeHtml(note)}</div>` : ''}
        </div>
      </div>`;
    })
    .join('');

  hist.querySelectorAll('[data-hist]').forEach((card) => {
    card.querySelector('.hist-head').addEventListener('click', (event) => {
      event.currentTarget.setAttribute('aria-expanded', String(card.classList.toggle('open')));
    });
  });
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

export function renderRoutines(el, { routines, exercises, creatingRoutine, editingRoutine, activeRoutineName = null, handlers }) {
  if (creatingRoutine || editingRoutine) {
    renderRoutineForm(el, { exercises, editing: editingRoutine, handlers });
    return;
  }
  el.innerHTML = `
    <h1>루틴</h1>
    ${activeRoutineName !== null ? `<div class="resume-banner"><div><span class="label">아직 진행 중이에요</span><strong>${escapeHtml(activeRoutineName || '자유 운동')}</strong></div><button class="btn-primary" id="resume-session">계속하기</button></div>` : ''}
    <div id="routine-list"></div>
    <button class="btn-primary" id="add-routine" style="margin-top:12px">+ 루틴 만들기</button>
    <details class="exercise-management"><summary>운동 목록 관리 <span id="exercise-count" class="dim"></span></summary><button class="btn-primary btn-secondary" id="add-exercise">+ 운동(기구) 직접 추가</button><button class="btn-primary btn-secondary" id="seed-default">기본 운동 불러오기</button></details>
    <div class="card" style="margin-top:18px">
      <div class="label">데이터 백업</div>
      <p class="dim" style="font-size:13px;margin:7px 0 12px;line-height:1.5">기록은 이 기기에 저장돼요. 기기를 바꾸거나 데이터를 지우기 전에 백업 파일을 저장하세요.</p>
      <div style="display:flex;gap:8px">
        <button class="btn-primary" id="data-export" style="flex:1;background:var(--surface-2);color:var(--text)">↓ 내보내기</button>
        <button class="btn-primary" id="data-import" style="flex:1;background:var(--surface-2);color:var(--text)">↑ 불러오기</button>
      </div>
      <input type="file" id="data-file" accept="application/json,.json" style="display:none">
    </div>
  `;
  const list = el.querySelector('#routine-list');
  if (routines.length === 0) {
    list.innerHTML = `<p class="dim">아직 루틴 없음. "루틴 만들기"로 운동을 골라 첫 루틴을 만들어봐.</p>`;
  } else {
    list.innerHTML = routines
      .map(
        (r) => `
      <div class="card">
        <div class="label">${r.items.length}개 운동 · ${r.items.reduce((total, item) => total + (Number(item.targetSets) || 0), 0)}세트</div>
        <h2 class="routine-title">${escapeHtml(r.name)}</h2>
        <p class="routine-preview">${escapeHtml(r.items.map((item) => exercises.find((exercise) => exercise.id === item.exerciseId)?.name || '(삭제됨)').join(' · '))}</p>
        <div class="routine-actions">
          <button class="btn-primary" data-start="${escapeHtml(r.id)}">운동 시작</button>
          <button class="btn-secondary" data-edit="${escapeHtml(r.id)}" aria-label="${escapeHtml(r.name)} 루틴 수정">수정</button>
          <button class="btn-secondary" data-del="${escapeHtml(r.id)}" aria-label="${escapeHtml(r.name)} 루틴 삭제">삭제</button>
        </div>
      </div>`
      )
      .join('');
  }
  el.querySelector('#exercise-count').textContent = `${exercises.length}개`;
  el.querySelector('#resume-session')?.addEventListener('click', () => handlers.onResume());

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
    handlers.onAddExercise({ name, type });
  });
  el.querySelector('#seed-default').addEventListener('click', () => handlers.onSeedDefaults());
  el.querySelector('#add-routine').addEventListener('click', () => handlers.onNewRoutine());

  el.querySelector('#data-export').addEventListener('click', () => handlers.onExport());
  const fileInput = el.querySelector('#data-file');
  el.querySelector('#data-import').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    const f = fileInput.files && fileInput.files[0];
    if (f) handlers.onImport(f);
    fileInput.value = ''; // 같은 파일 다시 골라도 change 뜨게
  });
}

function renderRoutineForm(el, { exercises, editing, handlers }) {
  const pickable = exercises.filter((e) => e.type !== CARDIO_TYPE); // 유산소는 루틴 대상 아님
  const byId = new Map(exercises.map((e) => [e.id, e]));
  const initialIds = editing
    ? editing.items.map((it) => it.exerciseId).filter((id) => byId.has(id))
    : [];
  el.innerHTML = `
    <h1>${editing ? '루틴 수정' : '새 루틴'}</h1>
    <label class="field-label" for="r-name">루틴 이름</label><input id="r-name" type="text" placeholder="예: 가슴·삼두" value="${editing ? escapeHtml(editing.name) : ''}">
    <div class="label" style="margin:18px 0 6px">운동 순서 <span class="dim" style="font-weight:600;text-transform:none;letter-spacing:0">· 하는 순서대로 ▲▼</span></div>
    <div id="ex-order"></div>
    <div class="label" style="margin:18px 0 8px">운동 고르기 <span class="dim" style="font-weight:600;text-transform:none;letter-spacing:0">· 부위 눌러 펼치기</span></div>
    <input id="ex-search" type="text" aria-label="운동 이름 검색" placeholder="운동 이름 검색" autocomplete="off" style="margin-bottom:10px">
    <div id="ex-pick"></div>
    <div class="form-actions">
      <button class="btn-primary" id="cancel-routine" style="flex:1;background:var(--surface-2);color:var(--text)">취소</button>
      <button class="btn-primary" id="create-routine" style="flex:2">${editing ? '저장' : '만들기'}</button>
    </div>
  `;

  // ── 순서 리스트: 선택된 운동을 실제 하는 순서대로 ▲▼로 재정렬, ✕로 제외 ──
  const orderWrap = el.querySelector('#ex-order');
  const orderRow = (id) =>
    `<div class="setrow" data-ord="${escapeHtml(id)}" style="display:flex;align-items:center;gap:8px">
      <span style="flex:1">${escapeHtml(byId.get(id)?.name ?? '(삭제됨)')}</span>
      <button class="ord-btn ord-up" aria-label="${escapeHtml(byId.get(id)?.name ?? '운동')} 순서 위로">▲</button>
      <button class="ord-btn ord-down" aria-label="${escapeHtml(byId.get(id)?.name ?? '운동')} 순서 아래로">▼</button>
      <button class="ord-btn ord-del" aria-label="${escapeHtml(byId.get(id)?.name ?? '운동')} 루틴에서 제외">✕</button>
    </div>`;
  const currentOrder = () => [...orderWrap.querySelectorAll('[data-ord]')].map((r) => r.dataset.ord);
  const findOrder = (id) => [...orderWrap.querySelectorAll('[data-ord]')].find((row) => row.dataset.ord === id);
  const findCheckbox = (id) => [...el.querySelectorAll('.ex-check')].find((checkbox) => checkbox.value === id);
  function wireOrder() {
    orderWrap.querySelectorAll('[data-ord]').forEach((row) => {
      row.querySelector('.ord-up').onclick = () => {
        const p = row.previousElementSibling;
        if (p) orderWrap.insertBefore(row, p);
      };
      row.querySelector('.ord-down').onclick = () => {
        const n = row.nextElementSibling;
        if (n) orderWrap.insertBefore(n, row);
      };
      row.querySelector('.ord-del').onclick = () => removeFromOrder(row.dataset.ord);
    });
  }
  function renderEmptyIfNeeded() {
    if (currentOrder().length === 0) {
      orderWrap.innerHTML = `<p class="dim" style="font-size:13px">아래에서 운동을 골라봐.</p>`;
    }
  }
  function addToOrder(id) {
    if (findOrder(id)) return;
    if (currentOrder().length === 0) orderWrap.innerHTML = ''; // placeholder 제거
    orderWrap.insertAdjacentHTML('beforeend', orderRow(id));
    wireOrder();
  }
  function removeFromOrder(id) {
    const row = findOrder(id);
    if (row) row.remove();
    const cb = findCheckbox(id);
    if (cb) cb.checked = false;
    updateCountFor(id);
    renderEmptyIfNeeded();
  }
  orderWrap.innerHTML = initialIds.map(orderRow).join('');
  wireOrder();
  renderEmptyIfNeeded();

  // ── 부위 아코디언(기본 접힘, 선택 있으면 펼침) + 검색 ──
  const checkedIds = new Set(initialIds);
  const pick = el.querySelector('#ex-pick');
  function updateCountFor(id) {
    const acc = findCheckbox(id)?.closest('.acc');
    if (acc) refreshCount(acc);
  }
  function refreshCount(acc) {
    const total = acc.querySelectorAll('.ex-check').length;
    const sel = acc.querySelectorAll('.ex-check:checked').length;
    acc.querySelector('.acc-count').innerHTML = sel ? `<b>${sel}</b>/${total}` : `${total}`;
  }
  if (pickable.length === 0) {
    pick.innerHTML = `<p class="dim">등록된 운동이 없음. 먼저 "기본 운동 불러오기"를 눌러줘.</p>`;
  } else {
    pick.innerHTML = groupByPart(pickable)
      .map(([part, list]) => {
        const sel = list.filter((e) => checkedIds.has(e.id)).length;
        return `
      <div class="acc${sel ? ' open' : ''}" data-part="${escapeHtml(part)}">
        <button type="button" class="acc-head" aria-expanded="${sel > 0}">
          <span class="acc-title">${escapeHtml(part)}</span>
          <span class="acc-count">${sel ? `<b>${sel}</b>/${list.length}` : list.length}</span>
          <span class="acc-caret">▾</span>
        </button>
        <div class="acc-body">
          ${list
            .map(
              (ex) => `
            <label class="pick-row" data-name="${escapeHtml(ex.name)}">
              <input type="checkbox" class="ex-check" value="${escapeHtml(ex.id)}" ${checkedIds.has(ex.id) ? 'checked' : ''}>
              <span>${escapeHtml(ex.name)}</span>
            </label>`
            )
            .join('')}
        </div>
      </div>`;
      })
      .join('');

    pick.querySelectorAll('.acc-head').forEach((h) =>
      h.addEventListener('click', () => h.setAttribute('aria-expanded', String(h.closest('.acc').classList.toggle('open'))))
    );
    pick.querySelectorAll('.ex-check').forEach((cb) => {
      cb.addEventListener('change', () => {
        if (cb.checked) { checkedIds.add(cb.value); addToOrder(cb.value); }
        else { checkedIds.delete(cb.value); removeFromOrder(cb.value); }
        refreshCount(cb.closest('.acc'));
      });
    });

    const search = el.querySelector('#ex-search');
    search.addEventListener('input', () => {
      const q = search.value.trim().toLowerCase();
      pick.querySelectorAll('.acc').forEach((acc) => {
        let visible = 0;
        acc.querySelectorAll('.pick-row').forEach((row) => {
          const match = !q || row.dataset.name.toLowerCase().includes(q);
          row.style.display = match ? '' : 'none';
          if (match) visible++;
        });
        acc.style.display = visible ? '' : 'none';
        if (q) acc.classList.add('open');
        else acc.classList.toggle('open', acc.querySelector('.ex-check:checked') != null);
        acc.querySelector('.acc-head').setAttribute('aria-expanded', String(acc.classList.contains('open')));
      });
    });
  }

  el.querySelector('#cancel-routine').addEventListener('click', () => handlers.onCancelRoutine());
  el.querySelector('#create-routine').addEventListener('click', () => {
    const name = el.querySelector('#r-name').value.trim();
    const exerciseIds = currentOrder();
    if (!name) { window.alert('루틴 이름을 적어줘.'); return; }
    if (exerciseIds.length === 0) { window.alert('운동을 하나 이상 골라줘.'); return; }
    handlers.onSaveRoutine({ name, exerciseIds });
  });
}

const MONTH_GRID_HEAD = ['일', '월', '화', '수', '목', '금', '토'];

// month = { year, month, weeks } (calendar.buildMonth 결과)
// sessionDates = Set/배열(운동한 dateKey), schedule = { dateKey: routineId }
// routineName = (id) => 이름, selectedDay = dateKey|null
export function renderCalendar(el, { month, sessionDates, schedule, notes = {}, todayKey = null, routineName, routines, selectedDay, handlers }) {
  const worked = sessionDates instanceof Set ? sessionDates : new Set(sessionDates);
  const title = `${month.year}년 ${month.month + 1}월`;

  el.innerHTML = `
    <div class="cal-nav">
      <button class="icon-btn" id="cal-prev" aria-label="이전 달">◀</button>
      <h1 style="margin:0">${title}</h1>
      <button class="icon-btn" id="cal-next" aria-label="다음 달">▶</button>
    </div>
    <div class="cal-grid">
      ${MONTH_GRID_HEAD.map((d, i) => `<div class="cal-head${i === 0 ? ' sun' : i === 6 ? ' sat' : ''}">${d}</div>`).join('')}
      ${month.weeks
        .flat()
        .map((cell) => {
          if (!cell) return `<div></div>`;
          const did = worked.has(cell.dateKey);
          const rid = schedule[cell.dateKey];
          const hasNote = !!notes[cell.dateKey];
          const sel = cell.dateKey === selectedDay;
          const isToday = cell.dateKey === todayKey;
          const cls = ['cal-cell', did ? 'did' : '', sel ? 'sel' : '', isToday ? 'today' : ''].filter(Boolean).join(' ');
          return `
          <button class="${cls}" data-day="${cell.dateKey}" aria-pressed="${sel}" aria-label="${cell.dateKey}${did ? ', 운동 기록 있음' : ''}${rid ? `, ${escapeHtml(routineName(rid))} 예정` : ''}${hasNote ? ', 메모 있음' : ''}">
            <span class="cal-num">${cell.day}</span>
            ${rid ? `<span class="cal-tag">${escapeHtml(routineName(rid))}</span>` : ''}
            <span class="cal-marks">${did ? '<i class="mk-did"></i>' : ''}${hasNote ? '<i class="mk-note"></i>' : ''}</span>
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
    const worked_ = worked.has(selectedDay);
    const note = notes[selectedDay] || '';
    panel.innerHTML = `
      <div class="card">
        <div class="label">${Number(m)}/${Number(d)} 예정 루틴</div>
        <div class="chip-row" style="margin-top:8px">
          ${routines.length === 0 ? '<span class="dim">루틴이 없음. 루틴 탭에서 먼저 만들어줘.</span>' : ''}
          ${routines
            .map(
              (r) => `<button class="pill cal-assign${cur === r.id ? ' on' : ''}" data-rid="${escapeHtml(r.id)}" aria-pressed="${cur === r.id}">${escapeHtml(r.name)}</button>`
            )
            .join('')}
          ${cur ? `<button class="pill" id="cal-clear">지우기</button>` : ''}
        </div>
      </div>
      <div class="card">
        <div class="label">${worked_ ? '운동 총평 ✍️' : '이 날 메모'}</div>
        <textarea id="cal-note" class="note-area" rows="3" aria-label="${Number(m)}월 ${Number(d)}일 메모"
          placeholder="${worked_ ? '컨디션, 무게 느낌, 다음에 바꿀 점…' : '이 날에 대한 메모'}">${escapeHtml(note)}</textarea>
        <div class="chip-row" style="justify-content:flex-end;margin-top:10px">
          ${note ? `<button class="pill" id="note-del">삭제</button>` : ''}
          <button class="btn-primary" id="note-save" style="width:auto;flex:0 0 auto;padding:12px 22px">저장</button>
        </div>
      </div>`;
    panel.querySelectorAll('.cal-assign').forEach((b) =>
      b.addEventListener('click', () => handlers.onAssign(selectedDay, b.dataset.rid))
    );
    const clear = panel.querySelector('#cal-clear');
    if (clear) clear.addEventListener('click', () => handlers.onAssign(selectedDay, null));

    const ta = panel.querySelector('#cal-note');
    panel.querySelector('#note-save').addEventListener('click', () => {
      handlers.onSaveNote(selectedDay, ta.value);
    });
    const del = panel.querySelector('#note-del');
    if (del) del.addEventListener('click', () => handlers.onSaveNote(selectedDay, ''));
  }
}
