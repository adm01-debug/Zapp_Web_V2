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

export interface InboxSilenceConversation {
  contact_id: string;
  contact_name: string | null;
  received: number;
  last_at: string | null;
}

export interface InboxSilenceConnection {
  connection_id: string;
  connection_name: string | null;
  connection_status: string | null;
  received_5m: number;
  received_1h: number;
  received_24h: number;
  last_inbound_at: string | null;
  last_outbound_at: string | null;
  /**
   * Limiar configurado em `global_settings.inbox_silence_minutes`. Vem da própria
   * RPC (que lê a chave no servidor) — o front nunca crava o número.
   */
  silence_minutes: number;
  is_silent: boolean;
  top_conversations: InboxSilenceConversation[];
}

function toNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function toText(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function mapConversations(value: unknown): InboxSilenceConversation[] {
  if (!Array.isArray(value)) return [];
  const rows: InboxSilenceConversation[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const raw = item as Record<string, unknown>;
    const contactId = toText(raw.contact_id);
    if (!contactId) continue;
    rows.push({
      contact_id: contactId,
      contact_name: toText(raw.contact_name),
      received: toNumber(raw.received),
      last_at: toText(raw.last_at),
    });
  }
  return rows;
}

function mapSilenceRow(raw: Record<string, unknown>): InboxSilenceConnection {
  return {
    connection_id: toText(raw.connection_id) ?? '',
    connection_name: toText(raw.connection_name),
    connection_status: toText(raw.connection_status),
    received_5m: toNumber(raw.received_5m),
    received_1h: toNumber(raw.received_1h),
    received_24h: toNumber(raw.received_24h),
    last_inbound_at: toText(raw.last_inbound_at),
    last_outbound_at: toText(raw.last_outbound_at),
    silence_minutes: toNumber(raw.silence_minutes),
    is_silent: raw.is_silent === true,
    top_conversations: mapConversations(raw.top_conversations),
  };
}

/**
 * Silêncio do inbound por conexão (admin/supervisor), para o painel de monitoramento.
 *
 * Mora na camada de serviços: o hook `useInboxSilence` não fala com o Supabase. O
 * `signal` propaga o cancelamento da leitura (aba escondida/desmontada) para a RPC.
 */
export async function fetchInboxSilence(signal: AbortSignal): Promise<InboxSilenceConnection[]> {
  const { data, error } = await supabase.rpc('admin_inbox_silence').abortSignal(signal);
  if (error) throw new Error(error.message);
  return (data ?? []).map(raw => mapSilenceRow(raw as Record<string, unknown>));
}
