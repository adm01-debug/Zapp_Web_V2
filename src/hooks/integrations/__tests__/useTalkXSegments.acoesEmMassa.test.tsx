/**
 * TL-135 / X114 — seleção em massa da biblioteca de segmentos e execução das
 * ações chamando a RPC guardada `talkx_segment_bulk_action` (t_9c7ad8fc).
 *
 * O que este arquivo prova:
 *  - a seleção (alternar/limpar/selecionar todos) vive no hook, sem prometer
 *    escopo que a tela não passou;
 *  - a ação é executada em lote por UMA chamada (ids únicos) à RPC guardada;
 *  - o resultado é POR SEGMENTO: um item barrado pela guarda de uso (X101) volta
 *    `succeeded: false` com o código P0001 e o nome da campanha, sem derrubar o
 *    restante do lote e sem ser apresentado como aplicado;
 *  - o lote maior que o teto da RPC é dividido e NÃO aborta inteiro;
 *  - sem tag, a ação `tag` falha ANTES de chamar o servidor (nada é aplicado);
 *  - entrada inválida/segmento sem resposta nunca vira sucesso.
 */
import { act, renderHook } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
const fromTable = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: (...args: unknown[]) => rpc(...args) },
}));
vi.mock('@/lib/supabaseHelpers', () => ({ fromTable: (...args: unknown[]) => fromTable(...args) }));
vi.mock('@/hooks/auth/useAuth', () => ({ useAuth: () => ({ profile: { id: 'u1' } }) }));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import {
  useTalkXSegments,
  applySegmentBulkAction,
  BULK_ACTION_MAX_IDS,
  type TalkXSegmentBulkResult,
} from '@/hooks/integrations/useTalkXSegments';

/** Lista da biblioteca (fromTable('talkx_segments').select(...).order(...).order(...)). */
function segmentListBuilder() {
  const builder: Record<string, unknown> = {};
  builder.select = () => builder;
  builder.order = () => builder;
  builder.then = (onFulfilled: (value: unknown) => unknown) =>
    Promise.resolve({ data: [], error: null }).then(onFulfilled);
  return builder;
}

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

const linha = (
  segment_id: string,
  succeeded: boolean,
  extra: Partial<TalkXSegmentBulkResult> = {},
): TalkXSegmentBulkResult => ({
  segment_id,
  action: 'activate',
  succeeded,
  status: succeeded ? 'active' : 'inactive',
  archived_at: null,
  tags: null,
  error_code: null,
  error_message: null,
  ...extra,
});

/** Só as chamadas da RPC em massa — o hook também chama o KPI da biblioteca. */
const bulkCalls = () =>
  rpc.mock.calls.filter((c) => c[0] === 'talkx_segment_bulk_action') as [string, Record<string, unknown>][];

beforeEach(() => {
  rpc.mockReset();
  fromTable.mockReset();
  fromTable.mockReturnValue(segmentListBuilder());
  rpc.mockImplementation(async () => ({ data: null, error: null }));
});

describe('X114 — seleção em massa da biblioteca', () => {
  it('alterna, seleciona todos e limpa', () => {
    const { result } = renderHook(() => useTalkXSegments(), { wrapper: createWrapper() });

    act(() => result.current.toggleSelect('s1'));
    expect(result.current.selectedIds).toEqual(['s1']);
    expect(result.current.isSelected('s1')).toBe(true);

    act(() => result.current.toggleSelect('s1'));
    expect(result.current.selectedIds).toEqual([]);
    expect(result.current.isSelected('s1')).toBe(false);

    act(() => result.current.selectAll(['s1', 's2', 's2', 's3']));
    expect(result.current.selectedIds).toEqual(['s1', 's2', 's3']);

    act(() => result.current.toggleSelect('s2'));
    expect(result.current.selectedIds).toEqual(['s1', 's3']);

    act(() => result.current.clearSelection());
    expect(result.current.selectedIds).toEqual([]);
  });
});

