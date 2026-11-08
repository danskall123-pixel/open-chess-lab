import { describe, expect, it } from 'vitest';
import { FIRST_MOVE_TIMEOUT_MS, LiveGame, RECONNECT_TIMEOUT_MS } from '../src/games/liveGame.js';
import type { PlayerIdentity } from '../src/players.js';

function player(name: string): PlayerIdentity {
  return { key: `user:${name}`, userId: name, guestId: name, name, role: 'user', marked: false };
}

function newGame(initialSeconds = 60, incrementSeconds = 0, rated = true): LiveGame {
  const rating = { rating: 1500, deviation: 80, volatility: 0.06 };
  return new LiveGame({
    id: 'game1',
    rated,
    timeControl: { initialSeconds, incrementSeconds },
    source: 'lobby',
    seats: { white: { player: player('alice'), rating }, black: { player: player('bob'), rating } },
    startedAt: 0,
  });
}

function playMoves(game: LiveGame, moves: Array<[string, number]>): void {
  for (const [uci, at] of moves) {
    const result = game.play(game.turn, uci, at);
    if (!result.ok) throw new Error(result.error);
  }
}

describe('LiveGame moves', () => {
  it('validates moves and turn order on the server', () => {
    const game = newGame();
    expect(game.play('black', 'e7e5', 100)).toEqual({ ok: false, error: 'It is not your turn.' });
    expect(game.play('white', 'e2e5', 100)).toEqual({ ok: false, error: 'Illegal move.' });
    expect(game.play('white', 'e2e4', 100)).toEqual({ ok: true });
    expect(game.sans).toEqual(['e4']);
    expect(game.turn).toBe('black');
  });

  it('ends the game on checkmate', () => {
    const game = newGame();
    playMoves(game, [
      ['f2f3', 1000],
      ['e7e5', 2000],
      ['g2g4', 3000],
      ['d8h4', 4000],
    ]);
    expect(game.status).toBe('finished');
    expect(game.outcome).toEqual({ winner: 'black', termination: 'checkmate' });
    expect(game.play('white', 'e2e4', 5000).ok).toBe(false);
  });
});

describe('LiveGame clocks', () => {
  it('starts the clock only after both sides have moved', () => {
    const game = newGame(60, 2);
    playMoves(game, [['e2e4', 5000]]);
    expect(game.clock.running).toBeNull();
    playMoves(game, [['e7e5', 9000]]);
    expect(game.clock.running).toBe('white');
    expect(game.remainingFor('white', 19_000)).toBe(50_000);
    expect(game.remainingFor('black', 19_000)).toBe(60_000);
  });

  it('applies increment and lag compensation on each move', () => {
    const game = newGame(60, 2);
    playMoves(game, [
      ['e2e4', 0],
      ['e7e5', 0],
    ]);
    expect(game.play('white', 'g1f3', 10_000, 200)).toEqual({ ok: true });
    expect(game.clock.remainingMs.white).toBe(60_000 - 9_800 + 2_000);
    expect(game.clock.running).toBe('black');
  });

  it('flags a player whose time runs out', () => {
    const game = newGame(60, 0);
    playMoves(game, [
      ['e2e4', 0],
      ['e7e5', 0],
    ]);
    expect(game.flagDeadline()).toBe(60_000);
    expect(game.expireIfDue(59_000)).toBe(false);
    expect(game.expireIfDue(60_000)).toBe(true);
    expect(game.outcome).toEqual({ winner: 'black', termination: 'timeout' });
    expect(game.remainingFor('white', 99_000)).toBe(0);
  });

  it('rejects a move that arrives after the flag fell', () => {
    const game = newGame(60, 0);
    playMoves(game, [
      ['e2e4', 0],
      ['e7e5', 0],
    ]);
    expect(game.play('white', 'g1f3', 61_000).ok).toBe(false);
    expect(game.outcome?.termination).toBe('timeout');
  });

  it('accepts a move that was in time thanks to lag compensation', () => {
    const game = newGame(60, 0);
    playMoves(game, [
      ['e2e4', 0],
      ['e7e5', 0],
    ]);
    expect(game.play('white', 'g1f3', 60_200, 300).ok).toBe(true);
    expect(game.isOngoing).toBe(true);
  });

  it('aborts the game when the first move is not made in time', () => {
    const game = newGame();
    expect(game.firstMoveDeadline()).toBe(FIRST_MOVE_TIMEOUT_MS);
    expect(game.expireIfDue(FIRST_MOVE_TIMEOUT_MS)).toBe(true);
    expect(game.status).toBe('aborted');
  });
});

