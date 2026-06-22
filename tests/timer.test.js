import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRestTimer } from '../src/timer.js';

test('초기 remaining = 설정값, 안 끝남', () => {
  const t = createRestTimer(90);
  assert.equal(t.remaining, 90);
  assert.equal(t.isDone, false);
});

test('tick하면 줄어듦', () => {
  const t = createRestTimer(90);
  t.tick(1);
  assert.equal(t.remaining, 89);
});

test('0 아래로 안 내려가고 isDone true', () => {
  const t = createRestTimer(2);
  t.tick(5);
  assert.equal(t.remaining, 0);
  assert.equal(t.isDone, true);
});

test('reset으로 다시 설정', () => {
  const t = createRestTimer(2);
  t.tick(2);
  t.reset(60);
  assert.equal(t.remaining, 60);
  assert.equal(t.isDone, false);
});
