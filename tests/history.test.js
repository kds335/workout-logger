import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lastEntryFor, totalVolume } from '../src/history.js';

const sessions = [
  { id: 's1', date: '2026-06-18', logs: [{ exerciseId: 'ex1', sets: [{ weight: 45, reps: 12 }] }] },
  { id: 's2', date: '2026-06-20', logs: [{ exerciseId: 'ex1', sets: [{ weight: 50, reps: 10 }, { weight: 50, reps: 8 }] }] },
];

test('lastEntryFor는 가장 최근 날짜의 세트', () => {
  const e = lastEntryFor(sessions, 'ex1');
  assert.equal(e.date, '2026-06-20');
  assert.equal(e.sets.length, 2);
  assert.equal(e.sets[0].weight, 50);
});

test('해당 운동 기록 없으면 null', () => {
  assert.equal(lastEntryFor(sessions, 'nope'), null);
});

test('빈 세션 배열이면 null', () => {
  assert.equal(lastEntryFor([], 'ex1'), null);
});

test('totalVolume = 무게*반복 합', () => {
  const v = totalVolume(sessions[1]); // 50*10 + 50*8
  assert.equal(v, 900);
});
