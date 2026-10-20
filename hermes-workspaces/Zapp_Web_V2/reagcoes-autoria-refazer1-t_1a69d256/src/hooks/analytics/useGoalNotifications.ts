import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/auth/useAuth';
import { useNotificationSettings } from '@/hooks/system/useNotificationSettings';
import { playNotificationSound, showBrowserNotification } from '@/utils/notificationSounds';
import { toast } from 'sonner';
import { log } from '@/lib/logger';
import { localDayKey } from '@/lib/localDay';
import { startOfDay, startOfWeek, startOfMonth, endOfDay, endOfWeek, endOfMonth } from 'date-fns';
import type { Json } from '@/integrations/supabase/types';

interface GoalConfiguration {
  id: string;
  goal_type: string;
  daily_target: number;
  weekly_target: number;
  monthly_target: number;
  profile_id: string | null;
  queue_id: string | null;
  is_active: boolean;
}

type Period = 'daily' | 'weekly' | 'monthly';

export function useGoalNotifications() {
  const { user } = useAuth();
  const { settings, isQuietHours } = useNotificationSettings();
  const achievedGoals = useRef<Set<string>>(new Set());
  const checkIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const createNotification = useCallback(async (
    title: string,
    message: string,
    metadata: { goal_id: string; goal_type: string; period: string; current: number; target: number }
  ) => {
    if (!user) return;
    
    try {
      const jsonMetadata: Json = {
        goal_id: metadata.goal_id,
        goal_type: metadata.goal_type,
        period: metadata.period,
        current: metadata.current,
        target: metadata.target
      };

      await supabase
        .from('notifications')
        .insert([{
          user_id: user.id,
          title,
          message,
          type: 'goal',
          metadata: jsonMetadata
        }]);
    } catch (error) {
      log.error('Error creating notification:', error);
    }
  }, [user]);

  const getDateRange = (period: Period) => {
    const now = new Date();
    switch (period) {
      case 'daily':
        return { start: startOfDay(now), end: endOfDay(now) };
      case 'weekly':
        return { start: startOfWeek(now, { weekStartsOn: 1 }), end: endOfWeek(now, { weekStartsOn: 1 }) };
      case 'monthly':
        return { start: startOfMonth(now), end: endOfMonth(now) };
    }
  };

  const checkGoalProgress = useCallback(async () => {
    if (!user) return;

    try {
      // Get user's profile
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!profile) return;

      // Get active goal configurations
      const { data: goals, error: goalsError } = await supabase
        .from('goals_configurations')
        .select('*')
        .eq('is_active', true)
        .or(`profile_id.eq.${profile.id},profile_id.is.null`);

      if (goalsError || !goals || goals.length === 0) return;

      // Get agent stats
      const { data: agentStats } = await supabase
        .from('agent_stats')
        .select('*')
        .eq('profile_id', profile.id)
        .maybeSingle();

      // Check each goal
      for (const goal of goals) {
        const periods: Period[] = ['daily', 'weekly', 'monthly'];

        for (const period of periods) {
          const targetKey = `${period}_target` as keyof GoalConfiguration;
          const target = goal[targetKey] as number;
          
          if (!target || target === 0) continue;

          const { start, end } = getDateRange(period);
          let current = 0;

          // Calculate current progress based on goal type
          switch (goal.goal_type) {
            case 'messages_sent': {
              const { count } = await supabase
                .from('messages')
                .select('*', { count: 'exact', head: true })
                .eq('sender', 'agent')
                .eq('agent_id', profile.id)
                .gte('created_at', start.toISOString())
                .lte('created_at', end.toISOString());
              current = count || 0;
              break;
            }
            case 'conversations_resolved': {
              const { count } = await supabase
                .from('conversation_sla')
                .select('*', { count: 'exact', head: true })
                .not('resolved_at', 'is', null)
                .gte('resolved_at', start.toISOString())
                .lte('resolved_at', end.toISOString());
              current = count || 0;
              break;
            }
            case 'contacts_handled': {
              // Mesmo cálculo do painel (useGoalsDashboard): contatos atribuídos
              // ao perfil no período.
              const { count, error } = await supabase
                .from('contacts')
                .select('*', { count: 'exact', head: true })
                .eq('assigned_to', profile.id)
                .gte('created_at', start.toISOString())
                .lte('created_at', end.toISOString());
              if (error) throw error;
              current = count || 0;
              break;
            }
            case 'resolution_rate': {
              // Mesmo cálculo do painel (useGoalsDashboard): percentual de
              // conversas analisadas com status 'resolvido' no período.
              const { count: total, error: totalError } = await supabase
                .from('conversation_analyses')
                .select('*', { count: 'exact', head: true })
                .eq('analyzed_by', profile.id)
                .gte('created_at', start.toISOString())
                .lte('created_at', end.toISOString());
              if (totalError) throw totalError;

              const { count: resolved, error: resolvedError } = await supabase
                .from('conversation_analyses')
                .select('*', { count: 'exact', head: true })
                .eq('analyzed_by', profile.id)
                .eq('status', 'resolvido')
                .gte('created_at', start.toISOString())
                .lte('created_at', end.toISOString());
              if (resolvedError) throw resolvedError;

              current = total && total > 0 ? Math.round(((resolved || 0) / total) * 100) : 0;
              break;
            }
            case 'response_time':
              current = agentStats?.avg_response_time_seconds || 0;
              break;
            case 'satisfaction':
              current = agentStats?.customer_satisfaction_score || 0;
              break;
            default:
              // Tipo sem cálculo conhecido: não tratar como progresso zero
              // silencioso (isso compararia 0 >= target e nunca notificaria sem
              // deixar rastro). Registra e segue para a próxima meta.
              log.warn(`Goal type "${goal.goal_type}" sem cálculo de progresso; notificação de conquista ignorada.`);
              continue;
          }

          // R3-07: a chave é o dia **do usuário** (`localDayKey`). Fatiar o ISO em UTC
          // (`start.toISOString().split('T')[0]`) devolvia o dia anterior a leste de UTC
          // (em Berlin, 30/09 00:00 local = 29/09 22:00 UTC), então a conquista ficava
          // deduplicada sob o dia errado.
          const achievedKey = `${goal.id}-${period}-${localDayKey(start)}`;

          // Check if goal was achieved
          if (current >= target && !achievedGoals.current.has(achievedKey)) {
            achievedGoals.current.add(achievedKey);

            const periodLabel = period === 'daily' ? 'diária' : period === 'weekly' ? 'semanal' : 'mensal';
            const goalLabel = getGoalLabel(goal.goal_type);
            
            const title = `🎯 Meta ${periodLabel} alcançada!`;
            const message = `Você atingiu sua meta de ${goalLabel}: ${current}/${target}`;

            // Create notification in database
            await createNotification(title, message, {
              goal_id: goal.id,
              goal_type: goal.goal_type,
              period,
              current,
              target
            });

            // Show toast
            toast.success(title, { description: message });

            // Play sound if enabled
            if (settings.soundEnabled && !isQuietHours()) {
              playNotificationSound('goal_achieved', settings.goalSoundType, settings.soundVolume);
            }

            // Browser notification
            if (settings.browserNotifications) {
              showBrowserNotification(title, message);
            }
          }
        }
      }
    } catch (error) {
      log.error('Error checking goal progress:', error);
    }
  }, [user, settings, isQuietHours, createNotification]);

  // Check goals periodically
  useEffect(() => {
    if (!user) return;

    // Check immediately
    checkGoalProgress();

    // Check every 5 minutes
    checkIntervalRef.current = setInterval(checkGoalProgress, 300000);

    return () => {
      if (checkIntervalRef.current) {
        clearInterval(checkIntervalRef.current);
      }
    };
  }, [user, checkGoalProgress]);

  return { checkGoalProgress };
}

function getGoalLabel(goalType: string): string {
  switch (goalType) {
    case 'messages_sent':
      return 'Mensagens enviadas';
    case 'conversations_resolved':
      return 'Conversas resolvidas';
    case 'contacts_handled':
      return 'Contatos atendidos';
    case 'resolution_rate':
      return 'Taxa de resolução';
    case 'response_time':
      return 'Tempo de resposta';
    case 'satisfaction':
      return 'Satisfação';
    default:
      return goalType;
  }
}