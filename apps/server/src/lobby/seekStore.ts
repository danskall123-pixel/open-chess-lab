import type { SeekColor, TimeControl } from '@open-chess-lab/shared';
import type { Redis } from '../redis.js';
import type { PlayerIdentity } from '../players.js';

export interface StoredSeek {
  id: string;
  owner: PlayerIdentity;
  ownerRating: { rating: number; deviation: number } | null;
  timeControl: TimeControl;
  rated: boolean;
  color: SeekColor;
  ratingMin: number | null;
  ratingMax: number | null;
  isInvite: boolean;
  createdAt: number;
}

const SEEKS_KEY = 'lobby:seeks';
const INVITE_LIFETIME_MS = 24 * 60 * 60 * 1000;

export class SeekStore {
  constructor(private readonly redis: Redis) {}

  async save(seek: StoredSeek): Promise<void> {
    await this.redis.hset(SEEKS_KEY, seek.id, JSON.stringify(seek));
  }

  async get(id: string): Promise<StoredSeek | null> {
    const raw = await this.redis.hget(SEEKS_KEY, id);
    if (!raw) return null;
    const seek = JSON.parse(raw) as StoredSeek;
    return this.isExpired(seek, Date.now()) ? null : seek;
  }

  async claim(id: string): Promise<boolean> {
    return (await this.redis.hdel(SEEKS_KEY, id)) === 1;
  }

  async all(): Promise<StoredSeek[]> {
    const now = Date.now();
    const seeks = Object.values(await this.redis.hgetall(SEEKS_KEY)).map(
      (raw) => JSON.parse(raw) as StoredSeek,
    );
    const expired = seeks.filter((seek) => this.isExpired(seek, now));
    if (expired.length > 0) await this.redis.hdel(SEEKS_KEY, ...expired.map((seek) => seek.id));
    return seeks.filter((seek) => !this.isExpired(seek, now));
  }

  async removeWhere(predicate: (seek: StoredSeek) => boolean): Promise<number> {
    const matching = (await this.all()).filter(predicate);
    if (matching.length === 0) return 0;
    return this.redis.hdel(SEEKS_KEY, ...matching.map((seek) => seek.id));
  }

  async clearPublicSeeks(): Promise<number> {
    return this.removeWhere((seek) => !seek.isInvite);
  }

  private isExpired(seek: StoredSeek, now: number): boolean {
    return seek.isInvite && now - seek.createdAt > INVITE_LIFETIME_MS;
  }
}
