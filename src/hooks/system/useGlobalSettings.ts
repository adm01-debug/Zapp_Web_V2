import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { log } from '@/lib/logger';

export interface GlobalSetting {
  id: string;
  key: string;
  value: string | null;
  description: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Chave única do cache compartilhado das configurações globais.
 *
 * Definida UMA vez, aqui: enquanto era uma string local, cada componente que
 * recriava a chave podia divergir dela e o cache não se encontrava. Exportada para
 * quem quiser invalidar/preencher sem consultar o banco de novo.
 */
export const GLOBAL_SETTINGS_QUERY_KEY = ['global-settings'] as const;

// Lista vazia estável: `data ?? []` criaria um array novo a cada render e mexeria
// na identidade de `settings` para quem depende dela.
const SEM_CONFIGURACOES: GlobalSetting[] = [];

async function fetchGlobalSettings(): Promise<GlobalSetting[]> {
  const { data, error } = await supabase
    .from('global_settings')
    .select('*')
    .order('key');
  if (error) throw error;
  return (data as GlobalSetting[] | null) ?? SEM_CONFIGURACOES;
}

/**
 * Configurações globais (tabela `global_settings`).
 *
 * A lista vive no cache do React Query sob `GLOBAL_SETTINGS_QUERY_KEY`: qualquer
 * número de componentes montados ao mesmo tempo divide UMA consulta, o valor
 * atualizado por um deles aparece imediatamente nos outros e uma instância que
 * monta depois já encontra o dado (não repassa o carregando).
 */
export function useGlobalSettings() {
  const queryClient = useQueryClient();

  const { data: settings = SEM_CONFIGURACOES, isLoading } = useQuery({
    queryKey: GLOBAL_SETTINGS_QUERY_KEY,
    queryFn: fetchGlobalSettings,
    staleTime: 5 * 60 * 1000, // 5 min — deduplica entre todos os consumidores
    gcTime: 10 * 60 * 1000,
  });

  const getSetting = useCallback((key: string): string | null => {
    return settings.find(s => s.key === key)?.value ?? null;
  }, [settings]);

  const updateSetting = useCallback(async (key: string, value: string) => {
    try {
      const { data, error } = await supabase
        .from('global_settings')
        .update({ value })
        .eq('key', key)
        .select('key');
      if (error) throw error;
      if (!data || data.length === 0) {
        throw new Error('Nenhum registro de global_settings foi atualizado para a chave ' + key);
      }
      // Uma linha confirmada pelo banco: escreve no cache compartilhado, alcançando
      // todas as instâncias do hook (antes só o estado local de quem chamou mudava).
      queryClient.setQueryData<GlobalSetting[]>(GLOBAL_SETTINGS_QUERY_KEY, prev =>
        (prev ?? SEM_CONFIGURACOES).map(s => s.key === key ? { ...s, value } : s),
      );
    } catch (err) {
      log.error('Error updating global setting:', err);
      throw err;
    }
  }, [queryClient]);

  const addSetting = useCallback(async (key: string, value: string, description?: string) => {
    try {
      const { data, error } = await supabase
        .from('global_settings')
        .upsert({ key, value, description }, { onConflict: 'key' })
        .select()
        .single();
      if (error) throw error;
      await queryClient.invalidateQueries({ queryKey: GLOBAL_SETTINGS_QUERY_KEY });
      return data;
    } catch (err) {
      log.error('Error adding global setting:', err);
      throw err;
    }
  }, [queryClient]);

  const refetch = useCallback(
    () => queryClient.invalidateQueries({ queryKey: GLOBAL_SETTINGS_QUERY_KEY }),
    [queryClient],
  );

  return { settings, isLoading, getSetting, updateSetting, addSetting, refetch };
}
