import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/ui/use-toast';
import { log } from '@/lib/logger';
import { uniqueRealtimeTopic } from '@/lib/realtimeTopic';

export interface QueueGoal {
  id: string;
  queue_id: string;
  max_waiting_contacts: number;
  max_avg_wait_minutes: number;
  min_assignment_rate: number;
  max_messages_pending: number;
  alerts_enabled: boolean;
}

export interface QueueAlert {
  type: 'waiting_contacts' | 'wait_time' | 'assignment_rate' | 'messages_pending';
  queueId: string;
  queueName: string;
  queueColor: string;
  message: string;
  severity: 'warning' | 'critical';
  currentValue: number;
  threshold: number;
}

/**
 * Linha de `public.rpc_queue_goal_metrics()` (PM-02, cartão t_35099565): as métricas REAIS por
 * fila visível ao usuário. `null` = não medido (fila sem base ou métrica sem base no período) e
 * `0` = dado (fila existe e está vazia). Trocar um pelo outro inventa alerta (NULL tratado como
 * zero) ou esconde fila estoura (zero tratado como sem medição).
 */
export interface QueueGoalMetricsRow {
  queue_id: string;
  queue_name: string;
  coverage: string;
  contacts_open: number | null;
  waiting_contacts: number | null;
  avg_wait_minutes: number | null;
  assignment_rate: number | null;
  received_contacts: number | null;
  assigned_contacts: number | null;
  messages_pending: number | null;
}

export interface QueueGoalMetricDefinition {
  /** Coluna da RPC e nome estável da métrica na dedupe do aviso. */
  key: 'waiting_contacts' | 'avg_wait_minutes' | 'messages_pending' | 'assignment_rate';
  /** Tipo do alerta em `QueueAlert`/`QueueAlertsDisplay`. */
  alertType: QueueAlert['type'];
  label: string;
  goalKey: keyof Pick<QueueGoal, 'max_waiting_contacts' | 'max_avg_wait_minutes' | 'max_messages_pending' | 'min_assignment_rate'>;
  /**
   * `max` = quanto MENOR melhor (contatos aguardando, espera, pendentes): a faixa é cruzada ao
   * SUBIR para 50/75/100 % do limite. `min` = quanto MAIOR melhor (taxa de atribuição): a faixa é
   * cruzada ao CAIR para 25/50/75 % do mínimo — as faixas invertidas do cartão.
   */
  direction: 'max' | 'min';
}

export const QUEUE_GOAL_METRICS: readonly QueueGoalMetricDefinition[] = [
  { key: 'waiting_contacts', alertType: 'waiting_contacts', label: 'Contatos aguardando', goalKey: 'max_waiting_contacts', direction: 'max' },
  { key: 'avg_wait_minutes', alertType: 'wait_time', label: 'Espera média', goalKey: 'max_avg_wait_minutes', direction: 'max' },
  { key: 'messages_pending', alertType: 'messages_pending', label: 'Mensagens sem resposta', goalKey: 'max_messages_pending', direction: 'max' },
  { key: 'assignment_rate', alertType: 'assignment_rate', label: 'Taxa de atribuição', goalKey: 'min_assignment_rate', direction: 'min' },
];

/** Faixas do cartão: quem sobe cruza 50/75/100 % do limite; quem cai cruza 25/50/75 % do mínimo. */
export const QUEUE_GOAL_BANDS = [50, 75, 100] as const;
export const QUEUE_GOAL_BANDS_INVERTED = [25, 50, 75] as const;

/** % do alvo. `null` quando o alvo é zero (não há percentual definido) — nunca `Infinity`. */
export function goalMetricPercent(value: number, target: number): number | null {
  if (!Number.isFinite(value) || !Number.isFinite(target) || target <= 0) return null;
  return (value / target) * 100;
}

export function crossedGoalBands(percent: number, direction: 'max' | 'min'): number[] {
  return direction === 'max'
    ? QUEUE_GOAL_BANDS.filter((band) => percent >= band)
    : QUEUE_GOAL_BANDS_INVERTED.filter((band) => percent <= band);
}

/** Faixa mais grave já cruzada: a maior % no limite superior, a menor % no mínimo. */
export function worstCrossedGoalBand(percent: number, direction: 'max' | 'min'): number | null {
  const crossed = crossedGoalBands(percent, direction);
  if (crossed.length === 0) return null;
  return direction === 'max' ? Math.max(...crossed) : Math.min(...crossed);
}

