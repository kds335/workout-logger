# 설계 — 기본 운동 프리셋 + 루틴 체크박스 선택

날짜: 2026-06-22
관련: `2026-06-22-workout-logger-design.md`(v1 — "기본목록"은 의도적 범위 밖이었음). 본 슬라이스에서 추가.

## 문제

v1은 운동(기구)을 사용자가 `window.prompt`로 직접 타이핑해 등록. 폰에서 매번 이름 치기 귀찮고,
루틴 만들 때도 "포함할 운동 번호 1,3" 식 prompt라 운동이 많아지면 못 씀.

## 목표

- 헬스장 흔한 운동기구를 부위별로 **미리 채워** 타이핑 제거.
- 루틴 만들기 = **부위별 체크박스 화면**에서 탭으로 선택.

## 구성

### 1. `src/presets.js` (신규, 순수 데이터)
`export const DEFAULT_EXERCISES = [{ name, type, defaultRestSec }, ...]`
- `type` = 부위(가슴/등/어깨/삼두/이두/하체/복근).
- 부위별 3~7개. 복합운동 휴식 150~180초, 고립운동 60~90초.

### 2. `src/store.js` — `seedExercises(presets)` 메서드
- 입력 프리셋 중 **현재 이름과 겹치지 않는 것만** addExercise로 추가.
- 추가된 운동 배열 리턴(0개면 빈 배열). 멱등 — 두 번 호출해도 중복 안 생김.
- 순수 로직 → `tests/store-presets.test.js` 단위테스트.

### 3. `src/main.js` — 자동 시드 + 수동 버튼
- 스토어 생성 후 `listExercises().length === 0`이면 `seedExercises(DEFAULT_EXERCISES)` 1회.
- routines 화면 "기본 운동 불러오기" 버튼 → `seedExercises` 재호출(이미 있어도 중복없이 보충).

### 4. `src/ui.js` — 루틴 만들기 UI 교체
- 기존 `onAddRoutine`의 이름/번호 두 prompt 제거.
- routines 탭 내 전환 뷰 "새 루틴": 이름 input + 부위별 그룹 + 운동 체크박스 + [만들기]/[취소].
- 선택된 운동 → `items = [{ exerciseId, targetSets: 3, restSec: ex.defaultRestSec }]`.
- main.js에 `creatingRoutine` 플래그(런타임 상태), render에서 분기. tab-기반 innerHTML 교체 패턴 유지.

### 5. `type` = 부위로 정착
- 운동 추가 prompt의 "종류(머신/덤벨/...)" 안내를 "부위(가슴/등/...)"로.
- 기존 데이터 `type='기타'`는 "기타" 그룹으로 표시(깨지지 않음).

## 불변식 유지
- ui.js는 렌더 전용(계산 금지). 시드/필터 로직은 store/presets.
- 데이터 형태(Exercise `{id,name,type,defaultRestSec}`) 불변.

## 검증
- `node --test`: 기존 25 + 신규 store-presets 테스트 통과.
- 헤드리스 Chrome E2E: localStorage 비우고 로드 → 자동 시드로 운동 다수 → "새 루틴" 화면 체크박스 선택 → 만들기 → 시작 흐름, 콘솔 에러 0.
