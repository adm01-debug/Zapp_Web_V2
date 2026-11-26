/**
 * Painel do cache de prévias de link — estados da tela e o que ela mostra do histórico.
 *
 * O sujeito é o componente REAL; a dublagem é o hook de dados (as funções puras do módulo ficam
 * reais via importOriginal). Regras provadas: carregando, erro, histórico vazio, resumo com
 * variação/média, alarme de limiar e o botão que refaz a consulta.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';

const h = vi.hoisted(() => ({
  estado: {} as Record<string, unknown>,
}));

vi.mock('@/hooks/system/useLinkPreviewCacheMetrics', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/hooks/system/useLinkPreviewCacheMetrics')>();
  return { ...real, useLinkPreviewCacheMetrics: () => h.estado };
});

import { LinkPreviewCachePanel } from '../LinkPreviewCachePanel';
import {
  LIMIAR_TAMANHO_BYTES,
  resumirExecucoes,
  type LinkPreviewCacheRun,
} from '@/hooks/system/useLinkPreviewCacheMetrics';

const execucao = (over: Partial<LinkPreviewCacheRun> = {}): LinkPreviewCacheRun => ({
  id: 'run-1',
  executadaEm: '2026-11-26T10:00:00.000Z',
  removidos: 7,
  restantes: 4,
  tamanhoBytes: 2 * 1024 * 1024,
  duracaoMs: 12,
  ...over,
});

const refetch = vi.fn();

function estado(over: Record<string, unknown> = {}) {
  const runs = (over.runs as LinkPreviewCacheRun[]) ?? [];
  return {
    runs,
    resumo: resumirExecucoes(runs),
    isLoading: false,
    isFetching: false,
    error: null,
    refetch,
    ...over,
  };
}

beforeEach(() => {
  refetch.mockClear();
  h.estado = estado();
});

describe('LinkPreviewCachePanel', () => {
  it('mostra carregando enquanto o histórico não chegou', () => {
    h.estado = estado({ isLoading: true });
    render(<LinkPreviewCachePanel />);
    expect(screen.getByTestId('cache-previas-carregando')).toBeTruthy();
  });

  it('mostra o erro devolvido pelo PostgREST', () => {
    h.estado = estado({ error: new Error('permission denied'), runs: [] });
    render(<LinkPreviewCachePanel />);
    expect(within(screen.getByTestId('cache-previas-erro')).getByText('permission denied')).toBeTruthy();
  });

  it('explica quando a rotina nunca rodou', () => {
    render(<LinkPreviewCachePanel />);
    expect(screen.getByTestId('cache-previas-vazio')).toBeTruthy();
    expect(screen.queryByTestId('cache-previas-resumo')).toBeNull();
  });

  it('resume a última limpeza e lista o histórico', () => {
    h.estado = estado({
      runs: [
        execucao({ id: 'novo', removidos: 9, restantes: 3, tamanhoBytes: 3 * 1024 * 1024, duracaoMs: 20 }),
        execucao({ id: 'velho', tamanhoBytes: 1024 * 1024, duracaoMs: 10 }),
      ],
    });
    render(<LinkPreviewCachePanel />);

    expect(screen.getByTestId('cache-previas-tamanho').textContent).toBe('3 MB');
    expect(screen.getByTestId('cache-previas-variacao').textContent).toContain('+2 MB');
    expect(screen.getByTestId('cache-previas-removidos').textContent).toBe('9');
    expect(screen.getByTestId('cache-previas-restantes').textContent).toContain('3 linha(s)');
    expect(screen.getByTestId('cache-previas-duracao').textContent).toContain('15 ms');

    const linhaNova = within(screen.getByTestId('cache-previas-execucao-novo'));
    expect(linhaNova.getByText('9 removido(s)')).toBeTruthy();
    expect(linhaNova.getByText('3 no cache')).toBeTruthy();
    expect(screen.getByTestId('cache-previas-execucao-velho')).toBeTruthy();
    expect(screen.queryByTestId('cache-previas-alerta')).toBeNull();
  });

  it('alarma quando a tabela passa do limiar operacional', () => {
    h.estado = estado({ runs: [execucao({ tamanhoBytes: LIMIAR_TAMANHO_BYTES + 1024 })] });
    render(<LinkPreviewCachePanel />);

    const alerta = within(screen.getByTestId('cache-previas-alerta'));
    expect(alerta.getByText('Cache acima do limiar')).toBeTruthy();
    expect(alerta.getByText(/50 MB/)).toBeTruthy();
  });

  it('refaz a consulta no botão de atualizar', () => {
    h.estado = estado({ runs: [execucao()] });
    render(<LinkPreviewCachePanel />);

    fireEvent.click(screen.getByTestId('cache-previas-atualizar'));
    expect(refetch).toHaveBeenCalledTimes(1);
  });
});
