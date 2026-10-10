import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';

vi.mock('@/hooks/system/useUserRole', () => ({
  useUserRole: vi.fn(() => ({ isAdmin: true, isSupervisor: true, loading: false })),
}));

vi.mock('@/components/admin/useAdminData', () => ({
  useAdminData: vi.fn(() => ({
    users: [],
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
import { axe, toHaveNoViolations } from 'vitest-axe';

expect.extend(toHaveNoViolations);

function renderAdmin() {
  return render(<AdminView />);
}

describe('AdminView — acessibilidade dos seletores (N-063)', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('getByLabelText encontra o seletor Nível de Acesso no diálogo de edição', () => {
    renderAdmin();
    expect(screen.getByLabelText('Nível de Acesso')).toBeInTheDocument();
  });

  it('getByLabelText encontra o seletor Role no diálogo de adicionar', () => {
    renderAdmin();
    expect(screen.getByLabelText('Role')).toBeInTheDocument();
  });

  it('interruptores dos serviços Google têm nomes acessíveis via aria-label', () => {
    renderAdmin();
    expect(screen.getByLabelText('Google Sheets')).toBeInTheDocument();
    expect(screen.getByLabelText('Google Docs')).toBeInTheDocument();
    expect(screen.getByLabelText('Google Calendar')).toBeInTheDocument();
    expect(screen.getByLabelText('Google Drive')).toBeInTheDocument();
  });

  it('axe não encontra violações no diálogo de edição', async () => {
    renderAdmin();
    const container = document.body;
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
