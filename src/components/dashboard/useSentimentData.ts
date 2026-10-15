import { useState, useEffect, useMemo, useCallback } from 'react';
import { log } from '@/lib/logger';
import { supabase } from '@/integrations/supabase/client';
import { format, isWithinInterval } from 'date-fns';
import { appDayEndOfKey, appDayKey, appDayKeyLabel, appDayStart, appDayStartOfKey, appShiftDayKey } from '@/lib/localDay';
import { ptBR } from 'date-fns/locale';
import { normalizeScore, aggregateScores } from '@/lib/ai-values';
import { classifySentiment } from '@/lib/sentiment-classes';
import { fetchAllRows } from '@/lib/fetchAllRows';

/**
 * Score de sentimento (0-100) ou `null` quando ausente/inválido (IA-023).
 * Nunca devolve default: ausência fica ausente e 0 continua 0.
 */
function sentimentScoreValue(raw: unknown): number | null {
  return normalizeScore(raw, { min: 0, max: 100, scale: 'percent' }).value;
}

/** Teto de linhas por resposta do PostgREST — a leitura pagina em blocos deste tamanho. */
export const SENTIMENT_PAGE_SIZE = 1000;

/**
 * Dias do período a partir do valor do filtro; `null` quando não é inteiro > 0.
 * Antes `Number.parseInt(period)` devolvia `NaN` e `appDayStart(NaN)` uma data
 * inválida: a consulta voltava VAZIA e sem erro, então um filtro quebrado
 * aparecia como "não há dados no período" em vez de falha.
 */
export function parsePeriodDays(period: string): number | null {
  const days = Number.parseInt(period, 10);
  return Number.isFinite(days) && days > 0 ? days : null;
}

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

/** Linha crua devolvida por `dashboard_sentiment_alerts` antes do mapeamento. */
interface RawSentimentAlert {
  id: string;
  entity_id: string | null;
  created_at: string;
  details: Record<string, unknown> | null;
}

export interface ConversationAnalysis {
  id: string;
  contact_id: string;
  sentiment: string;
  /** Pode faltar no banco; ausência nunca vira 50 (IA-023). */
  sentiment_score: number | null;
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
  /** Média que exclui amostras ausentes; `null` quando não há nenhuma válida. */
  avgScore: number | null;
  positive: number;
  neutral: number;
  negative: number;
  /** Variação entre metades; `null` quando falta amostra válida de um dos lados. */
  trend: number | null;
}

