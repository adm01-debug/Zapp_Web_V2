import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAgents } from '@/hooks/crm/useAgents';
import { useTags } from '@/hooks/crm/useTags';
import { format, subDays, startOfDay, endOfDay, eachDayOfInterval, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export function useReportsData() {
  const [period, setPeriod] = useState('30');
  const [selectedAgent, setSelectedAgent] = useState<string>('all');
  const [selectedTag, setSelectedTag] = useState<string>('all');
  const [compareEnabled, setCompareEnabled] = useState(false);

  const { agents } = useAgents();
  const { tags } = useTags();

  const dateRange = useMemo(() => {
    const days = parseInt(period);
    return {
      from: startOfDay(subDays(new Date(), days)),
      to: endOfDay(new Date()),
    };
  }, [period]);

  const previousDateRange = useMemo(() => {
    const days = parseInt(period);
    return {
      from: startOfDay(subDays(new Date(), days * 2)),
      to: endOfDay(subDays(new Date(), days + 1)),
    };
  }, [period]);

  // Fetch messages data
  const { data: messagesData, isLoading: loadingMessages } = useQuery({
    queryKey: ['reports-messages', period, selectedAgent],
    queryFn: async () => {
      let query = supabase
        .from('messages')
        .select('id, created_at, sender, agent_id, contact_id, is_read')
        .gte('created_at', dateRange.from.toISOString())
        .lte('created_at', dateRange.to.toISOString());
      if (selectedAgent !== 'all') query = query.eq('agent_id', selectedAgent);
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
  });

  const { data: previousMessagesData, isLoading: loadingPreviousMessages } = useQuery({
    queryKey: ['reports-messages-previous', period, selectedAgent],
    queryFn: async () => {
      let query = supabase
        .from('messages')
        .select('id, created_at, sender, agent_id, contact_id, is_read')
        .gte('created_at', previousDateRange.from.toISOString())
        .lte('created_at', previousDateRange.to.toISOString());
      if (selectedAgent !== 'all') query = query.eq('agent_id', selectedAgent);
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: compareEnabled,
  });

  const { data: contactsData, isLoading: loadingContacts } = useQuery({
    queryKey: ['reports-contacts', period, selectedAgent, selectedTag],
    queryFn: async () => {
      let query = supabase
        .from('contacts')
        .select('id, created_at, assigned_to, tags, contact_type')
        .gte('created_at', dateRange.from.toISOString())
        .lte('created_at', dateRange.to.toISOString());
      if (selectedAgent !== 'all') query = query.eq('assigned_to', selectedAgent);
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
  });

  const { data: previousContactsData, isLoading: loadingPreviousContacts } = useQuery({
    queryKey: ['reports-contacts-previous', period, selectedAgent, selectedTag],
    queryFn: async () => {
      let query = supabase
        .from('contacts')
        .select('id, created_at, assigned_to, tags, contact_type')
        .gte('created_at', previousDateRange.from.toISOString())
        .lte('created_at', previousDateRange.to.toISOString());
      if (selectedAgent !== 'all') query = query.eq('assigned_to', selectedAgent);
      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    enabled: compareEnabled,
  });

  // Process data for charts
  const chartData = useMemo(() => {
    if (!messagesData) return { daily: [], byAgent: [], bySender: [] };
    const days = eachDayOfInterval({ start: dateRange.from, end: dateRange.to });
    const daily = days.map(day => {
      const dayStr = format(day, 'yyyy-MM-dd');
      const dayMessages = messagesData.filter(m => format(parseISO(m.created_at), 'yyyy-MM-dd') === dayStr);
      const sent = dayMessages.filter(m => m.sender === 'agent').length;
      const received = dayMessages.filter(m => m.sender === 'contact').length;
      return { date: format(day, 'dd/MM', { locale: ptBR }), enviadas: sent, recebidas: received, total: sent + received };
    });
    const agentCounts: Record<string, number> = {};
    messagesData.forEach(m => { if (m.agent_id) agentCounts[m.agent_id] = (agentCounts[m.agent_id] || 0) + 1; });
    const byAgent = Object.entries(agentCounts)
      .map(([agentId, count]) => ({ name: agents.find(a => a.id === agentId)?.name || 'Desconhecido', mensagens: count }))
      .sort((a, b) => b.mensagens - a.mensagens).slice(0, 10);
    const sent = messagesData.filter(m => m.sender === 'agent').length;
    const received = messagesData.filter(m => m.sender === 'contact').length;
    const bySender = [{ name: 'Enviadas', value: sent }, { name: 'Recebidas', value: received }];
    return { daily, byAgent, bySender };
  }, [messagesData, dateRange, agents]);

  const previousChartData = useMemo(() => {
    if (!previousMessagesData || !compareEnabled) return { daily: [], byAgent: [], bySender: [], totals: { sent: 0, received: 0, total: 0 } };
    const days = eachDayOfInterval({ start: previousDateRange.from, end: previousDateRange.to });
    const daily = days.map((day, index) => {
      const dayStr = format(day, 'yyyy-MM-dd');
      const dayMessages = previousMessagesData.filter(m => format(parseISO(m.created_at), 'yyyy-MM-dd') === dayStr);
      const sent = dayMessages.filter(m => m.sender === 'agent').length;
      const received = dayMessages.filter(m => m.sender === 'contact').length;
      return { date: `Dia ${index + 1}`, enviadas: sent, recebidas: received, total: sent + received };
    });
    const agentCounts: Record<string, number> = {};
    previousMessagesData.forEach(m => { if (m.agent_id) agentCounts[m.agent_id] = (agentCounts[m.agent_id] || 0) + 1; });
    const byAgent = Object.entries(agentCounts)
      .map(([agentId, count]) => ({ name: agents.find(a => a.id === agentId)?.name || 'Desconhecido', mensagens: count }))
      .sort((a, b) => b.mensagens - a.mensagens).slice(0, 10);
    const sent = previousMessagesData.filter(m => m.sender === 'agent').length;
    const received = previousMessagesData.filter(m => m.sender === 'contact').length;
    return { daily, byAgent, bySender: [{ name: 'Enviadas', value: sent }, { name: 'Recebidas', value: received }], totals: { sent, received, total: sent + received } };
  }, [previousMessagesData, previousDateRange, agents, compareEnabled]);

  const comparisonSummary = useMemo(() => {
    if (!compareEnabled) return [];
    const currentTotal = messagesData?.length || 0;
    const currentSent = messagesData?.filter(m => m.sender === 'agent').length || 0;
    const currentReceived = messagesData?.filter(m => m.sender === 'contact').length || 0;
    const currentContacts = contactsData?.length || 0;
    const prevTotal = previousMessagesData?.length || 0;
    const prevSent = previousMessagesData?.filter(m => m.sender === 'agent').length || 0;
    const prevReceived = previousMessagesData?.filter(m => m.sender === 'contact').length || 0;
    const prevContacts = previousContactsData?.length || 0;
    return [
      { name: 'Total Mensagens', atual: currentTotal, anterior: prevTotal },
      { name: 'Enviadas', atual: currentSent, anterior: prevSent },
      { name: 'Recebidas', atual: currentReceived, anterior: prevReceived },
      { name: 'Novos Contatos', atual: currentContacts, anterior: prevContacts },
    ];
  }, [messagesData, contactsData, previousMessagesData, previousContactsData, compareEnabled]);

  const contactsChartData = useMemo(() => {
    if (!contactsData) return { byType: [], byTag: [], daily: [] };
    const typeCounts: Record<string, number> = {};
    contactsData.forEach(c => { const type = c.contact_type || 'outros'; typeCounts[type] = (typeCounts[type] || 0) + 1; });
    const byType = Object.entries(typeCounts).map(([type, count]) => ({ name: type.charAt(0).toUpperCase() + type.slice(1), value: count }));
    const tagCounts: Record<string, number> = {};
    contactsData.forEach(c => { (c.tags || []).forEach((tag: string) => { tagCounts[tag] = (tagCounts[tag] || 0) + 1; }); });
    const byTag = Object.entries(tagCounts).map(([tag, count]) => ({ name: tag, contatos: count })).sort((a, b) => b.contatos - a.contatos).slice(0, 10);
    const days = eachDayOfInterval({ start: dateRange.from, end: dateRange.to });
    const daily = days.map(day => {
      const dayStr = format(day, 'yyyy-MM-dd');
      return { date: format(day, 'dd/MM', { locale: ptBR }), novos: contactsData.filter(c => format(parseISO(c.created_at), 'yyyy-MM-dd') === dayStr).length };
    });
    return { byType, byTag, daily };
  }, [contactsData, dateRange]);

  const stats = useMemo(() => {
    const totalMessages = messagesData?.length || 0;
    const sentMessages = messagesData?.filter(m => m.sender === 'agent').length || 0;
    const receivedMessages = messagesData?.filter(m => m.sender === 'contact').length || 0;
    const totalContacts = contactsData?.length || 0;
    const activeAgents = new Set(messagesData?.map(m => m.agent_id).filter(Boolean)).size;
    const prevTotalMessages = previousMessagesData?.length || 0;
    const prevSentMessages = previousMessagesData?.filter(m => m.sender === 'agent').length || 0;
    const prevReceivedMessages = previousMessagesData?.filter(m => m.sender === 'contact').length || 0;
    const prevTotalContacts = previousContactsData?.length || 0;
    const prevActiveAgents = new Set(previousMessagesData?.map(m => m.agent_id).filter(Boolean)).size;
    const calculateTrend = (current: number, previous: number) => {
      if (!compareEnabled || previous === 0) return undefined;
      return ((current - previous) / previous) * 100;
    };
    return {
      totalMessages, sentMessages, receivedMessages, totalContacts, activeAgents,
      avgMessagesPerDay: Math.round(totalMessages / parseInt(period)),
      prevTotalMessages, prevSentMessages, prevReceivedMessages, prevTotalContacts, prevActiveAgents,
      prevAvgMessagesPerDay: Math.round(prevTotalMessages / parseInt(period)),
      messagesTrend: calculateTrend(totalMessages, prevTotalMessages),
      sentTrend: calculateTrend(sentMessages, prevSentMessages),
      contactsTrend: calculateTrend(totalContacts, prevTotalContacts),
      agentsTrend: calculateTrend(activeAgents, prevActiveAgents),
    };
  }, [messagesData, contactsData, previousMessagesData, previousContactsData, period, compareEnabled]);

  const isLoading = loadingMessages || loadingContacts || (compareEnabled && (loadingPreviousMessages || loadingPreviousContacts));

  const getExportData = () => ({
    title: 'Relatório de Atendimento',
    subtitle: `Período: ${format(dateRange.from, 'dd/MM/yyyy')} - ${format(dateRange.to, 'dd/MM/yyyy')}`,
    generatedAt: new Date(),
    columns: [
      { header: 'Data', key: 'date' },
      { header: 'Enviadas', key: 'enviadas' },
      { header: 'Recebidas', key: 'recebidas' },
      { header: 'Total', key: 'total' },
    ],
    rows: chartData.daily,
    summary: [
      { label: 'Total de Mensagens', value: stats.totalMessages },
      { label: 'Mensagens Enviadas', value: stats.sentMessages },
      { label: 'Novos Contatos', value: stats.totalContacts },
      { label: 'Agentes Ativos', value: stats.activeAgents },
      { label: 'Média por Dia', value: stats.avgMessagesPerDay },
    ],
  });

  return {
    period, setPeriod, selectedAgent, setSelectedAgent, selectedTag, setSelectedTag,
    compareEnabled, setCompareEnabled,
    agents, tags, dateRange,
    chartData, previousChartData, comparisonSummary, contactsChartData, stats,
    isLoading, getExportData,
  };
}
