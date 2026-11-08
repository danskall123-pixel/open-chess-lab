import type { Color } from './color.js';
import { oppositeColor } from './color.js';

export type EngineScore = { kind: 'cp'; value: number } | { kind: 'mate'; value: number };

export type MoveClassification = 'best' | 'good' | 'inaccuracy' | 'mistake' | 'blunder';

export const MOVE_CLASSIFICATIONS: readonly MoveClassification[] = [
  'best',
  'good',
  'inaccuracy',
  'mistake',
  'blunder',
];

export const CENTIPAWN_CAP = 1000;

export const CLASSIFICATION_LIMITS = {
  best: 10,
  good: 50,
  inaccuracy: 100,
  mistake: 300,
} as const;

export interface PositionEvaluation {
  score: EngineScore;
  bestMoveUci: string | null;
}

export interface ReviewInput {
  firstMover: Color;
  movesUci: readonly string[];
  evaluations: readonly PositionEvaluation[];
}

export interface PlyReview {
  ply: number;
  mover: Color;
  playedUci: string;
  bestUci: string | null;
  evalBeforeCp: number;
  evalAfterCp: number;
  centipawnLoss: number;
  accuracy: number;
  classification: MoveClassification;
}

export interface GameReview {
  plies: PlyReview[];
  accuracy: Record<Color, number | null>;
  averageCentipawnLoss: Record<Color, number | null>;
  counts: Record<Color, Record<MoveClassification, number>>;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function scoreToCentipawns(score: EngineScore): number {
  if (score.kind === 'mate') return Math.sign(score.value || 1) * CENTIPAWN_CAP;
  return clamp(score.value, -CENTIPAWN_CAP, CENTIPAWN_CAP);
}

export function fromMoverPerspective(whiteCentipawns: number, mover: Color): number {
  return mover === 'white' ? whiteCentipawns : -whiteCentipawns;
}

export function centipawnLoss(evalBeforeCp: number, evalAfterCp: number, mover: Color): number {
  const before = fromMoverPerspective(evalBeforeCp, mover);
  const after = fromMoverPerspective(evalAfterCp, mover);
  return Math.max(0, Math.round(before - after));
}

export function classifyMove(loss: number, playedBestMove: boolean): MoveClassification {
  if (playedBestMove || loss <= CLASSIFICATION_LIMITS.best) return 'best';
  if (loss <= CLASSIFICATION_LIMITS.good) return 'good';
  if (loss <= CLASSIFICATION_LIMITS.inaccuracy) return 'inaccuracy';
  if (loss <= CLASSIFICATION_LIMITS.mistake) return 'mistake';
  return 'blunder';
}

export function winPercent(centipawns: number): number {
  return 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * centipawns)) - 1);
}

export function moveAccuracy(winPercentBefore: number, winPercentAfter: number): number {
  const drop = Math.max(0, winPercentBefore - winPercentAfter);
  return clamp(103.1668 * Math.exp(-0.04354 * drop) - 3.1669, 0, 100);
}

function emptyCounts(): Record<MoveClassification, number> {
  return { best: 0, good: 0, inaccuracy: 0, mistake: 0, blunder: 0 };
}

function average(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function roundToTenth(value: number | null): number | null {
  return value === null ? null : Math.round(value * 10) / 10;
}

export function reviewPly(
  ply: number,
  mover: Color,
  playedUci: string,
  before: PositionEvaluation,
  after: PositionEvaluation,
): PlyReview {
  const evalBeforeCp = scoreToCentipawns(before.score);
  const evalAfterCp = scoreToCentipawns(after.score);
  const loss = centipawnLoss(evalBeforeCp, evalAfterCp, mover);
  const accuracy = moveAccuracy(
    winPercent(fromMoverPerspective(evalBeforeCp, mover)),
    winPercent(fromMoverPerspective(evalAfterCp, mover)),
  );
  return {
    ply,
    mover,
    playedUci,
    bestUci: before.bestMoveUci,
    evalBeforeCp,
    evalAfterCp,
    centipawnLoss: loss,
    accuracy,
    classification: classifyMove(loss, before.bestMoveUci === playedUci),
  };
}

export function reviewGame(input: ReviewInput): GameReview {
  if (input.evaluations.length !== input.movesUci.length + 1) {
    throw new Error('Expected one evaluation per position, including the starting position');
  }
  const plies: PlyReview[] = [];
  let mover = input.firstMover;
  input.movesUci.forEach((playedUci, index) => {
    const before = input.evaluations[index];
    const after = input.evaluations[index + 1];
    if (before && after) plies.push(reviewPly(index, mover, playedUci, before, after));
    mover = oppositeColor(mover);
  });

  const summarize = (color: Color) => {
    const own = plies.filter((ply) => ply.mover === color);
    const counts = emptyCounts();
    own.forEach((ply) => {
      counts[ply.classification] += 1;
    });
    return {
      accuracy: roundToTenth(average(own.map((ply) => ply.accuracy))),
      averageCentipawnLoss: roundToTenth(average(own.map((ply) => ply.centipawnLoss))),
      counts,
    };
  };
  const white = summarize('white');
  const black = summarize('black');

  return {
    plies,
    accuracy: { white: white.accuracy, black: black.accuracy },
    averageCentipawnLoss: {
      white: white.averageCentipawnLoss,
      black: black.averageCentipawnLoss,
    },
    counts: { white: white.counts, black: black.counts },
  };
}

export function parseUciScore(kind: string, value: number, sideToMove: Color): EngineScore {
  const whiteValue = sideToMove === 'white' ? value : -value;
  return kind === 'mate' ? { kind: 'mate', value: whiteValue } : { kind: 'cp', value: whiteValue };
}

export function formatScore(score: EngineScore): string {
  if (score.kind === 'mate') {
    return `${score.value >= 0 ? '' : '-'}M${Math.abs(score.value)}`;
  }
  const pawns = score.value / 100;
  return `${pawns > 0 ? '+' : ''}${pawns.toFixed(1)}`;
}
