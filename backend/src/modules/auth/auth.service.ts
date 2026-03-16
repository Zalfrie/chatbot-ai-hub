import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { eq } from 'drizzle-orm';
import { db } from '../../config/database';
import { adminUsers } from '../../db/schema';
import { signAdminToken, signRefreshToken, AdminTokenPayload } from '../../middleware/auth.middleware';
import { env } from '../../config/env';

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  user: { id: number; name: string; email: string; role: string };
}

export interface RefreshResult {
  accessToken: string;
}

export class AuthService {
  async login(email: string, password: string): Promise<LoginResult> {
    const [admin] = await db
      .select()
      .from(adminUsers)
      .where(eq(adminUsers.email, email))
      .limit(1);

    if (!admin) {
      throw new Error('Invalid credentials');
    }
    if (!admin.isActive) {
      throw new Error('Account is inactive');
    }

    const valid = await bcrypt.compare(password, admin.passwordHash);
    if (!valid) {
      throw new Error('Invalid credentials');
    }

    // Update last login
    await db
      .update(adminUsers)
      .set({ lastLoginAt: new Date() })
      .where(eq(adminUsers.id, admin.id));

    const payload: AdminTokenPayload = { adminId: admin.id, role: admin.role ?? 'admin' };

    return {
      accessToken: signAdminToken(payload),
      refreshToken: signRefreshToken(payload),
      user: { id: admin.id, name: admin.name, email: admin.email, role: admin.role ?? 'admin' },
    };
  }

  async refresh(refreshToken: string): Promise<RefreshResult> {
    let payload: AdminTokenPayload;
    try {
      payload = jwt.verify(refreshToken, env.JWT_SECRET) as AdminTokenPayload;
    } catch {
      throw new Error('Invalid or expired refresh token');
    }

    // Ensure admin still exists and is active
    const [admin] = await db
      .select()
      .from(adminUsers)
      .where(eq(adminUsers.id, payload.adminId))
      .limit(1);

    if (!admin || !admin.isActive) {
      throw new Error('Account not found or inactive');
    }

    return {
      accessToken: signAdminToken({ adminId: admin.id, role: admin.role ?? 'admin' }),
    };
  }
}

export const authService = new AuthService();

