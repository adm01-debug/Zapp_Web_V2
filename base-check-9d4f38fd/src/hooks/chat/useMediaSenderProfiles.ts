/**
 * Perfis dos atendentes que enviaram arquivos (R01 / D04).
 *
 * Recebe a lista de `agentId` dos itens CARREGADOS e resolve os perfis (nome, apelido e
 * foto) em UMA consulta em lote (`.in('id', ids)`) — nunca uma por cartao. A chave do
 * react-query e o conjunto ORDENADO e sem repeticao de ids, entao a mesma tela nao gera
 * consulta nova e a lista que cresce so pede os ids que ainda faltam (o cache das chaves
 * anteriores e reaproveitado). Erro/RLS negado devolve mapa vazio e marca `isError`: a
 * identidade do remetente cai nas iniciais em vez de derrubar a galeria, e a tela ainda
 * distingue "sem perfil" de "falhou".
 */
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { SenderProfile, SenderProfileMap } from '@/lib/fileSenderIdentity';

/** Colunas de `profiles` que a identidade do remetente usa. */
const PROFILE_COLUMNS = 'id, name, nickname, avatar_url';

/** Prefixo da chave: `getQueriesData` casa por prefixo e acha qualquer conjunto de ids. */
export const MEDIA_SENDER_PROFILES_KEY = 'media-sender-profiles';

/** Ids unicos (sem nulos/vazios) em ordem estavel — a ordem da lista nao cria cache novo. */
export function normalizeSenderIds(
  agentIds: readonly (string | null | undefined)[] | null | undefined,
): string[] {
  if (!agentIds?.length) return [];
  const unique = new Set<string>();
  for (const id of agentIds) {
    const trimmed = id?.trim();
    if (trimmed) unique.add(trimmed);
  }
  return Array.from(unique).sort();
}

/** Chave estavel por conjunto ordenado de ids. */
export const mediaSenderProfilesKey = (ids: readonly string[]) =>
  [MEDIA_SENDER_PROFILES_KEY, normalizeSenderIds(ids)] as const;

/** Perfis ja resolvidos por consultas anteriores (qualquer conjunto de ids). */
function knownProfiles(queryClient: QueryClient): SenderProfileMap {
  const known: SenderProfileMap = {};
  for (const [, data] of queryClient.getQueriesData<SenderProfileMap>({
    queryKey: [MEDIA_SENDER_PROFILES_KEY],
  })) {
    if (!data) continue;
    for (const [id, profile] of Object.entries(data)) if (profile) known[id] = profile;
  }
  return known;
}

/**
 * Núcleo do lote: consulta os ids que faltam e devolve o mapa junto do erro (se houver).
 * Exportada para teste direto do lote/cache. NÃO lança — quem decide entre lançar (hook,
 * para a UI ver `isError`) e devolver mapa vazio (Journey, que cai no "Atendente") é o
 * chamador.
 */
export async function loadSenderProfiles(
  queryClient: QueryClient,
  ids: readonly string[],
): Promise<{ profiles: SenderProfileMap; error: unknown | null }> {
  const wanted = normalizeSenderIds(ids);
  if (wanted.length === 0) return { profiles: {}, error: null };

  const known = knownProfiles(queryClient);
  const missing = wanted.filter((id) => !known[id]);
  if (missing.length === 0) return { profiles: known, error: null };

  const { data, error } = await supabase
    .from('profiles')
    .select(PROFILE_COLUMNS)
    .in('id', missing);
  if (error) return { profiles: {}, error };

  const map: SenderProfileMap = { ...known };
  for (const row of data ?? []) {
    if (!row.id) continue;
    map[row.id] = {
      id: row.id,
      name: row.name ?? null,
      nickname: row.nickname ?? null,
      avatar_url: row.avatar_url ?? null,
    };
  }
  return { profiles: map, error: null };
}

/**
 * Uma consulta para os ids que faltam; os ja cacheados vem do react-query sem ir ao banco.
 * RLS negado ou falha de rede: loga e devolve mapa vazio, sem excecao (a UI usa as
 * iniciais) — contrato consumido pelo Journey (`useJourneyActors`). O hook
 * `useMediaSenderProfiles` usa `loadSenderProfiles` e LANÇA no erro, para a UI distinguir
 * "sem perfil" de "falhou".
 */
export async function fetchSenderProfiles(
  queryClient: QueryClient,
  ids: readonly string[],
): Promise<SenderProfileMap> {
  const { profiles, error } = await loadSenderProfiles(queryClient, ids);
  if (error) {
    console.error('[useMediaSenderProfiles] falha ao carregar os perfis dos remetentes', error);
    return {};
  }
  return profiles;
}

export interface MediaSenderProfilesState {
  /** Perfil por `profiles.id`; vazio enquanto carrega ou quando o RLS negou. */
  profiles: SenderProfileMap;
  /** Ha consulta em voo (com ids para buscar). */
  isLoading: boolean;
  /** A consulta falhou (rede/RLS): a UI distingue "sem perfil" de "falhou". */
  isError: boolean;
}

/** Referencia estavel para o estado sem perfis (nao recria o objeto a cada render). */
const EMPTY_PROFILES: SenderProfileMap = {};

export function useMediaSenderProfiles(
  agentIds: readonly (string | null | undefined)[] | null | undefined,
): MediaSenderProfilesState {
  const queryClient = useQueryClient();
  const ids = normalizeSenderIds(agentIds);

  const query = useQuery({
    queryKey: mediaSenderProfilesKey(ids),
    queryFn: async () => {
      const { profiles, error } = await loadSenderProfiles(queryClient, ids);
      if (error) {
        console.error('[useMediaSenderProfiles] falha ao carregar os perfis dos remetentes', error);
        throw error instanceof Error
          ? error
          : new Error('Falha ao carregar os perfis dos remetentes');
      }
      return profiles;
    },
    enabled: ids.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  return {
    profiles: query.data ?? EMPTY_PROFILES,
    isLoading: ids.length > 0 && query.isLoading,
    isError: query.isError,
  };
}

export type { SenderProfile, SenderProfileMap };