export function useSentimentData(period: string) {
  const [alerts, setAlerts] = useState<SentimentAlert[]>([]);
  const [analyses, setAnalyses] = useState<ConversationAnalysis[]>([]);
  const [agents, setAgents] = useState<AgentProfile[]>([]);
  const [loading, setLoading] = useState(true);
  /** Falha de leitura VISÍVEL: a tela mostra erro com botão de tentar de novo. */
  const [error, setError] = useState<Error | null>(null);
  /** Leitura que não cobriu o período inteiro (erro no meio ou teto de páginas). */
  const [incomplete, setIncomplete] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    const daysAgo = parsePeriodDays(period);
    if (daysAgo === null) {
      // Período quebrado vira falha VISÍVEL: com `NaN` a data era inválida e a
      // consulta voltava vazia, o que a tela mostrava como "sem dados".
      setIncomplete(false);
      setError(new Error(`Período inválido: "${period}" não é um número de dias maior que zero.`));
      setLoading(false);
      return;
    }

    const startDate = appDayStart(daysAgo).toISOString();
    const falhas: string[] = [];
    let truncado = false;

    try {
      // E39: RPC dedicada (SECURITY DEFINER, guard is_admin_or_supervisor
      // interno) em vez de ler audit_logs direto — a policy de SELECT da
      // tabela é só-admin (has_role 'admin'), então um supervisor (staff,
      // não-admin) via .from('audit_logs') direto recebia silenciosamente 0
      // linhas aqui mesmo tendo acesso normal a esta aba. A RPC devolve o
      // mesmo shape (id/entity_id/created_at/details), escopada só a
      // action='sentiment_alert'. Cast local via 'any' até o types.ts
      // (gerado, não sincronizado no self-hosted) conhecer essa RPC.
      //
      // A leitura é PAGINADA: uma resposta do PostgREST traz no máximo
      // `SENTIMENT_PAGE_SIZE` linhas, e o alerta fora da primeira página
      // desaparecia em silêncio. A ordem é total (created_at + id) para o
      // `.range()` não repetir nem perder alerta empatado no mesmo instante.
      const alertasRes = await fetchAllRows<RawSentimentAlert>((from, to) =>
        (supabase as any) // eslint-disable-line @typescript-eslint/no-explicit-any -- RPC nova (E39), types.ts ainda não sincronizado
          .rpc('dashboard_sentiment_alerts', { p_since: startDate })
          .order('created_at', { ascending: false })
          .order('id', { ascending: false })
          .range(from, to),
      );
      setAlerts(alertasRes.rows.map(entry => ({
        id: entry.id,
        contactId: entry.entity_id,
        createdAt: entry.created_at,
        ...((entry.details || {}) as Record<string, unknown>),
      }) as SentimentAlert));
      if (alertasRes.error) falhas.push(`alertas: ${alertasRes.error.message}`);
      truncado = truncado || alertasRes.incomplete;

      // Mesma paginação para as análises: sem ela, "taxa de negativos" e as
      // médias saíam de uma amostra (a primeira página) e mentiam.
      const analysesRes = await fetchAllRows<ConversationAnalysis>(async (from, to) => {
        const res = await supabase
          .from('conversation_analyses')
          .select('id, contact_id, sentiment, sentiment_score, created_at, analyzed_by')
          .gte('created_at', startDate)
          .order('created_at', { ascending: false })
          .order('id', { ascending: false })
          .range(from, to);
        return { data: res.data as ConversationAnalysis[] | null, error: res.error };
      }, { pageSize: SENTIMENT_PAGE_SIZE });
      setAnalyses(analysesRes.rows);
      if (analysesRes.error) falhas.push(`análises: ${analysesRes.error.message}`);
      truncado = truncado || analysesRes.incomplete;

      const { data: agentsData, error: agentsError } = await supabase
        .from('profiles')
        .select('id, name, avatar_url')
        .eq('is_active', true);

      if (agentsError) falhas.push(`agentes: ${agentsError.message}`);
      else setAgents((agentsData || []) as AgentProfile[]);

      setIncomplete(truncado);
      // Falha em qualquer das três leituras vira erro do hook: o que deu para
      // ler fica na tela, mas o consumidor sabe que o número está incompleto.
      if (falhas.length > 0) throw new Error(`Falha ao carregar os dados de sentimento (${falhas.join('; ')})`);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      log.error('Error fetching sentiment data:', err);
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount/period-change padrão do dashboard, sem estado derivado de props para sincronizar.
    void fetchData();
  }, [fetchData]);

  const stats = useMemo(() => {
    const totalAnalyses = analyses.length;
    // IA-SENTIMENT-001: a contagem usa a classe canônica (pt-BR + legado EN
    // traduzido na leitura). Antes comparava com o literal pt-BR e TODA
    // análise gravada em inglês (positive/negative/neutral/critical) zerava.
    const negativo = (a: ConversationAnalysis) => classifySentiment(a.sentiment) === 'negativo';
    const positivo = (a: ConversationAnalysis) => classifySentiment(a.sentiment) === 'positivo';
    const neutro = (a: ConversationAnalysis) => classifySentiment(a.sentiment) === 'neutro';
    const negativeAnalyses = analyses.filter(negativo).length;
    const positiveAnalyses = analyses.filter(positivo).length;
    const neutralAnalyses = analyses.filter(neutro).length;
    // Média que EXCLUI ausente/inválido (IA-023): sem amostra válida é `null`,
    // nunca 50; nota 0 continua 0.
    const avgSentiment = aggregateScores(analyses.map(a => a.sentiment_score)).average;
    // Crítico só com score presente e < 20 — ausência não conta como crítico.
    const criticalAlerts = alerts.filter(a => {
      const score = sentimentScoreValue(a.sentiment_score);
      return score !== null && score < 20;
    }).length;
    const emailsSent = alerts.filter(a => a.email_sent).length;
    const uniqueContacts = new Set(alerts.map(a => a.contactId)).size;

    return {
      totalAnalyses, negativeAnalyses, positiveAnalyses, neutralAnalyses, avgSentiment,
      totalAlerts: alerts.length, criticalAlerts, emailsSent, uniqueContacts,
      negativeRate: totalAnalyses > 0 ? Math.round((negativeAnalyses / totalAnalyses) * 100) : 0,
    };
  }, [analyses, alerts]);

  const dailyData = useMemo(() => {
    const days = parsePeriodDays(period) ?? 0;
    const data: { date: string; positive: number; neutral: number; negative: number; avgScore: number | null }[] = [];

    for (let i = days - 1; i >= 0; i--) {
      const key = appShiftDayKey(appDayKey(new Date()), -i);
      const dayAnalyses = analyses.filter(a =>
        isWithinInterval(new Date(a.created_at), { start: appDayStartOfKey(key), end: appDayEndOfKey(key) })
      );

      data.push({
        date: appDayKeyLabel(key),
        positive: dayAnalyses.filter(a => classifySentiment(a.sentiment) === 'positivo').length,
        neutral: dayAnalyses.filter(a => classifySentiment(a.sentiment) === 'neutro').length,
        negative: dayAnalyses.filter(a => classifySentiment(a.sentiment) === 'negativo').length,
        // Dia sem amostra válida é `null` (não 0 nem 50) — não entra no histograma.
        avgScore: aggregateScores(dayAnalyses.map(a => a.sentiment_score)).average,
      });
    }
    return data;
  }, [analyses, period]);

  const agentData = useMemo((): AgentSentimentData[] => {
    const days = parsePeriodDays(period) ?? 0;
    const halfPeriod = Math.floor(days / 2);

    return agents.map(agent => {
      const agentAnalyses = analyses.filter(a => a.analyzed_by === agent.id);
      const totalAnalyses = agentAnalyses.length;
      const positive = agentAnalyses.filter(a => classifySentiment(a.sentiment) === 'positivo').length;
      const neutral = agentAnalyses.filter(a => classifySentiment(a.sentiment) === 'neutro').length;
      const negative = agentAnalyses.filter(a => classifySentiment(a.sentiment) === 'negativo').length;
      // Média do agente que exclui ausente/inválido; `null` sem amostra válida.
      const avgScore = aggregateScores(agentAnalyses.map(a => a.sentiment_score)).average;

      const firstHalfStart = appDayStart(days);
      const firstHalfEnd = appDayStart(halfPeriod);
      const secondHalfStart = appDayStart(halfPeriod);

      const firstHalfAnalyses = agentAnalyses.filter(a => { const d = new Date(a.created_at); return d >= firstHalfStart && d < firstHalfEnd; });
      const secondHalfAnalyses = agentAnalyses.filter(a => { const d = new Date(a.created_at); return d >= secondHalfStart; });

      const firstHalfAgg = aggregateScores(firstHalfAnalyses.map(a => a.sentiment_score));
      const secondHalfAgg = aggregateScores(secondHalfAnalyses.map(a => a.sentiment_score));
      // Sem amostra válida de um dos lados não há variação a afirmar (IA-023):
      // `null` em vez de inventar 50 de cada lado.
      const trend = firstHalfAgg.average !== null && secondHalfAgg.average !== null
        ? Math.round(secondHalfAgg.average - firstHalfAgg.average)
        : null;

      return { agent, totalAnalyses, avgScore, positive, neutral, negative, trend };
    }).filter(a => a.totalAnalyses > 0).sort((a, b) => (b.avgScore ?? -1) - (a.avgScore ?? -1));
  }, [analyses, agents, period]);

  return { alerts, analyses, agents, loading, error, isError: error !== null, incomplete, stats, dailyData, agentData, fetchData };
}

export function getSentimentColor(score: number | null) {
  if (score === null || score === undefined) return 'text-muted-foreground';
  if (score < 30) return 'text-destructive';
  if (score < 70) return 'text-warning';
  return 'text-success';
}

export function getSentimentBg(score: number | null) {
  if (score === null || score === undefined) return 'bg-muted';
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
