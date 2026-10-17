/**
 * CT-55 — carrega UM contato por id para o deep link
 * `?view=catalog&product=<id>&send=1&contact=<id>`.
 *
 * O `SendProductDialog` recebe `presetContact: ContactResult` (id, name, phone,
 * avatar_url). Só o id não basta: sem nome/telefone o card-resumo do contato
 * abre vazio. Também não dá para montar isso no componente — a camada de
 * apresentação não fala com o Supabase direto (no-restricted-imports).
 *
 * Devolve `null` quando o id não existe OU quando a RLS de `contacts` não
 * deixa ler: nesse caso o dialog cai no passo normal de seleção de contato, em
 * vez de abrir com um contato fantasma.
 */
import { supabase } from '@/integrations/supabase/client';
import type { ContactResult } from '@/components/catalog/useSendProduct';

export async function fetchCatalogContactPreset(contactId: string): Promise<ContactResult | null> {
  const { data, error } = await supabase
    .from('contacts')
    .select('id, name, phone, avatar_url')
    .eq('id', contactId)
    .maybeSingle();
  if (error || !data) return null;
  return {
    id: data.id,
    name: data.name,
    phone: data.phone,
    avatar_url: data.avatar_url ?? null,
  };
}
