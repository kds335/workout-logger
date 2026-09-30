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

test('addCardioSession 저장 + listCardioSessions 최신순', () => {
  const s = makeStore();
  s.addCardioSession({ exerciseId: 'run', durationSec: 1800, date: '2026-07-05' });
  s.addCardioSession({ exerciseId: 'bike', durationSec: 1200, date: '2026-07-06' });
  const list = s.listCardioSessions();
  assert.equal(list.length, 2);
  assert.equal(list[0].exerciseId, 'bike'); // 최신 먼저
  assert.equal(list[0].durationSec, 1200);
});

test('removeCardioSession 삭제', () => {
  const s = makeStore();
  const c = s.addCardioSession({ exerciseId: 'run', durationSec: 600, date: '2026-07-06' });
  assert.equal(s.removeCardioSession(c.id), true);
  assert.equal(s.listCardioSessions().length, 0);
  assert.equal(s.removeCardioSession('없음'), false);
});

test('유산소도 영속됨', () => {
  const backend = fakeBackend();
  const s1 = createStore({ storage: createStorage(backend), genId: seqId() });
  s1.addCardioSession({ exerciseId: 'run', durationSec: 900, date: '2026-07-06' });
  const s2 = createStore({ storage: createStorage(backend), genId: seqId() });
  assert.equal(s2.listCardioSessions().length, 1);
  assert.equal(s2.listCardioSessions()[0].durationSec, 900);
});

test('백업 export/import에 유산소 포함', () => {
  const src = makeStore();
  src.addCardioSession({ exerciseId: 'run', durationSec: 1500, date: '2026-07-06' });
  const dump = src.exportData();
  const dst = makeStore();
  dst.importData(dump, 'replace');
  assert.equal(dst.listCardioSessions().length, 1);
  assert.equal(dst.listCardioSessions()[0].durationSec, 1500);
});

test('같은 타이머 id로 저장을 재시도해도 한 번만 기록됨', () => {
  const backend = fakeBackend();
  const s = makeStore(backend);
  const first = s.addCardioSession({ id: 'timer-1', exerciseId: 'run', durationSec: 100, date: '2026-09-30' });
  assert.equal(s.addCardioSession({ id: 'timer-1', exerciseId: 'run', durationSec: 110, date: '2026-09-30' }), first);
  const restored = makeStore(backend);
  restored.addCardioSession({ id: 'timer-1', exerciseId: 'run', durationSec: 120, date: '2026-09-30' });
  assert.equal(restored.listCardioSessions().length, 1);
  assert.equal(restored.listCardioSessions()[0].durationSec, 100);
});

test('유산소 저장 실패 후 동일 id 재시도 시 기록을 잃지 않음', () => {
  const backend = fakeBackend();
  const s = makeStore(backend);
  const save = backend.setItem;
  backend.setItem = () => { throw new Error('QuotaExceededError'); };
  const entry = { id: 'timer-1', exerciseId: 'run', durationSec: 100, date: '2026-09-30' };
  assert.throws(() => s.addCardioSession(entry), /QuotaExceededError/);
  assert.deepEqual(s.listCardioSessions(), []);
  backend.setItem = save;
  s.addCardioSession(entry);
  assert.equal(makeStore(backend).listCardioSessions().length, 1);
});

test('잘못된 유산소 시간은 기록되지 않음', () => {
  const s = makeStore();
  for (const durationSec of [-1, NaN, Infinity, '100']) {
    assert.throws(() => s.addCardioSession({ exerciseId: 'run', durationSec, date: '2026-09-30' }));
  }
  assert.deepEqual(s.listCardioSessions(), []);
});
