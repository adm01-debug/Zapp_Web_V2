import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { fetchAllRows } from '@/lib/fetchAllRows';

export interface InboxFilterTag { id: string; name: string; color: string; }

/**
 * #179 (TRA-011) — a lista distinta de etiquetas NÃO pode sair de um `select().not()` sem `range`:
 * o PostgREST devolve só a primeira página (teto do projeto), então etiquetas que só aparecem depois
 * da primeira página some do filtro em silêncio. A leitura é paginada por `id` (chave única) via
 * `fetchAllRows`; se a leitura falhar no meio, o erro sobe em vez de devolver uma lista parcial como
 * se fosse o universo inteiro.
 */
export function useInboxFilterTags() {
  return useQuery({
    queryKey: ['inbox-filter-tags'],
    queryFn: async (): Promise<InboxFilterTag[]> => {
      const { rows, error } = await fetchAllRows<{ tags: string[] | null }>(
        (from, to) => supabase
          .from('contacts')
          .select('tags')
          .not('tags', 'is', null)
          .order('id')
          .range(from, to),
      );
      if (error) throw new Error(error.message);

      const tagSet = new Set<string>();
      rows.forEach((c) => (c.tags || []).forEach((t: string) => tagSet.add(t)));
      return [...tagSet].sort((a, b) => a.localeCompare(b)).map(name => ({ id: name, name, color: '#6366f1' }));
    },
    staleTime: 60_000,
  });
}
