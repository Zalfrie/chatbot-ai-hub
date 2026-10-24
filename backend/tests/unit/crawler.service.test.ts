import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CrawlerService } from '../../src/modules/knowledge/crawler.service';
import { OutboundRequestError } from '../../src/utils/ssrf';

const { safeFetch } = vi.hoisted(() => ({ safeFetch: vi.fn() }));
vi.mock('../../src/utils/safe-fetch', () => ({ safeFetch }));

const PAGE = `
  <html><body>
    <nav>Menu Beranda Kontak</nav>
    <main>
      <h1>Kue Lapis</h1>
      <p>Tersedia   setiap hari.</p>
    </main>
    <script>track()</script>
    <footer>Hak cipta</footer>
  </body></html>`;

describe('CrawlerService', () => {
  const crawler = new CrawlerService();

  beforeEach(() => {
    safeFetch.mockReset();
  });

  it('extracts the main text of the page', async () => {
    safeFetch.mockResolvedValue({ status: 200, ok: true, text: PAGE });

    expect(await crawler.crawlUrl('https://toko.example.com/menu')).toBe('Kue Lapis Tersedia setiap hari.');
  });

  it('fetches through safeFetch with a size cap and a few redirects', async () => {
    safeFetch.mockResolvedValue({ status: 200, ok: true, text: PAGE });

    await crawler.crawlUrl('https://toko.example.com/menu');

    expect(safeFetch).toHaveBeenCalledWith('https://toko.example.com/menu', {
      headers: { 'User-Agent': 'ChatbotHub/1.0 (knowledge-crawler)' },
      timeoutMs: 10_000,
      maxBytes: 5 * 1024 * 1024,
      maxRedirects: 5,
    });
  });

  it('throws on a non-2xx status', async () => {
    safeFetch.mockResolvedValue({ status: 404, ok: false, text: 'Not found' });

    await expect(crawler.crawlUrl('https://toko.example.com/hilang')).rejects.toThrow('Failed to fetch URL: 404');
  });

  it('lets OutboundRequestError through for the route to report', async () => {
    const refused = new OutboundRequestError('toko.example.com resolves to a non-public address');
    safeFetch.mockRejectedValue(refused);

    await expect(crawler.crawlUrl('https://toko.example.com/')).rejects.toBe(refused);
  });
});
