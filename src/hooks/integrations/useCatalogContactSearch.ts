/**
 * Busca de contatos usada pelo fluxo de envio de produto do Catálogo
 * (SendProductDialog / ContactSelectionStep). Isolado aqui — e não em
 * src/components/catalog/ — porque a camada de apresentação não fala
 * com o Supabase direto (no-restricted-imports em src/components/**).
 */
import { supabase } from '@/integrations/supabase/client';
import { getLogger } from '@/lib/logger';

const log = getLogger('CatalogSendEvents');
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

// ─── logCatalogSendEvent (E28) ──────────────────────────────────
export type CatalogSendStatus = 'sent' | 'partial' | 'failed';
export type CatalogSendTemplate = 'formal' | 'informal' | 'promo' | 'custom';

export interface CatalogSendEventInput {
  productId: string;
  productName: string;
  productSku?: string | null;
  variantLabel?: string | null;
  contactId: string;
  /** profiles.id de quem enviou — não auth.users.id (mesma convenção de csat_surveys.agent_id). */
  agentId?: string | null;
  template?: CatalogSendTemplate | null;
  imagesCount: number;
  messageLength: number;
  status: CatalogSendStatus;
  messageIds: string[];
}

/** Loga 1 evento de envio em catalog_send_events (E28). Falha silenciosa
 * (log apenas) — nunca deve impedir o envio real já concluído. */
export async function logCatalogSendEvent(input: CatalogSendEventInput): Promise<void> {
  const { error } = await supabase.from('catalog_send_events').insert({
    product_id: input.productId,
    product_name: input.productName,
    product_sku: input.productSku ?? null,
    variant_label: input.variantLabel ?? null,
    contact_id: input.contactId,
    agent_id: input.agentId ?? null,
    template: input.template ?? null,
    images_count: input.imagesCount,
    message_length: input.messageLength,
    status: input.status,
    message_ids: input.messageIds,
  });
  if (error) {
    log.error('Falha ao registrar evento de envio do catálogo:', error.message);
  }
}
