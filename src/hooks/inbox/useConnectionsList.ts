import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { queryClient } from '@/lib/queryClient';

/**
 * Camada unica de leitura de `whatsapp_connections`.
 *
 * Antes cada tela montava a propria consulta, com filtro proprio: a faixa de
 * desconexao lia as `disconnected`, o "nova conversa" lia as `connected`, o
 * envio de midia do ChatPanel resolvia a instancia com dois SELECTs e o status
 * do WhatsApp repetia o filtro por telefone. Duas telas montadas = duas ou mais
 * requisicoes da MESMA tabela, com a mesma RLS.
 *
 * Aqui a leitura mora numa unica entrada do React Query (`['connections']`):
 * 30s de validade, uma requisicao em voo compartilhada e o cache servindo quem
 * monta depois. Quem precisa reagir a mudanca usa `useConnectionsList`
 * (observer) ou `loadConnectionsList` (leitura pontual dentro de um `await`).
 *
 * Colunas EXPLICITAS, sem segredos: a tabela guarda `qr_code` e
 * `instance_token_secret_id`, que nenhuma tela desta lista precisa — o SELECT
 * nao os pede.
 */
export const connectionsQueryKey = ['connections'] as const;

/**
 * 30s: a lista/status mudam por evento de realtime (que invalida esta chave),
 * entao um cache curto evita rajada de requisicao sem servir dado velho por
 * muito tempo.
 */
export const CONNECTIONS_STALE_TIME = 30_000;

/** Colunas seguras da lista — sem `qr_code` e sem `instance_token_secret_id`. */
export const CONNECTIONS_LIST_COLUMNS =
  'id, name, phone_number, status, instance_id, is_default, created_at';

export interface ConnectionListItem {
  id: string;
  name: string;
  phone_number: string | null;
  status: string | null;
  instance_id: string | null;
  is_default: boolean | null;
  created_at: string;
}

/**
 * Unica funcao que fala com `whatsapp_connections`. O `.order('created_at')`
 * fixa a ordem: quem escolhe "a primeira conexao conectada" como fallback nao
 * pode depender da ordem que o PostgREST devolver.
 */
export async function fetchConnectionsList(): Promise<ConnectionListItem[]> {
  const { data, error } = await supabase
    .from('whatsapp_connections')
    .select(CONNECTIONS_LIST_COLUMNS)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data ?? []) as ConnectionListItem[];
}

/**
 * Leitura pontual do cache compartilhado (para hooks que chamam dentro de um
 * `await`): mesma chave e mesmo `staleTime` do `useConnectionsList`, entao
 * compartilha a requisicao em voo e o cache.
 */
export function loadConnectionsList(): Promise<ConnectionListItem[]> {
  return queryClient.fetchQuery({
    queryKey: connectionsQueryKey,
    queryFn: fetchConnectionsList,
    staleTime: CONNECTIONS_STALE_TIME,
  });
}

/**
 * Derruba o cache compartilhado (realtime/mutacao). Quem esta montado com
 * `useConnectionsList` recarrega; quem usa `loadConnectionsList` recebe dado
 * fresco na proxima leitura.
 */
export function invalidateConnectionsList(): Promise<void> {
  return queryClient.invalidateQueries({ queryKey: connectionsQueryKey });
}

/**
 * Lista compartilhada para componentes. Recebe o `queryClient` do modulo (o
 * mesmo de `loadConnectionsList`) de proposito: os consumidores desta tabela
 * vivem em telas/hooks que nao montam `QueryClientProvider` proprio (faixa de
 * desconexao), e a chave precisa ser a mesma para o cache ser um so.
 */
export function useConnectionsList() {
  return useQuery(
    {
      queryKey: connectionsQueryKey,
      queryFn: fetchConnectionsList,
      staleTime: CONNECTIONS_STALE_TIME,
    },
    queryClient,
  );
}
