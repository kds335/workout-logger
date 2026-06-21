# 운동기록 웹앱 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 헬스장에서 루틴 짜기 + 세트별 무게/반복 기록 + 휴식 타이머 자동 + 지난기록 조회를 한 흐름으로 하는 개인용 PWA를 만든다.

**Architecture:** 순수 로직(저장·스토어·기록·타이머)과 DOM 렌더를 분리한다. 데이터는 단일 상태 객체 `{ exercises, routines, sessions }`를 localStorage에 JSON으로 영속. 로직 모듈은 백엔드/ID생성기를 매개변수 주입해 `node --test`로 단위 테스트. UI는 store를 읽어 렌더하고 이벤트만 store로 보냄.

**Tech Stack:** 바닐라 JS ES 모듈, 빌드 도구 0, Node 24(`node --test`), localStorage, PWA(manifest + service worker). DOM 검증은 로컬 http 서버 + 헤드리스 Chrome.

## Global Constraints

- 빌드 도구 0. 바닐라 JS ES 모듈만. `package.json`에 `"type": "module"`.
- CommonJS 스크립트는 `.cjs` 확장자(`dev-server.cjs`).
- 로직 모듈에만 계산. `ui.js`는 렌더만, 계산 금지.
- 외부 의존성(`crypto.randomUUID`, `localStorage`, 타이머)은 매개변수 주입(기본값 제공). 테스트는 가짜 주입.
- 단위 테스트는 `tests/`(복수)에 둔다.
- 화풍 = 미드나잇: 다크 배경 `#0d0f14`, 형광 그린 액센트 `#00e599`. 색·간격·둥글기는 CSS 변수(디자인 토큰)로만.
- TDD: 실패 테스트 → 최소 구현 → 통과 → 커밋. 태스크당 1커밋.
- 커밋 메시지 한국어 산문 + Conventional Commits 접두사. 끝에 `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- 데이터 형태(전 태스크 공통):
  - `Exercise = { id, name, type, defaultRestSec }`, `type ∈ '머신'|'덤벨'|'케이블'|'기타'`
  - `Routine = { id, name, items: [{ exerciseId, targetSets, restSec }] }`
  - `Session = { id, date, routineId, logs: [{ exerciseId, sets: [{ weight, reps }] }] }`
  - 상태: `{ exercises: [], routines: [], sessions: [] }`

---

### Task 1: 프로젝트 뼈대 + 저장 래퍼 (storage.js)

**Files:**
- Create: `package.json`
- Create: `src/storage.js`
- Test: `tests/storage.test.js`

**Interfaces:**
- Produces: `createStorage(backend = globalThis.localStorage) → { load(key, fallback=null), save(key, value) }`. `load`는 키 없거나 JSON 파싱 실패 시 `fallback` 반환. `save`는 `JSON.stringify` 후 `backend.setItem`.

- [ ] **Step 1: package.json 작성**

```json
{
  "name": "workout-logger",
  "version": "0.1.0",
  "type": "module",
  "private": true,
  "scripts": {
    "test": "node --test"
  }
}
```

- [ ] **Step 2: 실패 테스트 작성**

`tests/storage.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStorage } from '../src/storage.js';

function fakeBackend() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, v),
    removeItem: (k) => m.delete(k),
  };
}

test('save 후 load 하면 같은 객체', () => {
  const s = createStorage(fakeBackend());
  s.save('k', { a: 1, b: [2, 3] });
  assert.deepEqual(s.load('k'), { a: 1, b: [2, 3] });
});

test('없는 키는 fallback 반환', () => {
  const s = createStorage(fakeBackend());
  assert.equal(s.load('nope', 'default'), 'default');
});

test('깨진 JSON은 fallback 반환', () => {
  const backend = fakeBackend();
  backend.setItem('bad', '{not json');
  const s = createStorage(backend);
  assert.equal(s.load('bad', null), null);
});
```

- [ ] **Step 3: 실패 확인**

Run: `node --test tests/storage.test.js`
Expected: FAIL — `Cannot find module '../src/storage.js'`

- [ ] **Step 4: 최소 구현**

`src/storage.js`:
```js
export function createStorage(backend = globalThis.localStorage) {
  return {
    load(key, fallback = null) {
      const raw = backend.getItem(key);
      if (raw == null) return fallback;
      try {
        return JSON.parse(raw);
      } catch {
        return fallback;
      }
    },
    save(key, value) {
      backend.setItem(key, JSON.stringify(value));
    },
  };
}
```

- [ ] **Step 5: 통과 확인**

Run: `node --test tests/storage.test.js`
Expected: PASS (3 tests)

- [ ] **Step 6: 커밋**

```bash
git add package.json src/storage.js tests/storage.test.js
git commit -m "feat: 프로젝트 뼈대 + localStorage 래퍼(주입 가능)"
```

---

### Task 2: 도메인 스토어 — 운동 CRUD (store.js)

**Files:**
- Create: `src/store.js`
- Test: `tests/store-exercises.test.js`

**Interfaces:**
- Consumes: `createStorage` (Task 1).
- Produces:
  - `STORAGE_KEY = 'workout-logger/state/v1'`
  - `createStore({ storage, genId } = {}) → store`. `storage` 기본 `createStorage()`, `genId` 기본 `() => crypto.randomUUID()`.
  - 운동 메서드: `addExercise({ name, type='기타', defaultRestSec=90 }) → Exercise`, `listExercises() → Exercise[]`, `updateExercise(id, patch) → Exercise|null`, `removeExercise(id) → boolean`.
  - `getState() → { exercises, routines, sessions }`.
  - 모든 변경은 즉시 영속화.

- [ ] **Step 1: 실패 테스트 작성**

`tests/store-exercises.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStorage } from '../src/storage.js';
import { createStore } from '../src/store.js';

