/**
 * Cache de prévias de link — `fetchLinkPreviewCacheRuns` / `resumirExecucoes`.
 *
 * O sujeito é o hook REAL; a dublagem é a fronteira de rede (`supabase.from`). Regras provadas:
 * colunas do contrato mapeadas, histórico pedido do mais recente para o mais antigo com teto,
 * erro do PostgREST propagado (não vira lista vazia) e o resumo que a tela mostra.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const h = vi.hoisted(() => ({
  ops: [] as Array<{ table: string; filtros: unknown[][] }>,
  resposta: { data: [] as unknown[] | null, error: null as unknown },
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => {
      const entrada: { table: string; filtros: unknown[][] } = { table, filtros: [] };
      h.ops.push(entrada);
      const builder: Record<string, unknown> = {};
      const mesmo = () => builder;
      builder.select = () => mesmo();
      builder.order = (...a: unknown[]) => {
        entrada.filtros.push(['order', ...a]);
        return mesmo();
      };
      builder.limit = (...a: unknown[]) => {
        entrada.filtros.push(['limit', ...a]);
        return mesmo();
      };
      builder.then = (ok?: (v: unknown) => unknown, falhou?: (e: unknown) => unknown) =>
        Promise.resolve(h.resposta).then(ok, falhou);
      return builder;
    },
  },
}));

import {
  fetchLinkPreviewCacheRuns,
  formatarBytes,
  LIMIAR_TAMANHO_BYTES,
  resumirExecucoes,
  useLinkPreviewCacheMetrics,
  type LinkPreviewCacheRun,
} from '../system/useLinkPreviewCacheMetrics';

const linha = (over: Partial<Record<string, unknown>> = {}) => ({
  id: 'run-1',
  ran_at: '2026-11-26T10:00:00.000Z',
  deleted_count: 7,
  remaining_count: 4,
  table_size_bytes: 2048,
  duration_ms: 12,
  ...over,
});

const execucao = (over: Partial<LinkPreviewCacheRun> = {}): LinkPreviewCacheRun => ({
  id: 'run-1',
  executadaEm: '2026-11-26T10:00:00.000Z',
  removidos: 7,
  restantes: 4,
  tamanhoBytes: 2048,
  duracaoMs: 12,
  ...over,
});

function criarWrapper() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client }, children);
}

beforeEach(() => {
  h.ops.length = 0;
  h.resposta = { data: [], error: null };
});

describe('fetchLinkPreviewCacheRuns', () => {
  it('lê a tabela de métricas da mais recente para a mais antiga, com teto', async () => {
    h.resposta = { data: [linha()], error: null };
    const runs = await fetchLinkPreviewCacheRuns();

    expect(h.ops[0].table).toBe('link_preview_cache_metrics');
    expect(h.ops[0].filtros).toContainEqual(['order', 'ran_at', { ascending: false }]);
    expect(h.ops[0].filtros).toContainEqual(['limit', 50]);
    expect(runs).toEqual([execucao()]);
  });

  it('respeita um teto diferente do padrão', async () => {
    await fetchLinkPreviewCacheRuns(5);
    expect(h.ops[0].filtros).toContainEqual(['limit', 5]);
  });

  it('propaga o erro do PostgREST em vez de devolver lista vazia', async () => {
    h.resposta = { data: null, error: { message: 'permission denied' } };
    await expect(fetchLinkPreviewCacheRuns()).rejects.toMatchObject({ message: 'permission denied' });
  });
});

describe('formatarBytes', () => {
  it('mantém bytes inteiros e usa a unidade certa nos múltiplos', () => {
    expect(formatarBytes(0)).toBe('0 B');
    expect(formatarBytes(512)).toBe('512 B');
    expect(formatarBytes(1536)).toBe('1.5 KB');
    expect(formatarBytes(12 * 1024 * 1024)).toBe('12 MB');
  });
});

describe('resumirExecucoes', () => {
  it('sem histórico não inventa execução nem alarme', () => {
    expect(resumirExecucoes([])).toEqual({
      execucoes: 0,
      ultima: null,
      maiorTamanhoBytes: 0,
      variacaoTamanhoBytes: null,
      mediaDuracaoMs: 0,
      acimaDoLimiar: false,
    });
  });

  it('compara o tamanho com a limpeza anterior e calcula a média', () => {
    const resumo = resumirExecucoes([
      execucao({ id: 'novo', tamanhoBytes: 3072, duracaoMs: 20 }),
      execucao({ id: 'velho', tamanhoBytes: 1024, duracaoMs: 10 }),
    ]);

    expect(resumo.execucoes).toBe(2);
    expect(resumo.ultima?.id).toBe('novo');
    expect(resumo.variacaoTamanhoBytes).toBe(2048);
    expect(resumo.mediaDuracaoMs).toBe(15);
    expect(resumo.maiorTamanhoBytes).toBe(3072);
    expect(resumo.acimaDoLimiar).toBe(false);
  });

  it('sinaliza quando a última medição passa do limiar operacional', () => {
    const resumo = resumirExecucoes([execucao({ tamanhoBytes: LIMIAR_TAMANHO_BYTES + 1 })]);
    expect(resumo.acimaDoLimiar).toBe(true);
    expect(resumo.variacaoTamanhoBytes).toBeNull();
  });
});

describe('useLinkPreviewCacheMetrics', () => {
  it('entrega o histórico e o resumo já calculado', async () => {
    h.resposta = { data: [linha(), linha({ id: 'run-2', table_size_bytes: 4096 })], error: null };

    const { result } = renderHook(() => useLinkPreviewCacheMetrics(true), {
      wrapper: criarWrapper(),
    });

    await waitFor(() => expect(result.current.runs).toHaveLength(2));
    expect(result.current.resumo.execucoes).toBe(2);
    expect(result.current.resumo.maiorTamanhoBytes).toBe(4096);
    expect(result.current.error).toBeNull();
  });
});
