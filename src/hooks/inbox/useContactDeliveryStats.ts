import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/**
 * Números de entrega do contato, agregados no servidor.
 *
 * Lê a RPC `public.delivery_stats` (migration 20261016102541): o recorte por hora
 * já vem somado pelo banco. O front NÃO baixa mensagem para somar no navegador —
 * era esse o defeito que a V3 tinha (500 linhas para montar um gráfico) e o mesmo
 * que a RPC inbox_wait_summary tirou da contagem de chips.
 *
 * A RPC devolve NULL quando o chamador não pode ver o contato (ou ele não existe):
 * nesse caso o painel mostra o estado vazio, sem distinguir os motivos.
 *
 * `participants` NÃO existe no contrato: a V2 não guarda o autor da mensagem de
 * grupo (messages_sender_check só aceita 'agent'/'contact' e o webhook descarta
 * recebida de grupo), então não há recorte por participante para ler.
 */
export interface DeliveryTotals {
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  received: number;
  total_messages: number;
  last_sent_at: string | null;
  last_delivered_at: string | null;
  last_read_at: string | null;
}

export interface DeliveryHourPoint {
  hour: string;
  sent: number;
  delivered: number;
  read: number;
}

export interface DeliveryStats {
  contact_id: string;
  is_group: boolean;
  window_hours: number;
  totals: DeliveryTotals;
  timeline: DeliveryHourPoint[];
}

/** Janela padrão do painel (o mesmo default da RPC). */
export const DELIVERY_WINDOW_HOURS = 24;

export const contactDeliveryStatsKey = (contactId: string, hours: number) =>
  ['contact-delivery-stats', contactId, hours] as const;

export function useContactDeliveryStats(contactId: string, hours: number = DELIVERY_WINDOW_HOURS) {
  const query = useQuery({
    queryKey: contactDeliveryStatsKey(contactId, hours),
    queryFn: async (): Promise<DeliveryStats | null> => {
      // cast temporário: types.ts gerado ainda não tem delivery_stats (RPC nova,
      // migration 20261016102541) — o sync de types traz o tipo real depois.
      const { data, error } = await (supabase as any).rpc('delivery_stats', { // eslint-disable-line @typescript-eslint/no-explicit-any -- cast temporário até sync de types
        p_contact_id: contactId,
        p_hours: hours,
      });
      if (error) throw error;
      return (data ?? null) as unknown as DeliveryStats | null;
    },
    enabled: !!contactId,
    staleTime: 30_000,
  });

  return {
    stats: query.data ?? null,
    isLoading: query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
  };
}
