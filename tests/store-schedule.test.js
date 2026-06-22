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

test('setSchedule/getSchedule 날짜에 루틴 지정', () => {
  const s = makeStore();
  const r = s.addRoutine({ name: '가슴날', items: [] });
  s.setSchedule('2026-06-23', r.id);
  assert.equal(s.getSchedule('2026-06-23'), r.id);
  assert.equal(s.getSchedule('2026-06-24'), null);
});

test('setSchedule에 null이면 그 날 지움', () => {
  const s = makeStore();
  const r = s.addRoutine({ name: '가슴날', items: [] });
  s.setSchedule('2026-06-23', r.id);
  s.setSchedule('2026-06-23', null);
  assert.equal(s.getSchedule('2026-06-23'), null);
});

test('listSchedule는 지정된 날 맵 반환', () => {
  const s = makeStore();
  const r = s.addRoutine({ name: '가슴날', items: [] });
  s.setSchedule('2026-06-23', r.id);
  assert.deepEqual(s.listSchedule(), { '2026-06-23': r.id });
});

test('루틴 삭제하면 그 루틴 가리키던 스케줄도 비움', () => {
  const s = makeStore();
  const r = s.addRoutine({ name: '가슴날', items: [] });
  const r2 = s.addRoutine({ name: '등날', items: [] });
  s.setSchedule('2026-06-23', r.id);
  s.setSchedule('2026-06-24', r2.id);
  s.removeRoutine(r.id);
  assert.equal(s.getSchedule('2026-06-23'), null); // 비워짐
  assert.equal(s.getSchedule('2026-06-24'), r2.id); // 남음
});

test('스케줄 영속됨', () => {
  const backend = fakeBackend();
  const s1 = createStore({ storage: createStorage(backend), genId: seqId() });
  const r = s1.addRoutine({ name: '가슴날', items: [] });
  s1.setSchedule('2026-06-23', r.id);
  const s2 = createStore({ storage: createStorage(backend), genId: seqId() });
  assert.equal(s2.getSchedule('2026-06-23'), r.id);
});
