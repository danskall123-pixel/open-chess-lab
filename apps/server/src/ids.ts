import { createHash, randomBytes, randomInt } from 'node:crypto';

const GAME_ID_ALPHABET = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const GAME_ID_LENGTH = 10;

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function randomGameId(): string {
  return Array.from(
    { length: GAME_ID_LENGTH },
    () => GAME_ID_ALPHABET[randomInt(GAME_ID_ALPHABET.length)],
  ).join('');
}

export function randomGuestName(): string {
  return `Guest-${randomInt(10_000, 100_000)}`;
}
