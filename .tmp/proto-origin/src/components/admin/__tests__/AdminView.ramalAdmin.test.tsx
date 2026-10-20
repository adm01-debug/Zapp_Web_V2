import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

/**
 * PE-104/105 — o ramal no cadastro de usuário é SÓ para admin.
 *
 * Prende as duas pontas do critério no nível da tela:
 *  - supervisor (não-admin) abre o mesmo diálogo de edição e NÃO vê o bloco de ramal;
 *  - admin vê o bloco e o botão "Salvar ramal" chama `handleSaveRamal` com o id do
 *    perfil que está sendo editado (o mesmo id que a RPC espera em p_profile_id).
 */
const role = vi.hoisted(() => ({ isAdmin: true, isSupervisor: true }));
const handleSaveRamal = vi.hoisted(() => vi.fn().mockResolvedValue(true));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { from: vi.fn(), functions: { invoke: vi.fn() }, rpc: vi.fn() },
  SUPABASE_URL: 'http://localhost:54321',
}));

vi.mock('@/hooks/system/useUserRole', () => ({
  useUserRole: () => ({ ...role, loading: false }),
}));

vi.mock('../useAdminData', () => ({
  useAdminData: () => ({
    users: [
      {
        id: 'prof-1',
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
    handleSaveUser: vi.fn(),
    handleSaveRamal,
    handleCreateUser: vi.fn(),
  }),
  accessLevelConfig: {
    basic: { label: 'Básico', description: '' },
    standard: { label: 'Padrão', description: '' },
    advanced: { label: 'Avançado', description: '' },
    full: { label: 'Completo', description: '' },
  },
}));

import { AdminView } from '../AdminView';

function abrirEdicaoDoPrimeiroUsuario() {
  render(<AdminView />);
  fireEvent.click(screen.getByRole('button', { name: /Editar Ana Silva/i }));
}

describe('AdminView — ramal do atendente no cadastro (PE-104/105)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    handleSaveRamal.mockResolvedValue(true);
    role.isAdmin = true;
    role.isSupervisor = true;
  });

  it('supervisor (não-admin) nem alcança o cadastro onde o ramal é definido', () => {
    role.isAdmin = false;
    render(<AdminView />);

    // A linha só oferece "Editar" para admin — logo o diálogo (e o bloco de ramal)
    // fica inalcançável para supervisor.
    expect(screen.queryByRole('button', { name: /Editar Ana Silva/i })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/senha sip/i)).not.toBeInTheDocument();
  });

  it('admin vê o bloco e salvar chama handleSaveRamal com o id do perfil editado', async () => {
    abrirEdicaoDoPrimeiroUsuario();

    expect(screen.getByRole('button', { name: /Salvar ramal/i })).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/ramal/i), { target: { value: '2001' } });
    fireEvent.change(screen.getByLabelText(/senha sip/i), { target: { value: 'segredo-sip' } });
    fireEvent.click(screen.getByRole('button', { name: /Salvar ramal/i }));

    await waitFor(() =>
      expect(handleSaveRamal).toHaveBeenCalledWith('prof-1', '2001', 'segredo-sip'),
    );
  });
});
