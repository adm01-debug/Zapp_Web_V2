import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { log } from '@/lib/logger';
import { startOfDay, subDays, format, startOfHour, eachDayOfInterval, eachHourOfInterval, startOfToday, differenceInDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface DailyData {
  day: string;
  date: string;
  mensagens: number;
  resolvidos: number;
  novos: number;
}

interface HourlyData {
  hora: string;
  atendimentos: number;
}

interface AgentPerformance {
  name: string;
  atendimentos: number;
  profile_id: string;
}

interface StatusData {
  name: string;
  value: number;
  color: string;
}

interface DateRange {
  from: Date;
  to: Date;
}

interface QueueAnalytics {
  dailyData: DailyData[];
  hourlyData: HourlyData[];
  agentPerformance: AgentPerformance[];
  statusData: StatusData[];
  loading: boolean;
}

export function useQueueAnalytics(queueId: string, dateRange: DateRange): QueueAnalytics {
  const [dailyData, setDailyData] = useState<DailyData[]>([]);
  const [hourlyData, setHourlyData] = useState<HourlyData[]>([]);
  const [agentPerformance, setAgentPerformance] = useState<AgentPerformance[]>([]);
  const [statusData, setStatusData] = useState<StatusData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (queueId && dateRange.from && dateRange.to) {
      fetchAnalytics();
    }
  }, [queueId, dateRange.from.toISOString(), dateRange.to.toISOString()]);

  const fetchAnalytics = async () => {
    try {
      setLoading(true);

      // Get contacts in this queue
      const { data: contacts, error: contactsError } = await supabase
        .from('contacts')
        .select('id, assigned_to, created_at')
        .eq('queue_id', queueId);

      if (contactsError) throw contactsError;

      const contactIds = contacts?.map(c => c.id) || [];

      if (contactIds.length === 0) {
        setDailyData(generateEmptyDailyData(dateRange));
        setHourlyData(generateEmptyHourlyData());
        setAgentPerformance([]);
        setStatusData([
          { name: 'Resolvidos', value: 0, color: 'hsl(var(--primary))' },
          { name: 'Em Atendimento', value: 0, color: 'hsl(var(--secondary))' },
          { name: 'Aguardando', value: 0, color: 'hsl(var(--accent-foreground))' },
        ]);
        setLoading(false);
        return;
      }

      // Fetch messages for these contacts in the date range
      const { data: messages, error: messagesError } = await supabase
        .from('messages')
        .select('id, contact_id, created_at, sender, agent_id')
        .in('contact_id', contactIds)
        .gte('created_at', dateRange.from.toISOString())
        .lte('created_at', dateRange.to.toISOString())
        .order('created_at', { ascending: true });

      if (messagesError) throw messagesError;

      // Process daily data
      const dailyAggregation = processDailyData(messages || [], contacts || [], dateRange);
      setDailyData(dailyAggregation);

      // Process hourly data (today only)
      const hourlyAggregation = processHourlyData(messages || []);
      setHourlyData(hourlyAggregation);

      // Process agent performance
      const agentAggregation = await processAgentPerformance(messages || []);
      setAgentPerformance(agentAggregation);

      // Process status distribution
      const statusAggregation = processStatusData(contacts || []);
      setStatusData(statusAggregation);

    } catch (error) {
      log.error('Error fetching queue analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  const generateEmptyDailyData = (range: DateRange): DailyData[] => {
    const days = eachDayOfInterval({
      start: range.from,
      end: range.to
    });

    return days.map(date => ({
      day: format(date, 'dd/MM', { locale: ptBR }),
      date: format(date, 'yyyy-MM-dd'),
      mensagens: 0,
      resolvidos: 0,
      novos: 0,
    }));
  };

  const generateEmptyHourlyData = (): HourlyData[] => {
    return Array.from({ length: 12 }, (_, i) => ({
      hora: `${8 + i}h`,
      atendimentos: 0,
    }));
  };

  const processDailyData = (
    messages: Array<{ id: string; contact_id: string; created_at: string; sender: string }>,
    contacts: Array<{ id: string; assigned_to: string | null; created_at: string }>,
    range: DateRange
  ): DailyData[] => {
    const days = eachDayOfInterval({
      start: range.from,
      end: range.to
    });

    // For longer periods, group by week or show fewer data points
    const totalDays = differenceInDays(range.to, range.from) + 1;
    const showEveryNth = totalDays > 14 ? Math.ceil(totalDays / 14) : 1;

    return days
      .filter((_, index) => index % showEveryNth === 0 || index === days.length - 1)
      .map(date => {
        const dayStart = startOfDay(date);
        const dayEnd = new Date(dayStart);
        dayEnd.setDate(dayEnd.getDate() + showEveryNth);

        // Count messages for this period
        const periodMessages = messages.filter(m => {
          const msgDate = new Date(m.created_at);
          return msgDate >= dayStart && msgDate < dayEnd;
        });

        // Count new contacts for this period
        const newContacts = contacts.filter(c => {
          const contactDate = new Date(c.created_at);
          return contactDate >= dayStart && contactDate < dayEnd;
        });

        // Count resolved (assigned) contacts for this period
        const resolvedContacts = contacts.filter(c => {
          if (!c.assigned_to) return false;
          const contactDate = new Date(c.created_at);
          return contactDate >= dayStart && contactDate < dayEnd;
        });

        return {
          day: format(date, totalDays > 14 ? 'dd/MM' : 'EEE', { locale: ptBR }),
          date: format(date, 'yyyy-MM-dd'),
          mensagens: periodMessages.length,
          resolvidos: resolvedContacts.length,
          novos: newContacts.length,
        };
      });
  };

  const processHourlyData = (
    messages: Array<{ id: string; created_at: string }>
  ): HourlyData[] => {
    const today = startOfToday();
    const hours = eachHourOfInterval({
      start: new Date(today.setHours(8)),
      end: new Date(today.setHours(19))
    });

    return hours.map(hour => {
      const hourStart = startOfHour(hour);
      const hourEnd = new Date(hourStart);
      hourEnd.setHours(hourEnd.getHours() + 1);

      const hourMessages = messages.filter(m => {
        const msgDate = new Date(m.created_at);
        return msgDate >= hourStart && msgDate < hourEnd;
      });

      return {
        hora: format(hour, 'HH\'h\''),
        atendimentos: hourMessages.length,
      };
    });
  };

  const processAgentPerformance = async (
    messages: Array<{ id: string; agent_id: string | null; sender: string }>
  ): Promise<AgentPerformance[]> => {
    // Count messages sent by agents
    const agentMessages: Record<string, number> = {};
    
    messages.forEach(m => {
      if (m.sender === 'agent' && m.agent_id) {
        agentMessages[m.agent_id] = (agentMessages[m.agent_id] || 0) + 1;
      }
    });

    const agentIds = Object.keys(agentMessages);
    if (agentIds.length === 0) return [];

    // Fetch agent profiles
    const { data: profiles, error } = await supabase
      .from('profiles')
      .select('id, name')
      .in('id', agentIds);

    if (error || !profiles) return [];

    return profiles
      .map(p => ({
        name: p.name,
        profile_id: p.id,
        atendimentos: agentMessages[p.id] || 0,
      }))
      .sort((a, b) => b.atendimentos - a.atendimentos)
      .slice(0, 5);
  };

  const processStatusData = (
    contacts: Array<{ id: string; assigned_to: string | null }>
  ): StatusData[] => {
    const total = contacts.length;
    if (total === 0) {
      return [
        { name: 'Resolvidos', value: 0, color: 'hsl(var(--primary))' },
        { name: 'Em Atendimento', value: 0, color: 'hsl(var(--secondary))' },
        { name: 'Aguardando', value: 0, color: 'hsl(var(--accent-foreground))' },
      ];
    }

    const assigned = contacts.filter(c => c.assigned_to).length;
    const waiting = total - assigned;

    // Estimate resolved as 70% of assigned (since we don't have resolved status)
    const resolved = Math.floor(assigned * 0.7);
    const inProgress = assigned - resolved;

    const resolvedPercent = Math.round((resolved / total) * 100);
    const inProgressPercent = Math.round((inProgress / total) * 100);
    const waitingPercent = 100 - resolvedPercent - inProgressPercent;

    return [
      { name: 'Resolvidos', value: resolvedPercent, color: 'hsl(var(--primary))' },
      { name: 'Em Atendimento', value: inProgressPercent, color: 'hsl(var(--secondary))' },
      { name: 'Aguardando', value: waitingPercent, color: 'hsl(var(--accent-foreground))' },
    ];
  };

  return {
    dailyData,
    hourlyData,
    agentPerformance,
    statusData,
    loading,
  };
}
