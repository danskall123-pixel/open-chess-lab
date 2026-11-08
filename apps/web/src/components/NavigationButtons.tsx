import { useEffect } from 'react';

export interface NavigationButtonsProps {
  ply: number;
  maxPly: number;
  onChange: (ply: number) => void;
  onFlip?: () => void;
}

function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
  );
}

export function useArrowKeys(onStep: (delta: number | 'start' | 'end') => void): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget(event.target)) return;
      const actions: Record<string, number | 'start' | 'end'> = {
        ArrowLeft: -1,
        ArrowRight: 1,
        ArrowUp: 'start',
        ArrowDown: 'end',
        Home: 'start',
        End: 'end',
      };
      const action = actions[event.key];
      if (action === undefined) return;
      event.preventDefault();
      onStep(action);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onStep]);
}

export function NavigationButtons({ ply, maxPly, onChange, onFlip }: NavigationButtonsProps) {
  return (
    <div className="nav-buttons">
      <button
        type="button"
        className="button"
        onClick={() => onChange(0)}
        disabled={ply === 0}
        aria-label="First move"
      >
        ⏮
      </button>
      <button
        type="button"
        className="button"
        onClick={() => onChange(Math.max(0, ply - 1))}
        disabled={ply === 0}
        aria-label="Previous move"
      >
        ◀
      </button>
      <button
        type="button"
        className="button"
        onClick={() => onChange(Math.min(maxPly, ply + 1))}
        disabled={ply >= maxPly}
        aria-label="Next move"
      >
        ▶
      </button>
      <button
        type="button"
        className="button"
        onClick={() => onChange(maxPly)}
        disabled={ply >= maxPly}
        aria-label="Last move"
      >
        ⏭
      </button>
      {onFlip && (
        <button type="button" className="button" onClick={onFlip} aria-label="Flip board">
          ⇅
        </button>
      )}
    </div>
  );
}
