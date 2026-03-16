import { Router, Request, Response } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { eq, and, desc } from 'drizzle-orm';
import { db } from '../../config/database';
import { knowledgeBases, knowledgeSources } from '../../db/schema';
import { authMiddleware } from '../../middleware/auth.middleware';
import { chunkerService } from './chunker.service';
import { crawlerService } from './crawler.service';
import { importerService } from './importer.service';
import { getPineconeService } from '../../providers/ai/pinecone.service';
import { knowledgeRepository } from './knowledge.repository';

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

    // Background: chunk + embed
    embedAndUpsert(clientId, entry.id, entry.content).catch(() => {});

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

    // If content changed, re-embed
    if (parsed.data.content) {
      await getPineconeService().deleteByKnowledge(clientId, kid);
      embedAndUpsert(clientId, kid, parsed.data.content).catch(() => {});
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

    // Remove vectors from Pinecone
    getPineconeService().deleteByKnowledge(clientId, kid).catch(() => {});

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

    embedAndUpsert(clientId, entry.id, content).catch(() => {});

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

    embedAndUpsert(clientId, entry.id, content).catch(() => {});

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

    embedAndUpsert(clientId, entry.id, parsed.data.content).catch(() => {});

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

    // Delete existing vectors then re-embed all
    await getPineconeService().deleteByClient(clientId);

    let total = 0;
    for (const entry of entries) {
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

    res.json({ reindexed: entries.length, totalChunks: total });
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
    const chunks = await getPineconeService().search({ clientId, query, topK: 5 });
    res.json({ query, results: chunks });
  } catch (err) {
    res.status(500).json({ error: 'Search failed', detail: String(err) });
  }
});

export default router;
