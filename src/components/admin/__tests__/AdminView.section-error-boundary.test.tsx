import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Paridade V3 → V2, Parte 7 — falha num bloco do Admin não derruba a tela, e a
 * divisão da Parte 8 — as ferramentas do supervisor saíram do AdminView.
 *
 * O painel `admin` (ADMIN_ONLY) ficou com Usuários, Auditoria e CRM 360°: Fila,
 * Copiloto, Sala de Crise, Playbooks e Treinamento migraram para a visão
 * `supervisao` (STAFF) — lá elas ganham teste próprio em SupervisaoView.test.tsx.
 * Aqui fica a prova de isolamento: o CRM lança na renderização e o bloco da
 * Auditoria — independente, no mesmo painel — continua funcionando.
 */

vi.mock('@/hooks/system/useUserRole', () => ({
  useUserRole: () => ({ isAdmin: true, isSupervisor: true, loading: false }),
}));

vi.mock('../useAdminData', () => ({
  useAdminData: () => ({
    users: [], auditLogs: [], loading: false,
    auditTotal: 0, error: null,
    fetchData: vi.fn(), handleRoleChange: vi.fn(), handleToggleActive: vi.fn(),
    handleSaveUser: vi.fn(), handleCreateUser: vi.fn(),
  }),
  accessLevelConfig: {},
  MIN_PASSWORD_LENGTH: 8,
  AUDIT_PAGE_SIZE: 50,
}));

vi.mock('../AdminUsersTable', () => ({ AdminUsersTable: () => <div data-testid="users-table" /> }));
vi.mock('../AdminAuditTable', () => ({ AdminAuditTable: () => <div data-testid="audit-table" /> }));

// O bloco do CRM lança; o da Auditoria é a prova de que o resto segue de pé.
vi.mock('../AdminCRMDashboard', () => ({
  AdminCRMDashboard: () => { throw new Error('falha do CRM'); },
}));

import { AdminView } from '@/components/admin/AdminView';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('AdminView — SectionErrorBoundary isola o bloco que falha (Parte 7)', () => {
  it('CRM 360° lançando mostra o aviso no lugar da aba e mantém o painel', () => {
    render(<AdminView />);

    fireEvent.click(screen.getByRole('tab', { name: /CRM 360/ }));

    expect(screen.getByText(/Erro em "CRM Admin"/)).toBeInTheDocument();
    // A tela não foi derrubada: o cabeçalho e as demais abas continuam de pé.
    expect(screen.getByRole('heading', { name: /Administração/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Auditoria/ })).toBeInTheDocument();
  });

  it('com o CRM quebrado, a Auditoria (bloco independente) ainda renderiza', () => {
    render(<AdminView />);

    fireEvent.click(screen.getByRole('tab', { name: /CRM 360/ }));
    expect(screen.getByText(/Erro em "CRM Admin"/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: /Auditoria/ }));
    expect(screen.getByTestId('audit-table')).toBeInTheDocument();
  });

  it('não expõe mais as ferramentas do supervisor (migraram para a visão supervisao)', () => {
    render(<AdminView />);

    for (const nome of [/Playbooks/, /Copiloto/, /Treinamento/, /Sala de Crise/]) {
      expect(screen.queryByRole('button', { name: nome })).toBeNull();
    }
    // O que o admin mantém continua lá.
    expect(screen.getByRole('tab', { name: /Usuários/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Auditoria/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /CRM 360/ })).toBeInTheDocument();
  });
});
