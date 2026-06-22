# 운동기록 (workout-logger)

헬스장용 개인 운동기록 PWA. 루틴 짜기 + 세트별 무게/반복 기록 + 휴식 타이머 + 지난기록 조회.

## 실행

```
node dev-server.cjs   # http://localhost:8732
```

아이폰: Safari로 접속 → 공유 → "홈 화면에 추가" → 전체화면 앱처럼 사용(오프라인 동작).

## 테스트

```
node --test
```

## 구조

- `src/storage.js` localStorage 래퍼(주입 가능)
- `src/store.js` 운동/루틴/세션 CRUD + 영속화
- `src/history.js` 저번 무게·총 볼륨 조회(순수)
- `src/timer.js` 휴식 타이머 상태기계(순수)
- `src/ui.js` 렌더 전용(계산 금지)
- `src/main.js` 스토어·UI·타이머 배선
- `manifest.webmanifest` / `sw.js` PWA(오프라인 셸 캐시 + 홈화면 추가)
