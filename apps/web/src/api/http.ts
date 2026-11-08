import type { ApiErrorBody } from '@open-chess-lab/shared';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

let csrfToken = '';

export function setCsrfToken(token: string): void {
  csrfToken = token;
}

function isErrorBody(value: unknown): value is ApiErrorBody {
  return (
    typeof value === 'object' &&
    value !== null &&
    'error' in value &&
    typeof value.error === 'string'
  );
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: {
      accept: 'application/json',
      ...(method === 'GET'
        ? {}
        : { 'content-type': 'application/json', 'x-csrf-token': csrfToken }),
    },
    body: method === 'GET' ? undefined : JSON.stringify(body ?? {}),
  });
  const text = await response.text();
  const data: unknown = text.length > 0 ? JSON.parse(text) : null;
  if (!response.ok) {
    throw new ApiError(
      response.status,
      isErrorBody(data) ? data.error : `Request failed (${response.status})`,
    );
  }
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body),
  delete: <T>(path: string) => request<T>('DELETE', path),
};

export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong.';
}
