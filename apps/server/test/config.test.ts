import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';

describe('loadConfig', () => {
  it('applies defaults and treats blank optional values as unset', () => {
    const config = loadConfig({
      DATABASE_URL: 'postgresql://localhost/test',
      STOCKFISH_PATH: '',
      SMTP_URL: '  ',
      COOKIE_SECURE: 'true',
    });
    expect(config.PORT).toBe(3000);
    expect(config.STOCKFISH_PATH).toBeUndefined();
    expect(config.SMTP_URL).toBeUndefined();
    expect(config.COOKIE_SECURE).toBe(true);
  });

  it('reports missing required values', () => {
    expect(() => loadConfig({})).toThrow(/DATABASE_URL/);
  });
});
