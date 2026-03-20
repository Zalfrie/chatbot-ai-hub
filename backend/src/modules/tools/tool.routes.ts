import { Router, Request, Response } from 'express';
import { z, ZodIssueCode } from 'zod';
import { authMiddleware } from '../../middleware/auth.middleware';
import { toolRepository } from './tool.repository';
import { toolService } from './tool.service';
import { validateWebhookUrl } from '../../utils/ssrf';

const router = Router({ mergeParams: true });
router.use(authMiddleware);

const toolSchema = z.object({
  name: z.string().regex(/^[a-z][a-z0-9_]{0,98}$/, 'name must be snake_case, max 100 chars'),
  description: z.string().min(10).max(1000),
  parameters_schema: z.record(z.string(), z.unknown()),
  webhook_url: z.string().url().max(500).superRefine((url, ctx) => {
    const check = validateWebhookUrl(url);
    if (!check.valid) {
      ctx.addIssue({ code: ZodIssueCode.custom, message: check.error ?? 'Invalid webhook URL' });
    }
  }),
  http_method: z.enum(['GET', 'POST']).default('POST'),
  headers_template: z.record(z.string(), z.string()).nullable().optional(),
  timeout_ms: z.number().int().min(500).max(10000).default(5000),
  is_active: z.boolean().default(true),
});

function parseClientId(req: Request, res: Response): number | null {
  const id = parseInt(req.params['clientId'] as string, 10);
  if (isNaN(id)) {
    res.status(400).json({ error: 'Invalid client ID' });
    return null;
  }
  return id;
}

// GET /api/clients/:clientId/tools
router.get('/', async (req: Request, res: Response) => {
  const clientId = parseClientId(req, res);
  if (!clientId) return;

  try {
    const tools = await toolRepository.findByClientId(clientId);
    res.json(tools);
  } catch {
    res.status(500).json({ error: 'Failed to fetch tools' });
  }
});

// POST /api/clients/:clientId/tools
router.post('/', async (req: Request, res: Response) => {
  const clientId = parseClientId(req, res);
  if (!clientId) return;

  const parsed = toolSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Bad Request', message: parsed.error.flatten().fieldErrors });
    return;
  }

  const d = parsed.data;
  try {
    const tool = await toolRepository.create({
      clientId,
      name: d.name,
      description: d.description,
      parametersSchema: d.parameters_schema,
      webhookUrl: d.webhook_url,
      httpMethod: d.http_method,
      headersTemplate: d.headers_template ?? null,
      timeoutMs: d.timeout_ms,
      isActive: d.is_active,
    });
    res.status(201).json(tool);
  } catch (err) {
    const msg = String(err);
    if (msg.includes('unique') || msg.includes('duplicate')) {
      res.status(409).json({ error: 'Tool name already exists for this client' });
    } else {
      res.status(500).json({ error: 'Failed to create tool' });
    }
  }
});

// PUT /api/clients/:clientId/tools/:tid
router.put('/:tid', async (req: Request, res: Response) => {
  const clientId = parseClientId(req, res);
  if (!clientId) return;

  const tid = parseInt(req.params['tid'] as string, 10);
  if (isNaN(tid)) { res.status(400).json({ error: 'Invalid tool ID' }); return; }

  const parsed = toolSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Bad Request', message: parsed.error.flatten().fieldErrors });
    return;
  }

  const d = parsed.data;
  try {
    const tool = await toolRepository.update(tid, clientId, {
      ...(d.name !== undefined && { name: d.name }),
      ...(d.description !== undefined && { description: d.description }),
      ...(d.parameters_schema !== undefined && { parametersSchema: d.parameters_schema }),
      ...(d.webhook_url !== undefined && { webhookUrl: d.webhook_url }),
      ...(d.http_method !== undefined && { httpMethod: d.http_method }),
      ...(d.headers_template !== undefined && { headersTemplate: d.headers_template ?? null }),
      ...(d.timeout_ms !== undefined && { timeoutMs: d.timeout_ms }),
      ...(d.is_active !== undefined && { isActive: d.is_active }),
    });

    if (!tool) { res.status(404).json({ error: 'Tool not found' }); return; }
    res.json(tool);
  } catch {
    res.status(500).json({ error: 'Failed to update tool' });
  }
});

// DELETE /api/clients/:clientId/tools/:tid
router.delete('/:tid', async (req: Request, res: Response) => {
  const clientId = parseClientId(req, res);
  if (!clientId) return;

  const tid = parseInt(req.params['tid'] as string, 10);
  if (isNaN(tid)) { res.status(400).json({ error: 'Invalid tool ID' }); return; }

  try {
    const deleted = await toolRepository.delete(tid, clientId);
    if (!deleted) { res.status(404).json({ error: 'Tool not found' }); return; }
    res.status(204).end();
  } catch {
    res.status(500).json({ error: 'Failed to delete tool' });
  }
});

// POST /api/clients/:clientId/tools/:tid/test
router.post('/:tid/test', async (req: Request, res: Response) => {
  const clientId = parseClientId(req, res);
  if (!clientId) return;

  const tid = parseInt(req.params['tid'] as string, 10);
  if (isNaN(tid)) { res.status(400).json({ error: 'Invalid tool ID' }); return; }

  const args = (req.body?.args ?? {}) as Record<string, unknown>;

  try {
    const result = await toolService.testTool(tid, clientId, args);
    res.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Test failed';
    res.status(400).json({ error: msg });
  }
});

export default router;
