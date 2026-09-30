import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStorage } from '../src/storage.js';
import { createStore, inspectBackup, STORAGE_KEY } from '../src/store.js';

function fakeBackend() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, v),
    removeItem: (k) => m.delete(k),
  };
}
function seqId(prefix = 'id') {
  let n = 0;
  return () => `${prefix}${++n}`;
}
function makeStore(prefix) {
  return createStore({ storage: createStorage(fakeBackend()), genId: seqId(prefix) });
}
// 표본 데이터 채운 스토어
function seeded(prefix) {
  const s = makeStore(prefix);
  const e1 = s.addExercise({ name: '벤치', type: '가슴' });
  const r1 = s.addRoutine({ name: '가슴날', items: [{ exerciseId: e1.id, targetSets: 3 }] });
  const sess = s.startSession({ routineId: r1.id, date: '2026-07-06' });
  s.logSet(sess.id, e1.id, { weight: 60, reps: 10 });
  s.setSchedule('2026-07-08', r1.id);
  s.setNote('2026-07-06', '좋음');
  return s;
}

test('exportData는 app/버전 표식과 전체 state 포함', () => {
  const s = seeded('a');
  const dump = s.exportData();
  assert.equal(dump.app, 'workout-logger');
  assert.equal(dump.v, 1);
  assert.equal(dump.state.exercises.length, 1);
  assert.equal(dump.state.sessions.length, 1);
  assert.equal(dump.state.notes['2026-07-06'], '좋음');
});

test('exportData는 깊은 복사 — 이후 변경이 스냅샷에 안 샘', () => {
  const s = seeded('a');
  const dump = s.exportData();
  s.addExercise({ name: '스쿼트', type: '하체' });
  assert.equal(dump.state.exercises.length, 1); // 스냅샷 그대로
});

test('importData replace: 전체 덮어쓰기', () => {
  const src = seeded('src');
  const dump = src.exportData();
  const dst = makeStore('dst');
  dst.addExercise({ name: '기존운동', type: '기타' });
  dst.importData(dump, 'replace');
  const names = dst.listExercises().map((e) => e.name);
  assert.deepEqual(names, ['벤치']); // 기존운동 사라지고 백업으로 대체
  assert.equal(dst.getNote('2026-07-06'), '좋음');
});

test('importData merge: 기존 유지하며 합치고 id중복 안 늘림', () => {
  const src = seeded('src');
  const dump = src.exportData();
  const dst = makeStore('dst');
  const keep = dst.addExercise({ name: '기존운동', type: '기타' });
  dst.importData(dump, 'merge');
  const ids = dst.listExercises().map((e) => e.id);
  assert.equal(dst.listExercises().length, 2); // 기존1 + 백업1
  assert.ok(ids.includes(keep.id)); // 기존 유지
  // 같은 백업 또 합쳐도 중복 안 생김
  dst.importData(dump, 'merge');
  assert.equal(dst.listExercises().length, 2);
});

test('importData merge: 스케줄/총평은 기존 우선', () => {
  const src = seeded('src');
  const dump = src.exportData(); // 2026-07-06 총평 '좋음'
  const dst = makeStore('dst');
  dst.setNote('2026-07-06', '내가쓴것');
  dst.importData(dump, 'merge');
  assert.equal(dst.getNote('2026-07-06'), '내가쓴것'); // 안 덮음
});

test('importData는 깨진/빈 payload를 merge/replace 모두 거절하고 기존 데이터를 보존', () => {
  const s = seeded('a');
  const before = s.exportData();
  for (const mode of ['merge', 'replace']) {
    for (const invalid of [null, [], {}, { garbage: true }, { state: { exercises: 'nope' } }]) {
      assert.throws(() => s.importData(invalid, mode), /백업/);
      assert.deepEqual(s.exportData(), before);
    }
  }
});

test('내보내기→불러오기 라운드트립 영속', () => {
  const src = seeded('src');
  const dump = src.exportData();
  const backend = fakeBackend();
  const a = createStore({ storage: createStorage(backend), genId: seqId('x') });
  a.importData(dump, 'replace');
  const b = createStore({ storage: createStorage(backend), genId: seqId('y') });
  assert.equal(b.listExercises().length, 1);
  assert.equal(b.getNote('2026-07-06'), '좋음');
});

