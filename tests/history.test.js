import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lastEntryFor, totalVolume, groupSessionsByDate } from '../src/history.js';

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

test('groupSessionsByDate: 날짜별 묶고 최신순', () => {
  const g = groupSessionsByDate(sessions);
  assert.equal(g.length, 2);
  assert.equal(g[0].date, '2026-06-20'); // 최신 먼저
  assert.equal(g[1].date, '2026-06-18');
  assert.equal(g[0].volume, 900);
});

test('groupSessionsByDate: 빈 세션(logs 0) 제외', () => {
  const withEmpty = [
    ...sessions,
    { id: 's3', date: '2026-06-21', routineId: 'r1', logs: [] },
  ];
  const g = groupSessionsByDate(withEmpty);
  assert.equal(g.length, 2); // s3 빠짐
  assert.ok(!g.some((d) => d.date === '2026-06-21'));
});

test('groupSessionsByDate: 같은 날 여러 세션 운동 합침', () => {
  const sameDay = [
    { id: 'a', date: '2026-06-22', routineId: 'r1', logs: [{ exerciseId: 'ex1', sets: [{ weight: 50, reps: 10 }] }] },
    { id: 'b', date: '2026-06-22', routineId: 'r2', logs: [{ exerciseId: 'ex1', sets: [{ weight: 55, reps: 8 }] }, { exerciseId: 'ex2', sets: [{ weight: 20, reps: 12 }] }] },
  ];
  const g = groupSessionsByDate(sameDay);
  assert.equal(g.length, 1);
  const day = g[0];
  const ex1 = day.logs.find((l) => l.exerciseId === 'ex1');
  assert.equal(ex1.sets.length, 2); // 두 세션 세트 합쳐짐
  assert.equal(day.logs.length, 2); // ex1, ex2
  assert.deepEqual(day.routineIds.sort(), ['r1', 'r2']);
  assert.equal(day.volume, 50 * 10 + 55 * 8 + 20 * 12);
});
