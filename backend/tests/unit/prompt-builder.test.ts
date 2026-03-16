import { describe, it, expect } from 'vitest';
import { buildSystemPrompt, KnowledgeEntry } from '../../src/utils/prompt-builder';

const BOT_PROMPT = 'Kamu adalah asisten toko kue Laris Manis.';

describe('buildSystemPrompt', () => {
  describe('with no knowledge bases', () => {
    it('returns bot prompt with INSTRUKSI TAMBAHAN section', () => {
      const result = buildSystemPrompt(BOT_PROMPT, []);
      expect(result).toContain(BOT_PROMPT);
      expect(result).toContain('INSTRUKSI TAMBAHAN');
    });

    it('does NOT include INFORMASI section when list is empty', () => {
      const result = buildSystemPrompt(BOT_PROMPT, []);
      expect(result).not.toContain('INFORMASI YANG KAMU KETAHUI');
    });

    it('always includes Indonesian language instruction', () => {
      const result = buildSystemPrompt(BOT_PROMPT, []);
      expect(result).toContain('Bahasa Indonesia');
    });
  });

  describe('with active knowledge bases', () => {
    it('includes INFORMASI section and knowledge content', () => {
      const kbs: KnowledgeEntry[] = [
        { id: 1, title: 'Produk Unggulan', content: 'Kami jual kue brownies.', priority: 5, isActive: true },
      ];
      const result = buildSystemPrompt(BOT_PROMPT, kbs);
      expect(result).toContain('INFORMASI YANG KAMU KETAHUI');
      expect(result).toContain('## Produk Unggulan\nKami jual kue brownies.');
    });

    it('sorts knowledge bases by priority descending', () => {
      const kbs: KnowledgeEntry[] = [
        { id: 1, title: 'Low', content: 'low', priority: 1, isActive: true },
        { id: 2, title: 'High', content: 'high', priority: 10, isActive: true },
        { id: 3, title: 'Mid', content: 'mid', priority: 5, isActive: true },
      ];
      const result = buildSystemPrompt(BOT_PROMPT, kbs);
      const highIdx = result.indexOf('## High');
      const midIdx = result.indexOf('## Mid');
      const lowIdx = result.indexOf('## Low');
      expect(highIdx).toBeLessThan(midIdx);
      expect(midIdx).toBeLessThan(lowIdx);
    });

    it('handles null priority as 0 (lowest)', () => {
      const kbs: KnowledgeEntry[] = [
        { id: 1, title: 'NullPrio', content: 'np', priority: null, isActive: true },
        { id: 2, title: 'HasPrio', content: 'hp', priority: 5, isActive: true },
      ];
      const result = buildSystemPrompt(BOT_PROMPT, kbs);
      expect(result.indexOf('## HasPrio')).toBeLessThan(result.indexOf('## NullPrio'));
    });

    it('still includes INSTRUKSI TAMBAHAN after knowledge section', () => {
      const kbs: KnowledgeEntry[] = [
        { id: 1, title: 'FAQ', content: 'Pertanyaan umum.', priority: 1, isActive: true },
      ];
      const result = buildSystemPrompt(BOT_PROMPT, kbs);
      const infoIdx = result.indexOf('INFORMASI YANG KAMU KETAHUI');
      const instrIdx = result.indexOf('INSTRUKSI TAMBAHAN');
      expect(infoIdx).toBeGreaterThanOrEqual(0);
      expect(instrIdx).toBeGreaterThan(infoIdx);
    });
  });

  describe('filtering inactive knowledge bases', () => {
    it('excludes entries where isActive is false', () => {
      const kbs: KnowledgeEntry[] = [
        { id: 1, title: 'Active', content: 'shown', priority: 1, isActive: true },
        { id: 2, title: 'Inactive', content: 'hidden', priority: 1, isActive: false },
      ];
      const result = buildSystemPrompt(BOT_PROMPT, kbs);
      expect(result).toContain('## Active');
      expect(result).not.toContain('## Inactive');
    });

    it('treats isActive: null as active (included)', () => {
      const kbs: KnowledgeEntry[] = [
        { id: 1, title: 'NullActive', content: 'shown', priority: 1, isActive: null },
      ];
      const result = buildSystemPrompt(BOT_PROMPT, kbs);
      expect(result).toContain('## NullActive');
    });

    it('returns no INFORMASI section when all entries are inactive', () => {
      const kbs: KnowledgeEntry[] = [
        { id: 1, title: 'Inactive', content: 'hidden', priority: 1, isActive: false },
      ];
      const result = buildSystemPrompt(BOT_PROMPT, kbs);
      expect(result).not.toContain('INFORMASI YANG KAMU KETAHUI');
    });
  });

  describe('output format', () => {
    it('result is trimmed (no leading/trailing whitespace)', () => {
      const result = buildSystemPrompt(BOT_PROMPT, []);
      expect(result).toBe(result.trim());
    });

    it('formats each knowledge entry as markdown heading + content', () => {
      const kbs: KnowledgeEntry[] = [
        { id: 1, title: 'Jam Buka', content: 'Senin-Sabtu 08.00-20.00', priority: 1, isActive: true },
      ];
      const result = buildSystemPrompt(BOT_PROMPT, kbs);
      expect(result).toContain('## Jam Buka\nSenin-Sabtu 08.00-20.00');
    });
  });
});
