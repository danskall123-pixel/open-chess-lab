export interface QueueEntry {
  id: string;
  rating: number;
  joinedAt: number;
}

export interface PairingOptions {
  initialRange: number;
  widenPerSecond: number;
  maxRange: number;
}

export const DEFAULT_PAIRING_OPTIONS: PairingOptions = {
  initialRange: 100,
  widenPerSecond: 15,
  maxRange: 800,
};

export function allowedRatingRange(
  entry: QueueEntry,
  now: number,
  options: PairingOptions = DEFAULT_PAIRING_OPTIONS,
): number {
  const waitedSeconds = Math.max(0, now - entry.joinedAt) / 1000;
  return Math.min(options.maxRange, options.initialRange + waitedSeconds * options.widenPerSecond);
}

export function areCompatible(
  first: QueueEntry,
  second: QueueEntry,
  now: number,
  options: PairingOptions = DEFAULT_PAIRING_OPTIONS,
): boolean {
  if (first.id === second.id) return false;
  const gap = Math.abs(first.rating - second.rating);
  return (
    gap <= allowedRatingRange(first, now, options) &&
    gap <= allowedRatingRange(second, now, options)
  );
}

export function findPairs<T extends QueueEntry>(
  entries: readonly T[],
  now: number,
  options: PairingOptions = DEFAULT_PAIRING_OPTIONS,
): Array<[T, T]> {
  const byWaitTime = [...entries].sort((a, b) => a.joinedAt - b.joinedAt);
  const paired = new Set<string>();
  const pairs: Array<[T, T]> = [];

  for (const entry of byWaitTime) {
    if (paired.has(entry.id)) continue;
    let bestCandidate: T | null = null;
    for (const candidate of byWaitTime) {
      if (paired.has(candidate.id) || !areCompatible(entry, candidate, now, options)) continue;
      const gap = Math.abs(candidate.rating - entry.rating);
      if (bestCandidate === null || gap < Math.abs(bestCandidate.rating - entry.rating)) {
        bestCandidate = candidate;
      }
    }
    if (bestCandidate !== null) {
      paired.add(entry.id);
      paired.add(bestCandidate.id);
      pairs.push([entry, bestCandidate]);
    }
  }
  return pairs;
}

export function isWithinSeekRange(
  rating: number,
  range: { min: number | null; max: number | null },
): boolean {
  if (range.min !== null && rating < range.min) return false;
  if (range.max !== null && rating > range.max) return false;
  return true;
}
