import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type React from 'react';

/**
 * PK-16/PK-17 — o bucket `audio-memes` tem policy por pasta: o atendente comum só
 * grava onde `(storage.foldername(name))[1] = auth.uid()`. O upload do meme subia a
 * chave SOLTA (`meme_<ts>_<uuid>.mp3`), então o Storage recusava (42501) e o objeto
 * ficava sem dono para o RLS.
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
    // R2-INB-044 — o hook abre canal de realtime com o picker aberto.
    channel: vi.fn(() => ({ on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis() })),
    removeChannel: vi.fn(),
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
  toast: { success: vi.fn(), error: mocks.toastError, info: mocks.toastInfo },
}));

import { useAudioMemes } from '../useAudioMemes';

const UID = 'b0b0b0b0-1111-2222-3333-444444444444';

function fileEvent(): React.ChangeEvent<HTMLInputElement> {
  const file = new File(['audio-bytes'], 'meme-divertido.webm', { type: 'audio/webm' });
  return { target: { files: [file] } } as unknown as React.ChangeEvent<HTMLInputElement>;
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
  mocks.getUser.mockResolvedValue({ data: { user: { id: UID } } });
});

describe('useAudioMemes — meme sempre na pasta do usuário (PK-16)', () => {
  it('sobe o meme em `<auth.uid()>/` e guarda essa chave no preview', async () => {
    const { result } = renderHook(() => useAudioMemes(true));

    await act(async () => {
      await result.current.handleFileSelect(fileEvent());
    });

    expect(mocks.upload).toHaveBeenCalledTimes(1);
    const [bucket, path] = mocks.upload.mock.calls[0] as [string, string];
    expect(bucket).toBe('audio-memes');
    expect(path).toMatch(new RegExp(`^${UID}/meme_\\d+_[0-9a-f-]+\\.mp3$`));

    // A chave guardada no preview é a MESMA do objeto: é ela que o Salvar e o
    // rollback de fechamento usam depois.
    expect(result.current.pendingUpload?.storagePath).toBe(path);
    expect(result.current.pendingUpload?.audioUrl).toContain(`/audio-memes/${path}`);
  });

  it('sem sessão não sobe objeto solto: avisa e não toca no Storage', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    const { result } = renderHook(() => useAudioMemes(true));

    await act(async () => {
      await result.current.handleFileSelect(fileEvent());
    });

    expect(mocks.upload).not.toHaveBeenCalled();
    expect(result.current.pendingUpload).toBeNull();
    expect(mocks.toastError).toHaveBeenCalledWith('Sessão expirada: entre novamente para enviar o áudio');
  });
});