describe('X114 — ação em massa pela RPC guardada (resultado por segmento)', () => {
  it('não esconde o item bloqueado pela guarda nem o apresenta como aplicado', async () => {
    rpc.mockImplementation(async (name: string) => {
      if (name !== 'talkx_segment_bulk_action') return { data: null, error: null };
      return {
        data: [
          linha('s1', true),
          linha('s2', false, {
            error_code: 'P0001',
            error_message: 'Segmento em uso pela campanha "Black Friday" (scheduled)',
          }),
        ],
        error: null,
      };
    });

    const { result } = renderHook(() => useTalkXSegments(), { wrapper: createWrapper() });

    let results: TalkXSegmentBulkResult[] = [];
    await act(async () => {
      results = await result.current.runBulkAction({ action: 'activate', ids: ['s1', 's2'] });
    });

    expect(results).toHaveLength(2);
    expect(results.map((r) => [r.segment_id, r.succeeded])).toEqual([['s1', true], ['s2', false]]);
    const bloqueado = results.find((r) => r.segment_id === 's2')!;
    expect(bloqueado.error_code).toBe('P0001');
    expect(bloqueado.error_message).toContain('Black Friday');
    // Só o item permitido entra como aplicado — o bloqueado nunca.
    expect(results.filter((r) => r.succeeded).map((r) => r.segment_id)).toEqual(['s1']);
  });

  it('usa a seleção atual, manda ids únicos e sem p_tag fora da ação de tag', async () => {
    rpc.mockImplementation(async () => ({ data: [linha('s1', true)], error: null }));

    const { result } = renderHook(() => useTalkXSegments(), { wrapper: createWrapper() });
    act(() => result.current.selectAll(['s1', 's1']));

    await act(async () => {
      await result.current.runBulkAction({ action: 'activate' });
    });

    expect(bulkCalls()).toHaveLength(1);
    const [nome, args] = bulkCalls()[0];
    expect(nome).toBe('talkx_segment_bulk_action');
    expect(args).toMatchObject({ p_action: 'activate', p_segment_ids: ['s1'] });
    expect(args).not.toHaveProperty('p_tag');
  });

  it('ação de tag manda p_tag e recusa tag vazia antes de chamar a RPC', async () => {
    rpc.mockImplementation(async () => ({ data: [linha('s1', true, { tags: ['vip'] })], error: null }));

    const { result } = renderHook(() => useTalkXSegments(), { wrapper: createWrapper() });

    await act(async () => {
      await result.current.runBulkAction({ action: 'tag', ids: ['s1'], tag: 'vip' });
    });
    expect(bulkCalls()[0][1].p_tag).toBe('vip');

    rpc.mockClear();
    await act(async () => {
      await expect(result.current.runBulkAction({ action: 'tag', ids: ['s1'], tag: '  ' })).rejects.toThrow(/tag/i);
    });
    expect(bulkCalls()).toHaveLength(0);
  });

  it('não chama o servidor com a seleção vazia', async () => {
    const { result } = renderHook(() => useTalkXSegments(), { wrapper: createWrapper() });

    await act(async () => {
      await expect(result.current.runBulkAction({ action: 'archive' })).rejects.toThrow(/selecione/i);
    });
    expect(bulkCalls()).toHaveLength(0);
  });

  it('divide o lote acima do teto em vez de abortar tudo, e soma os resultados', async () => {
    rpc.mockImplementation(async (name: string, args: Record<string, unknown>) => {
      if (name !== 'talkx_segment_bulk_action') return { data: null, error: null };
      const ids = args.p_segment_ids as string[];
      return { data: ids.map((id) => linha(id, true)), error: null };
    });

    const ids = Array.from({ length: BULK_ACTION_MAX_IDS + 1 }, (_, i) => `s${i}`);
    const results = await applySegmentBulkAction({ action: 'activate', ids });

    expect(results).toHaveLength(BULK_ACTION_MAX_IDS + 1);
    expect(results.every((r) => r.succeeded)).toBe(true);
    const tamanhos = rpc.mock.calls.map((c) => (c[1] as { p_segment_ids: string[] }).p_segment_ids.length);
    expect(tamanhos).toEqual([BULK_ACTION_MAX_IDS, 1]);
  });

  it('segmento sem linha na resposta do servidor nunca vira sucesso', async () => {
    rpc.mockImplementation(async () => ({ data: [linha('s1', true)], error: null }));

    const results = await applySegmentBulkAction({ action: 'activate', ids: ['s1', 's2'] });

    const semResposta = results.find((r) => r.segment_id === 's2')!;
    expect(semResposta.succeeded).toBe(false);
    expect(semResposta.error_code).toBe('SEM_RESPOSTA');
    expect(results.filter((r) => r.succeeded).map((r) => r.segment_id)).toEqual(['s1']);
  });

  it('falha de transporte de uma chamada vira falha item a item e não descarta as outras chamadas', async () => {
    let chamadas = 0;
    rpc.mockImplementation(async (name: string, args: Record<string, unknown>) => {
      if (name !== 'talkx_segment_bulk_action') return { data: null, error: null };
      chamadas += 1;
      if (chamadas === 1) return { data: null, error: { message: 'network down', code: '53' } };
      const ids = args.p_segment_ids as string[];
      return { data: ids.map((id) => linha(id, true)), error: null };
    });

    const ids = Array.from({ length: BULK_ACTION_MAX_IDS + 1 }, (_, i) => `s${i}`);
    const results = await applySegmentBulkAction({ action: 'activate', ids });

    expect(results).toHaveLength(BULK_ACTION_MAX_IDS + 1);
    expect(results.slice(0, BULK_ACTION_MAX_IDS).every((r) => !r.succeeded)).toBe(true);
    expect(results.slice(0, BULK_ACTION_MAX_IDS)[0].error_message).toBe('network down');
    expect(results[BULK_ACTION_MAX_IDS].succeeded).toBe(true);
  });
});
