/**
 * X078 — Listagem de campanhas do Talk X paginada no SERVIDOR, com tempo real
 * completo.
 *
 * O que o cartão exige e este arquivo prova:
 *  - página 3 com 10 por página pede o intervalo 20–29;
 *  - ordenação e filtros (status, segmento, criador, período) vão na consulta;
 *  - "Seleção manual" filtra `segment_id is null`;
 *  - a busca sai escapada (`50%,(x)` não quebra a gramática do `.or()`);
 *  - o evento DELETE invalida a lista (campanha excluída em outra sessão some);
 *  - o total caindo de 21 para 20 na página 3 leva à página 2;
 *  - UPDATE de contadores corrige a linha nas páginas em cache (janela fixa de
 *    500 ms), sem refazer a consulta; UPDATE que muda recorte/ordem invalida a
 *    lista; INSERT invalida;
 *  - polling de 15 s só enquanto o canal não está inscrito;
 *  - a página anterior continua na tela enquanto a próxima carrega.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

const h = vi.hoisted(() => {
  const state = {
    rows: [] as unknown[],
    count: 0,
    error: null as unknown,
    selectArgs: [] as { columns: string; options?: Record<string, unknown> }[],
    orders: [] as { column: string; ascending?: boolean }[],
    eqs: [] as [string, unknown][],
    iss: [] as [string, unknown][],
    gtes: [] as [string, unknown][],
    ltes: [] as [string, unknown][],
    ors: [] as string[],
    ranges: [] as [number, number][],
    detailRow: null as unknown,
    detailError: null as unknown,
    subscribeCb: undefined as undefined | ((status: string) => void),
    updateCb: undefined as undefined | ((payload: unknown) => void),
    insertCb: undefined as undefined | ((payload: unknown) => void),
    deleteCb: undefined as undefined | ((payload: unknown) => void),
    holdRanges: false,
    sliceByRange: false,
    heldResolvers: [] as Array<() => void>,
  };

  const makeBuilder = () => {
    const builder = {
      select: (columns: string, options?: Record<string, unknown>) => {
        state.selectArgs.push({ columns, options });
        return builder;
      },
      eq: (column: string, value: unknown) => {
        state.eqs.push([column, value]);
        return builder;
      },
      is: (column: string, value: unknown) => {
        state.iss.push([column, value]);
        return builder;
      },
      gte: (column: string, value: unknown) => {
        state.gtes.push([column, value]);
        return builder;
      },
      lte: (column: string, value: unknown) => {
        state.ltes.push([column, value]);
        return builder;
      },
      or: (filter: string) => {
        state.ors.push(filter);
        return builder;
      },
      order: (column: string, options?: { ascending?: boolean }) => {
        state.orders.push({ column, ascending: options?.ascending });
        return builder;
      },
      range: (from: number, to: number) => {
        state.ranges.push([from, to]);
        // Com `sliceByRange`, o mock se comporta como o PostgREST: o `.range()`
        // recorta DE FATO a lista e o `count` é o total do recorte (sem isso o
        // teste de volume não provaria o deslocamento das páginas).
        const rows = state.sliceByRange ? state.rows.slice(from, to + 1) : state.rows;
        const count = state.sliceByRange ? state.rows.length : state.count;
        const result = { data: rows, error: state.error, count };
        if (state.holdRanges) {
          return new Promise((resolve) => {
            state.heldResolvers.push(() => resolve(result));
          });
        }
        return Promise.resolve(result);
      },
      maybeSingle: () => Promise.resolve({ data: state.detailRow, error: state.detailError }),
    };
    return builder;
  };

  const channel = { on: vi.fn(), subscribe: vi.fn() };
  const supabase = {
    from: vi.fn(() => makeBuilder()),
    channel: vi.fn(() => channel),
    removeChannel: vi.fn(() => Promise.resolve('ok')),
  };

  const releaseHeld = () => {
    const pending = state.heldResolvers;
    state.heldResolvers = [];
    pending.forEach((resolve) => resolve());
  };

  const reset = () => {
    state.rows = [];
    state.count = 0;
    state.error = null;
    state.selectArgs = [];
    state.orders = [];
    state.eqs = [];
    state.iss = [];
    state.gtes = [];
    state.ltes = [];
    state.ors = [];
    state.ranges = [];
    state.detailRow = null;
    state.detailError = null;
    state.subscribeCb = undefined;
    state.updateCb = undefined;
    state.insertCb = undefined;
    state.deleteCb = undefined;
    state.holdRanges = false;
    state.sliceByRange = false;
    state.heldResolvers = [];
  };

  return { state, channel, supabase, reset, releaseHeld, makeBuilder };
});

vi.mock('@/integrations/supabase/client', () => ({ supabase: h.supabase }));

import {
  buildTalkXCampaignSearchFilter,
  escapeTalkXCampaignSearch,
  TALKX_CAMPAIGN_MANUAL_SEGMENT,
  useTalkXCampaign,
  useTalkXCampaignList,
} from '../useTalkXCampaignList';

const campaign = (id: string, sentCount = 0) => ({
  id,
  name: `Campanha ${id}`,
  description: null,
  message_template: 'oi',
  status: 'sending',
  objective: 'engajamento',
  audience_source: 'contacts',
  segment_id: null,
  template_id: null,
  media_url: null,
  media_type: null,
  total_recipients: 10,
  sent_count: sentCount,
  failed_count: 0,
  delivered_count: 0,
  read_count: 0,
  replied_count: 0,
  outcome_unknown_count: 0,
  whatsapp_connection_id: null,
  created_by: null,
  created_at: '2026-10-01T00:00:00.000Z',
  updated_at: '2026-10-01T00:00:00.000Z',
  started_at: null,
  completed_at: null,
  scheduled_at: null,
});

const page = (prefix: string, size = 10) =>
  Array.from({ length: size }, (_, index) => campaign(`${prefix}-${index}`));

// O arquivo é `.ts` (o cartão nomeia `useTalkXCampaignList.test.ts`): o provider
// vai por `createElement`, sem JSX.
const wrapper = ({ children }: { children: React.ReactNode }) =>
  React.createElement(
    QueryClientProvider,
    { client: new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } }) },
    children,
  );

const flush = () =>
  act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();
  });

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  h.reset();
  h.channel.on.mockReset().mockImplementation(
    (_type: string, filter: unknown, cb: (payload: unknown) => void) => {
      const event = (filter as { event?: string }).event;
      if (event === 'UPDATE') h.state.updateCb = cb;
      if (event === 'INSERT') h.state.insertCb = cb;
      if (event === 'DELETE') h.state.deleteCb = cb;
      return h.channel;
    },
  );
  h.channel.subscribe.mockReset().mockImplementation((cb?: (status: string) => void) => {
    h.state.subscribeCb = cb;
    return h.channel;
  });
  h.supabase.from.mockReset().mockImplementation(() => h.makeBuilder());
  h.supabase.channel.mockReset().mockReturnValue(h.channel);
  h.supabase.removeChannel.mockReset().mockResolvedValue('ok');
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useTalkXCampaignList — paginação no servidor (X078)', () => {
  it('página 3 com 10 por página pede o intervalo 20–29 e traz colunas nomeadas com count exato', async () => {
    h.state.count = 21;
    h.state.rows = page('p3', 1);

    const { result } = renderHook(() => useTalkXCampaignList(), { wrapper });
    await flush();

    expect(h.state.ranges[0]).toEqual([0, 9]);
    expect(h.state.selectArgs[0].options).toEqual({ count: 'exact' });
    expect(h.state.selectArgs[0].columns).not.toBe('*');
    expect(h.state.selectArgs[0].columns).toContain('id');
    expect(h.state.selectArgs[0].columns).toContain('description');
    expect(h.state.selectArgs[0].columns).toContain('scheduled_at');
    expect(h.state.selectArgs[0].columns).toContain('sent_count');

    expect(result.current.totalCount).toBe(21);
    expect(result.current.totalPages).toBe(3);
    expect(result.current.pageSize).toBe(10);
    expect(result.current.pageSizeOptions).toEqual([10, 20, 50]);
    expect(result.current.hasNextPage).toBe(true);

    act(() => result.current.goToPage(3));
    await flush();

    expect(result.current.page).toBe(3);
    expect(h.state.ranges[h.state.ranges.length - 1]).toEqual([20, 29]);
  });

  it('com 1.200 campanhas a 2ª página devolve 10 linhas e o total é 1.200', async () => {
    // O mock serve a fatia REAL do `.range()` (como o PostgREST): o recorte vem
    // do deslocamento que o hook pede, não de uma lista montada à mão.
    h.state.sliceByRange = true;
    h.state.rows = Array.from({ length: 1200 }, (_, index) =>
      campaign(`c-${String(index).padStart(4, '0')}`),
    );

    const { result } = renderHook(() => useTalkXCampaignList(), { wrapper });
    await flush();

    expect(result.current.totalCount).toBe(1200);
    expect(result.current.totalPages).toBe(120);
    expect(result.current.campaigns).toHaveLength(10);
    expect(result.current.campaigns[0].id).toBe('c-0000');

    act(() => result.current.goToPage(2));
    await flush();

    expect(h.state.ranges[h.state.ranges.length - 1]).toEqual([10, 19]);
    expect(result.current.campaigns).toHaveLength(10);
    expect(result.current.campaigns.map((c) => c.id)).toEqual([
      'c-0010', 'c-0011', 'c-0012', 'c-0013', 'c-0014',
      'c-0015', 'c-0016', 'c-0017', 'c-0018', 'c-0019',
    ]);
    expect(result.current.totalCount).toBe(1200);
  });

  it('ordenação e filtros (status, segmento, criador, período) vão na consulta', async () => {
    h.state.count = 1;
    h.state.rows = page('a', 1);

    renderHook(
      () =>
        useTalkXCampaignList({
          search: 'promo',
          status: 'sending',
          segmentId: 'seg-1',
          createdBy: 'user-1',
          from: '2026-09-01T00:00:00.000Z',
          to: '2026-09-30T23:59:59.000Z',
          sortBy: 'name',
          sortAscending: true,
        }),
      { wrapper },
    );
    await flush();

    expect(h.state.eqs).toEqual(
      expect.arrayContaining([
        ['status', 'sending'],
        ['segment_id', 'seg-1'],
        ['created_by', 'user-1'],
      ]),
    );
    expect(h.state.gtes).toEqual([['created_at', '2026-09-01T00:00:00.000Z']]);
    expect(h.state.ltes).toEqual([['created_at', '2026-09-30T23:59:59.000Z']]);
    // A coluna pedida vai ao servidor e o `id` desempata (página estável).
    expect(h.state.orders).toEqual([
      { column: 'name', ascending: true },
      { column: 'id', ascending: true },
    ]);
    expect(h.state.ors).toHaveLength(1);
    expect(h.state.ors[0]).toContain('name.ilike.');
    expect(h.state.ors[0]).toContain('description.ilike.');
    expect(h.state.ors[0]).toContain('message_template.ilike.');
  });

  it('"Seleção manual" filtra segment_id nulo', async () => {
    h.state.count = 1;
    h.state.rows = page('m', 1);

    renderHook(() => useTalkXCampaignList({ segmentId: TALKX_CAMPAIGN_MANUAL_SEGMENT }), { wrapper });
    await flush();

    expect(h.state.iss).toEqual([['segment_id', null]]);
    expect(h.state.eqs.some(([column]) => column === 'segment_id')).toBe(false);
  });

  it('a busca sai escapada e não injeta cláusula nova', () => {
    expect(buildTalkXCampaignSearchFilter('   ')).toBeNull();

    const filter = buildTalkXCampaignSearchFilter('50%,(x)')!;
    // `%` vira `\%` (curinga do LIKE escapado) e o conjunto é citado: o `\` da
    // citagem do PostgREST dobrado deixa um `\` para o LIKE do Postgres.
    expect(filter).toBe(
      'name.ilike."%50\\\\%,(x)%",description.ilike."%50\\\\%,(x)%",message_template.ilike."%50\\\\%,(x)%"',
    );
    expect(escapeTalkXCampaignSearch('50%,(x)')).toBe('50\\%,(x)');

    const injected = buildTalkXCampaignSearchFilter(',is_admin.eq.true')!;
    expect(injected.split('",')).toHaveLength(3);
    expect(injected.match(/ilike\./g)).toHaveLength(3);
  });

  it('evento DELETE invalida a lista: campanha excluída em outra sessão some', async () => {
    h.state.count = 2;
    h.state.rows = [campaign('A'), campaign('B')];

    const { result } = renderHook(() => useTalkXCampaignList(), { wrapper });
    await flush();
    expect(result.current.campaigns.map((c) => c.id)).toEqual(['A', 'B']);
    expect(h.state.ranges).toHaveLength(1);

    h.state.count = 1;
    h.state.rows = [campaign('B')];
    act(() => h.state.deleteCb?.({ old: { id: 'A' } }));
    await flush();

    expect(h.state.ranges.length).toBeGreaterThan(1);
    await waitFor(() => expect(result.current.campaigns.map((c) => c.id)).toEqual(['B']));
    expect(result.current.totalCount).toBe(1);
  });

  it('total caindo de 21 para 20 na página 3 recua para a página 2', async () => {
    h.state.count = 21;
    h.state.rows = page('p3', 1);

    const { result } = renderHook(() => useTalkXCampaignList(), { wrapper });
    await flush();

    act(() => result.current.goToPage(3));
    await flush();
    expect(result.current.page).toBe(3);
    expect(h.state.ranges[h.state.ranges.length - 1]).toEqual([20, 29]);
    expect(result.current.totalPages).toBe(3);

    // A lista encolheu (exclusão): 20 campanhas são 2 páginas.
    h.state.count = 20;
    h.state.rows = page('p2', 10);
    await act(async () => {
      await result.current.refetch();
    });
    await flush();

    expect(result.current.page).toBe(2);
    expect(result.current.totalPages).toBe(2);
    expect(h.state.ranges[h.state.ranges.length - 1]).toEqual([10, 19]);
  });

  it('UPDATE de contadores corrige a linha nas páginas em cache sem refazer a consulta (janela fixa de 500 ms)', async () => {
    h.state.count = 2;
    h.state.rows = [campaign('A', 0), campaign('B', 0)];

    const { result } = renderHook(() => useTalkXCampaignList(), { wrapper });
    await flush();
    expect(h.state.ranges).toHaveLength(1);

    const previousA = campaign('A', 0);
    const previousB = campaign('B', 0);
    act(() => {
      h.state.subscribeCb?.('SUBSCRIBED');
      h.state.updateCb?.({ old: previousA, new: { ...previousA, sent_count: 4 } });
      h.state.updateCb?.({ old: previousB, new: { ...previousB, sent_count: 7 } });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });

    const sentById = Object.fromEntries(result.current.campaigns.map((c) => [c.id, c.sent_count]));
    // Rajada dentro da janela: cada campanha recebe o SEU valor.
    expect(sentById).toEqual({ A: 4, B: 7 });
    // Em cache, não em rede: nenhuma consulta nova disparada pelo UPDATE.
    expect(h.state.ranges).toHaveLength(1);
  });

  it('UPDATE que tira a campanha do filtro de status invalida a lista em vez de manter linha fora do recorte', async () => {
    const sending = campaign('A', 0);
    h.state.count = 1;
    h.state.rows = [sending];

    const { result } = renderHook(() => useTalkXCampaignList({ status: 'sending' }), { wrapper });
    await flush();
    expect(result.current.campaigns.map((c) => c.id)).toEqual(['A']);
    expect(h.state.ranges).toHaveLength(1);

    h.state.count = 0;
    h.state.rows = [];
    act(() => {
      h.state.subscribeCb?.('SUBSCRIBED');
      h.state.updateCb?.({ old: sending, new: { ...sending, status: 'completed' } });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });

    expect(h.state.ranges.length).toBeGreaterThan(1);
    await waitFor(() => expect(result.current.campaigns).toEqual([]));
    expect(result.current.totalCount).toBe(0);
  });

  it('usa janela fixa para UPDATE: eventos a cada 300 ms não adiam o primeiro flush até o fim do fluxo', async () => {
    h.state.count = 2;
    h.state.rows = [campaign('A', 0), campaign('B', 0)];

    const { result } = renderHook(() => useTalkXCampaignList(), { wrapper });
    await flush();
    expect(h.state.ranges).toHaveLength(1);

    act(() => {
      h.state.subscribeCb?.('SUBSCRIBED');
      const previous = campaign('A', 0);
      h.state.updateCb?.({ old: previous, new: { ...previous, sent_count: 1 } });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });
    act(() => {
      const previous = campaign('B', 0);
      h.state.updateCb?.({ old: previous, new: { ...previous, sent_count: 2 } });
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    // Em t=600 ms o fluxo ainda está ativo, mas a janela fixa iniciada em t=0 já
    // fechou em t=500. Com debounce reiniciado a cada evento, isto continuaria 0/0.
    expect(Object.fromEntries(result.current.campaigns.map((c) => [c.id, c.sent_count]))).toEqual({
      A: 1,
      B: 2,
    });

    for (let index = 0; index < 5; index += 1) {
      await act(async () => {
        const id = index % 2 === 0 ? 'A' : 'B';
        const previous = campaign(id, index + 2);
        h.state.updateCb?.({ old: previous, new: { ...previous, sent_count: index + 3 } });
        await vi.advanceTimersByTimeAsync(300);
      });
    }
    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(h.state.ranges).toHaveLength(1);
    expect(Math.max(...result.current.campaigns.map((c) => c.sent_count))).toBeGreaterThanOrEqual(7);
  });

  it('evento INSERT invalida a lista', async () => {
    h.state.count = 1;
    h.state.rows = [campaign('A')];

    const { result } = renderHook(() => useTalkXCampaignList(), { wrapper });
    await flush();
    expect(h.state.ranges).toHaveLength(1);

    h.state.count = 2;
    h.state.rows = [campaign('A'), campaign('C')];
    act(() => h.state.insertCb?.({ new: { id: 'C' } }));
    await flush();

    await waitFor(() => expect(result.current.totalCount).toBe(2));
    expect(result.current.campaigns.map((c) => c.id)).toContain('C');
  });

  it('polling de 15 s só enquanto o canal não está inscrito', async () => {
    h.state.count = 1;
    h.state.rows = [campaign('A')];

    const { result } = renderHook(() => useTalkXCampaignList(), { wrapper });
    await flush();
    expect(h.state.ranges).toHaveLength(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(15_000);
    });
    expect(h.state.ranges.length).toBeGreaterThan(1);

    act(() => h.state.subscribeCb?.('SUBSCRIBED'));
    expect(result.current.isLive).toBe(true);

    const afterSubscribe = h.state.ranges.length;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(h.state.ranges).toHaveLength(afterSubscribe);
  });

  it('mantém a página anterior na tela enquanto a próxima carrega', async () => {
    h.state.count = 21;
    h.state.rows = page('p1', 10);

    const { result } = renderHook(() => useTalkXCampaignList(), { wrapper });
    await flush();
    expect(result.current.campaigns[0].id).toBe('p1-0');

    h.state.holdRanges = true;
    h.state.rows = page('p2', 10);
    act(() => result.current.goToPage(2));
    await flush();

    expect(result.current.isFetching).toBe(true);
    // Ainda a página 1 — e o paginador diz 1: enquanto a página 2 não chega, o
    // rótulo bate com as linhas na tela (a troca não pisca a tabela).
    expect(result.current.page).toBe(1);
    expect(result.current.campaigns[0].id).toBe('p1-0');

    h.state.holdRanges = false;
    await act(async () => {
      h.releaseHeld();
      await Promise.resolve();
    });
    await flush();

    expect(result.current.page).toBe(2);
    expect(result.current.campaigns[0].id).toBe('p2-0');
    expect(result.current.isFetching).toBe(false);
  });
});

describe('useTalkXCampaign — campanha por id para as rotas de View', () => {
  it('busca a campanha pelo id na coluna id', async () => {
    h.state.detailRow = { ...campaign('camp-1'), name: 'Campanha roteada' };

    const { result } = renderHook(() => useTalkXCampaign('camp-1'), { wrapper });
    await waitFor(() => expect(result.current.data?.id).toBe('camp-1'));

    expect(result.current.data?.name).toBe('Campanha roteada');
    expect(h.state.eqs).toEqual([['id', 'camp-1']]);
    expect(h.state.selectArgs[0].columns).not.toBe('*');
  });

  it('sem id a consulta não sai', async () => {
    const { result } = renderHook(() => useTalkXCampaign(null), { wrapper });
    await flush();

    expect(result.current.fetchStatus).toBe('idle');
    expect(h.supabase.from).not.toHaveBeenCalled();
  });
});
