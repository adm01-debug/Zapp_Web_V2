import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format, subHours, subDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';

export type TimeFilter = '1h' | '6h' | '24h' | '7d' | '30d';

export interface UsageLog {
  id: string;
  user_id: string | null;
  profile_id: string | null;
  function_name: string;
  model: string | null;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  duration_ms: number | null;
  status: string;
  created_at: string;
}

interface ProfileInfo {
  id: string;
  user_id: string | null;
  name: string | null;
  email: string | null;
  avatar_url: string | null;
}

export const FUNCTION_COLORS: Record<string, string> = {
  'ai-suggest-reply': '#3b82f6',
  'ai-enhance-message': '#8b5cf6',
  'ai-conversation-analysis': '#f59e0b',
  'ai-conversation-summary': '#10b981',
  'ai-auto-tag': '#ef4444',
  'chatbot-l1': '#06b6d4',
};

export const FUNCTION_LABELS: Record<string, string> = {
  'ai-suggest-reply': 'Sugestão de Resposta',
  'ai-enhance-message': 'Reescrita de Mensagem',
  'ai-conversation-analysis': 'Análise de Conversa',
  'ai-conversation-summary': 'Resumo de Conversa',
  'ai-auto-tag': 'Auto-Tag',
  'chatbot-l1': 'Chatbot L1',
};

function getTimeRange(filter: TimeFilter): Date {
  switch (filter) {
    case '1h': return subHours(new Date(), 1);
    case '6h': return subHours(new Date(), 6);
    case '24h': return subDays(new Date(), 1);
    case '7d': return subDays(new Date(), 7);
    case '30d': return subDays(new Date(), 30);
  }
}

export function useAIUsageDashboard() {
  const [logsPage, setLogsPage] = useState(0);
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('24h');

  const { data: logs = [], isLoading, refetch } = useQuery({
    queryKey: ['ai-usage-logs', timeFilter],
    queryFn: async () => {
      const since = getTimeRange(timeFilter).toISOString();
      const { data, error } = await supabase
        .from('ai_usage_logs').select('*')
        .gte('created_at', since)
        .order('created_at', { ascending: false }).limit(1000);
      if (error) throw error;
      return (data || []) as UsageLog[];
    },
    refetchInterval: 30_000,
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ['profiles-for-usage'],
    queryFn: async () => {
      const { data } = await supabase.from('profiles').select('id, user_id, name, email, avatar_url');
      return (data || []) as ProfileInfo[];
    },
  });

  const profileMap = useMemo(() => {
    const map = new Map<string, ProfileInfo>();
    profiles.forEach(p => { if (p.user_id) map.set(p.user_id, p); map.set(p.id, p); });
    return map;
  }, [profiles]);

  const stats = useMemo(() => {
    const totalCalls = logs.length;
    const totalTokens = logs.reduce((sum, l) => sum + (l.total_tokens || 0), 0);
    const avgDuration = logs.length > 0 ? Math.round(logs.reduce((sum, l) => sum + (l.duration_ms || 0), 0) / logs.length) : 0;
    const errorCount = logs.filter(l => l.status === 'error').length;
    const uniqueUsers = new Set(logs.map(l => l.user_id).filter(Boolean)).size;
    return { totalCalls, totalTokens, avgDuration, errorCount, uniqueUsers };
  }, [logs]);

  const userUsage = useMemo(() => {
    const map = new Map<string, { calls: number; tokens: number; userId: string }>();
    logs.forEach(l => {
      const uid = l.user_id || 'unknown';
      const existing = map.get(uid) || { calls: 0, tokens: 0, userId: uid };
      existing.calls++; existing.tokens += l.total_tokens || 0;
      map.set(uid, existing);
    });
    return Array.from(map.values()).sort((a, b) => b.tokens - a.tokens).slice(0, 20);
  }, [logs]);

  const functionUsage = useMemo(() => {
    const map = new Map<string, { calls: number; tokens: number; name: string }>();
    logs.forEach(l => {
      const existing = map.get(l.function_name) || { calls: 0, tokens: 0, name: l.function_name };
      existing.calls++; existing.tokens += l.total_tokens || 0;
      map.set(l.function_name, existing);
    });
    return Array.from(map.values()).sort((a, b) => b.tokens - a.tokens);
  }, [logs]);

  const timelineData = useMemo(() => {
    const buckets = new Map<string, Record<string, string | number>>();
    const bucketSize = timeFilter === '1h' ? 5 : timeFilter === '6h' ? 30 : timeFilter === '24h' ? 60 : 360;
    logs.forEach(l => {
      const date = new Date(l.created_at);
      const bucketTime = new Date(Math.floor(date.getTime() / (bucketSize * 60000)) * bucketSize * 60000);
      const key = bucketTime.toISOString();
      const bucket = buckets.get(key) || { time: key };
      bucket[l.function_name] = ((bucket[l.function_name] as number) || 0) + 1;
      buckets.set(key, bucket);
    });
    return Array.from(buckets.values())
      .sort((a, b) => String(a.time).localeCompare(String(b.time)))
      .map(b => ({
        ...b,
        time: format(new Date(String(b.time)), timeFilter === '1h' || timeFilter === '6h' ? 'HH:mm' : 'dd/MM HH:mm', { locale: ptBR }),
      }));
  }, [logs, timeFilter]);

  const handleExportCSV = () => {
    if (logs.length === 0) { toast.warning('Nenhum dado para exportar'); return; }
    const escapeCsvField = (value: string | number | null | undefined): string => {
      const str = String(value ?? '-');
      if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) return `"${str.replace(/"/g, '""')}"`;
      return str;
    };
    const headers = ['Data', 'Usuário', 'Função', 'Modelo', 'Tokens Entrada', 'Tokens Saída', 'Total Tokens', 'Duração (ms)', 'Status'];
    const rows = logs.map(l => {
      const profile = l.user_id ? profileMap.get(l.user_id) : null;
      return [
        escapeCsvField(format(new Date(l.created_at), 'dd/MM/yyyy HH:mm:ss')),
        escapeCsvField(profile?.name || profile?.email || l.user_id || '-'),
        escapeCsvField(FUNCTION_LABELS[l.function_name] || l.function_name),
        escapeCsvField(l.model || '-'), l.input_tokens, l.output_tokens, l.total_tokens, l.duration_ms || '-', l.status,
      ].join(',');
    });
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `consumo-ia-${format(new Date(), 'yyyy-MM-dd')}.csv`; a.click();
    URL.revokeObjectURL(url);
    toast.success('CSV exportado com sucesso!');
  };

  return {
    logs, isLoading, refetch, timeFilter, setTimeFilter,
    logsPage, setLogsPage, profileMap, stats,
    userUsage, functionUsage, timelineData, handleExportCSV,
  };
}
