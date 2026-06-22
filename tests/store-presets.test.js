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

const PRESETS = [
  { name: '벤치프레스', type: '가슴', defaultRestSec: 180 },
  { name: '랫풀다운', type: '등', defaultRestSec: 90 },
];

test('seedExercises는 프리셋을 추가하고 추가분을 리턴', () => {
  const s = makeStore();
  const added = s.seedExercises(PRESETS);
  assert.equal(added.length, 2);
  assert.deepEqual(s.listExercises().map((e) => e.name), ['벤치프레스', '랫풀다운']);
  assert.equal(s.listExercises()[0].type, '가슴');
});

test('seedExercises는 이름 겹치는 건 건너뜀(멱등)', () => {
  const s = makeStore();
  s.seedExercises(PRESETS);
  const added2 = s.seedExercises(PRESETS);
  assert.equal(added2.length, 0);
  assert.equal(s.listExercises().length, 2);
});

test('seedExercises는 없는 것만 보충 추가', () => {
  const s = makeStore();
  s.addExercise({ name: '벤치프레스', type: '가슴', defaultRestSec: 180 });
  const added = s.seedExercises(PRESETS);
  assert.equal(added.length, 1);
  assert.equal(added[0].name, '랫풀다운');
  assert.equal(s.listExercises().length, 2);
});

test('seedExercises 결과는 영속됨', () => {
  const backend = fakeBackend();
  const s1 = createStore({ storage: createStorage(backend), genId: seqId() });
  s1.seedExercises(PRESETS);
  const s2 = createStore({ storage: createStorage(backend), genId: seqId() });
  assert.equal(s2.listExercises().length, 2);
});
