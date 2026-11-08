import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import type { MeResponse, ServerMessage } from '@open-chess-lab/shared';
import { endpoints } from '../api/endpoints';
import { setCsrfToken } from '../api/http';
import { SocketClient } from '../api/socket';

interface SessionValue {
  me: MeResponse | null;
  loadError: string | null;
  socket: SocketClient;
  connected: boolean;
  applyMe: (me: MeResponse) => void;
  refresh: () => Promise<void>;
}

const SessionContext = createContext<SessionValue | null>(null);

function identityKey(me: MeResponse | null): string {
  if (!me) return '';
  return me.user ? `user:${me.user.id}` : `guest:${me.guestName}`;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const socketRef = useRef<SocketClient | null>(null);
  socketRef.current ??= new SocketClient();
  const socket = socketRef.current;
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const identity = identityKey(me);

  const applyMe = useCallback((next: MeResponse) => {
    setCsrfToken(next.csrfToken);
    setMe(next);
  }, []);

  const refresh = useCallback(async () => {
    try {
      applyMe(await endpoints.me());
      setLoadError(null);
    } catch {
      setLoadError('Could not reach the server. Retrying…');
    }
  }, [applyMe]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (loadError === null) return;
    const timer = window.setTimeout(() => void refresh(), 3000);
    return () => window.clearTimeout(timer);
  }, [loadError, refresh]);

  useEffect(() => socket.onStatus(setConnected), [socket]);

  useEffect(() => {
    if (identity === '') return;
    socket.reconnect();
  }, [identity, socket]);

  useEffect(() => () => socket.close(), [socket]);

  useEffect(
    () =>
      socket.subscribe((message: ServerMessage) => {
        const ownGameEnded =
          message.t === 'game.state' &&
          message.game.status !== 'ongoing' &&
          me?.activeRatedGameId === message.game.id;
        if (message.t === 'game.started' || ownGameEnded) void refresh();
      }),
    [socket, refresh, me?.activeRatedGameId],
  );

  const value = useMemo(
    () => ({ me, loadError, socket, connected, applyMe, refresh }),
    [me, loadError, socket, connected, applyMe, refresh],
  );
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionValue {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession must be used inside SessionProvider');
  return value;
}

export function useEngineGate(): { allowed: boolean; activeRatedGameId: string | null } {
  const { me } = useSession();
  const activeRatedGameId = me?.activeRatedGameId ?? null;
  return { allowed: activeRatedGameId === null, activeRatedGameId };
}
