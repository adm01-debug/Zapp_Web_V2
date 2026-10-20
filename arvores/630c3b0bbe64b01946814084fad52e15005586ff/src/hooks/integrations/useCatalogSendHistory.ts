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
import { fetchAllRows, type PageResult } from '@/lib/fetchAllRows';
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
 * Tamanho de página da varredura do histórico (o mesmo teto de linhas por
 * requisição usado no resto do módulo) e a trava contra laço infinito. O teto
 * de páginas NÃO é um recorte de negócio: se ele for atingido a leitura é
 * recusada logo abaixo, nunca devolvida pela metade como se fosse o histórico
 * inteiro.
 */
const CATALOG_SEND_HISTORY_PAGE_SIZE = 1000;
const CATALOG_SEND_HISTORY_MAX_PAGES = 100;

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

/** Normaliza uma linha crua do PostgREST para o formato da tabela/CSV. */
function toRow(r: Record<string, unknown>): CatalogSendHistoryRow {
  return {
    id: String(r.id),
    product_id: String(r.product_id),
    product_name: String(r.product_name),
    product_sku: (r.product_sku as string | null) ?? null,
    variant_label: (r.variant_label as string | null) ?? null,
    contact_id: (r.contact_id as string | null) ?? null,
    contact_name: embeddedName(r.contacts),
    agent_id: (r.agent_id as string | null) ?? null,
    agent_name: embeddedName(r.profiles),
    template: (r.template as string | null) ?? null,
    images_count: typeof r.images_count === 'number' ? r.images_count : null,
    status: (r.status as string | null) ?? null,
    created_at: String(r.created_at),
  };
}

export function useCatalogSendHistory(options: UseCatalogSendHistoryOptions = {}) {
  // `null`/vazio = comportamento antigo (aba "Enviados": histórico completo).
  const contactId = options.contactId || null;
  const query = useQuery({
    // Chave própria do histórico COMPLETO: não reaproveita a chave antiga (que
    // carregava só as 500 primeiras linhas), então a aba não herda cache velho.
    queryKey: contactId
      ? [...CATALOG_SEND_EVENTS_KEY, 'history', 'contact', contactId, 'completo']
      : [...CATALOG_SEND_EVENTS_KEY, 'history', 'completo'],
    queryFn: async (): Promise<CatalogSendHistoryRow[]> => {
      // R2-MOD-042 (item 411): a consulta era `.limit(500)` sem total nem
      // continuação — tudo além do 500º envio mais recente desaparecia da aba
      // (a busca respondia "Nenhum envio com esses filtros" para um envio que
      // existe e o CSV saía truncado). Agora a leitura percorre TODAS as
      // páginas.
      const { rows, incomplete, error } = await fetchAllRows<Record<string, unknown>>(
        (from, to) => {
          let builder = supabase
            .from('catalog_send_events')
            .select(
              'id, product_id, product_name, product_sku, variant_label, contact_id, agent_id, template, images_count, status, created_at, contacts(name), profiles!catalog_send_events_agent_id_fkey(name)',
            );
          if (contactId) builder = builder.eq('contact_id', contactId);
          return builder
            .order('created_at', { ascending: false })
            // O `id` fecha o desempate: sem uma chave única, a paginação por
            // offset pularia ou repetiria linha quando dois eventos empatassem
            // no `created_at`.
            .order('id', { ascending: false })
            .range(from, to) as unknown as PromiseLike<PageResult<Record<string, unknown>>>;
        },
        { pageSize: CATALOG_SEND_HISTORY_PAGE_SIZE, maxPages: CATALOG_SEND_HISTORY_MAX_PAGES },
      );
      if (error) throw new Error(`Falha ao ler o histórico de envios: ${error.message}`);
      // Fail-closed: leitura parcial NÃO é publicada como se fosse o histórico
      // inteiro (mesmo critério de queueMetrics/R2-MOD-018).
      if (incomplete) throw new Error('A leitura do histórico de envios parou no teto de páginas; o recorte ficaria incompleto.');
      return rows.map(toRow);
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
