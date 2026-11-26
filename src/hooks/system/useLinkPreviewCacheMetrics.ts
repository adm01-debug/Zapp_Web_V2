import { useQuery } from '@tanstack/react-query';

import { supabase } from '@/integrations/supabase/client';

/** Uma execucao da limpeza do cache de previas de link, como o cron a gravou. */
export interface LinkPreviewCacheRun {
  id: string;
  /** ran_at */
  executadaEm: string;
  /** deleted_count */
  removidos: number;
  /** remaining_count */
  restantes: number;
  /** table_size_bytes */
  tamanhoBytes: number;
  /** duration_ms */
  duracaoMs: number;
}

export interface LinkPreviewCacheResumo {
  execucoes: number;
  /** Execucao mais recente; null quando a rotina nunca rodou. */
  ultima: LinkPreviewCacheRun | null;
  maiorTamanhoBytes: number;
  /** Variacao do tamanho entre as duas ultimas limpezas; positiva = cresceu. */
  variacaoTamanhoBytes: number | null;
  mediaDuracaoMs: number;
  /** Tamanho da ultima medicao acima do limiar operacional. */
  acimaDoLimiar: boolean;
}

export const TABELA_METRICAS = 'link_preview_cache_metrics';
export const LIMITE_EXECUCOES = 50;
/** Limiar operacional do tamanho da tabela de previas: 50 MB. */
export const LIMIAR_TAMANHO_BYTES = 50 * 1024 * 1024;

const COLUNAS = 'id, ran_at, deleted_count, remaining_count, table_size_bytes, duration_ms';

interface LinhaMetrica {
  id: string;
  ran_at: string;
  deleted_count: number;
  remaining_count: number;
  table_size_bytes: number;
  duration_ms: number;
}

export function mapExecucao(linha: LinhaMetrica): LinkPreviewCacheRun {
  return {
    id: linha.id,
    executadaEm: linha.ran_at,
    removidos: linha.deleted_count,
    restantes: linha.remaining_count,
    tamanhoBytes: linha.table_size_bytes,
    duracaoMs: linha.duration_ms,
  };
}

/**
 * Historico das limpezas, mais recente primeiro. A tabela so tem policy de
 * SELECT para admin/supervisor (is_admin_or_supervisor), entao quem nao for
 * staff recebe lista vazia em vez de erro.
 */
export async function fetchLinkPreviewCacheRuns(
  limite: number = LIMITE_EXECUCOES,
): Promise<LinkPreviewCacheRun[]> {
  const { data, error } = await supabase
    .from(TABELA_METRICAS)
    .select(COLUNAS)
    .order('ran_at', { ascending: false })
    .limit(limite);

  if (error) throw error;
  return ((data ?? []) as LinhaMetrica[]).map(mapExecucao);
}

export function formatarBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const unidades = ['B', 'KB', 'MB', 'GB'];
  let valor = bytes;
  let indice = 0;
  while (valor >= 1024 && indice < unidades.length - 1) {
    valor /= 1024;
    indice += 1;
  }
  const casas = valor >= 10 || indice === 0 ? 0 : 1;
  return `${valor.toFixed(casas).replace(/\.0$/, '')} ${unidades[indice]}`;
}

export function resumirExecucoes(runs: LinkPreviewCacheRun[]): LinkPreviewCacheResumo {
  if (runs.length === 0) {
    return {
      execucoes: 0,
      ultima: null,
      maiorTamanhoBytes: 0,
      variacaoTamanhoBytes: null,
      mediaDuracaoMs: 0,
      acimaDoLimiar: false,
    };
  }

  const ultima = runs[0];
  const anterior = runs[1] ?? null;
  const somaDuracao = runs.reduce((total, run) => total + run.duracaoMs, 0);

  return {
    execucoes: runs.length,
    ultima,
    maiorTamanhoBytes: Math.max(...runs.map((run) => run.tamanhoBytes)),
    variacaoTamanhoBytes: anterior ? ultima.tamanhoBytes - anterior.tamanhoBytes : null,
    mediaDuracaoMs: Math.round(somaDuracao / runs.length),
    acimaDoLimiar: ultima.tamanhoBytes > LIMIAR_TAMANHO_BYTES,
  };
}

export function useLinkPreviewCacheMetrics(enabled: boolean, limite: number = LIMITE_EXECUCOES) {
  const query = useQuery({
    queryKey: ['link-preview-cache-metrics', limite],
    queryFn: () => fetchLinkPreviewCacheRuns(limite),
    enabled,
    staleTime: 60_000,
  });

  return {
    ...query,
    runs: query.data ?? [],
    resumo: resumirExecucoes(query.data ?? []),
  };
}
