import { renderHook, render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import { createElement } from 'react';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// R2-API-055 / item 485 (P3) — o contador de uso da figurinha pessoal era escrito
// com o builder do PostgREST DESCARTADO:
//   supabase.from('stickers').update({ use_count: ... }).eq('id', ...)   // sem await/then/retorno
// O PostgrestBuilder do supabase-js é THENABLE LAZY: a requisição só é despachada
// quando alguém CONSOME a promessa (await/then/catch/finally). Montar a cadeia e
// jogá-la fora faz a figurinha ser enviada e o `use_count` NUNCA subir.
//
// O "PostgREST" falso deste arquivo é fiel a esse contrato: criar o builder não
// despacha nada; só o consumo conta como requisição. Por isso o teste separa
// `buildersCreated` (o código antigo também criava o builder) de `dispatches`
// (só o consumo REAL despacha) — é `dispatches` que prova o defeito.

type Row = Record<string, unknown>;
type Resultado = { data: unknown; error: unknown };
type Consumidor = (valor: unknown) => unknown;

/** Builder encadeável e THENABLE: `then/catch/finally` só existem para o consumo. */
type Builder = {
  select: (...args: unknown[]) => Builder;
  update: (payload: Row) => Builder;
  eq: (coluna: string, valor: unknown) => Builder;
  order: (...args: unknown[]) => Builder;
  limit: (...args: unknown[]) => Builder;
  insert: (payload: Row) => Promise<{ error: unknown }>;
  maybeSingle: () => Promise<{ data: Row | null; error: unknown }>;
  then: (onFulfilled?: Consumidor, onRejected?: Consumidor) => Promise<unknown>;
  catch: (onRejected?: Consumidor) => Promise<unknown>;
  finally: (onFinally?: () => void) => Promise<unknown>;
};

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  update: vi.fn(),
  logWarn: vi.fn(),
  logError: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

let PROFILE_ROWS: Row[] = [];
let STICKER_ROWS: Row[] = [];
let updateOutcome: Resultado = { data: [{ id: 's-minha' }], error: null };
let updateRejects: unknown = null;
/** Builders de UPDATE montados (o código antigo também montava). */
let buildersCreated = 0;
/** Requisições de UPDATE realmente DESPACHADAS (só o consumo da promessa despacha). */
let dispatches = 0;
/** Leituras da lista de figurinhas despachadas (prova a invalidação/recarga). */
let listDispatches = 0;

function tableRows(table: string): Row[] {
  if (table === 'profiles') return PROFILE_ROWS;
  if (table === 'stickers') return STICKER_ROWS;
  throw new Error(`tabela inesperada no teste: ${table}`);
}

function makeBuilder(table: string): Builder {
  const filters: Array<[string, unknown]> = [];
  let mode: 'select' | 'update' = 'select';
  let payload: Row | null = null;

  const applyFilters = (): Row[] => {
    let rows = tableRows(table).slice();
    for (const [coluna, valor] of filters) rows = rows.filter((r) => r[coluna] === valor);
    return rows;
  };

  // Fiel ao PostgrestBuilder: CRIAR o builder não despacha nada. Só o consumo
  // (then/await/catch/finally) faz a requisição.
  const dispatch = (): Promise<Resultado> => {
    if (mode === 'update') {
      dispatches++;
      mocks.update(table, payload, filters.slice());
      if (updateRejects) return Promise.reject(updateRejects);
      const gravou = updateOutcome.error == null && Array.isArray(updateOutcome.data) && updateOutcome.data.length > 0;
      if (gravou) {
        const id = filters.find(([coluna]) => coluna === 'id')?.[1];
        const alvo = STICKER_ROWS.find((r) => r.id === id);
        // O servidor grava o valor enviado: a lista recarregada enxerga o contador novo.
        if (alvo) alvo.use_count = payload?.use_count;
      }
      return Promise.resolve(updateOutcome);
    }
    if (table === 'stickers') listDispatches++;
    return Promise.resolve({ data: applyFilters(), error: null });
  };

  const builder: Builder = {
    select: vi.fn(() => builder),
    update: vi.fn((p: Row) => {
      mode = 'update';
      payload = p;
      buildersCreated++;
      return builder;
    }),
    eq: vi.fn((coluna: string, valor: unknown) => {
      filters.push([coluna, valor]);
      return builder;
    }),
    order: vi.fn(() => builder),
    limit: vi.fn(() => builder),
    insert: vi.fn(async () => ({ error: null })),
    maybeSingle: vi.fn(async () => ({ data: applyFilters()[0] ?? null, error: null })),
    then: (onFulfilled?: Consumidor, onRejected?: Consumidor) => dispatch().then(onFulfilled, onRejected),
    catch: (onRejected?: Consumidor) => dispatch().catch(onRejected),
    finally: (onFinally?: () => void) => dispatch().finally(onFinally),
  };
  return builder;
}

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (table: string) => makeBuilder(table),
    auth: { getUser: mocks.getUser },
    storage: {
      from: () => ({
        upload: vi.fn(async () => ({ error: null })),
        remove: vi.fn(async () => ({ data: null, error: null })),
        getPublicUrl: (path: string) => ({ data: { publicUrl: `https://exemplo/stickers/${path}` } }),
      }),
    },
  },
}));