test('inspectBackup는 가져오기 전 개수를 알려주고 원본/현재 상태를 변경하지 않음', () => {
  const src = seeded('src');
  src.addCardioSession({ exerciseId: 'run', date: '2026-07-06', durationSec: 120 });
  const payload = src.exportData();
  const before = structuredClone(payload);
  assert.deepEqual(inspectBackup(payload), {
    exercises: 1, routines: 1, sessions: 1, cardioSessions: 1, sets: 1, schedule: 1, notes: 1,
  });
  assert.deepEqual(src.inspectBackup(payload), inspectBackup(payload));
  assert.deepEqual(payload, before);
});

test('이전 raw-state 백업은 새 선택 필드가 없어도 호환됨', () => {
  const { exercises, routines, sessions } = seeded('src').exportData().state;
  const dst = makeStore('dst');
  dst.importData({ exercises, routines, sessions }, 'replace');
  assert.equal(dst.listSessions().length, 1);
  assert.deepEqual(dst.listCardioSessions(), []);
  assert.deepEqual(dst.listNotes(), {});
  assert.deepEqual(dst.listSchedule(), {});
});

test('다른 앱, 지원하지 않는 버전, 잘못된 복원 모드는 변경 없이 거절', () => {
  const store = seeded('src');
  const before = store.exportData();
  for (const bad of [{ ...before, app: 'other-app' }, { ...before, v: 2 }, { ...before, v: undefined }]) {
    assert.throws(() => store.importData(bad, 'replace'), /앱 또는 백업 버전/);
  }
  assert.throws(() => store.importData(before, 'overwrite'), /복원 방식/);
  assert.deepEqual(store.exportData(), before);
});

test('중첩 구조와 숫자/날짜가 잘못된 백업은 일부도 반영하지 않음', () => {
  const store = seeded('src');
  const before = store.exportData();
  const breakData = [
    (s) => { s.exercises[0].name = 3; },
    (s) => { s.exercises[0].defaultRestSec = Infinity; },
    (s) => { s.routines[0].items = {}; },
    (s) => { s.routines[0].items[0].targetSets = 0; },
    (s) => { s.sessions[0].logs = null; },
    (s) => { s.sessions[0].date = '2026-02-30'; },
    (s) => { s.sessions[0].logs[0].sets = 'bad'; },
    (s) => { s.sessions[0].logs[0].sets[0].weight = NaN; },
    (s) => { s.sessions[0].logs[0].sets[0].reps = 2.5; },
    (s) => { s.sessions[0].logs[0].sets[0].restSec = -1; },
    (s) => { s.sessions[0].logs.push(structuredClone(s.sessions[0].logs[0])); },
    (s) => { s.schedule = []; },
    (s) => { s.notes['2026-07-06'] = { text: 'bad' }; },
    (s) => { s.cardioSessions = [{ id: 'c1', exerciseId: 'run', date: '2026-07-06', durationSec: '120' }]; },
  ];
  for (const corrupt of breakData) {
    const payload = structuredClone(before);
    corrupt(payload.state);
    assert.throws(() => store.importData(payload, 'replace'));
    assert.deepEqual(store.exportData(), before);
  }
});

test('한 백업 파일의 중복 id는 데이터 손실 없이 거절', () => {
  const store = seeded('src');
  const before = store.exportData();
  const bad = structuredClone(before);
  bad.state.sessions.push({ ...bad.state.sessions[0], logs: [] });
  assert.throws(() => store.importData(bad), /id 중복/);
  assert.deepEqual(store.exportData(), before);
});

test('기존과 동일한 id는 기존 내용 우선, 가져온 객체는 원본과 분리', () => {
  const store = seeded('same');
  const dump = store.exportData();
  dump.state.exercises[0].name = '바뀐 이름';
  const existingName = store.listExercises()[0].name;
  store.importData(dump);
  assert.equal(store.listExercises()[0].name, existingName);
  const other = makeStore('other');
  other.importData(dump, 'replace');
  dump.state.sessions[0].logs[0].sets[0].weight = 999;
  assert.equal(other.listSessions()[0].logs[0].sets[0].weight, 60);
});

test('가져오기 저장 실패 시 메모리와 영구 저장 데이터가 그대로 유지됨', () => {
  const backend = fakeBackend();
  const store = createStore({ storage: createStorage(backend), genId: seqId('dst') });
  store.addExercise({ name: '기존 운동' });
  const before = store.exportData();
  const persistedBefore = backend.getItem(STORAGE_KEY);
  backend.setItem = () => { throw new Error('QuotaExceededError'); };
  for (const mode of ['merge', 'replace']) {
    assert.throws(() => store.importData(seeded('src').exportData(), mode), /QuotaExceededError/);
    assert.deepEqual(store.exportData(), before);
    assert.equal(backend.getItem(STORAGE_KEY), persistedBefore);
  }
});
