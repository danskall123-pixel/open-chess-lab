import { describe, expect, it } from 'vitest';
import { isAllowedOrigin, requiresCsrfCheck, tokensMatch } from '../src/auth/csrf.js';
import { parseClientMessage } from '../src/realtime/clientMessages.js';

describe('CSRF protection', () => {
  it('checks only state-changing methods', () => {
    expect(requiresCsrfCheck('GET')).toBe(false);
    expect(requiresCsrfCheck('post')).toBe(true);
    expect(requiresCsrfCheck('DELETE')).toBe(true);
  });

  it('compares tokens exactly', () => {
    expect(tokensMatch('abc', 'abc')).toBe(true);
    expect(tokensMatch('abc', 'abd')).toBe(false);
    expect(tokensMatch('abc', 'abcd')).toBe(false);
    expect(tokensMatch('abc', undefined)).toBe(false);
  });

  it('rejects foreign origins', () => {
    const allowed = ['https://chess.example'];
    expect(isAllowedOrigin('https://chess.example', allowed)).toBe(true);
    expect(isAllowedOrigin('https://evil.example', allowed)).toBe(false);
    expect(isAllowedOrigin(undefined, allowed)).toBe(true);
  });
});

describe('parseClientMessage', () => {
  it('accepts well-formed messages', () => {
    expect(parseClientMessage('{"t":"game.move","gameId":"abc","uci":"e7e8q","ply":3}')).toEqual({
      t: 'game.move',
      gameId: 'abc',
      uci: 'e7e8q',
      ply: 3,
    });
  });

  it('rejects malformed or unknown messages', () => {
    expect(parseClientMessage('not json')).toBeNull();
    expect(parseClientMessage('{"t":"game.move","gameId":"abc","uci":"e9e8","ply":0}')).toBeNull();
    expect(parseClientMessage('{"t":"admin.shutdown"}')).toBeNull();
    expect(
      parseClientMessage(`{"t":"ping","sentAt":1,"rttMs":null,"x":"${'a'.repeat(5000)}"}`),
    ).toBeNull();
  });
});
