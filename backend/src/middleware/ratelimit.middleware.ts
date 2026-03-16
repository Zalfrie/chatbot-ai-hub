import { Request, Response, NextFunction } from 'express';
import { redis } from '../config/redis';
import { env } from '../config/env';
import { logger } from '../utils/logger';

/**
 * Redis-based sliding-window rate limiter per API key.
 * Default: 30 requests per 60-second window (configurable via env).
 *
 * Uses a fixed-window INCR+EXPIRE approach:
 *  - First request in a window sets INCR and EXPIRE atomically.
 *  - Subsequent requests increment the counter.
 *  - If count > max, respond 429.
 */
export function rateLimitMiddleware() {
  const windowMs = parseInt(env.RATE_LIMIT_WINDOW_MS, 10);   // ms, e.g. 60000
  const maxRequests = parseInt(env.RATE_LIMIT_MAX_REQUESTS, 10); // e.g. 30
  const windowSecs = Math.ceil(windowMs / 1000);

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const apiKey = req.headers['x-api-key'] as string | undefined;
    if (!apiKey) {
      // No API key — let auth middleware handle the rejection
      next();
      return;
    }

    const key = `ratelimit:${apiKey}`;

    try {
      // Increment atomically; set TTL only on first request in window
      const current = await redis.incr(key);
      if (current === 1) {
        await redis.expire(key, windowSecs);
      }

      const ttl = await redis.ttl(key);
      const remaining = Math.max(0, maxRequests - current);

      res.setHeader('X-RateLimit-Limit', maxRequests);
      res.setHeader('X-RateLimit-Remaining', remaining);
      res.setHeader('X-RateLimit-Reset', Math.floor(Date.now() / 1000) + Math.max(0, ttl));

      if (current > maxRequests) {
        logger.warn('Rate limit exceeded', { apiKey: apiKey.slice(0, 8) + '...', current, ttl });
        res.status(429).json({
          error: 'Too Many Requests',
          message: `Rate limit exceeded. Max ${maxRequests} messages per minute.`,
          retryAfter: Math.max(0, ttl),
        });
        return;
      }
    } catch (err) {
      // If Redis is down, fail open (don't block legitimate requests)
      logger.error('Rate limiter Redis error — failing open', { error: err });
    }

    next();
  };
}
