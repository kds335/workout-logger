export function createStorage(backend = globalThis.localStorage) {
  return {
    load(key, fallback = null) {
      const raw = backend.getItem(key);
      if (raw == null) return fallback;
      try {
        return JSON.parse(raw);
      } catch {
        return fallback;
      }
    },
    save(key, value) {
      backend.setItem(key, JSON.stringify(value));
    },
  };
}
