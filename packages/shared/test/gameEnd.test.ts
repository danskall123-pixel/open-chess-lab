import { Chess } from 'chess.js';
import { describe, expect, it } from 'vitest';
import {
  describeOutcome,
  detectPositionOutcome,
  hasMatingMaterial,
  replayUciMoves,
  resultOf,
  scoreFor,
  STANDARD_START_FEN,
  timeoutOutcome,
} from '../src/index.js';

function playSan(moves: string[], fen?: string): Chess {
  const chess = new Chess(fen);
  moves.forEach((move) => chess.move(move));
  return chess;
}

describe('detectPositionOutcome', () => {
  it('returns null for an ongoing game', () => {
    expect(detectPositionOutcome(new Chess())).toBeNull();
  });

  it('detects checkmate and the winner', () => {
    const chess = playSan(['f3', 'e5', 'g4', 'Qh4#']);
    expect(detectPositionOutcome(chess)).toEqual({ winner: 'black', termination: 'checkmate' });
  });

  it('detects stalemate', () => {
    const chess = new Chess('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1');
    expect(detectPositionOutcome(chess)).toEqual({ winner: null, termination: 'stalemate' });
  });

  it('detects insufficient material', () => {
    const chess = new Chess('8/8/4k3/8/8/3NK3/8/8 w - - 0 1');
    expect(detectPositionOutcome(chess)?.termination).toBe('insufficient-material');
  });

  it('detects threefold repetition', () => {
    const chess = replayUciMoves(STANDARD_START_FEN, [
      'g1f3',
      'g8f6',
      'f3g1',
      'f6g8',
      'g1f3',
      'g8f6',
      'f3g1',
      'f6g8',
    ]);
    expect(detectPositionOutcome(chess)?.termination).toBe('threefold-repetition');
  });

  it('detects the fifty-move rule', () => {
    const chess = new Chess('8/8/4k3/8/8/4K3/4R3/8 w - - 99 80');
    chess.move('Ra2');
    expect(detectPositionOutcome(chess)?.termination).toBe('fifty-move-rule');
  });
});

describe('timeouts', () => {
  it('awards the win when the opponent has mating material', () => {
    const chess = new Chess('8/8/4k3/8/8/4K3/4R3/8 w - - 0 1');
    expect(timeoutOutcome(chess, 'black')).toEqual({ winner: 'white', termination: 'timeout' });
  });

  it('is a draw when the opponent cannot possibly mate', () => {
    const chess = new Chess('8/8/4k3/8/8/4K3/4R3/8 w - - 0 1');
    expect(timeoutOutcome(chess, 'white')).toEqual({
      winner: null,
      termination: 'timeout-vs-insufficient-material',
    });
  });

  it('treats a lone minor piece against a bare king as insufficient', () => {
    const chess = new Chess('8/8/4k3/8/8/4K3/4B3/8 w - - 0 1');
    expect(hasMatingMaterial(chess, 'white')).toBe(false);
    const withPawn = new Chess('8/4p3/4k3/8/8/4K3/4B3/8 w - - 0 1');
    expect(hasMatingMaterial(withPawn, 'white')).toBe(true);
  });
});

describe('results', () => {
  it('maps outcomes to results and scores', () => {
    const whiteWin = { winner: 'white' as const, termination: 'resignation' as const };
    const draw = { winner: null, termination: 'agreement' as const };
    expect(resultOf(whiteWin)).toBe('1-0');
    expect(resultOf(draw)).toBe('1/2-1/2');
    expect(scoreFor(whiteWin, 'black')).toBe(0);
    expect(scoreFor(draw, 'black')).toBe(0.5);
    expect(describeOutcome(whiteWin)).toBe('White wins · Resignation');
  });
});
