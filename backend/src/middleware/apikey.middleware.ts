import { Request, Response, NextFunction } from 'express';
import { ClientRepository } from '../modules/client/client.repository';

// Extend Express Request to carry the authenticated client
declare global {
  namespace Express {
    interface Request {
      clientId?: number;
      clientSlug?: string;
    }
  }
}

export function apiKeyMiddleware(clientRepo: ClientRepository) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const apiKey = req.headers['x-api-key'] as string | undefined;

    if (!apiKey) {
      res.status(401).json({ error: 'Unauthorized', message: 'X-Api-Key header is required' });
      return;
    }

    const client = await clientRepo.findByApiKey(apiKey);

    if (!client) {
      res.status(401).json({ error: 'Unauthorized', message: 'Invalid API key' });
      return;
    }

    if (!client.isActive) {
      res.status(403).json({ error: 'Forbidden', message: 'Client account is inactive' });
      return;
    }

    req.clientId = client.id;
    req.clientSlug = client.slug;
    next();
  };
}
