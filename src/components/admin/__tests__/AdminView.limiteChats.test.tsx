import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

const { handleSaveUser } = vi.hoisted(() => ({
  handleSaveUser: vi.fn(async (_usuario?: { max_chats?: number }, _arquivo?: unknown) => true),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ order: async () => ({ data: [], error: null }) }) }),
    }),
    functions: { invoke: vi.fn(async () => ({ data: null, error: null })) },
  },
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('@/hooks/system/useUserRole', () => ({
  useUserRole: () => ({ isAdmin: true, isSupervisor: true, loading: false }),
}));
vi.mock('../useAdminData', () => ({
  useAdminData: () => ({
    users: [
      {
        id: 'p1',
        user_id: 'u1',
        name: 'Ana Silva',
        email: 'ana@test.local',
        avatar_url: null,
        nickname: null,
        signature: null,
        role: 'agent',
        job_title: null,
        department: null,
        phone: null,
        access_level: 'basic',
        max_chats: null,
        can_download: false,
        is_active: true,
        created_at: '2026-10-01T00:00:00.000Z',
      },
    ],
    auditLogs: [],
    loading: false,
    fetchData: vi.fn(),
    handleRoleChange: vi.fn(),
    handleToggleActive: vi.fn(),
    handleSaveUser,
    handleCreateUser: vi.fn(),
  }),
  accessLevelConfig: {
    basic: { label: 'Básico', description: '' },
    standard: { label: 'Padrão', description: '' },
    advanced: { label: 'Avançado', description: '' },
    full: { label: 'Completo', description: '' },
  },
  MIN_PASSWORD_LENGTH: 8,
  AUDIT_PAGE_SIZE: 50,
}));

import { AdminView } from '../AdminView';

function abrirEdicao() {
  render(<AdminView />);
  fireEvent.click(screen.getByRole('button', { name: /Editar Ana Silva/i }));
  return screen.getByLabelText('Limite de Chats') as HTMLInputElement;
}

async function salvarLimite(input: HTMLInputElement, texto: string) {
  fireEvent.change(input, { target: { value: texto } });
  fireEvent.blur(input);
  const exibido = input.value;
  fireEvent.click(screen.getByRole('button', { name: /^Salvar$/i }));
  await waitFor(() => expect(handleSaveUser).toHaveBeenCalled());
  const chamadas = handleSaveUser.mock.calls;
  const usuario = chamadas[chamadas.length - 1][0] as unknown as { max_chats: number };
  return { exibido, usuario };
}

describe('AdminView — limite de chats entre 1 e 50', () => {
  beforeEach(() => {
    handleSaveUser.mockClear();
  });

  it('campo vazio não grava NaN: normaliza para 5 antes de salvar', async () => {
    const input = abrirEdicao();
    const { exibido, usuario } = await salvarLimite(input, '');
    expect(Number.isNaN(usuario.max_chats)).toBe(false);
    expect(usuario.max_chats).toBe(5);
    expect(exibido).toBe('5');
  });

  it('valor acima do teto é limitado a 50 na tela e no envio', async () => {
    const input = abrirEdicao();
    const { exibido, usuario } = await salvarLimite(input, '999');
    expect(exibido).toBe('50');
    expect(usuario.max_chats).toBe(50);
  });

  it('valor abaixo do piso é elevado a 1 na tela e no envio', async () => {
    const input = abrirEdicao();
    const { exibido, usuario } = await salvarLimite(input, '0');
    expect(exibido).toBe('1');
    expect(usuario.max_chats).toBe(1);
  });
});
