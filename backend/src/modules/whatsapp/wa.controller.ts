import { Request, Response } from 'express';
import { whatsAppService } from './wa.service';
import { clientRepository } from '../client/client.repository';
import { logger } from '../../utils/logger';

/**
 * POST /api/clients/:id/wa/connect
 * Initiates a Baileys session. QR code is streamed via Socket.io (wa:qr event).
 */
export async function connectWa(req: Request, res: Response): Promise<void> {
  const clientId = parseInt(req.params['id'] as string, 10);
  if (isNaN(clientId)) {
    res.status(400).json({ error: 'Invalid client ID' });
    return;
  }

  const client = await clientRepository.findById(clientId);
  if (!client) {
    res.status(404).json({ error: 'Client not found' });
    return;
  }
  if (!client.isActive) {
    res.status(403).json({ error: 'Client account is inactive' });
    return;
  }

  // Non-blocking: QR comes via Socket.io
  whatsAppService.connect(clientId).catch((err) => {
    logger.error('WA connect() error', { clientId, error: err });
  });

  res.status(200).json({
    message: 'WhatsApp connection initiated. Subscribe to Socket.io room wa:{clientId} for QR code.',
    clientId,
  });
}

/**
 * GET /api/clients/:id/wa/status
 * Returns the current WA session status for a client.
 */
export async function getWaStatus(req: Request, res: Response): Promise<void> {
  const clientId = parseInt(req.params['id'] as string, 10);
  if (isNaN(clientId)) {
    res.status(400).json({ error: 'Invalid client ID' });
    return;
  }

  const client = await clientRepository.findById(clientId);
  if (!client) {
    res.status(404).json({ error: 'Client not found' });
    return;
  }

  const status = await whatsAppService.getStatus(clientId);
  res.status(200).json(status);
}

/**
 * POST /api/clients/:id/wa/disconnect
 * Disconnects the active Baileys session and clears stored credentials.
 */
export async function disconnectWa(req: Request, res: Response): Promise<void> {
  const clientId = parseInt(req.params['id'] as string, 10);
  if (isNaN(clientId)) {
    res.status(400).json({ error: 'Invalid client ID' });
    return;
  }

  const client = await clientRepository.findById(clientId);
  if (!client) {
    res.status(404).json({ error: 'Client not found' });
    return;
  }

  await whatsAppService.disconnect(clientId);
  res.status(200).json({ message: 'WhatsApp session disconnected', clientId });
}
