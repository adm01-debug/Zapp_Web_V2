import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type React from 'react';

/**
 * t_9d534f75 — três defeitos do hook de emojis personalizados:
 * 1. `fetchEmojis` ordenava só por `use_count` e cortava em 500: empates em ordem
 *    arbitrária e lista maior que 500 inalcançável.
 * 2. Falha de upload só existia como toast; a tela não tinha estado para mostrar a
 *    mensagem com "Tentar novamente".
 * 3. `handleDelete` removia a linha no primeiro clique, sem confirmação.
 *
 * Prova: ordem determinística (`use_count` desc + `id` asc) e paginação por
 * `.range()`; `uploadError` no estado e `retryUpload` reenviando o mesmo arquivo;
 * exclusão só depois de `confirmDelete`.
 */

const mocks = vi.hoisted(() => ({
  tableFrom: vi.fn(),
  order: vi.fn(),
  range: vi.fn(),
  insert: vi.fn(),
  updateEq: vi.fn(),
  deleteEq: vi.fn(),
  storageFrom: vi.fn(),
  storageUpload: vi.fn(),
  storageRemove: vi.fn(),
  getPublicUrl: vi.fn(),
  invoke: vi.fn(),
  getUser: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  toastWarning: vi.fn(),
  toastInfo: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: mocks.tableFrom,
    storage: { from: mocks.storageFrom },
    auth: { getUser: mocks.getUser },
    functions: { invoke: mocks.invoke },
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

import { useCustomEmojis, CUSTOM_EMOJIS_PAGE_SIZE, type CustomEmoji } from '../useCustomEmojis';

const BUCKET = 'custom-emojis';
const BASE = 'https://proj.supabase.co/storage/v1/object/public/custom-emojis/';

function emoji(id: string, useCount = 0): CustomEmoji {
  return {
    id,
    name: id,
    image_url: `${BASE}${id}.png`,
    category: 'outros',
    is_favorite: false,
    use_count: useCount,
  };
}

function page(from: number, count: number): CustomEmoji[] {
  return Array.from({ length: count }, (_, i) => emoji(`e${from + i}`, 0));
}

const click = { stopPropagation: vi.fn() } as unknown as React.MouseEvent;

function montar() {
  return renderHook(({ open }: { open: boolean }) => useCustomEmojis(open), {
    initialProps: { open: true },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.tableFrom.mockImplementation(() => {
    const builder: Record<string, unknown> = {};
    builder.select = () => builder;
    builder.order = (...args: unknown[]) => { mocks.order(...args); return builder; };
    builder.range = (from: number, to: number) => mocks.range(from, to);
    builder.insert = (payload: unknown) => mocks.insert(payload);
    builder.update = (payload: unknown) => ({
      eq: (column: string, value: string) => mocks.updateEq(payload, column, value),
    });
    builder.delete = () => ({ eq: (column: string, value: string) => mocks.deleteEq(column, value) });
    return builder;
  });
  mocks.storageFrom.mockImplementation(() => ({
    upload: (path: string, file: File) => mocks.storageUpload(path, file),
    remove: (paths: string[]) => mocks.storageRemove(BUCKET, paths),
    getPublicUrl: (path: string) => mocks.getPublicUrl(path),
  }));
  mocks.range.mockResolvedValue({ data: page(0, 2), error: null });
  mocks.updateEq.mockResolvedValue({ error: null });
  mocks.deleteEq.mockResolvedValue({ error: null });
  mocks.storageUpload.mockResolvedValue({ error: null });
  mocks.storageRemove.mockResolvedValue({ data: null, error: null });
  mocks.getPublicUrl.mockReturnValue({ data: { publicUrl: `${BASE}novo.png` } });
  mocks.invoke.mockResolvedValue({ data: null, error: null });
  mocks.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
  mocks.insert.mockResolvedValue({ error: null });
  vi.stubGlobal('crypto', { randomUUID: () => 'uuid-fixo' });
});

describe('useCustomEmojis — ordenação e paginação', () => {
  it('ordena com desempate determinístico e pede a primeira página por range', async () => {
    const view = montar();
    await waitFor(() => expect(view.result.current.emojis).toHaveLength(2));

    expect(mocks.order).toHaveBeenNthCalledWith(1, 'use_count', { ascending: false });
    expect(mocks.order).toHaveBeenNthCalledWith(2, 'id', { ascending: true });
    expect(mocks.range).toHaveBeenCalledWith(0, CUSTOM_EMOJIS_PAGE_SIZE - 1);
    expect(view.result.current.hasMore).toBe(false);
  });

  it('lista com mais de 500 itens fica acessível por loadMore, sem repetir linha', async () => {
    mocks.range.mockResolvedValueOnce({ data: page(0, CUSTOM_EMOJIS_PAGE_SIZE), error: null });
    const view = montar();
    await waitFor(() => expect(view.result.current.emojis).toHaveLength(CUSTOM_EMOJIS_PAGE_SIZE));
    expect(view.result.current.hasMore).toBe(true);

    // A segunda página repete a última linha (id e499) e traz duas novas.
    mocks.range.mockResolvedValueOnce({
      data: [emoji('e499'), emoji('e500'), emoji('e501')],
      error: null,
    });

    await act(async () => {
      await view.result.current.loadMore();
    });

    expect(mocks.range).toHaveBeenLastCalledWith(
      CUSTOM_EMOJIS_PAGE_SIZE,
      CUSTOM_EMOJIS_PAGE_SIZE * 2 - 1,
    );
    // 500 + 2 novas; a repetida não entra duas vezes.
    expect(view.result.current.emojis).toHaveLength(CUSTOM_EMOJIS_PAGE_SIZE + 2);
    expect(view.result.current.emojis.at(-1)?.id).toBe('e501');
    expect(view.result.current.hasMore).toBe(false);
  });
});

describe('useCustomEmojis — erro de upload', () => {
  function selecionar(result: { current: ReturnType<typeof useCustomEmojis> }) {
    const file = new File(['x'], 'festa.png', { type: 'image/png' });
    return act(async () => {
      await result.current.handleFileSelect({
        target: { files: [file] },
      } as unknown as React.ChangeEvent<HTMLInputElement>);
    });
  }

  it('falha do upload vira uploadError no estado (a tela mostra "Tentar novamente")', async () => {
    mocks.storageUpload.mockResolvedValueOnce({ error: { message: 'permission denied' } });
    const view = montar();
    await waitFor(() => expect(view.result.current.emojis).toHaveLength(2));

    await selecionar(view.result);

    expect(view.result.current.uploadError).toMatch(/Tente novamente/);
    expect(view.result.current.pendingUpload).toBeNull();
    expect(mocks.toastError).toHaveBeenCalledTimes(1);
  });

  it('retryUpload reenvia o mesmo arquivo, limpa o erro e abre a prévia', async () => {
    mocks.storageUpload.mockResolvedValueOnce({ error: { message: 'network error' } });
    const view = montar();
    await waitFor(() => expect(view.result.current.emojis).toHaveLength(2));

    await selecionar(view.result);
    expect(view.result.current.uploadError).not.toBeNull();

    await act(async () => {
      await view.result.current.retryUpload();
    });

    expect(mocks.storageUpload).toHaveBeenCalledTimes(2);
    expect(view.result.current.uploadError).toBeNull();
    expect(view.result.current.pendingUpload?.file.name).toBe('festa.png');
  });
});

describe('useCustomEmojis — exclusão com confirmação', () => {
  it('handleDelete só marca o alvo; nada é removido antes de confirmDelete', async () => {
    const view = montar();
    await waitFor(() => expect(view.result.current.emojis).toHaveLength(2));

    act(() => {
      view.result.current.handleDelete(click, view.result.current.emojis[0]);
    });

    expect(view.result.current.pendingDelete?.id).toBe('e0');
    expect(view.result.current.emojis).toHaveLength(2);
    expect(mocks.deleteEq).not.toHaveBeenCalled();
    expect(mocks.storageRemove).not.toHaveBeenCalled();
  });

  it('confirmDelete remove a linha, apaga o arquivo e anuncia sucesso', async () => {
    const view = montar();
    await waitFor(() => expect(view.result.current.emojis).toHaveLength(2));

    act(() => {
      view.result.current.handleDelete(click, view.result.current.emojis[0]);
    });
    await act(async () => {
      await view.result.current.confirmDelete();
    });

    expect(mocks.deleteEq).toHaveBeenCalledWith('id', 'e0');
    expect(mocks.storageRemove).toHaveBeenCalledWith(BUCKET, ['e0.png']);
    expect(view.result.current.emojis.map((em) => em.id)).toEqual(['e1']);
    expect(view.result.current.pendingDelete).toBeNull();
    expect(mocks.toastSuccess).toHaveBeenCalledTimes(1);
  });

  it('cancelDelete descarta o alvo e mantém o emoji', async () => {
    const view = montar();
    await waitFor(() => expect(view.result.current.emojis).toHaveLength(2));

    act(() => {
      view.result.current.handleDelete(click, view.result.current.emojis[0]);
    });
    act(() => {
      view.result.current.cancelDelete();
    });

    expect(view.result.current.pendingDelete).toBeNull();
    expect(view.result.current.emojis).toHaveLength(2);
    expect(mocks.deleteEq).not.toHaveBeenCalled();
  });
});
