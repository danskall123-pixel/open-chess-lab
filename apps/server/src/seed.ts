import { PrismaClient } from '@prisma/client';
import type { Role, Speed } from '@prisma/client';
import { hashPassword } from './auth/password.js';

interface SeedUser {
  username: string;
  role: Role;
  ratings: Partial<Record<Speed, number>>;
}

const SEED_PASSWORD = 'password123';

const users: SeedUser[] = [
  { username: 'moderator', role: 'moderator', ratings: {} },
  { username: 'alice', role: 'user', ratings: { blitz: 1820, rapid: 1760, bullet: 1700 } },
  { username: 'bob', role: 'user', ratings: { blitz: 1540, rapid: 1610 } },
  { username: 'carol', role: 'user', ratings: { blitz: 2010, classical: 1950 } },
  { username: 'dave', role: 'user', ratings: {} },
];

async function seed(): Promise<void> {
  const prisma = new PrismaClient();
  const passwordHash = await hashPassword(SEED_PASSWORD);
  for (const user of users) {
    const record = await prisma.user.upsert({
      where: { usernameKey: user.username },
      create: {
        username: user.username,
        usernameKey: user.username,
        email: `${user.username}@example.com`,
        passwordHash,
        role: user.role,
      },
      update: { role: user.role },
    });
    for (const [speed, rating] of Object.entries(user.ratings) as Array<[Speed, number]>) {
      const values = { rating, deviation: 70, volatility: 0.06, games: 40 };
      await prisma.rating.upsert({
        where: { userId_speed: { userId: record.id, speed } },
        create: { userId: record.id, speed, ...values },
        update: values,
      });
    }
  }
  await prisma.$disconnect();
  console.info(`Seeded ${users.length} users. Every seeded password is "${SEED_PASSWORD}".`);
}

seed().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
