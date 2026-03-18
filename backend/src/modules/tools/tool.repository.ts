import { eq, and } from 'drizzle-orm';
import { db } from '../../config/database';
import { tenantTools, NewTenantTool } from '../../db/schema/tenant_tools.schema';
import { TenantTool } from './tool.types';

function mapRow(row: typeof tenantTools.$inferSelect): TenantTool {
  return {
    id: Number(row.id),
    clientId: Number(row.clientId),
    name: row.name,
    description: row.description,
    parametersSchema: row.parametersSchema as Record<string, unknown>,
    webhookUrl: row.webhookUrl,
    httpMethod: row.httpMethod as 'GET' | 'POST',
    headersTemplate: row.headersTemplate as Record<string, string> | null,
    timeoutMs: row.timeoutMs ?? 5000,
    isActive: row.isActive ?? true,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export const toolRepository = {
  async findByClientId(clientId: number): Promise<TenantTool[]> {
    const rows = await db
      .select()
      .from(tenantTools)
      .where(eq(tenantTools.clientId, clientId));
    return rows.map(mapRow);
  },

  async findActive(clientId: number): Promise<TenantTool[]> {
    const rows = await db
      .select()
      .from(tenantTools)
      .where(and(eq(tenantTools.clientId, clientId), eq(tenantTools.isActive, true)));
    return rows.map(mapRow);
  },

  async findById(id: number, clientId: number): Promise<TenantTool | null> {
    const [row] = await db
      .select()
      .from(tenantTools)
      .where(and(eq(tenantTools.id, id), eq(tenantTools.clientId, clientId)))
      .limit(1);
    return row ? mapRow(row) : null;
  },

  async create(data: Omit<NewTenantTool, 'id' | 'createdAt' | 'updatedAt'>): Promise<TenantTool> {
    const [row] = await db
      .insert(tenantTools)
      .values(data)
      .returning();
    return mapRow(row);
  },

  async update(
    id: number,
    clientId: number,
    data: Partial<Omit<NewTenantTool, 'id' | 'clientId' | 'createdAt' | 'updatedAt'>>,
  ): Promise<TenantTool | null> {
    const [row] = await db
      .update(tenantTools)
      .set({ ...data, updatedAt: new Date() })
      .where(and(eq(tenantTools.id, id), eq(tenantTools.clientId, clientId)))
      .returning();
    return row ? mapRow(row) : null;
  },

  async delete(id: number, clientId: number): Promise<boolean> {
    const result = await db
      .delete(tenantTools)
      .where(and(eq(tenantTools.id, id), eq(tenantTools.clientId, clientId)))
      .returning({ id: tenantTools.id });
    return result.length > 0;
  },
};
