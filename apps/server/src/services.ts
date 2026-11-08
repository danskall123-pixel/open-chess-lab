import type { PrismaClient } from '@prisma/client';
import type { FastifyBaseLogger } from 'fastify';
import type { AppConfig } from './config.js';
import { SessionService } from './auth/sessionService.js';
import { FairPlayService } from './fairplay/fairPlayService.js';
import { GameManager } from './games/gameManager.js';
import { GameRepository } from './games/gameRepository.js';
import { SeekService } from './lobby/seekService.js';
import { SeekStore } from './lobby/seekStore.js';
import type { Mailer } from './mail/mailer.js';
import { LogMailer, SmtpMailer } from './mail/mailer.js';
import { Matchmaker } from './matchmaking/matchmaker.js';
import { ModerationService } from './moderation/moderationService.js';
import { RatingService } from './ratings/ratingService.js';
import { Hub } from './realtime/hub.js';
import type { Redis } from './redis.js';

export interface Services {
  config: AppConfig;
  prisma: PrismaClient;
  redis: Redis;
  logger: FastifyBaseLogger;
  sessions: SessionService;
  hub: Hub;
  ratings: RatingService;
  games: GameManager;
  gameRepository: GameRepository;
  seeks: SeekService;
  matchmaker: Matchmaker;
  fairPlay: FairPlayService;
  moderation: ModerationService;
  mailer: Mailer;
}

export function createServices(
  config: AppConfig,
  prisma: PrismaClient,
  redis: Redis,
  logger: FastifyBaseLogger,
): Services {
  const hub = new Hub();
  const ratings = new RatingService(prisma);
  const gameRepository = new GameRepository(prisma);
  const games = new GameManager({
    repository: gameRepository,
    ratings,
    hub,
    logger,
    appOrigin: config.APP_ORIGIN,
  });
  const fairPlay = new FairPlayService(prisma, logger, {
    enabled: config.FAIR_PLAY_ENABLED,
    depth: config.FAIR_PLAY_DEPTH,
    enginePath: config.STOCKFISH_PATH,
  });
  games.addFinishedListener(fairPlay);

  const cleanUpAfterStart = async (playerKeys: string[]) => {
    await seeks.removePublicSeeksOf(playerKeys);
    for (const key of playerKeys) await matchmaker.leave(key);
  };
  const seeks: SeekService = new SeekService({
    store: new SeekStore(redis),
    games,
    ratings,
    hub,
    onGameStarted: cleanUpAfterStart,
  });
  const matchmaker: Matchmaker = new Matchmaker({
    redis,
    games,
    ratings,
    hub,
    logger,
    onGameStarted: cleanUpAfterStart,
  });

  return {
    config,
    prisma,
    redis,
    logger,
    sessions: new SessionService(prisma, config),
    hub,
    ratings,
    games,
    gameRepository,
    seeks,
    matchmaker,
    fairPlay,
    moderation: new ModerationService(prisma, ratings),
    mailer: config.SMTP_URL
      ? new SmtpMailer(config.SMTP_URL, config.MAIL_FROM)
      : new LogMailer(logger),
  };
}
