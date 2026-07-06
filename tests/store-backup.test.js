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

test('importData는 깨진/빈 payload에도 안전 (데이터 안 날림)', () => {
  const s = seeded('a');
  s.importData(null, 'merge');
  s.importData({ garbage: true }, 'merge');
  s.importData({ state: { exercises: 'nope' } }, 'merge');
  assert.equal(s.listExercises().length, 1); // 그대로
  assert.equal(s.listSessions().length, 1);
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
