import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type React from 'react';

/**
 * PK-17 — importação em lote da biblioteca de mídia. O caminho subia como
 * `bulk_<ts>_<uuid>.<ext>`, sem a pasta do usuário. Isto reprova em `audio-memes`
 * (policy por pasta do PK-16) e também em `stickers`/`emojis`, cuja policy de
 * INSERT para o atendente comum exige `(storage.foldername(name))[1] = auth.uid()`.
 */
const mocks = vi.hoisted(() => ({
  storageFrom: vi.fn(),
  upload: vi.fn(),
  getPublicUrl: vi.fn(),
  invoke: vi.fn(),
  tableFrom: vi.fn(),
  insert: vi.fn(),
  getUser: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
  removeBestEffort: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    storage: { from: mocks.storageFrom },
    functions: { invoke: mocks.invoke },
    from: mocks.tableFrom,
    auth: { getUser: mocks.getUser },
  },
}));

vi.mock('sonner', () => ({ toast: { success: mocks.toastSuccess, error: mocks.toastError } }));

vi.mock('@/utils/audioToMp3', () => ({
  convertAudioToMp3: vi.fn().mockResolvedValue({ ok: false }),
}));

vi.mock('@/lib/storage_object_upload', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/storage_object_upload')>();
  return { ...real, removeStoredObjectBestEffort: mocks.removeBestEffort };
});

vi.mock('../useMediaLibrary', () => ({
  MAX_UPLOAD_SIZE_BYTES: 5 * 1024 * 1024,
  MAX_UPLOAD_SIZE_MB: 5,
  getBucket: (type: string) => (type === 'audio_memes' ? 'audio-memes' : type),
}));

import { useMediaUpload } from '../useMediaUpload';

const UID = 'b0b0b0b0-1111-2222-3333-444444444444';

function fileEvent(name = 'risada.webm', type = 'audio/webm'): React.ChangeEvent<HTMLInputElement> {
  const file = new File(['audio-bytes'], name, { type });
  return { target: { files: [file] } } as unknown as React.ChangeEvent<HTMLInputElement>;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.storageFrom.mockImplementation((bucket: string) => ({
    upload: (path: string, file: unknown, opts: unknown) => mocks.upload(bucket, path, file, opts),
    getPublicUrl: (path: string) => mocks.getPublicUrl(bucket, path),
  }));
  mocks.upload.mockResolvedValue({ data: { path: 'x' }, error: null });
  mocks.getPublicUrl.mockImplementation((bucket: string, path: string) => ({
    data: { publicUrl: `https://proj.supabase.co/storage/v1/object/public/${bucket}/${path}` },
  }));
  mocks.invoke.mockResolvedValue({ data: { category: 'risada' }, error: null });
  mocks.insert.mockResolvedValue({ error: null });
  mocks.tableFrom.mockReturnValue({ insert: mocks.insert });
  mocks.getUser.mockResolvedValue({ data: { user: { id: UID } } });
});

describe('useMediaUpload — lote sempre na pasta do usuário (PK-17)', () => {
  it('sobe cada arquivo em `<auth.uid()>/` e grava a URL com essa chave', async () => {
    const onComplete = vi.fn();
    const { result } = renderHook(() => useMediaUpload('audio_memes', onComplete));

    await act(async () => {
      await result.current.handleBulkUpload(fileEvent());
    });

    expect(mocks.upload).toHaveBeenCalledTimes(1);
    const [bucket, path] = mocks.upload.mock.calls[0] as [string, string];
    expect(bucket).toBe('audio-memes');
    expect(path).toMatch(new RegExp(`^${UID}/bulk_\\d+_[0-9a-f-]+\\.webm$`));

    const [payload] = mocks.insert.mock.calls[0] as [Record<string, unknown>];
    expect(payload.audio_url).toContain(`/audio-memes/${path}`);
    expect(onComplete).toHaveBeenCalled();
  });

  it('sem sessão não sobe nada, avisa e libera o input', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    const onComplete = vi.fn();
    const { result } = renderHook(() => useMediaUpload('audio_memes', onComplete));

    await act(async () => {
      await result.current.handleBulkUpload(fileEvent());
    });

    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.toastError).toHaveBeenCalledWith('Sessão expirada: entre novamente para importar arquivos');
    expect(result.current.bulkUploading).toBe(false);
    expect(onComplete).not.toHaveBeenCalled();
  });
});
