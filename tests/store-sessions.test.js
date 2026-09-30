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

test('logSet에 restSec 주면 세트에 기록됨', () => {
  const s = makeStore();
  const sess = s.startSession({ routineId: 'r1', date: '2026-06-22' });
  s.logSet(sess.id, 'ex1', { weight: 50, reps: 12, restSec: 90 });
  assert.deepEqual(s.getSession(sess.id).logs[0].sets, [{ weight: 50, reps: 12, restSec: 90 }]);
});

test('updateLastSetRest는 그 운동 마지막 세트 휴식초 갱신', () => {
  const s = makeStore();
  const sess = s.startSession({ routineId: 'r1', date: '2026-06-22' });
  s.logSet(sess.id, 'ex1', { weight: 50, reps: 12, restSec: 90 });
  s.logSet(sess.id, 'ex1', { weight: 50, reps: 10, restSec: 90 });
  s.updateLastSetRest(sess.id, 'ex1', 105);
  const sets = s.getSession(sess.id).logs[0].sets;
  assert.equal(sets[0].restSec, 90); // 첫 세트 그대로
  assert.equal(sets[1].restSec, 105); // 마지막만 갱신
});

test('updateLastSetRest 대상 없으면 조용히 무시', () => {
  const s = makeStore();
  const sess = s.startSession({ routineId: 'r1', date: '2026-06-22' });
  assert.doesNotThrow(() => s.updateLastSetRest(sess.id, 'nope', 60));
});

test('0kg 맨몸 기록 허용, 잘못된 무게/횟수/휴식은 상태 변경 없이 거절', () => {
  const s = makeStore();
  const sess = s.startSession({ date: '2026-09-30' });
  s.logSet(sess.id, 'ex1', { weight: 0, reps: 12, restSec: 0 });
  const before = s.exportData();
  const invalid = [
    { weight: -1, reps: 10 }, { weight: NaN, reps: 10 }, { weight: Infinity, reps: 10 },
    { weight: '20', reps: 10 }, { weight: 20, reps: 0 }, { weight: 20, reps: -1 },
    { weight: 20, reps: 1.5 }, { weight: 20, reps: Infinity }, { weight: 20, reps: '10' },
    { weight: 20, reps: 10, restSec: -1 },
  ];
  for (const set of invalid) {
    assert.throws(() => s.logSet(sess.id, 'ex2', set));
    assert.deepEqual(s.exportData(), before);
  }
});

test('updateSet은 선택한 세트만 수정하고 휴식 기록을 유지하며 저장됨', () => {
  const backend = fakeBackend();
  const s = createStore({ storage: createStorage(backend), genId: seqId() });
  const sess = s.startSession({ date: '2026-09-30' });
  s.logSet(sess.id, 'ex1', { weight: 50, reps: 12, restSec: 90 });
  s.logSet(sess.id, 'ex1', { weight: 50, reps: 10, restSec: 120 });
  assert.deepEqual(s.updateSet(sess.id, 'ex1', 0, { weight: 0, reps: 15 }), { weight: 0, reps: 15, restSec: 90 });
  const restored = createStore({ storage: createStorage(backend) }).getSession(sess.id);
  assert.deepEqual(restored.logs[0].sets, [
    { weight: 0, reps: 15, restSec: 90 }, { weight: 50, reps: 10, restSec: 120 },
  ]);
  assert.throws(() => s.updateSet(sess.id, 'ex1', 0, { weight: 0, reps: 0 }));
  assert.deepEqual(s.getSession(sess.id), restored);
});

test('세트 수정/삭제의 없는 대상과 잘못된 인덱스는 기록을 건드리지 않음', () => {
  const s = makeStore();
  const sess = s.startSession({ date: '2026-09-30' });
  s.logSet(sess.id, 'ex1', { weight: 20, reps: 10 });
  const before = s.exportData();
  for (const index of [-1, 1, 0.5, '0', NaN]) {
    assert.equal(s.updateSet(sess.id, 'ex1', index, { weight: 30, reps: 10 }), null);
    assert.equal(s.removeSet(sess.id, 'ex1', index), false);
  }
  assert.equal(s.updateSet('missing', 'ex1', 0, { weight: 30, reps: 10 }), null);
  assert.equal(s.removeSet(sess.id, 'missing', 0), false);
  assert.deepEqual(s.exportData(), before);
});

test('removeSet은 선택한 세트를 삭제하고 마지막 세트 삭제 시 빈 운동 로그를 정리', () => {
  const s = makeStore();
  const sess = s.startSession({ date: '2026-09-30' });
  s.logSet(sess.id, 'ex1', { weight: 20, reps: 10 });
  s.logSet(sess.id, 'ex1', { weight: 25, reps: 8 });
  s.logSet(sess.id, 'ex2', { weight: 0, reps: 12 });
  assert.equal(s.removeSet(sess.id, 'ex1', 0), true);
  assert.deepEqual(s.getSession(sess.id).logs[0].sets, [{ weight: 25, reps: 8 }]);
  assert.equal(s.removeSet(sess.id, 'ex1', 0), true);
  assert.equal(s.getSession(sess.id).logs.length, 1);
  assert.equal(s.getSession(sess.id).logs[0].exerciseId, 'ex2');
});

test('removeSession은 선택한 세션만 삭제', () => {
  const s = makeStore();
  const empty = s.startSession({ date: '2026-09-30' });
  const recorded = s.startSession({ date: '2026-09-30' });
  s.logSet(recorded.id, 'ex1', { weight: 20, reps: 10 });
  assert.equal(s.removeSession(empty.id), true);
  assert.equal(s.removeSession(empty.id), false);
  assert.equal(s.getSession(empty.id), null);
  assert.equal(s.getSession(recorded.id).logs[0].sets.length, 1);
});

test('세트 추가/수정/삭제 저장 실패 시 보이는 기록도 원래대로 유지', () => {
  const backend = fakeBackend();
  const s = createStore({ storage: createStorage(backend), genId: seqId() });
  const sess = s.startSession({ date: '2026-09-30' });
  s.logSet(sess.id, 'ex1', { weight: 20, reps: 10, restSec: 60 });
  const before = s.exportData();
  backend.setItem = () => { throw new Error('QuotaExceededError'); };
  const actions = [
    () => s.logSet(sess.id, 'ex1', { weight: 30, reps: 8 }),
    () => s.updateSet(sess.id, 'ex1', 0, { weight: 30, reps: 8 }),
    () => s.removeSet(sess.id, 'ex1', 0),
    () => s.updateLastSetRest(sess.id, 'ex1', 90),
    () => s.removeSession(sess.id),
  ];
  for (const action of actions) {
    assert.throws(action, /QuotaExceededError/);
    assert.deepEqual(s.exportData(), before);
    assert.equal(s.getSession(sess.id), sess);
  }
});
