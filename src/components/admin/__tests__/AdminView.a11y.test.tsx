import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { axe } from 'vitest-axe';

const { fetchDataSpy } = vi.hoisted(() => ({ fetchDataSpy: vi.fn() }));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({ eq: () => ({ order: async () => ({ data: [], error: null }) }) }),
    }),
    functions: { invoke: vi.fn(async () => ({ data: null, error: null })) },
    auth: { getUser: async () => ({ data: { user: null }, error: null }) },
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
    fetchData: fetchDataSpy,
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
  it('getByLabelText("Nível de acesso (informativo)") encontra o combobox do diálogo de edição', () => {
    abrirDialogoEdicao();
    expect(screen.getByLabelText('Nível de acesso (informativo)')).toBeInTheDocument();
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

describe('AdminView — abas acessíveis e busca no lugar certo (N-064)', () => {
  beforeEach(() => {
    fetchDataSpy.mockClear();
  });

  it('expõe tablist nomeado, 8 abas (a de Tarefas agendadas entra só para admin) e painel rotulado pela aba ativa', () => {
    render(<AdminView />);
    expect(screen.getByRole('tablist', { name: 'Seções da administração' })).toBeInTheDocument();
    expect(screen.getAllByRole('tab')).toHaveLength(8);
    expect(screen.getByRole('tab', { name: /Usuários/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', 'tab-users');
  });

  it('só a aba ativa fica alcançável pelo Tab (tabIndex móvel)', () => {
    render(<AdminView />);
    for (const aba of screen.getAllByRole('tab')) {
      const selecionada = aba.getAttribute('aria-selected') === 'true';
      expect(aba).toHaveAttribute('tabindex', selecionada ? '0' : '-1');
    }
  });

  it('seta para a direita foca e seleciona a aba seguinte', () => {
    render(<AdminView />);
    const usuarios = screen.getByRole('tab', { name: /Usuários/ });
    usuarios.focus();
    fireEvent.keyDown(usuarios, { key: 'ArrowRight' });
    const auditoria = screen.getByRole('tab', { name: /Auditoria/ });
    expect(auditoria).toHaveAttribute('aria-selected', 'true');
    expect(document.activeElement).toBe(auditoria);
    expect(usuarios).toHaveAttribute('aria-selected', 'false');
  });

  it('seta para a esquerda na auditoria volta para Usuários (Home vai para a primeira)', () => {
    render(<AdminView />);
    const auditoria = screen.getByRole('tab', { name: /Auditoria/ });
    fireEvent.click(auditoria);
    fireEvent.keyDown(auditoria, { key: 'ArrowLeft' });
    const usuarios = screen.getByRole('tab', { name: /Usuários/ });
    expect(usuarios).toHaveAttribute('aria-selected', 'true');
    expect(document.activeElement).toBe(usuarios);
    fireEvent.keyDown(usuarios, { key: 'Home' });
    expect(document.activeElement).toBe(usuarios);
  });

  it('a busca aparece em Usuários e Auditoria e some nas abas que não usam lista', () => {
    render(<AdminView />);
    expect(screen.getByPlaceholderText('Buscar usuários...')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: /Auditoria/ }));
    expect(screen.getByPlaceholderText('Buscar logs...')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: /Treinamento/ }));
    expect(screen.queryByPlaceholderText(/Buscar/)).toBeNull();
  });

  it('não busca dados de usuário nas abas que não os usam, e busca ao voltar para Usuários', () => {
    render(<AdminView />);
    expect(fetchDataSpy).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('tab', { name: /Treinamento/ }));
    expect(fetchDataSpy).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('tab', { name: /Usuários/ }));
    expect(fetchDataSpy).toHaveBeenCalledTimes(2);
  });
});