import { describe, expect, it } from 'vitest';
import {
  MAX_LAG_COMPENSATION_MS,
  createClock,
  flaggedColor,
  msUntilFlag,
  pressClock,
  remainingMs,
  snapshotClock,
  startClock,
  stopClock,
} from '../src/index.js';

const threePlusTwo = { initialSeconds: 180, incrementSeconds: 2 };

describe('server clock', () => {
  it('starts with the full initial time and no running side', () => {
    const clock = createClock(threePlusTwo);
    expect(snapshotClock(clock, 0)).toEqual({ white: 180_000, black: 180_000 });
    expect(clock.running).toBeNull();
    expect(flaggedColor(clock, 1_000_000)).toBeNull();
  });

  it('only counts down the running side', () => {
    const clock = startClock(createClock(threePlusTwo), 'white', 1000);
    expect(remainingMs(clock, 'white', 6000)).toBe(175_000);
    expect(remainingMs(clock, 'black', 6000)).toBe(180_000);
  });

  it('deducts the think time, adds the increment and switches sides', () => {
    const clock = startClock(createClock(threePlusTwo), 'white', 0);
    const afterMove = pressClock(clock, 'white', 10_000);
    expect(afterMove.remainingMs.white).toBe(172_000);
    expect(afterMove.running).toBe('black');
    expect(afterMove.turnStartedAt).toBe(10_000);
  });

  it('credits lag compensation up to the maximum', () => {
    const clock = startClock(createClock(threePlusTwo), 'white', 0);
    expect(pressClock(clock, 'white', 10_000, 300).remainingMs.white).toBe(172_300);
    expect(pressClock(clock, 'white', 10_000, 5000).remainingMs.white).toBe(
      172_000 + MAX_LAG_COMPENSATION_MS,
    );
    expect(pressClock(clock, 'white', 100, 5000).remainingMs.white).toBe(182_000);
  });

  it('ignores negative or invalid lag values', () => {
    const clock = startClock(createClock(threePlusTwo), 'white', 0);
    expect(pressClock(clock, 'white', 1000, -50).remainingMs.white).toBe(181_000);
    expect(pressClock(clock, 'white', 1000, Number.NaN).remainingMs.white).toBe(181_000);
  });

  it('refuses to press the clock of the side that is not running', () => {
    const clock = startClock(createClock(threePlusTwo), 'white', 0);
    expect(() => pressClock(clock, 'black', 1000)).toThrow();
  });

  it('flags the running side when its time is up', () => {
    const clock = startClock(createClock({ initialSeconds: 60, incrementSeconds: 0 }), 'black', 0);
    expect(flaggedColor(clock, 59_999)).toBeNull();
    expect(msUntilFlag(clock, 59_000)).toBe(1000);
    expect(flaggedColor(clock, 60_000)).toBe('black');
    expect(remainingMs(clock, 'black', 90_000)).toBe(0);
  });

  it('freezes the remaining time when stopped', () => {
    const clock = startClock(createClock(threePlusTwo), 'white', 0);
    const stopped = stopClock(clock, 30_000);
    expect(stopped.running).toBeNull();
    expect(remainingMs(stopped, 'white', 999_999)).toBe(150_000);
  });
});
