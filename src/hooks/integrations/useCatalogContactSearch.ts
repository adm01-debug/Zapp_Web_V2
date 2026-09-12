/**
 * Busca de contatos usada pelo fluxo de envio de produto do Catálogo
 * (SendProductDialog / ContactSelectionStep). Isolado aqui — e não em
 * src/components/catalog/ — porque a camada de apresentação não fala
 * com o Supabase direto (no-restricted-imports em src/components/**).
 */
import { supabase } from '@/integrations/supabase/client';
import type { ContactResult } from '@/components/catalog/useSendProduct';

/** Sem `query`: 15 contatos mais recentes. Com `query`: nome ou telefone. */
export async function fetchCatalogContactResults(query: string): Promise<ContactResult[]> {
  const trimmed = query.trim();
  const request = trimmed
    ? supabase
        .from('contacts')
        .select('id, name, phone, avatar_url')
        .or(`name.ilike.%${trimmed}%,phone.ilike.%${trimmed}%`)
        .limit(15)
    : supabase
        .from('contacts')
        .select('id, name, phone, avatar_url')
        .order('updated_at', { ascending: false })
        .limit(15);
  const { data } = await request;
  return data || [];
}
