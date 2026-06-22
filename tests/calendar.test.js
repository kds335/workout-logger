import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dateKey, buildMonth } from '../src/calendar.js';

test('dateKey는 로컬 YYYY-MM-DD (UTC 어긋남 없음)', () => {
  // 로컬 자정 직후 — toISOString이면 전날 될 수 있는 시각
  const d = new Date(2026, 5, 23, 0, 30); // 6월=month index 5
  assert.equal(dateKey(d), '2026-06-23');
});

test('dateKey 한 자리 월/일 0패딩', () => {
  assert.equal(dateKey(new Date(2026, 0, 5)), '2026-01-05');
});

test('buildMonth 2026-06 (6월): 30일, 6/1은 월요일', () => {
  const m = buildMonth(2026, 5);
  assert.equal(m.year, 2026);
  assert.equal(m.month, 5);
  // 모든 칸 펼쳐서 날짜 있는 것만
  const days = m.weeks.flat().filter(Boolean).map((c) => c.day);
  assert.equal(days.length, 30);
  assert.equal(days[0], 1);
  assert.equal(days[29], 30);
  // 각 주는 7칸
  for (const w of m.weeks) assert.equal(w.length, 7);
});

test('buildMonth 첫 주 앞쪽은 null 패딩(일요일 시작)', () => {
  const m = buildMonth(2026, 5); // 6/1 = 월요일 → 일요일칸 1개 비고 월요일에 1
  const first = m.weeks[0];
  assert.equal(first[0], null); // 일
  assert.equal(first[1].day, 1); // 월 = 1일
  assert.equal(first[1].dateKey, '2026-06-01');
});
