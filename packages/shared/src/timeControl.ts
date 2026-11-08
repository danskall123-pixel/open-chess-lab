export type Speed = 'bullet' | 'blitz' | 'rapid' | 'classical';

export const SPEEDS: readonly Speed[] = ['bullet', 'blitz', 'rapid', 'classical'];

export interface TimeControl {
  initialSeconds: number;
  incrementSeconds: number;
}

const ESTIMATED_MOVES_PER_GAME = 40;
const BULLET_LIMIT_SECONDS = 180;
const BLITZ_LIMIT_SECONDS = 480;
const RAPID_LIMIT_SECONDS = 1500;
const MIN_INITIAL_SECONDS = 15;
const MAX_INITIAL_SECONDS = 3 * 60 * 60;
const MAX_INCREMENT_SECONDS = 180;

export const TIME_CONTROL_PRESETS: readonly TimeControl[] = [
  { initialSeconds: 60, incrementSeconds: 0 },
  { initialSeconds: 120, incrementSeconds: 1 },
  { initialSeconds: 180, incrementSeconds: 0 },
  { initialSeconds: 180, incrementSeconds: 2 },
  { initialSeconds: 300, incrementSeconds: 0 },
  { initialSeconds: 300, incrementSeconds: 3 },
  { initialSeconds: 600, incrementSeconds: 0 },
  { initialSeconds: 600, incrementSeconds: 5 },
  { initialSeconds: 900, incrementSeconds: 10 },
  { initialSeconds: 1800, incrementSeconds: 0 },
  { initialSeconds: 1800, incrementSeconds: 20 },
];

export function estimatedDurationSeconds(timeControl: TimeControl): number {
  return timeControl.initialSeconds + ESTIMATED_MOVES_PER_GAME * timeControl.incrementSeconds;
}

export function speedOf(timeControl: TimeControl): Speed {
  const duration = estimatedDurationSeconds(timeControl);
  if (duration < BULLET_LIMIT_SECONDS) return 'bullet';
  if (duration < BLITZ_LIMIT_SECONDS) return 'blitz';
  if (duration < RAPID_LIMIT_SECONDS) return 'rapid';
  return 'classical';
}

export function isValidTimeControl(timeControl: TimeControl): boolean {
  const { initialSeconds, incrementSeconds } = timeControl;
  return (
    Number.isInteger(initialSeconds) &&
    Number.isInteger(incrementSeconds) &&
    initialSeconds >= MIN_INITIAL_SECONDS &&
    initialSeconds <= MAX_INITIAL_SECONDS &&
    incrementSeconds >= 0 &&
    incrementSeconds <= MAX_INCREMENT_SECONDS
  );
}

export function timeControlKey(timeControl: TimeControl): string {
  return `${timeControl.initialSeconds}+${timeControl.incrementSeconds}`;
}

export function parseTimeControlKey(key: string): TimeControl | null {
  const match = /^(\d+)\+(\d+)$/.exec(key);
  if (!match) return null;
  const timeControl = { initialSeconds: Number(match[1]), incrementSeconds: Number(match[2]) };
  return isValidTimeControl(timeControl) ? timeControl : null;
}

function formatMinutes(seconds: number): string {
  const minutes = seconds / 60;
  if (Number.isInteger(minutes)) return String(minutes);
  if (seconds === 15) return '¼';
  if (seconds === 30) return '½';
  if (seconds === 45) return '¾';
  return minutes.toFixed(1);
}

export function formatTimeControl(timeControl: TimeControl): string {
  return `${formatMinutes(timeControl.initialSeconds)}+${timeControl.incrementSeconds}`;
}

export function isSpeed(value: unknown): value is Speed {
  return typeof value === 'string' && (SPEEDS as readonly string[]).includes(value);
}
