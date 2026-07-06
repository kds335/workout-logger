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
