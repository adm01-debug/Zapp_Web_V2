import { useState, useEffect, useMemo } from 'react';
import { log } from '@/lib/logger';
import { supabase } from '@/integrations/supabase/client';
import { subDays, startOfDay, endOfDay, isWithinInterval, format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export interface SentimentAlert {
  id: string;
  contactId: string | null;
  createdAt: string;
  contact_name?: string;
  contact_phone?: string;
  sentiment_score?: number;
  consecutive_low?: number;
  agent_name?: string;
  message?: string;
  email_sent?: boolean;
}

export interface ConversationAnalysis {
  id: string;
  contact_id: string;
  sentiment: string;
  sentiment_score: number;
  created_at: string;
  analyzed_by: string | null;
  contacts?: { name: string; phone: string };
}

export interface AgentProfile {
  id: string;
  name: string;
  avatar_url: string | null;
}

export interface AgentSentimentData {
  agent: AgentProfile;
  totalAnalyses: number;
  avgScore: number;
  positive: number;
  neutral: number;
  negative: number;
  trend: number;
}

export function useSentimentData(period: string) {
  const [alerts, setAlerts] = useState<SentimentAlert[]>([]);
  const [analyses, setAnalyses] = useState<ConversationAnalysis[]>([]);
  const [agents, setAgents] = useState<AgentProfile[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, [period]);

  const fetchData = async () => {
    setLoading(true);
    const daysAgo = parseInt(period);
    const startDate = startOfDay(subDays(new Date(), daysAgo)).toISOString();

    try {
      const { data: alertData, error: alertError } = await supabase
        .from('audit_logs')
        .select('*')
        .eq('action', 'sentiment_alert')
        .gte('created_at', startDate)
        .order('created_at', { ascending: false });

      if (alertError) throw alertError;

      const formattedAlerts = (alertData || []).map(entry => ({
        id: entry.id,
        contactId: entry.entity_id,
        createdAt: entry.created_at,
        ...((entry.details || {}) as Record<string, unknown>),
      })) as SentimentAlert[];

      setAlerts(formattedAlerts);

      const { data: analysisData, error: analysisError } = await supabase
        .from('conversation_analyses')
        .select('id, contact_id, sentiment, sentiment_score, created_at, analyzed_by')
        .gte('created_at', startDate)
        .order('created_at', { ascending: false });

      if (analysisError) throw analysisError;
      setAnalyses((analysisData || []) as ConversationAnalysis[]);

      const { data: agentsData, error: agentsError } = await supabase
        .from('profiles')
        .select('id, name, avatar_url')
        .eq('is_active', true);

      if (agentsError) throw agentsError;
      setAgents((agentsData || []) as AgentProfile[]);
    } catch (error) {
      log.error('Error fetching sentiment data:', error);
    } finally {
      setLoading(false);
    }
  };

  const stats = useMemo(() => {
    const totalAnalyses = analyses.length;
    const negativeAnalyses = analyses.filter(a => a.sentiment === 'negativo').length;
    const positiveAnalyses = analyses.filter(a => a.sentiment === 'positivo').length;
    const neutralAnalyses = analyses.filter(a => a.sentiment === 'neutro').length;
    const avgSentiment = totalAnalyses > 0
      ? Math.round(analyses.reduce((sum, a) => sum + (a.sentiment_score || 50), 0) / totalAnalyses)
      : 50;
    const criticalAlerts = alerts.filter(a => (a.sentiment_score || 50) < 20).length;
    const emailsSent = alerts.filter(a => a.email_sent).length;
    const uniqueContacts = new Set(alerts.map(a => a.contactId)).size;

    return {
      totalAnalyses, negativeAnalyses, positiveAnalyses, neutralAnalyses, avgSentiment,
      totalAlerts: alerts.length, criticalAlerts, emailsSent, uniqueContacts,
      negativeRate: totalAnalyses > 0 ? Math.round((negativeAnalyses / totalAnalyses) * 100) : 0,
    };
  }, [analyses, alerts]);

  const dailyData = useMemo(() => {
    const days = parseInt(period);
    const data: { date: string; positive: number; neutral: number; negative: number; avgScore: number }[] = [];

    for (let i = days - 1; i >= 0; i--) {
      const date = subDays(new Date(), i);
      const dayAnalyses = analyses.filter(a =>
        isWithinInterval(new Date(a.created_at), { start: startOfDay(date), end: endOfDay(date) })
      );

      data.push({
        date: format(date, 'dd/MM', { locale: ptBR }),
        positive: dayAnalyses.filter(a => a.sentiment === 'positivo').length,
        neutral: dayAnalyses.filter(a => a.sentiment === 'neutro').length,
        negative: dayAnalyses.filter(a => a.sentiment === 'negativo').length,
        avgScore: dayAnalyses.length > 0
          ? Math.round(dayAnalyses.reduce((sum, a) => sum + (a.sentiment_score || 50), 0) / dayAnalyses.length)
          : 0,
      });
    }
    return data;
  }, [analyses, period]);

  const agentData = useMemo((): AgentSentimentData[] => {
    const days = parseInt(period);
    const halfPeriod = Math.floor(days / 2);

    return agents.map(agent => {
      const agentAnalyses = analyses.filter(a => a.analyzed_by === agent.id);
      const totalAnalyses = agentAnalyses.length;
      const positive = agentAnalyses.filter(a => a.sentiment === 'positivo').length;
      const neutral = agentAnalyses.filter(a => a.sentiment === 'neutro').length;
      const negative = agentAnalyses.filter(a => a.sentiment === 'negativo').length;
      const avgScore = totalAnalyses > 0
        ? Math.round(agentAnalyses.reduce((sum, a) => sum + (a.sentiment_score || 50), 0) / totalAnalyses)
        : 0;

      const firstHalfStart = subDays(new Date(), days);
      const firstHalfEnd = subDays(new Date(), halfPeriod);
      const secondHalfStart = subDays(new Date(), halfPeriod);

      const firstHalfAnalyses = agentAnalyses.filter(a => { const d = new Date(a.created_at); return d >= firstHalfStart && d < firstHalfEnd; });
      const secondHalfAnalyses = agentAnalyses.filter(a => { const d = new Date(a.created_at); return d >= secondHalfStart; });

      const firstHalfAvg = firstHalfAnalyses.length > 0 ? firstHalfAnalyses.reduce((s, a) => s + (a.sentiment_score || 50), 0) / firstHalfAnalyses.length : 50;
      const secondHalfAvg = secondHalfAnalyses.length > 0 ? secondHalfAnalyses.reduce((s, a) => s + (a.sentiment_score || 50), 0) / secondHalfAnalyses.length : 50;

      return { agent, totalAnalyses, avgScore, positive, neutral, negative, trend: Math.round(secondHalfAvg - firstHalfAvg) };
    }).filter(a => a.totalAnalyses > 0).sort((a, b) => b.avgScore - a.avgScore);
  }, [analyses, agents, period]);

  return { alerts, analyses, agents, loading, stats, dailyData, agentData, fetchData };
}

export function getSentimentColor(score: number) {
  if (score < 30) return 'text-destructive';
  if (score < 70) return 'text-warning';
  return 'text-success';
}

export function getSentimentBg(score: number) {
  if (score < 30) return 'bg-destructive';
  if (score < 70) return 'bg-warning';
  return 'bg-success';
}

export function getSentimentLabel(sentiment: string) {
  switch (sentiment) {
    case 'positivo': return 'Positivo';
    case 'negativo': return 'Negativo';
    case 'neutro': return 'Neutro';
    default: return sentiment;
  }
}
