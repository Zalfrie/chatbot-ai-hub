import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

// Must be a literal — vi.mock factory is hoisted before const declarations
const TEST_SECRET = 'test-jwt-secret-for-vitest-at-least-32-chars';

// Mock env before auth.middleware is imported (inline string, no variable reference)
vi.mock('../../src/config/env', () => ({
  env: {
    JWT_SECRET: 'test-jwt-secret-for-vitest-at-least-32-chars',
    NODE_ENV: 'test',
  },
  isProduction: false,
  isTest: true,
  isDevelopment: false,
}));

import {
  authMiddleware,
  signAdminToken,
  signRefreshToken,
} from '../../src/middleware/auth.middleware';

function makeRes(): Response {
  const res = { status: vi.fn(), json: vi.fn() } as unknown as Response;
  (res.status as ReturnType<typeof vi.fn>).mockReturnValue(res);
  return res;
}

describe('authMiddleware', () => {
  let req: Partial<Request>;
  let res: Response;
  let next: NextFunction;

  beforeEach(() => {
    req = { headers: {} };
    res = makeRes();
    next = vi.fn();
  });

  it('returns 401 when Authorization header is absent', () => {
    authMiddleware(req as Request, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'Unauthorized', message: 'Bearer token required' }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when Authorization does not start with "Bearer "', () => {
    req.headers = { authorization: 'Basic dXNlcjpwYXNz' };
    authMiddleware(req as Request, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 for a malformed / invalid token', () => {
    req.headers = { authorization: 'Bearer notavalidtoken' };
    authMiddleware(req as Request, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Invalid or expired token' }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 for an expired token', () => {
    const expired = jwt.sign({ adminId: 1, role: 'admin' }, TEST_SECRET, { expiresIn: '-1s' });
    req.headers = { authorization: `Bearer ${expired}` };
    authMiddleware(req as Request, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('sets req.adminId and req.adminRole then calls next for a valid token', () => {
    const token = jwt.sign({ adminId: 42, role: 'superadmin' }, TEST_SECRET, { expiresIn: '15m' });
    req.headers = { authorization: `Bearer ${token}` };
    authMiddleware(req as Request, res, next);
    expect(req.adminId).toBe(42);
    expect(req.adminRole).toBe('superadmin');
    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });
});

describe('signAdminToken', () => {
  it('produces a JWT containing adminId and role', () => {
    const token = signAdminToken({ adminId: 7, role: 'admin' });
    const decoded = jwt.verify(token, TEST_SECRET) as Record<string, unknown>;
    expect(decoded.adminId).toBe(7);
    expect(decoded.role).toBe('admin');
  });

  it('token expires in 15 minutes', () => {
    const token = signAdminToken({ adminId: 1, role: 'admin' });
    const decoded = jwt.verify(token, TEST_SECRET) as Record<string, number>;
    expect(decoded.exp! - decoded.iat!).toBe(15 * 60);
  });
});

describe('signRefreshToken', () => {
  it('produces a JWT containing adminId and role', () => {
    const token = signRefreshToken({ adminId: 3, role: 'superadmin' });
    const decoded = jwt.verify(token, TEST_SECRET) as Record<string, unknown>;
    expect(decoded.adminId).toBe(3);
    expect(decoded.role).toBe('superadmin');
  });

  it('token expires in 7 days', () => {
    const token = signRefreshToken({ adminId: 1, role: 'admin' });
    const decoded = jwt.verify(token, TEST_SECRET) as Record<string, number>;
    expect(decoded.exp! - decoded.iat!).toBe(7 * 24 * 60 * 60);
  });
});
