// In-memory login rate limiter. Keyed by an arbitrary string (e.g. username|ip).
// Not shared across processes — fine for the single-process pm2 deployment.
export function createThrottle({ max = 5, windowMs = 15 * 60 * 1000, now = Date.now } = {}) {
  const hits = new Map(); // key -> array of failure timestamps

  function recent(key) {
    const cutoff = now() - windowMs;
    const arr = (hits.get(key) || []).filter((t) => t > cutoff);
    if (arr.length > 0) hits.set(key, arr);
    else hits.delete(key);
    return arr;
  }

  return {
    isBlocked(key) {
      return recent(key).length >= max;
    },
    recordFailure(key) {
      const arr = recent(key);
      arr.push(now());
      hits.set(key, arr);
    },
    reset(key) {
      hits.delete(key);
    },
  };
}
