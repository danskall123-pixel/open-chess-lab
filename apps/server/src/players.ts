import type { UserRole } from '@open-chess-lab/shared';

export interface PlayerIdentity {
  key: string;
  userId: string | null;
  guestId: string;
  name: string;
  role: UserRole;
  marked: boolean;
}

export function playerKeyFor(userId: string | null, guestId: string): string {
  return userId ? `user:${userId}` : `guest:${guestId}`;
}

export function isRegistered(
  player: PlayerIdentity,
): player is PlayerIdentity & { userId: string } {
  return player.userId !== null;
}

export function canPlayRated(player: PlayerIdentity): boolean {
  return isRegistered(player) && !player.marked;
}
