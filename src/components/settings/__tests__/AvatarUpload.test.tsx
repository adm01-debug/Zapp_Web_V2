import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AvatarUpload } from '../AvatarUpload';

// ═══════════════════════════════════════════════════════════
// N-149 (plano de ligação 2610092251f295) — Configurações: trocar a
// foto de perfil mais de uma vez.
//
// O defeito original: cada envio deixava um objeto órfão no bucket `avatars`.
// Contrato atual (C-1): o caminho é estável por usuário (`${user.id}/avatar.${ext}`)
// com `upsert: true`, então o segundo envio no MESMO formato sobrescreve o próprio
// arquivo (nada a remover) e a troca de formato apaga o antigo
// (ver AvatarUpload.invalidacao.test.tsx).
//
// A prova: um "bucket" simulado (Set) recebe o upload; o teste RENDERIZA o
// AvatarUpload real, dispara DOIS envios e afirma que sobra um único objeto —
// o do último envio — sem nenhuma remoção.
// ═══════════════════════════════════════════════════════════

const mocks = vi.hoisted(() => ({
  upload: vi.fn(),
  getPublicUrl: vi.fn(),
  remove: vi.fn(),
  refreshProfile: vi.fn(),
  bucket: new Set<string>(),
}));

vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'user-1' },
    profile: { name: 'QA User', email: 'qa@test.com', avatar_url: null },
    refreshProfile: mocks.refreshProfile,
  }),
}));

vi.mock('@/hooks/ui/useActionFeedback', () => ({
  useActionFeedback: () => ({
    warning: vi.fn(),
    withFeedback: async (fn: () => Promise<unknown>) => {
      try {
        return await fn();
      } catch {
        // withFeedback do hook mostra o toast de erro; no teste não relança.
        return undefined;
      }
    },
  }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    storage: {
      from: () => ({
        list: () => Promise.resolve({ data: [...mocks.bucket].map((p) => ({ name: p.split('/').pop() })), error: null }),
        upload: (...a: unknown[]) => mocks.upload(...a),
        getPublicUrl: (...a: unknown[]) => mocks.getPublicUrl(...a),
        remove: (...a: unknown[]) => mocks.remove(...a),
      }),
    },
    from: () => ({
      update: () => ({ eq: () => Promise.resolve({ error: null }) }),
    }),
  },
}));

vi.mock('@/lib/logger', () => ({
  getLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
  createLogger: vi.fn(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), withCorrelation: vi.fn(() => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() })) })),
}));

function renderizar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AvatarUpload />
    </QueryClientProvider>,
  );
}

const makeFile = () => new File(['fake-image'], 'avatar.png', { type: 'image/png' });

describe('AvatarUpload', () => {
  let agora = 1_700_000_000_000;

  beforeEach(() => {
    mocks.bucket.clear();
    agora = 1_700_000_000_000;
    // Date.now crescente: garante caminho distinto mesmo em execução rápida.
    vi.spyOn(Date, 'now').mockImplementation(() => (agora += 1));
    mocks.upload.mockImplementation(async (path: string) => {
      mocks.bucket.add(path);
      return { error: null };
    });
    mocks.getPublicUrl.mockImplementation((path: string) => ({
      data: {
        publicUrl: `https://projeto.supabase.co/storage/v1/object/public/avatars/${path}`,
      },
    }));
    mocks.remove.mockImplementation(async (paths: string[]) => {
      paths.forEach((p) => mocks.bucket.delete(p));
      return { data: [], error: null };
    });
    mocks.refreshProfile.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('dois uploads seguidos deixam um único objeto no bucket (o segundo sobrescreve o primeiro)', async () => {
    renderizar();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;

    // Primeiro envio
    await act(async () => {
      fireEvent.change(input, { target: { files: [makeFile()] } });
    });

    expect(mocks.upload).toHaveBeenCalledTimes(1);
    const primeiroCaminho = mocks.upload.mock.calls[0][0] as string;
    // Caminho estável por usuário e COM upsert (o 3º argumento carrega a opção).
    expect(primeiroCaminho).toBe('user-1/avatar.png');
    expect(mocks.upload.mock.calls[0][2]).toEqual({ upsert: true });
    expect(mocks.refreshProfile).toHaveBeenCalledTimes(1);
    expect(mocks.bucket.size).toBe(1);

    // Segundo envio, mesmo formato
    await act(async () => {
      fireEvent.change(input, { target: { files: [makeFile()] } });
    });

    expect(mocks.upload).toHaveBeenCalledTimes(2);
    const segundoCaminho = mocks.upload.mock.calls[1][0] as string;
    expect(segundoCaminho).toBe(primeiroCaminho);
    expect(mocks.upload.mock.calls[1][2]).toEqual({ upsert: true });

    // Mesmo formato: nada é removido e sobra só o objeto atual.
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(mocks.bucket.size).toBe(1);
    expect([...mocks.bucket]).toEqual([segundoCaminho]);
  });

  it('falha de upload não quebra a interface', async () => {
    mocks.upload.mockResolvedValue({ error: new Error('Upload failed') });

    renderizar();
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;

    await act(async () => {
      fireEvent.change(input, { target: { files: [makeFile()] } });
    });

    // Sem exceção não tratada: o withFeedback engole o erro.
    expect(mocks.upload).toHaveBeenCalledTimes(1);
  });
});
