import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type React from 'react';

/**
 * R2-INB-043 — Fechar o picker de áudio meme abandona o upload pendente.
 *
 * Fluxo real: o arquivo vai para o bucket `audio-memes` ANTES de existir preview e a
 * linha em `audio_memes` só nasce no Salvar. Fechar o Popover (clique externo/controle)
 * chama `cleanup`, que só zerava `pendingUpload` — o objeto enviado ficava órfão, sem
 * nenhuma linha e sem forma de recuperar a referência. Uma conclusão tardia de upload
 * também não era invalidada pelo fechamento.
 */
const mocks = vi.hoisted(() => ({
  storageFrom: vi.fn(),
  upload: vi.fn(),
  remove: vi.fn(),
  getPublicUrl: vi.fn(),
  rpc: vi.fn(),
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
    rpc: mocks.rpc,
    functions: { invoke: mocks.invoke },
    from: mocks.tableFrom,
    auth: { getUser: mocks.getUser },
  },
}));

vi.mock('@/utils/audioToMp3', () => ({
  convertAudioToMp3: vi.fn().mockResolvedValue({
    ok: true,
    blob: new Blob(['mp3'], { type: 'audio/mpeg' }),
    fileName: 'meme.mp3',
    durationSeconds: 1.25,
  }),
}));

vi.mock('sonner', () => ({
  toast: { success: mocks.toastSuccess, error: mocks.toastError, info: mocks.toastInfo },
}));

import { useAudioMemes } from '../useAudioMemes';

function fileEvent(): React.ChangeEvent<HTMLInputElement> {
  const file = new File(['audio-bytes'], 'meme-divertido.webm', { type: 'audio/webm' });
  return { target: { files: [file] } } as unknown as React.ChangeEvent<HTMLInputElement>;
}

function renderPicker(open: boolean) {
  return renderHook(({ open: o }: { open: boolean }) => useAudioMemes(o), { initialProps: { open } });
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
  mocks.rpc.mockResolvedValue({ data: [], error: null });
  mocks.invoke.mockResolvedValue({ data: { category: 'risada' }, error: null });
  mocks.tableFrom.mockReturnValue({ insert: vi.fn().mockResolvedValue({ error: null }) });
  mocks.getUser.mockResolvedValue({ data: { user: { id: 'u1' } } });
});

describe('useAudioMemes — fechar/desmontar o picker desfaz o upload não confirmado', () => {
  it('fechar com preview pronto remove o objeto enviado e zera o preview', async () => {
    const { result, rerender } = renderPicker(true);

    await act(async () => { await result.current.handleFileSelect(fileEvent()); });
    expect(result.current.pendingUpload).not.toBeNull();

    const path = mocks.upload.mock.calls[0][1] as string;
    rerender({ open: false });
    await act(async () => {});

    expect(mocks.remove).toHaveBeenCalledWith('audio-memes', [path]);
    expect(mocks.remove).toHaveBeenCalledTimes(1);
    expect(result.current.pendingUpload).toBeNull();
  });

  it('upload que conclui DEPOIS de fechar não recria preview e devolve o objeto para limpeza', async () => {
    let resolveUpload!: (v: { data: { path: string }; error: null }) => void;
    mocks.upload.mockReturnValueOnce(new Promise((resolve) => { resolveUpload = resolve; }));

    const { result, rerender } = renderPicker(true);

    await act(async () => { void result.current.handleFileSelect(fileEvent()); });
    const path = mocks.upload.mock.calls[0][1] as string;

    rerender({ open: false });
    await act(async () => {});
    // Fechou enquanto o envio estava em voo: ainda não há nada para remover.
    expect(result.current.pendingUpload).toBeNull();
    expect(mocks.remove).not.toHaveBeenCalled();

    await act(async () => { resolveUpload({ data: { path: 'x' }, error: null }); });

    // A conclusão tardia não reabre o preview fora do ciclo ativo e limpa o objeto.
    expect(result.current.pendingUpload).toBeNull();
    expect(mocks.remove).toHaveBeenCalledTimes(1);
    expect(mocks.remove).toHaveBeenCalledWith('audio-memes', [path]);
  });

  it('desmontar o picker também remove o objeto não confirmado', async () => {
    const { result, unmount } = renderPicker(true);

    await act(async () => { await result.current.handleFileSelect(fileEvent()); });
    const path = mocks.upload.mock.calls[0][1] as string;

    unmount();
    await act(async () => {});

    expect(mocks.remove).toHaveBeenCalledWith('audio-memes', [path]);
  });

  it('controle positivo: Salvar confirmado conserva o objeto e zera o preview', async () => {
    const { result } = renderPicker(true);

    await act(async () => { await result.current.handleFileSelect(fileEvent()); });
    const pending = result.current.pendingUpload;
    expect(pending).not.toBeNull();
    mocks.remove.mockClear();

    await act(async () => {
      await result.current.handleConfirmUpload({ ...pending!, selectedCategory: 'risada', name: 'Meme' });
    });

    expect(mocks.tableFrom).toHaveBeenCalledWith('audio_memes');
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(result.current.pendingUpload).toBeNull();
  });

  it('fechar durante o Salvar NÃO descarta o objeto: a confirmação em andamento conserva', async () => {
    let resolveInsert!: (v: { error: null }) => void;
    mocks.tableFrom.mockReturnValue({ insert: () => new Promise((resolve) => { resolveInsert = resolve; }) });

    const { result, rerender } = renderPicker(true);
    await act(async () => { await result.current.handleFileSelect(fileEvent()); });
    const pending = result.current.pendingUpload!;

    let confirmPromise!: Promise<void>;
    await act(async () => {
      confirmPromise = result.current.handleConfirmUpload({ ...pending, selectedCategory: 'risada', name: 'Meme' });
      await Promise.resolve();
    });

    rerender({ open: false });
    await act(async () => {});
    expect(mocks.remove).not.toHaveBeenCalled();

    await act(async () => { resolveInsert({ error: null }); await confirmPromise; });
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(result.current.pendingUpload).toBeNull();
  });
});
