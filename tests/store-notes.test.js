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

test('setNote/getNote 날짜에 총평 저장', () => {
  const s = makeStore();
  s.setNote('2026-06-23', '가슴 펌핑 잘됨');
  assert.equal(s.getNote('2026-06-23'), '가슴 펌핑 잘됨');
  assert.equal(s.getNote('2026-06-24'), null);
});

test('setNote 앞뒤 공백 정리', () => {
  const s = makeStore();
  s.setNote('2026-06-23', '  힘들었음  ');
  assert.equal(s.getNote('2026-06-23'), '힘들었음');
});

test('빈 문자열/공백이면 그 날 총평 지움', () => {
  const s = makeStore();
  s.setNote('2026-06-23', '메모');
  s.setNote('2026-06-23', '   ');
  assert.equal(s.getNote('2026-06-23'), null);
});

test('listNotes는 총평 맵 반환', () => {
  const s = makeStore();
  s.setNote('2026-06-23', 'a');
  s.setNote('2026-06-24', 'b');
  assert.deepEqual(s.listNotes(), { '2026-06-23': 'a', '2026-06-24': 'b' });
});

test('총평 영속됨', () => {
  const backend = fakeBackend();
  const s1 = createStore({ storage: createStorage(backend), genId: seqId() });
  s1.setNote('2026-06-23', '기록됨');
  const s2 = createStore({ storage: createStorage(backend), genId: seqId() });
  assert.equal(s2.getNote('2026-06-23'), '기록됨');
});
