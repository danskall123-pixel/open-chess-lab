import { describe, expect, it } from 'vitest';
import {
  buildPgn,
  describeImportedGame,
  parsePgnCollection,
  parsePgnGame,
  splitPgnGames,
  STANDARD_START_FEN,
  validateFenInput,
} from '../src/index.js';

const operaGame = `[Event "Paris Opera"]
[Site "Paris FRA"]
[Date "1858.??.??"]
[White "Paul Morphy"]
[Black "Duke Karl / Count Isouard"]
[Result "1-0"]

1. e4 e5 2. Nf3 d6 3. d4 Bg4 4. dxe5 Bxf3 5. Qxf3 dxe5 6. Bc4 Nf6 7. Qb3 Qe7
8. Nc3 c6 9. Bg5 b5 10. Nxb5 cxb5 11. Bxb5+ Nbd7 12. O-O-O Rd8 13. Rxd7 Rxd7
14. Rd1 Qe6 15. Bxd7+ Nxd7 16. Qb8+ Nxb8 17. Rd8# 1-0`;

const shortGame = `[Event "Casual"]
[White "A"]
[Black "B"]
[Result "0-1"]

1. f3 e5 2. g4 Qh4# 0-1`;

describe('splitPgnGames', () => {
  it('splits a multi-game file into separate games', () => {
    const games = splitPgnGames(`${operaGame}\n\n${shortGame}\r\n`);
    expect(games).toHaveLength(2);
    expect(games[1]).toContain('Qh4#');
  });

  it('returns an empty list for blank input', () => {
    expect(splitPgnGames('   \n\n')).toEqual([]);
  });
});

describe('parsePgnGame', () => {
  it('reads headers and moves', () => {
    const result = parsePgnGame(operaGame);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.headers.White).toBe('Paul Morphy');
    expect(result.value.moves).toHaveLength(33);
    expect(result.value.moves[0]).toMatchObject({ san: 'e4', uci: 'e2e4' });
    expect(result.value.initialFen).toBe(STANDARD_START_FEN);
  });

  it('supports games starting from a custom FEN', () => {
    const pgn = `[SetUp "1"]\n[FEN "4k3/8/8/8/8/8/4P3/4K3 w - - 0 1"]\n\n1. e4 Kd7 *`;
    const result = parsePgnGame(pgn);
    expect(result.ok && result.value.initialFen).toBe('4k3/8/8/8/8/8/4P3/4K3 w - - 0 1');
  });

  it('reports illegal moves clearly', () => {
    const result = parsePgnGame('1. e4 e5 2. Ke3 *');
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/Could not read the PGN/);
  });

  it('rejects empty input', () => {
    expect(parsePgnGame('')).toEqual({ ok: false, error: 'The PGN is empty.' });
  });
});

describe('parsePgnCollection', () => {
  it('keeps valid games and reports broken ones by number', () => {
    const collection = parsePgnCollection(`${shortGame}\n\n[Event "Broken"]\n\n1. e4 e4 *`);
    expect(collection.games).toHaveLength(1);
    expect(collection.errors[0]?.error).toMatch(/^Game 2:/);
    const [firstGame] = collection.games;
    expect(firstGame && describeImportedGame(firstGame, 0)).toBe('1. A vs B (0-1) · Casual');
  });
});

describe('validateFenInput', () => {
  it('accepts and normalizes valid FENs', () => {
    expect(validateFenInput(`  ${STANDARD_START_FEN}  `)).toEqual({
      ok: true,
      value: STANDARD_START_FEN,
    });
    expect(validateFenInput('4k3/8/8/8/8/8/8/4K3 w - -')).toEqual({
      ok: true,
      value: '4k3/8/8/8/8/8/8/4K3 w - - 0 1',
    });
  });

  it.each([
    ['', /paste a FEN/],
    ['rnbqkbnr/pppppppp/8/8 w', /6 space-separated fields/],
    ['rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR x KQkq - 0 1', /Invalid FEN/],
    ['4k3/8/8/8/8/8/8/8 w - - 0 1', /king/],
    ['4k3/8/8/8/8/8/4Q3/3K4 w - - 0 1', /not to move is in check/],
  ])('rejects %j with a clear message', (fen, message) => {
    const result = validateFenInput(fen);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(message);
  });
});

describe('buildPgn', () => {
  it('round-trips moves and headers', () => {
    const pgn = buildPgn({
      headers: { White: 'Alice', Black: 'Bob', Result: '0-1' },
      initialFen: STANDARD_START_FEN,
      movesUci: ['f2f3', 'e7e5', 'g2g4', 'd8h4'],
    });
    expect(pgn).toContain('[White "Alice"]');
    expect(pgn).toContain('2. g4 Qh4#');
    const parsed = parsePgnGame(pgn);
    expect(parsed.ok && parsed.value.moves.map((move) => move.uci)).toEqual([
      'f2f3',
      'e7e5',
      'g2g4',
      'd8h4',
    ]);
  });
});
