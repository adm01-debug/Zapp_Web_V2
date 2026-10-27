import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

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
    handleSaveUser: vi.fn(async () => true),
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

const arquivo = () => new File(['foto'], 'foto.png', { type: 'image/png' });

function abrirEdicaoEEnviarFoto() {
  const resultado = render(<AdminView />);
  fireEvent.click(screen.getByRole('button', { name: /Editar Ana Silva/i }));
  const entrada = document.querySelector('#edit_avatar') as HTMLInputElement;
  const criar = vi.fn(() => 'blob:preview-1');
  const revogar = vi.fn();
  URL.createObjectURL = criar as unknown as typeof URL.createObjectURL;
  URL.revokeObjectURL = revogar;
  fireEvent.change(entrada, { target: { files: [arquivo()] } });
  return { ...resultado, criar, revogar };
}

describe('AdminView — URL do avatar é revogada (N-065)', () => {
  it('desmontar a tela com foto escolhida revoga a URL criada', () => {
    const { criar, revogar, unmount } = abrirEdicaoEEnviarFoto();
    expect(criar).toHaveBeenCalledTimes(1);
    unmount();
    expect(revogar).toHaveBeenCalledWith('blob:preview-1');
  });

  it('fechar o diálogo de edição revoga a URL criada', () => {
    const { revogar } = abrirEdicaoEEnviarFoto();
    fireEvent.click(screen.getByRole('button', { name: /Cancelar/i }));
    expect(revogar).toHaveBeenCalledWith('blob:preview-1');
  });

  it('sem foto escolhida nenhuma URL de objeto é criada', () => {
    const criar = vi.fn(() => 'blob:preview-1');
    URL.createObjectURL = criar as unknown as typeof URL.createObjectURL;
    render(<AdminView />);
    fireEvent.click(screen.getByRole('button', { name: /Editar Ana Silva/i }));
    expect(criar).not.toHaveBeenCalled();
  });
});
