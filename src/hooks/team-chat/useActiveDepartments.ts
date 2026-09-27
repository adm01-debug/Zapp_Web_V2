import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface ActiveDepartment {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
}

export function useActiveDepartments(enabled: boolean) {
  return useQuery<ActiveDepartment[]>({
    queryKey: ['departmentChat', 'list'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('departments')
        .select('id, name, description, is_active')
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return (data ?? []) as ActiveDepartment[];
    },
    enabled,
    staleTime: 30 * 1000,
  });
}
