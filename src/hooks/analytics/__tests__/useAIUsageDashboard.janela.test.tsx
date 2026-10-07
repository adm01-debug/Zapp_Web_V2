/**
 * R2-AUTH-040 (#264) — a janela relativa do painel de uso de IA não pode ficar
 * presa à hora em que o painel foi aberto.
 *
 * Defeito registrado na auditoria de 03/10/2026: o `since` do
 * `useAIUsageDashboard` era memoizado por `timeFilter`, então o polling de 30s e o
 * botão Atualizar (os dois chegam pelo mesmo `refetch`) reenviavam o instante da
 * montagem. Com "Última 1h" escolhido às 12h, a busca das 13h ainda pedia
 * `created_at >= 11h`: duas horas de dados sob o rótulo de uma.
 *
 * A prova usa relógio controlado, como o critério de aceite pede: abre o painel em
 * T0 com o filtro de 1h, avança o relógio em 1h, atualiza e exige que resumo,
 * custos e lista passem a cortar em T0 — nada com mais de uma hora, e os três
 * consumidores no MESMO limite.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

/** Âncora do relógio controlado. */
const T0 = new Date('2026-10-06T12:00:00.000Z');
const HORA_MS = 60 * 60 * 1000;
/** O relógio falso avança junto com o tempo real (`shouldAdvanceTime`): folga. */
const FOLGA_MS = 5_000;

/** Chamadas de RPC (resumo/custos) e o corte inferior enviado à lista. */
const rpcCalls: { fn: string; args: Record<string, unknown> }[] = [];
const cortesDaLista: string[] = [];

/** Resposta mínima do resumo: este cartão é sobre a JANELA enviada, não sobre os números. */
const RESUMO = {
  fonte: 'ai_usage_logs',
  escopo: 'permitido_ao_solicitante',
  gerado_em: '2026-10-06T12:00:00.000Z',
  filtros: {
    inicio: '2026-10-06T11:00:00.000Z', fim: '2026-10-06T12:00:00.000Z',
    janela_segundos: 3600, balde_segundos: 300, limite_funcoes: 50, limite_usuarios: 20,
  },
  cobertura: {
    chamadas: 0, primeiro_registro: null, ultimo_registro: null, truncado: false,
    chamadas_sem_tokens: 0, amostra_duracao: 0, funcoes_distintas: 0, usuarios_distintos: 0,
  },
  totais: { chamadas: 0, erros: 0, usuarios: 0, tokens: 0, tokens_entrada: 0, tokens_saida: 0 },
  duracao_ms: { media: null, p95: null, amostra: 0 },
  situacoes: {},
  por_funcao: [],
  por_usuario: [],
  serie: [],
};

const CUSTOS = {
  moeda: 'BRL', moedas: ['BRL'], custo_medido: 0, custo_interno: 0, custo_reconciliado: 0,
  chamadas: 0, chamadas_com_tarifa: 0, unidades_nao_aplicaveis: null,
  sem_tarifa: { modelo_sem_tarifa: 0, sem_quantidade_medida: 0, motivo_unidade_nao_medida: 'n/a' },
  por_funcao: null, escopo: 'permitido_ao_solicitante', declaracao: null,
};

const PAGINA = { data: [], count: 0, error: null };

vi.mock('@/integrations/supabase/client', () => {
  const construtorLista = () => {
    const b: Record<string, unknown> = {};
    b.select = () => b;
    b.gte = (_coluna: string, valor: string) => {
      cortesDaLista.push(valor);
      return b;
    };
    b.order = () => b;
    b.range = () => Promise.resolve(PAGINA);
    return b;
  };
  return {
    supabase: {
      rpc: (fn: string, args: Record<string, unknown>) => {
        rpcCalls.push({ fn, args });
        return Promise.resolve({ data: fn === 'ai_usage_cost_summary' ? CUSTOS : RESUMO, error: null });
      },
      from: (tabela: string) =>
        (tabela === 'profiles' ? { select: () => Promise.resolve({ data: [] }) } : construtorLista()),
    },
  };
});

import { useAIUsageDashboard } from '@/hooks/analytics/useAIUsageDashboard';

function ultimo<T>(valores: T[]): T {
  if (valores.length === 0) throw new Error('nada foi consultado ainda');
  return valores[valores.length - 1];
}

