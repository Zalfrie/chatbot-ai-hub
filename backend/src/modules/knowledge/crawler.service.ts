import * as cheerio from 'cheerio';
import { safeFetch } from '../../utils/safe-fetch.js';

const MAX_PAGE_BYTES = 5 * 1024 * 1024;
const MAX_REDIRECTS = 5;

export class CrawlerService {
  /**
   * Fetch a URL and extract its main text content.
   * Strips nav/footer/ads/scripts for cleaner knowledge.
   * Throws OutboundRequestError for URLs that lead to a non-public address.
   */
  async crawlUrl(url: string): Promise<string> {
    const response = await safeFetch(url, {
      headers: { 'User-Agent': 'ChatbotHub/1.0 (knowledge-crawler)' },
      timeoutMs: 10_000,
      maxBytes: MAX_PAGE_BYTES,
      maxRedirects: MAX_REDIRECTS,
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch URL: ${response.status}`);
    }

    const html = response.text;
    const $ = cheerio.load(html);

    // Remove noise elements
    $('nav, footer, header, script, style, iframe, .ads, .advertisement, noscript').remove();

    // Prefer semantic containers; fall back to body
    const container = $('main, article, [role="main"], .content, .main-content, #content, #main');
    const rawText = container.length > 0 ? container.text() : $('body').text();

    return rawText.replace(/\s+/g, ' ').trim();
  }
}

export const crawlerService = new CrawlerService();
