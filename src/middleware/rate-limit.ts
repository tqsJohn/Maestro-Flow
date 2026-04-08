import type { Context, Next } from 'hono';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

export function createRateLimiter(options: { windowMs: number; maxRequests: number }) {
  const store = new Map<string, RateLimitEntry>();

  // Periodic cleanup of expired entries
  const cleanupInterval = setInterval(
    () => {
      const now = Date.now();
      store.forEach((entry, key) => {
        if (now > entry.resetAt) {
          store.delete(key);
        }
      });
    },
    options.windowMs * 2,
  );

  // Prevent the timer from keeping the process alive
  if (cleanupInterval.unref) {
    cleanupInterval.unref();
  }

  return async (c: Context, next: Next) => {
    const clientId =
      c.req.header('x-forwarded-for')?.split(',')[0]?.trim() ||
      c.req.header('x-real-ip') ||
      'unknown';

    const now = Date.now();
    const entry = store.get(clientId);

    if (!entry || now > entry.resetAt) {
      store.set(clientId, {
        count: 1,
        resetAt: now + options.windowMs,
      });
      return next();
    }

    if (entry.count >= options.maxRequests) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      return c.json(
        {
          error: 'Too many requests',
          retryAfter,
        },
        429,
      );
    }

    entry.count++;
    return next();
  };
}
