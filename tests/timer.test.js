import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRestTimer, createElapsedTimer, createDeadlineTimer } from '../src/timer.js';

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

test('add로 시간 늘림', () => {
  const t = createRestTimer(60);
  t.add(15);
  assert.equal(t.remaining, 75);
});

test('add 음수로 줄이되 0 아래로 안 감', () => {
  const t = createRestTimer(10);
  t.add(-15);
  assert.equal(t.remaining, 0);
  assert.equal(t.isDone, true);
});

test('스톱워치는 시작 전 정지하고 start는 0부터 시작한다', () => {
  let time = 0;
  const t = createElapsedTimer({ now: () => time });
  assert.equal(t.running, false);
  assert.equal(t.elapsedMs, 0);
  t.start();
  assert.equal(t.running, true);
  time = 1250;
  assert.equal(t.elapsedMs, 1250);
  assert.equal(t.elapsedSec, 1);
  t.start();
  assert.equal(t.elapsedMs, 0);
  assert.equal(t.running, true);
});

test('스톱워치는 백그라운드에서 호출이 없어도 경과 시간을 계산한다', () => {
  let time = 1000;
  const t = createElapsedTimer({ now: () => time });
  t.start();
  time += 37 * 60 * 1000 + 423;
  assert.equal(t.elapsedMs, 2220423);
  assert.equal(t.elapsedSec, 2220);
});

test('pause/resume은 밀리초를 보존하고 멈춘 시간은 제외한다', () => {
  let time = 0;
  const t = createElapsedTimer({ now: () => time });
  t.start();
  time = 650;
  t.pause();
  assert.equal(t.running, false);
  time = 10650;
  assert.equal(t.elapsedMs, 650);
  t.pause();
  t.resume();
  time += 450;
  t.resume();
  assert.equal(t.elapsedMs, 1100);
  assert.equal(t.elapsedSec, 1);
  t.pause();
  time += 5000;
  t.resume();
  time += 950;
  assert.equal(t.elapsedMs, 2050);
  assert.equal(t.elapsedSec, 2);
});

test('reset은 기록을 지우고 정지한다', () => {
  let time = 0;
  const t = createElapsedTimer({ now: () => time });
  t.start();
  time = 5000;
  t.reset();
  time = 10000;
  assert.equal(t.elapsedMs, 0);
  assert.equal(t.running, false);
  assert.deepEqual(t.snapshot(), { accumulatedMs: 0, startedAt: null });
});

test('실행 중 snapshot은 재생성 후에도 닫혀 있던 시간을 포함한다', () => {
  let time = 1000;
  const now = () => time;
  const t = createElapsedTimer({ now });
  t.start();
  time += 650;
  t.pause();
  time += 1000;
  t.resume();
  time += 500;
  const saved = JSON.parse(JSON.stringify(t.snapshot()));
  time += 120000;
  const restored = createElapsedTimer({ now, snapshot: saved });
  assert.equal(restored.running, true);
  assert.equal(restored.elapsedMs, 121150);
  assert.equal(restored.elapsedSec, 121);
});

test('정지한 snapshot은 재생성 이후 정지 상태와 소수 초를 보존한다', () => {
  let time = 1000;
  const now = () => time;
  const t = createElapsedTimer({ now });
  t.start();
  time += 750;
  t.pause();
  const saved = t.snapshot();
  time += 60000;
  const restored = createElapsedTimer({ now, snapshot: saved });
  assert.equal(restored.running, false);
  assert.equal(restored.elapsedMs, 750);
  restored.resume();
  time += 500;
  assert.equal(restored.elapsedMs, 1250);
});

test('snapshot은 독립 객체이며 잘못된 저장 값은 초기값으로 처리한다', () => {
  const t = createElapsedTimer({ now: () => 0 });
  const saved = t.snapshot();
  saved.accumulatedMs = 99999;
  saved.startedAt = 0;
  assert.equal(t.elapsedMs, 0);
  assert.equal(t.running, false);
  const restored = createElapsedTimer({ snapshot: { accumulatedMs: -1, startedAt: 'bad' } });
  assert.deepEqual(restored.snapshot(), { accumulatedMs: 0, startedAt: null });
});

test('시계가 뒤로 이동해도 음수 경과 시간을 표시하지 않는다', () => {
  let time = 1000;
  const t = createElapsedTimer({ now: () => time });
  t.start();
  time = 0;
  assert.equal(t.elapsedMs, 0);
});

test('휴식 타이머는 deadline으로 계산하고 남은 소수 초는 올림한다', () => {
  let time = 1000;
  const t = createDeadlineTimer(90, { now: () => time });
  assert.equal(t.remaining, 90);
  assert.equal(t.isDone, false);
  time += 89999;
  assert.equal(t.remaining, 1);
  assert.equal(t.remainingMs, 1);
  time += 1;
  assert.equal(t.remaining, 0);
  assert.equal(t.isDone, true);
  time += 60000;
  assert.equal(t.remaining, 0);
});

test('휴식은 화면이 오래 중단되어도 복귀 시 완료 상태다', () => {
  let time = 1000;
  const t = createDeadlineTimer(90, { now: () => time });
  time += 120000;
  assert.equal(t.isDone, true);
  assert.equal(t.remaining, 0);
});

test('휴식 snapshot 복원은 원래 마감 시각을 유지한다', () => {
  let time = 1000;
  const now = () => time;
  const t = createDeadlineTimer(90, { now });
  time += 10500;
  const saved = JSON.parse(JSON.stringify(t.snapshot()));
  time += 60000;
  const restored = createDeadlineTimer(1, { now, snapshot: saved });
  assert.equal(restored.remainingMs, 19500);
  assert.equal(restored.remaining, 20);
  time += 20000;
  assert.equal(restored.isDone, true);
});

test('휴식 시간 조절은 소수 초를 보존하고 0 아래로 내려가지 않는다', () => {
  let time = 0;
  const t = createDeadlineTimer(60, { now: () => time });
  time += 250;
  t.add(15);
  assert.equal(t.remainingMs, 74750);
  t.add(-80);
  assert.equal(t.remaining, 0);
  assert.equal(t.isDone, true);
  time += 60000;
  t.add(15);
  assert.equal(t.remaining, 15);
  assert.equal(t.isDone, false);
});

test('휴식 reset은 현재 시각에서 새로 시작한다', () => {
  let time = 0;
  const t = createDeadlineTimer(10, { now: () => time });
  time += 100000;
  t.reset(60);
  assert.equal(t.remaining, 60);
  assert.equal(t.isDone, false);
  time += 10000;
  assert.equal(t.remaining, 50);
});
