import type { Glicko2Rating } from './glicko2.js';
import { updateGlicko2 } from './glicko2.js';
import type { Score } from './gameEnd.js';

export const PROVISIONAL_DEVIATION_THRESHOLD = 110;

export interface ExpectedRatingChanges {
  win: number;
  draw: number;
  loss: number;
}

export function isProvisional(deviation: number): boolean {
  return deviation > PROVISIONAL_DEVIATION_THRESHOLD;
}

export function formatRating(rating: number, deviation: number): string {
  return `${Math.round(rating)}${isProvisional(deviation) ? '?' : ''}`;
}

export function ratingAfterGame(
  player: Glicko2Rating,
  opponent: Glicko2Rating,
  score: Score,
): Glicko2Rating {
  return updateGlicko2(player, [{ opponent, score }]);
}

export function ratingDelta(before: Glicko2Rating, after: Glicko2Rating): number {
  return Math.round(after.rating) - Math.round(before.rating);
}

export function expectedRatingChanges(
  player: Glicko2Rating,
  opponent: Glicko2Rating,
): ExpectedRatingChanges {
  const deltaFor = (score: Score): number =>
    ratingDelta(player, ratingAfterGame(player, opponent, score));
  return { win: deltaFor(1), draw: deltaFor(0.5), loss: deltaFor(0) };
}
