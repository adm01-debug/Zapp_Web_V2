import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PAGE_SIZE, useMyCalls } from '../useMyCalls';
import { periodoParaIntervalo } from '../useCallsKpi';

const rpc = vi.fn();
vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: (...args: unknown[]) => rpc(...args) },
}));

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

const base = { page: 1, period: '7d', channel: 'all', direction: 'all', result: 'all', q: '', scope: 'mine' };

describe('useMyCalls (T45)', () => {
  beforeEach(() => rpc.mockReset());

  it('pagina no servidor: pagina 2 pede offset diferente da pagina 1', async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    const p1 = renderHook(() => useMyCalls({ ...base, page: 1 }), { wrapper });
    await waitFor(() => expect(rpc).toHaveBeenCalled());
    const args1 = rpc.mock.calls[0][1] as Record<string, number>;

    rpc.mockClear();
    const p2 = renderHook(() => useMyCalls({ ...base, page: 2 }), { wrapper });
    await waitFor(() => expect(rpc).toHaveBeenCalled());
    const args2 = rpc.mock.calls[0][1] as Record<string, number>;

    expect(args1.p_offset).toBe(0);
    expect(args2.p_offset).toBe(PAGE_SIZE);
    expect(args1.p_offset).not.toBe(args2.p_offset);
    p1.unmount();
    p2.unmount();
  });

  it('deriva total e paginas do total_count do servidor', async () => {
    rpc.mockResolvedValue({ data: [{ id: 'a', total_count: 37 }], error: null });
    const { result } = renderHook(() => useMyCalls(base), { wrapper });
    await waitFor(() => expect(result.current.total).toBe(37));
    expect(result.current.pages).toBe(Math.ceil(37 / PAGE_SIZE));
  });

  it('prefixa p_ nos parametros que a RPC espera', async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    renderHook(() => useMyCalls({ ...base, channel: 'whatsapp', result: 'missed', q: 'ana' }), { wrapper });
    await waitFor(() => expect(rpc).toHaveBeenCalled());
    const [nome, args] = rpc.mock.calls[0] as [string, Record<string, unknown>];
    expect(nome).toBe('search_my_calls');
    expect(args.p_channel).toBe('whatsapp');
    expect(args.p_result).toBe('missed');
    expect(args.p_q).toBe('ana');
    expect(args.p_limit).toBe(PAGE_SIZE);
  });

  // R2-MOD-015: a RPC usa `count(*) over ()`, entao uma pagina vazia NAO traz total
  // nenhum (o offset invalido devolve zero linhas). A fixture antiga devolvia linha
  // para qualquer offset e escondia o defeito: o hook anunciava "pagina 1" mas
  // continuava com os dados vazios da pagina 99 (total 0) sem refazer a consulta.
  it('pagina fora do intervalo refaz a consulta na pagina 1 e devolve os dados dela', async () => {
    const pagina1 = [
      { id: 'a', total_count: 3 },
      { id: 'b', total_count: 3 },
      { id: 'c', total_count: 3 },
    ];
    // Fixture fiel a RPC: so a pagina 1 (offset 0) tem linhas; qualquer offset alem
    // do fim devolve zero linhas — e com elas vai embora o `total_count`.
    const offsetsPedidos: number[] = [];
    rpc.mockImplementation((_nome?: unknown, args?: Record<string, number>) => {
      const offset = Number(args?.p_offset);
      offsetsPedidos.push(offset);
      return Promise.resolve({ data: offset === 0 ? pagina1 : [], error: null });
    });
    const { result } = renderHook(() => useMyCalls({ ...base, page: 9 }), { wrapper });

    // Sem a correcao, `rows` fica vazio (a resposta vazia do offset invalido) e
    // `total` fica 0 — o historico parece vazio.
    await waitFor(() => expect(result.current.rows).toHaveLength(3));
    expect(result.current.total).toBe(3);
    expect(result.current.pages).toBe(1);
    expect(result.current.page).toBe(1);
    expect(result.current.paginaForaDoIntervalo).toBe(true);

    // A consulta foi REFEITA: offset invalido primeiro, offset da pagina 1 depois.
    expect(offsetsPedidos).toEqual([(9 - 1) * PAGE_SIZE, 0]);
  });

  it('pagina 1 vazia (fim real do historico) nao dispara segunda consulta', async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    const { result } = renderHook(() => useMyCalls({ ...base, page: 1 }), { wrapper });
    await waitFor(() => expect(result.current.total).toBe(0));
    expect(result.current.rows).toHaveLength(0);
    expect(result.current.pages).toBe(1);
    expect(result.current.page).toBe(1);
    expect(result.current.paginaForaDoIntervalo).toBe(false);
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  // TEL-PERIOD-001: a RPC so interpreta NULL como "sem filtro". Mandar o literal
  // 'all' faz a consulta exigir c.channel='all' / c.direction='all' / c.status='all'
  // e o historico padrao volta vazio.
  it('nao manda o literal "all" para a RPC nos filtros de canal/direcao/resultado', async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    renderHook(() => useMyCalls(base), { wrapper });
    await waitFor(() => expect(rpc).toHaveBeenCalled());
    const args = rpc.mock.calls[0][1] as Record<string, unknown>;
    expect(args.p_channel ?? null).toBeNull();
    expect(args.p_direction ?? null).toBeNull();
    expect(args.p_result ?? null).toBeNull();
  });

  // TEL-PERIOD-001: `period` so mexer no queryKey deixa a consulta na janela errada
  // (ou sem janela). Ela precisa virar p_from/p_to, a mesma conversao do KPI.
  it('converte o periodo em p_from/p_to, a mesma janela usada pelo KPI', async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    renderHook(() => useMyCalls({ ...base, period: 'hoje' }), { wrapper });
    await waitFor(() => expect(rpc).toHaveBeenCalled());
    const hoje = rpc.mock.calls[0][1] as Record<string, unknown>;
    const esperadoHoje = periodoParaIntervalo('hoje');
    expect(hoje.p_from).toBe(esperadoHoje.from);
    expect(hoje.p_to).toBe(esperadoHoje.to);

    rpc.mockClear();
    renderHook(() => useMyCalls({ ...base, period: '30d' }), { wrapper });
    await waitFor(() => expect(rpc).toHaveBeenCalled());
    const trinta = rpc.mock.calls[0][1] as Record<string, unknown>;
    expect(trinta.p_from).toBe(periodoParaIntervalo('30d').from);
    expect(trinta.p_to).toBe(periodoParaIntervalo('30d').to);
    // janelas diferentes => o periodo de fato muda a consulta ao banco
    expect(trinta.p_from).not.toBe(hoje.p_from);
  });
});
