import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mock env & database before service import ────────────────────────────────

vi.mock('../../src/config/env', () => ({
  env: {
    JWT_SECRET: 'test-jwt-secret-for-vitest-at-least-32-chars',
    NODE_ENV: 'test',
  },
  isProduction: false,
  isTest: true,
  isDevelopment: false,
}));

const { mockDbChain } = vi.hoisted(() => {
  const mockDbChain = {
    select: vi.fn(),
    update: vi.fn(),
    from: vi.fn(),
    where: vi.fn(),
    limit: vi.fn(),
    set: vi.fn(),
  };
  (Object.keys(mockDbChain) as (keyof typeof mockDbChain)[]).forEach((m) => {
    mockDbChain[m].mockReturnValue(mockDbChain);
  });
  mockDbChain.limit.mockResolvedValue([]);
  return { mockDbChain };
});

vi.mock('../../src/config/database', () => ({
  db: {
    select: vi.fn().mockReturnValue(mockDbChain),
    update: vi.fn().mockReturnValue(mockDbChain),
  },
}));

// Mock bcrypt so we don't need real password hashing in unit tests
vi.mock('bcrypt', () => ({
  default: {
    compare: vi.fn(),
  },
}));

import { AuthService } from '../../src/modules/auth/auth.service';
import bcrypt from 'bcrypt';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const activeAdmin = {
  id: 1,
  name: 'Admin Utama',
  email: 'admin@test.com',
  passwordHash: '$2b$10$hashedpassword',
  role: 'superadmin',
  isActive: true,
  lastLoginAt: null,
  createdAt: new Date(),
};

// ────────────────────────────────────────────────────────────────────────────

describe('AuthService.login', () => {
  let service: AuthService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new AuthService();

    // Default: chain behaves as chainable
    (Object.keys(mockDbChain) as (keyof typeof mockDbChain)[]).forEach((m) => {
      mockDbChain[m].mockReturnValue(mockDbChain);
    });
  });

  it('throws "Invalid credentials" when email is not found', async () => {
    mockDbChain.limit.mockResolvedValueOnce([]);

    await expect(service.login('nobody@test.com', 'pass')).rejects.toThrow('Invalid credentials');
  });

  it('throws "Account is inactive" when admin.isActive is false', async () => {
    mockDbChain.limit.mockResolvedValueOnce([{ ...activeAdmin, isActive: false }]);

    await expect(service.login('admin@test.com', 'pass')).rejects.toThrow('Account is inactive');
  });

  it('throws "Invalid credentials" when password does not match', async () => {
    mockDbChain.limit.mockResolvedValueOnce([activeAdmin]);
    vi.mocked(bcrypt.compare).mockResolvedValueOnce(false as never);

    await expect(service.login('admin@test.com', 'wrongpass')).rejects.toThrow('Invalid credentials');
  });

  it('returns accessToken, refreshToken, and user on successful login', async () => {
    // Select chain: limit resolves to [activeAdmin]
    mockDbChain.limit.mockResolvedValueOnce([activeAdmin]);
    vi.mocked(bcrypt.compare).mockResolvedValueOnce(true as never);
    // Update chain: where returns mockDbChain (awaiting a plain object is fine — result unused)

    const result = await service.login('admin@test.com', 'correctpass');

    expect(result).toHaveProperty('accessToken');
    expect(result).toHaveProperty('refreshToken');
    expect(result.user).toMatchObject({
      id: 1,
      name: 'Admin Utama',
      email: 'admin@test.com',
      role: 'superadmin',
    });
    expect(typeof result.accessToken).toBe('string');
    expect(typeof result.refreshToken).toBe('string');
  });

  it('calls bcrypt.compare with the raw password and hash', async () => {
    mockDbChain.limit.mockResolvedValueOnce([activeAdmin]);
    vi.mocked(bcrypt.compare).mockResolvedValueOnce(true as never);

    await service.login('admin@test.com', 'mypassword');

    expect(bcrypt.compare).toHaveBeenCalledWith('mypassword', activeAdmin.passwordHash);
  });

  it('uses "admin" as role fallback when role is null', async () => {
    const adminWithNullRole = { ...activeAdmin, role: null };
    mockDbChain.limit.mockResolvedValueOnce([adminWithNullRole]);
    vi.mocked(bcrypt.compare).mockResolvedValueOnce(true as never);

    const result = await service.login('admin@test.com', 'pass');

    expect(result.user.role).toBe('admin');
  });
});
