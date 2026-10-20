import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * Paridade V3 → V2, Parte 7 — falha num bloco do Admin não derruba a tela.
 *
 * A V3 protege as abas com uso próprio/arriscado com `SectionErrorBoundary`.
 * Na V2 existem CRM 360°, Playbooks, Copilot IA, Treinamento e Sala de Crise
 * (a aba "Histórico QR" não existe aqui). Aqui o CRM lança na renderização e o
 * Playbooks — bloco independente do mesmo painel — tem de continuar funcionando.
 */

vi.mock('@/hooks/system/useUserRole', () => ({
  useUserRole: () => ({ isAdmin: true, isSupervisor: true, loading: false }),
}));

vi.mock('../useAdminData', () => ({
  useAdminData: () => ({
    users: [], auditLogs: [], loading: false,
    fetchData: vi.fn(), handleRoleChange: vi.fn(), handleToggleActive: vi.fn(),
    handleSaveUser: vi.fn(), handleCreateUser: vi.fn(),
  }),
  accessLevelConfig: {},
}));

vi.mock('../AdminUsersTable', () => ({ AdminUsersTable: () => <div data-testid="users-table" /> }));
vi.mock('../AdminAuditTable', () => ({ AdminAuditTable: () => <div data-testid="audit-table" /> }));

// O bloco do CRM lança; o do Playbooks é a prova de que o resto segue de pé.
vi.mock('../AdminCRMDashboard', () => ({
  AdminCRMDashboard: () => { throw new Error('falha do CRM'); },
}));
vi.mock('../PlaybooksManager', () => ({ PlaybooksManager: () => <div data-testid="playbooks-ok" /> }));
vi.mock('../SupervisorCopilot', () => ({ SupervisorCopilot: () => <div /> }));
vi.mock('../TrainingMode', () => ({ TrainingMode: () => <div /> }));
vi.mock('../CrisisRoom', () => ({ CrisisRoom: () => <div /> }));

import { AdminView } from '@/components/admin/AdminView';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('AdminView — SectionErrorBoundary isola o bloco que falha (Parte 7)', () => {
  it('CRM 360° lançando mostra o aviso no lugar da aba e mantém o painel', () => {
    render(<AdminView />);

    fireEvent.click(screen.getByRole('button', { name: /CRM 360/ }));

    expect(screen.getByText(/Erro em "CRM Admin"/)).toBeInTheDocument();
    // A tela não foi derrubada: o cabeçalho e as demais abas continuam de pé.
    expect(screen.getByRole('heading', { name: /Administração/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Playbooks/ })).toBeInTheDocument();
  });

  it('com o CRM quebrado, o Playbooks (bloco independente) ainda renderiza', () => {
    render(<AdminView />);

    fireEvent.click(screen.getByRole('button', { name: /CRM 360/ }));
    expect(screen.getByText(/Erro em "CRM Admin"/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Playbooks/ }));
    expect(screen.getByTestId('playbooks-ok')).toBeInTheDocument();
  });
});
