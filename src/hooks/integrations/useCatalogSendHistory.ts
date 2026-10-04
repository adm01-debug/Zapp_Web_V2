/**
 * CT-57 — histórico de envios do catálogo (aba "Enviados" da tela principal).
 *
 * Lê `catalog_send_events` (E28) com os embeds que dão nome ao destinatário
 * (`contacts`) e ao agente (`profiles`). A tabela NÃO denormaliza nenhum dos
 * dois nomes, então os dois vêm por embed e podem voltar null quando a RLS do
 * alvo não deixa ler — a UI cai para o fallback ("—"), nunca imprime "null".
 *
 * RECORTE DE VISIBILIDADE (v1, decidido, sem migration): a policy
 * "Users can view own catalog send events" filtra `agent_id` pelo profile do
 * usuário logado e libera `is_admin_or_supervisor(auth.uid())`. Ou seja: esta
 * consulta NÃO refiltra por agente — um agente comum já vê só os próprios
 * envios e admin/supervisor veem a equipe, exatamente como o restante do
 * módulo (useCatalogRecentSends usa a mesma premissa).
 *
 * O embed de agente usa o hint explícito do FK
 * (`catalog_send_events_agent_id_fkey`): a mesma coluna aparece em duas
 * relações nos tipos gerados (profiles e a view profiles_public), então sem o
 * hint o PostgREST não tem como escolher.
 */
import { useQuery } from '@tanstack/react-query';
import { CATALOG_EXPORT_BOM, esc } from '@/components/catalog/catalogExport';
import { supabase } from '@/integrations/supabase/client';
import { CATALOG_SEND_EVENTS_KEY } from './useCatalogRecentSends';

export interface CatalogSendHistoryRow {
  id: string;
  product_id: string;
  product_name: string;
  product_sku: string | null;
  variant_label: string | null;
  contact_id: string | null;
  /** Nome do destinatário; null quando a RLS de contacts não deixa ler. */
  contact_name: string | null;
  agent_id: string | null;
  /** Nome do atendente; null quando a RLS de profiles não deixa ler. */
  agent_name: string | null;
  template: string | null;
  images_count: number | null;
  status: string | null;
  created_at: string;
}

/**
 * Teto de linhas carregadas de uma vez. A aba pagina e filtra no cliente sobre
 * esse conjunto; o teto evita uma consulta sem limite. Envios acima dele ficam
 * fora do CSV — o recorte por período é a evolução natural quando o volume
 * justificar (não há filtro de data na v1).
 */
export const CATALOG_SEND_HISTORY_LIMIT = 500;

/** O embed do PostgREST chega como objeto (FK many-to-one) mas os tipos
 * gerados admitem array; normaliza os dois casos. */
function embeddedName(raw: unknown): string | null {
  if (!raw) return null;
  const rel = Array.isArray(raw) ? raw[0] : raw;
  const name = (rel as { name?: unknown } | null)?.name;
  return typeof name === 'string' && name.trim() ? name : null;
}

export interface UseCatalogSendHistoryOptions {
  /**
   * Recorta o histórico por destinatário (ex.: perfil do contato / CT-54).
   * É só um `eq('contact_id', ...)`: estreita o resultado, nunca amplia — a
   * policy de RLS da tabela continua sendo a fonte de verdade do escopo por
   * agente (o filtro não fura o recorte do agente logado).
   */
  contactId?: string | null;
}

export function useCatalogSendHistory(options: UseCatalogSendHistoryOptions = {}) {
  // `null`/vazio = comportamento antigo (aba "Enviados": histórico completo).
  const contactId = options.contactId || null;
  const query = useQuery({
    // Chave idêntica à de antes quando não há filtro (não invalida o cache da
    // aba "Enviados"); ganha o sufixo do contato quando o filtro é usado.
    queryKey: contactId
      ? [...CATALOG_SEND_EVENTS_KEY, 'history', 'contact', contactId, CATALOG_SEND_HISTORY_LIMIT]
      : [...CATALOG_SEND_EVENTS_KEY, 'history', CATALOG_SEND_HISTORY_LIMIT],
    queryFn: async (): Promise<CatalogSendHistoryRow[]> => {
      let builder = supabase
        .from('catalog_send_events')
        .select(
          'id, product_id, product_name, product_sku, variant_label, contact_id, agent_id, template, images_count, status, created_at, contacts(name), profiles!catalog_send_events_agent_id_fkey(name)',
        )
        .order('created_at', { ascending: false })
        .limit(CATALOG_SEND_HISTORY_LIMIT);
      if (contactId) builder = builder.eq('contact_id', contactId);
      const { data, error } = await builder;
      if (error) throw error;
      return (data || []).map((r) => {
        const row = r as unknown as Record<string, unknown>;
        return {
          id: String(row.id),
          product_id: String(row.product_id),
          product_name: String(row.product_name),
          product_sku: (row.product_sku as string | null) ?? null,
          variant_label: (row.variant_label as string | null) ?? null,
          contact_id: (row.contact_id as string | null) ?? null,
          contact_name: embeddedName(row.contacts),
          agent_id: (row.agent_id as string | null) ?? null,
          agent_name: embeddedName(row.profiles),
          template: (row.template as string | null) ?? null,
          images_count: typeof row.images_count === 'number' ? row.images_count : null,
          status: (row.status as string | null) ?? null,
          created_at: String(row.created_at),
        };
      });
    },
    staleTime: 60 * 1000,
  });

  return {
    rows: query.data || [],
    isLoading: query.isLoading,
    error: query.error,
  };
}

// ─── CT-57 — export CSV da aba "Enviados" ──────────────────────
// Builder NOVO: o do CT-20 (`buildCatalogCsv`) monta linha de PRODUTO do
// PromoGifts e não tem produto/contato/agente/status. O que é genérico —
// `esc` e o BOM UTF-8 — é reusado de catalogExport.

export const SEND_HISTORY_COLUMNS = [
  'Produto',
  'SKU',
  'Contato',
  'Agente',
  'Modelo',
  'Fotos',
  'Status',
  'Data',
] as const;

const TEMPLATE_CSV_LABEL: Record<string, string> = {
  formal: 'Formal',
  informal: 'Informal',
  promo: 'Promoção',
  custom: 'Personalizada',
};

const STATUS_CSV_LABEL: Record<string, string> = {
  sent: 'Enviado',
  partial: 'Parcial',
  failed: 'Falhou',
};

/** CSV completo: BOM + cabeçalho + uma linha por envio (mesmo formato do
 * export de produtos: separador vírgula, aspas duplicadas, BOM UTF-8). */
export function buildSendHistoryCsv(rows: CatalogSendHistoryRow[]): string {
  const lines = [
    SEND_HISTORY_COLUMNS.map(esc).join(','),
    ...rows.map((r) =>
      [
        r.product_name,
        r.product_sku,
        r.contact_name,
        r.agent_name,
        r.template ? (TEMPLATE_CSV_LABEL[r.template] ?? r.template) : '',
        r.images_count,
        r.status ? (STATUS_CSV_LABEL[r.status] ?? r.status) : '',
        new Date(r.created_at).toLocaleString('pt-BR'),
      ]
        .map(esc)
        .join(','),
    ),
  ];
  return `${CATALOG_EXPORT_BOM}${lines.join('\n')}`;
}

/** `catalogo_enviados_<yyyymmdd>.csv` — data local (mesma convenção do CT-20). */
export function sendHistoryFilename(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
  return `catalogo_enviados_${stamp}.csv`;
}
