import { describe, expect, it } from 'vitest';
import { allowedRatingRange, areCompatible, findPairs, isWithinSeekRange } from '../src/index.js';

const options = { initialRange: 100, widenPerSecond: 10, maxRange: 400 };

describe('allowedRatingRange', () => {
  it('widens the longer a player waits, up to a maximum', () => {
    const entry = { id: 'a', rating: 1500, joinedAt: 0 };
    expect(allowedRatingRange(entry, 0, options)).toBe(100);
    expect(allowedRatingRange(entry, 10_000, options)).toBe(200);
    expect(allowedRatingRange(entry, 600_000, options)).toBe(400);
  });
});

describe('areCompatible', () => {
  it('requires both players to accept the gap', () => {
    const veteran = { id: 'a', rating: 1500, joinedAt: 0 };
    const newcomer = { id: 'b', rating: 1650, joinedAt: 20_000 };
    expect(areCompatible(veteran, newcomer, 20_000, options)).toBe(false);
    expect(areCompatible(veteran, newcomer, 25_000, options)).toBe(true);
  });

  it('never pairs a player with themselves', () => {
    const entry = { id: 'a', rating: 1500, joinedAt: 0 };
    expect(areCompatible(entry, entry, 0, options)).toBe(false);
  });
});

describe('findPairs', () => {
  it('pairs the closest ratings and prioritizes the longest waiting player', () => {
    const entries = [
      { id: 'late', rating: 1520, joinedAt: 5000 },
      { id: 'first', rating: 1500, joinedAt: 0 },
      { id: 'closest', rating: 1505, joinedAt: 4000 },
      { id: 'far', rating: 2100, joinedAt: 1000 },
    ];
    const pairs = findPairs(entries, 5000, options).map(([a, b]) => [a.id, b.id]);
    expect(pairs).toEqual([['first', 'closest']]);
  });

  it('pairs everyone when ranges allow it and leaves odd players waiting', () => {
    const entries = [
      { id: 'a', rating: 1200, joinedAt: 0 },
      { id: 'b', rating: 1250, joinedAt: 0 },
      { id: 'c', rating: 1800, joinedAt: 0 },
      { id: 'd', rating: 1830, joinedAt: 0 },
      { id: 'e', rating: 2500, joinedAt: 0 },
    ];
    const pairs = findPairs(entries, 0, options);
    expect(pairs).toHaveLength(2);
    const pairedIds = pairs.flat().map((entry) => entry.id);
    expect(pairedIds).not.toContain('e');
  });

  it('eventually pairs distant players after a long wait', () => {
    const entries = [
      { id: 'a', rating: 1200, joinedAt: 0 },
      { id: 'b', rating: 1550, joinedAt: 0 },
    ];
    expect(findPairs(entries, 1000, options)).toHaveLength(0);
    expect(findPairs(entries, 30_000, options)).toHaveLength(1);
  });

  it('returns no pairs for an empty or single-player queue', () => {
    expect(findPairs([], 0, options)).toEqual([]);
    expect(findPairs([{ id: 'a', rating: 1500, joinedAt: 0 }], 0, options)).toEqual([]);
  });
});

describe('isWithinSeekRange', () => {
  it('respects optional bounds', () => {
    expect(isWithinSeekRange(1500, { min: null, max: null })).toBe(true);
    expect(isWithinSeekRange(1500, { min: 1600, max: null })).toBe(false);
    expect(isWithinSeekRange(1500, { min: 1400, max: 1500 })).toBe(true);
    expect(isWithinSeekRange(1501, { min: 1400, max: 1500 })).toBe(false);
  });
});
