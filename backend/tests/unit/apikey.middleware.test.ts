import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { apiKeyMiddleware } from '../../src/middleware/apikey.middleware';
import type { ClientRepository } from '../../src/modules/client/client.repository';

function makeRes(): Response {
  const res = { status: vi.fn(), json: vi.fn() } as unknown as Response;
  (res.status as ReturnType<typeof vi.fn>).mockReturnValue(res);
  return res;
}

function makeRepo(client: Record<string, unknown> | null): ClientRepository {
  return {
    findByApiKey: vi.fn().mockResolvedValue(client),
    findById: vi.fn(),
  } as unknown as ClientRepository;
}

describe('apiKeyMiddleware', () => {
  let req: Partial<Request>;
  let res: Response;
  let next: NextFunction;

  beforeEach(() => {
    req = { headers: {} };
    res = makeRes();
    next = vi.fn();
  });

  it('returns 401 when X-Api-Key header is missing', async () => {
    const middleware = apiKeyMiddleware(makeRepo(null));
    await middleware(req as Request, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'Unauthorized',
        message: 'X-Api-Key header is required',
      }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 401 when API key is not found in DB', async () => {
    req.headers = { 'x-api-key': 'ck_nonexistent' };
    const middleware = apiKeyMiddleware(makeRepo(null));
    await middleware(req as Request, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Invalid API key' }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 when client account is inactive', async () => {
    req.headers = { 'x-api-key': 'ck_inactive' };
    const inactiveClient = { id: 2, slug: 'toko-tutup', isActive: false };
    const middleware = apiKeyMiddleware(makeRepo(inactiveClient));
    await middleware(req as Request, res, next);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'Forbidden', message: 'Client account is inactive' }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('sets req.clientId and req.clientSlug then calls next for a valid active client', async () => {
    req.headers = { 'x-api-key': 'ck_valid_active' };
    const activeClient = { id: 7, slug: 'toko-kue-laris', isActive: true };
    const middleware = apiKeyMiddleware(makeRepo(activeClient));
    await middleware(req as Request, res, next);

    expect(req.clientId).toBe(7);
    expect(req.clientSlug).toBe('toko-kue-laris');
    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('calls findByApiKey with the exact header value', async () => {
    req.headers = { 'x-api-key': 'ck_abc123xyz' };
    const repo = makeRepo({ id: 1, slug: 'test', isActive: true });
    const middleware = apiKeyMiddleware(repo);
    await middleware(req as Request, res, next);

    expect(repo.findByApiKey).toHaveBeenCalledWith('ck_abc123xyz');
  });
});
