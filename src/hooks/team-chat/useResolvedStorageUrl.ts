import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

const BUCKET = 'team-chat-files';
const TTL_SECONDS = 3600;

export function useResolvedStorageUrl(path: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!path) {
      setUrl(null);
      return;
    }
    let cancelled = false;
    supabase.storage
      .from(BUCKET)
      .createSignedUrl(path, TTL_SECONDS)
      .then(({ data }) => {
        if (!cancelled && data?.signedUrl) setUrl(data.signedUrl);
      });
    return () => {
      cancelled = true;
    };
  }, [path]);

  return url;
}
