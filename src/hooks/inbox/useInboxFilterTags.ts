import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface InboxFilterTag { id: string; name: string; color: string; }

export function useInboxFilterTags() {
  return useQuery({
    queryKey: ['inbox-filter-tags'],
    queryFn: async (): Promise<InboxFilterTag[]> => {
      const { data } = await supabase.from('contacts').select('tags').not('tags', 'is', null);
      const tagSet = new Set<string>();
      (data || []).forEach(c => (c.tags || []).forEach((t: string) => tagSet.add(t)));
      return [...tagSet].sort((a, b) => a.localeCompare(b)).map(name => ({ id: name, name, color: '#6366f1' }));
    },
    staleTime: 60_000,
  });
}
