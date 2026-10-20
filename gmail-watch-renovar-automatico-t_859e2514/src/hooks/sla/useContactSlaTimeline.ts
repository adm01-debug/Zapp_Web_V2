import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { fetchAllRows } from '@/lib/fetchAllRows';
import {
  buildSlaMilestones,
  filterSlaMilestones,
  SLA_TRANSFER_EVENT_TYPES,
  type SlaMilestone,
  type SlaTimelineEvent,
  type SlaTimelineFilters,
  type SlaTimelineRow,
} from '@/lib/slaTimeline';
import { useApplicableSLA } from './useApplicableSLA';

/** Tamanho de página do PostgREST (a leitura é paginada por `fetchAllRows`). */
const PAGE_SIZE = 1000;

export const contactSlaTimelineKey = (contactId: string | null | undefined) =>
  ['contact-sla-timeline', contactId] as const;

export interface ContactSlaTimeline {
  milestones: SlaMilestone[];
  /** `true` quando a leitura não cobriu todas as páginas (teto ou falha no meio). */
  incomplete: boolean;
}

/**
 * Linha do tempo de SLA de um contato.
 *
 * Lê só o que já está gravado: `conversation_sla` (abertura, 1ª resposta, resolução e as
 * violações) e `conversation_events` (transferências do TR1). Nenhum marco é inferido de
 * mensagem. O prazo aplicado vem da MESMA hierarquia do resto do SLA (`useApplicableSLA`:
 * regra do contato > configuração padrão > padrão do sistema) — sem um limite inventado.
 *
 * O filtro de período/tipo é do cliente: trocar de filtro NÃO dispara nova leitura.
 */
export function useContactSlaTimeline(
  contactId: string | null | undefined,
  filters: SlaTimelineFilters = {},
) {
  const { data: sla, isLoading: slaLoading } = useApplicableSLA({
    contactId: contactId ?? undefined,
  });

  const firstResponseMinutes = sla?.firstResponseMinutes ?? null;
  const resolutionMinutes = sla?.resolutionMinutes ?? null;
  const limitsReady = firstResponseMinutes !== null && resolutionMinutes !== null;

  const { data, isLoading } = useQuery({
    queryKey: [...contactSlaTimelineKey(contactId), firstResponseMinutes, resolutionMinutes],
    enabled: !!contactId && limitsReady,
    staleTime: 30_000,
    queryFn: async (): Promise<ContactSlaTimeline> => {
      const cid = contactId as string;

      const [slaRead, eventsRead] = await Promise.all([
        fetchAllRows<SlaTimelineRow>(
          (from, to) =>
            supabase
              .from('conversation_sla')
              .select(
                'id, first_message_at, first_response_at, resolved_at, first_response_breached, resolution_breached',
              )
              .eq('contact_id', cid)
              .order('first_message_at', { ascending: false })
              .order('id', { ascending: true })
              .range(from, to),
          { pageSize: PAGE_SIZE },
        ),
        fetchAllRows<SlaTimelineEvent>(
          (from, to) =>
            supabase
              .from('conversation_events')
              .select('id, event_type, created_at')
              .eq('contact_id', cid)
              .in('event_type', [...SLA_TRANSFER_EVENT_TYPES])
              .order('created_at', { ascending: false })
              .order('id', { ascending: true })
              .range(from, to),
          { pageSize: PAGE_SIZE },
        ),
      ]);

      // Zero linhas por RLS chega como lista vazia; erro de leitura tem de virar falha,
      // nunca uma linha do tempo curta passando por completa.
      if (slaRead.error) throw new Error(slaRead.error.message);
      if (eventsRead.error) throw new Error(eventsRead.error.message);

      return {
        milestones: buildSlaMilestones(slaRead.rows, eventsRead.rows, {
          firstResponseMinutes: firstResponseMinutes as number,
          resolutionMinutes: resolutionMinutes as number,
        }),
        incomplete: slaRead.incomplete || eventsRead.incomplete,
      };
    },
  });

  const period = filters.period ?? 'all';
  const kinds = filters.kinds ?? 'all';

  const milestones = useMemo(
    () => filterSlaMilestones(data?.milestones ?? [], { period, kinds }),
    [data, period, kinds],
  );

  return {
    milestones,
    /** `true` quando algum dos lados da leitura ficou incompleto. */
    incomplete: data?.incomplete ?? false,
    /** Prazo aplicável ainda não resolvido: os marcos só existem com o limite certo. */
    limitsReady,
    loading: slaLoading || isLoading,
  };
}
