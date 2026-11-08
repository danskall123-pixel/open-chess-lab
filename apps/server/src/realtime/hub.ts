import type { WebSocket } from 'ws';
import type { ServerMessage } from '@open-chess-lab/shared';
import type { PlayerIdentity } from '../players.js';

export interface Connection {
  id: number;
  socket: WebSocket;
  player: PlayerIdentity;
  lagMs: number;
  watching: Set<string>;
  inLobby: boolean;
}

export interface PresenceListener {
  onPresenceChange(playerKey: string): void;
}

const OPEN_STATE = 1;
const LAG_SMOOTHING = 0.3;

export class Hub {
  private nextId = 1;
  private readonly connections = new Set<Connection>();
  private readonly byPlayer = new Map<string, Set<Connection>>();
  private readonly rooms = new Map<string, Set<Connection>>();
  private readonly listeners: PresenceListener[] = [];

  addPresenceListener(listener: PresenceListener): void {
    this.listeners.push(listener);
  }

  register(socket: WebSocket, player: PlayerIdentity): Connection {
    const connection: Connection = {
      id: this.nextId++,
      socket,
      player,
      lagMs: 0,
      watching: new Set(),
      inLobby: false,
    };
    this.connections.add(connection);
    const own = this.byPlayer.get(player.key) ?? new Set();
    own.add(connection);
    this.byPlayer.set(player.key, own);
    return connection;
  }

  unregister(connection: Connection): void {
    this.connections.delete(connection);
    for (const gameId of connection.watching) this.rooms.get(gameId)?.delete(connection);
    const own = this.byPlayer.get(connection.player.key);
    own?.delete(connection);
    if (own && own.size === 0) this.byPlayer.delete(connection.player.key);
    this.notifyPresence(connection.player.key);
  }

  watch(connection: Connection, gameId: string): void {
    connection.watching.add(gameId);
    const room = this.rooms.get(gameId) ?? new Set();
    room.add(connection);
    this.rooms.set(gameId, room);
    this.notifyPresence(connection.player.key);
  }

  unwatch(connection: Connection, gameId: string): void {
    connection.watching.delete(gameId);
    const room = this.rooms.get(gameId);
    room?.delete(connection);
    if (room && room.size === 0) this.rooms.delete(gameId);
    this.notifyPresence(connection.player.key);
  }

  setLobby(connection: Connection, inLobby: boolean): void {
    connection.inLobby = inLobby;
  }

  recordLag(connection: Connection, rttMs: number): void {
    if (!Number.isFinite(rttMs) || rttMs < 0) return;
    const oneWay = rttMs / 2;
    connection.lagMs =
      connection.lagMs === 0
        ? oneWay
        : connection.lagMs * (1 - LAG_SMOOTHING) + oneWay * LAG_SMOOTHING;
  }

  lagOf(playerKey: string, gameId: string): number {
    const watching = [...(this.byPlayer.get(playerKey) ?? [])].filter((connection) =>
      connection.watching.has(gameId),
    );
    if (watching.length === 0) return 0;
    return Math.min(...watching.map((connection) => connection.lagMs));
  }

  isOnline(playerKey: string): boolean {
    return (this.byPlayer.get(playerKey)?.size ?? 0) > 0;
  }

  isWatching(playerKey: string, gameId: string): boolean {
    return [...(this.byPlayer.get(playerKey) ?? [])].some((connection) =>
      connection.watching.has(gameId),
    );
  }

  send(connection: Connection, message: ServerMessage): void {
    if (connection.socket.readyState === OPEN_STATE) {
      connection.socket.send(JSON.stringify(message));
    }
  }

  sendToPlayer(playerKey: string, message: ServerMessage): void {
    for (const connection of this.byPlayer.get(playerKey) ?? []) this.send(connection, message);
  }

  broadcastToGame(gameId: string, message: ServerMessage): void {
    for (const connection of this.rooms.get(gameId) ?? []) this.send(connection, message);
  }

  lobbyConnections(): Connection[] {
    return [...this.connections].filter((connection) => connection.inLobby);
  }

  onlinePlayerCount(): number {
    return this.byPlayer.size;
  }

  closeAll(): void {
    for (const connection of this.connections)
      connection.socket.close(1001, 'Server shutting down');
  }

  private notifyPresence(playerKey: string): void {
    for (const listener of this.listeners) listener.onPresenceChange(playerKey);
  }
}
