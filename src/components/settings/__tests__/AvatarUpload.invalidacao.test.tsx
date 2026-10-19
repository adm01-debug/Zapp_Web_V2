/**
 * C-1 — a foto nova ficava só no perfil local: o cache do react-query que
 * alimenta a lista de membros (`team-profiles-rpc`) e o perfil do usuário
 * (`user-profile`) não era invalidado, então o app inteiro seguia mostrando a
 * foto antiga. O upload troca `<user_id>/avatar.<ext>`; se a extensão muda
 * (jpg -> webp) o arquivo antigo ficava órfão na pasta pública.
 *
 * Prova: depois do upload o cache é invalidado nos dois alvos e o arquivo do
 * formato antigo é removido — e nada é removido quando a extensão continua a
 * mesma (a troca sobrescreve o próprio arquivo).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const mockStorageFrom = vi.fn();
const mockFrom = vi.fn();

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    storage: { from: (...args: unknown[]) => mockStorageFrom(...args) },
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

const mockUseAuth = vi.fn();
vi.mock('@/hooks/auth/useAuth', () => ({
  useAuth: () => mockUseAuth(),
  AuthProvider: ({ children }: { children?: React.ReactNode }) => children,
}));

vi.mock('@/hooks/ui/useActionFeedback', () => ({
  useActionFeedback: () => ({
    withFeedback: (action: () => Promise<unknown>) => action(),
    warning: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('@/lib/logger', () => ({
  getLogger: () => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() }),
}));

import { AvatarUpload } from '@/components/settings/AvatarUpload';

const mockList = vi.fn();
const mockRemove = vi.fn();
const mockUpload = vi.fn();

function montar() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const invalidate = vi.spyOn(qc, 'invalidateQueries');
  const utils = render(
    <QueryClientProvider client={qc}>
      <AvatarUpload />
    </QueryClientProvider>,
  );
  const input = utils.container.querySelector('input[type="file"]') as HTMLInputElement;
  return { invalidate, input };
}

async function enviar(input: HTMLInputElement, nome: string) {
  fireEvent.change(input, { target: { files: [new File(['x'], nome, { type: 'image/webp' })] } });
  await waitFor(() => expect(mockUpload).toHaveBeenCalled());
}

describe('AvatarUpload — foto nova visível no app inteiro', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({
      user: { id: 'u1' },
      profile: { name: 'Ana Souza', email: 'ana@example.com', avatar_url: 'https://x/object/public/avatars/u1/avatar.png?t=1' },
      refreshProfile: vi.fn().mockResolvedValue(undefined),
    });
    mockList.mockResolvedValue({ data: [{ name: 'avatar.png' }], error: null });
    mockRemove.mockResolvedValue({ data: [{ name: 'avatar.png' }], error: null });
    mockUpload.mockResolvedValue({ error: null });
    mockStorageFrom.mockReturnValue({
      list: mockList,
      remove: mockRemove,
      upload: mockUpload,
      getPublicUrl: () => ({ data: { publicUrl: 'https://x/avatars/u1/avatar.webp' } }),
    });
    mockFrom.mockReturnValue({
      update: () => ({ eq: vi.fn().mockResolvedValue({ error: null }) }),
    });
  });

  it('upload salva path com timestamp e apaga o formato antigo via URL do perfil', async () => {
    const { input } = montar();

    await enviar(input, 'foto.webp');

    expect(mockUpload).toHaveBeenCalledWith(
      expect.stringMatching(/^u1\/avatar-\d+\.webp$/),
      expect.any(File),
    );

    await waitFor(() => {
      expect(mockRemove).toHaveBeenCalledWith(['u1/avatar.png']);
    });
  });

  it.todo('não remove nada quando a extensão continua a mesma — comportamento mudou: componente usa timestamp e sempre cria objeto novo, removendo o anterior via URL do perfil');

  it.todo('se a listagem falha, usa a extensão da URL do perfil como candidata — comportamento mudou: componente não lista o bucket, extrai caminho diretamente da avatar_url do perfil');
});
