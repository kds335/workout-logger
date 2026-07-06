// 휴식 시간은 전체 고정 90초(운동 중 ±15초로 조절). 운동별 개별 설정 안 함.
export const REST_SEC = 90;

// 유산소 판별용 부위 값. type이 이거면 근력 흐름(루틴/세트)에서 빼고 유산소 탭에서 다룸.
export const CARDIO_TYPE = '유산소';

// 헬스장 흔한 운동기구 부위별 기본 목록. type = 부위.
// 복합운동(큰 근육·다관절) 휴식 길게, 고립운동 짧게.
export const DEFAULT_EXERCISES = [
  // 가슴
  { name: '벤치프레스', type: '가슴', defaultRestSec: 180 },
  { name: '인클라인 벤치프레스', type: '가슴', defaultRestSec: 150 },
  { name: '디클라인 벤치프레스', type: '가슴', defaultRestSec: 150 },
  { name: '덤벨 벤치프레스', type: '가슴', defaultRestSec: 120 },
  { name: '인클라인 덤벨프레스', type: '가슴', defaultRestSec: 120 },
  { name: '체스트프레스 머신', type: '가슴', defaultRestSec: 90 },
  { name: '펙덱 플라이', type: '가슴', defaultRestSec: 75 },
  { name: '케이블 크로스오버', type: '가슴', defaultRestSec: 75 },
  { name: '딥스', type: '가슴', defaultRestSec: 90 },
  { name: '푸시업', type: '가슴', defaultRestSec: 60 },
  // 등
  { name: '랫풀다운', type: '등', defaultRestSec: 90 },
  { name: '시티드 로우', type: '등', defaultRestSec: 90 },
  { name: '바벨 로우', type: '등', defaultRestSec: 150 },
  { name: '데드리프트', type: '등', defaultRestSec: 180 },
  { name: '풀업', type: '등', defaultRestSec: 120 },
  { name: 'T바 로우', type: '등', defaultRestSec: 120 },
  { name: '원암 덤벨로우', type: '등', defaultRestSec: 90 },
  { name: '풀오버', type: '등', defaultRestSec: 75 },
  { name: '슈러그', type: '등', defaultRestSec: 75 },
  { name: '백 익스텐션', type: '등', defaultRestSec: 60 },
  // 어깨
  { name: '숄더프레스 머신', type: '어깨', defaultRestSec: 90 },
  { name: '오버헤드 프레스', type: '어깨', defaultRestSec: 150 },
  { name: '아놀드 프레스', type: '어깨', defaultRestSec: 90 },
  { name: '사이드 레터럴 레이즈', type: '어깨', defaultRestSec: 60 },
  { name: '프론트 레이즈', type: '어깨', defaultRestSec: 60 },
  { name: '리어 델트 플라이', type: '어깨', defaultRestSec: 60 },
  { name: '업라이트 로우', type: '어깨', defaultRestSec: 75 },
  { name: '페이스풀', type: '어깨', defaultRestSec: 60 },
  // 삼두
  { name: '케이블 푸시다운', type: '삼두', defaultRestSec: 60 },
  { name: '라잉 트라이셉스 익스텐션', type: '삼두', defaultRestSec: 75 },
  { name: '오버헤드 익스텐션', type: '삼두', defaultRestSec: 60 },
  { name: '클로즈그립 벤치프레스', type: '삼두', defaultRestSec: 90 },
  { name: '트라이셉스 킥백', type: '삼두', defaultRestSec: 45 },
  // 이두
  { name: '바벨 컬', type: '이두', defaultRestSec: 75 },
  { name: '덤벨 컬', type: '이두', defaultRestSec: 60 },
  { name: '해머 컬', type: '이두', defaultRestSec: 60 },
  { name: '프리처 컬', type: '이두', defaultRestSec: 60 },
  { name: '컨센트레이션 컬', type: '이두', defaultRestSec: 45 },
  { name: '케이블 컬', type: '이두', defaultRestSec: 60 },
  // 하체
  { name: '스쿼트', type: '하체', defaultRestSec: 180 },
  { name: '레그프레스', type: '하체', defaultRestSec: 150 },
  { name: '루마니안 데드리프트', type: '하체', defaultRestSec: 150 },
  { name: '핵스쿼트', type: '하체', defaultRestSec: 150 },
  { name: '레그 익스텐션', type: '하체', defaultRestSec: 75 },
  { name: '레그 컬', type: '하체', defaultRestSec: 75 },
  { name: '카프 레이즈', type: '하체', defaultRestSec: 60 },
  { name: '런지', type: '하체', defaultRestSec: 120 },
  { name: '힙 쓰러스트', type: '하체', defaultRestSec: 150 },
  { name: '스텝업', type: '하체', defaultRestSec: 90 },
  // 복근
  { name: '크런치', type: '복근', defaultRestSec: 45 },
  { name: '행잉 레그레이즈', type: '복근', defaultRestSec: 60 },
  { name: '케이블 크런치', type: '복근', defaultRestSec: 45 },
  { name: '러시안 트위스트', type: '복근', defaultRestSec: 45 },
  { name: '앱 롤아웃', type: '복근', defaultRestSec: 60 },
  { name: '플랭크', type: '복근', defaultRestSec: 45 },
  // 유산소 (별도 탭에서 타이머로 기록. 세트/무게 없음)
  { name: '러닝머신', type: CARDIO_TYPE },
  { name: '실내 자전거', type: CARDIO_TYPE },
  { name: '스핀바이크', type: CARDIO_TYPE },
  { name: '로잉머신', type: CARDIO_TYPE },
  { name: '일립티컬', type: CARDIO_TYPE },
  { name: '스테어마스터', type: CARDIO_TYPE },
  { name: '에어바이크', type: CARDIO_TYPE },
  { name: '줄넘기', type: CARDIO_TYPE },
  { name: '경사 걷기', type: CARDIO_TYPE },
];

// 부위 표시 순서(UI 그룹 정렬용). 목록에 없는 type은 뒤에 '기타'로.
export const BODY_PARTS = ['가슴', '등', '어깨', '삼두', '이두', '하체', '복근'];
