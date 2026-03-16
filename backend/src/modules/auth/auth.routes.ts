import { Router } from 'express';
import { login, refresh } from './auth.controller';

const router = Router();

// POST /api/auth/login
router.post('/login', login);

// POST /api/auth/refresh  — exchange a 7-day refresh token for a new 15-min access token
router.post('/refresh', refresh);

export default router;
