import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type React from 'react';

/**
 * R2-INB-043 — Fechar o picker de figurinhas abandona o upload pendente.
 *
 * `processFile` envia a imagem ao bucket `stickers` ANTES de existir `pendingUpload`
 * (a linha em `stickers` só nasce no Salvar). O `onOpenChange` do picker fazia
 * `setPendingUpload(null)`, não `handleCancelUpload` — único caminho que removia o
 * `storagePath`. Fechar por clique externo deixava o objeto órfão; uma conclusão
 * tardia do envio ainda recriava o preview fora do ciclo aberto.
 */
const mocks = vi.hoisted(() => ({
  storageFrom: vi.fn(),
  upload: vi.fn(),
  remove: vi.fn(),
  getPublicUrl: vi.fn(),
  invoke: vi.fn(),
  tableFrom: vi.fn(),
  getUser: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  toastInfo: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    storage: { from: mocks.storageFrom },
    functions: { invoke: mocks.invoke },
    from: mocks.tableFrom,
    auth: { getUser: mocks.getUser },
  },
}));

vi.mock('sonner', () => ({
  toast: { success: mocks.toastSuccess, error: mocks.toastError, info: mocks.toastInfo },
}));

import { useStickerPicker } from '../useStickerPicker';

function fileEvent(): React.ChangeEvent<HTMLInputElement> {
  const file = new File(['img-bytes'], 'figurinha.webp', { type: 'image/webp' });
  return { target: { files: [file] } } as unknown as React.ChangeEvent<HTMLInputElement>;
}

function tableChain() {
  const selectChain = {
    order: () => selectChain,
    range: () => Promise.resolve({ data: [], error: null }),
  };
  return {
    select: () => selectChain,
    insert: () => Promise.resolve({ error: null }),
    update: () => ({ eq: () => Promise.resolve({ error: null }) }),
    delete: () => ({ eq: () => Promise.resolve({ error: null }) }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.storageFrom.mockImplementation((bucket: string) => ({
    upload: (path: string, file: unknown, opts: unknown) => mocks.upload(bucket, path, file, opts),
    remove: (paths: string[]) => mocks.remove(bucket, paths),
    getPublicUrl: (path: string) => mocks.getPublicUrl(bucket, path),
  }));
  mocks.upload.mockResolvedValue({ data: { path: 'x' }, error: null });
  mocks.remove.mockResolvedValue({ data: null, error: null });
  mocks.getPublicUrl.mockImplementation((bucket: string, path: string) => ({
    data: { publicUrl: `https://proj.supabase.co/storage/v1/object/public/${bucket}/${path}` },
  }));
  mocks.invoke.mockResolvedValue({ data: { category: 'enviadas' }, error: null });
  mocks.tableFrom.mockImplementation(() => tableChain());
  mocks.getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
});

describe('useStickerPicker — fechar/desmontar o picker desfaz o upload não confirmado', () => {
  it('fechar com preview pronto remove o objeto enviado e zera o preview', async () => {
    const { result } = renderHook(() => useStickerPicker(vi.fn()));
    act(() => { result.current.setOpen(true); });
    await act(async () => { result.current.handleFileSelect(fileEvent()); });
    expect(result.current.pendingUpload).not.toBeNull();

    const path = mocks.upload.mock.calls[0][1] as string;
    await act(async () => { result.current.setOpen(false); });

    expect(mocks.remove).toHaveBeenCalledWith('stickers', [path]);
    expect(mocks.remove).toHaveBeenCalledTimes(1);
    expect(result.current.pendingUpload).toBeNull();
  });

  it('upload que conclui DEPOIS de fechar não recria preview e devolve o objeto para limpeza', async () => {
    let resolveUpload!: (v: { data: { path: string }; error: null }) => void;
    mocks.upload.mockReturnValueOnce(new Promise((resolve) => { resolveUpload = resolve; }));

    const { result } = renderHook(() => useStickerPicker(vi.fn()));
    act(() => { result.current.setOpen(true); });
    act(() => { result.current.handleFileSelect(fileEvent()); });
    const path = mocks.upload.mock.calls[0][1] as string;

    await act(async () => { result.current.setOpen(false); });
    expect(result.current.pendingUpload).toBeNull();
    expect(mocks.remove).not.toHaveBeenCalled();

    await act(async () => { resolveUpload({ data: { path: 'x' }, error: null }); });

    expect(result.current.pendingUpload).toBeNull();
    expect(mocks.remove).toHaveBeenCalledTimes(1);
    expect(mocks.remove).toHaveBeenCalledWith('stickers', [path]);
  });

  it('desmontar o picker também remove o objeto não confirmado', async () => {
    const { result, unmount } = renderHook(() => useStickerPicker(vi.fn()));
    act(() => { result.current.setOpen(true); });
    await act(async () => { result.current.handleFileSelect(fileEvent()); });
    const path = mocks.upload.mock.calls[0][1] as string;

    unmount();
    await act(async () => {});

    expect(mocks.remove).toHaveBeenCalledWith('stickers', [path]);
  });

  it('controle positivo: Salvar confirmado conserva o objeto e zera o preview', async () => {
    const { result } = renderHook(() => useStickerPicker(vi.fn()));
    act(() => { result.current.setOpen(true); });
    await act(async () => { result.current.handleFileSelect(fileEvent()); });
    const pending = result.current.pendingUpload;
    expect(pending).not.toBeNull();
    mocks.remove.mockClear();

    await act(async () => {
      await result.current.handleConfirmUpload({ ...pending!, selectedCategory: 'enviadas', name: 'Figurinha' });
    });

    expect(mocks.tableFrom).toHaveBeenCalledWith('stickers');
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(result.current.pendingUpload).toBeNull();
  });

  it('fechar durante o Salvar NÃO descarta o objeto: a confirmação em andamento conserva', async () => {
    let resolveInsert!: (v: { error: null }) => void;
    mocks.tableFrom.mockImplementation(() => ({
      ...tableChain(),
      insert: () => new Promise((resolve) => { resolveInsert = resolve; }),
    }));

    const { result } = renderHook(() => useStickerPicker(vi.fn()));
    act(() => { result.current.setOpen(true); });
    await act(async () => { result.current.handleFileSelect(fileEvent()); });
    const pending = result.current.pendingUpload!;

    let confirmPromise!: Promise<void>;
    await act(async () => {
      confirmPromise = result.current.handleConfirmUpload({ ...pending, selectedCategory: 'enviadas', name: 'Figurinha' });
      await Promise.resolve();
    });

    await act(async () => { result.current.setOpen(false); });
    expect(mocks.remove).not.toHaveBeenCalled();

    await act(async () => { resolveInsert({ error: null }); await confirmPromise; });
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(result.current.pendingUpload).toBeNull();
  });

  it('zerar o preview pelo setter exposto também devolve o objeto para limpeza', async () => {
    const { result } = renderHook(() => useStickerPicker(vi.fn()));
    act(() => { result.current.setOpen(true); });
    await act(async () => { result.current.handleFileSelect(fileEvent()); });
    const path = mocks.upload.mock.calls[0][1] as string;

    await act(async () => { result.current.setPendingUpload(null); });

    expect(mocks.remove).toHaveBeenCalledWith('stickers', [path]);
    expect(result.current.pendingUpload).toBeNull();
  });
});
