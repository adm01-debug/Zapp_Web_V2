import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface ActiveDepartment {
  id: string;
  name: string;
}

export function useActiveDepartments(enabled: boolean) {
  return useQuery<ActiveDepartment[]>({
    queryKey: ['active-departments'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('departments')
        .select('id, name')
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return (data ?? []) as ActiveDepartment[];
    },
    enabled,
    staleTime: 5 * 60 * 1000,
  });
}
