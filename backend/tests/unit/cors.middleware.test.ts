import { describe, it, expect, vi, beforeEach } from 'vitest';
import { parseOrigins } from '../../src/middleware/cors.middleware';
import { logger } from '../../src/utils/logger';

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(logger, 'warn').mockImplementation(() => logger);
});

describe('parseOrigins', () => {
  it('returns each entry in the form browsers send in the Origin header', () => {
    expect(parseOrigins(' https://Dashboard.Example.com/ ,http://localhost:3000/app, https://admin.example.com:443')).toEqual([
      'https://dashboard.example.com',
      'http://localhost:3000',
      'https://admin.example.com',
    ]);
  });

  it('ignores empty entries', () => {
    expect(parseOrigins('')).toEqual([]);
    expect(parseOrigins('http://localhost:3000,, ,')).toEqual(['http://localhost:3000']);
    expect(logger.warn).not.toHaveBeenCalled();
  });

  // Without a scheme the parsed origin is "null", which would admit sandboxed and file:// pages
  it.each(['localhost:3000', 'dashboard.example.com', '*', 'null', 'ftp://files.example.com', 'not a url'])(
    'ignores %s with a warning instead of turning it into an origin',
    (entry) => {
      expect(parseOrigins(`http://localhost:3000,${entry}`)).toEqual(['http://localhost:3000']);
      expect(logger.warn).toHaveBeenCalledWith(expect.any(String), { entry });
    },
  );
});
