import * as cheerio from 'cheerio';

export class CrawlerService {
  /**
   * Fetch a URL and extract its main text content.
   * Strips nav/footer/ads/scripts for cleaner knowledge.
   */
  async crawlUrl(url: string): Promise<string> {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'ChatbotHub/1.0 (knowledge-crawler)' },
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch URL: ${response.status} ${response.statusText}`);
    }

    const html = await response.text();
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
