import { describe, expect, it } from 'vitest';
import { STANDARD_START_FEN } from '@open-chess-lab/shared';
import { formatPvLine, parseBestMove, parseInfoLine } from '../src/engine/uci';

describe('UCI parsing', () => {
  it('reads depth, multipv, score and principal variation', () => {
    const line =
      'info depth 12 seldepth 17 multipv 2 score cp 34 nodes 23297 nps 485354 time 48 pv e7e5 g1f3';
    expect(parseInfoLine(line, 'black')).toEqual({
      multipv: 2,
      depth: 12,
      score: { kind: 'cp', value: -34 },
      pv: ['e7e5', 'g1f3'],
    });
  });

  it('ignores lines without a score or pv', () => {
    expect(parseInfoLine('info string NNUE evaluation enabled', 'white')).toBeNull();
    expect(parseInfoLine('info depth 1 currmove e2e4 currmovenumber 1', 'white')).toBeNull();
  });

  it('reads best moves', () => {
    expect(parseBestMove('bestmove e2e4 ponder e7e5')).toBe('e2e4');
    expect(parseBestMove('bestmove (none)')).toBeNull();
    expect(parseBestMove('readyok')).toBeUndefined();
  });

  it('formats a principal variation with move numbers', () => {
    expect(formatPvLine(STANDARD_START_FEN, ['e2e4', 'e7e5', 'g1f3'])).toBe('1. e4 e5 2. Nf3');
    const afterE4 = 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1';
    expect(formatPvLine(afterE4, ['e7e5', 'g1f3'])).toBe('1… e5 2. Nf3');
  });
});
