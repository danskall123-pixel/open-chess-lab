export interface HandoffGame {
  initialFen: string;
  movesUci: string[];
  headers: Record<string, string>;
  startPly?: number;
}

const STORAGE_KEY = 'ocl:handoff-game';

export const IMPORTED_GAME_ID = 'imported';

export function storeHandoffGame(game: HandoffGame): void {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(game));
  } catch {
    window.name = JSON.stringify(game);
  }
}

function isHandoffGame(value: unknown): value is HandoffGame {
  return (
    typeof value === 'object' &&
    value !== null &&
    'initialFen' in value &&
    typeof value.initialFen === 'string' &&
    'movesUci' in value &&
    Array.isArray(value.movesUci)
  );
}

export function loadHandoffGame(): HandoffGame | null {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY) ?? window.name;
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return isHandoffGame(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
