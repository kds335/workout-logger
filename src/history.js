export function lastEntryFor(sessions, exerciseId) {
  const matches = sessions
    .filter((s) => s.logs.some((l) => l.exerciseId === exerciseId))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  if (matches.length === 0) return null;
  const recent = matches[0];
  const log = recent.logs.find((l) => l.exerciseId === exerciseId);
  return { date: recent.date, sets: log.sets };
}

export function totalVolume(session) {
  return session.logs
    .flatMap((l) => l.sets)
    .reduce((sum, set) => sum + set.weight * set.reps, 0);
}

// 세션들을 날짜별로 묶음. 빈 세션(logs 0) 제외, 같은 날 같은 운동 세트 합침, 최신순.
// 반환: [{ date, volume, routineIds, logs: [{ exerciseId, sets }] }]
export function groupSessionsByDate(sessions) {
  const byDate = new Map();
  for (const s of sessions) {
    if (!s.logs || s.logs.length === 0) continue;
    if (!byDate.has(s.date)) byDate.set(s.date, { date: s.date, routineIds: [], logMap: new Map() });
    const day = byDate.get(s.date);
    if (s.routineId && !day.routineIds.includes(s.routineId)) day.routineIds.push(s.routineId);
    for (const log of s.logs) {
      if (!day.logMap.has(log.exerciseId)) day.logMap.set(log.exerciseId, []);
      day.logMap.get(log.exerciseId).push(...log.sets);
    }
  }
  return [...byDate.values()]
    .map((day) => {
      const logs = [...day.logMap.entries()].map(([exerciseId, sets]) => ({ exerciseId, sets }));
      const volume = logs.flatMap((l) => l.sets).reduce((sum, set) => sum + set.weight * set.reps, 0);
      return { date: day.date, volume, routineIds: day.routineIds, logs };
    })
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}
