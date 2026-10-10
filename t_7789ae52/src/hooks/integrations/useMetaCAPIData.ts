import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';

export interface CAPIEvent {
  id: string;
  event_name: string;
  event_time: string;
  contact_id: string | null;
  pixel_id: string | null;
  action_source: string;
  custom_data: Json;
  sent_to_meta: boolean;
  created_at: string;
}

export function useMetaCAPIData() {
  return useQuery({
    queryKey: ['meta-capi-dashboard'],
    queryFn: async () => {
      const [eventsResult, settingsResult] = await Promise.all([
        supabase
          .from('meta_capi_events')
          .select('*')
          .order('event_time', { ascending: false })
          .limit(100),
        supabase
          .from('global_settings')
          .select('key, value')
          .in('key', ['meta_pixel_id', 'meta_capi_auto_track']),
      ]);

      if (eventsResult.error) throw eventsResult.error;

      const settings = settingsResult.data ?? [];
      const pixelId = settings.find(({ key }) => key === 'meta_pixel_id')?.value ?? '';
      const autoTrack = settings.find(({ key }) => key === 'meta_capi_auto_track')?.value === 'true';

      return {
        events: eventsResult.data as CAPIEvent[],
        pixelId,
        autoTrack,
      };
    },
    staleTime: 30_000,
    // O QueryClient global desativa refetchOnMount. Esta tela não mantém um
    // canal realtime ativo, então precisa revalidar mudanças feitas enquanto
    // esteve desmontada.
    refetchOnMount: 'always',
  });
}
