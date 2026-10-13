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

/**
 * Faixas de alerta da meta, em % do limite (paridade V3, desenho sim3 c.2).
 * Nas metricas de TETO (valor alto = pior) o aviso sai ao CRUZAR para cima;
 * nas metricas INVERTIDAS (ex.: `min_assignment_rate`, valor baixo = pior) ao CAIR.
 */
export const QUEUE_ALERT_BANDS = [50, 75, 100] as const;
export const INVERTED_QUEUE_ALERT_BANDS = [25, 50, 75] as const;

export type QueueAlertMetric = QueueAlert['type'];

/**
 * Regra UNICA de faixa, para o aviso global e para qualquer tela nao terem duas
 * regras divergentes. Devolve a MAIOR faixa cruzada (ou `null` quando nenhuma foi
 * cruzada). `limit <= 0` ou valor/limite nao finito devolvem `null` (sem base).
 */
export function getQueueAlertBand(value: number, limit: number, invert = false): number | null {
  if (!Number.isFinite(value) || !Number.isFinite(limit) || limit <= 0) return null;
  const bands: readonly number[] = invert ? INVERTED_QUEUE_ALERT_BANDS : QUEUE_ALERT_BANDS;
  const crossed = bands.filter((faixa) =>
    invert ? value <= limit * (1 - faixa / 100) : value >= limit * (faixa / 100)
  );
  return crossed.length > 0 ? crossed[crossed.length - 1] : null;
}
