import { timingSafeEqual } from 'node:crypto';

export const CSRF_HEADER = 'x-csrf-token';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function requiresCsrfCheck(method: string): boolean {
  return !SAFE_METHODS.has(method.toUpperCase());
}

export function tokensMatch(expected: string, provided: string | undefined): boolean {
  if (!provided) return false;
  const expectedBuffer = Buffer.from(expected);
  const providedBuffer = Buffer.from(provided);
  return (
    expectedBuffer.length === providedBuffer.length &&
    timingSafeEqual(expectedBuffer, providedBuffer)
  );
}

function hostOf(origin: string): string | null {
  try {
    return new URL(origin).host;
  } catch {
    return null;
  }
}

export function isAllowedOrigin(
  origin: string | undefined,
  allowedOrigins: readonly string[],
  requestHosts: readonly string[] = [],
): boolean {
  if (origin === undefined) return true;
  if (allowedOrigins.includes(origin)) return true;
  const originHost = hostOf(origin);
  return originHost !== null && requestHosts.includes(originHost);
}

export function requestHostsOf(headers: Record<string, string | string[] | undefined>): string[] {
  const forwarded = headers['x-forwarded-host'];
  const forwardedHosts = (Array.isArray(forwarded) ? forwarded : [forwarded ?? ''])
    .flatMap((value) => value.split(','))
    .map((value) => value.trim());
  const host = typeof headers.host === 'string' ? headers.host : '';
  return [...forwardedHosts, host].filter((value) => value.length > 0);
}
