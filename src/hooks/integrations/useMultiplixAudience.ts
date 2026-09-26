import { useQuery, useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

async function invokeMultiplixAudience<T>(action: string, params?: Record<string, unknown>): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated');
  const response = await supabase.functions.invoke('multiplix-audience', {
    body: { action, params },
    headers: { Authorization: `Bearer ${session.access_token}` },
  });
  if (response.error) throw new Error(response.error.message);
  return (response.data as { data: T }).data;
}

export interface MultiplixRamo { ramo_atividade: string; total: number }
export interface MultiplixUf { uf: string; total: number }

export interface MultiplixAudienceRow {
  company_id: string;
  company_name: string;
  ramo_atividade: string;
  uf: string | null;
  is_customer: boolean;
  is_supplier: boolean;
  is_carrier: boolean;
  destino_e164: string | null;
  destino_origem: string;
  motivo_inclusao: string;
}

export interface MultiplixSearchFilters {
  roles?: Array<'cliente' | 'fornecedor' | 'transportadora'>;
  ramo?: string;
  uf?: string;
  search?: string;
}

export function useMultiplixRamos() {
  return useQuery<MultiplixRamo[], Error>({
    queryKey: ['multiplix-ramos'],
    queryFn: () => invokeMultiplixAudience('list_ramos'),
    staleTime: 5 * 60 * 1000,
  });
}

export function useMultiplixUfs() {
  return useQuery<MultiplixUf[], Error>({
    queryKey: ['multiplix-ufs'],
    queryFn: () => invokeMultiplixAudience('list_ufs'),
    staleTime: 5 * 60 * 1000,
  });
}

export function useMultiplixSearch() {
  return useMutation({
    mutationFn: (filters: MultiplixSearchFilters & { page?: number; page_size?: number }) =>
      invokeMultiplixAudience<MultiplixAudienceRow[]>('search', filters),
  });
}

export function useMultiplixCount() {
  return useMutation({
    mutationFn: (filters: MultiplixSearchFilters) =>
      invokeMultiplixAudience<number>('count', filters),
  });
}
