import { eq } from 'drizzle-orm';
import { db } from '../../config/database.js';
import { clients, Client } from '../../db/schema/index.js';

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
