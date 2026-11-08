import type { GameOutcome } from '@open-chess-lab/shared';
import { describeOutcome } from '@open-chess-lab/shared';

export function GameOverBanner({ outcome }: { outcome: GameOutcome | null }) {
  if (!outcome) return null;
  return <div className="result-banner">{describeOutcome(outcome)}</div>;
}
