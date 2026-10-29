import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { fetchAllRows } from '@/lib/fetchAllRows';
import { classifySentiment } from '@/lib/sentiment-classes';
import { appDayKey, appDayKeyLabel, appDayStart, appShiftDayKey } from '@/lib/localDay';

/**
 * Tendência de sentimento da janela pedida, em DIAS DE CALENDÁRIO DO APP
 * (America/Sao_Paulo), com o período anterior de mesmo tamanho para comparar.
 *
 * Por que existe (achado P1-D, doc 16): o card/gráfico de tendência mostrava
 * "N de M conversas" a partir de `useRecentSentimentAlerts`, cujo `select` tinha
 * `.limit(400)` — o total exibido era o de uma AMOSTRA, e "vs. período anterior"
 * comparava na verdade as duas METADES do mesmo período. Além disso a média de
 * percentuais diários era sem peso (um dia com 1 conversa valia o mesmo que um
 * dia com 500).
 *
 * Aqui: leitura paginada de TODA a janela (`fetchAllRows` — sem corte), percentuais
 * e score calculados sobre o total real de conversas (média ponderada), duas
 * consultas (janela atual e a imediatamente anterior de mesmo tamanho) e erro
 * diferente de vazio (`isError` × `isEmpty`).
 */

interface AnalysisRow {
  id: string;
  created_at: string;
  sentiment: string | null;
}

export interface SentimentTrendDay {
  /** Dia de calendário no fuso do app (`yyyy-MM-dd`). */
  date: string;
  /** `dd/MM` para exibição. */
  label: string;
  positives: number;
  negatives: number;
  neutrals: number;
  /** Análises com classe desconhecida/ausente — entram no total, em nenhum balde. */
  unknowns: number;
  /** Total REAL de análises do dia (o denominador dos percentuais). */
  total: number;
  /** % do dia sobre o total real do dia (pode somar menos de 100% por causa dos unknowns). */
  positive: number;
  negative: number;
  neutral: number;
  /** `(positivos - negativos) / total` do dia. */
  avgScore: number;
  /** Negativos do dia — viram alerta. */
  alerts_count: number;
}

export interface SentimentTrendWindow {
  total: number;
  positives: number;
  negatives: number;
  neutrals: number;
  unknowns: number;
  positivePct: number;
  negativePct: number;
  neutralPct: number;
  /** Score médio PONDERADO pelo total real de conversas da janela. */
  avgScore: number;
}

export interface SentimentTrendResult {
  series: SentimentTrendDay[];
  current: SentimentTrendWindow;
  /** `null` quando a janela anterior não tem nenhuma conversa (não há base para comparar). */
  previous: SentimentTrendWindow | null;
  /** Variação % do score médio ponderado vs período anterior; `null` sem base. */
  deltaPct: number | null;
  isError: boolean;
  isLoading: boolean;
  /** `true` quando a leitura deu certo e o período atual não tem nenhuma análise. */
  isEmpty: boolean;
  refetch: () => void;
}

const VAZIO: SentimentTrendWindow = {
  total: 0, positives: 0, negatives: 0, neutrals: 0, unknowns: 0,
  positivePct: 0, negativePct: 0, neutralPct: 0, avgScore: 0,
};

function contar(rows: AnalysisRow[]) {
  let positives = 0;
  let negatives = 0;
  let neutrals = 0;
  let unknowns = 0;
  for (const row of rows) {
    const classe = classifySentiment(row.sentiment);
    if (classe === 'positivo') positives += 1;
    else if (classe === 'negativo') negatives += 1;
    else if (classe === 'neutro') neutrals += 1;
    else unknowns += 1;
  }
  return { positives, negatives, neutrals, unknowns, total: rows.length };
}

/** Janela agregada: percentuais e score sobre o TOTAL real, não média de médias. */
function janela(rows: AnalysisRow[]): SentimentTrendWindow {
  const c = contar(rows);
  if (c.total === 0) return VAZIO;
  return {
    ...c,
    positivePct: Math.round((c.positives / c.total) * 100),
    negativePct: Math.round((c.negatives / c.total) * 100),
    neutralPct: Math.round((c.neutrals / c.total) * 100),
    avgScore: (c.positives - c.negatives) / c.total,
  };
}

