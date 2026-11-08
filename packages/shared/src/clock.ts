import type { Color } from './color.js';
import { oppositeColor } from './color.js';
import type { TimeControl } from './timeControl.js';

export interface ClockState {
  remainingMs: Record<Color, number>;
  incrementMs: number;
  running: Color | null;
  turnStartedAt: number | null;
}

export const MAX_LAG_COMPENSATION_MS = 500;

export function createClock(timeControl: TimeControl): ClockState {
  const initialMs = timeControl.initialSeconds * 1000;
  return {
    remainingMs: { white: initialMs, black: initialMs },
    incrementMs: timeControl.incrementSeconds * 1000,
    running: null,
    turnStartedAt: null,
  };
}

export function startClock(clock: ClockState, color: Color, now: number): ClockState {
  return { ...clock, running: color, turnStartedAt: now };
}

function elapsedSinceTurnStart(clock: ClockState, now: number): number {
  if (clock.turnStartedAt === null) return 0;
  return Math.max(0, now - clock.turnStartedAt);
}

export function remainingMs(clock: ClockState, color: Color, now: number): number {
  const stored = clock.remainingMs[color];
  if (clock.running !== color) return Math.max(0, stored);
  return Math.max(0, stored - elapsedSinceTurnStart(clock, now));
}

export function flaggedColor(clock: ClockState, now: number): Color | null {
  if (clock.running === null) return null;
  return remainingMs(clock, clock.running, now) <= 0 ? clock.running : null;
}

export function msUntilFlag(clock: ClockState, now: number): number | null {
  if (clock.running === null) return null;
  return remainingMs(clock, clock.running, now);
}

export function boundedLagCompensation(lagMs: number): number {
  if (!Number.isFinite(lagMs) || lagMs <= 0) return 0;
  return Math.min(lagMs, MAX_LAG_COMPENSATION_MS);
}

export function pressClock(
  clock: ClockState,
  mover: Color,
  now: number,
  lagCompensationMs = 0,
): ClockState {
  if (clock.running !== mover) {
    throw new Error(`It is not ${mover}'s clock that is running`);
  }
  const elapsed = elapsedSinceTurnStart(clock, now);
  const credited = Math.min(elapsed, boundedLagCompensation(lagCompensationMs));
  const remainingAfterMove = clock.remainingMs[mover] - (elapsed - credited);
  return {
    ...clock,
    remainingMs: { ...clock.remainingMs, [mover]: remainingAfterMove + clock.incrementMs },
    running: oppositeColor(mover),
    turnStartedAt: now,
  };
}

export function stopClock(clock: ClockState, now: number): ClockState {
  if (clock.running === null) return clock;
  return {
    ...clock,
    remainingMs: { ...clock.remainingMs, [clock.running]: remainingMs(clock, clock.running, now) },
    running: null,
    turnStartedAt: null,
  };
}

export function snapshotClock(clock: ClockState, now: number): Record<Color, number> {
  return { white: remainingMs(clock, 'white', now), black: remainingMs(clock, 'black', now) };
}
