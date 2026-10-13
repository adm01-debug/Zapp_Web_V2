import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { axe } from 'vitest-axe';

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
    auditTotal: 0,
    error: null,
    fetchData: vi.fn(),
    handleRoleChange: vi.fn(),
    handleToggleActive: vi.fn(),
    handleSaveUser: vi.fn(),
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

function abrirDialogoEdicao() {
  const result = render(<AdminView />);
  fireEvent.click(screen.getByRole('button', { name: /Atualizar/i }));
  fireEvent.click(screen.getByRole('button', { name: /Editar Ana Silva/i }));
  return result;
}

function abrirDialogoAdicao() {
  const result = render(<AdminView />);
  fireEvent.click(screen.getByRole('button', { name: /Adicionar Usuário/i }));
  return result;
}

describe('AdminView — acessibilidade dos seletores (N-063)', () => {
  it('getByLabelText("Nível de Acesso") encontra o combobox do diálogo de edição', () => {
    abrirDialogoEdicao();
    expect(screen.getByLabelText('Nível de Acesso')).toBeInTheDocument();
  });

  it('getByLabelText("Role") encontra o combobox do diálogo de adição', () => {
    abrirDialogoAdicao();
    expect(screen.getByLabelText('Role')).toBeInTheDocument();
  });

  it('axe não acusa controle sem nome no diálogo de edição', async () => {
    const { container } = abrirDialogoEdicao();
    const results = await axe(container, {
      rules: { 'color-contrast': { enabled: false } },
    });
    const semNome = results.violations.filter((v) =>
      ['button-name', 'aria-input-field-name', 'aria-toggle-field-name', 'aria-command-name'].includes(v.id),
    );
    expect(semNome).toEqual([]);
  });

  it('axe não acusa controle sem nome no diálogo de adição', async () => {
    const { container } = abrirDialogoAdicao();
    const results = await axe(container, {
      rules: { 'color-contrast': { enabled: false } },
    });
    const semNome = results.violations.filter((v) =>
      ['button-name', 'aria-input-field-name', 'aria-toggle-field-name', 'aria-command-name'].includes(v.id),
    );
    expect(semNome).toEqual([]);
  });

  it('interruptores dos serviços Google têm nome acessível', () => {
    abrirDialogoAdicao();
    fireEvent.change(screen.getByPlaceholderText('usuario@gmail.com'), {
      target: { value: 'atendente@promobrindes.com.br' },
    });

    for (const servico of ['Google Sheets', 'Google Docs', 'Google Drive']) {
      expect(screen.getByRole('switch', { name: new RegExp(servico, 'i') })).toBeEnabled();
    }
  });
});