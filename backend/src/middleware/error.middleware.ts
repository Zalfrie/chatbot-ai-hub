import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { isDevelopment } from '../config/env';

/**
 * Operational errors that we know about and can respond to gracefully.
 * Pass `isOperational = false` for programmer errors (bugs) — these will
 * be logged with full stack traces.
 */
export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
    public readonly isOperational = true,
  ) {
    super(message);
    this.name = 'AppError';
    Object.setPrototypeOf(this, AppError.prototype);
    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * HTTP request logger middleware — logs method, path, status, duration.
 * Mount before routes.
 */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const startAt = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - startAt;
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'http';
    logger.log(level, `${req.method} ${req.originalUrl}`, {
      status: res.statusCode,
      durationMs: duration,
      ip: req.ip,
    });
  });

  next();
}

/**
 * Global error handler — must be registered AFTER all routes.
 * Handles both AppError (operational) and unexpected errors.
 */
export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof AppError) {
    if (!err.isOperational) {
      logger.error('Non-operational AppError', { message: err.message, stack: err.stack });
    }
    res.status(err.statusCode).json({
      error: err.message,
      ...(isDevelopment ? { stack: err.stack } : {}),
    });
    return;
  }

  // Unexpected / programmer error
  const message = err instanceof Error ? err.message : 'Internal Server Error';
  const stack = err instanceof Error ? err.stack : undefined;

  logger.error('Unhandled error', {
    message,
    stack,
    method: req.method,
    url: req.originalUrl,
  });

  res.status(500).json({
    error: 'Internal Server Error',
    ...(isDevelopment ? { message, stack } : {}),
  });
}