function fakeBackend() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, v),
    removeItem: (k) => m.delete(k),
  };
}
function seqId() {
  let n = 0;
  return () => `id${++n}`;
}
function makeStore(backend = fakeBackend()) {
  return createStore({ storage: createStorage(backend), genId: seqId() });
}

test('운동 추가하면 목록에 나옴', () => {
  const s = makeStore();
  const ex = s.addExercise({ name: '랫풀다운', type: '머신', defaultRestSec: 90 });
  assert.equal(ex.id, 'id1');
  assert.deepEqual(s.listExercises(), [
    { id: 'id1', name: '랫풀다운', type: '머신', defaultRestSec: 90 },
  ]);
});

test('기본값: type=기타, defaultRestSec=90', () => {
  const s = makeStore();
  const ex = s.addExercise({ name: '덤벨컬' });
  assert.equal(ex.type, '기타');
  assert.equal(ex.defaultRestSec, 90);
});

test('운동 수정', () => {
  const s = makeStore();
  s.addExercise({ name: '랫풀다운' });
  const upd = s.updateExercise('id1', { defaultRestSec: 120 });
  assert.equal(upd.defaultRestSec, 120);
});

test('운동 삭제', () => {
  const s = makeStore();
  s.addExercise({ name: '랫풀다운' });
  assert.equal(s.removeExercise('id1'), true);
  assert.deepEqual(s.listExercises(), []);
});

