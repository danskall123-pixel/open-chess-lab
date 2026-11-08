import type { FastifyBaseLogger } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import type { Color } from '@open-chess-lab/shared';
import { computeFairPlayMetrics, isSuspicious } from '@open-chess-lab/shared';
import type { FinishedGameListener } from '../games/gameManager.js';
import type { LiveGame } from '../games/liveGame.js';
import { analyzeGame } from './analyzer.js';
import { UciEngine } from './uciEngine.js';

export interface FairPlayOptions {
  enabled: boolean;
  depth: number;
  enginePath: string | undefined;
}

const MIN_PLIES_FOR_ANALYSIS = 30;
const ENGINE_IDLE_MS = 60_000;
const BACKLOG_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export class FairPlayService implements FinishedGameListener {
  private readonly queue: string[] = [];
  private running = false;
  private engine: UciEngine | null = null;
  private idleTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly logger: FastifyBaseLogger,
    private readonly options: FairPlayOptions,
  ) {}

  onGameFinished(game: LiveGame): void {
    if (game.rated && game.movesUci.length >= MIN_PLIES_FOR_ANALYSIS) this.enqueue(game.id);
  }

  async enqueueBacklog(): Promise<void> {
    if (!this.options.enabled) return;
    const pending = await this.prisma.game.findMany({
      where: {
        rated: true,
        status: 'finished',
        fairPlayCheckedAt: null,
        endedAt: { gte: new Date(Date.now() - BACKLOG_WINDOW_MS) },
      },
      select: { id: true, moves: true },
    });
    pending
      .filter((game) => game.moves.split(' ').length >= MIN_PLIES_FOR_ANALYSIS)
      .forEach((game) => this.enqueue(game.id));
  }

  enqueue(gameId: string): void {
    if (!this.options.enabled || this.queue.includes(gameId)) return;
    this.queue.push(gameId);
    void this.drain();
  }

  stop(): void {
    this.queue.length = 0;
    this.releaseEngine();
  }

  private async drain(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      for (let gameId = this.queue.shift(); gameId; gameId = this.queue.shift()) {
        await this.check(gameId).catch((error: unknown) =>
          this.logger.error({ err: error, gameId }, 'Fair play check failed'),
        );
      }
    } finally {
      this.running = false;
      this.scheduleEngineRelease();
    }
  }

  private async check(gameId: string): Promise<void> {
    const game = await this.prisma.game.findUnique({ where: { id: gameId } });
    if (!game || game.fairPlayCheckedAt) return;
    const engine = await this.acquireEngine();
    const review = await analyzeGame(game.initialFen, game.moves.split(' '), {
      evaluate: (fen) => engine.evaluate(fen, this.options.depth),
    });
    const players: Array<[Color, string | null]> = [
      ['white', game.whiteUserId],
      ['black', game.blackUserId],
    ];
    for (const [color, userId] of players) {
      if (!userId) continue;
      const metrics = computeFairPlayMetrics(review, color);
      if (!isSuspicious(metrics)) continue;
      await this.prisma.fairPlayFlag.upsert({
        where: { gameId_userId: { gameId, userId } },
        create: { gameId, userId, color, ...metrics },
        update: { ...metrics },
      });
      this.logger.warn({ gameId, userId, metrics }, 'Flagged suspicious accuracy');
    }
    await this.prisma.game.update({
      where: { id: gameId },
      data: { fairPlayCheckedAt: new Date() },
    });
  }

  private async acquireEngine(): Promise<UciEngine> {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = null;
    this.engine ??= await UciEngine.start(this.options.enginePath);
    return this.engine;
  }

  private scheduleEngineRelease(): void {
    if (!this.engine) return;
    this.idleTimer = setTimeout(() => this.releaseEngine(), ENGINE_IDLE_MS);
    this.idleTimer.unref();
  }

  private releaseEngine(): void {
    this.engine?.quit();
    this.engine = null;
  }
}
