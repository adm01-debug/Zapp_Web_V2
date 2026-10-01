/**
 * Busca de contatos usada pelo fluxo de envio de produto do Catálogo
 * (SendProductDialog / ContactSelectionStep). Isolado aqui — e não em
 * src/components/catalog/ — porque a camada de apresentação não fala
 * com o Supabase direto (no-restricted-imports em src/components/**).
 */
import { supabase } from '@/integrations/supabase/client';
import { getLogger } from '@/lib/logger';
import { escapeOrFilterValue } from '@/lib/postgrestFilters';

const log = getLogger('CatalogSendEvents');
import type { ContactResult } from '@/components/catalog/useSendProduct';

/** CT-43 — mínimo de caracteres para a busca sair do estado "recentes". */
export const CONTACT_SEARCH_MIN_CHARS = 2;

/** CT-43 — só os dígitos de um termo de busca. O usuário digita o telefone
 * formatado ("+55 (41) 9 9999") e a coluna `contacts.phone` guarda outra
 * máscara (ou só dígitos); comparar sem pontuação evita depender do formato
 * exato da linha. */
export function contactSearchDigits(raw: string): string {
  return raw.replace(/\D/g, '');
}

/**
 * CT-43 — monta o filtro `.or()` de nome/telefone para um termo de busca.
 * Devolve `null` quando o termo tem menos de `CONTACT_SEARCH_MIN_CHARS`
 * caracteres: um único caractere casa quase toda a base e o chamador cai na
 * lista de recentes (comportamento anterior: 1 char já disparava a busca).
 */
export function buildContactSearchFilter(query: string): string | null {
  const trimmed = query.trim();
  if (trimmed.length < CONTACT_SEARCH_MIN_CHARS) return null;

  const clauses = [`name.ilike.${escapeOrFilterValue(`%${trimmed}%`)}`];
  const digits = contactSearchDigits(trimmed);
  // Sem dígitos no termo ("tom"), a cláusula de telefone casaria "%" — todo
  // contato — e derrubaria a busca por nome. Só entra quando há dígito.
  if (digits.length > 0) {
    clauses.push(`phone.ilike.${escapeOrFilterValue(`%${digits}%`)}`);
  }
  return clauses.join(',');
}

/** Sem busca (ou termo curto demais): 15 contatos mais recentes.
 * Com busca (≥ 2 chars): nome ou telefone (telefone só por dígitos). */
export async function fetchCatalogContactResults(query: string): Promise<ContactResult[]> {
  const filter = buildContactSearchFilter(query);
  const request = filter
    ? supabase
        .from('contacts')
        .select('id, name, phone, avatar_url')
        .or(filter)
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
