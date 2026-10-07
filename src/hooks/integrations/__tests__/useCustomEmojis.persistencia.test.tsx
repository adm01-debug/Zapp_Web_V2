import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type React from 'react';

/**
 * R2-API-053 (#226) — o hook de emojis customizados alterava o estado otimista e
 * descartava o resultado do PostgREST: favorito, categoria e exclusão anunciavam
 * sucesso mesmo com `error` no UPDATE/DELETE, e a exclusão tentava o Storage antes
 * da linha e também ignorava o resultado dele.
 *
 * O teste prova o contrato: sucesso só depois da persistência ACEITA; em falha, o
 * estado otimista volta e o erro é mostrado; a etapa de Storage pendente é retomada.
 */

const mocks = vi.hoisted(() => ({
  tableFrom: vi.fn(),
  updateEq: vi.fn(),
  deleteEq: vi.fn(),
  storageFrom: vi.fn(),
  storageRemove: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  toastWarning: vi.fn(),
  toastInfo: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: mocks.tableFrom,
    storage: { from: mocks.storageFrom },
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } } }) },
    functions: { invoke: vi.fn().mockResolvedValue({ data: null, error: null }) },
  },
}));

vi.mock('sonner', () => ({
  toast: {
    success: mocks.toastSuccess,
    error: mocks.toastError,
    warning: mocks.toastWarning,
    info: mocks.toastInfo,
  },
}));

import { useCustomEmojis, type CustomEmoji } from '../useCustomEmojis';

const BUCKET = 'custom-emojis';
const BASE = 'https://proj.supabase.co/storage/v1/object/public/custom-emojis/';

function emoji(overrides: Partial<CustomEmoji> = {}): CustomEmoji {
  return {
    id: 'emoji-1',
    name: 'Festa',
    image_url: `${BASE}emoji_1.png`,
    category: 'outros',
    is_favorite: false,
    use_count: 0,
    ...overrides,
  };
}

const LISTA: CustomEmoji[] = [
  emoji(),
  emoji({ id: 'emoji-2', name: 'Time', image_url: `${BASE}emoji_2.png`, category: 'produto', is_favorite: true }),
];

const click = { stopPropagation: vi.fn() } as unknown as React.MouseEvent;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.tableFrom.mockImplementation(() => ({
    select: () => ({ order: () => ({ limit: () => Promise.resolve({ data: LISTA, error: null }) }) }),
    update: (payload: Record<string, unknown>) => ({
      eq: (column: string, value: string) => mocks.updateEq(payload, column, value),
    }),
    delete: () => ({ eq: (column: string, value: string) => mocks.deleteEq(column, value) }),
    insert: () => Promise.resolve({ error: null }),
  }));
  mocks.storageFrom.mockImplementation((bucket: string) => ({
    remove: (paths: string[]) => mocks.storageRemove(bucket, paths),
    upload: () => Promise.resolve({ error: null }),
    getPublicUrl: () => ({ data: { publicUrl: `${BASE}novo.png` } }),
  }));
  mocks.updateEq.mockResolvedValue({ error: null });
  mocks.deleteEq.mockResolvedValue({ error: null });
  mocks.storageRemove.mockResolvedValue({ data: null, error: null });
});

async function montar() {
  const view = renderHook(({ open }: { open: boolean }) => useCustomEmojis(open), {
    initialProps: { open: true },
  });
  await waitFor(() => expect(view.result.current.emojis).toHaveLength(2));
  return view;
}