/** Uma consulta por janela: `gte(from)` + `lt(to)`, paginada por chave única (`id`). */
async function lerJanela(from: Date, to: Date): Promise<AnalysisRow[]> {
  const { rows, incomplete, error } = await fetchAllRows<AnalysisRow>((f, t) =>
    supabase
      .from('conversation_analyses')
      .select('id, created_at, sentiment')
      .gte('created_at', from.toISOString())
      .lt('created_at', to.toISOString())
      .order('id', { ascending: true })
      .range(f, t),
  );
  // Erro e leitura incompleta são ERRO (nunca "0 conversas"): o número exibido
  // tem de ser o total lido ou um aviso, nunca um total truncado silencioso.
  if (error) throw new Error(error.message);
  if (incomplete) throw new Error('Leitura do período de sentimento ficou incompleta');
  return rows;
}

export function useSentimentTrend(days: number): SentimentTrendResult {
  const query = useQuery({
    queryKey: ['sentiment-trend', days],
    queryFn: async () => {
      if (!Number.isFinite(days) || days <= 0) throw new Error('Período de sentimento inválido');
      const now = new Date();
      // Fronteiras de DIA DE CALENDÁRIO no fuso do app: `appDayStart(days-1)` é a
      // meia-noite do primeiro dia da janela e `appDayStart(-1)` a de amanhã
      // (limite exclusivo). O período anterior termina onde este começa.
      const inicioAtual = appDayStart(days - 1, now);
      const fimAtual = appDayStart(-1, now);
      const inicioAnterior = appDayStart(days * 2 - 1, now);

      const [atualRows, anteriorRows] = await Promise.all([
        lerJanela(inicioAtual, fimAtual),
        lerJanela(inicioAnterior, inicioAtual),
      ]);

      const buckets = new Map<string, AnalysisRow[]>();
      for (const row of atualRows) {
        const key = appDayKey(row.created_at);
        const lista = buckets.get(key);
        if (lista) lista.push(row);
        else buckets.set(key, [row]);
      }

      const hoje = appDayKey(now);
      const series: SentimentTrendDay[] = [];
      for (let i = days - 1; i >= 0; i -= 1) {
        const key = appShiftDayKey(hoje, -i);
        const rows = buckets.get(key) ?? [];
        const c = contar(rows);
        series.push({
          date: key,
          label: appDayKeyLabel(key),
          positives: c.positives,
          negatives: c.negatives,
          neutrals: c.neutrals,
          unknowns: c.unknowns,
          total: c.total,
          positive: c.total ? Math.round((c.positives / c.total) * 100) : 0,
          negative: c.total ? Math.round((c.negatives / c.total) * 100) : 0,
          neutral: c.total ? Math.round((c.neutrals / c.total) * 100) : 0,
          avgScore: c.total ? (c.positives - c.negatives) / c.total : 0,
          alerts_count: c.negatives,
        });
      }

      const current = janela(atualRows);
      const anterior = janela(anteriorRows);
      const previous = anterior.total > 0 ? anterior : null;
      const deltaPct = previous && previous.avgScore !== 0
        ? Math.round(((current.avgScore - previous.avgScore) / Math.abs(previous.avgScore)) * 100)
        : null;

      return { series, current, previous, deltaPct };
    },
    staleTime: 5 * 60 * 1000,
  });

  const dados = query.data;
  return {
    series: dados?.series ?? [],
    current: dados?.current ?? VAZIO,
    previous: dados?.previous ?? null,
    deltaPct: dados?.deltaPct ?? null,
    isError: query.isError,
    isLoading: query.isLoading,
    isEmpty: !query.isError && !query.isLoading && (dados?.current.total ?? 0) === 0,
    refetch: () => void query.refetch(),
  };
}
