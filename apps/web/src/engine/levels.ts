export interface EngineLevel {
  level: number;
  skillLevel: number;
  depth: number;
  movetimeMs: number;
}

const SKILLS = [0, 3, 6, 9, 12, 15, 18, 20];
const DEPTHS = [1, 2, 4, 6, 8, 12, 16, 20];
const MOVE_TIMES_MS = [50, 100, 150, 250, 400, 700, 1000, 1500];

export const ENGINE_LEVELS: readonly EngineLevel[] = SKILLS.map((skillLevel, index) => ({
  level: index + 1,
  skillLevel,
  depth: DEPTHS[index] ?? 20,
  movetimeMs: MOVE_TIMES_MS[index] ?? 1500,
}));

const FALLBACK_LEVEL: EngineLevel = { level: 1, skillLevel: 0, depth: 1, movetimeMs: 50 };

export function engineLevel(level: number): EngineLevel {
  const index = Math.min(ENGINE_LEVELS.length, Math.max(1, level)) - 1;
  return ENGINE_LEVELS[index] ?? FALLBACK_LEVEL;
}
