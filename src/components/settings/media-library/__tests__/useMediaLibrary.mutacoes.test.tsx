/**
 * R2-INB-042 / #336-C — a exclusão da biblioteca de mídia não pode anunciar
 * sucesso quando o objeto continua (ou deixa de existir) no bucket.
 *
 * Defeito medido no arquivo `useMediaLibrary.ts`:
 *  - `deleteStorageFile` engolia o `error` do `storage.remove`;
 *  - `handleDelete` conferia só o erro da LINHA e anunciava "Item excluído";
 *  - `handleBulkDelete` removia todos os objetos, depois as linhas, conferia só
 *    o erro da linha e anunciava "N itens excluídos" mesmo com objeto órfão.
 *
 * Contrato novo (decisões fechadas do cartão): objeto PRIMEIRO e com ABORTO — se
 * o `storage.remove` falhar, nada é apagado e o usuário vê erro; a linha só sai
 * depois do objeto, conferindo `error` E linhas afetadas (`.select('id')`, porque
 * o RLS filtra sem erro); `toast.success` só depois de objeto E linha.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';

interface QueryResult {
  data?: unknown;
  error?: unknown;
}

const mocks = vi.hoisted(() => ({
  fetchItems: [] as unknown[],
  rowDeleteResult: { data: null, error: null } as QueryResult,
  storageRemoveImpl: (_path: string): QueryResult => ({ data: null, error: null }),
  storageRemove: vi.fn(),
  rowDelete: vi.fn(),
  rowDeleteEq: vi.fn(),
  rowDeleteIn: vi.fn(),
  rowDeleteSelect: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  toastInfo: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => {
  // Cadeia "thenable": funciona tanto para o delete sem `.select('id')` (código
  // antigo) quanto com ele (contrato novo), então o teste é o mesmo antes e
  // depois da correção — o que muda é o comportamento observado.
  const rowDeleteChain = (): unknown => {
    const q = {
      eq: (...args: unknown[]) => {
        mocks.rowDeleteEq(...args);
        return q;
      },
      in: (...args: unknown[]) => {
        mocks.rowDeleteIn(...args);
        return q;
      },
      select: (...args: unknown[]) => {
        mocks.rowDeleteSelect(...args);
        return q;
      },
      then: (
        onFulfilled: (value: QueryResult) => unknown,
        onRejected?: (reason: unknown) => unknown,
      ) => Promise.resolve(mocks.rowDeleteResult).then(onFulfilled, onRejected),
    };
    return q;
  };

  const fetchChain = (): unknown => {
    const q = {
      order: () => q,
      limit: () => q,
      range: () => q,
      then: (
        onFulfilled: (value: QueryResult) => unknown,
        onRejected?: (reason: unknown) => unknown,
      ) => Promise.resolve({ data: mocks.fetchItems, error: null }).then(onFulfilled, onRejected),
    };
    return q;
  };

  return {
    supabase: {
      from: () => ({
        select: () => fetchChain(),
        delete: () => {
          mocks.rowDelete();
          return rowDeleteChain();
        },
      }),
      storage: {
        from: () => ({
          remove: (paths: string[]) => {
            mocks.storageRemove(paths);
            return Promise.resolve(mocks.storageRemoveImpl(paths[0]));
          },
        }),
      },
    },
  };
});

vi.mock('sonner', () => ({
  toast: {
    success: mocks.toastSuccess,
    error: mocks.toastError,
    info: mocks.toastInfo,
  },
}));

vi.mock('@/lib/logger', () => ({
  getLogger: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}));

import { useMediaLibrary, type MediaItem } from '../useMediaLibrary';

const URL_A = 'https://proj.supabase.co/storage/v1/object/public/stickers/sticker-a.png';
const URL_B = 'https://proj.supabase.co/storage/v1/object/public/stickers/sticker-b.png';

function item(id: string, url: string): MediaItem {
  return {
    id,
    name: `Item ${id}`,
    category: 'memes',
    is_favorite: false,
    use_count: 0,
    created_at: '2026-10-01T00:00:00.000Z',
    uploaded_by: null,
    image_url: url,
  };
}

const ITEM_A = item('a1', URL_A);
const ITEM_B = item('b1', URL_B);

async function mount() {
  const { result } = renderHook(() => useMediaLibrary('stickers'));
  await waitFor(() => expect(result.current.loading).toBe(false));
  return result;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.fetchItems = [ITEM_A, ITEM_B];
  mocks.rowDeleteResult = { data: null, error: null };
  mocks.storageRemoveImpl = () => ({ data: null, error: null });
});

describe('useMediaLibrary — exclusão considera Storage e linha (R2-INB-042 / #336-C)', () => {
  it('aborta a exclusão quando o Storage recusa remover o objeto', async () => {
    mocks.storageRemoveImpl = () => ({ data: null, error: { message: 'Object not found' } });
    const result = await mount();

    await act(async () => {
      await result.current.handleDelete(ITEM_A);
    });

    expect(mocks.storageRemove).toHaveBeenCalledWith(['sticker-a.png']);
    // Aborto: o objeto não saiu, então a linha NÃO pode ser apagada.
    expect(mocks.rowDelete).not.toHaveBeenCalled();
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
    expect(mocks.toastError).toHaveBeenCalledTimes(1);
    // A entrada continua no catálogo (exclusão repetível).
    expect(result.current.items.map((i) => i.id)).toContain('a1');
  });

  it('avisa que a entrada ficou sem arquivo quando o objeto saiu mas a linha não sai (erro)', async () => {
    mocks.rowDeleteResult = { data: null, error: { message: 'permission denied' } };
    const result = await mount();

    await act(async () => {
      await result.current.handleDelete(ITEM_A);
    });

    expect(mocks.storageRemove).toHaveBeenCalledWith(['sticker-a.png']);
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
    // O aviso precisa dizer que o arquivo já foi removido (entrada sem arquivo),
    // não só "erro ao excluir".
    expect(mocks.toastError).toHaveBeenCalledWith(expect.stringMatching(/arquivo/i));
    expect(result.current.items.map((i) => i.id)).toContain('a1');
  });

  it('trata 0 linhas afetadas como falha, mesmo sem `error` (RLS filtra sem erro)', async () => {
    mocks.rowDeleteResult = { data: [], error: null };
    const result = await mount();

    await act(async () => {
      await result.current.handleDelete(ITEM_A);
    });

    expect(mocks.toastSuccess).not.toHaveBeenCalled();
    expect(mocks.toastError).toHaveBeenCalledWith(expect.stringMatching(/arquivo/i));
    expect(result.current.items.map((i) => i.id)).toContain('a1');
  });

  it('conclui a exclusão só quando objeto e linha saem (um único sucesso)', async () => {
    mocks.rowDeleteResult = { data: [{ id: 'a1' }], error: null };
    const result = await mount();

    await act(async () => {
      await result.current.handleDelete(ITEM_A);
    });

    expect(mocks.storageRemove).toHaveBeenCalledWith(['sticker-a.png']);
    // A consulta de exclusão confere as linhas afetadas (`.select('id')`).
    expect(mocks.rowDeleteSelect).toHaveBeenCalledWith('id');
    expect(result.current.items.map((i) => i.id)).not.toContain('a1');
    expect(mocks.toastError).not.toHaveBeenCalled();
    expect(mocks.toastSuccess).toHaveBeenCalledTimes(1);
    expect(mocks.toastSuccess).toHaveBeenCalledWith('Item excluído');
  });

  it('não anuncia "N itens excluídos" no lote quando um objeto falha (relata o real)', async () => {
    // O objeto de B não sai; o de A sai e a linha de A é apagada.
    mocks.storageRemoveImpl = (path) =>
      path === 'sticker-b.png' ? { data: null, error: { message: 'Object not found' } } : { data: null, error: null };
    mocks.rowDeleteResult = { data: [{ id: 'a1' }], error: null };
    const result = await mount();

    act(() => {
      result.current.toggleSelect('a1');
      result.current.toggleSelect('b1');
    });

    await act(async () => {
      await result.current.handleBulkDelete();
    });

    // O resumo não pode dizer que os dois saíram.
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
    expect(mocks.toastSuccess).not.toHaveBeenCalledWith('2 itens excluídos');
    // Só a linha de A é apagada (o objeto de B nem foi confirmado).
    expect(mocks.rowDeleteIn).toHaveBeenCalledWith('id', ['a1']);
    // Sobrou na lista só o que não saiu; o que saiu sumiu.
    expect(result.current.items.map((i) => i.id)).toEqual(['b1']);
    // Contabilidade real: 1 de 2 saiu, 1 falhou.
    expect(mocks.toastInfo).toHaveBeenCalledWith(
      expect.stringMatching(/1 de 2.*falh/i),
    );
  });
});
