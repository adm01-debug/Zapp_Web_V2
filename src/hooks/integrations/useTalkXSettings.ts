import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface SettingRow {
  key: string;
  value: unknown;
  description: string | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as unknown as any;

async function fetchSettings(): Promise<SettingRow[]> {
  const { data, error } = await db
    .from('talkx_settings')
    .select('key, value, description')
    .order('key');
  if (error) throw error;
  return (data ?? []) as SettingRow[];
}

export function useTalkXSettings() {
  return useQuery<SettingRow[], Error>({
    queryKey: ['talkx-settings'],
    queryFn: fetchSettings,
    staleTime: 5 * 60 * 1000,
  });
}

export function useTalkXSettingUpdate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ key, raw }: { key: string; raw: string }) => {
      let parsed: unknown;
      try { parsed = JSON.parse(raw); } catch { parsed = raw; }
      const { error } = await db
        .from('talkx_settings')
        .update({ value: parsed, updated_at: new Date().toISOString() })
        .eq('key', key);
      if (error) throw error;
      return key;
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['talkx-settings'] });
    },
  });
}
