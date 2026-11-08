import { describe, expect, it } from 'vitest';
import {
  centipawnLoss,
  classifyMove,
  computeFairPlayMetrics,
  formatScore,
  isSuspicious,
  moveAccuracy,
  parseUciScore,
  reviewGame,
  scoreToCentipawns,
  winPercent,
} from '../src/index.js';
import type { PositionEvaluation } from '../src/index.js';

const cp = (value: number, bestMoveUci: string | null = null): PositionEvaluation => ({
  score: { kind: 'cp', value },
  bestMoveUci,
});

describe('classifyMove', () => {
  it.each([
    [0, false, 'best'],
    [10, false, 'best'],
    [35, false, 'good'],
    [80, false, 'inaccuracy'],
    [200, false, 'mistake'],
    [301, false, 'blunder'],
    [900, true, 'best'],
  ] as const)('classifies a loss of %i (best move: %s) as %s', (loss, isBest, expected) => {
    expect(classifyMove(loss, isBest)).toBe(expected);
  });
});

describe('centipawn loss', () => {
  it('is measured from the mover’s point of view', () => {
    expect(centipawnLoss(50, -100, 'white')).toBe(150);
    expect(centipawnLoss(50, -100, 'black')).toBe(0);
    expect(centipawnLoss(-20, 180, 'black')).toBe(200);
  });

  it('caps mate scores so lost positions do not explode', () => {
    expect(scoreToCentipawns({ kind: 'mate', value: 3 })).toBe(1000);
    expect(scoreToCentipawns({ kind: 'mate', value: -2 })).toBe(-1000);
    expect(scoreToCentipawns({ kind: 'cp', value: 4000 })).toBe(1000);
  });

  it('converts UCI scores to White’s point of view', () => {
    expect(parseUciScore('cp', 35, 'black')).toEqual({ kind: 'cp', value: -35 });
    expect(parseUciScore('mate', 2, 'white')).toEqual({ kind: 'mate', value: 2 });
    expect(formatScore({ kind: 'cp', value: 135 })).toBe('+1.4');
    expect(formatScore({ kind: 'mate', value: -4 })).toBe('-M4');
  });
});

describe('accuracy', () => {
  it('is 50% win chance for an equal position and perfect for no loss', () => {
    expect(winPercent(0)).toBeCloseTo(50);
    expect(moveAccuracy(60, 60)).toBeCloseTo(100, 0);
    expect(moveAccuracy(60, 20)).toBeLessThan(30);
  });
});

describe('reviewGame', () => {
  const review = reviewGame({
    firstMover: 'white',
    movesUci: ['e2e4', 'e7e5', 'd1h5', 'g8f6'],
    evaluations: [cp(20, 'e2e4'), cp(25, 'e7e5'), cp(30, 'g1f3'), cp(-10, 'b8c6'), cp(500, 'h5e5')],
  });

  it('classifies each ply and remembers the better move', () => {
    expect(review.plies.map((ply) => ply.classification)).toEqual([
      'best',
      'best',
      'good',
      'blunder',
    ]);
    expect(review.plies[3]?.bestUci).toBe('b8c6');
    expect(review.plies[1]?.mover).toBe('black');
  });

  it('summarizes accuracy, average loss and counts per player', () => {
    expect(review.counts.black.blunder).toBe(1);
    expect(review.averageCentipawnLoss.white).toBe(20);
    expect(review.averageCentipawnLoss.black).toBe(257.5);
    expect(review.accuracy.white ?? 0).toBeGreaterThan(review.accuracy.black ?? 0);
  });

  it('requires one evaluation per position', () => {
    expect(() =>
      reviewGame({ firstMover: 'white', movesUci: ['e2e4'], evaluations: [cp(0)] }),
    ).toThrow();
  });
});

describe('fair play metrics', () => {
  it('flags games where nearly every move matches the engine', () => {
    const moves = Array.from({ length: 80 }, (_, index) => `m${index}`);
    const evaluations = [...moves.map((move) => cp(10, move)), cp(10)];
    const review = reviewGame({ firstMover: 'white', movesUci: moves, evaluations });
    const metrics = computeFairPlayMetrics(review, 'white');
    expect(metrics.analyzedMoves).toBe(32);
    expect(metrics.topMoveRate).toBe(1);
    expect(isSuspicious(metrics)).toBe(true);
  });

  it('does not flag short or human-looking games', () => {
    expect(
      isSuspicious({
        analyzedMoves: 10,
        topMoveMatches: 10,
        topMoveRate: 1,
        averageCentipawnLoss: 0,
      }),
    ).toBe(false);
    expect(
      isSuspicious({
        analyzedMoves: 40,
        topMoveMatches: 24,
        topMoveRate: 0.6,
        averageCentipawnLoss: 45,
      }),
    ).toBe(false);
  });
});
