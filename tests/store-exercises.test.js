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
