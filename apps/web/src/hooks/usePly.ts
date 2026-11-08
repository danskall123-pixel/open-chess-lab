import { useCallback, useState } from 'react';
import { useArrowKeys } from '../components/NavigationButtons';

export function usePly(maxPly: number, followLatest = true) {
  const [ply, setPly] = useState(maxPly);
  const [trackedMax, setTrackedMax] = useState(maxPly);

  if (trackedMax !== maxPly) {
    setTrackedMax(maxPly);
    setPly(followLatest && ply === trackedMax ? maxPly : Math.min(ply, maxPly));
  }

  const step = useCallback(
    (delta: number | 'start' | 'end') => {
      setPly((current) => {
        if (delta === 'start') return 0;
        if (delta === 'end') return maxPly;
        return Math.min(maxPly, Math.max(0, current + delta));
      });
    },
    [maxPly],
  );
  useArrowKeys(step);

  return [ply, setPly] as const;
}
