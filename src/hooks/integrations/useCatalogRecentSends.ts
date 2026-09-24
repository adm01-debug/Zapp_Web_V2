/**
 * E56 — "Enviados recentemente" e "Mais enviados (30 dias)" do rail,
 * lendo catalog_send_events (tabela criada na E28).
 *
 * Duas consultas separadas de propósito:
 *  - recentes: os últimos N envios, SEM janela de tempo. Quem não envia
 *    há mais de 30 dias continua vendo o próprio histórico.
 *  - mais enviados: agregação da janela de 30 dias, percorrida inteira
 *    por páginas — um teto fixo de linhas faria o ranking contar só os
 *    envios mais novos e subestimar as contagens.
 *
 * RLS: o SELECT de catalog_send_events já restringe a "meus próprios
 * eventos ou admin/supervisor" — a query não filtra por agent_id de
 * novo, senão um supervisor deixaria de ver a equipe.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/** Prefixo de cache das duas consultas. Use com invalidateQueries para
 * refletir um envio recém-registrado sem esperar o staleTime. */
export const CATALOG_SEND_EVENTS_KEY = ['catalog-send-events'] as const;

export interface CatalogSendEventRow {
  id: string;
  product_id: string;
  product_name: string;
  product_sku: string | null;
  status: string | null;
  created_at: string;
  contact_id: string | null;
  /** Nome do destinatário; null quando a RLS de contacts não deixa ler. */
  contact_name: string | null;
}

export interface CatalogTopSent {
  product_id: string;
  product_name: string;
  count: number;
}

/** Janela de agregação de "mais enviados" (não vale para os recentes). */
const WINDOW_DAYS = 30;
/** Tamanho de página da varredura da janela. */
const PAGE_SIZE = 1000;
/** Teto de páginas — salva-vidas contra loop, não limite de negócio. */
const MAX_PAGES = 20;

/** O embed do PostgREST chega como objeto (FK many-to-one) mas os tipos
 * gerados admitem array; normaliza os dois casos. */
function contactNameOf(raw: unknown): string | null {
  if (!raw) return null;
  const rel = Array.isArray(raw) ? raw[0] : raw;
  const name = (rel as { name?: unknown } | null)?.name;
  return typeof name === 'string' && name.trim() ? name : null;
}

export function useCatalogRecentSends(recentLimit = 5) {
  const recentQuery = useQuery({
    queryKey: [...CATALOG_SEND_EVENTS_KEY, 'recent', recentLimit],
    queryFn: async (): Promise<CatalogSendEventRow[]> => {
      const { data, error } = await supabase
        .from('catalog_send_events')
        .select('id, product_id, product_name, product_sku, status, created_at, contact_id, contacts(name)')
        .order('created_at', { ascending: false })
        .limit(recentLimit);
      if (error) throw error;
      return (data || []).map((r) => {
        const row = r as unknown as Record<string, unknown>;
        return {
          id: String(row.id),
          product_id: String(row.product_id),
          product_name: String(row.product_name),
          product_sku: (row.product_sku as string | null) ?? null,
          status: (row.status as string | null) ?? null,
          created_at: String(row.created_at),
          contact_id: (row.contact_id as string | null) ?? null,
          contact_name: contactNameOf(row.contacts),
        };
      });
    },
    staleTime: 60 * 1000,
  });

  const topQuery = useQuery({
    queryKey: [...CATALOG_SEND_EVENTS_KEY, 'top', WINDOW_DAYS],
    queryFn: async (): Promise<CatalogTopSent[]> => {
      const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
      const counts = new Map<string, CatalogTopSent>();
      for (let page = 0; page < MAX_PAGES; page++) {
        const from = page * PAGE_SIZE;
        const { data, error } = await supabase
          .from('catalog_send_events')
          .select('product_id, product_name')
          .gte('created_at', since)
          .order('created_at', { ascending: false })
          .range(from, from + PAGE_SIZE - 1);
        if (error) throw error;
        const rows = data || [];
        for (const e of rows) {
          const cur = counts.get(e.product_id);
          if (cur) cur.count += 1;
          else counts.set(e.product_id, { product_id: e.product_id, product_name: e.product_name, count: 1 });
        }
        if (rows.length < PAGE_SIZE) break;
      }
      return [...counts.values()].sort((a, b) => b.count - a.count).slice(0, 3);
    },
    staleTime: 60 * 1000,
  });

  const recent = recentQuery.data || [];
  const topSent = topQuery.data || [];

  return {
    recent,
    topSent,
    isLoading: recentQuery.isLoading || topQuery.isLoading,
    /** Sem nenhum envio a seção inteira do rail fica oculta (E56 item 3). */
    hasData: recent.length > 0,
  };
}
