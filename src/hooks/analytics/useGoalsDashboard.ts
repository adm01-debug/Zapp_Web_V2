import { useState, useMemo, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/auth/useAuth';
import { startOfDay, endOfDay, startOfMonth, endOfMonth, startOfWeek, endOfWeek } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { MessageSquare, Users, CheckCircle2 } from 'lucide-react';

export interface Goal {
  id: string;
  label: string;
  description: string;
  target: number;
  current: number;
  unit: string;
  icon: React.ElementType;
  color: string;
  priority: 'high' | 'medium' | 'low';
}

export const PERIOD_OPTIONS = [
  { value: 'today', label: 'Hoje' },
  { value: 'week', label: 'Esta Semana' },
  { value: 'month', label: 'Este Mês' },
];

const DEFAULT_GOALS = {
  messages_sent: { daily: 50, weekly: 250, monthly: 1000 },
  contacts_handled: { daily: 10, weekly: 50, monthly: 200 },
  resolution_rate: { daily: 80, weekly: 80, monthly: 85 },
};

function getDateRange(period: string) {
  const now = new Date();
  switch (period) {
    case 'today': return { from: startOfDay(now), to: endOfDay(now) };
    case 'week': return { from: startOfWeek(now, { locale: ptBR }), to: endOfWeek(now, { locale: ptBR }) };
    case 'month': return { from: startOfMonth(now), to: endOfMonth(now) };
    default: return { from: startOfDay(now), to: endOfDay(now) };
  }
}

function getGoalTarget(
  goalType: string, period: string,
  customGoals?: Array<{ goal_type: string; daily_target: number; weekly_target: number; monthly_target: number; is_active: boolean | null }>
): number {
  const customGoal = customGoals?.find(g => g.goal_type === goalType && (g.is_active ?? false));
  if (customGoal) {
    switch (period) {
      case 'today': return customGoal.daily_target;
      case 'week': return customGoal.weekly_target;
      case 'month': return customGoal.monthly_target;
      default: return customGoal.daily_target;
    }
  }
  const defaultGoal = DEFAULT_GOALS[goalType as keyof typeof DEFAULT_GOALS];
  if (!defaultGoal) return 0;
  switch (period) {
    case 'today': return defaultGoal.daily;
    case 'week': return defaultGoal.weekly;
    case 'month': return defaultGoal.monthly;
    default: return defaultGoal.daily;
  }
}

export function getProgressColor(percentage: number): string {
  if (percentage >= 100) return 'text-success';
  if (percentage >= 75) return 'text-primary';
  if (percentage >= 50) return 'text-warning';
  return 'text-destructive';
}

export function getProgressBgColor(percentage: number): string {
  if (percentage >= 100) return 'bg-success';
  if (percentage >= 75) return 'bg-primary';
  if (percentage >= 50) return 'bg-warning';
  return 'bg-destructive';
}

export function useGoalsDashboard() {
  const [period, setPeriod] = useState('today');
  const [configDialogOpen, setConfigDialogOpen] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);
  const [celebrationData, setCelebrationData] = useState({ title: '', subtitle: '', emoji: '🎉' });
  const previousCompletedGoals = useRef<Set<string>>(new Set());
  const previousOverallComplete = useRef(false);
  const { user } = useAuth();

  const dateRange = useMemo(() => getDateRange(period), [period]);

  const { data: profile } = useQuery({
    queryKey: ['my-profile', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data, error } = await supabase.from('profiles').select('id, name').eq('user_id', user.id).single();
      if (error) throw error;
      return data;
    },
    enabled: !!user?.id,
  });

  const { data: messagesData, isLoading: loadingMessages } = useQuery({
    queryKey: ['goals-messages', period, profile?.id],
    queryFn: async () => {
      if (!profile?.id) return [];
      const { data, error } = await supabase.from('messages').select('id, sender, created_at')
        .eq('agent_id', profile.id).gte('created_at', dateRange.from.toISOString()).lte('created_at', dateRange.to.toISOString());
      if (error) throw error;
      return data || [];
    },
    enabled: !!profile?.id,
  });

  const { data: contactsData, isLoading: loadingContacts } = useQuery({
    queryKey: ['goals-contacts', period, profile?.id],
    queryFn: async () => {
      if (!profile?.id) return [];
      const { data, error } = await supabase.from('contacts').select('id, created_at')
        .eq('assigned_to', profile.id).gte('created_at', dateRange.from.toISOString()).lte('created_at', dateRange.to.toISOString());
      if (error) throw error;
      return data || [];
    },
    enabled: !!profile?.id,
  });

  const { data: analysesData, isLoading: loadingAnalyses } = useQuery({
    queryKey: ['goals-analyses', period, profile?.id],
    queryFn: async () => {
      if (!profile?.id) return [];
      const { data, error } = await supabase.from('conversation_analyses').select('id, status, created_at')
        .eq('analyzed_by', profile.id).gte('created_at', dateRange.from.toISOString()).lte('created_at', dateRange.to.toISOString());
      if (error) throw error;
      return data || [];
    },
    enabled: !!profile?.id,
  });

  const { data: customGoals } = useQuery({
    queryKey: ['goals-config', profile?.id],
    queryFn: async () => {
      if (!profile?.id) return [];
      const { data, error } = await supabase.from('goals_configurations').select('*').eq('profile_id', profile.id);
      if (error) throw error;
      return data || [];
    },
    enabled: !!profile?.id,
  });

  const goals = useMemo((): Goal[] => {
    const messagesSent = messagesData?.filter(m => m.sender === 'agent').length || 0;
    const contactsHandled = contactsData?.length || 0;
    const totalAnalyses = analysesData?.length || 0;
    const resolvedAnalyses = analysesData?.filter(a => a.status === 'resolvido').length || 0;
    const resolutionRate = totalAnalyses > 0 ? Math.round((resolvedAnalyses / totalAnalyses) * 100) : 0;

    const isMessageGoalActive = !customGoals?.find(g => g.goal_type === 'messages_sent')?.is_active === false;
    const isContactGoalActive = !customGoals?.find(g => g.goal_type === 'contacts_handled')?.is_active === false;
    const isResolutionGoalActive = !customGoals?.find(g => g.goal_type === 'resolution_rate')?.is_active === false;

    const allGoals: Goal[] = [];
    if (isMessageGoalActive) {
      allGoals.push({ id: 'messages-sent', label: 'Mensagens Enviadas', description: 'Total de mensagens enviadas no período',
        target: getGoalTarget('messages_sent', period, customGoals), current: messagesSent, unit: 'mensagens',
        icon: MessageSquare, color: 'hsl(var(--primary))', priority: 'high' });
    }
    if (isContactGoalActive) {
      allGoals.push({ id: 'contacts-handled', label: 'Contatos Atendidos', description: 'Novos contatos atribuídos a você',
        target: getGoalTarget('contacts_handled', period, customGoals), current: contactsHandled, unit: 'contatos',
        icon: Users, color: 'hsl(var(--chart-2))', priority: 'high' });
    }
    if (isResolutionGoalActive) {
      allGoals.push({ id: 'resolution-rate', label: 'Taxa de Resolução', description: 'Percentual de conversas resolvidas',
        target: getGoalTarget('resolution_rate', period, customGoals), current: resolutionRate, unit: '%',
        icon: CheckCircle2, color: 'hsl(var(--chart-3))', priority: 'medium' });
    }
    return allGoals;
  }, [messagesData, contactsData, analysesData, period, customGoals]);

  const overallProgress = useMemo(() => {
    if (goals.length === 0) return 0;
    return Math.round(goals.reduce((acc, g) => acc + Math.min((g.current / g.target) * 100, 100), 0) / goals.length);
  }, [goals]);

  const completedGoals = useMemo(() => goals.filter(g => g.current >= g.target).length, [goals]);
  const isLoading = loadingMessages || loadingContacts || loadingAnalyses;

  useEffect(() => {
    if (isLoading || goals.length === 0) return;
    const allGoalsCompleted = overallProgress >= 100;
    if (allGoalsCompleted && !previousOverallComplete.current) {
      setCelebrationData({ title: 'Todas as Metas Alcançadas! 🏆', subtitle: 'Parabéns! Você completou todas as metas do período!', emoji: '🎉' });
      setShowCelebration(true);
      previousOverallComplete.current = true;
    } else if (!allGoalsCompleted) { previousOverallComplete.current = false; }

    const currentCompletedIds = new Set(goals.filter(g => g.current >= g.target).map(g => g.id));
    currentCompletedIds.forEach(id => {
      if (!previousCompletedGoals.current.has(id)) {
        const goal = goals.find(g => g.id === id);
        if (goal && !allGoalsCompleted) {
          setCelebrationData({ title: 'Meta Alcançada!', subtitle: `${goal.label}: ${goal.current}/${goal.target} ${goal.unit}`,
            emoji: goal.id === 'messages-sent' ? '💬' : goal.id === 'contacts-handled' ? '👥' : '✅' });
          setShowCelebration(true);
        }
      }
    });
    previousCompletedGoals.current = currentCompletedIds;
  }, [goals, overallProgress, isLoading]);

  return {
    period, setPeriod, configDialogOpen, setConfigDialogOpen,
    showCelebration, setShowCelebration, celebrationData,
    goals, overallProgress, completedGoals, isLoading, dateRange,
  };
}
