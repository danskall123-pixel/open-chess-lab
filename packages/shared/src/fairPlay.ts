import type { Color } from './color.js';
import type { GameReview } from './review.js';
import { fromMoverPerspective } from './review.js';

export interface FairPlayThresholds {
  openingPliesSkipped: number;
  decidedPositionCp: number;
  minAnalyzedMoves: number;
  suspiciousTopMoveRate: number;
  suspiciousAverageLoss: number;
}

export const DEFAULT_FAIR_PLAY_THRESHOLDS: FairPlayThresholds = {
  openingPliesSkipped: 16,
  decidedPositionCp: 500,
  minAnalyzedMoves: 20,
  suspiciousTopMoveRate: 0.9,
  suspiciousAverageLoss: 15,
};

export interface FairPlayMetrics {
  analyzedMoves: number;
  topMoveMatches: number;
  topMoveRate: number;
  averageCentipawnLoss: number;
}

export function computeFairPlayMetrics(
  review: GameReview,
  color: Color,
  thresholds: FairPlayThresholds = DEFAULT_FAIR_PLAY_THRESHOLDS,
): FairPlayMetrics {
  const relevant = review.plies.filter(
    (ply) =>
      ply.mover === color &&
      ply.ply >= thresholds.openingPliesSkipped &&
      Math.abs(fromMoverPerspective(ply.evalBeforeCp, color)) < thresholds.decidedPositionCp,
  );
  const topMoveMatches = relevant.filter((ply) => ply.playedUci === ply.bestUci).length;
  const totalLoss = relevant.reduce((sum, ply) => sum + ply.centipawnLoss, 0);
  const analyzedMoves = relevant.length;
  return {
    analyzedMoves,
    topMoveMatches,
    topMoveRate: analyzedMoves === 0 ? 0 : topMoveMatches / analyzedMoves,
    averageCentipawnLoss: analyzedMoves === 0 ? 0 : totalLoss / analyzedMoves,
  };
}

export function isSuspicious(
  metrics: FairPlayMetrics,
  thresholds: FairPlayThresholds = DEFAULT_FAIR_PLAY_THRESHOLDS,
): boolean {
  return (
    metrics.analyzedMoves >= thresholds.minAnalyzedMoves &&
    metrics.topMoveRate >= thresholds.suspiciousTopMoveRate &&
    metrics.averageCentipawnLoss <= thresholds.suspiciousAverageLoss
  );
}
