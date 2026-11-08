import { useEffect, useState } from 'react';
import { engine } from '../engine/stockfish';
import type { EngineLine } from '../engine/uci';

const UPDATE_INTERVAL_MS = 150;
const ANALYSIS_DEPTH = 22;

export function useAnalysis(fen: string, enabled: boolean, multiPv = 3): EngineLine[] {
  const [lines, setLines] = useState<EngineLine[]>([]);

  useEffect(() => {
    setLines([]);
    if (!enabled) return;
    const controller = new AbortController();
    let lastUpdate = 0;
    void engine
      .search({
        fen,
        depth: ANALYSIS_DEPTH,
        multiPv,
        signal: controller.signal,
        onUpdate: (update) => {
          const now = performance.now();
          if (controller.signal.aborted || now - lastUpdate < UPDATE_INTERVAL_MS) return;
          lastUpdate = now;
          setLines(update);
        },
      })
      .then((result) => {
        if (!controller.signal.aborted) setLines(result.lines);
      });
    return () => controller.abort();
  }, [fen, enabled, multiPv]);

  return lines;
}