/** `p_since` de cada chamada de uma RPC, na ordem em que saíram. */
const desdeDe = (fn: string) => rpcCalls.filter(c => c.fn === fn).map(c => c.args.p_since as string);
const ms = (iso: string) => new Date(iso).getTime();

const montar = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return renderHook(() => useAIUsageDashboard(), { wrapper });
};

describe('R2-AUTH-040 — janela relativa renovada a cada atualização', () => {
  beforeEach(() => {
    rpcCalls.length = 0;
    cortesDaLista.length = 0;
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(T0);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('ao avançar o relógio, atualizar corta a janela à frente — não na hora da abertura', async () => {
    const { result } = montar();

    act(() => { result.current.setTimeFilter('1h'); });
    await waitFor(() => expect(desdeDe('ai_usage_summary').length).toBeGreaterThan(0));

    // Ciclo de abertura: "Última 1h" começa uma hora antes de T0.
    const desdeAbertura = ultimo(desdeDe('ai_usage_summary'));
    expect(ms(desdeAbertura)).toBeGreaterThanOrEqual(T0.getTime() - HORA_MS);
    expect(ms(desdeAbertura)).toBeLessThan(T0.getTime() - HORA_MS + FOLGA_MS);
    // Resumo, custos e lista do MESMO ciclo usam o mesmo limite inferior.
    expect(ultimo(desdeDe('ai_usage_cost_summary'))).toBe(desdeAbertura);
    expect(ultimo(cortesDaLista)).toBe(desdeAbertura);

    const resumosAntes = desdeDe('ai_usage_summary').length;
    const custosAntes = desdeDe('ai_usage_cost_summary').length;
    const cortesAntes = cortesDaLista.length;

    // Passou uma hora com o painel aberto: o relógio anda e o painel é atualizado
    // (mesmo caminho do polling de 30s e do botão Atualizar).
    vi.setSystemTime(new Date(T0.getTime() + HORA_MS));
    act(() => { result.current.refetch(); });

    await waitFor(() => {
      expect(desdeDe('ai_usage_summary').length).toBeGreaterThan(resumosAntes);
      expect(desdeDe('ai_usage_cost_summary').length).toBeGreaterThan(custosAntes);
      expect(cortesDaLista.length).toBeGreaterThan(cortesAntes);
    });

    const desdeAtualizado = ultimo(desdeDe('ai_usage_summary'));
    // O limite inferior ACOMPANHA o relógio: nada com mais de uma hora de idade.
    expect(desdeAtualizado).not.toBe(desdeAbertura);
    expect(ms(desdeAtualizado)).toBeGreaterThanOrEqual(T0.getTime());
    expect(ms(desdeAtualizado)).toBeLessThan(T0.getTime() + FOLGA_MS);
    // E os três consumidores continuam alinhados no mesmo corte.
    expect(ultimo(desdeDe('ai_usage_cost_summary'))).toBe(desdeAtualizado);
    expect(ultimo(cortesDaLista)).toBe(desdeAtualizado);
  });

  it('trocar de filtro relativo também recalcula os limites partilhados', async () => {
    const { result } = montar();
    await waitFor(() => expect(desdeDe('ai_usage_summary').length).toBeGreaterThan(0));

    // Padrão do painel: últimas 24h.
    expect(ms(ultimo(desdeDe('ai_usage_summary')))).toBeGreaterThanOrEqual(T0.getTime() - 24 * HORA_MS);
    expect(ms(ultimo(desdeDe('ai_usage_summary')))).toBeLessThan(T0.getTime() - 24 * HORA_MS + FOLGA_MS);

    act(() => { result.current.setTimeFilter('7d'); });
    await waitFor(() => expect(desdeDe('ai_usage_summary').length).toBeGreaterThan(1));

    const desde7d = ultimo(desdeDe('ai_usage_summary'));
    expect(ms(desde7d)).toBeGreaterThanOrEqual(T0.getTime() - 7 * 24 * HORA_MS);
    expect(ms(desde7d)).toBeLessThan(T0.getTime() - 7 * 24 * HORA_MS + FOLGA_MS);
    expect(ultimo(desdeDe('ai_usage_cost_summary'))).toBe(desde7d);
    expect(ultimo(cortesDaLista)).toBe(desde7d);
  });
});
