import { eq } from 'drizzle-orm';
import { db } from '../../config/database';
import { clients, Client } from '../../db/schema';

export class ClientRepository {
  async findByApiKey(apiKey: string): Promise<Client | null> {
    const [client] = await db
      .select()
      .from(clients)
      .where(eq(clients.apiKey, apiKey))
      .limit(1);
    return client ?? null;
  }

  async findById(id: number): Promise<Client | null> {
    const [client] = await db
      .select()
      .from(clients)
      .where(eq(clients.id, id))
      .limit(1);
    return client ?? null;
  }
}

export const clientRepository = new ClientRepository();
