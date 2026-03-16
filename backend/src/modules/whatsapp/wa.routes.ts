import { Router } from 'express';
import { authMiddleware } from '../../middleware/auth.middleware';
import { connectWa, getWaStatus, disconnectWa } from './wa.controller';

const router = Router({ mergeParams: true });

// All WA management endpoints require JWT auth (dashboard access)
router.use(authMiddleware);

// POST /api/clients/:id/wa/connect
router.post('/connect', connectWa);

// GET  /api/clients/:id/wa/status
router.get('/status', getWaStatus);

// POST /api/clients/:id/wa/disconnect
router.post('/disconnect', disconnectWa);

export default router;
