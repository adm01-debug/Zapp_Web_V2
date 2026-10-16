import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';

/**
 * PK-17 — "Gerar Áudio com IA" salvava o MP3 como `ai_gen_<ts>_<uuid>.mp3`, sem a
 * pasta do usuário. O bucket `audio-memes` só aceita o caminho quando
 * `(storage.foldername(name))[1] = auth.uid()` (PK-16), então o Salvar reprovava com
 * 42501 para o atendente comum.
 */
const mocks = vi.hoisted(() => ({
  invoke: vi.fn(),
  storageFrom: vi.fn(),
  upload: vi.fn(),
  getPublicUrl: vi.fn(),
  remove: vi.fn(),
  tableFrom: vi.fn(),
  insert: vi.fn(),
  getUser: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    functions: { invoke: mocks.invoke },
    storage: { from: mocks.storageFrom },
    from: mocks.tableFrom,
    auth: { getUser: mocks.getUser },
  },
}));

vi.mock('sonner', () => ({
  toast: { success: mocks.toastSuccess, error: mocks.toastError, info: vi.fn() },
}));

import { AIGenerateDialog } from '../AIGenerateDialog';

const UID = 'b0b0b0b0-1111-2222-3333-444444444444';

class FakeAudio {
  src: string;
  play = vi.fn(() => Promise.resolve());
  pause = vi.fn();
  constructor(src: string) {
    this.src = src;
  }
}

function Harness() {
  const [open, setOpen] = useState(true);
  return <AIGenerateDialog open={open} onOpenChange={setOpen} onSaved={() => {}} />;
}

async function gerarPreviaESalvar() {
  render(<Harness />);
  fireEvent.change(screen.getByPlaceholderText(/Risada de vilão/), {
    target: { value: 'Trovão distante com chuva' },
  });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /Gerar Preview/i }));
  });
  await waitFor(() => {
    expect(screen.getByRole('button', { name: /Salvar na Biblioteca/i })).toBeInTheDocument();
  });
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /Salvar na Biblioteca/i }));
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('Audio', FakeAudio);
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: true, blob: async () => new Blob(['mp3'], { type: 'audio/mpeg' }) })),
  );
  mocks.invoke.mockImplementation((name: string) =>
    name === 'elevenlabs-sfx'
      ? Promise.resolve({ data: { audioContent: 'QUJD' }, error: null })
      : Promise.resolve({ data: { category: 'efeitos' }, error: null }),
  );
  mocks.storageFrom.mockImplementation((bucket: string) => ({
    upload: (path: string, file: unknown, opts: unknown) => mocks.upload(bucket, path, file, opts),
    getPublicUrl: (path: string) => mocks.getPublicUrl(bucket, path),
    remove: (paths: string[]) => mocks.remove(bucket, paths),
  }));
  mocks.upload.mockResolvedValue({ data: { path: 'x' }, error: null });
  mocks.getPublicUrl.mockImplementation((bucket: string, path: string) => ({
    data: { publicUrl: `https://proj.supabase.co/storage/v1/object/public/${bucket}/${path}` },
  }));
  mocks.remove.mockResolvedValue({ data: null, error: null });
  mocks.insert.mockResolvedValue({ error: null });
  mocks.tableFrom.mockReturnValue({ insert: mocks.insert });
  mocks.getUser.mockResolvedValue({ data: { user: { id: UID } } });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('AIGenerateDialog — áudio gerado salvo na pasta do usuário (PK-17)', () => {
  it('sobe o MP3 em `<auth.uid()>/` no bucket audio-memes e grava o registro com essa URL', async () => {
    await gerarPreviaESalvar();

    expect(mocks.upload).toHaveBeenCalledTimes(1);
    const [bucket, path] = mocks.upload.mock.calls[0] as [string, string];
    expect(bucket).toBe('audio-memes');
    expect(path).toMatch(new RegExp(`^${UID}/ai_gen_\\d+_[0-9a-f-]+\\.mp3$`));

    const [payload] = mocks.insert.mock.calls[0] as [Record<string, unknown>];
    expect(payload.audio_url).toContain(`/audio-memes/${path}`);
  });

  it('sem sessão não sobe objeto solto: erro visível e nenhum registro', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });

    await gerarPreviaESalvar();

    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.toastError).toHaveBeenCalledWith('Sessão expirada: entre novamente para salvar o áudio');
  });
});
