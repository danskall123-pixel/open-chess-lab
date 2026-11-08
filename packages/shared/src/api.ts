import type { Color } from './color.js';
import type { GameOutcome, GameResult, Termination } from './gameEnd.js';
import type { ExpectedRatingChanges } from './rating.js';
import type { FairPlayMetrics } from './fairPlay.js';
import type { Speed, TimeControl } from './timeControl.js';

export type UserRole = 'user' | 'moderator';

export type SeekColor = Color | 'random';

export type GameStatus = 'ongoing' | 'finished' | 'aborted';

export type GameSource = 'lobby' | 'queue' | 'invite' | 'rematch';

export interface SessionUser {
  id: string;
  username: string;
  email: string;
  role: UserRole;
  marked: boolean;
}

export interface MeResponse {
  user: SessionUser | null;
  guestName: string;
  csrfToken: string;
  activeRatedGameId: string | null;
}

export interface RatingView {
  speed: Speed;
  rating: number;
  deviation: number;
  provisional: boolean;
  games: number;
}

export interface RatingHistoryPoint {
  speed: Speed;
  rating: number;
  at: string;
}

export interface GameSummaryPlayer {
  userId: string | null;
  name: string;
  rating: number | null;
  ratingChange: number | null;
}

export interface GameSummary {
  id: string;
  players: Record<Color, GameSummaryPlayer>;
  status: GameStatus;
  result: GameResult | null;
  termination: Termination | null;
  rated: boolean;
  speed: Speed;
  timeControl: TimeControl;
  movesCount: number;
  startedAt: string;
  endedAt: string | null;
}

export interface GameRecord extends GameSummary {
  initialFen: string;
  movesUci: string[];
  pgn: string;
}

export interface ResultStats {
  wins: number;
  draws: number;
  losses: number;
  total: number;
}

export interface ProfileResponse {
  username: string;
  createdAt: string;
  marked: boolean;
  ratings: RatingView[];
  history: RatingHistoryPoint[];
  stats: ResultStats;
  games: GameSummary[];
}

export interface LeaderboardEntry {
  rank: number;
  username: string;
  rating: number;
  deviation: number;
  games: number;
}

export interface LeaderboardResponse {
  speed: Speed;
  entries: LeaderboardEntry[];
}

export interface SeekOwnerView {
  name: string;
  rating: number | null;
  provisional: boolean;
  isGuest: boolean;
}

export interface SeekView {
  id: string;
  timeControl: TimeControl;
  speed: Speed;
  rated: boolean;
  color: SeekColor;
  ratingRange: { min: number | null; max: number | null };
  owner: SeekOwnerView;
  mine: boolean;
  isInvite: boolean;
  createdAt: number;
}

export interface CreateSeekRequest {
  timeControl: TimeControl;
  rated: boolean;
  color: SeekColor;
  ratingMin: number | null;
  ratingMax: number | null;
  isInvite: boolean;
}

export interface CreateSeekResponse {
  seek: SeekView;
}

export interface AcceptSeekResponse {
  gameId: string;
}

export interface GamePlayerView {
  userId: string | null;
  name: string;
  isGuest: boolean;
  rating: number | null;
  provisional: boolean;
  connected: boolean;
}

export interface GameView {
  id: string;
  rated: boolean;
  speed: Speed;
  timeControl: TimeControl;
  source: GameSource;
  initialFen: string;
  movesUci: string[];
  sans: string[];
  fen: string;
  turn: Color;
  status: GameStatus;
  outcome: GameOutcome | null;
  players: Record<Color, GamePlayerView>;
  clockMs: Record<Color, number>;
  clockRunning: Color | null;
  drawOfferBy: Color | null;
  rematchOfferBy: Color | null;
  rematchGameId: string | null;
  ratingChanges: Record<Color, number> | null;
  expectedChanges: Record<Color, ExpectedRatingChanges> | null;
  abortable: boolean;
  firstMoveDeadlineMs: number | null;
  disconnected: { color: Color; claimableInMs: number } | null;
  startedAt: string;
}

export interface FlagView {
  id: string;
  user: { id: string; username: string; marked: boolean };
  gameId: string;
  color: Color;
  metrics: FairPlayMetrics;
  status: 'open' | 'dismissed' | 'confirmed';
  createdAt: string;
}

export interface MarkAccountResponse {
  refundedGames: number;
  refundedPoints: number;
}

export interface ApiErrorBody {
  error: string;
}
