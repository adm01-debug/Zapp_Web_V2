import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { fetchAllRows, type PageResult } from '@/lib/fetchAllRows';
import { log } from '@/lib/logger';
import { startOfDay, subDays, format, startOfHour, eachDayOfInterval, eachHourOfInterval, startOfToday, addDays } from 'date-fns';
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

/** Campos de `contacts` usados para derivar resolução canônica (R2-QUE-001). */
interface AnalyticsContact {
  id: string;
  assigned_to: string | null;
  created_at: string;
  conversation_status: string | null;
  conversation_status_changed_at: string | null;
}

interface AnalyticsMessage {
  id: string;
  contact_id: string | null;
  created_at: string;
  sender: string;
  agent_id: string | null;
}

/** Página explícita: um select sem range fica sujeito ao teto do PostgREST. */
const ANALYTICS_PAGE_SIZE = 1000;

async function fetchCompleteAnalyticsRows<T>(
  source: 'contacts' | 'messages',
  fetchPage: (from: number, to: number) => PromiseLike<PageResult<T>>,
): Promise<T[]> {
  const result = await fetchAllRows(fetchPage, { pageSize: ANALYTICS_PAGE_SIZE });
  if (result.incomplete) {
    throw result.error ?? new Error(`Paginação de ${source} excedeu o limite de segurança`);
  }
  return result.rows;
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
    messages: Array<{ id: string; contact_id: string | null; created_at: string; sender: string }>,
    contacts: AnalyticsContact[],
    range: DateRange
  ): DailyData[] => {
    const days = eachDayOfInterval({
      start: range.from,
      end: range.to
    });

    // For longer periods, group by week or show fewer data points
    const totalDays = days.length;
    const showEveryNth = totalDays > 14 ? Math.ceil(totalDays / 14) : 1;

    // R2-QUE-004: os pontos são intervalos CONSECUTIVOS e EXCLUSIVOS, limitados ao fim do período —
    // cada ponto vai do seu dia até o dia em que começa o próximo e o último termina no dia seguinte
    // ao término selecionado. Antes o último índice era somado à seleção e recebia uma janela inteira,
    // então o dia final entrava em dois pontos: em 30 dias o bucket de 28/01 já cobria 28–30 e o bucket
    // de 30/01 repetia o dia 30 (mensagens, novos e resolvidos contados duas vezes).
    const buckets = days.filter((_, index) => index % showEveryNth === 0);

    return buckets.map((date, index) => {
      const dayStart = startOfDay(date);
      const nextBucket = buckets[index + 1];
      const dayEnd = nextBucket ? startOfDay(nextBucket) : addDays(startOfDay(range.to), 1);

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

      // Resolvidos do período vêm do status canônico `resolved` e do timestamp de mudança de
      // status — atribuição (assigned_to) não é resolução, nem a data de criação é a de resolução.
      const resolvedContacts = contacts.filter(c => {
        if (c.conversation_status !== 'resolved' || !c.conversation_status_changed_at) return false;
        const resolvedAt = new Date(c.conversation_status_changed_at);
        return resolvedAt >= dayStart && resolvedAt < dayEnd;
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
    contacts: Array<{ id: string; assigned_to: string | null; conversation_status: string | null }>
  ): StatusData[] => {
    const total = contacts.length;
    if (total === 0) {
      return [
        { name: 'Resolvidos', value: 0, color: 'hsl(var(--primary))' },
        { name: 'Em Atendimento', value: 0, color: 'hsl(var(--secondary))' },
        { name: 'Aguardando', value: 0, color: 'hsl(var(--accent-foreground))' },
      ];
    }

    // R2-QUE-001: Resolvidos e Em Atendimento saem do status canônico, não de uma proporção fixa
    // dos atribuídos. Atendimento em curso é o episódio `open` com dono; Resolvidos é o status
    // `resolved`; o restante fica Aguardando (não resolvido e fora de atendimento ativo).
    const resolved = contacts.filter(c => c.conversation_status === 'resolved').length;
    const inProgress = contacts.filter(c => c.conversation_status === 'open' && !!c.assigned_to).length;
    const waiting = total - resolved - inProgress;

    const resolvedPercent = Math.round((resolved / total) * 100);
    const inProgressPercent = Math.round((inProgress / total) * 100);
    const waitingPercent = 100 - resolvedPercent - inProgressPercent;

    return [
      { name: 'Resolvidos', value: resolvedPercent, color: 'hsl(var(--primary))' },
      { name: 'Em Atendimento', value: inProgressPercent, color: 'hsl(var(--secondary))' },
      { name: 'Aguardando', value: waitingPercent, color: 'hsl(var(--accent-foreground))' },
    ];
  };

  const fetchAnalytics = useCallback(async () => {
    try {
      setLoading(true);

      // `range` explícito percorre a fila inteira; sem ele o PostgREST corta silenciosamente a
      // consulta no teto configurado e os gráficos passam a representar só a primeira página.
      const contacts = await fetchCompleteAnalyticsRows<AnalyticsContact>(
        'contacts',
        (from, to) => supabase
          .from('contacts')
          .select('id, assigned_to, created_at, conversation_status, conversation_status_changed_at')
          .eq('queue_id', queueId)
          .order('id', { ascending: true })
          .range(from, to),
      );

      if (contacts.length === 0) {
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

      // A relação filtra a fila no servidor sem formar um `.in(...)` gigante com todos os IDs.
      // A ordem por chave única torna estável a leitura paginada de todas as mensagens do período.
      const messages = await fetchCompleteAnalyticsRows<AnalyticsMessage>(
        'messages',
        (from, to) => supabase
          .from('messages')
          .select('id, contact_id, created_at, sender, agent_id, contacts!inner(queue_id)')
          .eq('contacts.queue_id', queueId)
          .gte('created_at', dateRange.from.toISOString())
          .lte('created_at', dateRange.to.toISOString())
          .order('id', { ascending: true })
          .range(from, to),
      );

      // Process daily data
      const dailyAggregation = processDailyData(messages, contacts, dateRange);
      setDailyData(dailyAggregation);

      // Process hourly data (today only)
      const hourlyAggregation = processHourlyData(messages);
      setHourlyData(hourlyAggregation);

      // Process agent performance
      const agentAggregation = await processAgentPerformance(messages);
      setAgentPerformance(agentAggregation);

      // Process status distribution
      const statusAggregation = processStatusData(contacts);
      setStatusData(statusAggregation);

    } catch (error) {
      log.error('Error fetching queue analytics:', error);
    } finally {
      setLoading(false);
    }
  }, [queueId, dateRange]);

  useEffect(() => {
    if (queueId && dateRange.from && dateRange.to) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount/troca-de-fila-ou-período padrão, sem estado derivado de props para sincronizar.
      fetchAnalytics();
    }
  }, [queueId, dateRange, fetchAnalytics]);

  return {
    dailyData,
    hourlyData,
    agentPerformance,
    statusData,
    loading,
  };
}
