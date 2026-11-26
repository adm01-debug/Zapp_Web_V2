import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
// `src/pages/**` não importa o client direto (no-restricted-imports); este é o
// re-export aprovado do mesmo client.
import { supabase } from '@/lib/supabaseHelpers';
import { log } from '@/lib/logger';
import {
  TRUSTED_DOMAINS_KEY,
  parseTrustedDomains,
  serializeTrustedDomains,
} from '@/pages/admin/trustedDomains';

export const TRUSTED_DOMAINS_QUERY_KEY = ['app-settings', TRUSTED_DOMAINS_KEY] as const;
export const PROVISIONAMENTO_QUERY_KEY = ['app-settings', TRUSTED_DOMAINS_KEY, 'provisionamento'] as const;

interface AppSettingsRow {
  key: string;
  value: string;
  updated_at: string;
}

export interface ProvisionEvent {
  id: string;
  action: string;
  created_at: string;
  email: string | null;
  dominio: string | null;
  motivo: string | null;
}

const ACOES_PROVISIONAMENTO = ['role_auto_provisioned', 'role_auto_provision_denied'];

async function fetchTrustedDomainsRow(): Promise<AppSettingsRow | null> {
  const { data, error } = await supabase
    .from('app_settings')
    .select('key, value, updated_at')
    .eq('key', TRUSTED_DOMAINS_KEY)
    .maybeSingle();
  if (error) throw error;
  return (data as AppSettingsRow | null) ?? null;
}

async function fetchProvisionamento(limite: number): Promise<ProvisionEvent[]> {
  const { data, error } = await supabase
    .from('audit_logs')
    .select('id, action, details, created_at')
    .in('action', ACOES_PROVISIONAMENTO)
    .order('created_at', { ascending: false })
    .limit(limite);
  if (error) throw error;
  const linhas = (data ?? []) as Array<{ id: string; action: string; details: unknown; created_at: string }>;
  return linhas.map((linha) => {
    const detalhes = (linha.details ?? {}) as Record<string, unknown>;
    return {
      id: linha.id,
      action: linha.action,
      created_at: linha.created_at,
      email: typeof detalhes.email === 'string' ? detalhes.email : null,
      dominio: typeof detalhes.domain === 'string' ? detalhes.domain : null,
      motivo: typeof detalhes.reason === 'string' ? detalhes.reason : null,
    };
  });
}

/**
 * Domínios confiáveis do cadastro automático (`app_settings.trusted_domains`).
 *
 * `save` grava a lista serializada e **confirma** que o banco devolveu a linha:
 * com RLS de admin a escrita recusada volta sem erro e sem linha, e sem essa
 * conferência a tela mostraria "salvo" tendo gravado nada.
 */
export function useTrustedDomains(options?: { enabled?: boolean }) {
  const queryClient = useQueryClient();
  const habilitado = options?.enabled ?? true;

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: TRUSTED_DOMAINS_QUERY_KEY,
    queryFn: fetchTrustedDomainsRow,
    enabled: habilitado,
    staleTime: 30_000,
  });

  const salvar = useCallback(async (dominios: string[]): Promise<string> => {
    const value = serializeTrustedDomains(dominios);
    const updated_at = new Date().toISOString();
    const { data: linhas, error: erroGravacao } = await supabase
      .from('app_settings')
      .upsert({ key: TRUSTED_DOMAINS_KEY, value, updated_at }, { onConflict: 'key' })
      .select('key, value, updated_at');
    if (erroGravacao) {
      log.error('Error saving trusted domains:', erroGravacao);
      throw erroGravacao;
    }
    if (!linhas || linhas.length === 0) {
      throw new Error('O banco não confirmou a gravação dos domínios (nenhuma linha retornada).');
    }
    queryClient.setQueryData<AppSettingsRow | null>(
      TRUSTED_DOMAINS_QUERY_KEY,
      linhas[0] as AppSettingsRow,
    );
    return value;
  }, [queryClient]);

  return {
    dominios: parseTrustedDomains(data?.value),
    valorSalvo: data?.value ?? null,
    atualizadoEm: data?.updated_at ?? null,
    semLinha: !isLoading && !error && data === null,
    isLoading,
    error: error ? (error as Error).message : null,
    salvar,
    refetch,
  };
}

/** Quem foi aceito/recusado pelo cadastro automático, mais recente primeiro. */
export function useProvisionamentoRecente(limite = 8, options?: { enabled?: boolean }) {
  const { data, isLoading, error } = useQuery({
    queryKey: [...PROVISIONAMENTO_QUERY_KEY, limite],
    queryFn: () => fetchProvisionamento(limite),
    enabled: options?.enabled ?? true,
    staleTime: 30_000,
  });

  return {
    eventos: data ?? [],
    isLoading,
    error: error ? (error as Error).message : null,
  };
}