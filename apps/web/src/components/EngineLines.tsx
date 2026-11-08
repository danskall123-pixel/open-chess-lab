import type { EngineLine } from '../engine/uci';
import { formatPvLine } from '../engine/uci';
import { formatScore } from '@open-chess-lab/shared';

export interface EngineLinesProps {
  fen: string;
  lines: readonly EngineLine[];
  onPlay: (uci: string) => void;
}

export function EngineLines({ fen, lines, onPlay }: EngineLinesProps) {
  if (lines.length === 0) return <div className="engine-lines empty-state">Calculating…</div>;
  return (
    <div className="engine-lines">
      <div className="engine-depth">Depth {Math.max(...lines.map((line) => line.depth))}</div>
      {lines.map((line) => (
        <button
          key={line.multipv}
          type="button"
          className="engine-line"
          onClick={() => line.pv[0] && onPlay(line.pv[0])}
          title="Play the first move of this line"
        >
          <span className="engine-score">{formatScore(line.score)}</span>
          <span className="engine-pv">{formatPvLine(fen, line.pv, 12)}</span>
        </button>
      ))}
    </div>
  );
}
