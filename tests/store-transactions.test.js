import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStorage } from '../src/storage.js';
import { createStore, STORAGE_KEY } from '../src/store.js';

function fixture() {
  const memory = new Map();
  const backend = { getItem: (key) => memory.get(key) ?? null, setItem: (key, value) => memory.set(key, value) };
  let nextId = 0;
  const store = createStore({ storage: createStorage(backend), genId: () => `id${++nextId}` });
  const exercise = store.addExercise({ name: '기존 운동' });
  const routine = store.addRoutine({ name: '기존 루틴', items: [{ exerciseId: exercise.id, targetSets: 4 }] });
  const session = store.startSession({ routineId: routine.id, date: '2026-09-30' });
  store.logSet(session.id, exercise.id, { weight: 20, reps: 10 });
  const cardio = store.addCardioSession({ exerciseId: 'run', date: '2026-09-30', durationSec: 60 });
  store.setSchedule('2026-09-30', routine.id);
  store.setNote('2026-09-30', '기존 메모');
  return { store, backend, exercise, routine, session, cardio };
}

const changes = [
  ['운동 추가', ({ store }) => store.addExercise({ name: '새 운동' })],
  ['운동 기본 목록 추가', ({ store }) => store.seedExercises([{ name: '새 운동 1' }, { name: '새 운동 2' }])],
  ['운동 수정', ({ store, exercise }) => store.updateExercise(exercise.id, { name: '수정한 운동', defaultRestSec: 120 })],
  ['운동 삭제', ({ store, exercise }) => store.removeExercise(exercise.id)],
  ['루틴 추가', ({ store }) => store.addRoutine({ name: '새 루틴' })],
  ['루틴 수정', ({ store, routine }) => store.updateRoutine(routine.id, { name: '수정한 루틴', items: [] })],
  ['루틴과 연결 일정 삭제', ({ store, routine }) => store.removeRoutine(routine.id)],
  ['일정 추가', ({ store, routine }) => store.setSchedule('2026-10-01', routine.id)],
  ['일정 삭제', ({ store }) => store.setSchedule('2026-09-30', null)],
  ['메모 수정', ({ store }) => store.setNote('2026-09-30', '수정한 메모')],
  ['메모 삭제', ({ store }) => store.setNote('2026-09-30', '')],
  ['세션 시작', ({ store, routine }) => store.startSession({ routineId: routine.id, date: '2026-10-01' })],
  ['유산소 기록 삭제', ({ store, cardio }) => store.removeCardioSession(cardio.id)],
];

for (const [label, action] of changes) {
  test(`${label}: 저장 실패가 메모리/기존 저장본/후속 저장에 영향을 주지 않음`, () => {
    const context = fixture();
    const { store, backend, exercise, routine, session } = context;
    const before = store.exportData();
    const persistedBefore = backend.getItem(STORAGE_KEY);
    const save = backend.setItem;
    backend.setItem = () => { throw new Error('QuotaExceededError'); };
    assert.throws(() => action(context), /QuotaExceededError/);
    assert.deepEqual(store.exportData(), before);
    assert.equal(backend.getItem(STORAGE_KEY), persistedBefore);
    assert.equal(store.listExercises()[0], exercise);
    assert.equal(store.listRoutines()[0], routine);
    assert.equal(store.getSession(session.id), session);

    // 공간 확보 후 다른 작업을 저장해도 실패했던 변경이 함께 저장되지 않는다.
    backend.setItem = save;
    store.setNote('2026-10-02', '저장 재개');
    const expected = structuredClone(before);
    expected.state.notes['2026-10-02'] = '저장 재개';
    const reloaded = createStore({ storage: createStorage(backend) });
    assert.deepEqual(reloaded.exportData(), expected);
  });
}

test('추가 저장 실패 후 재시도는 운동/루틴/세션을 각각 한 번만 추가', () => {
  const { store, backend, routine } = fixture();
  const save = backend.setItem;
  const actions = [
    () => store.addExercise({ name: '재시도 운동' }),
    () => store.addRoutine({ name: '재시도 루틴' }),
    () => store.startSession({ routineId: routine.id, date: '2026-10-01' }),
  ];
  for (const action of actions) {
    backend.setItem = () => { throw new Error('QuotaExceededError'); };
    assert.throws(action, /QuotaExceededError/);
    backend.setItem = save;
    action();
  }
  assert.equal(store.listExercises().length, 2);
  assert.equal(store.listRoutines().length, 2);
  assert.equal(store.listSessions().length, 2);
});

test('운동/루틴 이름은 추가와 수정 시 공백을 정리하고 내보낸 백업을 다시 검증 가능', () => {
  const { store } = fixture();
  const exercise = store.addExercise({ name: '  새 운동  ' });
  const routine = store.addRoutine({ name: '  새 루틴  ' });
  assert.equal(exercise.name, '새 운동');
  assert.equal(routine.name, '새 루틴');
  assert.equal(store.updateExercise(exercise.id, { name: '  고친 운동  ' }), exercise);
  assert.equal(store.updateRoutine(routine.id, { name: '  고친 루틴  ' }), routine);
  assert.equal(exercise.name, '고친 운동');
  assert.equal(routine.name, '고친 루틴');
  assert.doesNotThrow(() => store.inspectBackup(store.exportData()));
});

test('빈 이름과 잘못된 이름은 추가/수정 전에 거절하고 기존 항목을 보존', () => {
  const { store, exercise, routine } = fixture();
  const before = store.exportData();
  for (const name of ['', '   ', null, undefined, 123]) {
    assert.throws(() => store.addExercise({ name }), /운동 이름/);
    assert.throws(() => store.updateExercise(exercise.id, { name }), /운동 이름/);
    assert.throws(() => store.addRoutine({ name }), /루틴 이름/);
    assert.throws(() => store.updateRoutine(routine.id, { name }), /루틴 이름/);
    assert.deepEqual(store.exportData(), before);
  }
});

test('기본 운동 목록의 일부 이름이 잘못되어도 부분 추가되지 않음', () => {
  const { store } = fixture();
  const before = store.exportData();
  assert.throws(() => store.seedExercises([{ name: '정상 이름' }, { name: '  ' }]), /운동 이름/);
  assert.deepEqual(store.exportData(), before);
});
