# 설계 — 루틴 수정/삭제 + 달력 + 휴식 타이머 설정

날짜: 2026-06-22
관련: `2026-06-22-workout-logger-design.md`(v1), `2026-06-22-exercise-presets-design.md`(프리셋).

## 문제

- 만든 루틴을 못 고침(운동 추가/빼기·이름 변경 불가) → 다시 만들어야 함.
- 언제 운동했는지·오늘 뭐 할지 한눈에 볼 달력 없음.
- 휴식초가 프리셋 고정 — 사용자가 못 바꿈. 운동 중 휴식 길이 즉석 조절도 불가.

## 목표

1. 루틴 수정/삭제.
2. 달력: 운동한 날 자동 표시 + 날짜별 루틴 지정(표시만).
3. 휴식초 사용자 설정: 운동별 기본값 수정 + 운동 중 즉석 ±조절·건너뛰기.

## 1. 루틴 수정/삭제

- 루틴 카드에 "수정"·"삭제" 버튼.
- 수정: 기존 "새 루틴" 폼(`renderRoutineForm`) 재사용 — 편집 모드면 이름·체크박스·휴식초 미리 채움. 저장 시 `store.updateRoutine(id, { name, items })`.
- 삭제: `store.removeRoutine(id)`. **삭제 시 그 루틴을 가리키던 달력 스케줄 항목도 비움**(고아 방지) — `removeRoutine` 내부에서 처리.
- main.js 런타임 상태: `editingRoutineId`(null이면 새로 만들기).

## 2. 달력

### 순수 로직 — `src/calendar.js`(신규, 테스트됨)
- `dateKey(date)` → 로컬 `'YYYY-MM-DD'`. `toISOString`(UTC)는 자정 근처 하루 어긋나므로 직접 로컬 포맷.
- `buildMonth(year, month)` → `{ year, month, weeks }`. weeks = 주 배열, 각 주 = 7칸. 칸 = `{ dateKey, day }` 또는 `null`(앞뒤 패딩). 일요일 시작.

### 스케줄 데이터 — `store.js`
- `state.schedule = {}` ( `'YYYY-MM-DD' → routineId` ). emptyState에 추가.
- `setSchedule(date, routineId)` — routineId null/없으면 그 날 삭제. persist.
- `getSchedule(date)` → routineId | null.
- `listSchedule()` → schedule 객체(표시용).
- 기존 `removeRoutine`: 삭제되는 routineId를 가리키는 schedule 키 제거 후 persist.

### UI — `renderCalendar(el, { month, sessionDates, schedule, routines, handlers })`
- 월 그리드(buildMonth). ◀ / 제목(2026년 6월) / ▶.
- 칸: 날짜 숫자. 운동한 날(`sessionDates`에 dateKey 있음) ● 점. 지정 루틴 있으면 이름 작게.
- 칸 탭 → `handlers.onSelectDay(dateKey)`. main이 선택일 상태 저장 → 달력 아래 패널 렌더.
- 패널: "6/23 — [루틴 버튼들 | 지우기]". 루틴 탭 → `onAssign(dateKey, routineId)`, 지우기 → `onAssign(dateKey, null)`. **시작 동작 없음**.
- main.js 상태: `calMonth = { year, month }`(기본 = 오늘 달), `selectedDay = null`.

## 3. 휴식 타이머 설정

### 운동별 기본 휴식초 수정
- 루틴 폼 체크박스 행에 휴식초 숫자 input(class `rest-in`, 운동 id 연결).
- 변경 시 `store.updateExercise(id, { defaultRestSec })` — 전역(모든 루틴에 라이브 반영).

### 세션 휴식 = 운동의 현재 defaultRestSec 라이브
- `renderSession`에서 카드 restSec을 **운동 조회값** 우선: `exercises.find(id).defaultRestSec ?? it.restSec ?? 90`.
- 루틴 item.restSec 동결 의존 제거(폴백으로만 유지 — 구 데이터 안전).

### 운동 중 즉석 조절
- `timer.js`: `add(delta)` 추가 — `remaining = Math.max(0, remaining + delta)`. 순수, 테스트.
- 타이머 링 아래 버튼 `[-15초] [건너뛰기] [+15초]`.
  - ±15 → `handlers.onAdjustRest(±15)` → main `restTimer.add(±15)`(+15는 restTotal도 늘려 링 비율 유지) → render.
  - 건너뛰기 → `handlers.onSkipRest()` → main `stopRest(); render()`.

## 불변식 유지
- ui.js 렌더 전용(계산 금지). 스케줄·달력 그리드·타이머 로직은 store/calendar/timer.
- 데이터 형태: Exercise/Routine/Session 불변. schedule는 신규 최상위 맵.

## 검증
- `node --test`: 기존 29 + store-schedule + calendar + timer add 신규 통과.
- 헤드리스 Chrome E2E: 세션 만든 날 ● 표시 / 날 탭→루틴 지정·이름 뜸 / 루틴 수정 반영 / 타이머 +15·건너뛰기 동작 / 콘솔 에러 0.
