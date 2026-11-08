import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RATING,
  expectedRatingChanges,
  formatRating,
  isProvisional,
  ratingAfterGame,
  updateGlicko2,
} from '../src/index.js';

describe('updateGlicko2', () => {
  it('matches the worked example from Glickman’s paper', () => {
    const updated = updateGlicko2({ rating: 1500, deviation: 200, volatility: 0.06 }, [
      { opponent: { rating: 1400, deviation: 30 }, score: 1 },
      { opponent: { rating: 1550, deviation: 100 }, score: 0 },
      { opponent: { rating: 1700, deviation: 300 }, score: 0 },
    ]);
    expect(updated.rating).toBeCloseTo(1464.06, 1);
    expect(updated.deviation).toBeCloseTo(151.52, 1);
    expect(updated.volatility).toBeCloseTo(0.05999, 4);
  });

  it('only inflates the deviation when no games were played', () => {
    const player = { rating: 1700, deviation: 60, volatility: 0.06 };
    const updated = updateGlicko2(player, []);
    expect(updated.rating).toBe(1700);
    expect(updated.deviation).toBeGreaterThan(60);
  });

  it('never lets the deviation exceed the configured maximum', () => {
    const updated = updateGlicko2(DEFAULT_RATING, [
      { opponent: { rating: 1500, deviation: 350 }, score: 0.5 },
    ]);
    expect(updated.deviation).toBeLessThanOrEqual(350);
  });

  it('is zero-sum in direction for two equal players', () => {
    const winner = ratingAfterGame(DEFAULT_RATING, DEFAULT_RATING, 1);
    const loser = ratingAfterGame(DEFAULT_RATING, DEFAULT_RATING, 0);
    expect(winner.rating).toBeGreaterThan(1500);
    expect(loser.rating).toBeLessThan(1500);
    expect(winner.rating - 1500).toBeCloseTo(1500 - loser.rating, 6);
  });
});

describe('expected rating changes', () => {
  it('gains more for beating a stronger opponent', () => {
    const player = { rating: 1500, deviation: 80, volatility: 0.06 };
    const stronger = expectedRatingChanges(player, {
      rating: 1800,
      deviation: 80,
      volatility: 0.06,
    });
    const weaker = expectedRatingChanges(player, { rating: 1200, deviation: 80, volatility: 0.06 });
    expect(stronger.win).toBeGreaterThan(weaker.win);
    expect(stronger.loss).toBeGreaterThan(weaker.loss);
    expect(stronger.draw).toBeGreaterThan(0);
    expect(weaker.draw).toBeLessThan(0);
  });
});

describe('provisional ratings', () => {
  it('marks high-deviation ratings with a question mark', () => {
    expect(isProvisional(350)).toBe(true);
    expect(isProvisional(80)).toBe(false);
    expect(formatRating(1500.4, 350)).toBe('1500?');
    expect(formatRating(1712.6, 60)).toBe('1713');
  });
});
