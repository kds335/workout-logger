import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';

// Synthetic fixtures only. Never commit a user's personal backup to this suite.
const baseURL = process.env.WORKOUT_URL || 'http://localhost:8732';
const stateKey = 'workout-logger/state/v1';
const activityKey = 'workout-logger/activity/v1';
const fixture = {
  exercises: [
    { id: 'press', name: '벤치프레스 머신', type: '가슴', defaultRestSec: 90 },
    { id: 'row', name: '한 팔씩 하는 시티드 케이블 로우', type: '등', defaultRestSec: 90 },
    { id: 'bike', name: '실내 자전거', type: '유산소', defaultRestSec: 90 },
  ],
  routines: [{ id: 'push', name: 'Push · 오늘의 운동', items: [{ exerciseId: 'press', targetSets: 3 }, { exerciseId: 'row', targetSets: 2 }] }],
  sessions: [{ id: 'previous', date: '2026-09-28', routineId: 'push', logs: [{ exerciseId: 'press', sets: [{ weight: 70, reps: 10 }] }] }],
  cardioSessions: [], schedule: {}, notes: {},
};
const browser = await chromium.launch({ headless: true });
const errors = [];
await mkdir('99_작업자료/browser-check', { recursive: true });
async function fresh({ clock = true, activity = null, state = fixture } = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce', serviceWorkers: 'block' });
  await context.addInitScript(({ stateKey, activityKey, state, activity }) => {
    if (!localStorage.getItem(stateKey)) {
      localStorage.setItem(stateKey, JSON.stringify(state));
      if (activity) localStorage.setItem(activityKey, JSON.stringify(activity));
    }
  }, { stateKey, activityKey, state, activity });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  if (clock) {
    await page.clock.install({ time: new Date('2026-09-30T00:00:00Z') });
    await page.clock.pauseAt(new Date('2026-09-30T00:00:01Z'));
  }
  await page.goto(baseURL);
  await page.locator('h1').waitFor();
  return { page, context };
}
const text = (page, selector) => page.locator(selector).textContent();
const countCardio = (page) => page.evaluate(() => window.__store.listCardioSessions().length);
try {
  {
    const { page, context } = await fresh();
    await page.locator('[data-start="push"]').click();
    const first = page.locator('[data-ex="press"]');
    assert.equal(await first.locator('.in-weight').inputValue(), '70');
    await first.locator('.in-weight').fill('0');
    await first.locator('.in-reps').fill('12');
    await first.locator('.log-set').click();
    assert.equal(await first.locator('.completed-set').count(), 1);
    await page.locator('#rest-duration').selectOption('180');
    const second = page.locator('[data-ex="row"]');
    await second.locator('.in-weight').fill('47.5');
    await second.locator('.in-reps').fill('9');
    await second.locator('.in-reps').focus();
    await page.clock.fastForward(91000);
    assert.equal(await page.locator('[data-timer="rest"]').count(), 0);
    assert.equal(await second.locator('.in-weight').inputValue(), '47.5');
    assert.equal(await page.evaluate(() => document.activeElement.className), 'in-reps');
    await page.locator('[data-tab="routines"]').click();
    await page.getByRole('button', { name: /계속하기/ }).click();
    assert.equal(await second.locator('.in-reps').inputValue(), '9');
    await page.reload();
    assert.equal(await page.locator('#rest-duration').inputValue(), '180');
    assert.equal(await second.locator('.in-weight').inputValue(), '47.5');
    await first.locator('.set-edit').click();
    await first.locator('.edit-weight').fill('2.5');
    await first.locator('.edit-reps').fill('15');
    await first.getByRole('button', { name: '수정 저장' }).click();
    assert.match(await first.locator('.setval').textContent(), /2.5.*15/);
    await first.locator('.in-reps').fill('1.5');
    await first.locator('.log-set').click();
    assert.equal(await first.locator('.completed-set').count(), 1);
    assert.equal(await first.locator('.input-error').isVisible(), true);
    await first.locator('.in-reps').fill('15');
    assert.equal(await first.locator('.input-error').isVisible(), false);
    await page.setViewportSize({ width: 320, height: 760 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await page.screenshot({ path: '99_작업자료/browser-check/session-320.png', fullPage: true, animations: 'disabled' });
    page.once('dialog', (dialog) => dialog.accept());
    await first.locator('.set-remove').click();
    assert.equal(await first.locator('.completed-set').count(), 0);
    assert.equal(await second.locator('.in-weight').inputValue(), '47.5');
    await first.locator('.log-set').click();
    await first.locator('.log-set').click();
    page.once('dialog', (dialog) => dialog.accept());
    await first.locator('.set-remove').last().click();
    assert.equal(await page.locator('[data-timer="rest"]').count(), 0);
    assert.equal(await page.evaluate(() => window.__store.listSessions()[0].logs[0].sets[0].restSec), 180);
    await context.close();
    console.log('PASS mobile session: zero weight, defaults, validation, edit/delete, drafts, reload, 320px');
  }
  {
    const { page, context } = await fresh();
    await page.locator('[data-start="push"]').click();
    await page.locator('[data-ex="press"] .log-set').click();
    await page.locator('[data-tab="cardio"]').click();
    await page.locator('[data-mid="bike"]').click();
    await page.locator('[data-mode="stop"]').click();
    await page.locator('#cardio-start').click();
    // fastForward fires overdue interval work once, modelling a suspended renderer.
    await page.clock.fastForward(375000);
    assert.equal(await text(page, '[data-timer="cardio"] .t'), '6:15');
    await page.locator('#cardio-pause').click();
    await page.clock.fastForward(300000);
    assert.equal(await text(page, '[data-timer="cardio"] .t'), '6:15');
    await page.reload();
    await page.locator('[data-tab="cardio"]').click();
    assert.equal(await text(page, '[data-timer="cardio"] .t'), '6:15');
    assert.equal(await text(page, '#cardio-pause'), '재개');
    await page.locator('#cardio-pause').click();
    await page.clock.fastForward(45000);
    await page.screenshot({ path: '99_작업자료/browser-check/cardio-390.png', fullPage: true, animations: 'disabled' });
    await page.locator('#cardio-finish').click();
    assert.equal(await countCardio(page), 1);
    assert.equal(await page.evaluate(() => window.__store.listCardioSessions()[0].durationSec), 420);
    await page.reload();
    assert.equal(await countCardio(page), 1);
    await context.close();
    console.log('PASS stopwatch: overdue callbacks, simultaneous rest, pause/reload/resume, one record');
  }
  {
    const startedAt = Date.parse('2026-09-29T23:58:59Z');
    const activity = { cardio: { id: 'restore-countdown', exerciseId: 'bike', date: '2026-09-29', mode: 'count', targetSec: 60, timer: { startedAt, accumulatedMs: 0 } } };
    const { page, context } = await fresh({ activity });
    assert.equal(await countCardio(page), 1);
    const saved = await page.evaluate(() => window.__store.listCardioSessions()[0]);
    assert.equal(saved.durationSec, 60);
    assert.equal(saved.date, '2026-09-29');
    await page.evaluate(({ activityKey, activity }) => localStorage.setItem(activityKey, JSON.stringify(activity)), { activityKey, activity });
    await page.reload();
    assert.equal(await countCardio(page), 1);
    assert.equal(await page.locator('#cardio-finish').count(), 0);
    await context.close();
    console.log('PASS countdown: closed-page completion, original date, stale snapshot deduplication');
  }
  {
    const { page, context } = await fresh();
    await page.locator('#data-file').setInputFiles({ name: 'sample.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ app: 'workout-logger', v: 1, state: fixture })) });
    await page.locator('dialog[open]').waitFor();
    await page.locator('#backup-cancel').click();
    assert.equal(await page.evaluate(() => window.__store.listSessions().length), 1);
    await page.locator('#data-file').setInputFiles({ name: 'sample.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ app: 'workout-logger', v: 1, state: fixture })) });
    await page.locator('[data-mode="merge"]').click();
    assert.equal(await page.evaluate(() => window.__store.listSessions().length), 1);
    let message;
    page.once('dialog', async (dialog) => { message = dialog.message(); await dialog.accept(); });
    await page.locator('#data-file').setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{"hello":"world"}') });
    await page.waitForFunction(() => !document.querySelector('dialog'));
    assert.equal(await page.evaluate(() => window.__store.listSessions().length), 1);
    assert.match(message, /불러오기 실패/);
    await context.close();
    console.log('PASS import: cancel is safe, merge is idempotent, invalid file is rejected');
  }
  {
    const { page, context } = await fresh();
    await page.locator('[data-tab="cardio"]').click();
    await page.locator('[data-mid="bike"]').click();
    await page.locator('[data-min="10"]').click();
    await page.locator('#cardio-start').click();
    await page.evaluate((stateKey) => {
      const setItem = Storage.prototype.setItem;
      window.failWrites = true;
      window.failedWriteCount = 0;
      Storage.prototype.setItem = function (key, value) {
        if (key === stateKey && window.failWrites) { window.failedWriteCount++; throw new DOMException('Storage full', 'QuotaExceededError'); }
        return setItem.call(this, key, value);
      };
    }, stateKey);
    await page.clock.fastForward(601000);
    assert.equal(await countCardio(page), 0);
    assert.equal(await text(page, '#cardio-pause'), '재개');
    await page.clock.fastForward(10000);
    assert.equal(await page.evaluate(() => window.failedWriteCount), 1);
    await page.evaluate(() => { window.failWrites = false; });
    await page.locator('#cardio-finish').click();
    assert.equal(await countCardio(page), 1);
    assert.equal(await page.evaluate(() => window.__store.listCardioSessions()[0].durationSec), 600);
    await context.close();
    console.log('PASS full storage: completion pauses safely, no repeated save/alarm, retry saves once');
  }
  {
    const { page, context } = await fresh({ clock: false });
    await page.locator('[data-tab="cardio"]').click();
    await page.locator('[data-mid="bike"]').click();
    await page.locator('[data-mode="stop"]').click();
    await page.locator('#cardio-start').click();
    const cdp = await context.newCDPSession(page);
    await cdp.send('Page.setWebLifecycleState', { state: 'frozen' });
    await new Promise((resolve) => setTimeout(resolve, 2300));
    await cdp.send('Page.setWebLifecycleState', { state: 'active' });
    await page.waitForFunction(() => Number(document.querySelector('[data-timer="cardio"] .t').textContent.split(':')[1]) >= 2);
    await context.close();
    console.log('PASS actual Chromium renderer freeze: elapsed time continues');
  }
  assert.deepEqual(errors, []);
  console.log('All browser checks passed; no page errors.');
} finally {
  await browser.close();
}
