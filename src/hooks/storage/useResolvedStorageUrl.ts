import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { SUPABASE_URL } from '@/config/supabase';
import {
  parseSupabaseStorageObjectUrl,
  PRIVATE_MEDIA_BUCKETS,
} from '@/lib/storage_object_reference';
import { log } from '@/lib/logger';

const STORAGE_ORIGINS = [new URL(SUPABASE_URL).origin] as const;
const DEFAULT_TTL_SECONDS = 3600;
const REFRESH_COOLDOWN_MS = 5_000;

interface ResolvedStorageUrlState {
  source: string;
  url: string;
  isLoading: boolean;
  error: Error | null;
}

function initialState(source: string): ResolvedStorageUrlState {
  const needsSigning = Boolean(parseSupabaseStorageObjectUrl(
    source,
    PRIVATE_MEDIA_BUCKETS,
    STORAGE_ORIGINS
  ));
  return {
    source,
    url: needsSigning ? '' : source,
    isLoading: needsSigning,
    error: null,
  };
}

/** Resolves durable private-bucket locators and legacy signed URLs on demand. */
export function useResolvedStorageUrl(source: string, ttlSeconds = DEFAULT_TTL_SECONDS) {
  const reference = useMemo(() => parseSupabaseStorageObjectUrl(
    source,
    PRIVATE_MEDIA_BUCKETS,
    STORAGE_ORIGINS
  ), [source]);
  const [state, setState] = useState<ResolvedStorageUrlState>(() => initialState(source));
  const refreshPromiseRef = useRef<Promise<string | null> | null>(null);
  const lastRefreshAtRef = useRef(0);
  const activeState = state.source === source ? state : initialState(source);

  const resolve = useCallback(async (): Promise<string> => {
    if (!reference) return source;
    const { data, error } = await supabase.storage
      .from(reference.bucket)
      .createSignedUrl(reference.path, ttlSeconds);
    if (error || !data?.signedUrl) {
      throw error || new Error('Failed to sign private storage object');
    }
    return data.signedUrl;
  }, [reference, source, ttlSeconds]);

  const refresh = useCallback(async (): Promise<string | null> => {
    if (!reference) return source;
    if (refreshPromiseRef.current) return refreshPromiseRef.current;
    if (Date.now() - lastRefreshAtRef.current < REFRESH_COOLDOWN_MS) {
      return null;
    }

    lastRefreshAtRef.current = Date.now();
    setState((current) => ({
      source,
      url: current.source === source ? current.url : '',
      isLoading: true,
      error: null,
    }));
    const pending = resolve()
      .then((url) => {
        setState({ source, url, isLoading: false, error: null });
        return url;
      })
      .catch((cause) => {
        const error = cause instanceof Error ? cause : new Error(String(cause));
        log.warn('Private storage URL refresh failed', {
          bucket: reference.bucket,
          pathLength: reference.path.length,
          message: error.message,
        });
        setState({ source, url: '', isLoading: false, error });
        return null;
      })
      .finally(() => {
        refreshPromiseRef.current = null;
      });
    refreshPromiseRef.current = pending;
    return pending;
  }, [reference, resolve, source]);

  useEffect(() => {
    let active = true;
    refreshPromiseRef.current = null;
    lastRefreshAtRef.current = 0;
    if (!reference) {
      return () => { active = false; };
    }

    void resolve()
      .then((url) => {
        if (active) setState({ source, url, isLoading: false, error: null });
      })
      .catch((cause) => {
        if (!active) return;
        const error = cause instanceof Error ? cause : new Error(String(cause));
        log.warn('Private storage URL resolution failed', {
          bucket: reference.bucket,
          pathLength: reference.path.length,
          message: error.message,
        });
        setState({ source, url: '', isLoading: false, error });
      });
    return () => { active = false; };
  }, [reference, resolve, source]);

  return { ...activeState, refresh };
}