vi.mock('@/lib/logger', () => ({
  log: { debug: vi.fn(), info: vi.fn(), warn: mocks.logWarn, error: mocks.logError },
}));

vi.mock('sonner', () => ({
  toast: { success: mocks.toastSuccess, error: mocks.toastError },
}));

import { usePersonalStickers } from '@/hooks/integrations/usePersonalStickers';
import { PersonalStickers } from '@/components/inbox/stickers/PersonalStickers';
import { TooltipProvider } from '@/components/ui/tooltip';

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return ({ children }: { children: ReactNode }) =>
    createElement(
      QueryClientProvider,
      { client: qc },
      // A pasta de figurinhas embrulha cada item num Tooltip (Radix) que exige o provider.
      createElement(TooltipProvider, null, children),
    );
}

function figurinhas(useCount: number | null): Row[] {
  return [
    {
      id: 's-minha',
      name: 'minha foto',
      image_url: 'https://exemplo/stickers/minha.png',
      owner_id: 'p-admin',
      category: 'pessoal',
      is_favorite: false,
      use_count: useCount,
      created_at: '2026-10-01T00:00:00Z',
    },
  ];
}

async function renderComFigurinha(useCount: number | null = 3) {
  STICKER_ROWS = figurinhas(useCount);
  const rendered = renderHook(() => usePersonalStickers(), { wrapper: createWrapper() });
  await waitFor(() => expect(rendered.result.current.stickers.length).toBe(1));
  return rendered;
}

beforeEach(() => {
  vi.clearAllMocks();
  buildersCreated = 0;
  dispatches = 0;
  listDispatches = 0;
  updateOutcome = { data: [{ id: 's-minha' }], error: null };
  updateRejects = null;
  STICKER_ROWS = [];
  PROFILE_ROWS = [{ id: 'p-admin', user_id: 'user-admin', name: 'Ana Admin' }];
  mocks.getUser.mockResolvedValue({ data: { user: { id: 'user-admin' } }, error: null });
});

