import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStorage } from '../src/storage.js';

function fakeBackend() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, v),
    removeItem: (k) => m.delete(k),
  };
}

test('save 후 load 하면 같은 객체', () => {
  const s = createStorage(fakeBackend());
  s.save('k', { a: 1, b: [2, 3] });
  assert.deepEqual(s.load('k'), { a: 1, b: [2, 3] });
});

test('없는 키는 fallback 반환', () => {
  const s = createStorage(fakeBackend());
  assert.equal(s.load('nope', 'default'), 'default');
});

test('깨진 JSON은 fallback 반환', () => {
  const backend = fakeBackend();
  backend.setItem('bad', '{not json');
  const s = createStorage(backend);
  assert.equal(s.load('bad', null), null);
});
