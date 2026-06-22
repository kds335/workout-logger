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
