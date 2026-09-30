export function createRestTimer(seconds) {
  return {
    remaining: seconds,
    get isDone() {
      return this.remaining <= 0;
    },
    tick(deltaSec) {
      this.remaining = Math.max(0, this.remaining - deltaSec);
    },
    reset(s) {
      this.remaining = s;
    },
    add(delta) {
      this.remaining = Math.max(0, this.remaining + delta);
    },
  };
}

const nonNegative = value => Number.isFinite(value) ? Math.max(0, value) : 0;

// Keep the timestamp, not an interval count, so suspended tabs lose no time.
export function createElapsedTimer({ now = Date.now, snapshot = null } = {}) {
  let accumulatedMs = nonNegative(snapshot?.accumulatedMs);
  let startedAt = Number.isFinite(snapshot?.startedAt) ? snapshot.startedAt : null;

  const elapsedMs = () => accumulatedMs + (
    startedAt === null ? 0 : Math.max(0, now() - startedAt)
  );

  return {
    get elapsedMs() {
      return elapsedMs();
    },
    get elapsedSec() {
      return Math.floor(elapsedMs() / 1000);
    },
    get running() {
      return startedAt !== null;
    },
    start() {
      accumulatedMs = 0;
      startedAt = now();
    },
    reset() {
      accumulatedMs = 0;
      startedAt = null;
    },
    pause() {
      if (startedAt === null) return;
      accumulatedMs = elapsedMs();
      startedAt = null;
    },
    resume() {
      if (startedAt !== null) return;
      startedAt = now();
    },
    snapshot() {
      return { accumulatedMs, startedAt };
    },
  };
}

// Rest periods also use a wall-clock deadline so a delayed render catches up.
export function createDeadlineTimer(seconds, { now = Date.now, snapshot = null } = {}) {
  let deadlineAt = Number.isFinite(snapshot?.deadlineAt)
    ? snapshot.deadlineAt
    : now() + nonNegative(seconds) * 1000;

  const remainingMs = () => Math.max(0, deadlineAt - now());

  return {
    get remainingMs() {
      return remainingMs();
    },
    get remaining() {
      return Math.ceil(remainingMs() / 1000);
    },
    get isDone() {
      return remainingMs() === 0;
    },
    reset(nextSeconds) {
      deadlineAt = now() + nonNegative(nextSeconds) * 1000;
    },
    add(deltaSec) {
      if (!Number.isFinite(deltaSec)) return;
      const currentTime = now();
      deadlineAt = currentTime + Math.max(0, deadlineAt - currentTime) + deltaSec * 1000;
      deadlineAt = Math.max(currentTime, deadlineAt);
    },
    snapshot() {
      return { deadlineAt };
    },
  };
}