describe('usePersonalStickers.incrementUseCount — contador de uso (R2-API-055)', () => {
  it('envio CONSOME a operação PostgREST e persiste use_count + 1', async () => {
    const { result } = await renderComFigurinha(3);
    const alvo = result.current.stickers[0];

    await act(async () => {
      await result.current.incrementUseCount(alvo);
    });

    // A cadeia foi montada E consumida: é o consumo que despacha a requisição.
    expect(buildersCreated).toBe(1);
    expect(dispatches).toBe(1);
    expect(mocks.update).toHaveBeenCalledWith('stickers', { use_count: 4 }, [['id', 's-minha']]);

    // A lista recarrega com o contador novo (o próximo envio parte do valor certo).
    await waitFor(() => expect(result.current.stickers[0].use_count).toBe(4));
    expect(listDispatches).toBe(2);
  });

  it('cada envio aceito conta UMA vez (dois envios gravam valores sucessivos)', async () => {
    const { result } = await renderComFigurinha(3);

    await act(async () => {
      await result.current.incrementUseCount(result.current.stickers[0]);
    });
    await waitFor(() => expect(result.current.stickers[0].use_count).toBe(4));

    await act(async () => {
      await result.current.incrementUseCount(result.current.stickers[0]);
    });

    expect(dispatches).toBe(2);
    expect(mocks.update.mock.calls.map((chamada) => chamada[1])).toEqual([{ use_count: 4 }, { use_count: 5 }]);
  });

  it('use_count nulo no banco não vira NaN', async () => {
    const { result } = await renderComFigurinha(null);

    await act(async () => {
      await result.current.incrementUseCount(result.current.stickers[0]);
    });

    expect(mocks.update).toHaveBeenCalledWith('stickers', { use_count: 1 }, [['id', 's-minha']]);
    expect(dispatches).toBe(1);
  });

  it('erro do PostgREST não fabrica contagem nem invalida a lista', async () => {
    const { result } = await renderComFigurinha(3);
    updateOutcome = { data: null, error: { message: 'permission denied', code: '42501' } };
    const leiturasAntes = listDispatches;

    await act(async () => {
      await result.current.incrementUseCount(result.current.stickers[0]);
    });

    expect(mocks.logError).toHaveBeenCalled();
    expect(dispatches).toBe(1);
    expect(listDispatches).toBe(leiturasAntes); // nada mudou no servidor: não recarrega
    expect(result.current.stickers[0].use_count).toBe(3); // nenhum +1 inventado no cliente
  });

  it('UPDATE de 0 linhas (RLS filtrou) não passa como sucesso', async () => {
    const { result } = await renderComFigurinha(3);
    updateOutcome = { data: [], error: null };
    const leiturasAntes = listDispatches;

    await act(async () => {
      await result.current.incrementUseCount(result.current.stickers[0]);
    });

    expect(mocks.logWarn).toHaveBeenCalled();
    expect(mocks.logError).not.toHaveBeenCalled();
    expect(listDispatches).toBe(leiturasAntes);
    expect(result.current.stickers[0].use_count).toBe(3);
  });

  it('falha de rede resolve em vez de soltar promessa rejeitada (chamador é fire-and-forget)', async () => {
    const { result } = await renderComFigurinha(3);
    updateRejects = new Error('network down');
    const leiturasAntes = listDispatches;

    // PersonalStickers chama `incrementUseCount(sticker)` sem await: uma promessa
    // rejeitada aqui viraria unhandled rejection no app.
    await act(async () => {
      await expect(result.current.incrementUseCount(result.current.stickers[0])).resolves.toBeUndefined();
    });

    expect(mocks.logError).toHaveBeenCalled();
    expect(listDispatches).toBe(leiturasAntes);
  });

  it('regressão: a lista de figurinhas continua carregando sem o contador', async () => {
    const { result } = await renderComFigurinha(3);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.stickers[0]).toMatchObject({ id: 's-minha', use_count: 3 });
    expect(dispatches).toBe(0); // nenhuma escrita só por abrir a pasta
  });

  it('a tela de figurinhas pessoais conta o uso no clique de ENVIO (uma vez por envio)', async () => {
    STICKER_ROWS = figurinhas(3);
    const onSend = vi.fn();
    render(createElement(PersonalStickers, { onSend }), { wrapper: createWrapper() });

    const imagem = await screen.findByAltText('minha foto');
    await act(async () => {
      fireEvent.click(imagem);
    });

    expect(onSend).toHaveBeenCalledWith('https://exemplo/stickers/minha.png');
    await waitFor(() => expect(dispatches).toBe(1));
    expect(mocks.update).toHaveBeenCalledWith('stickers', { use_count: 4 }, [['id', 's-minha']]);

    // Segundo envio do mesmo clique conta OUTRA vez (o valor parte do recarregado).
    await act(async () => {
      fireEvent.click(imagem);
    });
    await waitFor(() => expect(dispatches).toBe(2));
    expect(mocks.update.mock.calls.map((chamada) => chamada[1])).toEqual([{ use_count: 4 }, { use_count: 5 }]);
  });
});
