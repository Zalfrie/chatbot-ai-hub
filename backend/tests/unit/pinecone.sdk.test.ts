/**
 * PineconeService against the real @pinecone-database/pinecone SDK. Only HTTP is faked (MSW),
 * so these tests fail when a call shape does not match what the installed SDK accepts.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../mocks/msw-server';
import { PineconeService } from '../../src/providers/ai/pinecone.service';

const INDEX = 'chatbot-hub-test';
const HOST = 'chatbot-hub-test-abc123.svc.pinecone.io';

let requests: { path: string; body: unknown }[] = [];

beforeEach(() => {
  requests = [];
  process.env['PINECONE_API_KEY'] = 'test-key';
  process.env['PINECONE_INDEX'] = INDEX;

  server.use(
    // The SDK looks up the index host once, then talks to the index directly
    http.get(`https://api.pinecone.io/indexes/${INDEX}`, () => HttpResponse.json({
      name: INDEX,
      dimension: 1024,
      metric: 'cosine',
      host: HOST,
      spec: { serverless: { cloud: 'aws', region: 'us-east-1' } },
      status: { ready: true, state: 'Ready' },
      deletion_protection: 'disabled',
      vector_type: 'dense',
    })),
    http.post(`https://${HOST}/*`, async ({ request }) => {
      requests.push({ path: new URL(request.url).pathname, body: await request.json() });
      if (request.url.endsWith('/search')) {
        return HttpResponse.json({
          result: { hits: [{ _id: 'client_1_kb_10_chunk_0', _score: 0.9, fields: { text: 'Kue lapis Rp25.000', knowledgeId: 10 } }] },
          usage: { read_units: 1 },
        });
      }
      return HttpResponse.json({});
    }),
  );
});

describe('PineconeService with the real SDK', () => {
  it('deletes an entry\'s vectors with a metadata filter request', async () => {
    await new PineconeService().deleteByKnowledge(1, 10);

    expect(requests).toEqual([{
      path: '/vectors/delete',
      // __default__ is the namespace upsertRecords writes to
      body: { namespace: '__default__', filter: { clientId: { $eq: 1 }, knowledgeId: { $eq: 10 } } },
    }]);
  });

  it('deletes a client\'s vectors with a metadata filter request', async () => {
    await new PineconeService().deleteByClient(5);

    expect(requests).toEqual([{
      path: '/vectors/delete',
      body: { namespace: '__default__', filter: { clientId: { $eq: 5 } } },
    }]);
  });

  it('searches the tenant\'s active entries and returns their knowledge ids', async () => {
    const chunks = await new PineconeService().search({ clientId: 1, knowledgeIds: [10, 11], query: 'harga', topK: 3 });

    expect(requests).toHaveLength(1);
    expect(requests[0]!.path).toBe('/records/namespaces/__default__/search');
    expect(requests[0]!.body).toMatchObject({
      query: { top_k: 3, filter: { clientId: { $eq: 1 }, knowledgeId: { $in: [10, 11] } }, inputs: { text: 'harga' } },
    });
    expect(chunks).toEqual([{ content: 'Kue lapis Rp25.000', score: 0.9, knowledgeId: 10 }]);
  });
});