/** Número como o aviso mostra: inteiro quando inteiro, uma casa quando tem fração. */
export function formatGoalMetricValue(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/**
 * `types.ts` é gerado do banco e ainda não conhece esta RPC (ela nasceu na migration
 * 20261015232316); o cast some quando a regeneração rodar. Mesmo padrão de useAIUsageDashboard.ts.
 */
type PendingDatabaseRpc = (
  fn: string,
  args?: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message: string } | null }>;

/** Busca as métricas reais das filas. Lança quando a RPC falha — quem chama decide o que fazer. */
export async function fetchQueueGoalMetrics(): Promise<QueueGoalMetricsRow[]> {
  const rpc = supabase.rpc.bind(supabase) as unknown as PendingDatabaseRpc;
  const { data, error } = await rpc('rpc_queue_goal_metrics');
  if (error) throw error;
  return (Array.isArray(data) ? data : []) as QueueGoalMetricsRow[];
}

/**
 * Métricas reais das filas (RPC do PM-02). A visibilidade é do SERVIDOR: staff vê todas as filas
 * ativas, quem não é staff vê só as filas em que é membro ativo, e quem não é nem uma coisa nem
 * outra recebe zero linhas. Por isso a tela não filtra por papel — ela mostra o que a RPC devolve.
 */
export function useQueueGoalMetrics() {
  const [metrics, setMetrics] = useState<Record<string, QueueGoalMetricsRow>>({});
  const [loading, setLoading] = useState(true);

  const fetchMetrics = useCallback(async () => {
    try {
      const rows = await fetchQueueGoalMetrics();

      const metricsMap: Record<string, QueueGoalMetricsRow> = {};
      rows.forEach((row) => {
        metricsMap[row.queue_id] = row;
      });

      setMetrics(metricsMap);
    } catch (error) {
      log.error('Error fetching queue goal metrics:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount padrão, sem estado derivado de props para sincronizar.
    void fetchMetrics();
  }, [fetchMetrics]);

  return { metrics, loading, refetch: fetchMetrics };
}

export function useQueueGoals() {
  const [goals, setGoals] = useState<Record<string, QueueGoal>>({});
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchGoals = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('queue_goals')
        .select('*');

      if (error) throw error;

      const goalsMap: Record<string, QueueGoal> = {};
      data?.forEach(goal => {
        goalsMap[goal.queue_id] = goal as unknown as QueueGoal;
      });

      setGoals(goalsMap);
    } catch (error) {
      log.error('Error fetching queue goals:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount padrão, sem estado derivado de props para sincronizar.
    fetchGoals();

    const channel = supabase
      .channel(uniqueRealtimeTopic('queue-goals-changes'))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'queue_goals' }, fetchGoals)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchGoals]);

  /**
   * Grava as metas da fila e devolve `true` SOMENTE quando a gravacao foi
   * confirmada pelo banco. Antes, o erro era engolido no `catch` e a funcao
   * resolvia normalmente, entao o consumidor nao tinha como saber da recusa e
   * fechava o formulario (R2-QUE-005). Agora a recusa resolve em `false` e o
   * chamador mantem o rascunho na tela.
   */
  const saveGoal = async (queueId: string, goalData: Partial<QueueGoal>): Promise<boolean> => {
    try {
      const existingGoal = goals[queueId];

      if (existingGoal) {
        const { error } = await supabase
          .from('queue_goals')
          .update(goalData)
          .eq('queue_id', queueId);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('queue_goals')
          .insert({
            queue_id: queueId,
            ...goalData,
          });

        if (error) throw error;
      }

      toast({
        title: 'Metas salvas',
        description: 'As metas da fila foram atualizadas com sucesso.',
      });

      await fetchGoals();
      return true;
    } catch (error) {
      log.error('Error saving queue goal:', error);
      toast({
        title: 'Erro ao salvar metas',
        description: 'Não foi possível salvar as metas.',
        variant: 'destructive',
      });
      return false;
    }
  };

  const getDefaultGoal = (): Omit<QueueGoal, 'id' | 'queue_id'> => ({
    max_waiting_contacts: 10,
    max_avg_wait_minutes: 15,
    min_assignment_rate: 80,
    max_messages_pending: 50,
    alerts_enabled: true,
  });

  return {
    goals,
    loading,
    saveGoal,
    getDefaultGoal,
    refetch: fetchGoals,
  };
}