describe('LiveGame draws, resignations and aborts', () => {
  it('allows aborting only before both sides moved', () => {
    const game = newGame();
    playMoves(game, [['e2e4', 0]]);
    expect(game.requestAbort(100)).toEqual({ ok: true });
    expect(game.status).toBe('aborted');

    const started = newGame();
    playMoves(started, [
      ['e2e4', 0],
      ['e7e5', 0],
    ]);
    expect(started.requestAbort(100).ok).toBe(false);
  });

  it('handles draw offers, acceptance and implicit decline by moving', () => {
    const game = newGame();
    playMoves(game, [
      ['e2e4', 0],
      ['e7e5', 0],
    ]);
    expect(game.offerDraw('white', 100)).toEqual({ ok: true });
    playMoves(game, [['g1f3', 200]]);
    expect(game.drawOfferBy).toBe('white');
    playMoves(game, [['b8c6', 300]]);
    expect(game.drawOfferBy).toBeNull();

    expect(game.offerDraw('black', 400).ok).toBe(true);
    expect(game.acceptDraw('white', 500)).toEqual({ ok: true });
    expect(game.outcome).toEqual({ winner: null, termination: 'agreement' });
  });

  it('records resignations', () => {
    const game = newGame();
    playMoves(game, [
      ['e2e4', 0],
      ['e7e5', 0],
    ]);
    game.resign('black', 100);
    expect(game.outcome).toEqual({ winner: 'white', termination: 'resignation' });
  });
});

describe('LiveGame disconnects', () => {
  it('lets the opponent claim the win after the reconnect timeout', () => {
    const game = newGame(600, 0);
    playMoves(game, [
      ['e2e4', 0],
      ['e7e5', 0],
    ]);
    game.setConnected('black', false, 1000);
    expect(game.view(1000).disconnected).toEqual({
      color: 'black',
      claimableInMs: RECONNECT_TIMEOUT_MS,
    });
    expect(game.claimVictory('white', 1000 + RECONNECT_TIMEOUT_MS - 1).ok).toBe(false);
    expect(game.claimVictory('white', 1000 + RECONNECT_TIMEOUT_MS)).toEqual({ ok: true });
    expect(game.outcome).toEqual({ winner: 'white', termination: 'abandonment' });
  });

  it('cancels the claim when the player reconnects', () => {
    const game = newGame(600, 0);
    playMoves(game, [
      ['e2e4', 0],
      ['e7e5', 0],
    ]);
    game.setConnected('black', false, 0);
    game.setConnected('black', true, 10_000);
    expect(game.claimVictory('white', RECONNECT_TIMEOUT_MS * 2).ok).toBe(false);
  });
});

describe('LiveGame view', () => {
  it('shows expected rating changes for rated games only', () => {
    expect(newGame().view(0).expectedChanges?.white.win).toBeGreaterThan(0);
    expect(newGame(60, 0, false).view(0).expectedChanges).toBeNull();
  });

  it('restores a game from stored progress', () => {
    const original = newGame(60, 1);
    playMoves(original, [
      ['e2e4', 0],
      ['e7e5', 1000],
      ['g1f3', 3000],
    ]);
    const restored = LiveGame.restore(original.init, {
      movesUci: original.movesUci,
      clock: original.clock,
      lastMoveAt: original.lastMoveTimestamp,
    });
    expect(restored.fen).toBe(original.fen);
    expect(restored.sans).toEqual(['e4', 'e5', 'Nf3']);
    expect(restored.remainingFor('black', 5000)).toBe(original.remainingFor('black', 5000));
  });
});
