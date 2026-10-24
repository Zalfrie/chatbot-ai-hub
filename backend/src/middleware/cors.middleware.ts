import cors from 'cors';
import { AppError } from './error.middleware.js';
import { logger } from '../utils/logger.js';

/**
 * Parses a comma-separated origin list such as CORS_ORIGINS into the exact form browsers send in
 * the Origin header, so "https://Dashboard.example.com/" still matches. Entries that are not
 * http(s) origins are ignored with a warning: without a scheme the parsed origin would be "null",
 * the Origin of sandboxed and file:// pages.
 */
export function parseOrigins(value: string): string[] {
  return value.split(',').map((entry) => entry.trim()).filter(Boolean).flatMap((entry) => {
    try {
      const url = new URL(entry);
      if (url.protocol === 'http:' || url.protocol === 'https:') return [url.origin];
    } catch {
      // Not a URL: reported below
    }
    logger.warn('CORS: ignoring a CORS_ORIGINS entry that is not an http(s) origin', { entry });
    return [];
  });
}

/**
 * Widget API (/v1/chat). The widget runs on tenant websites on any domain, authenticates with
 * the X-Api-Key header and sends no cookies, so every origin is allowed and credentials are not.
 */
export const widgetCors = cors({
  origin: '*',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'X-Api-Key'],
  // Browsers reuse the preflight for 10 minutes instead of sending one per message
  maxAge: 600,
});

/**
 * Dashboard API (/api): browsers may call it only from the dashboard origin(s).
 * Requests without an Origin header (curl, server-to-server) are not affected.
 */
export function dashboardCors(allowedOrigins: string[]) {
  return cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      logger.warn('CORS: origin is not in CORS_ORIGINS', { origin });
      callback(new AppError(403, 'Origin not allowed'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Api-Key'],
  });
}
