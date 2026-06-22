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
