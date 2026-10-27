import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

// Papel controlado por teste: a MESMA renderização de AdminView muda entre admin e
// supervisor/atendente. `useUserRole` é o único ponto trocado; AdminView é o real.
const { papel, mockRpc } = vi.hoisted(() => ({
  papel: { isAdmin: true, isSupervisor: true, loading: false },
  mockRpc: vi.fn(),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    rpc: mockRpc,
    from: () => ({
      select: () => ({ eq: () => ({ order: async () => ({ data: [], error: null }) }) }),
    }),
    functions: { invoke: vi.fn(async () => ({ data: null, error: null })) },
    auth: { getUser: async () => ({ data: { user: null }, error: null }) },
  },
}));
vi.mock('sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));
vi.mock('@/hooks/system/useUserRole', () => ({
  useUserRole: () => papel,
}));
vi.mock('../useAdminData', () => ({
  useAdminData: () => ({
    users: [],
    auditLogs: [],
    loading: false,
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
import { TestQueryWrapper } from '@/test/mocks/queryClient';

const JOB = {
  jobname: 'gmail-incremental-sync',
  schedule: '*/15 * * * *',
  active: true,
  last_status: 'succeeded',
  last_run_at: '2026-10-15T12:00:00.000Z',
  last_return_message: 'sincronizacao concluida',
};

describe('AdminView — aba "Tarefas agendadas" é só de admin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    papel.isAdmin = true;
    papel.isSupervisor = true;
    papel.loading = false;
    mockRpc.mockResolvedValue({ data: [JOB], error: null });
  });

  it('admin vê a aba e, ao abrir, a tela lê a agenda pela RPC', async () => {
    render(<AdminView />, { wrapper: TestQueryWrapper });

    const aba = screen.getByRole('tab', { name: /Tarefas agendadas/ });
    fireEvent.click(aba);

    expect(screen.getByRole('tabpanel')).toHaveAttribute('aria-labelledby', 'tab-cron');
    expect(await screen.findByText('gmail-incremental-sync')).toBeInTheDocument();
    expect(mockRpc).toHaveBeenCalledWith('admin_list_cron_jobs');
  });

  it('supervisor (não admin) não vê a aba', () => {
    papel.isAdmin = false;
    render(<AdminView />, { wrapper: TestQueryWrapper });

    expect(screen.getByRole('tab', { name: /Usuários/ })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /Tarefas agendadas/ })).toBeNull();
  });

  it('atendente não vê a aba nem a área de administração', () => {
    papel.isAdmin = false;
    papel.isSupervisor = false;
    render(<AdminView />, { wrapper: TestQueryWrapper });

    expect(screen.queryByRole('tab', { name: /Tarefas agendadas/ })).toBeNull();
    expect(screen.getByText('Acesso Restrito')).toBeInTheDocument();
  });
});
