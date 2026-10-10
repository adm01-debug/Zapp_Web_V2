import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAgents } from '@/hooks/crm/useAgents';
import { fetchAllRows } from '@/lib/fetchAllRows';
import { format, parseISO } from 'date-fns';
import { appDayEnd, appDayKey, appDayKeyLabel as dayKeyLabel, appDayStart, appShiftDayKey } from '@/lib/localDay';
import { ptBR } from 'date-fns/locale';
import { CONTACT_TYPES as CANONICAL_TYPES } from '@/utils/whatsappFileTypes';

/** Chaves `yyyy-MM-dd` (no fuso do app) cobertas pelo recorte, na ordem. */
function dayKeysOf(range: { from: Date; to: Date }): string[] {
  const chaves: string[] = [];
  for (let k = appDayKey(range.from); k <= appDayKey(range.to); k = appShiftDayKey(k, 1)) chaves.push(k);
  return chaves;
}

export function useReportsData() {
  const [period, setPeriod] = useState('30');
  const [selectedAgent, setSelectedAgent] = useState<string>('all');
  const [selectedTag, setSelectedTag] = useState<string>('all');
  const [compareEnabled, setCompareEnabled] = useState(false);

  const { agents } = useAgents();

  // Recortes ancorados no fuso do app (America/Sao_Paulo), o mesmo que o servidor usa em
  // `in_last_days`: com o fuso do navegador o mesmo período recortava janelas diferentes para
  // pessoas em fusos diferentes e não batia com os números contados no banco.
  const dateRange = useMemo(() => {
    const days = Number.parseInt(period);
    return {
      from: appDayStart(days),
      to: appDayEnd(0),
    };
  }, [period]);

  const previousDateRange = useMemo(() => {
    const days = Number.parseInt(period);
    return {
      from: appDayStart(days * 2),
      to: appDayEnd(days + 1),
    };
  }, [period]);

  // R2-MOD-018: um `select()` sem `range` devolve só a primeira página (teto do PostgREST) e os
  // totais/repartições do período — chamados de "total" na tela — subcontavam em silêncio.
  // Aqui a leitura percorre todas as páginas com ordenação estável (`id`) e devolve `incomplete`
  // quando não cobriu tudo, para o relatório não publicar parcial como total definitivo.
  // R2-MOD-019: o resultado do conjunto carrega o próprio `incomplete`; o erro da leitura é
  // exposto pelo hook (`error`) em vez de virar métricas zero.
  const { data: messagesResult, isLoading: loadingMessages, error: messagesError } = useQuery({
    queryKey: ['reports-messages', period, selectedAgent],
    queryFn: async () => {
      const base = () => {
        let query = supabase
          .from('messages')
          .select('id, created_at, sender, agent_id, contact_id, is_read')
          .gte('created_at', dateRange.from.toISOString())
          .lte('created_at', dateRange.to.toISOString());
        if (selectedAgent !== 'all') query = query.eq('agent_id', selectedAgent);
        return query;
      };
      return fetchAllRows((from, to) => base().order('id').range(from, to));
    },
  });

  const { data: previousMessagesResult, isLoading: loadingPreviousMessages, error: previousMessagesError } = useQuery({
    queryKey: ['reports-messages-previous', period, selectedAgent],
    queryFn: async () => {
      const base = () => {
        let query = supabase
          .from('messages')
          .select('id, created_at, sender, agent_id, contact_id, is_read')
          .gte('created_at', previousDateRange.from.toISOString())
          .lte('created_at', previousDateRange.to.toISOString());
        if (selectedAgent !== 'all') query = query.eq('agent_id', selectedAgent);
        return query;
      };
      return fetchAllRows((from, to) => base().order('id').range(from, to));
    },
    enabled: compareEnabled,
  });

  const { data: contactsResult, isLoading: loadingContacts, error: contactsError } = useQuery({
    queryKey: ['reports-contacts', period, selectedAgent, selectedTag],
    queryFn: async () => {
      const base = () => {
        let query = supabase
          .from('contacts')
          .select('id, created_at, assigned_to, tags, contact_type')
          .gte('created_at', dateRange.from.toISOString())
          .lte('created_at', dateRange.to.toISOString());
        if (selectedAgent !== 'all') query = query.eq('assigned_to', selectedAgent);
        return query;
      };
      return fetchAllRows((from, to) => base().order('id').range(from, to));
    },
  });

  const { data: previousContactsResult, isLoading: loadingPreviousContacts, error: previousContactsError } = useQuery({
    queryKey: ['reports-contacts-previous', period, selectedAgent, selectedTag],
    queryFn: async () => {
      const base = () => {
        let query = supabase
          .from('contacts')
          .select('id, created_at, assigned_to, tags, contact_type')
          .gte('created_at', previousDateRange.from.toISOString())
          .lte('created_at', previousDateRange.to.toISOString());
        if (selectedAgent !== 'all') query = query.eq('assigned_to', selectedAgent);
        return query;
      };
      return fetchAllRows((from, to) => base().order('id').range(from, to));
    },
    enabled: compareEnabled,
  });

  const messagesData = messagesResult?.rows;
  const previousMessagesData = previousMessagesResult?.rows;
  const contactsData = contactsResult?.rows;
  const previousContactsData = previousContactsResult?.rows;

  const tags = useMemo(() => {
    if (!contactsData) return [];
    const tagSet = new Set<string>();
    contactsData.forEach(c => (c.tags || []).forEach((t: string) => tagSet.add(t)));
    return [...tagSet].sort((a, b) => a.localeCompare(b)).map(name => ({ id: name, name }));
  }, [contactsData]);

  // Process data for charts
  const chartData = useMemo(() => {
    if (!messagesData) return { daily: [], byAgent: [], bySender: [] };
    const daily = dayKeysOf(dateRange).map(key => {
      const dayMessages = messagesData.filter(m => appDayKey(m.created_at) === key);
      const sent = dayMessages.filter(m => m.sender === 'agent').length;
      const received = dayMessages.filter(m => m.sender === 'contact').length;
      return { date: dayKeyLabel(key), enviadas: sent, recebidas: received, total: sent + received };
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
    const daily = dayKeysOf(previousDateRange).map((key, index) => {
      const dayMessages = previousMessagesData.filter(m => appDayKey(m.created_at) === key);
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
    contactsData.forEach(c => {
      if (!c.contact_type) return; // omite contatos sem tipo definido
      const canonical = CANONICAL_TYPES.find(ct => ct.value === c.contact_type);
      const label = canonical ? canonical.label : c.contact_type; // fallback ao valor raw se tipo desconhecido
      typeCounts[label] = (typeCounts[label] || 0) + 1;
    });
    const byType = Object.entries(typeCounts).map(([type, count]) => ({ name: type, value: count }));
    const tagCounts: Record<string, number> = {};
    contactsData.forEach(c => { (c.tags || []).forEach((tag: string) => { tagCounts[tag] = (tagCounts[tag] || 0) + 1; }); });
    const byTag = Object.entries(tagCounts).map(([tag, count]) => ({ name: tag, contatos: count })).sort((a, b) => b.contatos - a.contatos).slice(0, 10);
    const daily = dayKeysOf(dateRange).map(key => ({
      date: dayKeyLabel(key),
      novos: contactsData.filter(c => appDayKey(c.created_at) === key).length,
    }));
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
      avgMessagesPerDay: Math.round(totalMessages / Number.parseInt(period)),
      prevTotalMessages, prevSentMessages, prevReceivedMessages, prevTotalContacts, prevActiveAgents,
      prevAvgMessagesPerDay: Math.round(prevTotalMessages / Number.parseInt(period)),
      messagesTrend: calculateTrend(totalMessages, prevTotalMessages),
      sentTrend: calculateTrend(sentMessages, prevSentMessages),
      contactsTrend: calculateTrend(totalContacts, prevTotalContacts),
      agentsTrend: calculateTrend(activeAgents, prevActiveAgents),
    };
  }, [messagesData, contactsData, previousMessagesData, previousContactsData, period, compareEnabled]);

  const isLoading = loadingMessages || loadingContacts || (compareEnabled && (loadingPreviousMessages || loadingPreviousContacts));

  // R2-MOD-018/019: transparência da leitura — falha de rede/permissão vira `error` (não zero
  // confirmado) e leitura que parou no meio vira `isIncomplete` (total é parcial).
  const error =
    messagesError || contactsError || previousMessagesError || previousContactsError ||
    messagesResult?.error || contactsResult?.error || previousMessagesResult?.error || previousContactsResult?.error ||
    null;
  const isError = Boolean(error);
  const isIncomplete =
    (messagesResult?.incomplete ?? false) ||
    (contactsResult?.incomplete ?? false) ||
    (previousMessagesResult?.incomplete ?? false) ||
    (previousContactsResult?.incomplete ?? false);

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
    isLoading, isError, isIncomplete, error, getExportData,
  };
}