test('새 store는 영속된 상태를 다시 읽음', () => {
  const backend = fakeBackend();
  const s1 = createStore({ storage: createStorage(backend), genId: seqId() });
  s1.addExercise({ name: '랫풀다운' });
  const s2 = createStore({ storage: createStorage(backend), genId: seqId() });
  assert.equal(s2.listExercises().length, 1);
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test tests/store-exercises.test.js`
Expected: FAIL — `Cannot find module '../src/store.js'`

- [ ] **Step 3: 최소 구현**

`src/store.js`:
```js
import { createStorage } from './storage.js';

export const STORAGE_KEY = 'workout-logger/state/v1';

const emptyState = () => ({ exercises: [], routines: [], sessions: [] });

export function createStore({
  storage = createStorage(),
  genId = () => crypto.randomUUID(),
} = {}) {
  const state = { ...emptyState(), ...storage.load(STORAGE_KEY, emptyState()) };
  const persist = () => storage.save(STORAGE_KEY, state);

  return {
    getState: () => state,

    addExercise({ name, type = '기타', defaultRestSec = 90 }) {
      const ex = { id: genId(), name, type, defaultRestSec };
      state.exercises.push(ex);
      persist();
      return ex;
    },
    listExercises: () => state.exercises,
    updateExercise(id, patch) {
      const ex = state.exercises.find((e) => e.id === id);
      if (!ex) return null;
      Object.assign(ex, patch);
      persist();
      return ex;
    },
    removeExercise(id) {
      const i = state.exercises.findIndex((e) => e.id === id);
      if (i === -1) return false;
      state.exercises.splice(i, 1);
      persist();
      return true;
    },
  };
}
```

- [ ] **Step 4: 통과 확인**

Run: `node --test tests/store-exercises.test.js`
Expected: PASS (5 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/store.js tests/store-exercises.test.js
git commit -m "feat: 도메인 스토어 — 운동 CRUD + 영속화"
```

---

### Task 3: 스토어 — 루틴 CRUD (store.js)

**Files:**
- Modify: `src/store.js`
- Test: `tests/store-routines.test.js`

**Interfaces:**
- Produces 루틴 메서드: `addRoutine({ name, items=[] }) → Routine`, `listRoutines() → Routine[]`, `updateRoutine(id, patch) → Routine|null`, `removeRoutine(id) → boolean`. `items` 항목 = `{ exerciseId, targetSets, restSec }`.

- [ ] **Step 1: 실패 테스트 작성**

`tests/store-routines.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStorage } from '../src/storage.js';
import { createStore } from '../src/store.js';

function fakeBackend() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, v),
    removeItem: (k) => m.delete(k),
  };
}
function seqId() { let n = 0; return () => `id${++n}`; }
function makeStore() { return createStore({ storage: createStorage(fakeBackend()), genId: seqId() }); }

test('루틴 추가', () => {
  const s = makeStore();
  const r = s.addRoutine({
    name: '가슴날',
    items: [{ exerciseId: 'ex1', targetSets: 3, restSec: 90 }],
  });
  assert.equal(r.id, 'id1');
  assert.equal(r.name, '가슴날');
  assert.equal(r.items.length, 1);
  assert.equal(s.listRoutines().length, 1);
});

test('items 기본값은 빈 배열', () => {
  const s = makeStore();
  const r = s.addRoutine({ name: '빈루틴' });
  assert.deepEqual(r.items, []);
});

test('루틴 수정(items 교체)', () => {
  const s = makeStore();
  s.addRoutine({ name: '가슴날' });
  const upd = s.updateRoutine('id1', { items: [{ exerciseId: 'ex9', targetSets: 4, restSec: 60 }] });
  assert.equal(upd.items[0].targetSets, 4);
});

test('루틴 삭제', () => {
  const s = makeStore();
  s.addRoutine({ name: '가슴날' });
  assert.equal(s.removeRoutine('id1'), true);
  assert.deepEqual(s.listRoutines(), []);
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test tests/store-routines.test.js`
Expected: FAIL — `store.addRoutine is not a function`

- [ ] **Step 3: 최소 구현 — `src/store.js`의 return 객체에 메서드 추가**

`removeExercise` 메서드 뒤에 추가:
```js
    addRoutine({ name, items = [] }) {
      const r = { id: genId(), name, items };
      state.routines.push(r);
      persist();
      return r;
    },
    listRoutines: () => state.routines,
    updateRoutine(id, patch) {
      const r = state.routines.find((x) => x.id === id);
      if (!r) return null;
      Object.assign(r, patch);
      persist();
      return r;
    },
    removeRoutine(id) {
      const i = state.routines.findIndex((x) => x.id === id);
      if (i === -1) return false;
      state.routines.splice(i, 1);
      persist();
      return true;
    },
```

- [ ] **Step 4: 통과 확인**

Run: `node --test tests/store-routines.test.js`
Expected: PASS (4 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/store.js tests/store-routines.test.js
git commit -m "feat: 스토어 — 루틴 CRUD"
```

---

### Task 4: 스토어 — 세션 + 세트 기록 (store.js)

**Files:**
- Modify: `src/store.js`
- Test: `tests/store-sessions.test.js`

**Interfaces:**
- Produces 세션 메서드:
  - `startSession({ routineId = null, date }) → Session`. `logs`는 빈 배열로 시작.
  - `logSet(sessionId, exerciseId, { weight, reps }) → Session|null`. 해당 운동 로그 없으면 만들고 세트 push.
  - `listSessions() → Session[]` (최신순 = 추가 역순).
  - `getSession(id) → Session|null`.

- [ ] **Step 1: 실패 테스트 작성**

`tests/store-sessions.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStorage } from '../src/storage.js';
import { createStore } from '../src/store.js';

function fakeBackend() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, v),
    removeItem: (k) => m.delete(k),
  };
}
function seqId() { let n = 0; return () => `id${++n}`; }
function makeStore() { return createStore({ storage: createStorage(fakeBackend()), genId: seqId() }); }

test('세션 시작하면 빈 logs', () => {
  const s = makeStore();
  const sess = s.startSession({ routineId: 'r1', date: '2026-06-22' });
  assert.equal(sess.id, 'id1');
  assert.equal(sess.routineId, 'r1');
  assert.deepEqual(sess.logs, []);
});

test('세트 기록하면 운동 로그가 생기고 세트가 쌓임', () => {
  const s = makeStore();
  const sess = s.startSession({ routineId: 'r1', date: '2026-06-22' });
  s.logSet(sess.id, 'ex1', { weight: 50, reps: 12 });
  s.logSet(sess.id, 'ex1', { weight: 50, reps: 10 });
  const after = s.getSession(sess.id);
  assert.equal(after.logs.length, 1);
  assert.equal(after.logs[0].exerciseId, 'ex1');
  assert.deepEqual(after.logs[0].sets, [
    { weight: 50, reps: 12 },
    { weight: 50, reps: 10 },
  ]);
});

test('서로 다른 운동은 별도 로그', () => {
  const s = makeStore();
  const sess = s.startSession({ routineId: 'r1', date: '2026-06-22' });
  s.logSet(sess.id, 'ex1', { weight: 50, reps: 12 });
  s.logSet(sess.id, 'ex2', { weight: 20, reps: 15 });
  assert.equal(s.getSession(sess.id).logs.length, 2);
});

test('listSessions는 최신순', () => {
  const s = makeStore();
  s.startSession({ routineId: 'r1', date: '2026-06-21' });
  s.startSession({ routineId: 'r2', date: '2026-06-22' });
  const list = s.listSessions();
  assert.equal(list[0].date, '2026-06-22');
});

