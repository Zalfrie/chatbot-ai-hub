/**
 * ChunkerService — splits large text into overlapping word-based chunks
 * so each chunk fits within the embedding model's token budget.
 */
export class ChunkerService {
  /**
   * @param text      Raw text to split
   * @param chunkSize Words per chunk (default 400)
   * @param overlap   Overlapping words between consecutive chunks (default 50)
   * @returns Array of text chunks (empty chunks < 50 chars are dropped)
   */
  chunk(text: string, chunkSize = 400, overlap = 50): string[] {
    const words = text.split(/\s+/).filter((w) => w.length > 0);
    const chunks: string[] = [];

    let i = 0;
    while (i < words.length) {
      const chunk = words.slice(i, i + chunkSize).join(' ');
      if (chunk.trim().length >= 50) {
        chunks.push(chunk.trim());
      }
      i += chunkSize - overlap;
    }

    return chunks;
  }
}

export const chunkerService = new ChunkerService();
