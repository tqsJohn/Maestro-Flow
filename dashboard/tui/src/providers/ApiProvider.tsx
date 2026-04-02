import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ApiContextValue {
  baseUrl: string;
}

export interface UseApiResult<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}

export interface UseApiOptions {
  /** Polling interval in ms. Disabled when undefined or 0. */
  pollInterval?: number;
  /** Skip the initial fetch (useful for conditional queries). */
  skip?: boolean;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const ApiContext = createContext<ApiContextValue>({
  baseUrl: 'http://localhost:3000',
});

// ---------------------------------------------------------------------------
// useApi hook — fetch data from a REST endpoint with optional polling
// ---------------------------------------------------------------------------

export function useApi<T>(endpoint: string, options?: UseApiOptions): UseApiResult<T> {
  const { baseUrl } = useContext(ApiContext);
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(!options?.skip);
  const [error, setError] = useState<Error | null>(null);

  // Track current request to avoid stale updates
  const requestId = useRef(0);

  const fetchData = useCallback(() => {
    if (options?.skip) return;

    const id = ++requestId.current;
    setLoading(true);

    fetch(`${baseUrl}${endpoint}`, {
      headers: { 'Content-Type': 'application/json' },
    })
      .then((res) => {
        if (!res.ok) {
          throw new Error(`API error: ${res.status} ${res.statusText}`);
        }
        return res.json() as Promise<T>;
      })
      .then((result) => {
        // Only update if this is still the latest request
        if (id === requestId.current) {
          setData(result);
          setError(null);
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        if (id === requestId.current) {
          setError(err instanceof Error ? err : new Error(String(err)));
          setLoading(false);
        }
      });
  }, [baseUrl, endpoint, options?.skip]);

  // Initial fetch + re-fetch on dependency change
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Polling
  useEffect(() => {
    const interval = options?.pollInterval;
    if (!interval || interval <= 0 || options?.skip) return;

    const timer = setInterval(fetchData, interval);
    return () => clearInterval(timer);
  }, [fetchData, options?.pollInterval, options?.skip]);

  return { data, loading, error, refetch: fetchData };
}

// ---------------------------------------------------------------------------
// Provider component
// ---------------------------------------------------------------------------

interface ApiProviderProps {
  baseUrl?: string;
  children: ReactNode;
}

export function useBaseUrl(): string {
  return useContext(ApiContext).baseUrl;
}

export function ApiProvider({
  baseUrl = 'http://localhost:3000',
  children,
}: ApiProviderProps) {
  const value = React.useMemo(() => ({ baseUrl }), [baseUrl]);

  return (
    <ApiContext.Provider value={value}>
      {children}
    </ApiContext.Provider>
  );
}
