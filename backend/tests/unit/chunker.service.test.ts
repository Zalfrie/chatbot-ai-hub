import { describe, it, expect } from 'vitest';
import { ChunkerService } from '../../src/modules/knowledge/chunker.service';

const svc = new ChunkerService();

describe('ChunkerService', () => {
  it('returns a single chunk for text that fits within chunkSize', () => {
    // Must be >= 50 chars to pass the filter
    const text = 'Ini adalah kalimat yang cukup panjang untuk lolos dari filter minimum karena panjangnya lebih dari lima puluh karakter.';
    const chunks = svc.chunk(text);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toBe(text.trim());
  });

  it('splits text into multiple chunks when words exceed chunkSize', () => {
    const words = Array.from({ length: 900 }, (_, i) => `word${i}`);
    const text = words.join(' ');
    const chunks = svc.chunk(text, 400, 50);
    // expect 3 chunks: [0..399], [350..749], [700..899]
    expect(chunks.length).toBeGreaterThanOrEqual(2);
  });

  it('applies overlap correctly — last words of chunk N appear at start of chunk N+1', () => {
    const words = Array.from({ length: 500 }, (_, i) => `w${i}`);
    const text = words.join(' ');
    const chunks = svc.chunk(text, 200, 50);

    const chunk0Words = chunks[0].split(' ');
    const chunk1Words = chunks[1].split(' ');

    const tailOf0 = chunk0Words.slice(-50);
    const headOf1 = chunk1Words.slice(0, 50);

    expect(tailOf0).toEqual(headOf1);
  });

  it('drops chunks shorter than 50 characters', () => {
    // Single word is < 50 chars
    const text = 'tiny';
    const chunks = svc.chunk(text);
    expect(chunks).toHaveLength(0);
  });

  it('handles empty string gracefully', () => {
    const chunks = svc.chunk('');
    expect(chunks).toHaveLength(0);
  });

  it('trims leading/trailing whitespace from each chunk', () => {
    const text = '  ' + Array.from({ length: 10 }, (_, i) => `word${i}`).join(' ') + '  ';
    const chunks = svc.chunk(text, 400, 50);
    expect(chunks[0]).not.toMatch(/^\s/);
    expect(chunks[0]).not.toMatch(/\s$/);
  });
});
