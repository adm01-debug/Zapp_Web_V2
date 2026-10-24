import { supabase } from '@/integrations/supabase/client';
import { fetchAllRows } from '@/lib/fetchAllRows';

export interface InboxFilterTag {
  id: string;
  name: string;
  color: string;
}

/** Cor do chip de etiqueta do filtro: o mesmo indigo já usado no filtro da inbox. */
const TAG_COLOR = '#6366f1';

/**
 * Lista distinta de etiquetas dos contatos, para o filtro da inbox (#179 / TRA-011).
 *
 * A leitura NÃO pode ser um `select().not()` sem `range`: o PostgREST devolve só a
 * primeira página (teto do projeto) e as etiquetas que só aparecem depois dela
 * sumiriam do filtro em silêncio. Por isso a paginação por `id` (chave única) via
 * `fetchAllRows`; se a leitura falhar no meio, o erro sobe em vez de devolver uma
 * lista parcial como se fosse o universo inteiro.
 *
 * Mora na camada de serviços: o hook `useInboxFilterTags` não fala com o Supabase.
 */
export async function fetchInboxFilterTags(): Promise<InboxFilterTag[]> {
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
  rows.forEach((c) => (c.tags || []).forEach((t) => tagSet.add(t)));

  return [...tagSet]
    .sort((a, b) => a.localeCompare(b))
    .map((name) => ({ id: name, name, color: TAG_COLOR }));
}
