import type {
  AcceptSeekResponse,
  CreateSeekRequest,
  CreateSeekResponse,
  FlagView,
  GameRecord,
  GameSummary,
  GameView,
  LeaderboardResponse,
  MarkAccountResponse,
  MeResponse,
  ProfileResponse,
  SeekView,
  Speed,
} from '@open-chess-lab/shared';
import { api } from './http';

export type GameLookup = { live: true; game: GameView } | { live: false; record: GameRecord };

export interface GamePage {
  page: number;
  games: GameSummary[];
  hasMore: boolean;
}

const encode = encodeURIComponent;

export const endpoints = {
  me: () => api.get<MeResponse>('/api/me'),
  register: (username: string, email: string, password: string) =>
    api.post<MeResponse>('/api/auth/register', { username, email, password }),
  login: (login: string, password: string) =>
    api.post<MeResponse>('/api/auth/login', { login, password }),
  logout: () => api.post<MeResponse>('/api/auth/logout'),
  requestPasswordReset: (email: string) =>
    api.post<null>('/api/auth/password-reset/request', { email }),
  confirmPasswordReset: (token: string, password: string) =>
    api.post<MeResponse>('/api/auth/password-reset/confirm', { token, password }),
  profile: (username: string) => api.get<ProfileResponse>(`/api/users/${encode(username)}`),
  userGames: (username: string, page: number) =>
    api.get<GamePage>(`/api/users/${encode(username)}/games?page=${page}`),
  game: (id: string) => api.get<GameLookup>(`/api/games/${encode(id)}`),
  leaderboard: (speed: Speed) => api.get<LeaderboardResponse>(`/api/leaderboard/${speed}`),
  stats: () => api.get<{ players: number; games: number }>('/api/stats'),
  createSeek: (request: CreateSeekRequest) => api.post<CreateSeekResponse>('/api/seeks', request),
  seek: (id: string) => api.get<{ seek: SeekView }>(`/api/seeks/${encode(id)}`),
  cancelSeek: (id: string) => api.delete<null>(`/api/seeks/${encode(id)}`),
  acceptSeek: (id: string) => api.post<AcceptSeekResponse>(`/api/seeks/${encode(id)}/accept`),
  flags: (status: FlagView['status']) =>
    api.get<{ flags: FlagView[] }>(`/api/mod/flags?status=${status}`),
  dismissFlag: (id: string) => api.post<null>(`/api/mod/flags/${encode(id)}/dismiss`),
  markAccount: (userId: string) =>
    api.post<MarkAccountResponse>(`/api/mod/users/${encode(userId)}/mark`),
  unmarkAccount: (userId: string) => api.post<null>(`/api/mod/users/${encode(userId)}/unmark`),
};
