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

test('루틴 추가', () => {
  const s = makeStore();
  const r = s.addRoutine({
    name: '가슴날',
    items: [{ exerciseId: 'ex1', targetSets: 3, restSec: 90 }],
  });
  assert.equal(r.id, 'id1');
  assert.equal(r.name, '가슴날');
  assert.equal(r.items.length, 1);
  assert.equal(s.listRoutines().length, 1);
});

test('items 기본값은 빈 배열', () => {
  const s = makeStore();
  const r = s.addRoutine({ name: '빈루틴' });
  assert.deepEqual(r.items, []);
});

test('루틴 수정(items 교체)', () => {
  const s = makeStore();
  s.addRoutine({ name: '가슴날' });
  const upd = s.updateRoutine('id1', { items: [{ exerciseId: 'ex9', targetSets: 4, restSec: 60 }] });
  assert.equal(upd.items[0].targetSets, 4);
});

test('루틴 삭제', () => {
  const s = makeStore();
  s.addRoutine({ name: '가슴날' });
  assert.equal(s.removeRoutine('id1'), true);
  assert.deepEqual(s.listRoutines(), []);
});
