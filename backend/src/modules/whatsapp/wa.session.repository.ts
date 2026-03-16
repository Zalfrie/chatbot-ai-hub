import { eq } from 'drizzle-orm';
import { db } from '../../config/database';
import { waSessions, WaSession } from '../../db/schema';

export class WaSessionRepository {
  async findByClientId(clientId: number): Promise<WaSession | null> {
    const [session] = await db
      .select()
      .from(waSessions)
      .where(eq(waSessions.clientId, clientId))
      .limit(1);
    return session ?? null;
  }

  /**
   * Create or update a WA session record.
   * waNumber defaults to empty string for the QR-scan phase
   * (updated to the real number once connected).
   */
  async upsert(clientId: number, waNumber = ''): Promise<WaSession> {
    const [session] = await db
      .insert(waSessions)
      .values({ clientId, waNumber, status: 'disconnected' })
      .onConflictDoUpdate({
        target: waSessions.clientId,
        set: { updatedAt: new Date() },
      })
      .returning();
    return session!;
  }

  async updateStatus(
    clientId: number,
    status: 'disconnected' | 'connecting' | 'connected' | 'banned',
    opts?: {
      waNumber?: string;
      connectedAt?: Date;
      disconnectedAt?: Date;
    },
  ): Promise<void> {
    await db
      .update(waSessions)
      .set({
        status,
        ...(opts?.waNumber !== undefined ? { waNumber: opts.waNumber } : {}),
        ...(opts?.connectedAt ? { connectedAt: opts.connectedAt } : {}),
        ...(opts?.disconnectedAt ? { disconnectedAt: opts.disconnectedAt } : {}),
        updatedAt: new Date(),
      })
      .where(eq(waSessions.clientId, clientId));
  }

  async saveSessionData(clientId: number, encryptedData: string): Promise<void> {
    await db
      .update(waSessions)
      .set({ sessionData: encryptedData, updatedAt: new Date() })
      .where(eq(waSessions.clientId, clientId));
  }

  /** Returns all sessions that were connected before last server restart */
  async findAllConnected(): Promise<WaSession[]> {
    return db
      .select()
      .from(waSessions)
      .where(eq(waSessions.status, 'connected'));
  }
}

export const waSessionRepository = new WaSessionRepository();
