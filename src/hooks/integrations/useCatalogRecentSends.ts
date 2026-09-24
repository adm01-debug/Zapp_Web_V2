/**
 * E56 — "Enviados recentemente" e "Mais enviados (30 dias)" do rail,
 * lendo catalog_send_events (tabela criada na E28).
 *
 * Este hook estava adiado desde a E28 por não existir tela que o
 * consumisse; o rail da F5 é essa tela.
 *
 * RLS: o SELECT de catalog_send_events já restringe a "meus próprios
 * eventos ou admin/supervisor" — a query não filtra por agent_id de
 * novo, senão um supervisor deixaria de ver a equipe.
 */
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface CatalogSendEventRow {
  id: string;
  product_id: string;
  product_name: string;
  product_sku: string | null;
  status: string | null;
  created_at: string;
}

export interface CatalogTopSent {
  product_id: string;
  product_name: string;
  count: number;
}

/** Janela de agregação de "mais enviados". */
const WINDOW_DAYS = 30;
/** Teto de linhas lidas para agregar no cliente — não existe RPC de
 * agregação para esta tabela e um catálogo ativo não passa disso em 30
 * dias; se passar, o top 3 continua correto para a janela mais recente. */
const MAX_ROWS = 500;

export function useCatalogRecentSends(recentLimit = 5) {
  const query = useQuery({
    queryKey: ['catalog-send-events', WINDOW_DAYS],
    queryFn: async (): Promise<CatalogSendEventRow[]> => {
      const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from('catalog_send_events')
        .select('id, product_id, product_name, product_sku, status, created_at')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(MAX_ROWS);
      if (error) throw error;
      return (data || []) as CatalogSendEventRow[];
    },
    staleTime: 60 * 1000,
  });

  const events = query.data || [];
  const recent = events.slice(0, recentLimit);

  // Top 3 por contagem de product_id na janela. Empate resolvido pelo
  // envio mais recente (a lista já vem ordenada desc, então o primeiro
  // a atingir a contagem fica na frente num sort estável).
  const counts = new Map<string, CatalogTopSent>();
  for (const e of events) {
    const cur = counts.get(e.product_id);
    if (cur) cur.count += 1;
    else counts.set(e.product_id, { product_id: e.product_id, product_name: e.product_name, count: 1 });
  }
  const topSent = [...counts.values()].sort((a, b) => b.count - a.count).slice(0, 3);

  return {
    recent,
    topSent,
    isLoading: query.isLoading,
    /** Sem nenhum evento a seção inteira do rail fica oculta (E56 item 3). */
    hasData: events.length > 0,
  };
}
