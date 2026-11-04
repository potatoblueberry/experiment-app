/**
 * Makes one Repository instance available to the whole app and provides a tiny
 * query/invalidate mechanism: after any mutation, call `invalidate()` and every
 * mounted `useRepoQuery` re-fetches. Simple, and good enough until we need a
 * proper cache library.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { LocalMockRepository } from './LocalMockRepository';
import type { Repository } from './repository';

interface RepositoryContextValue {
  repo: Repository;
  version: number;
  invalidate: () => void;
}

const RepositoryContext = createContext<RepositoryContextValue | null>(null);

export function RepositoryProvider({ children, repository }: { children: React.ReactNode; repository?: Repository }) {
  const repo = useMemo(() => repository ?? new LocalMockRepository(), [repository]);
  const [version, setVersion] = useState(0);
  const invalidate = useCallback(() => setVersion((v) => v + 1), []);
  const value = useMemo(() => ({ repo, version, invalidate }), [repo, version, invalidate]);
  return <RepositoryContext.Provider value={value}>{children}</RepositoryContext.Provider>;
}

export function useRepository(): RepositoryContextValue {
  const ctx = useContext(RepositoryContext);
  if (!ctx) throw new Error('useRepository must be used inside <RepositoryProvider>');
  return ctx;
}

export interface QueryResult<T> {
  data: T | undefined;
  loading: boolean;
  error: Error | null;
  refetch: () => void;
}

/**
 * Runs `fn(repo)` and keeps the result. Re-runs when `deps` change or when any
 * mutation calls `invalidate()`. Keeps the previous data while refetching so the
 * UI does not flicker.
 */
export function useRepoQuery<T>(fn: (repo: Repository) => Promise<T>, deps: React.DependencyList): QueryResult<T> {
  const { repo, version } = useRepository();
  const [tick, setTick] = useState(0);
  // One string identifies "which request is current"; a result is stale when its key differs.
  const key = JSON.stringify([version, tick, ...deps]);
  const [result, setResult] = useState<{ key: string; data?: T; error: Error | null }>({ key: '', error: null });

  // Keep the latest query function without re-running the effect when a new closure is passed.
  const fnRef = useRef(fn);
  useEffect(() => {
    fnRef.current = fn;
  });

  useEffect(() => {
    let cancelled = false;
    fnRef
      .current(repo)
      .then((data) => {
        if (!cancelled) setResult({ key, data, error: null });
      })
      .catch((e: unknown) => {
        if (!cancelled) setResult((prev) => ({ key, data: prev.data, error: e instanceof Error ? e : new Error(String(e)) }));
      });
    return () => {
      cancelled = true;
    };
  }, [repo, key]);

  const refetch = useCallback(() => setTick((t) => t + 1), []);
  // Previous data is kept while a newer request is in flight, so lists do not flicker.
  return { data: result.data, loading: result.key !== key, error: result.error, refetch };
}
