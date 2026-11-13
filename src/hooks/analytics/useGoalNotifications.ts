import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/auth/useAuth';
import { useNotificationSettings } from '@/hooks/system/useNotificationSettings';
import { playNotificationSound, showBrowserNotification } from '@/utils/notificationSounds';
import { toast } from 'sonner';
import { log } from '@/lib/logger';
import { goalPeriodRange, localDayKey } from '@/lib/localDay';
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

// A janela de cada período vem da MESMA função do painel (`goalPeriodRange`), para o aviso
// de conquista e a tela contarem o mesmo recorte — inclusive a semana de segunda a domingo.
const PERIOD_TO_WINDOW: Record<Period, 'today' | 'week' | 'month'> = {
  daily: 'today',
  weekly: 'week',
  monthly: 'month',
};

/**
 * Intervalo entre rodadas de checagem de metas. Era 5 min; metas são diárias,
 * semanais e mensais — 10 min basta para o aviso de conquista e corta pela
 * metade as idas ao banco de cada atendente.
 */
export const GOAL_CHECK_INTERVAL_MS = 600_000;

export function useGoalNotifications() {
  const { user } = useAuth();
  const { settings, isQuietHours } = useNotificationSettings();
  const achievedGoals = useRef<Set<string>>(new Set());
  const checkIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const createNotification = useCallback(async (
    title: string,
    message: string,
    metadata: { goal_id: string; goal_type: string; period: string; current: number; target: number },
    dedupeKey: string
  ): Promise<boolean> => {
    if (!user) return false;

    try {
      const jsonMetadata: Json = {
        goal_id: metadata.goal_id,
        goal_type: metadata.goal_type,
        period: metadata.period,
        current: metadata.current,
        target: metadata.target
      };

      // `notifications.dedupe_key` é única por usuário no banco
            // (`ux_notifications_user_dedupe_key`, IA-047). A conquista já gravada
            // (outra aba, recarga, outra rodada) não volta a ser anunciada: o SELECT
            // de próprio usuário é barato e evita tocar o banco com INSERT duplicado,
            // que viraria um 409 (23505) no transporte e ruído de console no E2E Y09.
            // O 23505 continua tratado como SUCESSO silencioso, como defesa caso duas
            // abas gravem no mesmo instante (corrida real).
            const { data: existente } = await supabase
              .from('notifications')
              .select('id')
              .eq('user_id', user.id)
              .eq('dedupe_key', dedupeKey)
              .maybeSingle();

            if (existente) return false;

      const { error } = await supabase
        .from('notifications')
        .insert([{
          user_id: user.id,
          title,
          message,
          type: 'goal',
          metadata: jsonMetadata,
          dedupe_key: dedupeKey
        }]);

      if (error) {
        if (error.code === '23505') return false;
        log.error('Error creating notification:', error);
      }

      // Falha que NÃO é duplicata (ex.: escrita negada pelo banco) mantém o
      // anúncio: o toast é o único canal que o usuário vê, e o hook já anunciava
      // mesmo quando a gravação falhava.
      return true;
    } catch (error) {
      log.error('Error creating notification:', error);
      return true;
    }
  }, [user]);

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

      // Metas ativas e estatísticas do agente em paralelo (antes: em série).
      const [goalsResult, statsResult] = await Promise.all([
        supabase
          .from('goals_configurations')
          .select('*')
          .eq('is_active', true)
          .or(`profile_id.eq.${profile.id},profile_id.is.null`),
        supabase
          .from('agent_stats')
          .select('*')
          .eq('profile_id', profile.id)
          .maybeSingle(),
      ]);
      const { data: goals, error: goalsError } = goalsResult;
      const agentStats = statsResult.data;

      if (goalsError || !goals || goals.length === 0) return;

      // P1-7: as contagens (HEAD) saem TODAS em paralelo e cada uma só uma vez
      // por rodada. Antes eram ~12 idas em série a cada 5 min (metas × períodos),
      // e o total de `resolution_rate` repetia a consulta de `contacts_handled`.
      // O cache por (métrica, período) também cobre a meta global e a pessoal do
      // mesmo tipo.
      const countCache = new Map<string, Promise<number>>();
      // `strict`: erro interrompe a rodada (como antes nas contagens de
      // contatos); sem ele o erro conta como zero (como antes em mensagens e
      // conversas resolvidas) e a meta simplesmente não é anunciada.
      const countOnce = (key: string, run: () => PromiseLike<{ count: number | null; error: unknown }>, strict = false) => {
        let pending = countCache.get(key);
        if (!pending) {
          pending = Promise.resolve(run()).then(({ count, error }) => {
            if (error && strict) throw error;
            return count || 0;
          });
          countCache.set(key, pending);
        }
        return pending;
      };
      const countMessagesSent = (period: Period, start: Date, end: Date) => countOnce(`messages_sent:${period}`, () =>
        supabase
          .from('messages')
          .select('*', { count: 'exact', head: true })
          .eq('sender', 'agent')
          .eq('agent_id', profile.id)
          .gte('created_at', start.toISOString())
          .lte('created_at', end.toISOString()));
      // `conversation_sla` não tem coluna de atendente: o escopo vem do contato
      // (`contacts.assigned_to`). Sem o `!inner` o PostgREST contava as conversas
      // resolvidas da ORGANIZAÇÃO inteira e a meta pessoal fechava sozinha.
      const countConversationsResolved = (period: Period, start: Date, end: Date) => countOnce(`conversations_resolved:${period}`, () =>
        supabase
          .from('conversation_sla')
          .select('id, contacts!inner(assigned_to)', { count: 'exact', head: true })
          .eq('contacts.assigned_to', profile.id)
          .not('resolved_at', 'is', null)
          .gte('resolved_at', start.toISOString())
          .lte('resolved_at', end.toISOString()));
      // Mesmo cálculo do painel (useGoalsDashboard): contatos atribuídos ao
      // perfil no período — é também o denominador da taxa de resolução.
      const countContactsHandled = (period: Period, start: Date, end: Date) => countOnce(`contacts_handled:${period}`, () =>
        supabase
          .from('contacts')
          .select('*', { count: 'exact', head: true })
          .eq('assigned_to', profile.id)
          .gte('created_at', start.toISOString())
          .lte('created_at', end.toISOString()), true);
      const countContactsResolved = (period: Period, start: Date, end: Date) => countOnce(`contacts_resolved:${period}`, () =>
        supabase
          .from('contacts')
          .select('*', { count: 'exact', head: true })
          .eq('assigned_to', profile.id)
          .eq('conversation_status', 'resolved')
          .gte('created_at', start.toISOString())
          .lte('created_at', end.toISOString()), true);

      type Measured = { goal: GoalConfiguration; period: Period; target: number; start: Date; current: number; hasData: boolean };

      const measure = async (goal: GoalConfiguration, period: Period): Promise<Measured | null> => {
        const targetKey = `${period}_target` as keyof GoalConfiguration;
        const target = goal[targetKey] as number;
        if (!target || target === 0) return null;

        const { from: start, to: end } = goalPeriodRange(PERIOD_TO_WINDOW[period]);
        // Metas percentuais sem denominador no período (Taxa de Resolução sem
        // atendimento) não têm o que comparar com o alvo: `hasData` fica false
        // e a meta é pulada em vez de virar "0% cumprido".
        let current = 0;
        let hasData = true;

        switch (goal.goal_type) {
          case 'messages_sent':
            current = await countMessagesSent(period, start, end);
            break;
          case 'conversations_resolved':
            current = await countConversationsResolved(period, start, end);
            break;
          case 'contacts_handled':
            current = await countContactsHandled(period, start, end);
            break;
          case 'resolution_rate': {
            // Mesmo cálculo do painel (useGoalsDashboard): conversas encerradas
            // sobre as atendidas no período, pelo campo canônico
            // `contacts.conversation_status`. Não sai de `conversation_analyses`
            // — só quem foi analisado tem registro lá, e isso divergia do painel.
            const [total, resolved] = await Promise.all([
              countContactsHandled(period, start, end),
              countContactsResolved(period, start, end),
            ]);
            // 0/0 não é 0%: sem atendimento no período não há taxa. Marca a
            // ausência de dado para não dar a meta por cumprida nem anunciar.
            if (!total) { hasData = false; break; }
            current = Math.round((resolved / total) * 100);
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
            return null;
        }
        return { goal, period, target, start, current, hasData };
      };

      const periods: Period[] = ['daily', 'weekly', 'monthly'];
      const measured = await Promise.all(
        (goals as GoalConfiguration[]).flatMap((goal) => periods.map((period) => measure(goal, period))),
      );

      // O anúncio continua em série e na mesma ordem (meta → período): a
      // gravação do aviso deduplica por chave e não pode correr consigo mesma.
      for (const item of measured) {
        if (!item) continue;
        const { goal, period, target, start, current, hasData } = item;

        // Sem dado no período não há o que comparar com o alvo: pula sem
        // anunciar conquista (nem registrar dedupe).
        if (!hasData) continue;

        // R3-07: a chave é o dia **do usuário** (`localDayKey`). Fatiar o ISO em UTC
        // (`start.toISOString().split('T')[0]`) devolvia o dia anterior a leste de UTC
        // (em Berlin, 30/09 00:00 local = 29/09 22:00 UTC), então a conquista ficava
        // deduplicada sob o dia errado.
        //
        // O mesmo dia compõe a chave durável do banco (`dedupe_key`, formato do
        // PB-14 `goal:v1:<meta>:<período>:<dia>`). É o dia do INÍCIO do período
        // (segunda da semana, dia 1º do mês): usar "hoje" reanunciaria a meta
        // semanal/mensal a cada dia.
        const dayKey = localDayKey(start);
        const achievedKey = `${goal.id}-${period}-${dayKey}`;
        const dedupeKey = `goal:v1:${goal.id}:${period}:${dayKey}`;

        // MENOR é melhor no tempo de resposta: cumprir é ficar ABAIXO do alvo.
        // `current === 0` é ausência de medição (`agent_stats` nulo), não tempo
        // zero — sem essa guarda a meta seria dada por cumprida sem dado nenhum.
        const achieved = goal.goal_type === 'response_time'
          ? current > 0 && current <= target
          : current >= target;

        // Check if goal was achieved
        if (achieved && !achievedGoals.current.has(achievedKey)) {
          achievedGoals.current.add(achievedKey);

          const periodLabel = period === 'daily' ? 'diária' : period === 'weekly' ? 'semanal' : 'mensal';
          const goalLabel = getGoalLabel(goal.goal_type);

          const title = `🎯 Meta ${periodLabel} alcançada!`;
          const message = goal.goal_type === 'response_time'
            ? `Você atingiu sua meta de ${goalLabel}: ${current} (alvo: até ${target})`
            : `Você atingiu sua meta de ${goalLabel}: ${current}/${target}`;

          // Grava no banco com a chave estável. `false` = o aviso já existia
          // (outra carga/aba gravou primeiro): não se anuncia de novo.
          const announced = await createNotification(title, message, {
            goal_id: goal.id,
            goal_type: goal.goal_type,
            period,
            current,
            target
          }, dedupeKey);

          if (!announced) continue;

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
    } catch (error) {
      log.error('Error checking goal progress:', error);
    }
  }, [user, settings, isQuietHours, createNotification]);

  // Check goals periodically
  useEffect(() => {
    if (!user) return;

    // P1-7: aba em segundo plano não consulta. Ao voltar a ficar visível,
    // confere de novo se a última rodada já passou do intervalo.
    let lastRunAt = 0;
    const runIfVisible = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      lastRunAt = Date.now();
      void checkGoalProgress();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastRunAt >= GOAL_CHECK_INTERVAL_MS) runIfVisible();
    };

    // Check immediately
    runIfVisible();

    checkIntervalRef.current = setInterval(runIfVisible, GOAL_CHECK_INTERVAL_MS);
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
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