import { useCallback, useEffect, useRef, useState } from 'react';

export type SearchResult =
  | { type: 'user'; id: string; name: string; username: string; avatarUrl?: string }
  | { type: 'post'; id: string; title: string; excerpt?: string }
  | { type: 'tag'; id: string; name: string; count?: number };

export interface UseSearchState {
  query: string;
  results: SearchResult[];
  loading: boolean;
  error: Error | null;
}

const DEBOUNCE_MS = 300;
const CACHE_TTL_MS = 2 * 60 * 1000;

interface CacheEntry {
  results: SearchResult[];
  timestamp: number;
}

const cache = new Map<string, CacheEntry>();

function getCached(query: string): SearchResult[] | null {
  const entry = cache.get(query);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    cache.delete(query);
    return null;
  }
  return entry.results;
}

function setCached(query: string, results: SearchResult[]): void {
  cache.set(query, { results, timestamp: Date.now() });
}

async function fetchSearchResults(
  query: string,
  signal: AbortSignal,
): Promise<SearchResult[]> {
  const response = await fetch(
    `/api/search?q=${encodeURIComponent(query)}`,
    { signal },
  );
  if (!response.ok) {
    throw new Error(`Search failed with status ${response.status}`);
  }
  const data = (await response.json()) as { results?: SearchResult[] };
  return data.results ?? [];
}

export function useSearch(initialQuery = ''): UseSearchState & {
  setQuery: (query: string) => void;
} {
  const [query, setQueryState] = useState(initialQuery);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  const setQuery = useCallback((next: string) => {
    setQueryState(next);
  }, []);

  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }

    const trimmed = query.trim();

    if (!trimmed) {
      if (controllerRef.current) {
        controllerRef.current.abort();
        controllerRef.current = null;
      }
      setResults([]);
      setLoading(false);
      setError(null);
      return;
    }

    const cached = getCached(trimmed);
    if (cached) {
      if (controllerRef.current) {
        controllerRef.current.abort();
        controllerRef.current = null;
      }
      setResults(cached);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);

    debounceRef.current = setTimeout(() => {
      if (controllerRef.current) {
        controllerRef.current.abort();
      }
      const controller = new AbortController();
      controllerRef.current = controller;

      fetchSearchResults(trimmed, controller.signal)
        .then((nextResults) => {
          if (controller.signal.aborted) return;
          setCached(trimmed, nextResults);
          setResults(nextResults);
          setError(null);
        })
        .catch((err: unknown) => {
          if (controller.signal.aborted) return;
          if (err instanceof Error && err.name === 'AbortError') return;
          setError(err instanceof Error ? err : new Error('Search failed'));
          setResults([]);
        })
        .finally(() => {
          if (controller.signal.aborted) return;
          setLoading(false);
        });
    }, DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
    };
  }, [query]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      if (controllerRef.current) {
        controllerRef.current.abort();
      }
    };
  }, []);

  return { query, results, loading, error, setQuery };
}

export default useSearch;