describe('useCustomEmojis — favorito', () => {
  it('falha do UPDATE reverte o favorito e mostra erro, sem toast de sucesso', async () => {
    const { result } = await montar();
    mocks.updateEq.mockResolvedValue({ error: { message: 'permission denied' } });

    await act(async () => {
      await result.current.toggleFavorite(click, result.current.emojis[0]);
    });

    expect(mocks.updateEq).toHaveBeenCalledWith({ is_favorite: true }, 'id', 'emoji-1');
    expect(result.current.emojis.find((em) => em.id === 'emoji-1')?.is_favorite).toBe(false);
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
    expect(mocks.toastError).toHaveBeenCalledTimes(1);
  });

  it('UPDATE aceito mantém o favorito e não mostra erro', async () => {
    const { result } = await montar();

    await act(async () => {
      await result.current.toggleFavorite(click, result.current.emojis[0]);
    });

    expect(result.current.emojis.find((em) => em.id === 'emoji-1')?.is_favorite).toBe(true);
    expect(mocks.toastError).not.toHaveBeenCalled();
  });
});

describe('useCustomEmojis — categoria', () => {
  it('falha do UPDATE reverte a categoria e não anuncia sucesso', async () => {
    const { result } = await montar();
    mocks.updateEq.mockResolvedValue({ error: { message: 'rls denied' } });

    await act(async () => {
      await result.current.handleCategoryChange(result.current.emojis[0], 'produto');
    });

    expect(mocks.updateEq).toHaveBeenCalledWith({ category: 'produto' }, 'id', 'emoji-1');
    expect(result.current.emojis.find((em) => em.id === 'emoji-1')?.category).toBe('outros');
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
    expect(mocks.toastError).toHaveBeenCalledTimes(1);
  });

  it('UPDATE aceito confirma a categoria', async () => {
    const { result } = await montar();

    await act(async () => {
      await result.current.handleCategoryChange(result.current.emojis[0], 'produto');
    });

    expect(result.current.emojis.find((em) => em.id === 'emoji-1')?.category).toBe('produto');
    expect(mocks.toastSuccess).toHaveBeenCalledTimes(1);
    expect(mocks.toastError).not.toHaveBeenCalled();
  });
});

describe('useCustomEmojis — exclusão', () => {
  it('falha do DELETE devolve o emoji à lista e não anuncia sucesso', async () => {
    const { result } = await montar();
    mocks.deleteEq.mockResolvedValue({ error: { message: 'rls denied' } });

    await act(async () => {
      await result.current.handleDelete(click, result.current.emojis[0]);
    });

    expect(mocks.deleteEq).toHaveBeenCalledWith('id', 'emoji-1');
    expect(result.current.emojis.map((em) => em.id)).toEqual(['emoji-1', 'emoji-2']);
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
    expect(mocks.toastError).toHaveBeenCalledTimes(1);
    // A linha é a referência durável: o arquivo só é tocado depois do DELETE aceito.
    expect(mocks.storageRemove).not.toHaveBeenCalled();
  });

  it('DELETE aceito remove o arquivo e só então anuncia sucesso', async () => {
    const { result } = await montar();

    await act(async () => {
      await result.current.handleDelete(click, result.current.emojis[0]);
    });

    expect(mocks.storageRemove).toHaveBeenCalledWith(BUCKET, ['emoji_1.png']);
    expect(result.current.emojis.map((em) => em.id)).toEqual(['emoji-2']);
    expect(mocks.toastSuccess).toHaveBeenCalledTimes(1);
    expect(mocks.toastError).not.toHaveBeenCalled();
  });

  it('linha apagada + arquivo recusado: sem toast de sucesso e a limpeza pendente é retomada ao reabrir', async () => {
    const view = await montar();
    mocks.storageRemove.mockResolvedValueOnce({ data: null, error: { message: 'network error' } });

    await act(async () => {
      await view.result.current.handleDelete(click, view.result.current.emojis[0]);
    });

    expect(view.result.current.emojis.map((em) => em.id)).toEqual(['emoji-2']);
    expect(mocks.toastSuccess).not.toHaveBeenCalled();
    expect(mocks.toastWarning).toHaveBeenCalledTimes(1);

    await act(async () => { view.rerender({ open: false }); });
    await act(async () => { view.rerender({ open: true }); });

    await waitFor(() => expect(mocks.storageRemove).toHaveBeenCalledTimes(2));
    expect(mocks.storageRemove).toHaveBeenLastCalledWith(BUCKET, ['emoji_1.png']);
  });
});
