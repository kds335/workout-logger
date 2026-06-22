// 헬스장 흔한 운동기구 부위별 기본 목록. type = 부위.
// 복합운동(큰 근육·다관절) 휴식 길게, 고립운동 짧게.
export const DEFAULT_EXERCISES = [
  // 가슴
  { name: '벤치프레스', type: '가슴', defaultRestSec: 180 },
  { name: '인클라인 벤치프레스', type: '가슴', defaultRestSec: 150 },
  { name: '체스트프레스 머신', type: '가슴', defaultRestSec: 90 },
  { name: '펙덱 플라이', type: '가슴', defaultRestSec: 75 },
  { name: '케이블 크로스오버', type: '가슴', defaultRestSec: 75 },
  { name: '딥스', type: '가슴', defaultRestSec: 90 },
  // 등
  { name: '랫풀다운', type: '등', defaultRestSec: 90 },
  { name: '시티드 로우', type: '등', defaultRestSec: 90 },
  { name: '바벨 로우', type: '등', defaultRestSec: 150 },
  { name: '풀업', type: '등', defaultRestSec: 120 },
  { name: 'T바 로우', type: '등', defaultRestSec: 120 },
  { name: '백 익스텐션', type: '등', defaultRestSec: 60 },
  // 어깨
  { name: '숄더프레스 머신', type: '어깨', defaultRestSec: 90 },
  { name: '사이드 레터럴 레이즈', type: '어깨', defaultRestSec: 60 },
  { name: '리어 델트 플라이', type: '어깨', defaultRestSec: 60 },
  { name: '오버헤드 프레스', type: '어깨', defaultRestSec: 150 },
  // 삼두
  { name: '케이블 푸시다운', type: '삼두', defaultRestSec: 60 },
  { name: '라잉 트라이셉스 익스텐션', type: '삼두', defaultRestSec: 75 },
  { name: '오버헤드 익스텐션', type: '삼두', defaultRestSec: 60 },
  // 이두
  { name: '바벨 컬', type: '이두', defaultRestSec: 75 },
  { name: '덤벨 컬', type: '이두', defaultRestSec: 60 },
  { name: '해머 컬', type: '이두', defaultRestSec: 60 },
  { name: '프리처 컬', type: '이두', defaultRestSec: 60 },
  // 하체
  { name: '스쿼트', type: '하체', defaultRestSec: 180 },
  { name: '레그프레스', type: '하체', defaultRestSec: 150 },
  { name: '레그 익스텐션', type: '하체', defaultRestSec: 75 },
  { name: '레그 컬', type: '하체', defaultRestSec: 75 },
  { name: '카프 레이즈', type: '하체', defaultRestSec: 60 },
  { name: '런지', type: '하체', defaultRestSec: 120 },
  { name: '힙 쓰러스트', type: '하체', defaultRestSec: 150 },
  // 복근
  { name: '크런치', type: '복근', defaultRestSec: 45 },
  { name: '행잉 레그레이즈', type: '복근', defaultRestSec: 60 },
  { name: '플랭크', type: '복근', defaultRestSec: 45 },
];

// 부위 표시 순서(UI 그룹 정렬용). 목록에 없는 type은 뒤에 '기타'로.
export const BODY_PARTS = ['가슴', '등', '어깨', '삼두', '이두', '하체', '복근'];
