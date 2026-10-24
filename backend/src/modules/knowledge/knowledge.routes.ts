import { Router, Request, Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { eq, and, desc } from 'drizzle-orm';
import { db } from '../../config/database.js';
import { knowledgeBases, knowledgeSources } from '../../db/schema/index.js';
import { authMiddleware } from '../../middleware/auth.middleware.js';
import { chunkerService } from './chunker.service.js';
import { crawlerService } from './crawler.service.js';
import { importerService } from './importer.service.js';
import { getPineconeService, isPineconeConfigured } from '../../providers/ai/pinecone.service.js';
import { knowledgeRepository } from './knowledge.repository.js';
import { logger } from '../../utils/logger.js';

const router = Router({ mergeParams: true });
router.use(authMiddleware);

// multer: accept file uploads into memory (max 10 MB)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

const knowledgeSchema = z.object({
  title: z.string().min(1).max(255),
  content: z.string().min(1),
  category: z.string().max(100).optional().nullable(),
  priority: z.number().int().min(0).max(100).optional(),
  isActive: z.boolean().optional(),
});

// ---------------------------------------------------------------------------
// Helper: chunk → embed → upsert to Pinecone, then mark embedded in DB
// ---------------------------------------------------------------------------
async function embedAndUpsert(clientId: number, knowledgeId: number, content: string) {
  if (!isPineconeConfigured()) return;
  const chunks = chunkerService.chunk(content);
  if (chunks.length === 0) return;

  await getPineconeService().upsertChunks({
    clientId,
    knowledgeId,
    chunks: chunks.map((c, i) => ({ content: c, chunkIndex: i })),
  });

  await knowledgeRepository.updateEmbedStatus(knowledgeId, chunks.length);
}

// ---------------------------------------------------------------------------
// Helper: make an entry's vectors match its current row. Only active entries have vectors.
// The delete comes first, so chunks that new content no longer has do not survive.
// ---------------------------------------------------------------------------
async function syncVectors(clientId: number, knowledgeId: number) {
  if (!isPineconeConfigured()) return;
  await getPineconeService().deleteByKnowledge(clientId, knowledgeId);

  const entry = await knowledgeRepository.findById(knowledgeId, clientId);
  if (!entry) return; // deleted
  if (entry.isActive !== true) {
    await knowledgeRepository.resetEmbedStatus(knowledgeId);
    return;
  }
  await embedAndUpsert(clientId, knowledgeId, entry.content);
}

// Vector work runs after the response, but its failures must not disappear
function logSyncFailure(err: unknown, context: { clientId: number; knowledgeId: number }): void {
  logger.error('Knowledge vector sync failed', {
    ...context,
    error: err instanceof Error ? err.message : String(err),
  });
}

// One sync per entry at a time, so a quick second edit cannot interleave with the first.
// Each sync reads the row when it runs, so the last one always reflects the latest state.
const pendingSyncs = new Map<number, Promise<void>>();

function queueSync(clientId: number, knowledgeId: number): void {
  const next: Promise<void> = (pendingSyncs.get(knowledgeId) ?? Promise.resolve())
    .then(() => syncVectors(clientId, knowledgeId))
    .catch((err: unknown) => logSyncFailure(err, { clientId, knowledgeId }))
    .finally(() => {
      if (pendingSyncs.get(knowledgeId) === next) pendingSyncs.delete(knowledgeId);
    });
  pendingSyncs.set(knowledgeId, next);
}

// ---------------------------------------------------------------------------
// GET /api/clients/:clientId/knowledge
// ---------------------------------------------------------------------------
router.get('/', async (req: Request, res: Response) => {
  const clientId = parseInt(req.params['clientId'] as string, 10);
  if (isNaN(clientId)) { res.status(400).json({ error: 'Invalid client ID' }); return; }

  try {
    const rows = await db
      .select()
      .from(knowledgeBases)
      .where(eq(knowledgeBases.clientId, clientId))
      .orderBy(desc(knowledgeBases.priority), desc(knowledgeBases.createdAt));
    res.json(rows);
  } catch {
    res.status(500).json({ error: 'Failed to fetch knowledge base' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/clients/:clientId/knowledge
// ---------------------------------------------------------------------------
router.post('/', async (req: Request, res: Response) => {
  const clientId = parseInt(req.params['clientId'] as string, 10);
  if (isNaN(clientId)) { res.status(400).json({ error: 'Invalid client ID' }); return; }

  const parsed = knowledgeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation error', details: parsed.error.flatten() });
    return;
  }

  try {
    const [entry] = await db
      .insert(knowledgeBases)
      .values({ ...parsed.data, clientId })
      .returning();

    // Track source
    await db.insert(knowledgeSources).values({
      clientId,
      knowledgeId: entry.id,
      sourceType: 'manual',
    });

    // Background: chunk + embed (only active entries have vectors)
    if (entry.isActive === true) {
      embedAndUpsert(clientId, entry.id, entry.content)
        .catch((err: unknown) => logSyncFailure(err, { clientId, knowledgeId: entry.id }));
    }

    res.status(201).json(entry);
  } catch {
    res.status(500).json({ error: 'Failed to create knowledge entry' });
  }
});

// ---------------------------------------------------------------------------
// PUT /api/clients/:clientId/knowledge/:kid
// ---------------------------------------------------------------------------
router.put('/:kid', async (req: Request, res: Response) => {
  const clientId = parseInt(req.params['clientId'] as string, 10);
  const kid = parseInt(req.params['kid'] as string, 10);
  if (isNaN(clientId) || isNaN(kid)) { res.status(400).json({ error: 'Invalid ID' }); return; }

  const parsed = knowledgeSchema.partial().safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation error', details: parsed.error.flatten() });
    return;
  }

  try {
    const [updated] = await db
      .update(knowledgeBases)
      .set(parsed.data)
      .where(and(eq(knowledgeBases.id, kid), eq(knowledgeBases.clientId, clientId)))
      .returning();
    if (!updated) { res.status(404).json({ error: 'Knowledge entry not found' }); return; }

    // Content or active state changed: bring the vectors in line with the row
    if (parsed.data.content !== undefined || parsed.data.isActive !== undefined) {
      queueSync(clientId, kid);
    }

    res.json(updated);
  } catch {
    res.status(500).json({ error: 'Failed to update knowledge entry' });
  }
});

// ---------------------------------------------------------------------------
// DELETE /api/clients/:clientId/knowledge/:kid
// ---------------------------------------------------------------------------
router.delete('/:kid', async (req: Request, res: Response) => {
  const clientId = parseInt(req.params['clientId'] as string, 10);
  const kid = parseInt(req.params['kid'] as string, 10);
  if (isNaN(clientId) || isNaN(kid)) { res.status(400).json({ error: 'Invalid ID' }); return; }

  try {
    const [deleted] = await db
      .delete(knowledgeBases)
      .where(and(eq(knowledgeBases.id, kid), eq(knowledgeBases.clientId, clientId)))
      .returning();
    if (!deleted) { res.status(404).json({ error: 'Knowledge entry not found' }); return; }

    // Remove its vectors: the row is gone, so the sync only deletes
    queueSync(clientId, kid);

    res.json({ message: 'Knowledge entry deleted' });
  } catch {
    res.status(500).json({ error: 'Failed to delete knowledge entry' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/clients/:clientId/knowledge/import/file  (PDF / DOCX / TXT)
// ---------------------------------------------------------------------------
router.post('/import/file', upload.single('file'), async (req: Request, res: Response) => {
  const clientId = parseInt(req.params['clientId'] as string, 10);
  if (isNaN(clientId)) { res.status(400).json({ error: 'Invalid client ID' }); return; }
  if (!req.file) { res.status(400).json({ error: 'No file uploaded' }); return; }

  const titleParsed = z.string().min(1).max(255).safeParse(req.body['title']);
  if (!titleParsed.success) {
    res.status(400).json({ error: 'title is required' });
    return;
  }

  try {
    let content: string;
    const mime = req.file.mimetype;

    if (mime === 'application/pdf') {
      content = await importerService.fromPdf(req.file.buffer);
    } else if (
      mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      mime === 'application/msword'
    ) {
      content = await importerService.fromDocx(req.file.buffer);
    } else {
      content = importerService.fromText(req.file.buffer);
    }

    if (!content) { res.status(422).json({ error: 'No text could be extracted from file' }); return; }

    const [entry] = await db
      .insert(knowledgeBases)
      .values({ clientId, title: titleParsed.data, content })
      .returning();

    await db.insert(knowledgeSources).values({
      clientId,
      knowledgeId: entry.id,
      sourceType: 'file',
    });

    embedAndUpsert(clientId, entry.id, content)
      .catch((err: unknown) => logSyncFailure(err, { clientId, knowledgeId: entry.id }));

    res.status(201).json({ ...entry, chunkCount: chunkerService.chunk(content).length });
  } catch (err) {
    res.status(500).json({ error: 'Failed to import file', detail: String(err) });
  }
});

// ---------------------------------------------------------------------------
// POST /api/clients/:clientId/knowledge/import/url
// ---------------------------------------------------------------------------
router.post('/import/url', async (req: Request, res: Response) => {
  const clientId = parseInt(req.params['clientId'] as string, 10);
  if (isNaN(clientId)) { res.status(400).json({ error: 'Invalid client ID' }); return; }

  const bodySchema = z.object({
    url: z.string().url(),
    title: z.string().min(1).max(255),
  });
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation error', details: parsed.error.flatten() });
    return;
  }

  try {
    const content = await crawlerService.crawlUrl(parsed.data.url);
    if (!content) { res.status(422).json({ error: 'No content found at URL' }); return; }

    const [entry] = await db
      .insert(knowledgeBases)
      .values({ clientId, title: parsed.data.title, content })
      .returning();

    await db.insert(knowledgeSources).values({
      clientId,
      knowledgeId: entry.id,
      sourceType: 'url',
      sourceUrl: parsed.data.url,
      lastContent: content,
      lastCrawledAt: new Date(),
    });

    embedAndUpsert(clientId, entry.id, content)
      .catch((err: unknown) => logSyncFailure(err, { clientId, knowledgeId: entry.id }));

    res.status(201).json({ ...entry, sourceUrl: parsed.data.url });
  } catch (err) {
    res.status(500).json({ error: 'Failed to crawl URL', detail: String(err) });
  }
});

// ---------------------------------------------------------------------------
// POST /api/clients/:clientId/knowledge/import/text  (raw text → AI-structured)
// ---------------------------------------------------------------------------
router.post('/import/text', async (req: Request, res: Response) => {
  const clientId = parseInt(req.params['clientId'] as string, 10);
  if (isNaN(clientId)) { res.status(400).json({ error: 'Invalid client ID' }); return; }

  const bodySchema = z.object({
    title: z.string().min(1).max(255),
    content: z.string().min(10),
  });
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: 'Validation error', details: parsed.error.flatten() });
    return;
  }

  try {
    const [entry] = await db
      .insert(knowledgeBases)
      .values({ clientId, title: parsed.data.title, content: parsed.data.content })
      .returning();

    await db.insert(knowledgeSources).values({
      clientId,
      knowledgeId: entry.id,
      sourceType: 'text',
    });

    embedAndUpsert(clientId, entry.id, parsed.data.content)
      .catch((err: unknown) => logSyncFailure(err, { clientId, knowledgeId: entry.id }));

    res.status(201).json(entry);
  } catch {
    res.status(500).json({ error: 'Failed to save text knowledge' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/clients/:clientId/knowledge/reindex   (re-embed all entries)
// ---------------------------------------------------------------------------
router.post('/reindex', async (req: Request, res: Response) => {
  const clientId = parseInt(req.params['clientId'] as string, 10);
  if (isNaN(clientId)) { res.status(400).json({ error: 'Invalid client ID' }); return; }

  try {
    const entries = await knowledgeRepository.findAllByClient(clientId);

    // Delete existing vectors then re-embed the active entries
    await getPineconeService().deleteByClient(clientId);

    let reindexed = 0;
    let total = 0;
    for (const entry of entries) {
      if (entry.isActive !== true) {
        await knowledgeRepository.resetEmbedStatus(entry.id);
        continue;
      }
      reindexed += 1;
      const chunks = chunkerService.chunk(entry.content);
      if (chunks.length === 0) continue;

      await getPineconeService().upsertChunks({
        clientId,
        knowledgeId: entry.id,
        chunks: chunks.map((c, i) => ({ content: c, chunkIndex: i })),
      });

      await knowledgeRepository.updateEmbedStatus(entry.id, chunks.length);
      total += chunks.length;
    }

    res.json({ reindexed, totalChunks: total });
  } catch (err) {
    res.status(500).json({ error: 'Reindex failed', detail: String(err) });
  }
});

// ---------------------------------------------------------------------------
// GET /api/clients/:clientId/knowledge/search?q=   (debug: test vector search)
// ---------------------------------------------------------------------------
router.get('/search', async (req: Request, res: Response) => {
  const clientId = parseInt(req.params['clientId'] as string, 10);
  if (isNaN(clientId)) { res.status(400).json({ error: 'Invalid client ID' }); return; }

  const query = String(req.query['q'] ?? '').trim();
  if (!query) { res.status(400).json({ error: 'q parameter is required' }); return; }

  try {
    const active = await knowledgeRepository.findActiveByClient(clientId);
    const chunks = active.length === 0
      ? []
      : await getPineconeService().search({ clientId, knowledgeIds: active.map((e) => e.id), query, topK: 5 });
    res.json({ query, results: chunks });
  } catch (err) {
    res.status(500).json({ error: 'Search failed', detail: String(err) });
  }
});

export default router;
