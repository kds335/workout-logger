// 달력 순수 로직. UI는 결과만 렌더.

// 로컬 기준 YYYY-MM-DD. toISOString(UTC)은 자정 근처 하루 어긋나므로 직접 포맷.
export function dateKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// year, month(0~11) → { year, month, weeks }. weeks = 주 배열, 각 주 7칸.
// 칸 = { dateKey, day } 또는 null(앞뒤 패딩). 일요일 시작.
export function buildMonth(year, month) {
  const first = new Date(year, month, 1);
  const startWeekday = first.getDay(); // 0=일
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let day = 1; day <= daysInMonth; day++) {
    cells.push({ dateKey: dateKey(new Date(year, month, day)), day });
  }
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return { year, month, weeks };
}
