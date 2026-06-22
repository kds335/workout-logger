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
