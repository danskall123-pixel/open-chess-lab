import type { PrismaClient, Role } from '@prisma/client';
import type { AppConfig } from '../config.js';
import { randomGuestName, randomToken, sha256 } from '../ids.js';
import type { PlayerIdentity } from '../players.js';
import { playerKeyFor } from '../players.js';

export interface SessionUserRecord {
  id: string;
  username: string;
  email: string;
  role: Role;
  markedAt: Date | null;
}

export interface SessionContext {
  id: string;
  csrfToken: string;
  guestId: string;
  guestName: string;
  user: SessionUserRecord | null;
}

export interface IssuedSession {
  token: string;
  session: SessionContext;
}

const TOUCH_INTERVAL_MS = 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const userSelection = {
  id: true,
  username: true,
  email: true,
  role: true,
  markedAt: true,
} as const;

export class SessionService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly config: AppConfig,
  ) {}

  get ttlMs(): number {
    return this.config.SESSION_TTL_DAYS * DAY_MS;
  }

  async resolve(token: string | undefined): Promise<SessionContext | null> {
    if (!token) return null;
    const record = await this.prisma.session.findUnique({
      where: { id: sha256(token) },
      include: { user: { select: userSelection } },
    });
    if (!record) return null;
    const now = Date.now();
    if (record.expiresAt.getTime() <= now) {
      await this.prisma.session.delete({ where: { id: record.id } }).catch(() => undefined);
      return null;
    }
    if (now - record.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
      await this.prisma.session.update({
        where: { id: record.id },
        data: { lastSeenAt: new Date(now), expiresAt: new Date(now + this.ttlMs) },
      });
    }
    return {
      id: record.id,
      csrfToken: record.csrfToken,
      guestId: record.guestId,
      guestName: record.guestName,
      user: record.user,
    };
  }

  async createGuest(): Promise<IssuedSession> {
    return this.issue(null, randomToken(16), randomGuestName());
  }

  async loginAs(current: SessionContext | null, userId: string): Promise<IssuedSession> {
    if (current) await this.destroy(current);
    return this.issue(
      userId,
      current?.guestId ?? randomToken(16),
      current?.guestName ?? randomGuestName(),
    );
  }

  async destroy(session: SessionContext): Promise<void> {
    await this.prisma.session.deleteMany({ where: { id: session.id } });
  }

  async destroyAllForUser(userId: string): Promise<void> {
    await this.prisma.session.deleteMany({ where: { userId } });
  }

  async purgeExpired(): Promise<number> {
    const result = await this.prisma.session.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    return result.count;
  }

  private async issue(
    userId: string | null,
    guestId: string,
    guestName: string,
  ): Promise<IssuedSession> {
    const token = randomToken();
    const record = await this.prisma.session.create({
      data: {
        id: sha256(token),
        userId,
        guestId,
        guestName,
        csrfToken: randomToken(),
        expiresAt: new Date(Date.now() + this.ttlMs),
      },
      include: { user: { select: userSelection } },
    });
    return {
      token,
      session: {
        id: record.id,
        csrfToken: record.csrfToken,
        guestId: record.guestId,
        guestName: record.guestName,
        user: record.user,
      },
    };
  }
}

export function identityOf(session: SessionContext): PlayerIdentity {
  const user = session.user;
  return {
    key: playerKeyFor(user?.id ?? null, session.guestId),
    userId: user?.id ?? null,
    guestId: session.guestId,
    name: user?.username ?? session.guestName,
    role: user?.role ?? 'user',
    marked: user?.markedAt !== null && user?.markedAt !== undefined,
  };
}
