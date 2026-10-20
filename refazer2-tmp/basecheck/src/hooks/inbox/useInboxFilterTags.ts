import { useQuery } from '@tanstack/react-query';
import { fetchInboxFilterTags, type InboxFilterTag } from '@/services/inbox.service';

export type { InboxFilterTag };

/**
 * #179 (TRA-011) — a lista distinta de etiquetas NÃO pode sair de um `select().not()` sem `range`:
 * o PostgREST devolve só a primeira página (teto do projeto), então etiquetas que só aparecem depois
 * da primeira página some do filtro em silêncio. A leitura é paginada por `id` (chave única) via
 * `fetchAllRows`; se a leitura falhar no meio, o erro sobe em vez de devolver uma lista parcial como
 * se fosse o universo inteiro.
 *
 * A leitura mora na camada de serviços (`src/services/inbox.service.ts`): este hook não fala com o
 * Supabase direto.
 */
export function useInboxFilterTags() {
  return useQuery({
    queryKey: ['inbox-filter-tags'],
    queryFn: fetchInboxFilterTags,
    staleTime: 60_000,
  });
}
