import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { WhatsAppConnection } from '@/hooks/inbox/useConnectionsManager';

export function useConnections() {
  const [connections, setConnections] = useState<WhatsAppConnection[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('whatsapp_connections')
      .select('*')
      .order('created_at', { ascending: true });
    setConnections((data as WhatsAppConnection[]) ?? []);
    setLoading(false);
  }, []);

  return { connections, loading, refresh };
}
