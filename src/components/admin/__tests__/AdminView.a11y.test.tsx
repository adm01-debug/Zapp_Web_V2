import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';

vi.mock('@/hooks/system/useUserRole', () => ({
  useUserRole: vi.fn(() => ({ isAdmin: true, isSupervisor: true, loading: false })),
}));

vi.mock('@/components/admin/useAdminData', () => ({
  useAdminData: vi.fn(() => ({
    users: [{ id: 'u1', name: 'Ana Teste', email: 'ana@test.com', role: 'agent', access_level: 'basic', can_download: false, phone: '', max_chats: 5, department: '', job_title: '', nickname: '', signature: '', gmail: '', dropboxEmail: '', avatar_url: null }],
    auditLogs: [],
    loading: false,
    fetchData: vi.fn(),
    handleRoleChange: vi.fn(),
    handleToggleActive: vi.fn(),
    handleSaveUser: vi.fn().mockResolvedValue(true),
    handleCreateUser: vi.fn().mockResolvedValue(true),
  })),
  accessLevelConfig: { basic: { label: 'Básico', description: 'Acesso básico' }, admin: { label: 'Administrador', description: 'Acesso total' } },
}));

vi.mock('@/components/admin/AdminUsersTable', () => ({ AdminUsersTable: () => <div data-testid="users-table">Tabela de usuários</div> }));
vi.mock('@/components/admin/AdminAuditTable', () => ({ AdminAuditTable: () => <div>Tabela de auditoria</div> }));
vi.mock('@/components/admin/AdminCRMDashboard', () => ({ AdminCRMDashboard: () => <div>CRM</div> }));
vi.mock('@/components/admin/PlaybooksManager', () => ({ PlaybooksManager: () => <div>Playbooks</div> }));
vi.mock('@/components/admin/SupervisorCopilot', () => ({ SupervisorCopilot: () => <div>Copilot</div> }));
vi.mock('@/components/admin/TrainingMode', () => ({ TrainingMode: () => <div>Treinamento</div> }));
vi.mock('@/components/admin/CrisisRoom', () => ({ CrisisRoom: () => <div>Sala de Crise</div> }));
vi.mock('@/components/dashboard/FloatingParticles', () => ({ FloatingParticles: () => null }));
vi.mock('@/components/effects/AuroraBorealis', () => ({ AuroraBorealis: () => null }));
vi.mock('@/components/ui/motion', () => ({ motion: { div: ({ children, ...props }) => <div {...props}>{children}</div> } }));

import { AdminView } from '@/components/admin/AdminView';

function renderAdmin() {
  return render(<AdminView />);
}

describe('AdminView — acessibilidade dos seletores (N-063)', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('seletor Nível de Acesso tem htmlFor/id ligados', () => {
    renderAdmin();
    const label = screen.getByText('Nível de Acesso');
    expect(label).toHaveAttribute('htmlFor', 'edit_access_level');
    expect(screen.getByRole('combobox', { name: 'Nível de Acesso' })).toBeInTheDocument();
  });

  it('seletor Role tem htmlFor/id ligados', () => {
    renderAdmin();
    fireEvent.click(screen.getByRole('button', { name: /Adicionar Usuário/ }));
    const label = screen.getByText('Role');
    expect(label).toHaveAttribute('htmlFor', 'add_role');
    expect(screen.getByRole('combobox', { name: 'Role' })).toBeInTheDocument();
  });

  it('interruptores dos serviços Google têm nomes acessíveis via aria-label', () => {
    renderAdmin();
    fireEvent.click(screen.getByRole('button', { name: /Adicionar Usuário/ }));
    expect(screen.getByLabelText('Google Sheets')).toBeInTheDocument();
    expect(screen.getByLabelText('Google Docs')).toBeInTheDocument();
    expect(screen.getByLabelText('Google Calendar')).toBeInTheDocument();
    expect(screen.getByLabelText('Google Drive')).toBeInTheDocument();
  });
});
