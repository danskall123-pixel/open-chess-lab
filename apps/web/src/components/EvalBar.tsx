import type { Color, EngineScore } from '@open-chess-lab/shared';
import { formatScore, scoreToCentipawns, winPercent } from '@open-chess-lab/shared';

export function EvalBar({ score, orientation }: { score: EngineScore | null; orientation: Color }) {
  const whiteShare = score ? winPercent(scoreToCentipawns(score)) : 50;
  const label = score ? formatScore(score) : '…';
  return (
    <div
      className={`eval-bar ${orientation === 'black' ? 'flipped' : ''}`}
      aria-label={`Evaluation ${label}`}
    >
      <div className="eval-bar-white" style={{ height: `${whiteShare}%` }} />
      <span className={`eval-bar-label ${whiteShare >= 50 ? 'on-white' : 'on-black'}`}>
        {label}
      </span>
    </div>
  );
}
