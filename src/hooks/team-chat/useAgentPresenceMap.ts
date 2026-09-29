import { useEffect, useState } from 'react';
// eslint-disable-next-line no-restricted-imports
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/auth/useAuth';

export function useAgentPresenceMap(): Map<string, boolean> {
  const { profile } = useAuth();
  const [presenceMap, setPresenceMap] = useState<Map<string, boolean>>(new Map());

  useEffect(() => {
    if (!profile?.id) return;
    const channel = supabase.channel('team-agent-presence', {
      config: { presence: { key: profile.id } },
    });
    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const map = new Map<string, boolean>();
        Object.keys(state).forEach(key => map.set(key, true));
        setPresenceMap(map);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({ profileId: profile.id, onlineAt: new Date().toISOString() });
        }
      });
    return () => { void supabase.removeChannel(channel); };
  }, [profile?.id]);

  return presenceMap;
}
