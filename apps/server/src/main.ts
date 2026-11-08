import { PrismaClient } from '@prisma/client';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { createRedis } from './redis.js';

const SESSION_PURGE_INTERVAL_MS = 6 * 60 * 60 * 1000;

async function main(): Promise<void> {
  const config = loadConfig();
  const prisma = new PrismaClient();
  const redis = createRedis(config.REDIS_URL);
  const { app, services } = await buildApp(config, prisma, redis);

  await services.matchmaker.clear();
  await services.seeks.clearPublicSeeks();
  await services.games.restore();
  services.matchmaker.start();
  await services.fairPlay.enqueueBacklog();

  const purgeTimer = setInterval(() => {
    void services.sessions.purgeExpired().catch((error: unknown) => app.log.warn({ err: error }));
  }, SESSION_PURGE_INTERVAL_MS);
  purgeTimer.unref();

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, 'Shutting down');
    clearInterval(purgeTimer);
    services.matchmaker.stop();
    services.fairPlay.stop();
    services.games.shutdown();
    services.hub.closeAll();
    await services.games.flush();
    await app.close();
    await prisma.$disconnect();
    redis.disconnect();
    process.exit(0);
  };
  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));

  await app.listen({ host: config.HOST, port: config.PORT });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
