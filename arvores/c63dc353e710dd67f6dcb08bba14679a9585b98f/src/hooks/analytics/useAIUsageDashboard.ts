import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format, subHours, subDays } from 'date-fns';
import { ptBR } from 'date-fns/locale';

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

/**
 * Resposta da agregacao autorizada `ai_usage_summary` (IA-056).
 *
 * Este contrato existe porque os totais NAO sao mais calculados no cliente: eles
 * vem do servidor sobre a janela inteira. Antes, o painel buscava as linhas com
 * corte de mil registros e somava o que coubesse nesse corte — com mais de mil
 * registros na janela o total ficava errado, sem avisar. `cobertura` e `filtros`
 * vem junto para que a tela possa DIZER sobre o que o numero foi calculado.
 */
export interface AiUsageSummary {
  fonte: string;
  escopo: string;
  gerado_em: string;
  filtros: {
    inicio: string;
    fim: string;
    janela_segundos: number;
    balde_segundos: number;
    limite_funcoes: number;
    limite_usuarios: number;
  };
  cobertura: {
    chamadas: number;
    primeiro_registro: string | null;
    ultimo_registro: string | null;
    truncado: boolean;
    chamadas_sem_tokens: number;
    amostra_duracao: number;
    funcoes_distintas: number;
    usuarios_distintos: number;
  };
  totais: {
    chamadas: number;
    erros: number;
    usuarios: number;
    tokens: number;
    tokens_entrada: number;
    tokens_saida: number;
  };
  duracao_ms: { media: number | null; p95: number | null; amostra: number };
  situacoes: Record<string, number>;
  por_funcao: { funcao: string; chamadas: number; tokens: number; erros: number; sem_tokens: number }[];
  por_usuario: { usuario: string; chamadas: number; tokens: number }[];
  serie: { inicio: string; chamadas: number; tokens: number; erros: number; por_funcao: Record<string, number> }[];
}

/** Quantas linhas cruas por pagina. A paginacao e do servidor (ver `range`). */
export const LOGS_PER_PAGE = 50;

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

/**
 * Um ponto da série: as chaves são os nomes das funções (o gráfico é uma área
 * empilhada por função), então a série TEM chaves dinâmicas — o tipo declara
 * isso em vez de deixar o consumidor indexar por `any`.
 */
export interface PontoDaSerie extends Record<string, number | string> {
  time: string;
}

function getTimeRange(filter: TimeFilter): Date {
  switch (filter) {
    case '1h': return subHours(new Date(), 1);
    case '6h': return subHours(new Date(), 6);
    case '24h': return subDays(new Date(), 1);
    case '7d': return subDays(new Date(), 7);
    case '30d': return subDays(new Date(), 30);
  }
}

/** Mesmos baldes de antes (5/30/60/360 min), em segundos porque quem agrupa e o servidor. */
function getBucketSeconds(filter: TimeFilter): number {
  return filter === '1h' ? 300 : filter === '6h' ? 1800 : filter === '24h' ? 3600 : 21600;
}

/**
 * Custo do periodo (IA-055): vem da tarifa VIGENTE no instante de cada registro.
 * `custo_medido` nulo com `moedas` cheio significa "ha mais de uma moeda e a
 * resposta se recusa a somar" — nao significa zero. `sem_tarifa` existe para o
 * total ter denominador visivel: ausencia de tarifa nunca entra como zero.
 */
export interface CustosDoPeriodo {
  moeda: string | null;
  moedas: string[] | null;
  custo_medido: number | null;
  custo_interno: number | null;
  custo_reconciliado: number | null;
  chamadas: number;
  chamadas_com_tarifa: number;
  unidades_nao_aplicaveis: string[] | null;
  sem_tarifa: {
    modelo_sem_tarifa: number;
    sem_quantidade_medida: number;
    motivo_unidade_nao_medida: string;
  } | null;
  por_funcao: Array<{ funcao: string; chamadas: number; chamadas_com_tarifa: number; custo_medido: number | null }> | null;
  escopo: string | null;
  declaracao: string | null;
}

