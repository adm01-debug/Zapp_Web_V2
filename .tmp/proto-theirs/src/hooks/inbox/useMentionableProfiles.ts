import { useEffect, useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { escapeLikeWildcards } from '@/lib/emailThreadQuery';
import { fetchAllRows } from '@/lib/fetchAllRows';

/**
 * Colegas mencionáveis nas notas internas.
 *
 * Antes a lista vinha de um `select(...).eq('is_active', true).limit(20)` sem
 * ordem e sem filtro, e o termo digitado era aplicado no cliente: a partir do
 * 21º colega ativo ninguém mais aparecia para ser marcado, porque a linha nem
 * chegava ao navegador. Agora a busca é do servidor (`ilike` no nome), ordenada
 * (`name`, desempate `id`) e limitada a 20 linhas por consulta, com debounce.
 */

/** Teto de linhas devolvidas por consulta da lista de menção. */
export const MENTIONABLE_PROFILES_LIMIT = 20;

/** Espera antes de virar consulta: a busca sai por pausa, não por tecla. */
export const MENTIONABLE_PROFILES_DEBOUNCE_MS = 250;

export interface MentionableProfile {
  id: string;
  name: string;
  avatar_url: string | null;
}

/** Padrão `ilike` do termo já aparado: curingas digitados pelo usuário viram literal. */
export function mentionSearchPattern(term: string): string {
  return `%${escapeLikeWildcards(term.trim())}%`;
}

export function mentionableProfilesQueryKey(term: string) {
  return ['mentionable-profiles', term] as const;
}

export const mentionableProfileNamesQueryKey = ['mentionable-profile-names'] as const;

/** Valor que só é propagado depois de `delayMs` sem mudanças. */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

export function useMentionableProfiles(query: string) {
  const term = useDebouncedValue(query.trim(), MENTIONABLE_PROFILES_DEBOUNCE_MS);

  return useQuery({
    queryKey: mentionableProfilesQueryKey(term),
    queryFn: async (): Promise<MentionableProfile[]> => {
      const base = supabase
        .from('profiles')
        .select('id, name, avatar_url')
        .eq('is_active', true);
      const filtrada = term ? base.ilike('name', mentionSearchPattern(term)) : base;
      const { data, error } = await filtrada
        .order('name', { ascending: true })
        .order('id', { ascending: true })
        .limit(MENTIONABLE_PROFILES_LIMIT);
      if (error) throw error;
      return (data ?? []).filter(
        (row): row is MentionableProfile => typeof row.name === 'string' && row.name.trim().length > 0,
      );
    },
    // A lista não some enquanto a próxima consulta não chega (o termo muda a
    // cada pausa da digitação); sem isso o dropdown pisca vazio.
    placeholderData: keepPreviousData,
    staleTime: 60_000,
  });
}

/**
 * Nomes de TODOS os colegas ativos, para o selo das notas reconhecer o nome
 * inteiro (inclusive quem não estaria no top 20 da lista de busca). Leitura
 * paginada por `id` — nunca uma amostra.
 */
export function useMentionableProfileNames() {
  return useQuery({
    queryKey: mentionableProfileNamesQueryKey,
    queryFn: async (): Promise<string[]> => {
      const { rows } = await fetchAllRows<{ name: string | null }>((from, to) =>
        supabase
          .from('profiles')
          .select('id, name')
          .eq('is_active', true)
          .order('id', { ascending: true })
          .range(from, to),
      );
      return rows
        .map((row) => row.name)
        .filter((name): name is string => Boolean(name && name.trim()));
    },
    staleTime: 5 * 60_000,
  });
}