test('없는 세션에 logSet하면 null', () => {
  const s = makeStore();
  assert.equal(s.logSet('nope', 'ex1', { weight: 10, reps: 10 }), null);
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test tests/store-sessions.test.js`
Expected: FAIL — `store.startSession is not a function`

- [ ] **Step 3: 최소 구현 — `src/store.js` return 객체에 추가**

`removeRoutine` 뒤에 추가:
```js
    startSession({ routineId = null, date }) {
      const sess = { id: genId(), date, routineId, logs: [] };
      state.sessions.push(sess);
      persist();
      return sess;
    },
    logSet(sessionId, exerciseId, { weight, reps }) {
      const sess = state.sessions.find((x) => x.id === sessionId);
      if (!sess) return null;
      let log = sess.logs.find((l) => l.exerciseId === exerciseId);
      if (!log) {
        log = { exerciseId, sets: [] };
        sess.logs.push(log);
      }
      log.sets.push({ weight, reps });
      persist();
      return sess;
    },
    getSession: (id) => state.sessions.find((x) => x.id === id) ?? null,
    listSessions: () => [...state.sessions].reverse(),
```

- [ ] **Step 4: 통과 확인**

Run: `node --test tests/store-sessions.test.js`
Expected: PASS (5 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/store.js tests/store-sessions.test.js
git commit -m "feat: 스토어 — 세션 + 세트 기록"
```

---

### Task 5: 기록 조회 (history.js)

**Files:**
- Create: `src/history.js`
- Test: `tests/history.test.js`

**Interfaces:**
- Produces:
  - `lastEntryFor(sessions, exerciseId) → { date, sets } | null`. `sessions`는 임의 순서; 날짜 문자열(`YYYY-MM-DD`) 내림차순으로 가장 최근에 그 운동을 한 세션의 `{ date, sets }`. 없으면 null.
  - `totalVolume(session) → number`. 세션의 모든 세트 `weight * reps` 합.

- [ ] **Step 1: 실패 테스트 작성**

`tests/history.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lastEntryFor, totalVolume } from '../src/history.js';

const sessions = [
  { id: 's1', date: '2026-06-18', logs: [{ exerciseId: 'ex1', sets: [{ weight: 45, reps: 12 }] }] },
  { id: 's2', date: '2026-06-20', logs: [{ exerciseId: 'ex1', sets: [{ weight: 50, reps: 10 }, { weight: 50, reps: 8 }] }] },
];

test('lastEntryFor는 가장 최근 날짜의 세트', () => {
  const e = lastEntryFor(sessions, 'ex1');
  assert.equal(e.date, '2026-06-20');
  assert.equal(e.sets.length, 2);
  assert.equal(e.sets[0].weight, 50);
});

test('해당 운동 기록 없으면 null', () => {
  assert.equal(lastEntryFor(sessions, 'nope'), null);
});

test('빈 세션 배열이면 null', () => {
  assert.equal(lastEntryFor([], 'ex1'), null);
});

test('totalVolume = 무게*반복 합', () => {
  const v = totalVolume(sessions[1]); // 50*10 + 50*8
  assert.equal(v, 900);
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test tests/history.test.js`
Expected: FAIL — `Cannot find module '../src/history.js'`

- [ ] **Step 3: 최소 구현**

`src/history.js`:
```js
export function lastEntryFor(sessions, exerciseId) {
  const matches = sessions
    .filter((s) => s.logs.some((l) => l.exerciseId === exerciseId))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  if (matches.length === 0) return null;
  const recent = matches[0];
  const log = recent.logs.find((l) => l.exerciseId === exerciseId);
  return { date: recent.date, sets: log.sets };
}

export function totalVolume(session) {
  return session.logs
    .flatMap((l) => l.sets)
    .reduce((sum, set) => sum + set.weight * set.reps, 0);
}
```

- [ ] **Step 4: 통과 확인**

Run: `node --test tests/history.test.js`
Expected: PASS (4 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/history.js tests/history.test.js
git commit -m "feat: 기록 조회 — 저번 무게 + 총 볼륨"
```

---

### Task 6: 휴식 타이머 순수 상태기계 (timer.js)

**Files:**
- Create: `src/timer.js`
- Test: `tests/timer.test.js`

**Interfaces:**
- Produces: `createRestTimer(seconds) → timer`.
  - `timer.remaining` (number, 초)
  - `timer.tick(deltaSec) → void` — 남은 시간 감소(0 아래로 안 내려감)
  - `timer.isDone` (boolean) — `remaining <= 0`
  - `timer.reset(seconds)` — 다시 설정
  - setInterval 안 씀(순수). 실제 시간 진행은 main.js가 주입.

- [ ] **Step 1: 실패 테스트 작성**

`tests/timer.test.js`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRestTimer } from '../src/timer.js';

test('초기 remaining = 설정값, 안 끝남', () => {
  const t = createRestTimer(90);
  assert.equal(t.remaining, 90);
  assert.equal(t.isDone, false);
});

test('tick하면 줄어듦', () => {
  const t = createRestTimer(90);
  t.tick(1);
  assert.equal(t.remaining, 89);
});

test('0 아래로 안 내려가고 isDone true', () => {
  const t = createRestTimer(2);
  t.tick(5);
  assert.equal(t.remaining, 0);
  assert.equal(t.isDone, true);
});

test('reset으로 다시 설정', () => {
  const t = createRestTimer(2);
  t.tick(2);
  t.reset(60);
  assert.equal(t.remaining, 60);
  assert.equal(t.isDone, false);
});
```

- [ ] **Step 2: 실패 확인**

Run: `node --test tests/timer.test.js`
Expected: FAIL — `Cannot find module '../src/timer.js'`

- [ ] **Step 3: 최소 구현**

`src/timer.js`:
```js
export function createRestTimer(seconds) {
  return {
    remaining: seconds,
    get isDone() {
      return this.remaining <= 0;
    },
    tick(deltaSec) {
      this.remaining = Math.max(0, this.remaining - deltaSec);
    },
    reset(s) {
      this.remaining = s;
    },
  };
}
```

- [ ] **Step 4: 통과 확인**

Run: `node --test tests/timer.test.js`
Expected: PASS (4 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/timer.js tests/timer.test.js
git commit -m "feat: 휴식 타이머 순수 상태기계"
```

---

### Task 7: 앱 셸 + 디자인 토큰 + 탭 네비 (index.html, styles.css, ui.js, main.js, dev-server.cjs)

**Files:**
- Create: `index.html`
- Create: `styles.css`
- Create: `src/ui.js`
- Create: `src/main.js`
- Create: `dev-server.cjs`

**Interfaces:**
- Produces:
  - `index.html`: `#app` 컨테이너 + 하단 탭바. `<script type="module" src="src/main.js">`.
  - `styles.css`: 디자인 토큰(CSS 변수) + 셸/탭 스타일.
  - `src/ui.js`: `renderApp(root, { tab })` — 현재 탭에 맞는 화면 자리(placeholder) 렌더. `export` 함수만, 계산 없음.
  - `src/main.js`: store 생성, 현재 탭 상태 보관, 탭 클릭 시 `renderApp` 재호출.
  - `dev-server.cjs`: 포트 8732 정적 서버(게임의 8731과 충돌 회피).

- [ ] **Step 1: dev-server.cjs 작성**

`dev-server.cjs`:
```js
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8732;
const MIME = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.svg': 'image/svg+xml',
};

http.createServer((req, res) => {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';
  const filePath = path.join(__dirname, urlPath);
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(PORT, () => console.log(`http://localhost:${PORT}`));
```

- [ ] **Step 2: 디자인 토큰 + 셸 스타일 작성**

`styles.css`:
```css
:root {
  --bg: #0d0f14;
  --surface: #161a22;
  --surface-2: #1c2230;
  --accent: #00e599;
  --accent-ink: #06281e;
  --text: #ffffff;
  --text-dim: #6b7280;
  --radius: 16px;
  --radius-lg: 28px;
  --gap: 8px;
  --pad: 20px;
  --tap: 44px;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
}
* { box-sizing: border-box; margin: 0; padding: 0; -webkit-tap-highlight-color: transparent; }
html, body { height: 100%; }
body {
  background: var(--bg); color: var(--text);
  -webkit-font-smoothing: antialiased;
  overscroll-behavior: none;
}
#app { max-width: 480px; margin: 0 auto; min-height: 100%; padding-bottom: 76px; }
.screen { padding: var(--pad); }
.screen h1 { font-size: 26px; font-weight: 800; letter-spacing: -0.02em; }
.label { font-size: 12px; letter-spacing: 0.08em; text-transform: uppercase; color: var(--accent); font-weight: 700; }
.dim { color: var(--text-dim); }
button { font: inherit; cursor: pointer; border: none; }
.btn-primary {
  background: var(--accent); color: var(--accent-ink);
  padding: 16px; border-radius: var(--radius); font-weight: 800; font-size: 16px;
  width: 100%; min-height: var(--tap); transition: transform 0.12s ease;
}
.btn-primary:active { transform: scale(0.97); }
.tabbar {
  position: fixed; bottom: 0; left: 0; right: 0;
  max-width: 480px; margin: 0 auto;
  display: flex; background: var(--surface); border-top: 1px solid var(--surface-2);
}
.tabbar button {
  flex: 1; background: none; color: var(--text-dim);
  padding: 14px 0 18px; font-size: 12px; font-weight: 700; min-height: var(--tap);
}
.tabbar button.active { color: var(--accent); }
.card {
  background: var(--surface); border-radius: var(--radius);
  padding: 16px; margin-bottom: var(--gap);
}
```

- [ ] **Step 3: ui.js 셸 렌더 작성**

`src/ui.js`:
```js
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
```

- [ ] **Step 4: main.js 배선 작성**

`src/main.js`:
```js
import { createStore } from './store.js';
import { renderApp } from './ui.js';

const store = createStore();
const root = document.querySelector('#app');
let tab = 'routines';

function render() {
  renderApp(root, { tab });
  root.querySelectorAll('[data-tab]').forEach((b) => {
    b.addEventListener('click', () => {
      tab = b.dataset.tab;
      render();
    });
  });
}

render();
window.__store = store; // 디버그용
```

- [ ] **Step 5: index.html 작성**

`index.html`:
```html
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <meta name="theme-color" content="#0d0f14">
  <title>운동기록</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <div id="app"></div>
  <script type="module" src="src/main.js"></script>
</body>
</html>
```

- [ ] **Step 6: 브라우저 검증**

Run: `node dev-server.cjs` (백그라운드) 후 헤드리스 Chrome으로 `http://localhost:8732` 캡처.
Expected: 다크 배경, 하단 탭바 3개(루틴/운동/기록), 탭 클릭 시 제목 바뀜, 콘솔 에러 없음. 스크린샷으로 확인.

- [ ] **Step 7: 커밋**

```bash
git add index.html styles.css src/ui.js src/main.js dev-server.cjs
git commit -m "feat: 앱 셸 + 미드나잇 디자인 토큰 + 탭 네비"
```

---

### Task 8: 루틴 화면 — 목록 + 운동/루틴 만들기 (ui.js, main.js)

**Files:**
- Modify: `src/ui.js`
- Modify: `src/main.js`

**Interfaces:**
- Consumes: store 메서드(Task 2~4), `lastEntryFor` 불필요.
- Produces:
  - `renderRoutines(screenEl, { routines, exercises, handlers })` — 루틴 카드 목록 + "루틴 시작" 버튼 + "운동 추가"/"루틴 추가" 진입.
  - `handlers = { onStart(routineId), onAddExercise({name,type,defaultRestSec}), onAddRoutine({name, items}) }`.
  - 운동/루틴 추가는 간단 폼(`prompt` 수준이 아니라 인라인 입력). v1은 최소: 운동 추가 = 이름+종류+휴식, 루틴 추가 = 이름 + 운동 다중선택 + 세트수.

- [ ] **Step 1: ui.js에 renderRoutines 추가**

`src/ui.js`에 추가:
```js
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
```

> 참고: 입력은 v1에서 `window.prompt`로 최소 구현. 인라인 폼/모달은 디자인 폴리시 단계(추후 슬라이스)에서 교체. 루틴 추가의 운동 선택 UX는 Step 2의 main 핸들러에서 prompt 다중선택으로 처리.

- [ ] **Step 2: main.js에서 라우팅 + 핸들러 배선**

`src/main.js`의 `render()`를 탭별 분기로 교체:
```js
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
```

- [ ] **Step 3: 브라우저 검증**

Run: `node dev-server.cjs` 후 헤드리스 Chrome.
시나리오: 운동 추가(prompt) → 루틴 추가(운동 선택) → 루틴 카드 보임 → "시작" 누르면 운동 탭으로 이동.
Expected: 카드·버튼 미드나잇 스타일, 동작 정상, 콘솔 에러 없음. 스크린샷 확인.

- [ ] **Step 4: 커밋**

```bash
git add src/ui.js src/main.js
git commit -m "feat: 루틴 화면 — 목록 + 운동/루틴 추가 + 세션 시작"
```

---

### Task 9: 운동 중 화면 — 세트 입력 + 휴식 타이머 링 + 소리/진동 (ui.js, main.js, styles.css)

**Files:**
- Modify: `src/ui.js`
- Modify: `src/main.js`
- Modify: `styles.css`

**Interfaces:**
- Consumes: `store.getSession`, `store.logSet`, `store.getState` (루틴·운동 이름 조회), `createRestTimer` (Task 6), `lastEntryFor` (Task 5).
- Produces:
  - `renderSession(el, { session, routine, exercises, lastEntries, timer, handlers })`.
  - `handlers = { onLogSet(exerciseId, {weight, reps}), onStartRest(restSec), onFinish() }`.
  - 타이머 링 = conic-gradient. main.js가 `setInterval(1초)`로 `timer.tick(1)` 후 재렌더, `isDone`에 소리(Web Audio 비프) + `navigator.vibrate(400)`.

- [ ] **Step 1: styles.css에 타이머 링 + 세트행 스타일 추가**

`styles.css` 끝에 추가:
```css
.timer-ring {
  width: 160px; height: 160px; border-radius: 50%; margin: 16px auto;
  display: flex; align-items: center; justify-content: center;
}
.timer-ring .t { font-size: 36px; font-weight: 800; color: var(--accent); letter-spacing: -0.02em; }
.setrow { display: flex; align-items: center; gap: 10px; padding: 12px 14px; border-radius: 14px; background: var(--surface-2); margin-bottom: var(--gap); }
.setrow.done { background: #11231b; color: var(--accent); }
.setrow .n { font-weight: 800; opacity: 0.5; width: 18px; }
.setrow .kg { margin-left: auto; font-weight: 700; }
.set-input { display: flex; gap: var(--gap); margin: 12px 0; }
.set-input input {
  flex: 1; background: var(--surface-2); border: 1px solid var(--surface-2);
  color: var(--text); padding: 14px; border-radius: 12px; font-size: 16px; min-height: var(--tap);
}
.last-hint { color: var(--text-dim); font-size: 13px; margin-bottom: 8px; }
```

- [ ] **Step 2: ui.js에 renderSession 추가**

```js
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
```

> 참고: `timer.pct`는 main.js가 계산해 넘김(0~100). ui.js는 표시만.

- [ ] **Step 3: main.js에 운동 탭 분기 + 타이머 루프 + 소리/진동**

`render()`의 분기에 추가(`if (tab === 'routines')` 뒤):
```js
  else if (tab === 'session') {
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
  }
```

파일 상단(`let activeSessionId = null;` 뒤)에 타이머/헬퍼 추가:
```js
import { renderSession } from './ui.js';
import { createRestTimer } from './timer.js';
import { lastEntryFor } from './history.js';

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
```

- [ ] **Step 4: 브라우저 검증**

Run: `node dev-server.cjs` 후 헤드리스 Chrome.
시나리오: 루틴 시작 → 운동 카드들 보임, "저번 기록" 힌트 표시 → 무게/반복 입력 후 "세트 완료" → 세트행 추가 + 타이머 링 카운트다운 시작 → 0 되면 멈춤.
Expected: 링이 conic-gradient로 줄어듦, 세트 누적, 콘솔 에러 없음. (소리/진동은 헤드리스서 안 들려도 에러 없으면 OK — 실제 폰에서 최종 확인.) 스크린샷 확인.

- [ ] **Step 5: 커밋**

```bash
git add src/ui.js src/main.js styles.css
git commit -m "feat: 운동 중 화면 — 세트 입력 + 휴식 타이머 링 + 소리/진동"
```

---

### Task 10: 기록 화면 — 지난 세션 + 운동별 이력 (ui.js, main.js)

**Files:**
- Modify: `src/ui.js`
- Modify: `src/main.js`

**Interfaces:**
- Consumes: `store.listSessions`, `store.listRoutines`, `store.listExercises`, `totalVolume` (Task 5).
- Produces: `renderHistory(el, { sessions, routines, exercises })` — 세션 카드 목록(날짜 + 루틴명 + 총 볼륨 + 운동별 세트 요약).

- [ ] **Step 1: ui.js에 renderHistory 추가**

```js
import 형태 유지 — 파일 상단 import는 없음(ui.js는 순수 렌더). totalVolume은 main이 계산해 넘긴다.
```
실제 코드:
```js
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
```

- [ ] **Step 2: main.js에 기록 탭 분기**

`render()` 분기에 추가:
```js
  else if (tab === 'history') {
    const exercises = store.listExercises();
    const routines = store.listRoutines();
    renderHistory(screen, {
      sessions: store.listSessions(),
      routineName: (id) => routines.find((r) => r.id === id)?.name ?? '자유 운동',
      exerciseName: (id) => exercises.find((e) => e.id === id)?.name ?? '(삭제됨)',
      volumeOf: (s) => totalVolume(s),
    });
  }
```

`src/main.js` 상단 import에 추가:
```js
import { renderHistory } from './ui.js';
import { lastEntryFor, totalVolume } from './history.js';
```
(기존 `import { lastEntryFor } from './history.js';`를 위 줄로 합침 — 중복 import 금지.)

- [ ] **Step 3: 브라우저 검증**

Run: `node dev-server.cjs` 후 헤드리스 Chrome.
시나리오: 운동 한 세션 마치고 종료 → 기록 탭에 그 세션 카드(날짜·루틴명·총 볼륨·운동별 요약) 보임.
Expected: 카드 정상, 총 볼륨 숫자 맞음, 콘솔 에러 없음. 스크린샷 확인.

- [ ] **Step 4: 커밋**

```bash
git add src/ui.js src/main.js
git commit -m "feat: 기록 화면 — 지난 세션 + 총 볼륨 + 운동별 요약"
```

---

### Task 11: PWA — manifest + 서비스워커 (오프라인 + 홈화면 추가)

**Files:**
- Create: `manifest.webmanifest`
- Create: `sw.js`
- Modify: `index.html`

**Interfaces:**
- Produces: 아이폰 Safari "홈 화면에 추가" 시 전체화면 다크 앱. 오프라인서 셸 로드.

- [ ] **Step 1: manifest 작성**

`manifest.webmanifest`:
```json
{
  "name": "운동기록",
  "short_name": "운동기록",
  "start_url": "./",
  "display": "standalone",
  "background_color": "#0d0f14",
  "theme_color": "#0d0f14",
  "icons": [
    { "src": "icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "icon-512.png", "sizes": "512x512", "type": "image/png" }
  ]
}
```

> 아이콘 `icon-192.png`/`icon-512.png`는 임시로 단색 다크+그린 PNG를 넣는다(추후 RD_PRO로 교체 가능). 없으면 manifest는 동작하되 홈화면 아이콘만 기본이 됨 — 검증에 필수는 아님.

- [ ] **Step 2: 서비스워커 작성**

`sw.js`:
```js
const CACHE = 'workout-logger-v1';
const ASSETS = [
  './', './index.html', './styles.css',
  './src/main.js', './src/ui.js', './src/store.js',
  './src/storage.js', './src/history.js', './src/timer.js',
];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)));
});
self.addEventListener('fetch', (e) => {
  e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request)));
});
```

- [ ] **Step 3: index.html에 manifest 링크 + SW 등록**

`<head>`의 `<link rel="stylesheet">` 뒤에 추가:
```html
  <link rel="manifest" href="manifest.webmanifest">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
```
`<script type="module" src="src/main.js">` 뒤에 추가:
```html
  <script>
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => navigator.serviceWorker.register('sw.js'));
    }
  </script>
```

- [ ] **Step 4: 브라우저 검증**

Run: `node dev-server.cjs` 후 헤드리스 Chrome.
Expected: 콘솔에 SW 등록 에러 없음. DevTools Application 탭 대신 — `navigator.serviceWorker.controller` 또는 등록 성공 확인(재로드 후). 캐시 동작은 네트워크 끊고 재로드 시 셸 뜨면 OK. 스크린샷/콘솔 확인.

- [ ] **Step 5: 커밋**

```bash
git add manifest.webmanifest sw.js index.html
git commit -m "feat: PWA — manifest + 서비스워커(오프라인 + 홈화면 추가)"
```

---

### Task 12: 최종 통합 검증 + README

**Files:**
- Create: `README.md`

- [ ] **Step 1: 전체 테스트**

Run: `node --test`
Expected: 모든 테스트 PASS (storage/store-exercises/store-routines/store-sessions/history/timer).

- [ ] **Step 2: 엔드투엔드 수동 시나리오 (브라우저)**

Run: `node dev-server.cjs` 후 헤드리스 Chrome.
시나리오: 운동 3개 추가 → "가슴날" 루틴 생성 → 시작 → 각 기구 세트 2~3개 입력(타이머 도는지) → 종료 → 기록 탭서 세션 확인 → 루틴 탭 돌아가 다시 시작 시 "저번 무게" 힌트 뜨는지.
Expected: 전 흐름 끊김 없음, 콘솔 에러 0. 스크린샷 확인.

- [ ] **Step 3: README 작성**

`README.md`:
```markdown
# 운동기록 (workout-logger)

헬스장용 개인 운동기록 PWA. 루틴 짜기 + 세트별 무게/반복 기록 + 휴식 타이머 + 지난기록 조회.

## 실행
```
node dev-server.cjs   # http://localhost:8732
```
아이폰: Safari로 접속 → 공유 → "홈 화면에 추가" → 전체화면 앱처럼 사용.

## 테스트
```
node --test
```

## 구조
- `src/storage.js` localStorage 래퍼
- `src/store.js` 운동/루틴/세션 CRUD
- `src/history.js` 저번 무게·총 볼륨 조회
- `src/timer.js` 휴식 타이머 상태기계
- `src/ui.js` 렌더(계산 금지)
- `src/main.js` 배선
```

- [ ] **Step 4: 커밋**

```bash
git add README.md
git commit -m "docs: README + 최종 통합 검증"
```

---

## Self-Review

**Spec coverage:**
- 운동 라이브러리 직접 추가 → Task 2 + Task 8 ✓
- 루틴 만들기 → Task 3 + Task 8 ✓
- 세션 진행 + 세트 기록 → Task 4 + Task 9 ✓
- 휴식 타이머 자동 + 소리/진동 → Task 6 + Task 9 ✓
- 기록 조회("저번 무게") → Task 5 + Task 9(힌트) + Task 10 ✓
- 미드나잇 화풍 + 디자인 토큰 → Task 7 ✓
- 네이티브 느낌 규칙(터치영역·tap-highlight·active 트랜지션·햅틱·standalone) → Task 7/9/11 ✓
- PWA(오프라인·홈화면) → Task 11 ✓
- 대시보드 = 나중 슬라이스(범위 밖) — 계획 제외, spec과 일치 ✓
- 제외 항목(습관체크/식단/계정/기본목록) — 어느 태스크도 안 만듦 ✓

**Placeholder scan:** UI 입력은 v1에서 `window.prompt`로 의도적 최소 구현(폴리시 슬라이스서 폼 교체) — 명시함. "TBD/추후구현" 류 없음. 아이콘 PNG는 옵션 명시.

**Type consistency:** 데이터 형태(Exercise/Routine/Session)는 Global Constraints에 고정, 전 태스크 동일. store 메서드명(addExercise/addRoutine/startSession/logSet/getSession/listSessions) 일관. `lastEntryFor(sessions, exerciseId)`·`totalVolume(session)` 시그니처 Task 5 정의와 Task 9/10 사용 일치. `createRestTimer(seconds)` Task 6 정의와 Task 9 사용 일치. main.js의 history import는 Task 10에서 합치라고 명시(중복 방지).
