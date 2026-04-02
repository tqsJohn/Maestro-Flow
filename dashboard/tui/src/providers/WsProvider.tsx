import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
  type ReactNode,
} from 'react';
import WebSocket from 'ws';
import { WS_ENDPOINT } from '@shared/constants.js';
import type { WsServerMessage, WsClientMessage } from '@shared/ws-protocol.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WsContextValue {
  connected: boolean;
  send: (message: WsClientMessage) => void;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const WsContext = createContext<WsContextValue>({
  connected: false,
  send: () => {},
});

export function useWs(): WsContextValue {
  return useContext(WsContext);
}

// ---------------------------------------------------------------------------
// useWsEvent hook — subscribe to typed WebSocket events
// ---------------------------------------------------------------------------

type WsListener = (message: WsServerMessage) => void;

/** Global listeners registry shared via module scope (set by WsProvider) */
let addListener: (fn: WsListener) => void = () => {};
let removeListener: (fn: WsListener) => void = () => {};

export function useWsEvent<T = unknown>(eventType: string): T | null {
  const [data, setData] = useState<T | null>(null);

  useEffect(() => {
    const handler: WsListener = (message) => {
      if (message.type === eventType) {
        setData(message.data as T);
      }
    };
    addListener(handler);
    return () => removeListener(handler);
  }, [eventType]);

  return data;
}

// ---------------------------------------------------------------------------
// Reconnect config
// ---------------------------------------------------------------------------

const INITIAL_RECONNECT_MS = 1000;
const MAX_RECONNECT_MS = 30000;
const RECONNECT_BACKOFF = 2;

// ---------------------------------------------------------------------------
// Provider component
// ---------------------------------------------------------------------------

interface WsProviderProps {
  /** WebSocket URL. Defaults to ws://localhost:3000/ws */
  url?: string;
  children: ReactNode;
}

export function WsProvider({
  url,
  children,
}: WsProviderProps) {
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);
  const listenersRef = useRef<Set<WsListener>>(new Set());
  const reconnectDelayRef = useRef(INITIAL_RECONNECT_MS);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unmountedRef = useRef(false);

  // Derive WS URL from baseUrl or use explicit url
  const wsUrl = url ?? `ws://localhost:3000${WS_ENDPOINT}`;

  // Register module-level listener helpers
  useEffect(() => {
    addListener = (fn: WsListener) => listenersRef.current.add(fn);
    removeListener = (fn: WsListener) => listenersRef.current.delete(fn);
    return () => {
      addListener = () => {};
      removeListener = () => {};
    };
  }, []);

  const connect = useCallback(() => {
    if (unmountedRef.current) return;

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.on('open', () => {
      if (unmountedRef.current) {
        ws.close();
        return;
      }
      setConnected(true);
      reconnectDelayRef.current = INITIAL_RECONNECT_MS;
    });

    ws.on('message', (raw: WebSocket.Data) => {
      try {
        const message = JSON.parse(String(raw)) as WsServerMessage;
        for (const listener of listenersRef.current) {
          listener(message);
        }
      } catch {
        // Ignore malformed messages
      }
    });

    ws.on('close', () => {
      setConnected(false);
      if (!unmountedRef.current) {
        scheduleReconnect();
      }
    });

    ws.on('error', () => {
      // Error will be followed by 'close', reconnect happens there
    });
  }, [wsUrl]);

  const scheduleReconnect = useCallback(() => {
    if (unmountedRef.current) return;
    if (reconnectTimerRef.current) return;

    const delay = reconnectDelayRef.current;
    reconnectDelayRef.current = Math.min(delay * RECONNECT_BACKOFF, MAX_RECONNECT_MS);

    reconnectTimerRef.current = setTimeout(() => {
      reconnectTimerRef.current = null;
      connect();
    }, delay);
  }, [connect]);

  // Connect on mount, cleanup on unmount
  useEffect(() => {
    unmountedRef.current = false;
    connect();

    return () => {
      unmountedRef.current = true;
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect]);

  const send = useCallback((message: WsClientMessage) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  }, []);

  const value = React.useMemo<WsContextValue>(
    () => ({ connected, send }),
    [connected, send],
  );

  return (
    <WsContext.Provider value={value}>
      {children}
    </WsContext.Provider>
  );
}