export function useAIUsageDashboard() {
  const [logsPage, setLogsPage] = useState(0);
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('24h');

  const since = useMemo(() => getTimeRange(timeFilter).toISOString(), [timeFilter]);
  const bucketSeconds = useMemo(() => getBucketSeconds(timeFilter), [timeFilter]);

  // (1) TOTAIS: agregados no servidor, sobre a JANELA INTEIRA. Nenhuma soma e
  // feita no cliente, entao nada depende de qual pagina esta visivel.
  const { data: resumo, isLoading, refetch: refetchResumo } = useQuery({
    queryKey: ['ai-usage-summary', timeFilter],
    queryFn: async () => {
      // O tipo gerado ainda nao conhece esta RPC (types.ts e regenerado do banco,
      // que esta indisponivel); o cast some quando a regeneracao rodar.
      const { data, error } = await (supabase.rpc as unknown as (
        fn: string,
        args: Record<string, unknown>,
      ) => Promise<{ data: unknown; error: unknown }>)('ai_usage_summary', {
        p_since: since,
        p_until: null,
        p_bucket_seconds: bucketSeconds,
        p_top_functions: 50,
        p_top_users: 20,
      });
      if (error) throw error;
      return data as AiUsageSummary;
    },
    refetchInterval: 30_000,
  });

  // (1b) CUSTO: pela tarifa vigente no instante de cada registro, tambem no
  // servidor — a vigencia e dado do banco, entao trazer tarifa para multiplicar
  // aqui reintroduziria o defeito que a agregacao no servidor matou. Vem em
  // consulta separada para nenhum numero novo entrar escondido em numero antigo.
  const { data: custos, refetch: refetchCustos } = useQuery({
    queryKey: ['ai-usage-cost', timeFilter],
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as unknown as (
        fn: string,
        args: Record<string, unknown>,
      ) => Promise<{ data: unknown; error: unknown }>)('ai_usage_cost_summary', {
        p_since: since,
        p_until: null,
        p_top_functions: 50,
      });
      if (error) throw error;
      return data as CustosDoPeriodo;
    },
    refetchInterval: 30_000,
  });

  // (2) LISTA: paginacao REAL. O `range` corta no servidor e o `count: 'exact'`
  // diz quantas linhas existem de verdade — nao quantas vieram na resposta.
  const { data: pagina, isLoading: isLoadingLogs, refetch: refetchLogs } = useQuery({
    queryKey: ['ai-usage-logs', timeFilter, logsPage],
    queryFn: async () => {
      const de = logsPage * LOGS_PER_PAGE;
      const { data, error, count } = await supabase
        .from('ai_usage_logs')
        .select('*', { count: 'exact' })
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .range(de, de + LOGS_PER_PAGE - 1);
      if (error) throw error;
      return { linhas: (data || []) as UsageLog[], total: count ?? 0 };
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

  // Trocar a janela zera a página: sem isto o usuário ficaria numa página que pode
  // não existir mais no filtro novo. Feito no próprio setter (e não num efeito)
  // para não disparar render em cascata.
  const trocarFiltro = (filtro: TimeFilter) => {
    setLogsPage(0);
    setTimeFilter(filtro);
  };

  const profileMap = useMemo(() => {
    const map = new Map<string, ProfileInfo>();
    profiles.forEach(p => { if (p.user_id) map.set(p.user_id, p); map.set(p.id, p); });
    return map;
  }, [profiles]);

  const logs = pagina?.linhas ?? [];
  const logsTotal = pagina?.total ?? 0;
  const logsTotalPaginas = Math.max(1, Math.ceil(logsTotal / LOGS_PER_PAGE));

  const stats = useMemo(() => ({
    totalCalls: resumo?.totais.chamadas ?? 0,
    totalTokens: resumo?.totais.tokens ?? 0,
    avgDuration: resumo?.duracao_ms.media ?? 0,
    errorCount: resumo?.totais.erros ?? 0,
    uniqueUsers: resumo?.totais.usuarios ?? 0,
  }), [resumo]);

  const userUsage = useMemo(
    () => (resumo?.por_usuario ?? []).map(u => ({ userId: u.usuario, calls: u.chamadas, tokens: u.tokens })),
    [resumo],
  );

  const functionUsage = useMemo(
    () => (resumo?.por_funcao ?? []).map(f => ({ name: f.funcao, calls: f.chamadas, tokens: f.tokens })),
    [resumo],
  );

  const timelineData = useMemo<PontoDaSerie[]>(
    () => (resumo?.serie ?? []).map(b => ({
      ...b.por_funcao,
      time: format(new Date(b.inicio), timeFilter === '1h' || timeFilter === '6h' ? 'HH:mm' : 'dd/MM HH:mm', { locale: ptBR }),
    })),
    [resumo, timeFilter],
  );

  // Custo ja formatado perto do dado (e nao na tela): moeda so aparece quando o
  // servidor declarou uma; sem moeda unica, o numero sai sem simbolo — inventar
  // "R$" onde o servidor se recusou a somar seria mentir na formatacao.
  const custoTexto = useMemo(() => {
    if (!custos) return null;
    const dinheiro = (v: number | null) => v == null ? null
      : custos.moeda
        ? v.toLocaleString('pt-BR', { style: 'currency', currency: custos.moeda })
        : v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 8 });
    const semTarifa = (custos.sem_tarifa?.modelo_sem_tarifa ?? 0) + (custos.sem_tarifa?.sem_quantidade_medida ?? 0);
    return {
      medido: dinheiro(custos.custo_medido),
      interno: dinheiro(custos.custo_interno),
      reconciliado: dinheiro(custos.custo_reconciliado),
      semTarifa,
      variasMoedas: (custos.moedas?.length ?? 0) > 1 ? (custos.moedas ?? []).join(' + ') : null,
    };
  }, [custos]);

  const refetch = () => { void refetchResumo(); void refetchLogs(); void refetchCustos(); };

  return {
    logs, isLoading, isLoadingLogs, refetch, timeFilter, setTimeFilter: trocarFiltro,
    logsPage, setLogsPage, logsTotal, logsTotalPaginas, pageSize: LOGS_PER_PAGE,
    profileMap, stats,
    // Custo do periodo (IA-055), ja formatado: moeda, quebra interno/reconciliado
    // e a contagem do que ficou sem tarifa aplicavel.
    custos: custos ?? null,
    custoTexto,
    // Declaracoes de escopo: sobre o que os numeros foram calculados.
    cobertura: resumo?.cobertura ?? null,
    filtros: resumo?.filtros ?? null,
    situacoes: resumo?.situacoes ?? null,
    duracao: resumo?.duracao_ms ?? null,
    escopo: resumo?.escopo ?? null,
    userUsage, functionUsage, timelineData,
  };
}
