import { useEffect } from 'react';
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/auth/useAuth';
import type { AppRole } from '@/services/role.service';

/**
 * Boot do app em UMA chamada (RPC `app_bootstrap`, migration 20261015223614).
 *
 * Este hook nao decide interface: ele faz a leitura unica do boot e HIDRATA o
 * cache do React Query das chaves que os hooks existentes ja usam — hoje
 * `['user-roles', userId]` (useUserRole) e `['my-profile', userId]` (Metas) —
 * sem mudar a assinatura de nenhum deles. Quem consome continua chamando
 * useUserRole() normalmente.
 *
 * FALHA NAO VIRA DADO VAZIO: erro de rede/banco (ou um RPC que responde
 * `{ error: ... }`) sobe como AppBootstrapError. O hook que caiu no caminho
 * antigo continua no comando do que mostrar.
 */

export interface AppBootstrapPermission {
  id: string;
  name: string;
  description: string | null;
  category: string;
}

export interface AppBootstrapRolePermission {
  role: AppRole;
  permission_id: string;
  permission: AppBootstrapPermission | null;
}

export interface AppBootstrapGlobalSetting {
  id: string;
  key: string;
  value: string | null;
  description: string | null;
}

/** Recorte do RPC: tudo do PROPRIO auth.uid(), nunca de outro usuario. */
export interface AppBootstrapData {
  profile: { id: string; name: string | null; [campo: string]: unknown } | null;
  roles: AppRole[];
  permissions: AppBootstrapPermission[];
  role_permissions: AppBootstrapRolePermission[];
  global_settings: AppBootstrapGlobalSetting[];
  user_settings: Record<string, unknown> | null;
  departments: Array<Record<string, unknown>>;
  unread_notifications: number;
  fetched_at: string;
}

export const APP_BOOTSTRAP_STALE_TIME_MS = 1000 * 60 * 5;

/** Erro do boot: nem silencio, nem lista vazia disfarcada de "sem papel". */
export class AppBootstrapError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AppBootstrapError';
  }
}

export function appBootstrapQueryKey(userId?: string | null) {
  return ['app-bootstrap', userId] as const;
}

/** Mesma chave usada por useUserRole — o boot escreve nela, nao cria uma nova. */
export function userRolesQueryKey(userId?: string | null) {
  return ['user-roles', userId] as const;
}

/** Mesma chave das telas de Metas (useGoalsDashboard / GoalsConfigDialog: id, name). */
export function myProfileQueryKey(userId?: string | null) {
  return ['my-profile', userId] as const;
}

function isAppBootstrapData(value: unknown): value is AppBootstrapData {
  // Resposta coja (ex.: `{ error: 'not_authenticated' }`, `true`, `null`) nao
  // entra no cache como se fosse o boot completo.
  return (
    typeof value === 'object' &&
    value !== null &&
    Array.isArray((value as AppBootstrapData).roles) &&
    Array.isArray((value as AppBootstrapData).role_permissions)
  );
}

export async function fetchAppBootstrap(): Promise<AppBootstrapData> {
  const { data, error } = await supabase.rpc('app_bootstrap');
  if (error) throw new AppBootstrapError(error.message);

  const payload = data as unknown as (AppBootstrapData & { error?: string }) | null;
  if (payload && typeof payload === 'object' && typeof payload.error === 'string') {
    throw new AppBootstrapError(`bootstrap recusado pelo banco: ${payload.error}`);
  }
  if (!isAppBootstrapData(payload)) {
    throw new AppBootstrapError('bootstrap devolveu uma resposta incompleta');
  }
  return payload;
}

/**
 * Escreve o resultado do boot nas chaves dos hooks que JA existem. Exportado
 * para o teste provar a hidratacao sem render (e reusavel por quem chamar a
 * RPC fora do React).
 */
export function seedAppBootstrapCaches(
  queryClient: QueryClient,
  userId: string,
  data: AppBootstrapData,
): void {
  queryClient.setQueryData(userRolesQueryKey(userId), data.roles ?? []);
  const profile = data.profile;
  if (profile && typeof profile.id === 'string') {
    queryClient.setQueryData(myProfileQueryKey(userId), {
      id: profile.id,
      name: profile.name ?? null,
    });
  }
}

export function useAppBootstrap() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const userId = user?.id ?? null;

  const query = useQuery({
    queryKey: appBootstrapQueryKey(userId),
    queryFn: async ({ queryKey }) => {
      const data = await fetchAppBootstrap();
      // Hidrata ANTES de resolver: quando o consumidor vir o `data` do boot, a
      // chave ['user-roles', userId] ja esta fresca e nao dispara a leitura
      // direta de user_roles (era essa a segunda requisicao do boot).
      const alvo = queryKey[1];
      if (typeof alvo === 'string') seedAppBootstrapCaches(queryClient, alvo, data);
      return data;
    },
    enabled: !!userId,
    staleTime: APP_BOOTSTRAP_STALE_TIME_MS,
    // Sem retry: o boot nao segura a tela. Se o RPC falhar, o caminho antigo
    // (leitura direta + checagens nomeadas) assume na hora e o erro fica
    // exposto em `bootstrapError`.
    retry: 0,
  });

  const data = query.data ?? null;

  // Sem usuario o cache nao pode guardar dado de sessao anterior.
  useEffect(() => {
    if (!userId) queryClient.removeQueries({ queryKey: ['app-bootstrap'] });
  }, [queryClient, userId]);

  return {
    data,
    isLoading: !!userId && query.isLoading,
    isError: !!userId && query.isError,
    error: (query.error as Error | null) ?? null,
    refetch: query.refetch,
  };
}
