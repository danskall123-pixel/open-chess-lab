import type { ClientMessage, ServerMessage } from '@open-chess-lab/shared';

type MessageListener = (message: ServerMessage) => void;
type StatusListener = (connected: boolean) => void;

const PING_INTERVAL_MS = 2000;
const MAX_RECONNECT_DELAY_MS = 8000;
const RTT_SMOOTHING = 0.3;

function socketUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws`;
}

export class SocketClient {
  private socket: WebSocket | null = null;
  private readonly messageListeners = new Set<MessageListener>();
  private readonly statusListeners = new Set<StatusListener>();
  private readonly watchedGames = new Map<string, number>();
  private lobbySubscribers = 0;
  private pingTimer: number | null = null;
  private reconnectTimer: number | null = null;
  private reconnectDelay = 500;
  private closedByUser = false;
  private smoothedRtt: number | null = null;

  get connected(): boolean {
    return this.socket?.readyState === WebSocket.OPEN;
  }

  get latencyMs(): number {
    return this.smoothedRtt === null ? 0 : this.smoothedRtt / 2;
  }

  connect(): void {
    this.closedByUser = false;
    const socket = new WebSocket(socketUrl());
    this.socket = socket;
    socket.addEventListener('open', () => this.onOpen());
    socket.addEventListener('message', (event: MessageEvent<string>) => this.onMessage(event.data));
    socket.addEventListener('close', () => this.onClose(socket));
  }

  reconnect(): void {
    this.close();
    this.connect();
  }

  close(): void {
    this.closedByUser = true;
    this.stopTimers();
    this.socket?.close();
    this.socket = null;
  }

  send(message: ClientMessage): void {
    if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message));
  }

  subscribe(listener: MessageListener): () => void {
    this.messageListeners.add(listener);
    return () => this.messageListeners.delete(listener);
  }

  onStatus(listener: StatusListener): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  watchGame(gameId: string): () => void {
    this.watchedGames.set(gameId, (this.watchedGames.get(gameId) ?? 0) + 1);
    this.send({ t: 'game.watch', gameId });
    return () => {
      const remaining = (this.watchedGames.get(gameId) ?? 1) - 1;
      if (remaining > 0) {
        this.watchedGames.set(gameId, remaining);
        return;
      }
      this.watchedGames.delete(gameId);
      this.send({ t: 'game.unwatch', gameId });
    };
  }

  joinLobby(): () => void {
    this.lobbySubscribers += 1;
    if (this.lobbySubscribers === 1) this.send({ t: 'lobby.subscribe' });
    return () => {
      this.lobbySubscribers -= 1;
      if (this.lobbySubscribers === 0) this.send({ t: 'lobby.unsubscribe' });
    };
  }

  private onOpen(): void {
    this.reconnectDelay = 500;
    if (this.lobbySubscribers > 0) this.send({ t: 'lobby.subscribe' });
    for (const gameId of this.watchedGames.keys()) this.send({ t: 'game.watch', gameId });
    this.ping();
    this.pingTimer = window.setInterval(() => this.ping(), PING_INTERVAL_MS);
    this.statusListeners.forEach((listener) => listener(true));
  }

  private onMessage(raw: string): void {
    const message = JSON.parse(raw) as ServerMessage;
    if (message.t === 'pong') {
      const rtt = performance.now() - message.sentAt;
      this.smoothedRtt =
        this.smoothedRtt === null
          ? rtt
          : this.smoothedRtt * (1 - RTT_SMOOTHING) + rtt * RTT_SMOOTHING;
      return;
    }
    this.messageListeners.forEach((listener) => listener(message));
  }

  private onClose(socket: WebSocket): void {
    if (this.socket !== socket) return;
    this.stopTimers();
    this.statusListeners.forEach((listener) => listener(false));
    if (this.closedByUser) return;
    this.reconnectTimer = window.setTimeout(() => this.connect(), this.reconnectDelay);
    this.reconnectDelay = Math.min(MAX_RECONNECT_DELAY_MS, this.reconnectDelay * 2);
  }

  private ping(): void {
    this.send({
      t: 'ping',
      sentAt: performance.now(),
      rttMs: this.smoothedRtt === null ? null : Math.round(this.smoothedRtt),
    });
  }

  private stopTimers(): void {
    if (this.pingTimer !== null) window.clearInterval(this.pingTimer);
    if (this.reconnectTimer !== null) window.clearTimeout(this.reconnectTimer);
    this.pingTimer = null;
    this.reconnectTimer = null;
  }
}
