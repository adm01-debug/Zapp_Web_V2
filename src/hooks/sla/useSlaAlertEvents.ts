import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/auth/useAuth';
import { getLogger } from '@/lib/logger';
import { uniqueRealtimeTopic } from '@/lib/realtimeTopic';
import {
  isSlaAlertSeverity,
  isSlaAlertType,
  type SlaAlertSeverity,
  type SlaAlertType,
} from './slaAlertPreferences';

const log = getLogger('sla-alert-events');

export type SlaAlertStatusFilter = 'ativos' | 'resolvidos' | 'todos';
export type SlaAlertTypeFilter = SlaAlertType | 'todos';
export type SlaAlertSeverityFilter = SlaAlertSeverity | 'todas';

export interface SlaAlertFilters {
  status: SlaAlertStatusFilter;
  type: SlaAlertTypeFilter;
  severity: SlaAlertSeverityFilter;
}

export const DEFAULT_SLA_ALERT_FILTERS: SlaAlertFilters = Object.freeze({
  status: 'ativos',
  type: 'todos',
  severity: 'todas',
});

/** Teto de leitura da tela: o histórico é trilha de auditoria, não relatório completo. */
export const SLA_ALERT_EVENTS_LIMIT = 100;

export const SLA_ALERT_EVENTS_QUERY_KEY = 'sla-alert-events';

export interface SlaAlertEvent {
  id: string;
  contactId: string;
  contactName: string | null;
  contactPhone: string | null;
  alertType: SlaAlertType;
  severity: SlaAlertSeverity;
  createdAt: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
  queueId: string | null;
}

interface SlaAlertEventRow {
  id: string;
  contact_id: string;
  alert_type: string;
  severity: string;
  created_at: string;
  resolved_at: string | null;
  resolved_by: string | null;
  queue_id: string | null;
}

interface ContactIdentityRow {
  id: string;
  name: string | null;
  phone: string | null;
}

const SLA_ALERT_EVENT_COLUMNS =
  'id, contact_id, alert_type, severity, created_at, resolved_at, resolved_by, queue_id';

/**
 * Erro do `resolve_sla_alert` → texto para quem está na tela. As chaves são as do próprio corpo das
 * funções (`somente_staff_resolve_alerta`, `alerta_inexistente_ou_ja_resolvido`).
 */
export function slaAlertErrorMessage(raw: string | null | undefined): string {
  const message = raw ?? '';
  if (message.includes('somente_staff_resolve_alerta')) {
    return 'Só a supervisão pode resolver um alerta de SLA';
  }
  if (message.includes('alerta_inexistente_ou_ja_resolvido')) {
    return 'Este alerta já foi resolvido';
  }
  return message || 'Não foi possível resolver o alerta';
}

/** Linha do banco → alerta da tela; tipo/severidade fora do contrato são descartados, não inventados. */
function mapSlaAlertEvent(row: SlaAlertEventRow): SlaAlertEvent | null {
  if (!isSlaAlertType(row.alert_type) || !isSlaAlertSeverity(row.severity)) return null;
  return {
    id: row.id,
    contactId: row.contact_id,
    contactName: null,
    contactPhone: null,
    alertType: row.alert_type,
    severity: row.severity,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
    resolvedBy: row.resolved_by,
    queueId: row.queue_id,
  };
}

export async function fetchSlaAlertEvents(filters: SlaAlertFilters): Promise<SlaAlertEvent[]> {
  let consulta = supabase
    .from('sla_alert_events')
    .select(SLA_ALERT_EVENT_COLUMNS)
    .order('created_at', { ascending: false })
    .limit(SLA_ALERT_EVENTS_LIMIT);

  if (filters.status === 'ativos') consulta = consulta.is('resolved_at', null);
  if (filters.status === 'resolvidos') consulta = consulta.not('resolved_at', 'is', null);
  if (filters.type !== 'todos') consulta = consulta.eq('alert_type', filters.type);
  if (filters.severity !== 'todas') consulta = consulta.eq('severity', filters.severity);

  const { data, error } = await consulta;
  if (error) throw error;

  const alerts = ((data ?? []) as SlaAlertEventRow[])
    .map(mapSlaAlertEvent)
    .filter((alerta): alerta is SlaAlertEvent => alerta !== null);
  if (alerts.length === 0) return alerts;

  // Identidade do contato em uma consulta só: a RLS de `contacts` esconde quem não é do usuário, e
  // aí o alerta aparece sem nome (nunca com o nome de outra pessoa).
  const contactIds = Array.from(new Set(alerts.map((alerta) => alerta.contactId)));
  const { data: contatos, error: contatosError } = await supabase
    .from('contacts')
    .select('id, name, phone')
    .in('id', contactIds);
  if (contatosError) {
    // Sem o nome o histórico continua legível (mostra o id curto): erro de leitura não apaga a lista.
    log.warn('falha ao ler os contatos dos alertas de SLA — segue sem o nome', {
      error: contatosError,
    });
    return alerts;
  }

  const porId = new Map(
    ((contatos ?? []) as ContactIdentityRow[]).map((contato) => [contato.id, contato]),
  );
  return alerts.map((alerta) => {
    const contato = porId.get(alerta.contactId);
    return {
      ...alerta,
      contactName: contato?.name ?? null,
      contactPhone: contato?.phone ?? null,
    };
  });
}

/**
 * Histórico auditável dos alertas de SLA (`sla_alert_events`) com a resolução da supervisão.
 *
 * O produtor é o monitor de SLA (`useSLANotifications` → `record_sla_alert`); a resolução passa pelo
 * RPC `resolve_sla_alert`, que exige staff — a checagem de papel no servidor é a que vale.
 */
export function useSlaAlertEvents(filters: SlaAlertFilters = DEFAULT_SLA_ALERT_FILTERS) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: [SLA_ALERT_EVENTS_QUERY_KEY, filters.status, filters.type, filters.severity],
    queryFn: () => fetchSlaAlertEvents(filters),
    enabled: Boolean(userId),
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!userId) return;
    // Alerta aberto/fechado em qualquer aba atualiza a lista daqui.
    const channel = supabase
      .channel(uniqueRealtimeTopic('sla-alert-events'))
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'sla_alert_events' },
        () => {
          void queryClient.invalidateQueries({ queryKey: [SLA_ALERT_EVENTS_QUERY_KEY] });
        },
      )
      .subscribe((status) => {
        log.debug('Subscription status', { status });
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, queryClient]);

  const resolveMutation = useMutation({
    mutationFn: async (eventId: string) => {
      const { error } = await supabase.rpc('resolve_sla_alert', { p_event_id: eventId });
      if (error) throw error;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [SLA_ALERT_EVENTS_QUERY_KEY] });
      toast.success('Alerta de SLA resolvido');
    },
    onError: (error: Error) => {
      log.error('falha ao resolver o alerta de SLA', { error });
      toast.error(slaAlertErrorMessage(error.message));
    },
  });

  return {
    alerts: query.data ?? [],
    isLoading: Boolean(userId) && query.isLoading,
    isError: query.isError,
    refetch: query.refetch,
    resolve: resolveMutation.mutate,
    /** Id do alerta em resolução (a linha mostra o estado de envio). */
    resolvingId: resolveMutation.isPending ? (resolveMutation.variables ?? null) : null,
  };
}
